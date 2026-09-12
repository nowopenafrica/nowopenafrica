/**
 * Google Places — the mapping and filtering half of the Google Business
 * source, kept pure so it can be tested without an API key or a network.
 *
 * The network half lives in api/acquire/google.ts, which reads the key from
 * the server environment and calls Google Places (New) — Text Search. This
 * module only decides what a place becomes, and which places are places at
 * all: a "locality" is a map region, not a business, and no amount of clever
 * API configuration should turn one into a listing.
 */

import type { RawCandidate } from './adapter.js';

/** The source key in `radar_sources`, and what the console stages. */
export const GOOGLE_SOURCE_KEY = 'google';

/** Google Places API v1 — Text Search (New). */
export const GOOGLE_TEXT_SEARCH = 'https://places.googleapis.com/v1/places:searchText';

/**
 * Google place types worth listing, and the NowOpen category each becomes.
 *
 * Google's type vocabulary is large and uneven; a candidate's category is the
 * FIRST mapped type in the array's order. Unmapped types fall to 'Other'
 * rather than being dropped — the reviewer choosing a category is a better
 * answer than a vanished candidate.
 */
export const GOOGLE_TYPES_CATEGORY: Record<string, string> = {
  restaurant: 'Restaurant',
  food: 'Restaurant',
  meal_delivery: 'Restaurant',
  meal_takeaway: 'Restaurant',
  cafe: 'Café & Bakery',
  coffee_shop: 'Café & Bakery',
  bakery: 'Café & Bakery',
  hotel: 'Hotel & Lodging',
  lodge: 'Hotel & Lodging',
  resort: 'Hotel & Lodging',
  motel: 'Hotel & Lodging',
  guest_house: 'Hotel & Lodging',
  hostel: 'Hotel & Lodging',
  bank: 'Banking & Finance',
  atm: 'Banking & Finance',
  finance: 'Banking & Finance',
  insurance_agency: 'Banking & Finance',
  accounting: 'Banking & Finance',
  school: 'Schools & Training',
  secondary_school: 'Schools & Training',
  primary_school: 'Schools & Training',
  university: 'Schools & Training',
  college: 'Schools & Training',
  vocational_school: 'Schools & Training',
  hospital: 'Hospital & Clinic',
  health: 'Hospital & Clinic',
  pharmacy: 'Hospital & Clinic',
  dentist: 'Hospital & Clinic',
  doctor: 'Hospital & Clinic',
  physiotherapist: 'Hospital & Clinic',
  medical_lab: 'Hospital & Clinic',
  shopping_mall: 'Shopping Mall',
  department_store: 'Shopping Mall',
  supermarket: 'Shopping Mall',
  convenience_store: 'Shopping Mall',
  market: 'Shopping Mall',
  store: 'Retail Store',
  clothing_store: 'Retail Store',
  electronics_store: 'Retail Store',
  furniture_store: 'Retail Store',
  jewelry_store: 'Retail Store',
  shoe_store: 'Retail Store',
  home_goods_store: 'Retail Store',
  hardware_store: 'Retail Store',
  bookstore: 'Retail Store',
  florist: 'Retail Store',
  liquor_store: 'Retail Store',
  beauty_salon: 'Retail Store',
  barber_shop: 'Retail Store',
  spa: 'Retail Store',
  laundry: 'Retail Store',
  pet_store: 'Retail Store',
  drugstore: 'Retail Store',
  toy_store: 'Retail Store',
  bar: 'Bar & Lounge',
  night_club: 'Bar & Lounge',
  museum: 'Arts & Culture',
  art_gallery: 'Arts & Culture',
  library: 'Arts & Culture',
  cultural_center: 'Arts & Culture',
  movie_theater: 'Arts & Culture',
  performing_arts_theater: 'Arts & Culture',
  tourist_attraction: 'Arts & Culture',
  real_estate_agency: 'Real Estate',
  stadium: 'Sports & Recreation',
  gym: 'Sports & Recreation',
  fitness_center: 'Sports & Recreation',
  sports_center: 'Sports & Recreation',
  park: 'Sports & Recreation',
  car_dealer: 'Automotive',
  car_repair: 'Automotive',
  car_wash: 'Automotive',
  gas_station: 'Automotive',
  electric_vehicle_charging_station: 'Automotive',
  lawyer: 'Professional Services',
  legal_services: 'Professional Services',
  electrician: 'Professional Services',
  plumber: 'Professional Services',
  general_contractor: 'Professional Services',
  locksmith: 'Professional Services',
  painter: 'Professional Services',
  moving_company: 'Professional Services',
  roofing_contractor: 'Professional Services',
  television_station: 'Media & Publishing',
  radio_station: 'Media & Publishing',
  movie_studio: 'Media & Publishing',
};

