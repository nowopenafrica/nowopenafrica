import { describe, it, expect } from 'vitest';
import { GOALS } from './goals';
import { buildMix, LEVELS } from './mix';
import { FREE_TOOLS } from './freeTools';
import type { RevenueProduct } from '../revenue/products';
import type { Advertisement } from '../../types';
import { IMPORTED_FALLBACK, type PlacementTrust } from './trust';

const prod = (slug: string, priceMinor: number | null, active = true): RevenueProduct => ({
  id: slug, slug, name: slug, description: null, kind: 'spotlight' as RevenueProduct['kind'],
  priceMinor, currency: 'NGN', durationDays: 7, scopeCategory: null, scopeLocation: null,
  maxConcurrent: null, active, sortOrder: 0,
});
const ad = (id: string, category: string, location: string, pricing: number | null, status = 'active'): Advertisement => ({
  id, title: id, description: '', category, location, status,
  ...(pricing == null ? {} : { pricing }),
});

const products = [
  prod('city-spotlight', 3_000_000), prod('category-spotlight', 2_000_000),
  prod('homepage-feature', 9_000_000), prod('featured-business', 4_000_000),
  prod('featured-offer', 1_500_000), prod('sponsored-result', 1_000_000),
  prod('industry-takeover', 50_000_000), prod('unpriced-x', null),
];
const adverts = [
  ad('sf-cheap', 'Street Furniture', 'Lagos, Nigeria', 1),
  ad('sf-dear', 'Street Furniture', 'Lagos, Nigeria', 3),
  ad('bb-lagos', 'Billboard', 'Lagos, Nigeria', 5),
  ad('bb-abuja', 'Billboard', 'Abuja, Nigeria', 4),
  ad('tr-lagos', 'Transit', 'Lagos, Nigeria', 2),
  ad('bb-quote', 'Billboard', 'Lagos, Nigeria', null),
  ad('bb-off', 'Billboard', 'Lagos, Nigeria', 5, 'inactive'),
];
const NGN = 1500;
const run = (goal = GOALS[0], city: string | null = 'Lagos', p = products, a = adverts) =>
  buildMix(goal, { products: p, adverts: a, city, ngnPerUsd: NGN });
const lvl = (m: ReturnType<typeof run>, k: string) => m.levels.find((l) => l.key === k)!;

