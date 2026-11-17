import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Source pins for the NOC money path. The behaviour itself is proven against
// the live database by scripts/check-noc.mjs (17 rolled-back checks) and
// scripts/check-noc-concurrency.mjs (two real sessions); these keep the edge
// functions and migrations from drifting back into the holes found on
// 2026-11-15.

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const webhook = read('supabase/functions/paystack-webhook/index.ts');
const verify = read('supabase/functions/verify-payment/index.ts');
const lockdown = read('supabase/migrations/20261116010000_payment_intent_lockdown.sql');
const purchases = read('supabase/migrations/20261116030000_noc_purchases.sql');
const ledger = read('supabase/migrations/20261116020000_noc_ledger_v2.sql');

describe('paystack-webhook', () => {
  it('checks amount and currency before marking any non-NOC intent paid', () => {
    const check = webhook.indexOf('checkCharge(event.data');
    const markPaid = webhook.indexOf('status: "paid"');
    expect(check).toBeGreaterThan(-1);
    expect(markPaid).toBeGreaterThan(check);
  });
  it('hands NOC orders to the database with the charge, never computing credits', () => {
    expect(webhook).toMatch(/fulfilNocPurchase\(supabase, reference, event\.data, "webhook"\)/);
    expect(webhook).not.toMatch(/credit_fulfil_purchase|fulfilCreditsIfAny|credit_grant/);
  });
});

describe('verify-payment', () => {
  it('asks Paystack for every NOC order, even one already marked paid', () => {
    const noc = verify.indexOf('intent.kind === "credits"');
    const alreadyPaid = verify.indexOf('intent.status === "paid"');
    expect(noc).toBeGreaterThan(-1);
    expect(alreadyPaid).toBeGreaterThan(noc);
    expect(verify.slice(noc, alreadyPaid)).toMatch(/api\.paystack\.co\/transaction\/verify/);
  });
  it('uses the new fulfilment only', () => {
    expect(verify).toMatch(/fulfilNocPurchase\(supabase, reference, body\.data, "client"\)/);
    expect(verify).not.toMatch(/credit_fulfil_purchase|fulfilCreditsIfAny/);
  });
});

describe('migrations', () => {
  it('a browser can only start a checkout: lead/initiated, no verified_via, own account, never credits', () => {
    expect(lockdown).toMatch(/coalesce\(status, 'lead'\) in \('lead', 'initiated'\)/);
    expect(lockdown).toMatch(/verified_via is null/);
    expect(lockdown).toMatch(/user_id is null or user_id = auth\.uid\(\)/);
    expect(lockdown).toMatch(/kind <> 'credits'/);
  });
  it('the credit triggers no longer borrow a service_role claim', () => {
    const triggers = lockdown.slice(lockdown.indexOf('credit_grant_on_signup()'));
    expect(triggers).not.toMatch(/set_config\('request\.jwt\.claims'/);
  });
  it('fulfilment compares against the order snapshot and keeps test money out of the purchased class', () => {
    expect(purchases).toMatch(/p_paid_minor <> v_order\.price_minor/);
    expect(purchases).toMatch(/a test payment cannot fund a live order/);
    expect(purchases).toMatch(/when p_domain = 'live' then 'purchased' else 'sandbox'/);
  });
  it('NOC stays closed-loop in the schema', () => {
    expect(ledger).toMatch(/transferable\s+boolean not null default false check \(not transferable\)/);
    expect(ledger).toMatch(/withdrawable\s+boolean not null default false check \(not withdrawable\)/);
    expect(ledger).toMatch(/crypto_enabled\s+boolean not null default false check \(not crypto_enabled\)/);
  });
  it('the double-entry proof runs at commit', () => {
    expect(ledger).toMatch(/create constraint trigger noc_check_entry_txn[\s\S]*deferrable initially deferred/);
    expect(ledger).toMatch(/create constraint trigger noc_check_entry_line[\s\S]*deferrable initially deferred/);
  });
});
