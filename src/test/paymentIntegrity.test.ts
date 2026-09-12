import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * The money path.
 *
 * Production holds 15 payment intents: 2 `paid`, 4 `initiated`, 9 `lead`.
 * Reading them turned up one thing that is fine and one that is not, and it
 * is worth pinning both — the fine one so nobody "fixes" it, the other so it
 * cannot quietly return.
 */

const verify = readFileSync('supabase/functions/verify-payment/index.ts', 'utf8');
const webhook = readFileSync('supabase/functions/paystack-webhook/index.ts', 'utf8');
const stuck = readFileSync('src/components/admin/StuckPayments.tsx', 'utf8');

describe('verification is genuinely server-side', () => {
  /*
   * Both `paid` rows carry `verified_via = 'client'`, which reads alarmingly
   * like "the client asserted it". It does not. The label means "triggered by
   * the customer returning from checkout" rather than by webhook, and the
   * function underneath calls Paystack with the secret key and checks the
   * charge against what NowOpen recorded. Pinned here because the label
   * invites exactly the wrong conclusion.
   */
  it('asks Paystack itself rather than trusting the caller', () => {
    expect(verify).toContain('https://api.paystack.co/transaction/verify/');
    expect(verify).toContain('Bearer ${PAYSTACK_SECRET_KEY}');
  });

  it('checks the amount against what we recorded, not just "success"', () => {
    // The control that matters. Paystack reporting success only proves it
    // charged SOMETHING — a tampered client-side amount would also succeed.
    expect(verify).toContain('const expectedMinorUnits');
    expect(verify).toMatch(/amountMatches/);
    expect(verify).toMatch(/currencyMatches/);
    expect(verify).toMatch(/tx\.status === "success" && amountMatches && currencyMatches/);
  });

  it('refuses to grant a plan on an amount mismatch', () => {
    expect(verify).toMatch(/Amount\/currency mismatch/);
    expect(verify).toMatch(/409/);
  });

  it('is idempotent, so re-checking a paid intent is safe', () => {
    // This is what makes reconciliation possible at all.
    expect(verify).toMatch(/if \(intent\.status === "paid"\)/);
    expect(verify).toMatch(/Payment already confirmed/);
  });
});

describe('the webhook is secured', () => {
  it('verifies the Paystack signature before believing a delivery', () => {
    expect(webhook).toContain('x-paystack-signature');
    expect(webhook).toMatch(/isValidSignature/);
    expect(webhook).toMatch(/Invalid signature/);
  });

  it('returns 200 for events it cannot act on', () => {
    // Paystack retries non-2xx, and neither a missing reference nor an
    // unhandled event type will resolve itself on retry.
    expect(webhook).toMatch(/if \(!reference\) return new Response\("ok", \{ status: 200 \}\)/);
  });

  it('marks its own confirmations as coming from the webhook', () => {
    // The field that revealed the webhook has never delivered: both paid rows
    // say 'client', and this update would have overwritten that.
    expect(webhook).toContain('verified_via: "webhook"');
  });
});

describe('unresolved checkouts can be reconciled', () => {
  /*
   * The gap: a payment can complete at Paystack and never be recorded, because
   * the client calls the verifier only when the customer returns from
   * checkout. Close the tab, lose signal, and nothing happens. The webhook
   * exists for that case and is not firing. Four intents have sat at
   * `initiated` since July with nobody able to say whether those customers
   * paid, because nothing ever asked Paystack again.
   */
  it('lists only intents that actually reached Paystack', () => {
    // A `lead` has no reference — the customer never got that far, so there is
    // nothing to reconcile and showing it would be noise.
    expect(stuck).toMatch(/\.eq\('status', 'initiated'\)/);
    expect(stuck).toMatch(/\.not\('reference', 'is', null\)/);
  });

  it('leaves a checkout alone while it may still be in progress', () => {
    // Someone still on the Paystack page is not stuck, and re-verifying them
    // would report a failure that has not happened yet.
    expect(stuck).toMatch(/GRACE_MINUTES/);
    expect(stuck).toMatch(/\.lt\('created_at', cutoff\)/);
  });

  it('reuses the existing verifier rather than a second money path', () => {
    // A bespoke reconciliation query would be a second place where the amount
    // check could drift out of step with the first.
    expect(stuck).toMatch(/import \{ verifyPayment \}/);
    expect(stuck).toContain('await verifyPayment(intent.reference)');
  });

  it('says the webhook is the real fix, every time it is opened', () => {
    /*
     * The most important assertion here. A tool that quietly compensates for a
     * missing webhook lets the missing webhook become permanent — and then
     * every customer who closes the tab depends on an admin remembering to
     * press a button.
     */
    expect(stuck).toMatch(/This is a safety net, not the fix/);
    expect(stuck).toContain('paystack-webhook');
  });

  it('does not claim a payment it has not confirmed', () => {
    // Success is reported only when the verifier says verified.
    expect(stuck).toMatch(/res\.verified \? 'paid' : 'not-paid'/);
    expect(stuck).toMatch(/if \(res\.verified\)/);
  });

  it('is reachable from the admin payments tab', () => {
    const admin = readFileSync('src/pages/AdminDashboard.tsx', 'utf8');
    expect(admin).toContain('<StuckPayments />');
    // Above the table: a stuck intent looks like any other row down there.
    // Compared against the table's own header cell, not a multi-line JSX
    // snippet, which is brittle against indentation.
    expect(admin.indexOf('<StuckPayments />'))
      .toBeLessThan(admin.indexOf('>Kind</th>'));
  });
});