describe('buildMix', () => {
  it('free level is only free tools', () => {
    const f = lvl(run(), 'free');
    expect(f.items.length).toBeGreaterThan(0);
    expect(f.items.every((i) => i.kind === 'free')).toBe(true);
    expect(f.totalNgn).toBe(0);
  });

  it('never exceeds a ceiling', () => {
    for (const g of GOALS) for (const city of ['Lagos', 'Abuja', 'Kano', null]) {
      const m = run(g, city);
      for (const l of m.levels) {
        const c = LEVELS.find((x) => x.key === l.key)!.ceilingNgn;
        if (c != null) expect(l.totalNgn).toBeLessThanOrEqual(c);
      }
    }
  });

  it('campaign spends more than growth when inventory allows', () => {
    const m = run(GOALS[1]);
    expect(lvl(m, 'campaign').totalNgn).toBeGreaterThan(lvl(m, 'growth').totalNgn);
  });

  it("follows the goal's channel order", () => {
    // nearby: city-spotlight is 30,000 NGN and the first paid channel; it fits Starter.
    const first = lvl(run(), 'starter').items.find((i) => i.kind !== 'free')!;
    expect(first.kind).toBe('product');
    if (first.kind === 'product') expect(first.product.slug).toBe('city-spotlight');
  });

  it('keeps unpriced placements out of levels', () => {
    const m = run();
    const inLevels = m.levels.flatMap((l) => l.items);
    expect(inLevels.some((i) => i.kind === 'placement' && i.advert.id === 'bb-quote')).toBe(false);
    expect(m.onRequest.map((a) => a.id)).toEqual(['bb-quote']);
  });

  it('fills levels with no placements in the city', () => {
    const m = run(GOALS[0], 'Kano');
    expect(m.cityHasPlacements).toBe(false);
    expect(lvl(m, 'free').items.length).toBeGreaterThan(0);
    expect(lvl(m, 'starter').items.some((i) => i.kind === 'product')).toBe(true);
  });

  it('builds without any products', () => {
    const m = run(GOALS[0], 'Lagos', []);
    expect(lvl(m, 'free').items.length).toBeGreaterThan(0);
    expect(lvl(m, 'growth').items.some((i) => i.kind === 'placement')).toBe(true);
  });

  it('filters by city', () => {
    const m = run(GOALS[0], 'Lagos');
    for (const l of m.levels) for (const i of l.items) {
      if (i.kind === 'placement') expect(i.advert.location).toContain('Lagos');
    }
  });

  it('costs placements for 30 days in naira', () => {
    const p = lvl(run(), 'growth').items.find((i) => i.kind === 'placement')!;
    if (p.kind !== 'placement') throw new Error('expected a placement');
    expect(p.days).toBe(30);
    expect(p.costNgn).toBe(Math.round((p.advert.pricing as number) * 30 * NGN));
  });

  it('costs products for their period', () => {
    const p = lvl(run(), 'starter').items.find((i) => i.kind === 'product')!;
    if (p.kind !== 'product') throw new Error('expected a product');
    expect(p.costNgn).toBe((p.product.priceMinor as number) / 100);
  });

  it('only active rows (a missing status counts as active)', () => {
    const noStatus = { ...ad('no-status', 'Transit', 'Lagos', 1), status: undefined };
    const m = run(GOALS[0], 'Lagos', products, [...adverts, noStatus]);
    const ids = m.levels.flatMap((l) => l.items).flatMap((i) => (i.kind === 'placement' ? [i.advert.id] : []));
    expect(ids).not.toContain('bb-off');
    expect(ids).toContain('no-status');
  });

  it('never recommends a rejected or archived placement, in a level or on request', () => {
    const archived = { ...ad('sf-archived', 'Street Furniture', 'Lagos, Nigeria', 0.5), lifecycle: 'archived' };
    const rejected = { ...ad('sf-rejected', 'Street Furniture', 'Lagos, Nigeria', 0.5), lifecycle: 'rejected' };
    const quoteGone = { ...ad('bb-quote-gone', 'Billboard', 'Lagos, Nigeria', null), lifecycle: 'archived' };
    const listed = { ...ad('sf-listed', 'Street Furniture', 'Lagos, Nigeria', 0.5), lifecycle: 'imported' };
    const m = run(GOALS[0], 'Lagos', products, [...adverts, archived, rejected, quoteGone, listed]);
    const ids = m.levels.flatMap((l) => l.items).flatMap((i) => (i.kind === 'placement' ? [i.advert.id] : []));
    expect(ids).not.toContain('sf-archived');
    expect(ids).not.toContain('sf-rejected');
    expect(ids).toContain('sf-listed');
    expect(m.onRequest.map((a) => a.id)).not.toContain('bb-quote-gone');
    // A city whose only placements are gone has none.
    const only = run(GOALS[0], 'Lagos', [], [archived, rejected]);
    expect(only.cityHasPlacements).toBe(false);
  });

  it('skips unpriced and inactive products', () => {
    const m = run(GOALS[0], 'Lagos', [prod('city-spotlight', null), prod('category-spotlight', 100, false)]);
    expect(m.levels.flatMap((l) => l.items).some((i) => i.kind === 'product')).toBe(false);
  });

  it('matches the medium held in type when category is absent', () => {
    const a = { ...ad('t', 'x', 'Lagos', 10), category: undefined, type: 'Street Furniture' };
    const m = run(GOALS[0], 'Lagos', [], [a]);
    expect(m.levels.flatMap((l) => l.items).some((i) => i.kind === 'placement')).toBe(true);
  });
});

