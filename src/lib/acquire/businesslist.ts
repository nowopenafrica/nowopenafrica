/**
 * AutoAcquire — BusinessList.com.ng, Nigeria's largest business directory.
 *
 * LICENCE AND RIGHTS — PROHIBITED BY DEFAULT
 *
 * BusinessList.com.ng's terms of service explicitly prohibit bots, crawlers,
 * scrapers, bulk extraction and use in a competing dataset. This adapter is
 * built because the data is valuable and the user wants a real integration,
 * but `radar_sources` has this source as `active: false` with all rights set
 * to `prohibited`. The source gate in adapter.ts will refuse any operation
 * until a signed agreement with BusinessList changes that.
 *
 * robots.txt permitting crawling is a bot-traffic rule, not a content licence.
 *
 * WHAT IT CONTAINS
 *
 * BusinessList.com.ng is the largest Nigerian business directory with over
 * 50,000 listings across every state. Business pages carry: name, address,
 * phone numbers, email, website, social media links, business description,
 * opening hours, products/services, photos and reviews. Categories span
 * restaurants, hotels, banks, hospitals, schools, retail shops, professional
 * services and more.
 *
 * HOW THIS ADAPTER WORKS
 *
 * The server endpoint fetches BusinessList search/category pages, parses the
 * HTML to extract structured business data, and returns candidates for the
 * admin review queue. Each candidate carries a sourceUrl pointing at the
 * original BusinessList page so a reviewer can verify the data.
 *
 * NOTHING HERE PUBLISHES. Every candidate lands in the review queue for
 * human approval. `radar_publish_candidate` re-checks the source's rights
 * at publication time.
 */

import type { RawCandidate } from './adapter.js';

/** The source key in `radar_sources`. */
export const BUSINESSLIST_SOURCE_KEY = 'businesslist_ng';

/** The base URL for BusinessList.com.ng. */
export const BUSINESSLIST_BASE = 'https://www.businesslist.com.ng';

/**
 * BusinessList categories mapped to NowOpen categories.
 *
 * BusinessList's category slugs are used in their URL structure:
 * `/category/{slug}/{location}`.
 */
export const BUSINESSLIST_CATEGORIES: Record<string, string> = {
  restaurants:          'Restaurant',
  fast_food:            'Restaurant',
  cafes:                'Café & Bakery',
  bakeries:             'Café & Bakery',
  bars_and_pubs:        'Bar & Lounge',
  hotels:               'Hotel & Lodging',
  guest_houses:         'Hotel & Lodging',
  banks:                'Banking & Finance',
  microfinance_banks:   'Banking & Finance',
  insurance_companies:  'Banking & Finance',
  hospitals:            'Hospital & Clinic',
  clinics:              'Hospital & Clinic',
  pharmacies:           'Hospital & Clinic',
  dental_clinics:       'Hospital & Clinic',
  laboratories:         'Hospital & Clinic',
  schools:              'Schools & Training',
  universities:         'Schools & Training',
  colleges:             'Schools & Training',
  training_centres:     'Schools & Training',
  supermarkets:         'Shopping Mall',
  shopping_malls:       'Shopping Mall',
  markets:              'Shopping Mall',
  stores:               'Retail Store',
  electronics_stores:   'Retail Store',
  fashion_stores:       'Retail Store',
  car_dealers:          'Automotive',
  car_repair:           'Automotive',
  filling_stations:     'Automotive',
  auto_parts:           'Automotive',
  real_estate:          'Real Estate',
  properties:           'Real Estate',
  law_firms:            'Professional Services',
  consulting_firms:     'Professional Services',
  accounting_firms:     'Professional Services',
  travel_agencies:       'Professional Services',
  event_planners:       'Professional Services',
  beauty_salons:        'Retail Store',
  hair_salons:          'Retail Store',
  spas:                 'Retail Store',
  gyms:                 'Sports & Recreation',
  fitness_centres:      'Sports & Recreation',
  cinemas:              'Arts & Culture',
  event_centres:        'Arts & Culture',
  churches:             'Religious',
  mosques:              'Religious',
  printing_press:       'Professional Services',
  supermarkets_and_stores: 'Shopping Mall',
};

/**
 * Candidate type this source produces.
 */
export interface BusinessListCandidate {
  qid: '';
  sourceKey: 'businesslist_ng';
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
  latitude: null;
  longitude: null;
  profile: Record<string, string>;
  evidence: RawCandidate['evidence'];
}

/**
 * Parse a BusinessList search/category page HTML into an array of candidates.
 *
 * BusinessList's listing pages have a consistent structure: each business
 * is in an `<a>` tag with class `company` or similar, containing the name,
 * category, location and contact details. The exact selectors may change;
 * this parser uses multiple fallback patterns to stay robust.
 *
 * @param html - The raw HTML from a BusinessList page.
 * @param categoryHint - The NowOpen category to assign if parsing misses it.
 * @param sourceUrl - The URL the HTML was fetched from.
 * @returns An array of parsed candidates.
 */
