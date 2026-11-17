import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));
vi.mock('../payments', () => ({ launchPaystackCheckout: vi.fn(), verifyPayment: vi.fn() }));

import { announceBalanceChanged, isLowBalance, NOC_BALANCE_EVENT } from './topUp';

describe('isLowBalance', () => {
  it('is low when the balance cannot cover the dearest live action', () => {
    expect(isLowBalance(14, [1, 5, 15])).toBe(true);
    expect(isLowBalance(15, [1, 5, 15])).toBe(false);
  });
  it('never nags when nothing is priced', () => {
    expect(isLowBalance(0, [])).toBe(false);
  });
});

describe('announceBalanceChanged', () => {
  it('fires the event every balance on the page listens for', () => {
    const seen = vi.fn();
    window.addEventListener(NOC_BALANCE_EVENT, seen);
    announceBalanceChanged();
    window.removeEventListener(NOC_BALANCE_EVENT, seen);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
