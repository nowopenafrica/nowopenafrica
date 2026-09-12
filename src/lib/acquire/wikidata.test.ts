import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  buildDiscoveryQuery, foldBindings, readSparqlJson, qidFromUri, parsePoint,
  categoryForTypes, TYPE_CATEGORY, WIKIDATA_TYPES, WIKIDATA_SPARQL,
  WIKIDATA_USER_AGENT, WIKIDATA_SOURCE_KEY,
} from './wikidata';
import { sourcePermits } from './adapter';

/**
 * The first authorised source.
 *
 * Two things here would do real damage if they broke, and neither would show
 * up as an error:
 *
 *   THE FOLD. SPARQL returns the cartesian product of every optional value, so
 *   one café with two types and two phone numbers arrives as eight rows.
 *   Measured against the live endpoint: 60 rows folded to 25 businesses.
 *   Without the fold the review queue fills with duplicates of the same shop.
 *
 *   THE QUERY BUILDER. It composes text sent to a query engine on somebody
 *   else's servers, under a licence we are relying on. Anything a caller can
 *   inject there is an abuse of a source that has been generous.
 */

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
    // Point(lng lat) — getting this backwards puts Lagos in the Arctic.
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
    // First value wins, so a later row cannot overwrite what is already there.
    expect(out[0].phone).toBe('+2348030000001');
  });

  it('keeps every distinct item', () => {
    expect(foldBindings([item('Q1'), item('Q2'), item('Q3')])).toHaveLength(3);
  });

  it('does not let a later row blank a field an earlier one filled', () => {
    const out = foldBindings([
      item('Q1', { website: 'https://a.test' }),
      item('Q1', {}),
    ]);
    expect(out[0].website).toBe('https://a.test');
  });

  it('skips an item whose only label is its own QID', () => {
    /*
     * Wikidata returns the QID as the label when no English label exists.
     * Publishing a business called "Q124315" is worse than publishing nothing,
     * and a reviewer should not have to catch it.
     */
    const out = foldBindings([
      item('Q124315', { itemLabel: 'Q124315' }),
      item('Q7', { itemLabel: 'Real Cafe' }),
    ]);
    expect(out.map((c) => c.name)).toEqual(['Real Cafe']);
  });

  it('strips a mailto: prefix from an email', () => {
    expect(foldBindings([item('Q1', { email: 'mailto:hi@shop.ng' })])[0].email).toBe('hi@shop.ng');
  });

  it('records evidence for every field it filled, and none for the empty ones', () => {
    // §8: how we know a value has to be recorded at the moment of extraction,
    // because it cannot be recovered afterwards.
    const out = foldBindings([item('Q1', { phone: '+2348030000001' })]);
    const evidence = out[0].evidence;
    expect(evidence.name?.method).toBe('api');
    expect(evidence.phone?.method).toBe('api');
    expect(evidence.website).toBeUndefined();
    expect(evidence.name?.sourceUrl).toBe('https://www.wikidata.org/wiki/Q1');
  });

  it('never invents an image', () => {
    /*
     * Wikidata's DATA is CC0; the photograph it links to on Commons is not —
     * those are licensed per file. A candidate must not carry one.
     */
    const out = foldBindings([item('Q1', { image: 'https://commons.example/x.jpg' })]);
    expect(JSON.stringify(out[0])).not.toContain('commons');
    expect((out[0] as unknown as Record<string, unknown>).image_url).toBeUndefined();
  });

  it('puts contactable businesses first', () => {
    const out = foldBindings([
      item('Q1', { itemLabel: 'A No Contact' }),
      item('Q2', { itemLabel: 'Z Has Phone', phone: '+2348030000001' }),
    ]);
    expect(out.map((c) => c.name)).toEqual(['Z Has Phone', 'A No Contact']);
  });

  it("keeps social handles for the importer's normaliser to turn into links", () => {
    const out = foldBindings([item('Q1', { instagram: 'kunle_eats', twitter: 'kunle' })]);
    expect(out[0].profile).toEqual({ instagram: 'kunle_eats', twitter: 'kunle' });
  });
});

describe('categories', () => {
  it('maps a Wikidata type onto a NowOpen category', () => {
    expect(categoryForTypes(['Q27686'])).toBe('Hotel & Lodging');
    expect(categoryForTypes(['Q22687'])).toBe('Banking & Finance');
  });

  it("resolves a multi-type item by the map's own order", () => {
    // A restaurant that is also a cafeteria is a restaurant.
    expect(categoryForTypes(['Q30022', 'Q11707'])).toBe(TYPE_CATEGORY.Q11707);
  });

  it('falls back to Other rather than dropping an unmapped type', () => {
    // By this point the query has already restricted the types, so an unmapped
    // one means the map is behind the query — a reviewer choosing beats the
    // candidate vanishing.
    expect(categoryForTypes(['Q999999999'])).toBe('Other');
    expect(categoryForTypes([])).toBe('Other');
  });
});

