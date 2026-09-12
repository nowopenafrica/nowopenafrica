/**
 * AutoAcquire — OpenStreetMap Overpass, the first pan-African open-data source.
 *
 * WHY THIS SOURCE, AND WHY IT IS PERMITTED
 *
 * OpenStreetMap data is licensed under the Open Database Licence (ODbL) with
 * the Creative Commons Attribution-ShareAlike 4.0 (CC-BY-SA) attribution
 * requirement. The Overpass API is a free, public, read-only query endpoint
 * maintained by the OSM community. Automated access is explicitly permitted by
 * the ODbL — the licence was designed for this — and bulk extraction is
 * permitted as long as attribution is maintained.
 *
 * WHAT IT CONTAINS
 *
 * OSM's `amenity` and `shop` tags cover restaurants, cafés, banks, pharmacies,
 * hospitals, schools, supermarkets, retail shops, hotels and hundreds more
 * business types across every African city. A query for Lagos alone returns
 * thousands of named businesses with phone numbers, websites, addresses and
 * opening hours — far more than Wikidata for consumer businesses, and all
 * structured data, not prose.
 *
 * WHAT IT DOES NOT TAKE
 *
 * IMAGES. OSM nodes may reference an image URL via `image=*`, but these are
 * licensed per-file on Wikimedia Commons (CC BY-SA or more restrictive), not
 * ODbL. Taking one and publishing it on a business profile would be exactly
 * the rights failure this engine exists to avoid.
 *
 * NOTHING HERE PUBLISHES. Everything this produces is a `radar_candidate` with
 * status `review`, which a person then approves — and `radar_publish_candidate`
 * re-checks the source's rights at that moment.
 */

import type { RawCandidate } from './adapter.js';

/** The source key in `radar_sources`. */
export const OSM_SOURCE_KEY = 'openstreetmap';

/** The Overpass API endpoint — a public, free, read-only query service. */
export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

/**
 * Attribution that must travel with every published candidate.
 * The ODbL requires "Database: OpenStreetMap; ODbL: https://opendatacommons.org/licenses/odbl/"
 */
export const OSM_ATTRIBUTION = 'Database: OpenStreetMap | ODbL: https://opendatacommons.org/licenses/odbl/';

/**
 * African country bounding boxes, used when a country is specified without
 * coordinates. Covers the whole continent; a city query uses its own bbox.
 *
 * Format: south,west,north,east (Overpass bbox convention).
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
 * OSM amenity/shop tags mapped to NowOpen categories.
 *
 * An explicit map, not a guess. An unmapped tag falls to 'Other'.
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
  chemist:              'Retail Store',
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

/**
 * Region types — same logic as the Google adapter. A result that is only a
 * region marker (a city, a district, a country) is a search result, not a
 * business listing.
 */
const REGION_AMENITIES = new Set([
  'townhall', 'government', 'administrative', 'courthouse', 'embassy',
  'police', 'fire_station', 'post_box', 'shelter', 'bench', 'fountain',
  'drinking_water', 'toilets', 'recycling', 'waste_basket', 'parking',
  'bicycle_parking', 'car_sharing', 'weighbridge', 'grit_bin',
  'place_of_worship', 'monastery', 'conference_centre',
]);

/**
 * Build an Overpass QL query for businesses in a bounding box or named area.
 *
 * The query asks for nodes and ways (buildings) that carry `name` and are
 * one of the amenity/shop types we list. `contact:phone` and `phone` are both
 * checked; the phone tag is inconsistent across OSM. Opening hours, address
 * components and email are also grabbed when present.
 *
 * The bbox format is: `south,west,north,east`.
 */
export function buildOverpassQuery(opts: {
  bbox: string;
  category?: string;
  limit: number;
  excludeIds?: string[];
}): string {
  const { bbox, category, excludeIds } = opts;

  // Build the amenity/shop filter. A specific category narrows the query.
  let filter: string;
  if (category && OSM_CATEGORY_MAP[category]) {
    // Map an OSM tag to its NowOpen category, then find all OSM tags for that category.
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
    // Broad query: all amenity/shop nodes with a name and phone or website.
    filter = '(["amenity"]["name"]["phone"~".+"|"contact:phone"~".+"|"website"~".+"|"contact:website"~".+"]["amenity"!~"' +
      [...REGION_AMENITIES].join('|') + '"]);';
  }

  // Exclude already-offered IDs.
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

/**
 * The shape of an Overpass JSON element (node/way/relation) we read.
 */
interface OsmElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
}

/**
 * The candidate type this source produces.
 */
export interface OsmCandidate {
  qid: '';
  sourceKey: 'openstreetmap';
  sourceRecordId: string;
  sourceUrl: string;
  name: string;
  category: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  profile: Record<string, string>;
  evidence: RawCandidate['evidence'];
}

/**
 * Fold an Overpass JSON response into an array of candidates.
 *
 * The Overpass API returns a flat list of elements. Nodes carry their own
 * coordinates; ways and relations need a separate (recursive) output to
 * resolve their node coordinates. This function uses the node coordinates
 * directly, as the recursive output populates them.
 */
export function foldOsmElements(
  elements: OsmElement[],
  limit: number,
): OsmCandidate[] {
  // Index nodes by ID so ways can resolve their center coordinate.
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

    // Only node and way elements with tags.
    if (el.type !== 'node' && el.type !== 'way') continue;

    // Resolve coordinates.
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

    // Category from amenity or shop tag.
    const amenityTag = tags.amenity ?? '';
    const shopTag = tags.shop ?? '';
    const category = OSM_CATEGORY_MAP[amenityTag]
      ?? OSM_CATEGORY_MAP[shopTag]
      ?? 'Other';

    // Phone: prefer contact:phone, fall back to phone.
    const phone = (tags['contact:phone'] ?? tags.phone ?? '').trim() || null;

    // Website: prefer contact:website, fall back to website.
    const website = (tags['contact:website'] ?? tags.website ?? '').trim() || null;

    // Email.
    const email = (tags['contact:email'] ?? tags.email ?? '').trim() || null;

    // Address from addr: tags.
    const addrParts = [
      tags['addr:housenumber'],
      tags['addr:street'],
      tags['addr:suburb'],
      tags['addr:quarter'],
    ].filter(Boolean);
    const address = addrParts.length ? addrParts.join(', ').trim() : null;

    // City from addr:city.
    const city = (tags['addr:city'] ?? '').trim() || null;

    // Opening hours.
    const openingHours = (tags.opening_hours ?? '').trim() || null;

    // Description: fall back to description or note tags.
    const description = (tags.description ?? tags.note ?? '').trim() || null;

    // Source URL: link to the OSM element.
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
      qid: '',
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
