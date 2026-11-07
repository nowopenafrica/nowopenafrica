/**
 * The email self-test — what it must never become.
 *
 * It is a staff-reachable endpoint that sends real mail from a domain people
 * will eventually trust. The assertions that matter are about the recipient
 * and about reporting failures truthfully, not about the happy path.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const FN = readFileSync('supabase/functions/selftest-email/index.ts', 'utf8');
const NOTIFY = readFileSync('supabase/functions/_shared/notify.ts', 'utf8');
const PANEL = readFileSync('src/components/admin/OnboardingMessagingPanel.tsx', 'utf8');

describe('it can only ever mail the caller', () => {
  it('takes the recipient from the verified JWT, never the request body', () => {
    /*
     * The whole safety argument. A staff endpoint that posts arbitrary mail
     * from our own domain is a spam vector and an authority-laundering one;
     * sending only to yourself answers the question and cannot be aimed.
     */
    expect(FN).toMatch(/const to = me\.user\.email/);
  });

  it('reads nothing but `probe` out of the body', () => {
    // If a `to`/`email`/`recipient` field ever appears here, the property above
    // is gone.
    const bodyType = FN.match(/await req\.json\(\)[\s\S]{0,160}/)?.[0] ?? '';
    expect(bodyType).toMatch(/probe/);
    expect(bodyType).not.toMatch(/\bto\b\s*\?:|recipient|email\s*\?:/);
  });

  it('is staff-only and not unlocked by the automation secret', () => {
    expect(FN).toMatch(/STAFF\.has/);
    expect(FN).toMatch(/Staff only/);
    expect(FN).not.toMatch(/AUTOMATION_SECRET/);
  });
});

describe('it reports failures in the provider\'s own words', () => {
  it('keeps the provider message instead of only a status code', () => {
    /*
     * Measured 2026-10-08: a real send returned 403 and the sender discarded
     * the body, so the only signal was "resend 403". The discarded sentence
     * was "The nowopenafrica.com domain is not verified", which names the fix.
     */
    expect(NOTIFY).toMatch(/providerMessage/);
    expect(NOTIFY).toMatch(/await res\.text\(\)/);
  });

  it('survives a non-JSON error body', () => {
    // Providers return HTML on gateway errors; parsing must not throw and
    // lose the message entirely.
    expect(NOTIFY).toMatch(/catch\s*\{\s*\/\* not JSON/);
  });

  it('surfaces that message on the admin screen', () => {
    expect(PANEL).toMatch(/emailTest\.providerMessage/);
  });
});

describe('the screen asks rather than asserts', () => {
  it('no longer hardcodes email as unconfigured', () => {
    /*
     * The row read ok={false} unconditionally — true when written, false from
     * the day a key was set, with nothing watching. Third instance of this
     * bug class in the admin.
     */
    expect(PANEL).not.toMatch(/title="Brand-kit email"\s*\n\s*ok=\{false\}/);
    expect(PANEL).toMatch(/ok=\{emailProbe\?\.configured\}/);
  });

  it('treats an unreachable probe as unknown, not as "not configured"', () => {
    // Empty is not the same as missing, and unreachable is neither.
    expect(PANEL).toMatch(/unreachable/);
    expect(PANEL).toMatch(/state of email is unknown/i);
  });

  it('warns before the click that this sends real mail', () => {
    expect(PANEL).toMatch(/Sends one real email/);
  });

  it('does not call an accepted send a delivered one', () => {
    expect(PANEL).toMatch(/Accepted is not the same as delivered/);
  });
});