describe('the query builder', () => {
  it('asks for the types it maps, and no others', () => {
    const q = buildDiscoveryQuery({ limit: 10 });
    for (const t of WIKIDATA_TYPES) expect(q).toContain(`wd:${t}`);
  });

  it('refuses anything that is not a QID', () => {
    /*
     * The one place user input meets a query sent to somebody else's servers.
     * A rejected value falls back to the country default rather than being
     * interpolated.
     */
    for (const evil of ['Q8673 } INSERT DATA {', '"; DROP TABLE', '../../etc', 'Q1 . ?x ?y ?z']) {
      const q = buildDiscoveryQuery({ placeQid: evil, limit: 5 });
      expect(q, evil).not.toContain(evil);
      expect(q, evil).toContain('wdt:P17 wd:Q1033');
    }

    // Merely invalid, rather than hostile: same fallback, no interpolation.
    for (const bad of ['Q', '', 'q8673', 'Q-1', '8673']) {
      expect(buildDiscoveryQuery({ placeQid: bad, limit: 5 }), bad)
        .toContain('wdt:P17 wd:Q1033');
    }
  });

  it('clamps the limit and offset', () => {
    expect(buildDiscoveryQuery({ limit: 100000 })).toContain('LIMIT 50000');
    expect(buildDiscoveryQuery({ limit: -5 })).toContain('LIMIT 1');
    expect(buildDiscoveryQuery({ limit: 10, offset: -20 })).toContain('OFFSET 0');
  });

  it('scopes to a place when given a valid one', () => {
    const q = buildDiscoveryQuery({ placeQid: 'Q8673', limit: 10 });
    expect(q).toContain('wdt:P131 wd:Q8673');
  });

  it('can require a phone number', () => {
    expect(buildDiscoveryQuery({ limit: 10, requireContact: true })).toContain('wdt:P1329');
  });

  it('excludes already-offered items via FILTER NOT IN', () => {
    const q = buildDiscoveryQuery({ limit: 10, exclude: ['Q8673', 'Q42', 'garbage', 'Q8673'] });
    expect(q).toContain('FILTER(?item NOT IN (wd:Q8673, wd:Q42))');
    expect(q).not.toContain('garbage');
  });

  it('omits the exclusion clause when nothing is excluded', () => {
    expect(buildDiscoveryQuery({ limit: 10 })).not.toContain('FILTER(?item NOT IN');
    expect(buildDiscoveryQuery({ limit: 10, exclude: [] })).not.toContain('FILTER(?item NOT IN');
  });
});

describe('the source is authorised, and says how', () => {
  const sql = readFileSync(
    'supabase/migrations/20260908230000_authorise_wikidata_source.sql',
    'utf8',
  );

  it('registers wikidata as active with every right permitted', () => {
    expect(sql).toContain("'wikidata'");
    expect(sql).toMatch(/'permitted', 'permitted', 'permitted', 'permitted'/);
    expect(sql).toContain('CC0 1.0 Universal');
  });

  it('names who authorised it, because sourcePermits refuses a blank', () => {
    expect(sql).toMatch(/authorised_by[\s\S]{0,400}Founder, NowOpen Africa/);

    // And the gate agrees, given that row.
    const verdict = sourcePermits({
      key: WIKIDATA_SOURCE_KEY,
      name: 'Wikidata',
      active: true,
      automatedAccess: 'permitted',
      bulkExtraction: 'permitted',
      redistribution: 'permitted',
      competingDataset: 'permitted',
      licence: 'CC0 1.0',
      authorisedBy: 'Founder, NowOpen Africa (2026-09-08)',
    }, 'discover');
    expect(verdict.permitted).toBe(true);
  });

  it('refuses the same source the moment authorisation is removed', () => {
    for (const missing of [null, '', '   ']) {
      const verdict = sourcePermits({
        key: WIKIDATA_SOURCE_KEY, name: 'Wikidata', active: true,
        automatedAccess: 'permitted', bulkExtraction: 'permitted',
        redistribution: 'permitted', competingDataset: 'permitted',
        licence: 'CC0 1.0', authorisedBy: missing,
      }, 'discover');
      expect(verdict.permitted).toBe(false);
    }
  });

  it('leaves OpenStreetMap inactive, with the share-alike question written down', () => {
    /*
     * ODbL obliges anyone publicly using a derivative database to offer it
     * under ODbL. For a directory whose data is the asset that is a decision
     * about the company, so the row records the question rather than assuming
     * an answer.
     */
    expect(sql).toContain("'openstreetmap'");
    expect(sql).toMatch(/ODbL/);
    expect(sql).toMatch(/share-alike/i);
    expect(sql).toMatch(/NOT ENABLED/);
  });
});

describe('how it talks to the source', () => {
  it('sends a User-Agent that identifies NowOpen and how to reach it', () => {
    // Wikimedia asks for this, and honouring a source's stated conditions is
    // the entire basis on which it is authorised.
    expect(WIKIDATA_USER_AGENT).toContain('nowopenafrica.com');
    expect(WIKIDATA_USER_AGENT).toMatch(/@/);
  });

  it('talks to exactly one endpoint', () => {
    expect(WIKIDATA_SPARQL).toBe('https://query.wikidata.org/sparql');
  });

  it('is fetched server-side, where a User-Agent can actually be set', () => {
    const fn = readFileSync('api/acquire/wikidata.ts', 'utf8');
    expect(fn).toContain('WIKIDATA_USER_AGENT');
    // And it must not write: discovery proposes, a person disposes.
    expect(fn).not.toMatch(/\.insert\(|\.update\(|service_role/i);
  });
});
