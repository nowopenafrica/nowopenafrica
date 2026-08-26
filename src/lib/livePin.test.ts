import { describe, it, expect } from 'vitest';

import { parsePinPayload, pinTable, formatPinPrice, pinCtaLabel } from './livePin';

describe('parsePinPayload', () => {
  const good = { itemId: '11111111-2222-3333-4444-555555555555', source: 'product', moduleKey: 'menu' };

  it('accepts a well-formed pin', () => {
    expect(parsePinPayload(good)).toEqual(good);
  });

  it('accepts an unpin', () => {
    expect(parsePinPayload({ itemId: null, source: 'service', moduleKey: 'appointments' }))
      .toEqual({ itemId: null, source: 'service', moduleKey: 'appointments' });
  });

  it('refuses anything that is not the shape it expects', () => {
    // Everything arriving here was sent by an untrusted client over a public
    // Realtime channel.
    expect(parsePinPayload(null)).toBeNull();
    expect(parsePinPayload('pin')).toBeNull();
    expect(parsePinPayload({})).toBeNull();
    expect(parsePinPayload({ ...good, source: 'coupon' })).toBeNull();
    expect(parsePinPayload({ ...good, moduleKey: '' })).toBeNull();
    expect(parsePinPayload({ ...good, moduleKey: 42 })).toBeNull();
  });

  it('refuses an id that is not a uuid rather than querying with it', () => {
    expect(parsePinPayload({ ...good, itemId: 'or 1=1' })).toBeNull();
    expect(parsePinPayload({ ...good, itemId: 42 })).toBeNull();
    expect(parsePinPayload({ ...good, itemId: '' })).toBeNull();
  });

  it('bounds the module key instead of trusting its length', () => {
    const parsed = parsePinPayload({ ...good, moduleKey: 'x'.repeat(500) });
    expect(parsed?.moduleKey).toHaveLength(64);
  });

  it('carries no name, price or picture — those come from the database', () => {
    // A forged pin must not be able to invent a price on a business's stream.
    const parsed = parsePinPayload({ ...good, name: 'iPhone 15', price: '₦50,000', imageUrl: 'http://x/y.jpg' });
    expect(parsed).toEqual(good);
  });
});

describe('pinTable', () => {
  it('maps a source to the table its ids live in', () => {
    expect(pinTable('service')).toBe('business_services');
    expect(pinTable('product')).toBe('business_products');
  });
});

describe('formatPinPrice', () => {
  it('shows a price exactly as the business wrote it', () => {
    // These are free text in the schema: "From ₦200/day", "Contact us".
    expect(formatPinPrice('From ₦200/day')).toBe('From ₦200/day');
    expect(formatPinPrice('  ₦12,000 ')).toBe('₦12,000');
  });

  it('leaves a missing price blank rather than inventing ₦0', () => {
    expect(formatPinPrice('')).toBeNull();
    expect(formatPinPrice('   ')).toBeNull();
    expect(formatPinPrice(null)).toBeNull();
    expect(formatPinPrice(undefined)).toBeNull();
  });
});

describe('pinCtaLabel', () => {
  it('prefers the label the category config already uses', () => {
    expect(pinCtaLabel('Add to Cart', 'product')).toBe('Add to Cart');
  });

  it('falls back to a verb rather than an empty button', () => {
    expect(pinCtaLabel('', 'product')).toBe('Order this');
    expect(pinCtaLabel(null, 'service')).toBe('Book this');
  });
});
