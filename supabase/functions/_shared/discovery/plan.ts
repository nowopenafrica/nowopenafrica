/**
 * Turning a campaign row into a concrete plan the worker can run.
 *
 * The campaign stores targets as text (countries, cities, categories, a
 * filters object) and source_keys as registry keys. This module answers the
 * two questions the worker must not guess at:
 *
 *  1. WHERE do we ask?  "Lagos" means nothing to Wikidata until it is Q8673.
 *     City names with a known QID become place scopes; a country name with a
 *     known QID becomes the country scope; anything unmapped falls back to
 *     Nigeria (Q1033) rather than silently discovering nothing or — worse —
 *     querying "everything everywhere".
 *
 *  2. WHICH FILTERS CAN THE WORKER HONESTLY ENFORCE?  A filter the source
 *     cannot answer must not silently drop records and must not silently be
 *     ignored. `filtersApplied` lists what the worker will actually test on
 *     every record; `filtersDeferred` names the rest and why, so the review
 *     queue, not the source, carries that responsibility.
 *
 * The plan is a pure function of the inputs — no I/O, fully testable.
 */

export interface PlanRequest {
  /** Registry source keys already narrowed to `active` sources the worker knows. */
  sourceKeys: string[];
  cities: string[];
  regions: string[];
  countries: string[];
  categories: string[];
  filters: Record<string, unknown>;
  maxRecords: number | null;
  dailyLimit: number | null;
}

export interface SourceShare {
  sourceKey: string;
  /** Rows to ask the source for, before the cartesian-product fold. */
  limit: number;
}

export interface CampaignPlan {
  sourceShares: SourceShare[];
  /** Matched city QIDs; the worker fetches one scope per QID. */
  placeQids: string[];
  /** Matched city names, parallel to `placeQids` — resolved bbox for OSM. */
  placeNames: string[];
  /** The country scope to fall back to when no city matched (Wikidata QID). */
  countryQid: string;
  /** The country scope's name, parallel to `countryQid` — OSM bbox lookup. */
  countryName: string;
  /** Ask the source only for items that carry a phone (query-level filter). */
  requireContact: boolean;
  /** Filters the worker will enforce on every record. */
  filtersApplied: string[];
  /** Filters the source cannot answer — review queue's job, names and whys. */
  filtersDeferred: { filter: string; why: string }[];
  /*
   * ── COUNTRIES THE CAMPAIGN NAMED AND THIS COULD NOT RESOLVE ────────────
   *
   * MEASURED 2026-10-06: the live campaign stores `countries = ['NG']`, and
   * COUNTRY_QIDS is keyed by FULL NAMES ('Nigeria'). So nothing matched, and
   * the fallback below quietly made it Nigeria — which happened to be right.
   *
   * For any other market it would not be. A campaign scoped to Ghana with
   * `['GH']` would have swept NIGERIA and staged Nigerian businesses under a
   * Ghanaian campaign, reporting success throughout. That is the same failure
   * as the Wikidata id that made Port Harcourt into a Catalan town: a silent
   * fallback doing exactly what it was told.
   *
   * The worker refuses to run when this is non-empty, rather than harvesting
   * the wrong country.
   */
  unmatchedCountries: string[];
}

/** The default scope of one run when the campaign sets neither limit. */
export const DEFAULT_RUN_BUDGET = 40;
/** A run never asks for more than this, whatever the campaign row says. */
export const MAX_RUN_BUDGET = 500;

/** Known places → Wikidata QIDs. Extend as targets are added; never guess. */
export const PLACE_QIDS: Record<string, string> = {
  // Nigeria
  Lagos: 'Q8673',
  Abuja: 'Q3787',
  Kano: 'Q182984',
  Ibadan: 'Q183298',
  'Port Harcourt': 'Q217432',
  Kaduna: 'Q208318',
  'Benin City': 'Q320704',
  Enugu: 'Q465022',
  Onitsha: 'Q852238',
  Aba: 'Q202162',
  Ilorin: 'Q587085',
  Jos: 'Q321079',
  Sokoto: 'Q336350',
  Bauchi: 'Q811144',
  Akure: 'Q423831',
  Abeokuta: 'Q206484',
  Uyo: 'Q1999000',
  Calabar: 'Q844091',
  Owerri: 'Q583619',
  Asaba: 'Q1061665',
  Makurdi: 'Q994096',
  Warri: 'Q574593',
  // Selected African neighbours
  Accra: 'Q3761',
  Nairobi: 'Q3870',
  Kampala: 'Q3894',
  'Dar es Salaam': 'Q1960',
  'Addis Ababa': 'Q3624',
  Kigali: 'Q3859',
  Dakar: 'Q3718',
  Cairo: 'Q85',
  Casablanca: 'Q7903',
  'Cape Town': 'Q5465',
  Johannesburg: 'Q34647',
};