describe('free tool names', () => {
  it('come from the one FREE_TOOLS list, verbatim (label and link)', () => {
    expect(FREE_TOOLS.map((t) => t.label)).toEqual([
      'Publish an offer',
      'Update the people who kept you',
      'A profile that answers the question',
      'Then see who came',
    ]);
    const free = lvl(run(GOALS[0]), 'free').items.concat(lvl(run(GOALS[2]), 'free').items, lvl(run(GOALS[5]), 'free').items);
    const tools = free.filter((i) => i.kind === 'free');
    expect(new Set(tools.map((t) => (t.kind === 'free' ? t.tool : ''))).size).toBe(3);
    for (const t of tools) {
      if (t.kind !== 'free') continue;
      const info = FREE_TOOLS.find((f) => f.tool === t.tool)!;
      expect({ label: t.label, to: t.to }).toEqual({ label: info.label, to: info.to });
    }
  });
});

describe('review fixes', () => {
  const only = (p: RevenueProduct[], a: Advertisement[] = [], city: string | null = null) =>
    buildMix(GOALS[0], { products: p, adverts: a, city, ngnPerUsd: NGN });
  const hasProduct = (m: ReturnType<typeof only>, k: string) =>
    lvl(m, k).items.some((i) => i.kind === 'product');

  it('treats a zero price as unpriced', () => {
    const zero = ad('zero', 'Street Furniture', 'Lagos', 0);
    const m = only([prod('city-spotlight', 0)], [zero], 'Lagos');
    expect(m.onRequest.map((a) => a.id)).toEqual(['zero']);
    expect(m.levels.flatMap((l) => l.items).some((i) => i.kind !== 'free')).toBe(false);
    expect(m.cityHasPlacements).toBe(false);
  });

  it('includes exactly N50,000 in Starter and excludes N50,001', () => {
    expect(hasProduct(only([prod('city-spotlight', 5_000_000)]), 'starter')).toBe(true);
    expect(hasProduct(only([prod('city-spotlight', 5_000_100)]), 'starter')).toBe(false);
    expect(hasProduct(only([prod('city-spotlight', 5_000_100)]), 'growth')).toBe(true);
  });

  it('includes exactly N250,000 in Growth and excludes N250,001', () => {
    expect(hasProduct(only([prod('city-spotlight', 25_000_000)]), 'growth')).toBe(true);
    expect(hasProduct(only([prod('city-spotlight', 25_000_100)]), 'growth')).toBe(false);
    expect(hasProduct(only([prod('city-spotlight', 25_000_100)]), 'campaign')).toBe(true);
  });

  it('picks the same adverts whatever the input order', () => {
    const tied = [
      ad('b', 'Street Furniture', 'Lagos', 1), ad('a', 'Street Furniture', 'Lagos', 1),
      ad('d', 'Billboard', 'Lagos', 2), ad('c', 'Billboard', 'Lagos', 2),
    ];
    const ids = (list: Advertisement[]) =>
      only([], list, 'Lagos').levels.map((l) => l.items.map((i) => (i.kind === 'placement' ? i.advert.id : i.kind)));
    const base = ids(tied);
    for (const order of [[3, 2, 1, 0], [1, 3, 0, 2], [2, 0, 3, 1]]) {
      expect(ids(order.map((i) => tied[i]))).toEqual(base);
    }
  });

  it('matches the city by first comma segment, case-insensitively', () => {
    const a = [
      ad('yes', 'Street Furniture', 'lagos, Nigeria', 1),
      ad('road', 'Street Furniture', 'Lagos-Ibadan Expressway, Ogun', 1),
    ];
    const m = only([], a, 'Lagos');
    const ids = m.levels.flatMap((l) => l.items).flatMap((i) => (i.kind === 'placement' ? [i.advert.id] : []));
    expect(ids).toContain('yes');
    expect(ids).not.toContain('road');
    expect(only([], a, 'Ogun').cityHasPlacements).toBe(false);
  });
});

