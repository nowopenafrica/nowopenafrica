/**
 * Working out what a spreadsheet's columns mean.
 *
 * Nobody sends the template back. Real files arrive with "Company", "Biz Name",
 * "Type", "Tel", "Loc" — so the importer has to make a first guess and then let
 * an admin correct it. Every guess carries its confidence and the reason, so
 * the mapping screen can show what it decided rather than presenting a fait
 * accompli.
 *
 * Deliberately not an AI call. Column mapping is a small, closed problem with a
 * known vocabulary, and a deterministic matcher can be tested, runs instantly,
 * and gives the same answer twice — none of which is true of asking a model.
 */

export type Dataset = 'businesses' | 'placements' | 'media';

export interface FieldSpec {
  field: string;
  label: string;
  required?: boolean;
  /** Exact header names, lowercased, that mean this field. */
  aliases: string[];
  /** Substrings that suggest it when no alias matched. */
  hints?: string[];
  /** One column can fill several fields — "Lekki, Lagos" is city and area. */
  splits?: string[];
}

const BUSINESS_FIELDS: FieldSpec[] = [
  { field: 'external_id', label: 'Source record ID', aliases: ['business_id', 'id', 'record_id', 'source_record_id', 'ref'], hints: ['id'] },
  { field: 'name', label: 'Business name', required: true, aliases: ['business_name', 'name', 'company', 'company_name', 'business', 'trading_name', 'biz_name', 'organisation', 'organization'], hints: ['name', 'company', 'business'] },
  { field: 'legal_name', label: 'Legal name', aliases: ['legal_name', 'registered_name'], hints: ['legal'] },
  { field: 'category', label: 'Category', required: true, aliases: ['category', 'type', 'industry', 'sector', 'business_type', 'trade'], hints: ['categ', 'industry', 'sector'] },
  { field: 'subcategory', label: 'Subcategory', aliases: ['subcategory', 'sub_category'], hints: ['subcat'] },
  { field: 'description', label: 'Description', aliases: ['description', 'about', 'details', 'summary'], hints: ['descr', 'about'] },
  { field: 'country', label: 'Country', aliases: ['country'], hints: ['country'] },
  { field: 'state', label: 'State', aliases: ['state', 'region', 'province'], hints: ['state', 'region'] },
  { field: 'city', label: 'City', required: true, aliases: ['city', 'town', 'location', 'loc'], hints: ['city', 'town', 'locat'], splits: ['area', 'state'] },
  { field: 'area', label: 'Area', aliases: ['area', 'district', 'neighbourhood', 'neighborhood', 'lga'], hints: ['area', 'district'] },
  { field: 'address', label: 'Address', aliases: ['address', 'street', 'street_address', 'addr'], hints: ['address', 'street'] },
  { field: 'latitude', label: 'Latitude', aliases: ['latitude', 'lat'], hints: ['lat'] },
  { field: 'longitude', label: 'Longitude', aliases: ['longitude', 'lng', 'lon', 'long'], hints: ['lon', 'lng'] },
  { field: 'phone', label: 'Phone', aliases: ['phone', 'tel', 'telephone', 'mobile', 'contact_number', 'phone_number', 'msisdn'], hints: ['phone', 'tel', 'mobile'] },
  { field: 'whatsapp', label: 'WhatsApp', aliases: ['whatsapp', 'whatsapp_number', 'wa'], hints: ['whats'] },
  { field: 'email', label: 'Email', aliases: ['email', 'e_mail', 'email_address', 'mail'], hints: ['mail'] },
  { field: 'website', label: 'Website', aliases: ['website', 'url', 'web', 'site', 'homepage'], hints: ['web', 'url', 'site'] },
  { field: 'instagram', label: 'Instagram', aliases: ['instagram', 'ig'], hints: ['insta'] },
  { field: 'facebook', label: 'Facebook', aliases: ['facebook', 'fb'], hints: ['face'] },
  { field: 'opening_hours', label: 'Opening hours', aliases: ['opening_hours', 'hours', 'open_hours', 'business_hours'], hints: ['hour'] },
  { field: 'logo_url', label: 'Logo', aliases: ['logo_url', 'logo'], hints: ['logo'] },
  { field: 'cover_image_url', label: 'Cover image', aliases: ['cover_image_url', 'cover', 'cover_url', 'image_url', 'image'], hints: ['cover', 'image'] },
];