/** Known countries → Wikidata QIDs. Nigeria is the market default. */
export const COUNTRY_QIDS: Record<string, string> = {
  Nigeria: 'Q1033',
  Ghana: 'Q117',
  Kenya: 'Q114',
  'South Africa': 'Q258',
  Egypt: 'Q79',
  Tanzania: 'Q924',
  Uganda: 'Q1036',
  Ethiopia: 'Q115',
  Rwanda: 'Q1037',
  Senegal: 'Q1041',
  Morocco: 'Q1028',
  Algeria: 'Q262',
  Tunisia: 'Q948',
  Libya: 'Q1016',
  Sudan: 'Q1049',
  'South Sudan': 'Q958',
  'DR Congo': 'Q974',
  'Democratic Republic of the Congo': 'Q974',
  Angola: 'Q916',
  Zambia: 'Q953',
  Zimbabwe: 'Q954',
  Mozambique: 'Q1029',
  Malawi: 'Q1020',
  Botswana: 'Q963',
  Namibia: 'Q1030',
  Cameroon: 'Q1009',
  Niger: 'Q1032',
  Benin: 'Q962',
  Togo: 'Q945',
  "Côte d'Ivoire": 'Q1008',
  'Ivory Coast': 'Q1008',
  Mali: 'Q912',
  'Burkina Faso': 'Q965',
  Guinea: 'Q1006',
  'Sierra Leone': 'Q1044',
  Liberia: 'Q1014',
  Gambia: 'Q1005',
  Mauritania: 'Q1025',
  Chad: 'Q657',
  'Central African Republic': 'Q929',
  Gabon: 'Q1000',
  'Congo (Brazzaville)': 'Q971',
  Burundi: 'Q967',
  Djibouti: 'Q977',
  Eritrea: 'Q986',
  Somalia: 'Q1045',
  Madagascar: 'Q1019',
  Mauritius: 'Q1027',
  Seychelles: 'Q1042',
  Comoros: 'Q970',
  'Cape Verde': 'Q1011',
  'Guinea-Bissau': 'Q1007',
};

