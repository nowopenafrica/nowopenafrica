import { describe, it, expect } from 'vitest';
/*
 * ── WHY THESE ASSERT AGAINST THE MAP, NOT AGAINST LITERALS ──────────────
 *
 * This file used to hardcode the ids: `['Q8673', 'Q1700']` for Lagos+Abuja,
 * `['Q8673', 'Q15624']` for Lagos+Port Harcourt, `['Q3719']` for Dakar.
 *
 * Every one of those was WRONG, and the tests passed for months because they
 * asserted the same wrong constant the source held. Q1700 is Münsterland in
 * Germany; Q15624 is Molins de Rei in Catalonia; Q3719 is the US National
 * Register of Historic Places. A campaign scoped to Port Harcourt harvested
 * Catalan buildings, fifteen of which reached the live directory.
 *
 * A test that repeats a constant proves only that the constant has not
 * changed. Whether an id names the place it claims to is a question for
 * Wikidata, and it is asked by `npm run check:place-qids` — which is why that
 * script exists rather than more assertions here. These now check the PLUMBING
 * (that the named city resolves to whatever the map holds) and leave the
 * correctness of the map to the thing that can actually verify it.
 */
import { PLACE_QIDS } from './plan.ts';
import { buildPlan, recordMatchesFilters, PLACE_QIDS, COUNTRY_QIDS, DEFAULT_RUN_BUDGET, MAX_RUN_BUDGET } from './plan';

const request = (over: Partial<Parameters<typeof buildPlan>[0]> = {}): Parameters<typeof buildPlan>[0] => ({
  sourceKeys: ['wikidata'],
  cities: [],
  regions: [],
  countries: [],
  categories: [],
  filters: {},
  maxRecords: null,
  dailyLimit: null,
  ...over,
});

describe('buildPlan geography', () => {
  it('falls back to Nigeria (Q1033) when nothing maps', () => {
    const p = buildPlan(request({ cities: ['Nowhere City'], countries: ['Atlantis'] }));
    expect(p.placeQids).toEqual([]);
    expect(p.countryQid).toBe('Q1033');
  });

  it('maps known cities to place scopes and known countries to the fallback scope', () => {
    const p = buildPlan(request({ cities: ['Lagos', 'Abuja'], countries: ['Ghana'] }));
    expect(p.placeQids).toEqual(['Q8673', PLACE_QIDS.Abuja]);
    // countryQid is always resolved from a known country so a run that falls
    // back (e.g. only unknown cities later) lands somewhere truthful.
    expect(p.countryQid).toBe('Q117');
  });

  it('prefers a matched city over a matched country — specificity wins', () => {
    const p = buildPlan(request({ cities: ['Lagos'], countries: ['Kenya'] }));
    expect(p.placeQids).toEqual(['Q8673']);
  });

  it('never guesses a QID that is not on the map', () => {
    const p = buildPlan(request({ cities: ['Dakar', 'Unknown Town'] }));
    expect(p.placeQids).toEqual([PLACE_QIDS.Dakar]);
    expect(p.countryQid).toBe('Q1033');
  });

  it('carries the names alongside the QIDs so OSM scopes resolve', () => {
    const p = buildPlan(request({ cities: ['Lagos', 'Port Harcourt'], countries: ['Ghana'] }));
    expect(p.placeNames).toEqual(['Lagos', 'Port Harcourt']);
    expect(p.placeQids).toEqual(['Q8673', PLACE_QIDS['Port Harcourt']]);
    expect(p.countryName).toBe('Ghana');
    expect(p.countryQid).toBe('Q117');
  });

  it('names Nigeria as the default country scope when nothing maps', () => {
    const p = buildPlan(request({ cities: ['Nowhere City'], countries: ['Atlantis'] }));
    expect(p.countryName).toBe('Nigeria');
    expect(p.countryQid).toBe('Q1033');
    expect(p.placeNames).toEqual([]);
  });

  it('recognises the cities and countries the campaign builder offers', () => {
    expect(PLACE_QIDS['Port Harcourt']).toBeDefined();
    expect(COUNTRY_QIDS['South Africa']).toBeDefined();
    expect(COUNTRY_QIDS['Côte d\'Ivoire']).toBeDefined();
  });
});

describe('buildPlan budget', () => {
  it('defaults to a modest run budget and caps the headroom', () => {
    expect(DEFAULT_RUN_BUDGET).toBe(40);
    expect(MAX_RUN_BUDGET).toBe(500);
  });

  it('uses max_records, else daily_limit, else the default', () => {
    expect(buildPlan(request({ maxRecords: 120 })).sourceShares[0].limit).toBe(120);
    expect(buildPlan(request({ maxRecords: null, dailyLimit: 60 })).sourceShares[0].limit).toBe(60);
    expect(buildPlan(request({})).sourceShares[0].limit).toBe(DEFAULT_RUN_BUDGET);
  });

  it('splits the budget across sources and across matched places', () => {
    const p = buildPlan(request({ sourceKeys: ['wikidata', 'osm'], maxRecords: 60, cities: ['Lagos', 'Abuja'] }));
    // 60/2 sources = 30, then /2 places = 15 per fetch.
    expect(p.sourceShares).toEqual([
      { sourceKey: 'wikidata', limit: 15 },
      { sourceKey: 'osm', limit: 15 },
    ]);
  });

  it('clamps an enormous request to the run ceiling', () => {
    expect(buildPlan(request({ maxRecords: 99999 })).sourceShares[0].limit).toBe(MAX_RUN_BUDGET);
  });

  it('a campaign with no sources plans zero work', () => {
    const p = buildPlan(request({ sourceKeys: [] }));
    expect(p.sourceShares).toEqual([]);
  });
});

