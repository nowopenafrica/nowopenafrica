import { describe, it, expect } from 'vitest';

import {
  CATALOGUE, PACKS, CREDIT_BUNDLES, MARGIN_BAND,
  awaitingQuote, byDivision, creditValue, customerPrice, marginOn,
  markupInBand, priceLabel, sellable,
  type CatalogueItem,
} from './catalogue';

describe('nothing priced off a competitor can be sold', () => {
  it('marks every print item as an estimate, not a price', () => {
    for (const item of byDivision('print')) {
      expect(item.basis, item.sku).toBe('indicative');
      expect(sellable(item), item.sku).toBe(false);
    }
  });

  it('shows an indicative price as an estimate wherever it appears', () => {
    for (const item of awaitingQuote()) {
      expect(priceLabel(item), item.sku).toMatch(/estimate/);
    }
  });

  it('cannot sell a pack, because every pack contains print', () => {
    // A pack is only as certain as the least certain thing inside it.
    for (const pack of PACKS) {
      expect(pack.basis, pack.sku).toBe('indicative');
      expect(sellable(pack), pack.sku).toBe(false);
    }
  });

  it('lists exactly what still needs a real quote', () => {
    const waiting = awaitingQuote().map((i) => i.sku);
    expect(waiting.length).toBeGreaterThan(10);
    expect(waiting).toContain('pr-cards');
    // Digital work is priced from known costs, so it is not on the list.
    expect(waiting).not.toContain('qc-social');
    expect(waiting).not.toContain('vid-reel');
  });

  it('every benchmark says where and when it came from', () => {
    for (const item of CATALOGUE) {
      if (!item.benchmark) continue;
      expect(item.benchmark.source, item.sku).toMatch(/printivo/i);
      // A benchmark with no date is a benchmark nobody can re-check.
      expect(item.benchmark.seen, item.sku).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(item.benchmark.low, item.sku).toBeGreaterThan(0);
    }
  });
});

describe('digital creation is free, and that is the point', () => {
  it('charges nothing to make something in Studio', () => {
    const quick = byDivision('create').filter((i) => i.fulfilment === 'instant');
    expect(quick.length).toBeGreaterThan(4);
    for (const item of quick) {
      expect(item.free, item.sku).toBe(true);
      expect(priceLabel(item)).toBe('Free');
    }
  });

  it('prices the work a person does', () => {
    const creator = CATALOGUE.filter((i) => i.fulfilment === 'creator');
    expect(creator.length).toBeGreaterThan(5);
    for (const item of creator) {
      expect(item.price, item.sku).toBeGreaterThan(0);
      expect(item.free, item.sku).toBeFalsy();
    }
  });
});

describe('the catalogue holds together', () => {
  it('has no duplicate SKUs', () => {
    const skus = CATALOGUE.map((i) => i.sku);
    expect(new Set(skus).size).toBe(skus.length);
  });

  it('gives every item a price of some kind', () => {
    for (const item of CATALOGUE) {
      const priced = item.free || item.price != null || (item.tiers?.length ?? 0) > 0;
      expect(priced, item.sku).toBe(true);
    }
  });

  it('gets cheaper per unit as the quantity rises', () => {
    // If a bigger box costs more each, the tier table is wrong and a customer
    // will find it before we do.
    for (const item of CATALOGUE) {
      if (!item.tiers || item.tiers.length < 2) continue;
      for (let i = 1; i < item.tiers.length; i += 1) {
        const prev = item.tiers[i - 1];
        const cur = item.tiers[i];
        expect(cur.qty, item.sku).toBeGreaterThan(prev.qty);
        expect(cur.price / cur.qty, `${item.sku} @${cur.qty}`)
          .toBeLessThan(prev.price / prev.qty);
      }
    }
  });

  it('prices above the benchmark it was derived from', () => {
    // NowOpen adds a margin over a competitor's retail; pricing under it means
    // the margin is coming out of NowOpen.
    for (const item of CATALOGUE) {
      if (!item.benchmark || !item.tiers?.length) continue;
      expect(item.tiers[0].price, item.sku).toBeGreaterThanOrEqual(item.benchmark.low);
    }
  });

  it('quotes a turnaround for anything a human or a printer touches', () => {
    for (const item of CATALOGUE) {
      if (item.fulfilment === 'instant') continue;
      expect(item.turnaround, item.sku).toBeDefined();
      const [min, max] = item.turnaround!;
      expect(max, item.sku).toBeGreaterThanOrEqual(min);
    }
  });
});

describe('margin', () => {
  it('builds a customer price from a real cost', () => {
    expect(customerPrice({ supplierCost: 10_000, markup: 0.25 })).toBe(12_500);
    expect(customerPrice({ supplierCost: 10_000, deliveryFee: 2_000, markup: 0.2 })).toBe(14_400);
  });

  it('rounds up to something a person would quote', () => {
    // 13_950.4 -> 14_000, not ₦13,950.40
    const p = customerPrice({ supplierCost: 11_163, markup: 0.25 });
    expect(p % 100).toBe(0);
    expect(p).toBeGreaterThanOrEqual(11_163 * 1.25);
  });

  it('never returns a margin that the delivery fee has eaten', () => {
    const costing = { supplierCost: 10_000, deliveryFee: 3_000, markup: 0.2 };
    expect(marginOn(costing)).toBeGreaterThan(0);
  });

  it('holds the bands: 15-30% print, 15-25% creator', () => {
    expect(MARGIN_BAND.partner).toEqual([0.15, 0.30]);
    expect(MARGIN_BAND.creator).toEqual([0.15, 0.25]);
    expect(markupInBand('partner', 0.30)).toBe(true);
    expect(markupInBand('partner', 0.35)).toBe(false);
    expect(markupInBand('creator', 0.30)).toBe(false);
    expect(markupInBand('creator', 0.10)).toBe(false);
  });
});

describe('credits', () => {
  it('gets better value the more you buy', () => {
    for (let i = 1; i < CREDIT_BUNDLES.length; i += 1) {
      expect(creditValue(CREDIT_BUNDLES[i]))
        .toBeLessThan(creditValue(CREDIT_BUNDLES[i - 1]));
    }
  });
});

describe('price labels tell the truth', () => {
  const item = (over: Partial<CatalogueItem>): CatalogueItem => ({
    sku: 'x', division: 'create', name: 'X', blurb: '',
    fulfilment: 'creator', basis: 'quoted', ...over,
  });

  it('never prints a bare number for an estimate', () => {
    expect(priceLabel(item({ basis: 'indicative', price: 15_000 })))
      .toBe('from ₦15,000 — estimate');
  });

  it('says Free rather than ₦0', () => {
    expect(priceLabel(item({ free: true }))).toBe('Free');
  });

  it('says "on request" rather than inventing a number', () => {
    expect(priceLabel(item({}))).toBe('On request');
  });
});
