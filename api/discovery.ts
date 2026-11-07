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
/*
 * The SAME constant the sitemap's page set is built from. Internal links and
 * submitted URLs must agree by construction: a link to a page the site then
 * answers with `noindex` spends crawl budget to say "never mind".
 */
import { relatedPlaces } from '../src/lib/discoveryPages.js';

const SITE_URL = process.env.APP_BASE_URL || 'https://www.nowopenafrica.com';
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
  // Narrow, not string: publicOpenState only recognises these two, and a wider
  // type here made Row unassignable to OpenStateInput — an error tsconfig.app
  // never sees, because it does not cover api/ or middleware.ts.
  open_status: 'open' | 'closed' | null;
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

/**
 * PostgREST's server-side row cap. Measured at 1000 on this project.
 *
 * `limit` sets what you ASK for; this is what you GET, and the difference is
 * silent — no error, no header anybody reads, just a shorter array. See
 * api/sitemap.xml.ts, where the same cap kept two thirds of the directory out
 * of search for as long as the sitemap existed.
 */
const PAGE_SIZE = 1000;

/** Every row up to `cap`, paged. `path` supplies its own select and order. */
async function restAll<T>(path: string, cap: number): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < cap; offset += PAGE_SIZE) {
    const size = Math.min(PAGE_SIZE, cap - offset);
    const sep = path.includes('?') ? '&' : '?';
    const page = await rest<T>(`${path}${sep}limit=${size}&offset=${offset}`);
    out.push(...page);
    if (page.length < size) break;
  }
  return out;
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
  // `profile_state` keeps submissions awaiting review out of the pages a
  // crawler is served, the same rule the browser-side directory applies.
  const filters = ['is_listable=eq.true', 'profile_state=eq.published'];
  if (placeSlug) filters.push(`location=ilike.*${encodeURIComponent(unslugify(placeSlug))}*`);

  /*
   * THE CATEGORY IS MATCHED ON THE SLUG, NOT ON A RECONSTRUCTED LABEL.
   *
   * This filter used to be `category=ilike.*${unslugify(categorySlug)}*`, and
   * that round trip is lossy in a way that silently emptied most of the site:
   *
   *   slugify('Hospital & Clinic')      -> 'hospital-and-clinic'   (& becomes " and ")
   *   unslugify('hospital-and-clinic')  -> 'Hospital And Clinic'   (the word "and")
   *   category ILIKE '%Hospital And Clinic%'  ->  matches NOTHING
   *
   * MEASURED 2026-09-15: 25 categories contain "&", and they hold 2,657 of the
   * 3,118 businesses on the platform — 85% of the directory. Every
   * category-in-place page for all of them rendered "No businesses listed here
   * yet." /businesses/hospital-and-clinic/in/lagos — the largest category in
   * the largest city, 1,669 hospitals behind it — was an empty page served to
   * crawlers and to people.
   *
   * Reversing a lossy transform cannot be made reliable, so this stops trying.
   * The place narrows the query in SQL (the largest place holds 503 rows, so one
   * page covers it), and the category is then matched by comparing slugs, which
   * is exactly the comparison discoveryPages() used to mint the URL in the first
   * place. Same function both ends, so the two cannot disagree.
   */
  // claim_status and data_status decide whether a listing may earn a ranking —
  // see isIndexable. Selected, not inferred.
  const select = 'id,name,username,category,location,description,opening_hours,hours,timezone,open_status,claim_status,data_status';
  const fetched = await restAll<Row>(
    `businesses?select=${select}&${filters.join('&')}&order=listing_score.desc,created_at.desc,id.asc`,
    // Generous: the largest place holds 503. The cap exists so a future
    // mis-slugged place cannot walk the whole table.
    5000,
  );

  const matched = categorySlug
    ? fetched.filter((r) => slugify(r.category ?? '') === categorySlug)
    : fetched;

  /*
   * How many the page really holds, before the display cap. `total` is what the
   * heading and the description quote, so taking it from the capped array made
   * a city with 300 listings announce 60.
   */
  const matchedTotal = matched.length;
  const rows = matched.slice(0, 60);

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

  /*
   * WHERE ELSE TO GO — and it has to be somewhere that exists.
   *
   * This read used to be `limit=500` with no ORDER BY, and then took the first
   * eight distinct places out of whatever came back. Two things followed, both
   * measured on /businesses/in/lagos on 2026-09-14:
   *
   *   /businesses/in/3-lekki-road  — a street address, filed as a place because
   *                                  it is what sits before the first comma in
   *                                  one listing's location. One listing, so the
   *                                  page renders `noindex`, and it reads to a
   *                                  person like the directory does not know the
   *                                  difference between a city and a doorway.
   *   /businesses/in/ikotun        — a real town, but below the density
   *                                  threshold, so also `noindex`.
   *
   * Two of the eight links on the most important city page in the directory
   * pointed at pages the site itself asks not to be indexed. Unordered also
   * means unstable: PostgREST returns rows in whatever order it likes, so the
   * eight changed between cache refreshes and no link ever accumulated value.
   *
   * Counting fixes all of it at once. A place with enough listings behind it is
   * a real place almost by definition — a street address has one — so ranking
   * by density filters the junk without a list of banned words to maintain, and
   * the densest neighbours are also the best pages to send a reader to.
   */
  const allPlaces = await restAll<{ location: string | null }>(
    'businesses?select=location,id&is_listable=eq.true&profile_state=eq.published&order=id.asc',
    20000,
  );

  // Ranked and thresholded in discoveryPages.ts, which is also where the
  // sitemap's page set comes from — one rule, one place, tested once.
  const related = relatedPlaces(allPlaces, placeSlug);

  const page: DiscoveryPage = {
    siteUrl: SITE_URL,
    path,
    place,
    category,
    total: matchedTotal,
    listings,
    relatedCategories,
    relatedPlaces: related.map(({ label, path }) => ({ label, path })),
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
