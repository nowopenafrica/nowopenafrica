import { describe, it, expect } from 'vitest';
import { buildSuggestions, MIN_QUERY } from '../lib/suggest';

interface Row { name: string; kind?: string; where?: string; slug?: string }

const rows: Row[] = [
  { name: 'Lamp Post Network, Maitama', kind: 'Street Furniture', where: 'Abuja', slug: 'lamp' },
  { name: 'Lens & Light Photography', kind: 'Photography', where: 'Lagos', slug: 'lens' },
];
const places = [
  { name: 'Lagos', region: 'Nigeria' },
  { name: 'Lagos Island', region: 'Lagos, Nigeria' },
  { name: 'Ikeja', region: 'Lagos, Nigeria' },
  { name: 'Blantyre', region: 'Malawi' },
];

const src = {
  items: rows,
  name: (r: Row) => r.name,
  detail: (r: Row) => [r.kind, r.where].filter(Boolean).join(' · '),
  href: (r: Row) => `/x/${r.slug}`,
  categories: ['Photography', 'Photo Editing', 'Billboard'],
  places,
};

describe('buildSuggestions', () => {
  it('serves every page from one ranking, so the boxes cannot drift apart', () => {
    const kinds = new Set(buildSuggestions(src, 'la').map((s) => s.kind));
    expect(kinds.has('place')).toBe(true);
    expect(kinds.has('business')).toBe(true);
  });

  it('leads with an item whose own name starts with the query', () => {
    // "Lamp Post Network" and "Lagos" both score as prefix matches; the item
    // wins the tie because a name someone is part-way through typing is the
    // least ambiguous thing they can mean.
    expect(buildSuggestions(src, 'la')[0].label).toBe('Lamp Post Network, Maitama');
  });

  it('leads the places with the one that was actually typed', () => {
    const placesOnly = buildSuggestions(src, 'la').filter((s) => s.kind === 'place');
    expect(placesOnly[0].label).toBe('Lagos');
    expect(placesOnly.map((s) => s.label)).toContain('Lagos Island');
  });

  it('ranks a district of Lagos above a city that merely contains the letters', () => {
    const labels = buildSuggestions(src, 'la').map((s) => s.label);
    expect(labels.indexOf('Ikeja')).toBeLessThan(labels.indexOf('Blantyre'));
  });

  it('carries the detail line and the link', () => {
    const s = buildSuggestions(src, 'lens').find((x) => x.kind === 'business')!;
    expect(s.detail).toContain('Photography');
    expect(s.href).toBe('/x/lens');
  });

  it('works with no places at all, for a page that has no location data', () => {
    // media_services has no location column; offering a place there would be a
    // suggestion that cannot filter anything.
    const out = buildSuggestions({ ...src, places: undefined }, 'pho');
    expect(out.every((s) => s.kind !== 'place')).toBe(true);
    expect(out.some((s) => s.kind === 'category')).toBe(true);
  });

  it('stays silent below the minimum query length', () => {
    expect(MIN_QUERY).toBe(2);
    expect(buildSuggestions(src, 'l')).toEqual([]);
    expect(buildSuggestions(src, ' ')).toEqual([]);
  });

  it('never repeats a suggestion', () => {
    const out = buildSuggestions({ ...src, places: [...places, ...places] }, 'lagos');
    const keys = out.map((s) => `${s.kind}:${s.label}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('honours the limit', () => {
    expect(buildSuggestions({ ...src, limit: 3 }, 'la')).toHaveLength(3);
  });

  it('returns nothing when nothing matches', () => {
    expect(buildSuggestions(src, 'zzzz')).toEqual([]);
  });

  it('tolerates an item with no name rather than throwing', () => {
    const out = buildSuggestions({ ...src, items: [{ name: '' } as Row, ...rows] }, 'la');
    expect(out.length).toBeGreaterThan(0);
  });
});
