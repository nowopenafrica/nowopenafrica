import { describe, it, expect } from 'vitest';
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
    expect(p.placeQids).toEqual(['Q8673', 'Q1700']);
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
    expect(p.placeQids).toEqual(['Q3719']);
    expect(p.countryQid).toBe('Q1033');
  });

  it('carries the names alongside the QIDs so OSM scopes resolve', () => {
    const p = buildPlan(request({ cities: ['Lagos', 'Port Harcourt'], countries: ['Ghana'] }));
    expect(p.placeNames).toEqual(['Lagos', 'Port Harcourt']);
    expect(p.placeQids).toEqual(['Q8673', 'Q15624']);
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