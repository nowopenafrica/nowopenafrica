import { describe, it, expect } from 'vitest';
import {
  discoveryPages, discoveryTitle, matchesPage, placeOf, slugify,
  relatedPlaces, MIN_LISTINGS_PER_PAGE,
} from './discoveryPages';

// These pages ARE the organic growth surface, so the rule that creates them is
// worth pinning down. The failure that matters is not "a page is missing" — it
// is mass-producing thin pages, which demotes the whole domain.

const biz = (category: string, location: string) => ({ category, location });

describe('discoveryPages', () => {
  it('refuses to build a page that would hold too few listings', () => {
    // Today's real shape: 32 businesses, every city+category pair unique.
    const listings = [
      biz('Restaurant', 'Lagos, Nigeria'),
      biz('Dental Care', 'Lagos, Nigeria'),
      biz('Salon / Barber', 'Nairobi, Kenya'),
    ];
    const pages = discoveryPages(listings);
    // Lagos has 2 — below the floor, so no place page.
    expect(pages.find((p) => p.place === 'Lagos')).toBeUndefined();
    // And no pair page anywhere, because each pair holds one.
    expect(pages.filter((p) => p.kind === 'category-in-place')).toHaveLength(0);
  });

  it('creates a place page the moment density reaches the floor', () => {
    const listings = Array.from({ length: MIN_LISTINGS_PER_PAGE }, (_, i) =>
      biz(`Category ${i}`, 'Lagos, Nigeria'),
    );
    const pages = discoveryPages(listings);
    const lagos = pages.find((p) => p.kind === 'place');
    expect(lagos).toBeTruthy();
    expect(lagos!.path).toBe('businesses/in/lagos');
    expect(lagos!.count).toBe(MIN_LISTINGS_PER_PAGE);
  });

  it('creates a category-in-place page only when that pairing is dense', () => {
    const listings = [
      ...Array.from({ length: 3 }, () => biz('Restaurant', 'Lagos, Nigeria')),
      biz('Dental Care', 'Lagos, Nigeria'),
    ];
    const pages = discoveryPages(listings);
    expect(pages.map((p) => p.path)).toContain('businesses/restaurant/in/lagos');
    // The one-listing pairing must not produce a page.
    expect(pages.map((p) => p.path)).not.toContain('businesses/dental-care/in/lagos');
  });

  it('files sub-areas under their city', () => {
    // "Lekki, Lagos" and "Lagos, Nigeria" must not become two separate places,
    // or density is split and neither page ever qualifies.
    expect(placeOf('Lekki, Lagos')).toBe('Lekki');
    expect(placeOf('Lagos, Nigeria')).toBe('Lagos');
    expect(placeOf('')).toBe('');
    expect(placeOf(null)).toBe('');
  });

  it('produces stable, URL-safe slugs', () => {
    expect(slugify('Salon / Barber')).toBe('salon-barber');
    expect(slugify('Bar & Lounge')).toBe('bar-and-lounge');
    expect(slugify("Côte d'Ivoire")).toBe('cote-d-ivoire');
    expect(slugify('  Lagos  ')).toBe('lagos');
  });

  it('orders the densest pages first', () => {
    const listings = [
      ...Array.from({ length: 6 }, () => biz('Restaurant', 'Lagos, Nigeria')),
      ...Array.from({ length: 3 }, () => biz('Cafe', 'Accra, Ghana')),
    ];
    const pages = discoveryPages(listings);
    expect(pages[0].count).toBeGreaterThanOrEqual(pages[pages.length - 1].count);
  });

  it('titles a page the way someone would search for it', () => {
    expect(discoveryTitle({ kind: 'place', place: 'Lagos' })).toBe('Businesses in Lagos');
    expect(discoveryTitle({ kind: 'category-in-place', place: 'Lagos', category: 'Restaurant' }))
      .toBe('Restaurant in Lagos');
  });

  it('matches listings back to a page by slug', () => {
    const l = biz('Salon / Barber', 'Nairobi, Kenya');
    expect(matchesPage(l, 'nairobi')).toBe(true);
    expect(matchesPage(l, 'nairobi', 'salon-barber')).toBe(true);
    expect(matchesPage(l, 'nairobi', 'restaurant')).toBe(false);
    expect(matchesPage(l, 'lagos')).toBe(false);
  });
});