const PLACEMENT_FIELDS: FieldSpec[] = [
  { field: 'external_id', label: 'Source record ID', aliases: ['placement_id', 'id', 'source_record_id'], hints: ['id'] },
  { field: 'name', label: 'Placement name', required: true, aliases: ['placement_name', 'name', 'site_name', 'title'], hints: ['name', 'site'] },
  { field: 'placement_type', label: 'Placement type', required: true, aliases: ['placement_type', 'type', 'format', 'media_format'], hints: ['type', 'format'] },
  { field: 'city', label: 'City', required: true, aliases: ['city', 'town', 'location'], hints: ['city', 'locat'], splits: ['area', 'state'] },
  { field: 'state', label: 'State', aliases: ['state', 'region'], hints: ['state'] },
  { field: 'area', label: 'Area', aliases: ['area', 'district'], hints: ['area'] },
  { field: 'address', label: 'Address', aliases: ['address', 'exact_address', 'street'], hints: ['address'] },
  { field: 'latitude', label: 'Latitude', aliases: ['latitude', 'lat'], hints: ['lat'] },
  { field: 'longitude', label: 'Longitude', aliases: ['longitude', 'lng', 'lon'], hints: ['lon', 'lng'] },
  { field: 'dimensions', label: 'Dimensions', aliases: ['dimensions', 'size'], hints: ['dimens', 'size'] },
  { field: 'orientation', label: 'Orientation', aliases: ['orientation', 'facing'], hints: ['orient'] },
  { field: 'impressions', label: 'Daily impressions', aliases: ['estimated_daily_impressions', 'impressions', 'daily_impressions', 'traffic'], hints: ['impress', 'traffic'] },
  { field: 'rate', label: 'Rate', aliases: ['rate_card_amount', 'rate', 'price', 'amount', 'price_per_day'], hints: ['rate', 'price', 'amount'] },
  { field: 'currency', label: 'Currency', aliases: ['price_currency', 'currency'], hints: ['currenc'] },
  { field: 'rate_unit', label: 'Rate unit', aliases: ['rate_unit', 'unit', 'per'], hints: ['unit'] },
  { field: 'availability', label: 'Availability', aliases: ['availability_status', 'availability', 'status'], hints: ['avail'] },
  { field: 'media_owner', label: 'Media owner', aliases: ['media_owner', 'owner', 'vendor', 'operator'], hints: ['owner', 'vendor'] },
  { field: 'phone', label: 'Phone', aliases: ['phone', 'tel', 'contact_number'], hints: ['phone', 'tel'] },
  { field: 'email', label: 'Email', aliases: ['email', 'mail'], hints: ['mail'] },
  { field: 'website', label: 'Website', aliases: ['website', 'url'], hints: ['web', 'url'] },
  { field: 'image_url', label: 'Image', aliases: ['image_url', 'image', 'photo'], hints: ['image', 'photo'] },
];

const MEDIA_FIELDS: FieldSpec[] = [
  { field: 'external_id', label: 'Source record ID', aliases: ['media_id', 'id', 'source_record_id'], hints: ['id'] },
  { field: 'name', label: 'Provider name', required: true, aliases: ['media_provider_name', 'name', 'company', 'provider', 'studio'], hints: ['name', 'provider', 'company'] },
  { field: 'media_type', label: 'Media type', required: true, aliases: ['media_type', 'type', 'discipline'], hints: ['type'] },
  { field: 'service_category', label: 'Service category', required: true, aliases: ['service_category', 'category', 'services'], hints: ['categ', 'service'] },
  { field: 'specialties', label: 'Specialties', aliases: ['specialties', 'specialities', 'skills'], hints: ['special', 'skill'] },
  { field: 'city', label: 'City', required: true, aliases: ['city', 'town', 'location'], hints: ['city', 'locat'], splits: ['area', 'state'] },
  { field: 'state', label: 'State', aliases: ['state', 'region'], hints: ['state'] },
  { field: 'area', label: 'Area', aliases: ['area', 'district'], hints: ['area'] },
  { field: 'address', label: 'Address', aliases: ['address', 'street'], hints: ['address'] },
  { field: 'phone', label: 'Phone', aliases: ['phone', 'tel', 'mobile'], hints: ['phone', 'tel'] },
  { field: 'whatsapp', label: 'WhatsApp', aliases: ['whatsapp', 'wa'], hints: ['whats'] },
  { field: 'email', label: 'Email', aliases: ['email', 'mail'], hints: ['mail'] },
  { field: 'website', label: 'Website', aliases: ['website', 'url', 'portfolio_url'], hints: ['web', 'url', 'portfolio'] },
  { field: 'pricing_from', label: 'Pricing from', aliases: ['pricing_from', 'from_price', 'starting_price', 'rate'], hints: ['pric', 'rate'] },
  { field: 'pricing_currency', label: 'Currency', aliases: ['pricing_currency', 'currency'], hints: ['currenc'] },
  { field: 'description', label: 'Description', aliases: ['description', 'about'], hints: ['descr', 'about'] },
  { field: 'logo_url', label: 'Logo', aliases: ['logo_url', 'logo'], hints: ['logo'] },
];

