// GET /api/discovery?place=lagos&category=restaurant — crawlable discovery.
//
// Reached the same way the profile renderer is: middleware.ts rewrites a
// crawler's request for /businesses/in/:place and /businesses/:category/in/:place
// here, so the indexed URL stays the one people actually share. Also reachable
// directly, which is how to test it:
//
//   curl '/api/discovery?place=lagos'
//   curl '/api/discovery?place=lagos&category=restaurant'
//
// Reads with the ANON key, like the sitemap and the profile renderer — the RLS
// policy is the single place that decides what is public, so a service-role read
// here would quietly bypass the rule that keeps synthetic prospects out of
// search.
//
// Relative imports carry .js because this file is reachable from api/ and Node
// ESM will not resolve them otherwise. scripts/check-api-imports.mjs enforces it.

import {
  renderDiscoveryPage, slugify, unslugify, MIN_INDEXABLE,
  type DiscoveryPage, type DiscoveryListing,
} from '../src/lib/discoveryPageRender.js';
import { publicOpenState } from '../src/lib/openingHours.js';

const SITE_URL = process.env.APP_BASE_URL || 'https://nowopenafrica.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

interface VercelRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}
interface VercelResponse {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
}

interface Row {
  id: string;
  name: string;
  username: string | null;
  category: string | null;
  location: string | null;
  description: string | null;
  opening_hours: string | null;
  hours: string | null;
  timezone: string | null;
  open_status: string | null;
  claim_status: string | null;
  data_status: string | null;
}

async function rest<T>(path: string): Promise<T[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? (rows as T[]) : [];
  } catch {
    return [];
  }
}

const one = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * How the open state is described in HTML.
 *
 * Derived from the same publicOpenState the app uses, so the rendered page and
 * the live page cannot disagree about whether a shop is open — which is the
 * rule that keeps dynamic rendering legitimate.
 */
function openLabel(row: Row, now: Date): string | null {
  const state = publicOpenState(row, now);
  if (state.kind === 'open') return 'Open now';
  if (state.kind === 'closing-soon') return 'Closing soon';
  return null;
}

const hasHours = (row: Row): boolean =>
  !!(row.opening_hours?.trim() || row.hours?.trim());

/**
 * Is anybody accountable for this record?
 *
 * An owner has claimed it, or it arrived from an authorised source. Everything
 * else — demo data and unclaimed prospects — may be shown but must not earn a
 * ranking. All 32 currently listed businesses fail this: fabricated phone
 * numbers, emails on invented domains, websites that do not resolve.
 */
const hasProvenance = (row: Row): boolean =>
  row.claim_status === 'claimed' || row.data_status === 'imported_authorized';

/**
 * The canonical label for a category slug, taken from the rows it matched.
 *
 * The slug is lossy — "restaurant" could be "Restaurant & Food" or
 * "Restaurants". Counting the matched rows picks the label the inventory
 * actually uses, so the heading matches what a visitor sees on the cards
 * beneath it.
 */
function resolveCategoryLabel(rows: Row[], slug: string): string {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const label = r.category?.trim();
    if (!label) continue;
    if (!slugify(label).includes(slug) && !slug.includes(slugify(label))) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let best: string | null = null;
  let most = 0;
  for (const [label, n] of counts) if (n > most) { best = label; most = n; }
  return best ?? unslugify(slug);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const placeSlug = slugify(one(req.query.place));
  const categorySlug = slugify(one(req.query.category));

  // PostgREST filters. `is_listable` is the public-visibility rule; never drop
  // it, or the 500 hidden synthetic prospects reach search.
  const filters = ['is_listable=eq.true'];
  if (placeSlug) filters.push(`location=ilike.*${encodeURIComponent(unslugify(placeSlug))}*`);
  if (categorySlug) filters.push(`category=ilike.*${encodeURIComponent(unslugify(categorySlug))}*`);

  // claim_status and data_status decide whether a listing may earn a ranking —
  // see isIndexable. Selected, not inferred.
  const select = 'id,name,username,category,location,description,opening_hours,hours,timezone,open_status,claim_status,data_status';
  const rows = await rest<Row>(
    `businesses?select=${select}&${filters.join('&')}&order=listing_score.desc,created_at.desc&limit=60`,
  );

  const now = new Date();
  const listings: DiscoveryListing[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    username: r.username,
    category: r.category,
    location: r.location,
    description: r.description,
    openLabel: openLabel(r, now),
    hasHours: hasHours(r),
    hasProvenance: hasProvenance(r),
  }));

  /*
   * The place name comes from the SLUG, not from a matched row.
   *
   * Taking it from rows[0].location produced "Businesses in Ikotun" on
   * /businesses/in/lagos, because the highest-scoring Lagos business sits in a
   * sub-area and its location string leads with that. The requested place is
   * the slug; it is correct by construction and cannot drift with the sort.
   */
  const place = placeSlug ? unslugify(placeSlug) : null;

  /*
   * The category, though, is worth resolving against real data — the slug
   * "restaurant" should display as the canonical "Restaurant & Food". Picks the
   * most common matching label among the rows, falling back to the de-slugged
   * form when nothing matches.
   */
  const category = categorySlug ? resolveCategoryLabel(rows, categorySlug) : null;

  const path = categorySlug && placeSlug
    ? `/businesses/${categorySlug}/in/${placeSlug}`
    : placeSlug ? `/businesses/in/${placeSlug}`
    : '/businesses';

  // Internal links, from real inventory only — a link to an empty page is worse
  // than no link.
  const relatedCategories = placeSlug
    ? [...new Set(rows.map((r) => r.category).filter(Boolean) as string[])]
        .filter((c) => slugify(c) !== categorySlug)
        .slice(0, 8)
        .map((c) => ({ label: c, path: `/businesses/${slugify(c)}/in/${placeSlug}` }))
    : [];

  const allPlaces = await rest<{ location: string | null }>(
    'businesses?select=location&is_listable=eq.true&limit=500',
  );
  const relatedPlaces = [...new Set(
    allPlaces.map((r) => r.location?.split(',')[0]?.trim()).filter(Boolean) as string[],
  )]
    .filter((c) => slugify(c) !== placeSlug)
    .slice(0, 8)
    .map((c) => ({ label: c, path: `/businesses/in/${slugify(c)}` }));

  const page: DiscoveryPage = {
    siteUrl: SITE_URL,
    path,
    place,
    category,
    total: listings.length,
    listings,
    relatedCategories,
    relatedPlaces,
  };

  const html = renderDiscoveryPage(page, MIN_INDEXABLE);

  /*
   * Cached at the edge. Discovery listings change when a business is added or
   * edited, not by the second, so a five-minute cache with a long
   * stale-while-revalidate keeps crawl cost low without serving stale hours —
   * the open/closed label is the only time-sensitive part and it is recomputed
   * on every revalidation.
   */
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
  res.status(200).send(html);
}
