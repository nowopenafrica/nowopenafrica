/**
 * AutoAcquire — the first authorised source.
 *
 * WHY THIS ONE, AND WHY IT TOOK A LICENCE CHECK RATHER THAN A PREFERENCE
 *
 * `radar_sources` held four rows and not one of them could discover anything:
 * three are inbound (an admin uploading, an owner submitting, a customer
 * suggesting) and the fourth, businesslist_ng, is `automated_access:
 * prohibited`. §0/§6/§29 forbid inventing a source, so `ADAPTERS` stayed empty
 * and every part of the engine — the SSRF guard, the quality score, the
 * evidence table — sat waiting on a business decision.
 *
 * Wikidata is the source that needs no agreement. Verified against
 * https://www.wikidata.org/wiki/Wikidata:Licensing on 2026-09-08, quoting the
 * page itself: data in the main namespaces "is made available under the
 * Creative Commons CC0 License (Public domain)". CC0 waives the rights that
 * §6 asks about — automated access, bulk extraction, redistribution, and use
 * in a competing dataset — which is why this can be authorised by reading a
 * licence rather than by signing something.
 *
 * WHAT IT ACTUALLY CONTAINS, measured before any of this was written:
 *
 *   18,667  items in Nigeria matching the business types below
 *    2,347  with a telephone number
 *      980  with a website
 *
 * For comparison, the live directory had 453 listings of which 67 carried a
 * phone. So this is a real corpus, not a gesture.
 *
 * WHAT IT DELIBERATELY DOES NOT TAKE
 *
 * IMAGES. `P18` links to a file on Wikimedia Commons, and Commons media is
 * licensed per file — CC BY-SA, sometimes more restrictive — NOT CC0. The
 * data being public domain says nothing about the photograph. Taking one and
 * publishing it on a business profile would be exactly the rights failure this
 * engine exists to avoid, and the fact that it sits one property away from
 * everything else that IS free is what makes it worth naming here.
 *
 * NOTHING HERE PUBLISHES. Everything this produces is a `radar_candidate` with
 * status `review`, which a person then approves — and `radar_publish_candidate`
 * re-checks the source's rights at that moment, because a licence can change
 * between discovery and publication.
 */

// .js extension: this module is reachable from api/acquire/wikidata.ts.
import type { RawCandidate } from './adapter.js';

/** The source key in `radar_sources`. */
export const WIKIDATA_SOURCE_KEY = 'wikidata';

/** The endpoint. A constant, so nothing can be talked into fetching elsewhere. */
export const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

/**
 * Wikimedia asks for a User-Agent that identifies the client and how to reach
 * its operator. A browser cannot set one, which is the reason the fetch lives
 * in a server function rather than in the admin console.
 */
export const WIKIDATA_USER_AGENT =
  'NowOpenAfrica/1.0 (https://nowopenafrica.com; tech@nowopenafrica.com) AutoAcquire';

/**
 * Wikidata types worth listing, and the NowOpen category each becomes.
 *
 * An explicit map, not a guess. A type absent from here is a type we do not
 * import — which is how "hospital" and "university" are in and "human
 * settlement" and "river" are out, without anybody having to write a rule
 * about rivers.
 */
export const TYPE_CATEGORY: Record<string, string> = {
  Q11707: 'Restaurant',
  Q30022: 'Café & Bakery',
  Q3914: 'Schools & Training',            // school
  Q16917: 'Hospital & Clinic',            // hospital
  Q27686: 'Hotel & Lodging',              // hotel
  Q22687: 'Banking & Finance',            // bank
  Q4830453: 'Professional Services',      // business
  Q431289: 'Professional Services',       // brand
  Q7075: 'Library & Archive',             // library
  Q11315: 'Shopping Mall',                // shopping mall
  Q213441: 'Retail Store',                // shop
  Q1358919: 'Bar & Lounge',               // pub / bar
  Q5310: 'Bar & Lounge',                  // bar
  Q209465: 'Media & Publishing',          // campaign? kept for radio/press orgs
  Q1329623: 'Arts & Culture',             // cultural centre
  Q41176: 'Real Estate',                  // building
  Q23413: 'Arts & Culture',               // castle/heritage
  Q33506: 'Arts & Culture',               // museum
  Q483110: 'Sports & Recreation',         // stadium
  Q1076486: 'Sports & Recreation',        // sports venue
  Q4287745: 'Health & Medical',           // medical organisation
  Q3918: 'Schools & Training',            // university
  Q189004: 'Schools & Training',          // college
  Q157570: 'Automotive',                  // petrol station? (filling station)
  Q205495: 'Automotive',                  // filling station
};

