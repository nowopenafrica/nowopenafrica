import { describe, expect, it } from 'vitest';
import { checkCharge, isNocReference, toMinor } from '../../supabase/functions/_shared/paystackCharge';

// The rule both verify-payment and paystack-webhook apply before treating a
// Paystack "success" as payment for what NowOpen recorded.

describe('checkCharge', () => {
  const ok = { status: 'success', amount: 500000, currency: 'NGN', domain: 'test' };

  it('accepts a charge that matches amount, currency and a known domain', () => {
    expect(checkCharge(ok, 500000, 'NGN', { tolerance: 0 })).toEqual({ ok: true });
    expect(checkCharge({ ...ok, currency: 'ngn', domain: 'LIVE' }, 500000, 'NGN')).toEqual({ ok: true });
  });

  it('refuses an underpayment, which a tampered checkout page can produce', () => {
    expect(checkCharge({ ...ok, amount: 5000 }, 500000, 'NGN').reason).toBe('amount');
    expect(checkCharge({ ...ok, amount: 499999 }, 500000, 'NGN', { tolerance: 0 }).reason).toBe('amount');
  });

  it('refuses an overpayment too: it is not what was priced', () => {
    expect(checkCharge({ ...ok, amount: 600000 }, 500000, 'NGN').reason).toBe('amount');
  });

  it('keeps the 2-minor-unit tolerance for the older decimal checkouts only when asked', () => {
    expect(checkCharge({ ...ok, amount: 500002 }, 500000, 'NGN').ok).toBe(true);
    expect(checkCharge({ ...ok, amount: 500002 }, 500000, 'NGN', { tolerance: 0 }).ok).toBe(false);
  });

  it('refuses the wrong currency, an unknown domain and anything not successful', () => {
    expect(checkCharge({ ...ok, currency: 'USD' }, 500000, 'NGN').reason).toBe('currency');
    expect(checkCharge({ ...ok, domain: undefined }, 500000, 'NGN').reason).toBe('domain');
    expect(checkCharge({ ...ok, status: 'failed' }, 500000, 'NGN').reason).toBe('not_successful');
    expect(checkCharge(null, 500000, 'NGN').reason).toBe('not_successful');
    expect(checkCharge({ ...ok, amount: Number.NaN }, 500000, 'NGN').reason).toBe('amount');
  });
});

describe('helpers', () => {
  it('converts recorded major amounts to minor units without float drift', () => {
    expect(toMinor(5000)).toBe(500000);
    expect(toMinor('19.99')).toBe(1999);
    expect(toMinor(0.1 + 0.2)).toBe(30);
  });
  it('recognises only references minted by noc_start_purchase', () => {
    expect(isNocReference('noc-' + 'a'.repeat(32))).toBe(true);
    expect(isNocReference('nowopen-credits-123')).toBe(false);
    expect(isNocReference(null)).toBe(false);
  });
});