describe('relatedPlaces — where else a discovery page sends you', () => {
  /*
   * Rebuilt from what /businesses/in/lagos actually linked to on 2026-09-14,
   * including the two links that pointed at pages the site answers `noindex`.
   */
  const at = (place: string, n: number) =>
    Array.from({ length: n }, () => ({ location: `${place}, Nigeria` }));

  const directory = [
    ...at('Lagos', 40),
    ...at('Abuja', 12),
    ...at('Kaduna', 7),
    ...at('Calabar', 4),
    // Below MIN_LISTINGS_PER_PAGE: a real town, but its page is thin.
    ...at('Ikotun', 2),
    // A street address that reached the place taxonomy through
    // location.split(',')[0]. One listing, because a doorway has one.
    ...at('3, Lekki Road', 1),
  ];

  it('never links to a place too thin to have a page', () => {
    const out = relatedPlaces(directory, 'lagos');
    const paths = out.map((p) => p.path);
    // The two measured failures, by name.
    expect(paths).not.toContain('/businesses/in/ikotun');
    expect(paths).not.toContain('/businesses/in/3-lekki-road');
  });

  it('uses the same threshold the sitemap builds pages from', () => {
    /*
     * The invariant that matters: every place linked to must also be a place
     * discoveryPages() would create. A link to an unsubmitted, noindex page
     * spends crawl budget to say "never mind".
     */
    const pages = new Set(
      discoveryPages(directory.map((l) => ({ ...l, category: 'Restaurants' })))
        .filter((p) => p.kind === 'place')
        .map((p) => `/${p.path}`),
    );
    for (const p of relatedPlaces(directory, 'lagos')) {
      expect(pages, p.path).toContain(p.path);
    }
  });

  it('puts the densest place first', () => {
    // The best destination, and the one whose link is worth the most.
    const out = relatedPlaces(directory, 'lagos');
    expect(out[0].path).toBe('/businesses/in/abuja');
    expect(out.map((p) => p.count)).toEqual([...out.map((p) => p.count)].sort((a, b) => b - a));
  });

  it('never links a page to itself', () => {
    expect(relatedPlaces(directory, 'lagos').map((p) => p.path))
      .not.toContain('/businesses/in/lagos');
  });

  it('is stable — the same input gives the same order every time', () => {
    /*
     * The read behind this was unordered, so the eight links changed between
     * cache refreshes and none of them ever accumulated value. Ties break on
     * the slug for exactly this reason.
     */
    const tied = [...at('Kano', 5), ...at('Ibadan', 5), ...at('Enugu', 5)];
    const once = relatedPlaces(tied, 'lagos').map((p) => p.path);
    const again = relatedPlaces([...tied].reverse(), 'lagos').map((p) => p.path);
    expect(again).toEqual(once);
    expect(once).toEqual([
      '/businesses/in/enugu', '/businesses/in/ibadan', '/businesses/in/kano',
    ]);
  });

  it('honours the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => at(`Town${i}`, 5)).flat();
    expect(relatedPlaces(many, 'lagos')).toHaveLength(8);
    expect(relatedPlaces(many, 'lagos', 3)).toHaveLength(3);
  });

  it('ignores listings with no usable place', () => {
    const messy = [
      ...at('Abuja', 5),
      { location: null }, { location: '' }, { location: '   ' }, { location: ',,,' },
    ];
    expect(relatedPlaces(messy, 'lagos').map((p) => p.path)).toEqual(['/businesses/in/abuja']);
  });

  it('returns nothing rather than something thin', () => {
    // An empty directory links nowhere. Eight links to nothing is worse.
    expect(relatedPlaces([], 'lagos')).toEqual([]);
    expect(relatedPlaces(at('Jos', MIN_LISTINGS_PER_PAGE - 1), 'lagos')).toEqual([]);
  });
});
