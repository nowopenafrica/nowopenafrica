/**
 * OpenStreetMap Overpass — the first pan-African open-data source for the
 * campaign worker, ported unchanged from src/lib/acquire/openstreetmap.ts.
 *
 * WHY PORT RATHER THAN RE-DERIVE: the review-queue engine and the command
 * lifetime use one candidate shape (radar_candidates) and one rights story
 * (radar_sources). Splitting OSM logic into a second, divergent adapter would
 * let the same Overpass element score or stage differently depending on which
 * system ran. The numbers, tags and refusal rules are identical to the
 * browser copy; only the import target differs (the framework-agnostic
 * types.ts instead of the browser adapter).
 *
 * WHAT IT DOES NOT TAKE — IMAGES. OSM nodes may reference `image=*`, but those
 * licences live on Wikimedia Commons (CC BY-SA or stricter), not ODbL. Taking
 * one and putting it on a business profile is the one rights failure this
 * engine exists to avoid; the fold reads no image tags and the profile only
 * carries text fields.
 */

import type { DiscoveryCandidate, RawCandidate } from './types.ts';

/** The source key in `radar_sources`. */
export const OSM_SOURCE_KEY = 'openstreetmap';

/** The Overpass API endpoint — public, free, read-only. */
export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

/** Attribution that must travel with every published candidate (ODbL). */
export const OSM_ATTRIBUTION = 'Database: OpenStreetMap | ODbL: https://opendatacommons.org/licenses/odbl/';

/**
 * African country bounding boxes, in Overpass `south,west,north,east` order.
 * A city query falls back through its country; unknown geography lands inside
 * Nigeria, the market default — the same rule the browser adapter uses.
 */
export const AFRICA_BBOX: Record<string, string> = {
  'Nigeria':          '4.0,  2.7,  14.0, 14.7',
  'Ghana':            '4.5, -3.3,  11.2,  1.2',
  'Kenya':            '-4.7, 34.0,  5.5,  41.9',
  'South Africa':     '-34.9, 16.5, -22.1, 32.9',
  'Tanzania':         '-11.7, 29.3, -0.9,  40.4',
  'Uganda':           '-1.5,  29.6,  4.2,  35.0',
  'Rwanda':           '-2.8,  28.9, -1.0,  30.9',
  'Ethiopia':         '3.4,  33.0, 15.0,  48.0',
  'Senegal':         '12.3, -17.6,  16.7, -11.4',
  'Côte d\'Ivoire':  '4.4,  -8.6,  10.7, -2.5',
  'Cameroon':         '1.6,   8.5,  13.1, 16.2',
  'Mozambique':      '-26.9, 30.2, -10.5, 40.8',
  'Zambia':          '-18.1, 22.0,  -7.3, 33.7',
  'Zimbabwe':        '-22.4, 25.2, -15.6, 33.1',
  'Egypt':           '22.0,  25.0, 31.7,  37.0',
  'Morocco':         '27.7, -13.2, 36.0,  -0.9',
  'Algeria':         '18.9,  -8.7, 37.1,  12.0',
  'Tunisia':         '30.2,   7.5, 37.3,  11.6',
  'Libya':           '19.5,   9.4, 33.2,  25.2',
  'Mali':            '10.2, -12.2,  25.0,  4.3',
  'Burkina Faso':     '9.4,  -5.5,  15.1,  2.4',
  'Niger':           '11.7,   0.2,  23.5, 16.0',
  'Chad':            '7.4,   13.5,  23.4, 24.0',
  'DR Congo':       '-13.5,  12.2,  5.4,  31.3',
  'Guinea':          '7.2,  -15.1,  12.7, -7.6',
  'Sierra Leone':    '6.9,  -13.3,  10.0, -10.3',
  'Liberia':         '4.3,  -11.5,  8.6,  -7.4',
  'Gambia':          '13.1, -16.8,  13.9, -13.8',
  'Mauritania':     '14.7,  -17.1,  27.3,  -4.8',
  'Cape Verde':      '14.8,  -25.4,  17.2, -22.7',
  'Djibouti':        '10.9,  41.8,  12.7,  43.4',
  'Eritrea':         '12.4,  36.4,  18.0,  43.1',
  'Somalia':         '-1.7,  41.0,  12.0,  51.0',
  'Sudan':            '8.7,  21.8,  22.2,  38.6',
  'South Sudan':     '3.5,  24.1,  12.2,  35.9',
  'Malawi':         '-17.1,  32.7,  -9.4,  35.9',
  'Madagascar':     '-26.0,  43.2, -11.9,  50.5',
  'Mauritius':      '-20.5,  57.3, -19.9,  57.8',
  'Botswana':       '-26.9,  19.9, -17.8,  29.4',
  'Namibia':        '-28.9,  11.7, -16.9,  25.3',
  'Angola':         '-18.0,  11.6,  -4.4,  24.1',
  'Congo':           '-5.0,  11.6,   3.7,  18.6',
  'Gabon':           '-4.0,   8.7,   2.3,  14.5',
};

