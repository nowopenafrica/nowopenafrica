/**
 * The credit client, and the rules it must not get wrong.
 *
 * The real invariants — balances, idempotency, reservations, isolation — are
 * enforced in Postgres and were proven there against a live database with
 * seventeen adversarial assertions (see the dry run in
 * supabase/migrations/20261012020000_nowopen_credits_service.sql's history).
 * They cannot be re-proven in a unit test, and a mock asserting them would
 * only be testing the mock.
 *
 * What IS testable here is the layer that decides what a customer is told:
 * that unpriced never renders as free, that a failed read never reads as
 * "credits are live", and that the reservation helper releases on failure.
 * Each of those was a real way to lose money or mislead somebody.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (...a: unknown[]) => from(...a),
  },
}));

import {
  isActionLive, isPackageForSale, totalCredits, isCreditProgrammeLive,
  fetchCreditPackages, type CreditAction, type CreditPackage,
} from '../lib/credits/catalogue';
import { withReservedCredits, CreditError } from '../lib/credits/wallet';

const action = (over: Partial<CreditAction> = {}): CreditAction => ({
  slug: 'ai.image', name: 'AI image', description: null, category: 'creative',
  creditCost: 5, enabled: true, requiresReservation: true, minPlan: null, ...over,
});

const pack = (over: Partial<CreditPackage> = {}): CreditPackage => ({
  slug: 'pack.growth', name: 'Growth pack', description: null,
  credits: 500, bonusCredits: 50, priceMinor: 2000000, currency: 'NGN',
  active: true, featured: true, sortOrder: 20, ...over,
});

beforeEach(() => { rpc.mockReset(); from.mockReset(); });

describe('unpriced is refused, never free', () => {
  it('does not treat a null cost as a free action', () => {
    // The whole point of NULL. Reading it as 0 would give away whatever an
    // operator had not got round to pricing.
    expect(isActionLive(action({ creditCost: null }))).toBe(false);
  });

  it('does not treat a null price as a free pack', () => {
    expect(isPackageForSale(pack({ priceMinor: null }))).toBe(false);
  });

  it('refuses a disabled action even when it is priced', () => {
    expect(isActionLive(action({ enabled: false }))).toBe(false);
  });

  it('allows a priced, enabled action', () => {
    expect(isActionLive(action())).toBe(true);
    expect(isPackageForSale(pack())).toBe(true);
  });

  it('counts a zero cost as live — zero is a decision, null is not', () => {
    // Somebody deliberately pricing an action at 0 is making an offer. That is
    // different from nobody having priced it at all.
    expect(isActionLive(action({ creditCost: 0 }))).toBe(true);
  });
});

describe('the credit programme is only advertised when it is real', () => {
  it('is not live when every action is unpriced — the shipped state', () => {
    const shipped = [
      action({ slug: 'ai.image', creditCost: null, enabled: false }),
      action({ slug: 'ai.video_clip', creditCost: null, enabled: false }),
    ];
    expect(isCreditProgrammeLive(shipped)).toBe(false);
  });

  it('is not live when an action is priced but switched off', () => {
    expect(isCreditProgrammeLive([action({ enabled: false })])).toBe(false);
  });

  it('becomes live as soon as one action is priced and enabled', () => {
    // This is what flips the pricing page back to making the claim, without a
    // deploy: the claim follows the configuration.
    expect(isCreditProgrammeLive([action({ creditCost: null, enabled: false }), action()])).toBe(true);
  });

  it('is not live for an empty catalogue', () => {
    expect(isCreditProgrammeLive([])).toBe(false);
  });
});

describe('pack totals', () => {
  it('adds the bonus, because that is what the customer receives', () => {
    expect(totalCredits(pack({ credits: 500, bonusCredits: 50 }))).toBe(550);
  });
  it('handles no bonus', () => {
    expect(totalCredits(pack({ credits: 100, bonusCredits: 0 }))).toBe(100);
  });
});

describe('money arriving as a string', () => {
  it('reads a bigint price sent as a string as a number', async () => {
    /*
     * PostgREST sends bigint as a STRING. "2000000" / 100 happens to work
     * while "2000000" + 0 gives "20000000" — a price that is sometimes a
     * string is a bug waiting for the first place somebody adds.
     */
    const chain = {
      select: vi.fn(() => chain),
      order: vi.fn(() => chain),
      then: (f: (v: unknown) => unknown) => Promise.resolve({
        data: [{
          slug: 'pack.growth', name: 'Growth', description: null,
          credits: 500, bonus_credits: 50, price_minor: '2000000',
          currency: 'NGN', active: true, featured: false, sort_order: 20,
        }],
        error: null,
      }).then(f),
    };
    from.mockReturnValue(chain);

    const [p] = await fetchCreditPackages();
    expect(p.priceMinor).toBe(2000000);
    expect(typeof p.priceMinor).toBe('number');
  });
});

describe('withReservedCredits', () => {
  /** reserve → run → consume | release, by RPC name. */
  const calls = () => rpc.mock.calls.map((c) => c[0] as string);

  it('consumes the reservation when the operation succeeds', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'credit_reserve') {
        return Promise.resolve({ data: { id: 'res-1', action_slug: 'ai.image', amount: 5, status: 'reserved', expires_at: 'x' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const out = await withReservedCredits('ai.image', async () => 'an image');
    expect(out).toBe('an image');
    expect(calls()).toEqual(['credit_reserve', 'credit_reservation_consume']);
  });

  it('RELEASES — and does not consume — when the operation throws', async () => {
    /*
     * The case this helper exists for. Written by hand, the release is the
     * line that gets skipped on the exception branch, and the customer pays
     * for a provider that timed out.
     */
    rpc.mockImplementation((name: string) => {
      if (name === 'credit_reserve') {
        return Promise.resolve({ data: { id: 'res-2', action_slug: 'ai.video_clip', amount: 30, status: 'reserved', expires_at: 'x' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await expect(
      withReservedCredits('ai.video_clip', async () => { throw new Error('provider timed out'); }),
    ).rejects.toThrow('provider timed out');

    expect(calls()).toContain('credit_reservation_release');
    expect(calls()).not.toContain('credit_reservation_consume');
  });

  it('still reports the original failure when the release itself fails', async () => {
    // The caller needs to know the video failed, not that the refund call did.
    rpc.mockImplementation((name: string) => {
      if (name === 'credit_reserve') {
        return Promise.resolve({ data: { id: 'res-3', action_slug: 'ai.image', amount: 5, status: 'reserved', expires_at: 'x' }, error: null });
      }
      if (name === 'credit_reservation_release') {
        return Promise.resolve({ data: null, error: { message: 'network down' } });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await expect(
      withReservedCredits('ai.image', async () => { throw new Error('generation failed'); }),
    ).rejects.toThrow('generation failed');
  });

  it('does not run the operation when the reservation is refused', async () => {
    // Not enough credits: nothing should be generated, because nothing was paid for.
    rpc.mockImplementation((name: string) => {
      if (name === 'credit_reserve') {
        return Promise.resolve({ data: null, error: { message: 'Not enough credits: 4 available, 30 needed.' } });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const run = vi.fn(async () => 'should not happen');
    await expect(withReservedCredits('ai.video_clip', run)).rejects.toBeInstanceOf(CreditError);
    expect(run).not.toHaveBeenCalled();
    expect(calls()).toEqual(['credit_reserve']);
  });

  it('surfaces the database message, because the user needs the numbers', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Not enough credits: 4 available, 30 needed.' } });
    await expect(withReservedCredits('ai.video_clip', async () => 1))
      .rejects.toThrow('4 available, 30 needed');
  });
});
