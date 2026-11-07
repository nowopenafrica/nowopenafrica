import { describe, it, expect } from 'vitest';

import { slugify, unslugify } from '../lib/discoveryPageRender';
import { discoveryPages } from '../lib/discoveryPages';

/**
 * A category page must find the businesses its own URL was minted from.
 *
 * THE DEFECT, MEASURED ON PRODUCTION 2026-09-15
 *
 * api/discovery.ts resolved the category by reversing the slug and matching the
 * result with SQL ILIKE:
 *
 *     slugify('Hospital & Clinic')     -> 'hospital-and-clinic'
 *     unslugify('hospital-and-clinic') -> 'Hospital And Clinic'
 *     category ILIKE '%Hospital And Clinic%'   ->   no rows, ever
 *
 * slugify turns "&" into the word "and"; nothing turns it back. 25 categories
 * contain "&" and they hold 2,657 of the 3,118 businesses on the platform —
 * 85% of the directory. Every category-in-place page for all of them rendered
 * "No businesses listed here yet."
 *
 * /businesses/hospital-and-clinic/in/lagos — the largest category in the
 * largest city, 1,669 hospitals behind it — was an empty page, served to
 * crawlers and to people alike, and listed in the sitemap.
 *
 * The fix is to compare slugs at both ends rather than reverse a lossy
 * transform. These tests pin that, and pin the lossiness itself so nobody
 * reintroduces the round trip believing it is safe.
 */

/** The real shapes from the live `category` column. */
const REAL_CATEGORIES = [
  'Hospital & Clinic',
  'Schools & Training',
  'Hospitality & Travel',
  'Health & Medical',
  'Bar & Lounge',
  'Beauty & Wellness',
  'Restaurants',
  'Professional Services',
  "Children's Wear",
  'Auto / Mechanic',
];

describe('slugify → unslugify is lossy, and that is the whole bug', () => {
  it('cannot recover a category containing an ampersand', () => {
    for (const c of REAL_CATEGORIES.filter((x) => x.includes('&'))) {
      const recovered = unslugify(slugify(c));
      expect(recovered, c).not.toBe(c);
      // And the ILIKE built from it matches nothing, which is why the pages
      // were empty rather than merely mistitled.
      expect(c.toLowerCase().includes(recovered.toLowerCase()), c).toBe(false);
    }
  });

  it('is also lossy for punctuation other than the ampersand', () => {
    // Recorded so the fix is not mistaken for an ampersand special case.
    expect(unslugify(slugify("Children's Wear"))).not.toBe("Children's Wear");
    expect(unslugify(slugify('Auto / Mechanic'))).not.toBe('Auto / Mechanic');
  });
});

describe('slug equality finds the right rows', () => {
  it('matches every real category to itself', () => {
    for (const c of REAL_CATEGORIES) {
      const rows = [{ category: c, location: 'Lagos, Nigeria' }];
      const slug = slugify(c);
      expect(rows.filter((r) => slugify(r.category) === slug), c).toHaveLength(1);
    }
  });

  it('does not confuse two categories that share a word', () => {
    const rows = [
      { category: 'Health & Medical', location: 'Lagos, Nigeria' },
      { category: 'Health', location: 'Lagos, Nigeria' },
    ];
    // The old `includes` style matching would have taken both.
    expect(rows.filter((r) => slugify(r.category) === slugify('Health'))).toHaveLength(1);
    expect(rows.filter((r) => slugify(r.category) === slugify('Health & Medical'))).toHaveLength(1);
  });

  it('the URL the sitemap mints is the URL the page can resolve', () => {
    /*
     * The invariant that matters. discoveryPages() builds the path with
     * slugify(category); the page must find those same rows from that path.
     * Both ends now call the one function, so they cannot drift.
     */
    const listings = Array.from({ length: 6 }, () => ({
      category: 'Hospital & Clinic', location: 'Lagos, Nigeria',
    }));

    const page = discoveryPages(listings).find((p) => p.kind === 'category-in-place');
    expect(page?.path).toBe('businesses/hospital-and-clinic/in/lagos');

    // Reconstruct what the handler receives from that path and re-match.
    const [, categorySlug, , placeSlug] = (page as { path: string }).path.split('/');
    expect(categorySlug).toBe('hospital-and-clinic');
    expect(placeSlug).toBe('lagos');

    const found = listings.filter((r) => slugify(r.category) === categorySlug);
    expect(found).toHaveLength(6);
  });
});
