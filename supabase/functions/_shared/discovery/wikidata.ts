/**
 * Wikidata — the first authorised discovery source, ported for the campaign
 * worker. This is the same module the Vercel API uses (src/lib/acquire/
 * wikidata.ts), kept in the Deno tree because edge functions cannot import
 * from src/.
 *
 * WHY WIKIDATA AND NOT SOMETHING EASIER — restated in one line because it is
 * the whole reason the source registry lets this run at all: per
 * Wikidata:Licensing, main-namespace data is CC0 (public domain), which waives
 * the four rights the registry asks about — automated access, bulk extraction,
 * redistribution and use in a competing dataset. No agreement was needed, only
 * a named authoriser recording the licence (radar_sources, 20260908).
 *
 * WHAT IT DELIBERATELY DOES NOT TAKE — IMAGES. P18 points at Wikimedia
 * Commons, whose files are licensed individually (CC BY-SA and others), NOT
 * CC0. The data being free says nothing about the photograph.
 *
 * This module only produces `radar_candidates` in status `review`. Nothing
 * here publishes; radar_publish_candidate re-checks the source's rights at the
 * moment of publication.
 */

import type { RawCandidate } from './types.ts';
import type { WikidataCandidate } from './types.ts';

/** The source key in `radar_sources`. */
export const WIKIDATA_SOURCE_KEY = 'wikidata';

/** The endpoint. A constant, so nothing can be talked into fetching elsewhere. */
export const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

/**
 * Wikimedia asks for a User-Agent that identifies the client and how to reach
 * its operator — the reason discovery runs server-side at all.
 */
export const WIKIDATA_USER_AGENT =
  'NowOpenAfrica/1.0 (https://nowopenafrica.com; tech@nowopenafrica.com) AutoAcquire';

/**
 * Wikidata types worth listing, and the NowOpen category each becomes.
 * An explicit map, not a guess — a type absent from here is a type we do not
 * import.
 */
export const TYPE_CATEGORY: Record<string, string> = {
  Q11707: 'Restaurant',
  Q30022: 'Café & Bakery',
  Q3914: 'Schools & Training',
  Q16917: 'Hospital & Clinic',
  Q27686: 'Hotel & Lodging',
  Q22687: 'Banking & Finance',
  Q4830453: 'Professional Services',
  Q431289: 'Professional Services',
  Q7075: 'Library & Archive',
  Q11315: 'Shopping Mall',
  Q213441: 'Retail Store',
  Q1358919: 'Bar & Lounge',
  Q5310: 'Bar & Lounge',
  Q209465: 'Media & Publishing',
  Q1329623: 'Arts & Culture',
  Q41176: 'Real Estate',
  Q23413: 'Arts & Culture',
  Q33506: 'Arts & Culture',
  Q483110: 'Sports & Recreation',
  Q1076486: 'Sports & Recreation',
  Q4287745: 'Health & Medical',
  Q3918: 'Schools & Training',
  Q189004: 'Schools & Training',
  Q157570: 'Automotive',
  Q205495: 'Automotive',
};

/** Every type id the query asks for. */
export const WIKIDATA_TYPES = Object.keys(TYPE_CATEGORY);

export interface DiscoverOptions {
  /** A Wikidata QID for the place, e.g. Q8673 for Lagos. */
  placeQid?: string;
  /** Country QID. Nigeria is Q1033. */
  countryQid?: string;
  /** Only return items that have a phone number at all. */
  requireContact?: boolean;
  /** QIDs already offered; FILTER NOT IN asks the source for something else. */
  exclude?: string[];
  limit: number;
  offset?: number;
}

/**
 * Build the SPARQL query.
 *
 * A BUILDER, not a template: the only things that vary are QIDs and integers,
 * each validated. Passing caller text into SPARQL would be an injection hole
 * pointed at a third party we have asked to trust us.
 */
export function buildDiscoveryQuery(opts: DiscoverOptions): string {
  const qid = (v: string | undefined): string | null =>
    v && /^Q\d{1,12}$/.test(v) ? v : null;

  const place = qid(opts.placeQid);
  const country = qid(opts.countryQid) ?? 'Q1033';
  const limit = Math.max(1, Math.min(50_000, Math.floor(opts.limit)));
  const offset = Math.max(0, Math.min(50_000, Math.floor(opts.offset ?? 0)));

  const values = WIKIDATA_TYPES.map((t) => `wd:${t}`).join(' ');
  const scope = place
    ? `?item wdt:P131 wd:${place} .`
    : `?item wdt:P17 wd:${country} .`;
  const contact = opts.requireContact ? '?item wdt:P1329 ?anyPhone .' : '';
  const excludes = [...new Set((opts.exclude ?? []).map(qid).filter((v): v is string => v !== null))]
    .slice(0, 900);
  const exclusion = excludes.length
    ? `\n  FILTER(?item NOT IN (${excludes.map((q) => `wd:${q}`).join(', ')}))`
    : '';

  return `SELECT ?item ?itemLabel ?itemDescription ?type ?placeLabel
       ?website ?phone ?email ?street ?coord ?facebook ?instagram ?twitter WHERE {
  ${scope}
  ?item wdt:P31 ?type .
  VALUES ?type { ${values} }
  ${contact}${exclusion}
  OPTIONAL { ?item wdt:P131 ?place . }
  OPTIONAL { ?item wdt:P856 ?website . }
  OPTIONAL { ?item wdt:P1329 ?phone . }
  OPTIONAL { ?item wdt:P968 ?email . }
  OPTIONAL { ?item wdt:P6375 ?street . }
  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item wdt:P2013 ?facebook . }
  OPTIONAL { ?item wdt:P2003 ?instagram . }
  OPTIONAL { ?item wdt:P2002 ?twitter . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${limit}
OFFSET ${offset}`;
}

