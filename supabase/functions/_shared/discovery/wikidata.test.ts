import { describe, it, expect } from 'vitest';
import { buildDiscoveryQuery, foldBindings, readSparqlJson, qidFromUri, parsePoint, categoryForTypes } from './wikidata';

const binding = (fields: Record<string, string>) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v }]));

const item = (qid: string, over: Record<string, string> = {}) => binding({
  item: `http://www.wikidata.org/entity/${qid}`,
  itemLabel: over.itemLabel ?? `Business ${qid}`,
  type: `http://www.wikidata.org/entity/${over.type ?? 'Q11707'}`,
  ...over,
});

describe('reading Wikidata values', () => {
  it('takes the QID out of an entity URI', () => {
    expect(qidFromUri('http://www.wikidata.org/entity/Q42')).toBe('Q42');
    expect(qidFromUri('https://www.wikidata.org/entity/Q8673')).toBe('Q8673');
    expect(qidFromUri('not a uri')).toBeNull();
  });

  it('reads a coordinate, longitude first as WKT writes it', () => {
    expect(parsePoint('Point(3.3792 6.5244)')).toEqual({ lat: 6.5244, lng: 3.3792 });
    expect(parsePoint('Point(-0.1 51.5)')).toEqual({ lat: 51.5, lng: -0.1 });
  });

  it('refuses a coordinate that is not on Earth', () => {
    expect(parsePoint('Point(200 100)')).toBeNull();
    expect(parsePoint('somewhere')).toBeNull();
    expect(parsePoint('')).toBeNull();
  });

  it('treats a malformed response as no results rather than throwing', () => {
    for (const payload of [null, undefined, {}, { results: {} }, { results: { bindings: 'x' } }, 42]) {
      expect(readSparqlJson(payload)).toEqual([]);
    }
  });
});

describe('building the SPARQL query', () => {
  it('scopes by country by default', () => {
    const q = buildDiscoveryQuery({ limit: 20 });
    expect(q).toContain('?item wdt:P17 wd:Q1033 .');
    expect(q).toContain('LIMIT 20');
    // P1329 also appears in the OPTIONAL phone binding; the CLAUSE form is the
    // require-contact requirement and must be absent.
    expect(q).not.toContain('?item wdt:P1329 ?anyPhone');
  });

  it('scopes by a validated place and refuses to interpolate a bad QID', () => {
    expect(buildDiscoveryQuery({ placeQid: 'Q8673', limit: 20 })).toContain('?item wdt:P131 wd:Q8673 .');
    expect(buildDiscoveryQuery({ placeQid: 'javascript:alert(1)', limit: 20 })).toContain('wdt:P17 wd:Q1033');
  });

  it('adds a phone clause only when contact is required', () => {
    const q = buildDiscoveryQuery({ limit: 20, requireContact: true });
    expect(q).toContain('?item wdt:P1329 ?anyPhone .');
    expect(buildDiscoveryQuery({ limit: 20 })).not.toContain('?anyPhone');
  });

  it('lists every supported type so a type outside the map can never arrive', () => {
    const q = buildDiscoveryQuery({ limit: 20 });
    expect(q).toContain('VALUES ?type { wd:Q11707 wd:Q30022');
    // A type that is NOT in TYPE_CATEGORY must never appear.
    expect(q).not.toContain('Q5 '); // human
  });

  it('clamps the LIMIT to the source-owned bounds', () => {
    expect(buildDiscoveryQuery({ limit: -3 })).toContain('LIMIT 1');
    expect(buildDiscoveryQuery({ limit: 999999 })).toContain('LIMIT 50000');
  });
});

describe('folding the cartesian product', () => {
  it('turns many rows for one item into one candidate', () => {
    const rows = [
      item('Q1', { type: 'Q11707', phone: '+2348030000001' }),
      item('Q1', { type: 'Q30022', phone: '+2348030000001' }),
      item('Q1', { type: 'Q11707', phone: '+2348030000002' }),
      item('Q1', { type: 'Q30022', phone: '+2348030000002' }),
    ];
    const out = foldBindings(rows);
    expect(out).toHaveLength(1);
    expect(out[0].phone).toBe('+2348030000001');
  });

  it('keeps every distinct item', () => {
    expect(foldBindings([item('Q1'), item('Q2'), item('Q3')])).toHaveLength(3);
  });

  it('drops items with no English label rather than publishing a QID', () => {
    expect(foldBindings([item('Q9', { itemLabel: 'Q9' })])).toHaveLength(0);
  });

  it('records per-field evidence at fold time', () => {
    const out = foldBindings([item('Q1', { phone: '+2348030000001' })]);
    expect(out[0].evidence.phone).toEqual({ method: 'api', sourceUrl: 'https://www.wikidata.org/wiki/Q1', confidence: 80 });
    expect(out[0].evidence.name).toBeDefined();
    // A field that was never set gets no evidence row.
    expect(out[0].evidence.website).toBeUndefined();
  });

  it('sorts contactable candidates first, then alphabetically', () => {
    const rows = [item('Q3', {}), item('Q1', { phone: '08030000001' }), item('Q2', { email: 'a@b.com' })];
    const out = foldBindings(rows);
    expect(out[0].qid).toBe('Q1');
    expect(out[1].qid).toBe('Q2');
    expect(out[2].qid).toBe('Q3');
  });
});

describe('categorising wikidata types', () => {
  it('maps the first listed type, by map order', () => {
    expect(categoryForTypes(['Q11707', 'Q30022'])).toBe('Restaurant');
    expect(categoryForTypes(['Q3914'])).toBe('Schools & Training');
  });

  it('falls to Other for a type that is not in the map', () => {
    expect(categoryForTypes(['Q5', 'Q4830453'])).toBe('Professional Services');
    expect(categoryForTypes([])).toBe('Other');
  });
});