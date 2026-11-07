import { describe, it, expect } from 'vitest';

import { BASIS_NOTE, formatMinor, majorToMinor, minorToMajor, priceLabel } from './money';

describe('the two units that both exist', () => {
  /*
   * services.price_minor is kobo; create_orders.estimate_total is whole
   * naira and predates it. The conversion lives in one file because a
   * scattered `* 100` is how a figure gets multiplied twice, and a price
   * that is a hundred times wrong is obvious on a flyer and plausible on a
   * brand film.
   */
  it('converts naira to kobo and back without losing anything', () => {
    for (const naira of [0, 1, 3500, 7500, 150000, 5000000]) {
      expect(minorToMajor(majorToMinor(naira))).toBe(naira);
    }
  });

  it('knows the currencies that have no minor unit', () => {
    /* A Rwandan franc has no cents; multiplying by 100 would charge 100x. */
    expect(majorToMinor(5000, 'RWF')).toBe(5000);
    expect(majorToMinor(5000, 'NGN')).toBe(500000);
  });

  it('never produces a floating point amount', () => {
    expect(Number.isInteger(majorToMinor(7500))).toBe(true);
    expect(Number.isInteger(minorToMajor(750050))).toBe(true);
  });
});

describe('how a price reads', () => {
  it('groups the digits and drops empty decimals', () => {
    expect(formatMinor(750000)).toBe('₦7,500');
    expect(formatMinor(35000000)).toBe('₦350,000');
  });

  it('says Free rather than ₦0', () => {
    expect(priceLabel({ price_minor: 0, currency: 'NGN', pricing_model: 'free', price_unit: null }))
      .toBe('Free');
  });

  it('says Quoted when there is no number', () => {
    expect(priceLabel({ price_minor: null, currency: 'NGN', pricing_model: 'custom_quote', price_unit: null }))
      .toBe('Quoted');
  });

  /*
   * "from" belongs on a floor, not on an exact figure. "from ₦25,000 per
   * screen" leaves a customer unable to work out what four screens cost.
   */
  it('only says "from" where more scope really would change it', () => {
    expect(priceLabel({ price_minor: 750000, currency: 'NGN', pricing_model: 'starting_at', price_unit: null }))
      .toBe('from ₦7,500');
    expect(priceLabel({ price_minor: 2500000, currency: 'NGN', pricing_model: 'per_screen', price_unit: 'per screen' }))
      .toBe('₦25,000 per screen');
  });
});

describe('what a figure is allowed to claim', () => {
  /*
   * A number on a catalogue page reads as a promise unless it says
   * otherwise, and two of these three are explicitly not promises — the
   * founder's own brief calls them "a proposed launch catalogue... not
   * verified market averages or existing NowOpen Africa rates".
   */
  it('says plainly that an unquoted price is not confirmed', () => {
    expect(BASIS_NOTE.proposed).toMatch(/guide price/i);
    expect(BASIS_NOTE.proposed).toMatch(/confirm/i);
    expect(BASIS_NOTE.indicative).toMatch(/estimate/i);
    expect(BASIS_NOTE.quoted).toMatch(/confirmed/i);
  });

  it('has a note for every basis the database allows', () => {
    for (const basis of ['proposed', 'indicative', 'quoted']) {
      expect(BASIS_NOTE[basis], basis).toBeTruthy();
    }
  });
});