/* --- Reading the answer --------------------------------------------------- */

type Binding = Record<string, { value?: string } | undefined>;

const val = (b: Binding, key: string): string => (b[key]?.value ?? '').trim();

/** `http://www.wikidata.org/entity/Q42` → `Q42`. */
export function qidFromUri(uri: string): string | null {
  const m = /\/entity\/(Q\d+)$/.exec(String(uri ?? '').trim());
  return m ? m[1] : null;
}

/** `Point(3.3792 6.5244)` → `{ lat, lng }`, or null. WKT writes longitude first. */
export function parsePoint(wkt: string): { lat: number; lng: number } | null {
  const m = /^Point\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i.exec(String(wkt ?? '').trim());
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** A Wikidata label is often the item's QID when no label exists in English. */
const isUnlabelled = (label: string, qid: string): boolean =>
  label === qid || /^Q\d+$/.test(label);

/**
 * Fold the SPARQL result into one candidate per item.
 *
 * SPARQL returns the CARTESIAN PRODUCT of every optional value, so an item
 * with two types and two phone numbers arrives as four rows. Without the fold
 * the review queue fills with duplicates of the same shop. The first value
 * wins for single-valued fields, and every distinct type is considered when
 * choosing the category.
 */
export function foldBindings(bindings: Binding[]): WikidataCandidate[] {
  const byQid = new Map<string, WikidataCandidate & { types: Set<string> }>();

  for (const b of bindings) {
    const qid = qidFromUri(val(b, 'item'));
    if (!qid) continue;

    const label = val(b, 'itemLabel');
    if (!label || isUnlabelled(label, qid)) continue;

    const typeQid = qidFromUri(val(b, 'type'));
    let entry = byQid.get(qid);

    if (!entry) {
      const point = parsePoint(val(b, 'coord'));
      entry = {
        qid,
        types: new Set<string>(),
        sourceRecordId: qid,
        sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
        name: label,
        category: 'Other',
        city: val(b, 'placeLabel') || null,
        address: val(b, 'street') || null,
        phone: val(b, 'phone') || null,
        email: val(b, 'email').replace(/^mailto:/i, '') || null,
        website: val(b, 'website') || null,
        description: val(b, 'itemDescription') || null,
        latitude: point?.lat ?? null,
        longitude: point?.lng ?? null,
        profile: {},
        evidence: {},
      };
      byQid.set(qid, entry);
    }

    if (typeQid) entry.types.add(typeQid);

    // First non-empty wins, so a later row cannot blank a filled field.
    const fill = (key: 'city' | 'address' | 'phone' | 'email' | 'website' | 'description', v: string) => {
      if (v && !entry![key]) (entry as unknown as Record<string, string>)[key] = v;
    };
    fill('city', val(b, 'placeLabel'));
    fill('address', val(b, 'street'));
    fill('phone', val(b, 'phone'));
    fill('email', val(b, 'email').replace(/^mailto:/i, ''));
    fill('website', val(b, 'website'));
    fill('description', val(b, 'itemDescription'));

    /*
     * Socials arrive as handles, not links — P2003 is "kunle_eats", not a URL.
     * Stored in the same shape the CSV importer uses, so one normaliser turns
     * both into links.
     */
    for (const [key, prop] of [['facebook', 'facebook'], ['instagram', 'instagram'], ['twitter', 'twitter']] as const) {
      const handle = val(b, prop);
      if (handle && !entry.profile[key]) entry.profile[key] = handle;
    }
  }

  const out: WikidataCandidate[] = [];
  for (const entry of byQid.values()) {
    const { types, ...candidate } = entry;
    candidate.category = categoryForTypes([...types]);

    /*
     * Evidence, per field, recorded at the moment of extraction because it
     * cannot be recovered afterwards (`api` — this came from an endpoint that
     * returned it as a field; the strongest thing we can say about how we
     * know it).
     */
    for (const field of ['name', 'category', 'city', 'address', 'phone', 'email', 'website', 'description'] as const) {
      const v = (candidate as unknown as Record<string, unknown>)[field];
      if (typeof v === 'string' && v.trim()) {
        candidate.evidence[field] = {
          method: 'api',
          sourceUrl: candidate.sourceUrl,
          confidence: 80,
        };
      }
    }
    out.push(candidate);
  }

  // Contactable, named candidates first — a review queue an operator can work top-down.
  return out.sort((a, b) => {
    const contact = Number(Boolean(b.phone || b.email)) - Number(Boolean(a.phone || a.email));
    if (contact !== 0) return contact;
    return a.name.localeCompare(b.name);
  });
}

/**
 * The NowOpen category for a set of Wikidata types. The map's own key order
 * decides; unmapped types fall to 'Other' rather than being dropped.
 */
export function categoryForTypes(types: string[]): string {
  for (const key of WIKIDATA_TYPES) {
    if (types.includes(key)) return TYPE_CATEGORY[key];
  }
  return 'Other';
}

/** The response shape, narrowed. Anything else is treated as no results. */
export function readSparqlJson(payload: unknown): Binding[] {
  const results = (payload as { results?: { bindings?: unknown } } | null)?.results?.bindings;
  return Array.isArray(results) ? (results as Binding[]) : [];
}