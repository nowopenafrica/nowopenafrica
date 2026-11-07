/**
 * Related categories and places on a search.
 *
 * The assertions that matter are about never offering a dead end: a facet
 * with nothing behind it sends somebody from one empty page to another, which
 * is worse than showing them nothing at all.
 */

import { describe, it, expect } from 'vitest';

import { relatedFacets, hasFacets, type FacetSource } from './relatedFacets';

const DIRECTORY: FacetSource[] = [
  { name: 'Ada Fabrics', category: 'Retail', location: 'Lekki, Lagos', description: 'Tailoring' },
  { name: 'Bola Styles', category: 'Retail', location: 'Yaba, Lagos', description: 'Ankara' },
  { name: 'St Nicholas', category: 'Hospital & Clinic', location: 'Lagos Island', description: 'General hospital' },
  { name: 'Reddington', category: 'Hospital & Clinic', location: 'Victoria Island', description: 'Private clinic' },
  { name: 'Lagoon Hospital', category: 'Hospital & Clinic', location: 'Ikoyi', description: 'Surgery' },
  { name: 'Chop Life', category: 'Restaurant', location: 'Lekki, Lagos', description: 'Jollof' },
];

describe('it rescues a search that would otherwise dead-end', () => {
  it('offers a category the query names, even when no business is called that', () => {
    /*
     * The case this exists for: "hospital" matched business NAMES only, so a
     * directory holding 1,769 businesses under "Hospital & Clinic" showed
     * "No businesses match your filters".
     */
    const f = relatedFacets(DIRECTORY, 'hospital');
    expect(f.categories[0]).toEqual({ value: 'Hospital & Clinic', count: 3 });
  });

  it('offers a place the query names', () => {
    const f = relatedFacets(DIRECTORY, 'lekki');
    expect(f.locations.map((x) => x.value)).toContain('Lekki, Lagos');
  });
});

describe('it never offers an empty page', () => {
  it('returns nothing for a query that matches nothing', () => {
    const f = relatedFacets(DIRECTORY, 'zzzqqq');
    expect(hasFacets(f)).toBe(false);
  });

  it('every facet it returns has at least one business behind it', () => {
    for (const q of ['hospital', 'lagos', 'retail', 'a']) {
      for (const facet of [...relatedFacets(DIRECTORY, q).categories, ...relatedFacets(DIRECTORY, q).locations]) {
        expect(facet.count, `${q} → ${facet.value}`).toBeGreaterThan(0);
      }
    }
  });

  it('returns nothing when there is no query', () => {
    // With no query there is no "related" — only the filters already on screen.
    expect(hasFacets(relatedFacets(DIRECTORY, ''))).toBe(false);
    expect(hasFacets(relatedFacets(DIRECTORY, '   '))).toBe(false);
  });
});

describe('what it counts', () => {
  it('counts a business under its own facet when it matched the text', () => {
    // "jollof" is in a description; the useful related facet is its category.
    const f = relatedFacets(DIRECTORY, 'jollof');
    expect(f.categories).toEqual([{ value: 'Restaurant', count: 1 }]);
  });

  it('puts the biggest facet first — the one most likely to hold the answer', () => {
    const f = relatedFacets(DIRECTORY, 'lagos');
    const counts = f.locations.map((x) => x.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('does not re-offer a filter already applied', () => {
    // Offering the facet somebody is already inside is pure noise.
    const f = relatedFacets(DIRECTORY, 'hospital', { category: 'Hospital & Clinic' });
    expect(f.categories.map((x) => x.value)).not.toContain('Hospital & Clinic');
  });

  it('caps the strip so it stays scannable', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      name: `Shop ${i}`, category: `Category ${i}`, location: `Place ${i}`, description: 'widget',
    }));
    const f = relatedFacets(many, 'widget', {}, 6);
    expect(f.categories).toHaveLength(6);
    expect(f.locations).toHaveLength(6);
  });

  it('ignores blank categories and locations rather than offering an empty chip', () => {
    const messy: FacetSource[] = [
      { name: 'Widget Co', category: '', location: '   ', description: 'widget' },
      { name: 'Other', category: null, location: null, description: 'widget' },
    ];
    const f = relatedFacets(messy, 'widget');
    expect(hasFacets(f)).toBe(false);
  });

  it('matches case-insensitively, as a person types', () => {
    expect(relatedFacets(DIRECTORY, 'HOSPITAL').categories[0].value).toBe('Hospital & Clinic');
  });
});