describe('product currency', () => {
  const withCurrency = (currency: string, priceMinor: number) =>
    ({ ...prod('city-spotlight', priceMinor), currency });
  const productIn = (p: RevenueProduct, k = 'campaign') =>
    lvl(buildMix(GOALS[0], { products: [p], adverts: [], city: null, ngnPerUsd: NGN }), k)
      .items.find((i) => i.kind === 'product');

  it('costs NGN kobo as naira', () => {
    const i = productIn(withCurrency('NGN', 1_950_000));
    expect(i?.kind === 'product' && i.costNgn).toBe(19_500);
  });

  it('converts USD minor units with ngnPerUsd', () => {
    const i = productIn(withCurrency('USD', 1_300)); // $13.00
    expect(i?.kind === 'product' && i.costNgn).toBe(13 * NGN);
    // $13 × 1500 = ₦19,500 fits Starter; it must not be read as ₦13.
    expect(productIn(withCurrency('USD', 1_300), 'starter')).toBeTruthy();
    expect(productIn(withCurrency('USD', 5_000), 'starter')).toBeUndefined(); // $50 = ₦75,000
  });

  it('leaves any other currency out rather than guess', () => {
    const m = buildMix(GOALS[0], { products: [withCurrency('KES', 100_000)], adverts: [], city: null, ngnPerUsd: NGN });
    expect(m.levels.flatMap((l) => l.items).some((i) => i.kind === 'product')).toBe(false);
  });
});

describe('buildMix trust tiebreak', () => {
  const trusted = (id: string, label: PlacementTrust['trustLabel']): PlacementTrust => ({ ...IMPORTED_FALLBACK(id), trustLabel: label });
  const pickedSf = (m: ReturnType<typeof run>, k: string) =>
    lvl(m, k).items.flatMap((i) => (i.kind === 'placement' && i.advert.category === 'Street Furniture' ? [i.advert.id] : []));
  const mixWith = (a: Advertisement[], trust?: Map<string, PlacementTrust>) =>
    buildMix(GOALS[0], { products: [], adverts: a, city: 'Lagos', ngnPerUsd: NGN, trust });

  it('mix prefers trusted at equal cost', () => {
    // 'a-listed' sorts first by id, so only the trust key can put 'z-verified' ahead.
    const pair = [ad('a-listed', 'Street Furniture', 'Lagos, Nigeria', 1), ad('z-verified', 'Street Furniture', 'Lagos, Nigeria', 1)];
    const trust = new Map([
      ['a-listed', trusted('a-listed', 'source_listed')],
      ['z-verified', trusted('z-verified', 'partner_verified')],
    ]);
    for (const k of ['starter', 'growth', 'campaign']) expect(pickedSf(mixWith(pair, trust), k)).toEqual(['z-verified']);
    // Without trust the id stays the final key, exactly as before.
    expect(pickedSf(mixWith(pair), 'starter')).toEqual(['a-listed']);
    expect(pickedSf(mixWith(pair), 'campaign')).toEqual(['z-verified']);
  });

  it('trust never outranks price, and ceilings still hold', () => {
    // The verified one is dearer than Starter allows: Starter must still take the cheap one.
    const pair = [ad('cheap-listed', 'Street Furniture', 'Lagos, Nigeria', 1), ad('dear-verified', 'Street Furniture', 'Lagos, Nigeria', 3)];
    const trust = new Map([
      ['cheap-listed', trusted('cheap-listed', 'source_listed')],
      ['dear-verified', trusted('dear-verified', 'partner_verified')],
    ]);
    const m = mixWith(pair, trust);
    // 3 USD × 30 days × 1500 = 135,000 > 50,000; 1 × 30 × 1500 = 45,000 fits.
    expect(pickedSf(m, 'starter')).toEqual(['cheap-listed']);
    expect(pickedSf(m, 'growth')).toEqual(['cheap-listed']);
    expect(pickedSf(m, 'campaign')).toEqual(['dear-verified']);
    for (const l of LEVELS) {
      if (l.ceilingNgn != null) expect(lvl(m, l.key).totalNgn).toBeLessThanOrEqual(l.ceilingNgn);
    }
  });
});