export function parseBusinessListHtml(
  html: string,
  categoryHint: string,
): BusinessListCandidate[] {
  const results: BusinessListCandidate[] = [];

  // Pattern 1: BusinessList listing cards — extract company name, link, and
  // any visible phone/email. The exact HTML structure uses `<a>` tags with
  // class patterns like `company-list-item` or structured data blocks.
  //
  // BusinessList uses structured HTML with business cards. Each card has:
  // - An `<a>` link to the business page (contains the slug/id)
  // - A business name (usually in an `<h2>` or `<h3>`)
  // - Category label
  // - Location/address
  // - Phone numbers
  // - Email
  //
  // We extract from multiple patterns to handle their different page layouts.

  // Pattern: links to /company/{id}/{slug} pages.
  const companyLinks = html.matchAll(
    /<a[^>]*href=["'](?:https?:\/\/(?:www\.)?businesslist\.com\.ng)?\/company\/(\d+)\/([^"'\s]+)["'][^>]*>/gi,
  );

  const seen = new Set<string>();

  for (const match of companyLinks) {
    const id = match[1];
    const slug = match[2];
    if (!id || !slug || seen.has(id)) continue;
    seen.add(id);

    // Extract the surrounding context (2KB around the match) to find fields.
    const pos = match.index ?? 0;
    const context = html.substring(Math.max(0, pos - 500), Math.min(html.length, pos + 2500));

    // Business name: usually the text content of the link or an h2/h3 nearby.
    const nameMatch = context.match(
      /<(?:h[23]|span|div|strong|b)[^>]*class=["'][^"']*(?:company|business|name)[^"']*["'][^>]*>([^<]+)/i
    ) ?? context.match(/<a[^>]*>([^<]{3,80})<\/a>/i);
    const name = (nameMatch?.[1] ?? slug.replace(/-/g, ' ')).trim();

    // Phone: look for Nigerian phone patterns (080x, 090x, 070x, +234).
    const phoneMatch = context.match(/(?:\+234|0)[897][01]\d{8}/);
    const phone = phoneMatch?.[0]?.trim() ?? null;

    // Email.
    const emailMatch = context.match(
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
    );
    const email = emailMatch?.[1]?.trim() ?? null;

    // Website: look for a link that is not a businesslist link.
    const websiteMatch = context.match(
      /href=["'](https?:\/\/(?!www\.businesslist\.com\.ng)[^"'\s]+)["']/i,
    );
    const website = websiteMatch?.[1]?.trim() ?? null;

    // Category hint from nearby text.
    const catMatch = context.match(
      /<(?:span|div|a)[^>]*class=["'][^"']*(?:category|tag|type)[^"']*["'][^>]*>([^<]+)/i,
    );
    const category = catMatch?.[1]?.trim() || categoryHint;

    // Location / address.
    const locMatch = context.match(
      /<(?:span|div|p)[^>]*class=["'][^"']*(?:location|address|city|area)[^"']*["'][^>]*>([^<]+)/i,
    );
    const location = locMatch?.[1]?.trim() ?? null;

    const sourceUrlBusiness = `${BUSINESSLIST_BASE}/company/${id}/${slug}`;

    const fields = { name, category: category || categoryHint, city: location, address: location, phone, email, website, description: null };
    const evidence: RawCandidate['evidence'] = {};
    for (const [field, value] of Object.entries(fields)) {
      if (value && typeof value === 'string' && value.trim()) {
        evidence[field] = {
          method: 'dom_extraction',
          sourceUrl: sourceUrlBusiness,
          confidence: 75,
        };
      }
    }

    results.push({
      qid: '',
      sourceKey: 'businesslist_ng',
      sourceRecordId: `bl:${id}`,
      sourceUrl: sourceUrlBusiness,
      ...fields,
      latitude: null,
      longitude: null,
      profile: {},
      evidence,
    });
  }

  return results;
}

/**
 * Build the URL for a BusinessList category/location search page.
 */
export function buildBusinessListUrl(opts: {
  category?: string;
  location?: string;
  query?: string;
  page?: number;
}): string {
  const { category, location, query, page } = opts;

  if (query) {
    const q = encodeURIComponent(query);
    const p = page && page > 1 ? `?page=${page}` : '';
    return `${BUSINESSLIST_BASE}/search?q=${q}${p}`;
  }

  const cat = category ? encodeURIComponent(category.toLowerCase().replace(/\s+/g, '_')) : '';
  const loc = location ? encodeURIComponent(location.toLowerCase().replace(/\s+/g, '-')) : '';

  if (cat && loc) {
    const p = page && page > 1 ? `?page=${page}` : '';
    return `${BUSINESSLIST_BASE}/category/${cat}/${loc}${p}`;
  }
  if (cat) {
    const p = page && page > 1 ? `?page=${page}` : '';
    return `${BUSINESSLIST_BASE}/category/${cat}${p}`;
  }
  if (loc) {
    const p = page && page > 1 ? `?page=${page}` : '';
    return `${BUSINESSLIST_BASE}/location/${loc}${p}`;
  }

  return BUSINESSLIST_BASE;
}
