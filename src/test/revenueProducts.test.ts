import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The money layer.
 *
 * Two failures here are silent and expensive: a price that is a string when
 * arithmetic expects a number, and an unpriced product rendered as free.
 */

const chain: Record<string, unknown> = {};
const result = { data: null as unknown, error: null as unknown };
Object.assign(chain, {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  order: vi.fn(() => chain),
  then: (f?: (v: unknown) => unknown) => Promise.resolve(result).then(f),
});
vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(() => chain) } }));

import {
  listSellableProducts, listAllProducts, formatPrice, parsePriceToMinor,
} from '../lib/revenue/products';

beforeEach(() => {
  vi.clearAllMocks();
  result.data = null;
  result.error = null;
});

describe('money never becomes a string', () => {
  it('converts a bigint price arriving as text', async () => {
    /*
     * PostgREST returns bigint as a STRING. "250000" / 100 happens to work,
     * while "250000" + 0 gives "2500000" — money that is sometimes a string is
     * how a total silently gains a digit.
     */
    result.data = [{
      id: 'p1', slug: 'featured-business', name: 'Featured Business', description: null,
      kind: 'promotion', price_minor: '250000', currency: 'NGN', duration_days: 30,
      scope_category: null, scope_location: null, max_concurrent: null,
      active: true, sort_order: 10,
    }];
    const { products } = await listSellableProducts();
    expect(typeof products[0].priceMinor).toBe('number');
    expect(products[0].priceMinor).toBe(250000);
  });

  it('keeps an unpriced product as null, not zero', async () => {
    result.data = [{
      id: 'p1', slug: 'x', name: 'X', description: null, kind: 'promotion',
      price_minor: null, currency: 'NGN', duration_days: null,
      scope_category: null, scope_location: null, max_concurrent: null,
      active: false, sort_order: 10,
    }];
    const { products } = await listAllProducts();
    expect(products[0].priceMinor).toBeNull();
  });
});

describe('an unpriced product is never shown as free', () => {
  it('formats nothing rather than ₦0', () => {
    // "Free" and "nobody has decided what this costs" are different facts.
    expect(formatPrice(null, 'NGN')).toBeNull();
  });

  it('formats a real price', () => {
    expect(formatPrice(250000, 'NGN')).toMatch(/2,500/);
  });

  it('survives a currency code Intl does not know', () => {
    // A bad currency must not take the pricing page down.
    expect(() => formatPrice(1000, 'ZZZ')).not.toThrow();
    expect(formatPrice(1000, 'ZZZ')).toContain('10');
  });
});

describe('what an operator types becomes exact minor units', () => {
  it.each([
    ['2500', 250000],
    ['₦2,500', 250000],
    ['2500.50', 250050],
    ['0', 0],
  ])('%s -> %i', (input, expected) => {
    expect(parsePriceToMinor(input)).toBe(expected);
  });

  it('rounds rather than truncating a fractional kobo', () => {
    // 2500.999 is a typo. Charging 2500.99 instead of 2501 is worse than
    // either reading, so it rounds.
    expect(parsePriceToMinor('2500.999')).toBe(250100);
  });

  it('rejects anything that is not a number', () => {
    for (const junk of ['', 'free', 'abc', '-']) {
      expect(parsePriceToMinor(junk)).toBeNull();
    }
  });
});

describe('failures are reported, not rendered as an empty catalogue', () => {
  it('flags a failed read instead of saying nothing is for sale', async () => {
    /*
     * supabase-js resolves with { data: null, error }. Without checking it, a
     * dropped connection renders "no products available" — which reads as a
     * deliberate commercial state rather than an outage.
     */
    result.error = { message: 'connection refused' };
    const { products, failed } = await listSellableProducts();
    expect(failed).toBe(true);
    expect(products).toEqual([]);
  });

  it('does not flag an genuinely empty catalogue as failed', async () => {
    result.data = [];
    const { products, failed } = await listSellableProducts();
    expect(failed).toBe(false);
    expect(products).toEqual([]);
  });
});