/** Every type id the query asks for. */
export const WIKIDATA_TYPES = Object.keys(TYPE_CATEGORY);

export interface DiscoverOptions {
  /** A Wikidata QID for the place, e.g. Q8673 for Lagos. */
  placeQid?: string;
  /** Country QID. Nigeria is Q1033. */
  countryQid?: string;
  /** Only return items that carry a phone number. */
  requireContact?: boolean;
  /** QIDs already offered to a reviewer; FILTER NOT IN asks the source to
   *  return something else instead of serving the same rows again. */
  exclude?: string[];
  limit: number;
  offset?: number;
}

/**
 * Build the SPARQL query.
 *
 * A BUILDER, not a template a caller can pass arbitrary text into: the only
 * things that vary are two QIDs and two integers, and each is validated. A
 * SPARQL endpoint is a query engine on somebody else's servers, and letting a
 * caller shape the query would be an injection hole pointed at a third party
 * we have asked to trust us.
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

/** `Point(3.3792 6.5244)` → `{ lat, lng }`, or null. */
export function parsePoint(wkt: string): { lat: number; lng: number } | null {
  const m = /^Point\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i.exec(String(wkt ?? '').trim());
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * A Wikidata label is often the item's QID when no label exists in English.
 * Publishing "Q124315" as a business name would be worse than skipping it.
 */
const isUnlabelled = (label: string, qid: string): boolean =>
  label === qid || /^Q\d+$/.test(label);

export interface WikidataCandidate extends RawCandidate {
  /** Kept so a reviewer can open the item and check it. */
  qid: string;
  category: string;
  latitude?: number | null;
  longitude?: number | null;
  /** Ready for `radar_candidates.profile`. */
  profile: Record<string, string>;
}

/**
 * Fold the SPARQL result into one candidate per item.
 *
 * SPARQL returns the CARTESIAN PRODUCT of every optional value, so an item
 * with two types and two phone numbers arrives as four rows. Measured on the
 * live endpoint: one Lagos café came back eight times. Treating those as eight
 * businesses would have filled the review queue with duplicates of the same
 * shop, so the fold is not a nicety.
 *
 * The FIRST value wins for single-valued fields, and every distinct type is
 * considered when choosing the category — a "restaurant" that is also a
 * "cafeteria" should be a restaurant, and the map's order decides.
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
     * They are stored in the profile in the same shape the CSV importer uses,
     * so one normaliser turns both into links.
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
     * cannot be recovered afterwards (§8). `api` rather than `structured_data`:
     * this came from an endpoint that returned it as a field, which is the
     * strongest thing we can say about how we know it.
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

  // Stable order: named, contactable candidates first, then alphabetical — a
  // review queue an operator can work top-down.
  return out.sort((a, b) => {
    const contact = Number(Boolean(b.phone || b.email)) - Number(Boolean(a.phone || a.email));
    if (contact !== 0) return contact;
    return a.name.localeCompare(b.name);
  });
}

/**
 * The NowOpen category for a set of Wikidata types.
 *
 * The map's own key order decides, so a restaurant that is also a cafeteria
 * is a restaurant. Unmapped types fall to 'Other' rather than being dropped:
 * by this point the query has already restricted the types, so an unmapped one
 * means the map is behind the query — a reviewer choosing the category is a
 * better answer than the candidate vanishing.
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
