import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authErrorMessage, authErrorText } from '../lib/authErrors';

/**
 * Auth failures, as a person reads them.
 *
 * ── THE STRING THAT STARTED THIS ─────────────────────────────────────────
 *
 * MEASURED ON PRODUCTION, 2026-09-22. Every phone signup returned:
 *
 *   "Error sending confirmation OTP to provider: Invalid From Number
 *    (caller ID): SK6d9c6ed2fe1c74994b995108f7358731
 *    More information: https://www.twilio.com/docs/errors/21212"
 *
 * and every auth surface did `toast.error(error.message)`, so a visitor was
 * shown the provider's name, an internal SID and a link to Twilio's docs.
 *
 * These tests pin the two things that matters: nothing internal reaches a
 * person, and an unclassified error is not passed through on the assumption
 * that it is probably fine.
 */

const PRODUCTION_STRING =
  'Error sending confirmation OTP to provider: Invalid From Number (caller ID): '
  + 'SK6d9c6ed2fe1c74994b995108f7358731 More information: https://www.twilio.com/docs/errors/21212';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the real production failure', () => {
  it('never shows the provider, the SID or the docs link', () => {
    const text = authErrorText({ code: 'sms_send_failed', message: PRODUCTION_STRING });

    expect(text).not.toMatch(/twilio/i);
    expect(text).not.toMatch(/SK[0-9a-f]{10,}/i);
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/caller ID/i);
    expect(text).not.toMatch(/21212/);
  });

  it('tells them it is not their fault and where to go instead', () => {
    const mapped = authErrorMessage({ code: 'sms_send_failed', message: PRODUCTION_STRING });
    expect(mapped.ours).toBe(true);
    expect(mapped.message).toMatch(/email/i);
  });

  it('recognises it from the message alone, without the code', () => {
    // Older GoTrue responses carry no `code`, and this must not depend on one.
    const mapped = authErrorMessage({ message: PRODUCTION_STRING });
    expect(mapped.ours).toBe(true);
    expect(mapped.message).not.toMatch(/twilio/i);
  });

  it('still records the real error for whoever has to fix it', () => {
    /*
     * The point is that the VISITOR does not see provider internals, not that
     * nobody does. Swallowing it entirely would have made this misconfiguration
     * invisible rather than merely unreadable — which is how it survived long
     * enough for zero phone accounts to exist.
     */
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    authErrorMessage({ code: 'sms_send_failed', message: PRODUCTION_STRING }, 'register');
    expect(spy).toHaveBeenCalled();
    expect(JSON.stringify(spy.mock.calls)).toContain('21212');
  });
});

describe('fail closed on anything unclassified', () => {
  it('does not pass an unknown provider message through', () => {
    const leak = 'connection to sk_live_9f2a3b4c5d6e7f failed at 10.0.0.4:5432';
    const text = authErrorText({ code: 'something_nobody_mapped', message: leak });
    expect(text).not.toContain('sk_live');
    expect(text).not.toContain('10.0.0.4');
  });

  it('treats an unclassified failure as ours, not theirs', () => {
    // Blaming the visitor for something nobody has diagnosed is the wrong
    // default: it sends them round a retry loop that cannot succeed.
    expect(authErrorMessage({ code: 'wat' }).ours).toBe(true);
  });

  it('survives junk without throwing', () => {
    for (const junk of [null, undefined, 'a string', 42, {}, { message: null }]) {
      expect(() => authErrorText(junk)).not.toThrow();
      expect(authErrorText(junk).length).toBeGreaterThan(0);
    }
  });
});

describe('the errors a person can actually act on', () => {
  const cases: Array<[string, RegExp]> = [
    ['otp_expired', /expired/i],
    ['over_sms_send_rate_limit', /wait/i],
    ['invalid_credentials', /do not match/i],
    ['phone_exists', /already an account/i],
    ['weak_password', /8 characters/i],
    ['email_not_confirmed', /confirm your email/i],
  ];

  it.each(cases)('%s reads as something to do next', (code, expected) => {
    const mapped = authErrorMessage({ code });
    expect(mapped.message).toMatch(expected);
    expect(mapped.ours).toBe(false);
  });

  it('never blames the platform for a wrong password', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' }).ours).toBe(false);
  });

  it('reads error_code as well as code', () => {
    // GoTrue sends one or the other depending on the endpoint.
    expect(authErrorMessage({ error_code: 'otp_expired' }).message).toMatch(/expired/i);
  });
});