/**
 * OSM amenity/shop tags mapped to NowOpen categories. Explicit, not guessed;
 * an unmapped tag falls to 'Other'.
 */
export const OSM_CATEGORY_MAP: Record<string, string> = {
  restaurant:          'Restaurant',
  fast_food:           'Restaurant',
  cafe:                'Café & Bakery',
  bakery:              'Café & Bakery',
  bar:                 'Bar & Lounge',
  pub:                 'Bar & Lounge',
  nightclub:           'Bar & Lounge',
  hotel:               'Hotel & Lodging',
  motel:               'Hotel & Lodging',
  hostel:              'Hotel & Lodging',
  guest_house:         'Hotel & Lodging',
  lodge:               'Hotel & Lodging',
  bank:                'Banking & Finance',
  bureau_de_change:    'Banking & Finance',
  money_transfer:      'Banking & Finance',
  atm:                 'Banking & Finance',
  hospital:            'Hospital & Clinic',
  clinic:              'Hospital & Clinic',
  pharmacy:            'Hospital & Clinic',
  dentist:             'Hospital & Clinic',
  doctors:             'Hospital & Clinic',
  laboratory:          'Hospital & Clinic',
  veterinary:          'Hospital & Clinic',
  school:              'Schools & Training',
  kindergarten:        'Schools & Training',
  college:             'Schools & Training',
  university:          'Schools & Training',
  library:             'Arts & Culture',
  museum:              'Arts & Culture',
  cinema:              'Arts & Culture',
  theatre:             'Arts & Culture',
  community_centre:    'Arts & Culture',
  car_repair:          'Automotive',
  car_wash:            'Automotive',
  car:                 'Automotive',
  fuel:                'Automotive',
  bicycle_repair:      'Automotive',
  supermarket:         'Shopping Mall',
  grocery:             'Shopping Mall',
  convenience:         'Shopping Mall',
  marketplace:         'Shopping Mall',
  department_store:    'Shopping Mall',
  mall:                'Shopping Mall',
  clothes:             'Retail Store',
  shoes:               'Retail Store',
  electronics:         'Retail Store',
  furniture:           'Retail Store',
  jewelry:             'Retail Store',
  hairdresser:         'Retail Store',
  beauty:              'Retail Store',
  tattoo:              'Retail Store',
  laundrette:          'Retail Store',
  pet:                 'Retail Store',
  doityourself:        'Retail Store',
  hardware:            'Retail Store',
  sports:              'Retail Store',
  toys:                'Retail Store',
  books:               'Retail Store',
  stationery:          'Retail Store',
  optician:            'Retail Store',
  chemist:             'Retail Store',
  florist:             'Retail Store',
  garden_centre:       'Retail Store',
  outdoor:             'Retail Store',
  art:                 'Arts & Culture',
  music:               'Arts & Culture',
  photo:               'Arts & Culture',
  copying:             'Professional Services',
  printing:            'Professional Services',
  estate_agent:        'Real Estate',
  lawyer:              'Professional Services',
  notary:              'Professional Services',
  accountant:          'Professional Services',
  travel_agency:       'Professional Services',
  funeral_directors:   'Professional Services',
  gym:                 'Sports & Recreation',
  sports_centre:       'Sports & Recreation',
  swimming_pool:       'Sports & Recreation',
  stadium:             'Sports & Recreation',
  betting:             'Sports & Recreation',
  fireworks:           'Sports & Recreation',
  internet_cafe:       'Professional Services',
  telephone:           'Professional Services',
  post_office:         'Professional Services',
  courier:             'Professional Services',
  tailor:              'Retail Store',
  key_cutter:          'Professional Services',
  lock_smith:          'Professional Services',
  electrician:         'Professional Services',
  plumber:             'Professional Services',
  painter:             'Professional Services',
  carpenter:           'Professional Services',
  cleaner:             'Professional Services',
};

/** Region markers are search results, not business listings. */
const REGION_AMENITIES = new Set([
  'townhall', 'government', 'administrative', 'courthouse', 'embassy',
  'police', 'fire_station', 'post_box', 'shelter', 'bench', 'fountain',
  'drinking_water', 'toilets', 'recycling', 'waste_basket', 'parking',
  'bicycle_parking', 'car_sharing', 'weighbridge', 'grit_bin',
  'place_of_worship', 'monastery', 'conference_centre',
]);