/** Build the run plan for a campaign. Pure: same inputs, same plan. */
export function buildPlan(req: PlanRequest): CampaignPlan {
  const sources = [...new Set(req.sourceKeys)].filter(Boolean);
  const totalBudget = Math.max(1, Math.min(
    MAX_RUN_BUDGET,
    req.maxRecords ?? req.dailyLimit ?? DEFAULT_RUN_BUDGET,
  ));

  const perSource = sources.length
    ? Math.max(1, Math.ceil(totalBudget / sources.length))
    : 0;

  const pairs = req.cities
    .map((c) => c.trim())
    .reduce<Array<{ name: string; qid: string }>>((acc, c) => {
      const qid = PLACE_QIDS[c];
      if (qid && !acc.some((p) => p.qid === qid)) acc.push({ name: c, qid });
      return acc;
    }, []);
  const placeQids = pairs.map((p) => p.qid);
  const placeNames = pairs.map((p) => p.name);

  const namedCountries = req.countries.map((c) => c.trim()).filter(Boolean);
  const matchedCountry = namedCountries.find((c): c is string => Boolean(COUNTRY_QIDS[c]));
  /*
   * Nigeria remains the default when NO country is named — that is the
   * market this platform launched in. It is not a default for a country that
   * was named and not understood; those are reported above.
   */
  const countryQid = matchedCountry ? COUNTRY_QIDS[matchedCountry] : 'Q1033';
  const countryName = matchedCountry ?? 'Nigeria';
  const unmatchedCountries = matchedCountry ? [] : namedCountries;

  const perPlace = placeQids.length
    ? Math.max(1, Math.ceil(perSource / placeQids.length))
    : perSource;

  const filters = req.filters ?? {};

  const sourceShares = sources.map((sourceKey) => ({
    sourceKey,
    limit: perPlace,
  }));

  /*
   * The source-truth filters, split into exactly two lists.
   *
   * `requireContact` is query-level (Wikidata's `wdt:P1329 ?anyPhone .`
   * clause) — cheaper AND more honest than fetching candidates and then
   * throwing them away. `has_email` is also common, but Wikidata's email is
   * an OPTIONAL in the query, not a filter clause, so it is applied per
   * record instead.
   */
  const requireContact = Boolean(filters.has_phone || filters.has_whatsapp);

  const filtersApplied: string[] = [];
  for (const f of [
    ['has_phone', filters.has_phone === true],
    ['has_email', filters.has_email === true],
    ['has_website', filters.has_website === true],
    ['has_address', filters.has_address === true],
    ['has_coordinates', filters.has_coordinates === true],
    ['has_social', filters.has_social === true],
  ] as const) {
    if (f[1]) filtersApplied.push(f[0]);
  }
  if (requireContact && !filtersApplied.includes('has_phone')) filtersApplied.push('has_phone');

  const filtersDeferred: { filter: string; why: string }[] = [];
  if (filters.has_whatsapp === true) {
    filtersDeferred.push({ filter: 'has_whatsapp', why: 'Wikidata records dialable phone numbers, not which messenger they reach. The worker requires a phone as the closest honest proxy; WhatsApp verification is a review-time signal.' });
  }
  for (const f of ['has_logo', 'has_products', 'has_services', 'has_recent_activity', 'has_storefront', 'has_branches'] as const) {
    if (filters[f] === true) {
      filtersDeferred.push({ filter: f, why: `${f} is not a Wikidata property this discovery query asks for; it would reject every record, so the review queue decides instead.` });
    }
  }
  for (const f of ['no_existing_profile', 'has_unclaimed_profile'] as const) {
    if (filters[f] === true) {
      filtersDeferred.push({ filter: f, why: `${f} compares against what NowOpen already holds, which the source cannot know. The review queue (duplicate detection) applies it.` });
    }
  }
  for (const f of ['min_confidence', 'min_source_count', 'min_freshness_days'] as const) {
    if (filters[f] !== undefined && filters[f] !== null) {
      filtersDeferred.push({ filter: f, why: `${f} is a judgement about a candidate's history across NowOpen (publishGate), not something a directory exposes. It is enforced at review/publish time.` });
    }
  }

  return {
    unmatchedCountries,
    sourceShares,
    placeQids,
    placeNames,
    countryQid,
    countryName,
    requireContact,
    filtersApplied,
    filtersDeferred,
  };
}

export interface RecordFilterVerdict {
  keep: boolean;
  /** The first filter that failed, when keep is false. */
  reason?: string;
}

/**
 * Should this discovered record survive this campaign's source-truth filters?
 *
 * Only the filters `buildPlan` listed as applied are enforced here — keep this
 * in step with `filtersApplied`, or a filter will silently do nothing (added
 * to applied but never tested) or silently throw records away (tested but
 * never listed).
 */
export function recordMatchesFilters(
  record: {
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    address?: string | null;
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    profile?: Record<string, string>;
  },
  filters: Record<string, unknown>,
): RecordFilterVerdict {
  const nonEmpty = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;
  const hasSocial = ['facebook', 'instagram', 'twitter']
    .some((k) => nonEmpty(record.profile?.[k]));

  const checks: Array<[string, boolean, string]> = [
    ['has_phone', !(filters.has_phone === true) || nonEmpty(record.phone),
      'has_phone: no dialable phone recorded'],
    ['has_email', !(filters.has_email === true) || nonEmpty(record.email),
      'has_email: no email recorded'],
    ['has_website', !(filters.has_website === true) || nonEmpty(record.website),
      'has_website: no website recorded'],
    ['has_address', !(filters.has_address === true) || nonEmpty(record.address),
      'has_address: no street address recorded'],
    ['has_coordinates', !(filters.has_coordinates === true)
      || (Number.isFinite(record.latitude) && Number.isFinite(record.longitude)),
      'has_coordinates: no coordinates recorded'],
    ['has_social', !(filters.has_social === true) || hasSocial,
      'has_social: no social profiles recorded'],
    ['has_whatsapp', !(filters.has_whatsapp === true) || nonEmpty(record.phone),
      'has_whatsapp: no dialable phone to reach'],
  ];

  // The filter's name is already the first word of every `reason` string, so
  // the tuple's first slot is documentation for the reader of `checks` above
  // rather than something this loop needs.
  for (const [, ok, reason] of checks) {
    if (!ok) return { keep: false, reason };
  }
  return { keep: true };
}