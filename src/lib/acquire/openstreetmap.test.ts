import { describe, it, expect } from 'vitest';
import {
  buildOverpassQuery,
  foldOsmElements,
  OSM_CATEGORY_MAP,
  AFRICA_BBOX,
  OSM_SOURCE_KEY,
} from '../acquire/openstreetmap';

/**
 * The Overpass adapter produces candidates from OpenStreetMap's structured data.
 *
 * Each test is a shape a real OSM node actually has: a named restaurant with
 * a phone, a school with only a website, a shop with no contact at all.
 */

describe('OpenStreetMap adapter', () => {
  it('exports a valid source key', () => {
    expect(OSM_SOURCE_KEY).toBe('openstreetmap');
  });

  it('covers at least 30 African countries in the bbox lookup', () => {
    expect(Object.keys(AFRICA_BBOX).length).toBeGreaterThanOrEqual(30);
    // Every value is a comma-separated bbox string.
    for (const bbox of Object.values(AFRICA_BBOX)) {
      expect(bbox.split(',').length).toBe(4);
    }
  });

  it('maps at least 50 OSM tags to NowOpen categories', () => {
    expect(Object.keys(OSM_CATEGORY_MAP).length).toBeGreaterThanOrEqual(50);
    // Every value is a non-empty string.
    for (const cat of Object.values(OSM_CATEGORY_MAP)) {
      expect(cat.length).toBeGreaterThan(0);
    }
  });

  it('produces a syntactically valid Overpass QL query', () => {
    const q = buildOverpassQuery({
      bbox: '4.0, 2.7, 14.0, 14.7',
      limit: 100,
    });
    expect(q).toContain('[out:json]');
    expect(q).toContain('bbox:4.0, 2.7, 14.0, 14.7');
    expect(q).toContain('node');
    expect(q).toContain('out body');
  });

  it('narrows the query when an OSM tag is given as category', () => {
    const q = buildOverpassQuery({
      bbox: '4.0, 2.7, 14.0, 14.7',
      category: 'restaurant',
      limit: 50,
    });
    expect(q).toContain('"amenity"="restaurant"');
    expect(q).toContain('"shop"="restaurant"');
  });

  it('adds an exclusion filter when IDs are provided', () => {
    const q = buildOverpassQuery({
      bbox: '4.0, 2.7, 14.0, 14.7',
      limit: 50,
      excludeIds: ['N12345', 'N67890'],
    });
    expect(q).toContain('node(id:N12345,N67890)');
  });
});

describe('foldOsmElements', () => {
  it('folds nodes into candidates with coordinates and evidence', () => {
    const elements = [
      {
        type: 'node',
        id: 1001,
        lat: 6.5244,
        lon: 3.3792,
        tags: {
          name: 'Mama Put Lounge',
          amenity: 'restaurant',
          'contact:phone': '+2348012345678',
          website: 'https://mapaput.ng',
          'addr:city': 'Lagos',
          'addr:street': 'Broad Street',
          opening_hours: 'Mo-Fr 09:00-18:00',
        },
      },
    ];

    const result = foldOsmElements(elements, 50);
    expect(result).toHaveLength(1);

    const c = result[0];
    expect(c.name).toBe('Mama Put Lounge');
    expect(c.category).toBe('Restaurant');
    expect(c.phone).toBe('+2348012345678');
    expect(c.website).toBe('https://mapaput.ng');
    expect(c.city).toBe('Lagos');
    expect(c.address).toBe('Broad Street');
    expect(c.latitude).toBe(6.5244);
    expect(c.longitude).toBe(3.3792);
    expect(c.profile.opening_hours).toBe('Mo-Fr 09:00-18:00');
    expect(c.sourceKey).toBe('openstreetmap');
    expect(c.sourceRecordId).toBe('node/1001');
    expect(c.sourceUrl).toBe('https://www.openstreetmap.org/node/1001');
    expect(c.evidence.name).toBeDefined();
    expect(c.evidence.phone).toBeDefined();
  });

  it('skips elements without a name', () => {
    const elements = [
      { type: 'node', id: 2001, lat: 6.5, lon: 3.3, tags: { amenity: 'restaurant' } },
    ];
    expect(foldOsmElements(elements, 50)).toHaveLength(0);
  });

  it('uses shop tag when amenity is absent', () => {
    const elements = [
      {
        type: 'node',
        id: 3001,
        lat: 6.5,
        lon: 3.3,
        tags: { name: ' Fashion Hub', shop: 'clothes' },
      },
    ];
    const result = foldOsmElements(elements, 50);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('Retail Store');
  });

  it('respects the limit', () => {
    const elements = Array.from({ length: 20 }, (_, i) => ({
      type: 'node' as const,
      id: 4000 + i,
      lat: 6.5,
      lon: 3.3,
      tags: { name: `Shop ${i}`, shop: 'electronics' },
    }));
    expect(foldOsmElements(elements, 5).length).toBeLessThanOrEqual(5);
  });

  it('deduplicates by osm id', () => {
    const elements = [
      { type: 'node', id: 5001, lat: 6.5, lon: 3.3, tags: { name: 'Cafe' } },
      { type: 'node', id: 5001, lat: 6.5, lon: 3.3, tags: { name: 'Cafe' } },
    ];
    expect(foldOsmElements(elements, 50)).toHaveLength(1);
  });

  it('prefers contact:phone over phone', () => {
    const elements = [
      {
        type: 'node',
        id: 6001,
        lat: 6.5,
        lon: 3.3,
        tags: { name: 'Bank', amenity: 'bank', 'contact:phone': '+2349011111111', phone: '+2348022222222' },
      },
    ];
    const result = foldOsmElements(elements, 50);
    expect(result[0].phone).toBe('+2349011111111');
  });

  it('falls back to phone when contact:phone is absent', () => {
    const elements = [
      {
        type: 'node',
        id: 7001,
        lat: 6.5,
        lon: 3.3,
        tags: { name: 'Pharmacy', amenity: 'pharmacy', phone: '08012345678' },
      },
    ];
    const result = foldOsmElements(elements, 50);
    expect(result[0].phone).toBe('08012345678');
  });
});
