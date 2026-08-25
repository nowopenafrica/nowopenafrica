import { describe, it, expect } from 'vitest';
import {
  discoveryPages, discoveryTitle, matchesPage, placeOf, slugify,
  MIN_LISTINGS_PER_PAGE,
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
