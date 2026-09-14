import { describe, it, expect } from 'vitest';
import {
  buildOverpassQuery, foldOsmElements,
  AFRICA_BBOX, OSM_CATEGORY_MAP, OSM_ATTRIBUTION, OVERPASS_ENDPOINT,
  type OsmElement,
} from './osm';

const namedNode = (over: Partial<OsmElement> = {}): OsmElement => ({
  type: 'node',
  id: 101,
  lat: 6.5244,
  lon: 3.3792,
  tags: {
    amenity: 'restaurant',
    name: 'Suya Spot',
    'contact:phone': '+2348012345678',
    'contact:website': 'https://suyaspot.ng',
    'contact:email': 'hi@suyaspot.ng',
    'addr:housenumber': '12',
    'addr:street': 'Admiralty Way',
    'addr:suburb': 'Ikoyi',
    'addr:city': 'Lagos',
    'addr:postcode': '101233',
    opening_hours: 'Mo-Su 08:00-22:00',
    cuisine: 'suya',
  },
  ...over,
});

describe('OSM companion constants', () => {
  it('documents the overpass endpoint and attribution that must travel', () => {
    expect(OVERPASS_ENDPOINT).toBe('https://overpass-api.de/api/interpreter');
    expect(OSM_ATTRIBUTION).toContain('OpenStreetMap');
    expect(OSM_ATTRIBUTION).toContain('odbl');
  });

  it('covers the campaign-builder countries with bboxes', () => {
    for (const c of ['Nigeria', 'Ghana', 'Kenya', 'South Africa', "Côte d'Ivoire"]) {
      expect(AFRICA_BBOX[c]).toBeTruthy();
    }
  });

  it('maps the tags the campaign builder offers to nowopen categories', () => {
    expect(OSM_CATEGORY_MAP.restaurant).toBe('Restaurant');
    expect(OSM_CATEGORY_MAP.fuel).toBe('Automotive');
  });
});

describe('buildOverpassQuery', () => {
  it('asks for named, contactable businesses across node/way/relation in a bbox', () => {
    const q = buildOverpassQuery({ bbox: AFRICA_BBOX['Nigeria'], limit: 40 });
    expect(q).toContain('[out:json]');
    expect(q).toContain('(bbox:4.0,  2.7,  14.0, 14.7)');
    expect(q).toContain('node');
    expect(q).toContain('way');
    expect(q).toContain('relation');
    expect(q).toContain('"name"');
    expect(q).toContain('"phone"~".+"');
    expect(q).toContain('out body;');
  });

  it('excludes region markers instead of treating them as businesses', () => {
    const q = buildOverpassQuery({ bbox: AFRICA_BBOX['Nigeria'], limit: 40 });
    // The exclusion list rides bare tokens, not tagged predicates: parking,
    // townhall etc. must never appear as a requested type.
    expect(q).not.toContain('"parking"');
    expect(q).not.toContain('"townhall"');
    expect(q).not.toContain('"place_of_worship"');
  });

  it('narrows to the category OSM tags when one is given', () => {
    const q = buildOverpassQuery({ bbox: AFRICA_BBOX['Kenya'], category: 'restaurant', limit: 10 });
    expect(q).toContain('"amenity"="restaurant"');
    expect(q).toContain('"fast_food"');
  });

  it('never reads images', () => {
    const q = buildOverpassQuery({ bbox: AFRICA_BBOX['Nigeria'], limit: 40 });
    expect(q).not.toContain('image');
  });
});

describe('foldOsmElements', () => {
  it('folds a tagged node into a ready radar candidate', () => {
    const [c] = foldOsmElements([namedNode()], 10);
    expect(c.sourceRecordId).toBe('node/101');
    expect(c.sourceUrl).toBe('https://www.openstreetmap.org/node/101');
    expect(c.name).toBe('Suya Spot');
    expect(c.category).toBe('Restaurant');
    expect(c.phone).toBe('+2348012345678');
    expect(c.website).toBe('https://suyaspot.ng');
    expect(c.email).toBe('hi@suyaspot.ng');
    expect(c.address).toBe('12, Admiralty Way, Ikoyi');
    expect(c.city).toBe('Lagos');
    expect(c.latitude).toBe(6.5244);
    expect(c.longitude).toBe(3.3792);
    expect(c.profile.opening_hours).toBe('Mo-Su 08:00-22:00');
    expect(c.profile.postcode).toBe('101233');
    expect(c.profile.cuisine).toBe('suya');
  });

  it('records how every populated field was obtained (never an unsourced value)', () => {
    const [c] = foldOsmElements([namedNode()], 10);
    for (const f of ['name', 'category', 'address', 'city', 'phone', 'website', 'email']) {
      expect(c.evidence[f]).toMatchObject({ method: 'structured_data', confidence: 80, sourceUrl: 'https://www.openstreetmap.org/node/101' });
    }
    // description and whatsapp are absent — they must not silently gain evidence.
    expect(c.evidence.description).toBeUndefined();
    expect(c.evidence.whatsapp).toBeUndefined();
  });

  it('takes no images even when a node references one', () => {
    const [c] = foldOsmElements([namedNode({ tags: { ...namedNode().tags, image: 'https://commons.example/suya.jpg' } })], 10);
    expect(c.profile.image).toBeUndefined();
    expect(c.evidence.image).toBeUndefined();
  });

  it('falls back to the plain phone/website/email tags and unmapped names to Other', () => {
    const [c] = foldOsmElements([{
      type: 'node', id: 7,
      tags: { shop: 'vape_shop', name: 'Cloud House', phone: '08022222222', website: 'cloud.example', note: 'night shop' },
    }], 10);
    expect(c.category).toBe('Other');
    expect(c.phone).toBe('08022222222');
    expect(c.website).toBe('cloud.example');
    expect(c.description).toBe('night shop');
    expect(c.evidence.description).toMatchObject({ method: 'structured_data' });
  });

  it('keeps coordinates null for a way without its own centre', () => {
    const [c] = foldOsmElements([{ type: 'way', id: 55, tags: { shop: 'tailor', name: 'Baba Tailor', phone: '08033333333' } }], 10);
    expect(c.latitude).toBeNull();
    expect(c.longitude).toBeNull();
  });

  it('deduplicates repeated elements by type/id and honours the limit', () => {
    const dupes = [namedNode(), namedNode({ id: 101 })];
    const [c] = foldOsmElements(dupes, 10);
    expect(c.sourceRecordId).toBe('node/101');
    expect(foldOsmElements(dupes, 10)).toHaveLength(1);

    const twoNodes = [namedNode({ id: 1 }), namedNode({ id: 2, tags: { ...namedNode().tags, name: 'Chicken Ring' } })];
    expect(foldOsmElements(twoNodes, 1)).toHaveLength(1);
  });

  it('drops unnamed elements entirely', () => {
    expect(foldOsmElements([{ type: 'node', id: 9, tags: { amenity: 'bench' } }], 10)).toHaveLength(0);
  });
});