import { describe, it, expect } from 'vitest';

import { generateAdverts } from './populateData';
import { ADVERT_CATEGORIES, ADVERT_CATEGORY_GROUPS } from './advertCategories';

// The Promote page (/adverts) is a rate card. Numbers on it are what an
// advertiser budgets against, so "realistic" here is measurable, not a matter
// of taste: a day rate times thirty has to land somewhere a Nigerian OOH buyer
// would recognise.
//
// Reference band, from published Nigerian monthly rate cards (Aug 2026):
//   tier-3 city unipole (Aba, Warri, Port Harcourt, Asaba)  N500-900k
//   Lagos secondary static                                  N1.5-2m
//   Lagos prime static / wall panel                         N2.5-3.5m
//   Lagos prime LED                                         N3.6-7m
//   flagship Lagos LED / screen network                     N9-13m
//
// Before this was pinned, every seeded rate sat 3-23x above that — Port
// Harcourt at ~N11.7m a month against a real N500k.

const NGN_PER_USD = 1500;
const monthlyNaira = (usdPerDay: number) => usdPerDay * 30 * NGN_PER_USD;

// Samples are gated on import.meta.env.DEV; Vitest runs in DEV.
const adverts = generateAdverts();

describe('ad placement sample data', () => {
  it('produces placements at all (guards the DEV-only gate)', () => {
    expect(adverts.length).toBeGreaterThan(0);
  });

  it('keeps every placement inside the published market band', () => {
    // Floor is N85k, not the N400k assumed when this was first written: the
    // published card lists a 48-sheet in Akure at N100k and one in Umuahia at
    // N120k. Ceiling has headroom above N13m for prime South African
    // inventory, a genuinely more expensive market than Lagos.
    for (const a of adverts) {
      const naira = monthlyNaira(a.price_per_day);
      expect(naira, `${a.title} is below any real rate card`).toBeGreaterThanOrEqual(85_000);
      expect(naira, `${a.title} is above any real rate card`).toBeLessThanOrEqual(15_000_000);
    }
  });

  it('prices Nigerian inventory against the rate cards it was derived from', () => {
    const ng = adverts.filter((a) => a.location.includes('Nigeria'));
    expect(ng.length).toBeGreaterThan(5);
    const naira = ng.map((a) => monthlyNaira(a.price_per_day));
    // Cheapest Nigerian placement is a tier-3 city board; dearest is the
    // Victoria Island LED. Both were checked against listed inventory.
    expect(Math.min(...naira)).toBeLessThanOrEqual(700_000);
    expect(Math.max(...naira)).toBeLessThanOrEqual(13_500_000);
  });

  it('spreads prices rather than clustering on a few round numbers', () => {
    // A rate card where everything costs the same reads as placeholder data.
    const distinct = new Set(adverts.map((a) => a.price_per_day));
    expect(distinct.size).toBeGreaterThan(adverts.length / 3);
  });

  it('gives every placement the details a card renders', () => {
    for (const a of adverts) {
      expect(a.title?.trim(), 'title').toBeTruthy();
      expect(a.location?.trim(), `${a.title} location`).toBeTruthy();
      expect(a.description?.trim().length ?? 0, `${a.title} description`).toBeGreaterThan(40);
      expect(a.image_url, `${a.title} image`).toMatch(/^https:\/\//);
      expect(a.price_per_day, `${a.title} price`).toBeGreaterThan(0);
    }
  });

  it('covers every category the Promote page offers as a filter', () => {
    // Cinema, Vehicle Wrap, Television, Print and Online were all selectable
    // and all returned an empty grid — a filter with nothing behind it reads
    // as a broken page rather than a quiet category.
    const covered = new Set(adverts.map((a) => a.type));
    const missing = ADVERT_CATEGORIES.filter((c) => !covered.has(c));
    expect(missing, 'these filters would show an empty grid').toEqual([]);
  });

  it('covers every medium group', () => {
    for (const group of ADVERT_CATEGORY_GROUPS) {
      const count = adverts.filter((a) => group.members.includes(a.type)).length;
      expect(count, `${group.label} has no placements`).toBeGreaterThan(0);
    }
  });

  it('carries inventory an SME can actually afford', () => {
    // The floor used to be ~N495k a month, which excluded most of the
    // businesses this platform exists for. The published card starts at N100k
    // for a 48-sheet, so a marketplace with nothing under N400k is missing the
    // entry tier rather than reflecting the market.
    const affordable = adverts.filter((a) => monthlyNaira(a.price_per_day) <= 500_000);
    expect(affordable.length, 'nothing here costs under N500k a month').toBeGreaterThanOrEqual(3);
  });

  it('reaches beyond the two biggest Nigerian cities', () => {
    // Real listings run through Ondo, Abia, Edo, Enugu, Anambra, Akwa Ibom and
    // Delta. Inventory confined to Lagos and Abuja is a directory for two
    // cities, not a country.
    const cities = new Set(
      adverts.filter((a) => a.location.includes('Nigeria')).map((a) => a.location.split(',')[0].trim()),
    );
    expect(cities.size, 'Nigerian inventory is too concentrated').toBeGreaterThanOrEqual(10);
  });

  it('never shows the same photo on two placements', () => {
    // generateAdverts indexes each type's photo pool with `% pool.length`, so a
    // pool shorter than that type's placement count silently repeats. Three
    // billboard photos across twenty-six billboards put the same picture on the
    // page nine times, which reads as one placement listed over and over.
    const images = adverts.map((a) => a.image_url);
    const seen = new Map<string, string[]>();
    adverts.forEach((a) => {
      seen.set(a.image_url, [...(seen.get(a.image_url) ?? []), a.title]);
    });
    const repeated = [...seen.entries()].filter(([, titles]) => titles.length > 1);
    expect(repeated.map(([, t]) => t), 'these placements share a photo').toEqual([]);
    expect(new Set(images).size).toBe(images.length);
  });

  it('gives every placement a unique title, so the pricing SQL matches one row', () => {
    // update_placement_pricing.sql keys on the title. A duplicate would let one
    // statement rewrite two placements.
    const titles = adverts.map((a) => a.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('keeps the Côte d\'Ivoire placements, which use a different quote style', () => {
    // Both rows quote their location with double quotes because the country
    // name contains an apostrophe. A single-quote-only parse silently drops
    // them, which is exactly what happened while writing this data.
    expect(adverts.filter((a) => a.location.includes("Ivoire")).length).toBe(2);
  });
});