/**
 * Types that describe a MAP REGION, not a business. A place whose every type
 * is here is a search result we asked for, not a listing — "Lagos", "Abuja"
 * and "Eti-Osa" are the correct answers to a text query, and they must not
 * become directory candidates or the queue fills with states.
 */
const REGION_TYPES = new Set([
  'country',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'administrative_area_level_3',
  'administrative_area_level_4',
  'administrative_area_level_5',
  'locality',
  'sublocality',
  'sublocality_level_1',
  'sublocality_level_2',
  'sublocality_level_3',
  'neighborhood',
  'route',
  'political',
  'postal_code',
  'subpremise',
  'premise',
  'address',
  'floor',
  'room',
  'intersection',
  'colloquial_area',
  'natural_feature',
]);

/** True when every type is a region marker — the place is a place, not a shop. */
export function isRegionPlace(types: string[]): boolean {
  return types.length > 0 && types.every((t) => REGION_TYPES.has(t));
}

/** The NowOpen category for a Google place, from its types. */
export function categoryForGoogleTypes(types: string[]): string {
  for (const t of types) {
    const c = GOOGLE_TYPES_CATEGORY[t];
    if (c) return c;
  }
  return 'Other';
}

/** A narrowed Google Places (New) result, as the API truthfully returns it. */
export interface GooglePlace {
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: { longText?: string; types?: string[] }[];
  nationalPhoneNumber?: string;
  websiteUri?: string;
  types?: string[];
  location?: { latitude?: number; longitude?: number };
  plusPlaceId?: string;
  googleMapsUri?: string;
}

/** "The city" from the address components Google returned. */
export function cityFromComponents(components?: GooglePlace['addressComponents']): string | null {
  if (!components?.length) return null;
  const pick = (names: string[]): string | null => {
    const hit = components.find((c) => c.types?.some((t) => names.includes(t)));
    return hit?.longText?.trim() ?? null;
  };
  return pick(['locality'])
    ?? pick(['sublocality', 'sublocality_level_1'])
    ?? pick(['administrative_area_level_2'])
    ?? null;
}

/** A candidate ready for the console to stage, or null if it is not listable. */
export interface GoogleCandidate {
  /** No Wikidata item behind this — internal source identity only. */
  qid: '';
  sourceKey: 'google';
  sourceRecordId: string;
  sourceUrl: string;
  name: string;
  category: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: null;
  website: string | null;
  description: null;
  latitude: number | null;
  longitude: number | null;
  profile: Record<string, string>;
  evidence: RawCandidate['evidence'];
}

/** Fold one Google place into a candidate. Region places become null. */
export function placeToCandidate(place: GooglePlace): GoogleCandidate | null {
  const name = place.displayName?.text?.trim() ?? '';
  const id = place.plusPlaceId ?? '';
  if (!name || !id) return null;

  const types = Array.isArray(place.types) ? place.types : [];
  if (isRegionPlace(types)) return null;

  const sourceUrl = place.googleMapsUri?.trim() ?? '';
  const fields = {
    name,
    category: categoryForGoogleTypes(types),
    city: cityFromComponents(place.addressComponents),
    address: place.formattedAddress?.trim() ?? null,
    phone: place.nationalPhoneNumber?.trim() ?? null,
    website: place.websiteUri?.trim() ?? null,
  };

  // Evidence per field, recorded at extraction because it cannot be recovered
  // afterwards. `api`: Google returned it as a field of the result.
  const evidence: RawCandidate['evidence'] = {};
  for (const field of ['name', 'category', 'city', 'address', 'phone', 'website'] as const) {
    const v = fields[field];
    if (typeof v === 'string' && v.trim()) {
      evidence[field] = {
        method: 'api',
        sourceUrl: sourceUrl || GOOGLE_TEXT_SEARCH,
        confidence: 85,
      };
    }
  }

  const location = place.location ?? {};
  return {
    qid: '',
    sourceKey: 'google',
    sourceRecordId: id,
    sourceUrl,
    ...fields,
    email: null,
    description: null,
    latitude: typeof location.latitude === 'number' ? location.latitude : null,
    longitude: typeof location.longitude === 'number' ? location.longitude : null,
    profile: { google_place_id: id, google_maps_uri: sourceUrl },
    evidence,
  };
}