export const DATASET_FIELDS: Record<Dataset, FieldSpec[]> = {
  businesses: BUSINESS_FIELDS,
  placements: PLACEMENT_FIELDS,
  media: MEDIA_FIELDS,
};

/** Header text reduced so "Business Name", "business_name" and "BizName" meet. */
export function headerKey(header: string): string {
  return String(header ?? '')
    .toLowerCase()
    .replace(/[‘’'"]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export interface ColumnMatch {
  header: string;
  field: string | null;
  confidence: 'exact' | 'alias' | 'hint' | 'none';
  /** Other fields this header could plausibly be, for the override dropdown. */
  alternatives: string[];
}

/**
 * Guess what each column is.
 *
 * A field is claimed once. When two headers both look like the business name,
 * the stronger match wins and the weaker one is left unmapped rather than
 * silently overwriting — an unmapped column an admin can see beats a wrong one
 * they cannot.
 */
export function autoMap(headers: string[], dataset: Dataset): ColumnMatch[] {
  const specs = DATASET_FIELDS[dataset];
  const claimed = new Set<string>();

  const scored = headers.map((header) => {
    const key = headerKey(header);
    const alternatives: string[] = [];
    let best: { field: string; confidence: ColumnMatch['confidence']; rank: number } | null = null;

    for (const spec of specs) {
      let confidence: ColumnMatch['confidence'] | null = null;
      let rank = 0;

      if (spec.field === key) { confidence = 'exact'; rank = 3; }
      else if (spec.aliases.includes(key)) { confidence = 'alias'; rank = 2; }
      else if (spec.hints?.some((h) => key.includes(h))) { confidence = 'hint'; rank = 1; }

      if (confidence) {
        alternatives.push(spec.field);
        if (!best || rank > best.rank) best = { field: spec.field, confidence, rank };
      }
    }
    return { header, best, alternatives };
  });

  // Strongest matches claim their field first.
  const order = [...scored].sort((a, b) => (b.best?.rank ?? 0) - (a.best?.rank ?? 0));
  const assigned = new Map<string, ColumnMatch>();

  for (const s of order) {
    if (s.best && !claimed.has(s.best.field)) {
      claimed.add(s.best.field);
      assigned.set(s.header, {
        header: s.header, field: s.best.field,
        confidence: s.best.confidence,
        alternatives: s.alternatives.filter((f) => f !== s.best!.field),
      });
    } else {
      assigned.set(s.header, {
        header: s.header, field: null, confidence: 'none',
        alternatives: s.alternatives,
      });
    }
  }

  return headers.map((h) => assigned.get(h)!);
}

/** Required fields the mapping still does not cover. */
export function missingRequired(mapping: ColumnMatch[], dataset: Dataset): FieldSpec[] {
  const mapped = new Set(mapping.map((m) => m.field).filter(Boolean) as string[]);
  return DATASET_FIELDS[dataset].filter((f) => f.required && !mapped.has(f.field));
}

/**
 * "Lekki, Lagos" in one Location column.
 *
 * Splitting is offered only when the field is a location and the value has a
 * separator; it never fires on an address, where commas are structural rather
 * than hierarchical. Returns the pieces coarsest-last, matching how people
 * write them.
 */
export function splitLocation(value: string | null | undefined): { area?: string; city?: string; state?: string } {
  const parts = String(value ?? '').split(/[,/|]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { city: parts[0] };
  if (parts.length === 2) return { area: parts[0], city: parts[1] };
  return { area: parts[0], city: parts[1], state: parts.slice(2).join(', ') };
}

/** Apply a mapping to one raw row. */
export function applyMapping(
  raw: Record<string, unknown>,
  mapping: ColumnMatch[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of mapping) {
    if (!m.field) continue;
    const v = raw[m.header];
    const s = v === null || v === undefined ? '' : String(v).trim();
    if (s) out[m.field] = s;
  }

  /*
   * A single "Location" column that landed on `city` but clearly carries more.
   * Only fills fields the file did not already supply — an explicit State
   * column always wins over something inferred from a comma.
   */
  if (out.city && /[,/|]/.test(out.city)) {
    const parts = splitLocation(out.city);
    if (parts.city) out.city = parts.city;
    if (parts.area && !out.area) out.area = parts.area;
    if (parts.state && !out.state) out.state = parts.state;
  }
  return out;
}