/** Build an Overpass QL query for named businesses in a bbox. */
export function buildOverpassQuery(opts: {
  bbox: string;
  category?: string;
  limit: number;
  excludeIds?: string[];
}): string {
  const { bbox, category, excludeIds } = opts;

  let filter: string;
  if (category && OSM_CATEGORY_MAP[category]) {
    const nowOpenCat = OSM_CATEGORY_MAP[category];
    const osmTags = Object.entries(OSM_CATEGORY_MAP)
      .filter(([, c]) => c === nowOpenCat)
      .map(([tag]) => tag);
    if (osmTags.length) {
      const tagFilter = osmTags.map((t) => `"amenity"="${t}"`).join('|');
      const shopFilter = osmTags.map((t) => `"shop"="${t}"`).join('|');
      filter = `(${tagFilter}|${shopFilter});`;
    } else {
      filter = '(["amenity"]["name"]["shop"!~".*"]);';
    }
  } else {
    // Broad query: named amenity/shop nodes with a phone or website, excluding
    // region markers. This is also the query-level contact floor the worker
    // inherits — OSM candidates always carry something the reviewer can use.
    filter = '(["amenity"]["name"]["phone"~".+"|"contact:phone"~".+"|"website"~".+"|"contact:website"~".+"]["amenity"!~"' +
      [...REGION_AMENITIES].join('|') + '"]);';
  }

  const idFilter = excludeIds?.length
    ? `->.skip; node(id:${excludeIds.join(',')}); ->.skip;`
    : '';

  return `
[out:json][timeout:90][maxsize:104857600];
(
  node${filter}(bbox:${bbox});
  way${filter}(bbox:${bbox});
  relation${filter}(bbox:${bbox});
)${idFilter};
out body;
>;
out skel qt;
  `.trim();
}

/** The shape of an Overpass JSON element (node/way/relation) we read. */
export interface OsmElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
}

/** The candidate this source produces, ready for radar_candidates columns. */
export interface OsmCandidate extends DiscoveryCandidate {
  sourceKey: 'openstreetmap';
}

/**
 * Fold an Overpass JSON response into candidates. Nodes carry their own
 * coordinates; the recursion-pass `>` output keeps them so way geometries can
 * never dereference. Only node and way elements with tags are kept, and no
 * image tags are ever read (the ODbL does not cover them).
 */
export function foldOsmElements(
  elements: OsmElement[],
  limit: number,
): OsmCandidate[] {
  // Index nodes by ID so later elements can resolve their center coordinate.
  const nodeIndex = new Map<number, { lat: number; lon: number }>();
  for (const el of elements) {
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      nodeIndex.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  const collected: OsmCandidate[] = [];
  const seenIds = new Set<string>();

  for (const el of elements) {
    if (!el.tags?.name) continue;
    if (collected.length >= limit) break;

    if (el.type !== 'node' && el.type !== 'way') continue;

    let lat: number | null = null;
    let lon: number | null = null;
    if (typeof el.lat === 'number' && typeof el.lon === 'number') {
      lat = el.lat;
      lon = el.lon;
    }

    const tags = el.tags;
    const name = (tags.name ?? '').trim();
    if (!name) continue;

    const osmId = `${el.type}/${el.id}`;
    if (seenIds.has(osmId)) continue;
    seenIds.add(osmId);

    const amenityTag = tags.amenity ?? '';
    const shopTag = tags.shop ?? '';
    const category = OSM_CATEGORY_MAP[amenityTag]
      ?? OSM_CATEGORY_MAP[shopTag]
      ?? 'Other';

    const phone = (tags['contact:phone'] ?? tags.phone ?? '').trim() || null;
    const website = (tags['contact:website'] ?? tags.website ?? '').trim() || null;
    const email = (tags['contact:email'] ?? tags.email ?? '').trim() || null;

    const addrParts = [
      tags['addr:housenumber'],
      tags['addr:street'],
      tags['addr:suburb'],
      tags['addr:quarter'],
    ].filter(Boolean);
    const address = addrParts.length ? addrParts.join(', ').trim() : null;

    const city = (tags['addr:city'] ?? '').trim() || null;
    const openingHours = (tags.opening_hours ?? '').trim() || null;
    const description = (tags.description ?? tags.note ?? '').trim() || null;

    const sourceUrl = `https://www.openstreetmap.org/${el.type}/${el.id}`;

    const fields = { name, category, city, address, phone, email, website, description };
    const evidence: RawCandidate['evidence'] = {};
    for (const [field, value] of Object.entries(fields)) {
      if (value && typeof value === 'string' && value.trim()) {
        evidence[field] = {
          method: 'structured_data',
          sourceUrl,
          confidence: 80,
        };
      }
    }

    const profile: Record<string, string> = {};
    if (openingHours) profile.opening_hours = openingHours;
    if (tags['addr:postcode']) profile.postcode = tags['addr:postcode'];
    if (tags.cuisine) profile.cuisine = tags.cuisine;
    if (tags['wheelchair']) profile.wheelchair = tags['wheelchair'];

    collected.push({
      sourceKey: 'openstreetmap',
      sourceRecordId: osmId,
      sourceUrl,
      ...fields,
      latitude: lat,
      longitude: lon,
      profile,
      evidence,
    });
  }

  return collected;
}