describe('buildPlan filters — applied vs deferred', () => {
  it('enforces the source-truth filters on records', () => {
    const p = buildPlan(request({ filters: { has_phone: true, has_email: true, has_website: false } }));
    expect(p.filtersApplied).toEqual(['has_phone', 'has_email']);
    expect(p.requireContact).toBe(true);
  });

  it('turns phone/email contact demands into the query-level phone clause', () => {
    const p = buildPlan(request({ filters: { has_email: true } }));
    expect(p.requireContact).toBe(false); // email is not query-level for wikidata
    expect(p.filtersApplied).toEqual(['has_email']);
  });

  it('names every unanswerable filter and why, instead of pretending', () => {
    const p = buildPlan(request({
      filters: {
        has_whatsapp: true,
        no_existing_profile: true,
        has_logo: true,
        min_confidence: 70,
      },
    }));
    const deferred = new Map(p.filtersDeferred.map((d) => [d.filter, d.why]));
    expect(deferred.has('no_existing_profile')).toBe(true);
    expect(deferred.has('has_logo')).toBe(true);
    expect(deferred.has('min_confidence')).toBe(true);
    expect(deferred.get('has_whatsapp')).toContain('proxy');
    for (const why of p.filtersDeferred.map((d) => d.why)) expect(why.length).toBeGreaterThan(10);
  });
});

describe('recordMatchesFilters', () => {
  const record = {
    phone: '+2348012345678',
    email: 'a@b.ng',
    website: 'https://b.ng',
    address: '12 Admiralty',
    city: 'Lagos',
    latitude: 6.5,
    longitude: 3.37,
    profile: { instagram: 'yemzo' },
  };

  it('keeps a record that satisfies every applied filter', () => {
    expect(recordMatchesFilters(record, { has_phone: true, has_social: true }).keep).toBe(true);
  });

  it('drops the record at the first failing filter with the filter named', () => {
    const v = recordMatchesFilters({ ...record, phone: null }, { has_phone: true });
    expect(v).toMatchObject({ keep: false, reason: 'has_phone: no dialable phone recorded' });
  });

  it('treats has_whatsapp as requiring a dialable phone (the documented proxy)', () => {
    expect(recordMatchesFilters(record, { has_whatsapp: true }).keep).toBe(true);
    expect(recordMatchesFilters({ ...record, phone: '' }, { has_whatsapp: true }).keep).toBe(false);
  });

  it('only ever enforces filters buildPlan would have listed as applied', () => {
    // min_confidence is deferring to the review queue — the worker must NOT
    // drop records on it here.
    expect(recordMatchesFilters(record, { min_confidence: 99 }).keep).toBe(true);
  });
});
/*
 * ── A COUNTRY NAMED AND NOT UNDERSTOOD ───────────────────────────────────
 *
 * MEASURED 2026-10-06: the live campaign stored `countries: ['NG']` while
 * COUNTRY_QIDS is keyed by full names. Nothing matched, the fallback made it
 * Nigeria, and the campaign swept the right country entirely by luck.
 *
 * The same campaign scoped to Ghana as ['GH'] would have swept NIGERIA and
 * staged Nigerian businesses under a Ghanaian campaign — reporting success
 * throughout. Same shape as the Wikidata id that turned Port Harcourt into a
 * town in Catalonia.
 */
describe('an unresolved country is reported, not silently swapped', () => {
  it('reports a country code it cannot resolve', () => {
    const plan = buildPlan({
      sourceKeys: ['wikidata'], cities: [], regions: [], countries: ['GH'],
      categories: [], filters: {}, maxRecords: 10, dailyLimit: 10,
    });
    expect(plan.unmatchedCountries).toEqual(['GH']);
  });

  it('resolves a full country name and reports nothing unmatched', () => {
    const plan = buildPlan({
      sourceKeys: ['wikidata'], cities: [], regions: [], countries: ['Ghana'],
      categories: [], filters: {}, maxRecords: 10, dailyLimit: 10,
    });
    expect(plan.unmatchedCountries).toEqual([]);
    expect(plan.countryName).toBe('Ghana');
    // And it is actually Ghana, not the Nigeria fallback wearing the name.
    expect(plan.countryQid).toBe(COUNTRY_QIDS['Ghana']);
  });

  it('does not treat "no country named" as an error', () => {
    // Nigeria is the launch market and a legitimate default when nobody asked
    // for anywhere. It is only wrong as a substitute for a country that WAS
    // asked for.
    const plan = buildPlan({
      sourceKeys: ['wikidata'], cities: ['Lagos'], regions: [], countries: [],
      categories: [], filters: {}, maxRecords: 10, dailyLimit: 10,
    });
    expect(plan.unmatchedCountries).toEqual([]);
    expect(plan.countryName).toBe('Nigeria');
  });
});
