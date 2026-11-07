// GET /sitemap.xml — the live sitemap.
//
// WHY THIS REPLACES THE STATIC FILE
//
// public/sitemap.xml listed twelve hand-written routes and not one listing.
// Its own comment admitted the gap. So every business, advert and media
// service on the platform was reachable by search engines only if a crawler
// happened to follow links through a JavaScript app — which is the slowest and
// least reliable way to be found, and it does not improve as the platform
// grows.
//
// This route enumerates the real thing on every request. A business that signs
// up today is in the sitemap today, with no deploy and nobody remembering to
// do it. That is the part that compounds: the discovery surface expands
// automatically with each listing.
//
// Same hosting reasoning as api/r/[id].ts — Supabase's function gateway forces
// text/plain, so XML has to be served from our own domain.
//
// Reads with the ANON key deliberately: every table it touches is publicly
// readable under RLS, and a sitemap may only ever contain public URLs. Using
// the service role here would risk listing something RLS hides.

import { discoveryPages, type DiscoverableListing } from '../src/lib/discoveryPages.js';
import { isIndexableProfile } from '../src/lib/businessPageRender.js';
/*
 * The renderer's own threshold, imported rather than restated. A sitemap that
 * submits a URL the page then answers with `noindex` asks a crawler to consider
 * something and immediately tells it not to — see the measurement below.
 */
import { MIN_INDEXABLE } from '../src/lib/discoveryPageRender.js';
import { isListedPlacement } from '../src/lib/promote/listing.js';

const SITE_URL = (process.env.APP_BASE_URL || 'https://www.nowopenafrica.com').replace(/\/$/, '');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

/** Sitemaps cap at 50,000 URLs; well under it, but the guard is cheap. */
const MAX_URLS = 45000;

/**
 * How many rows we are willing to read per table.
 *
 * NOT the number PostgREST will return in one response — see PAGE_SIZE.
 */
const PER_TABLE = 5000;

/**
 * PostgREST's own hard ceiling on a single response, and the reason this file
 * pages at all.
 *
 * MEASURED 2026-09-14 against production: `?limit=5000` returned 1000 rows,
 * and so did `?limit=2000`. The server's `db-max-rows` setting silently
 * truncates the result and says nothing about it — no error, no flag, just a
 * shorter array than you asked for.
 *
 * The damage that caused: the sitemap contained exactly 1000 business profiles
 * while 2,980 cleared the indexability bar. Roughly two thousand real,
 * qualifying profiles — two thirds of the directory — had never once been
 * submitted to a search engine, and nothing anywhere reported a problem,
 * because asking for 5000 and receiving 1000 looks identical to a directory
 * that only has 1000 businesses in it.
 *
 * It also starved the discovery pages: `discoveryPages()` counts listings to
 * decide which city and category pages are dense enough to exist, so it was
 * making that judgement on a third of the data. 56 place pages existed against
 * 277 distinct locations on file.
 */
const PAGE_SIZE = 1000;

interface VercelRequest { method?: string }
interface VercelResponse {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
}

interface UrlEntry {
  loc: string;
  lastmod?: string;
  changefreq: string;
  priority: string;
}

/** The static routes worth indexing. Auth, dashboard and admin are all absent on purpose. */
const STATIC_ROUTES: UrlEntry[] = [
  { loc: '/', changefreq: 'daily', priority: '1.0' },
  { loc: '/businesses', changefreq: 'daily', priority: '0.9' },
  { loc: '/discover', changefreq: 'daily', priority: '0.9' },
  /*
   * The acquisition routes. These were absent, which meant the pages whose
   * entire job is to be found by a business owner searching for how to get
   * listed were the pages never submitted for indexing.
   *
   * /join/business is deliberately NOT here: it is an alias of /add-business
   * and canonicalises to it, so listing both would submit one page twice.
   */
  { loc: '/add-business', changefreq: 'weekly', priority: '0.9' },
  { loc: '/send-business', changefreq: 'weekly', priority: '0.7' },
  { loc: '/nominate', changefreq: 'weekly', priority: '0.6' },
  { loc: '/open-now', changefreq: 'daily', priority: '0.7' },
  { loc: '/adverts', changefreq: 'daily', priority: '0.8' },
  { loc: '/media', changefreq: 'daily', priority: '0.8' },
  /* Creators, services, packs and credits - split off /media. */
  { loc: '/media/services', changefreq: 'weekly', priority: '0.7' },
  { loc: '/platform', changefreq: 'weekly', priority: '0.7' },
  { loc: '/pricing', changefreq: 'weekly', priority: '0.7' },
  { loc: '/waitlist', changefreq: 'weekly', priority: '0.6' },
  { loc: '/about', changefreq: 'monthly', priority: '0.5' },
  { loc: '/contact', changefreq: 'monthly', priority: '0.5' },
  { loc: '/founder', changefreq: 'monthly', priority: '0.4' },
  { loc: '/terms', changefreq: 'yearly', priority: '0.2' },
  { loc: '/privacy', changefreq: 'yearly', priority: '0.2' },
];

/** One request. `path` must already carry its own select and order. */
async function restPage<T>(path: string): Promise<T[] | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? (rows as T[]) : null;
  } catch {
    return null;
  }
}

/**
 * Every row up to `cap`, fetched in PAGE_SIZE pages.
 *
 * `path` supplies the select and the order; this adds `limit` and `offset`.
 * The caller's order MUST end in a unique tiebreaker (`id`), because offset
 * paging over a non-unique sort lets a row shift between requests — showing
 * one twice and another not at all. A duplicated <loc> is a real defect in a
 * sitemap, so `dedupe` below is a second belt on the same trousers.
 *
 * Stops early on a short page, which is how the last page announces itself.
 *
 * On failure it returns what it already has rather than nothing: a sitemap
 * missing its tail is worth far more to a crawler than one that 500s, which
 * reads as a site that is broken in its entirety.
 */
async function rest<T>(path: string, cap = PER_TABLE): Promise<T[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return [];
  const out: T[] = [];
  for (let offset = 0; offset < cap; offset += PAGE_SIZE) {
    const size = Math.min(PAGE_SIZE, cap - offset);
    const sep = path.includes('?') ? '&' : '?';
    const page = await restPage<T>(`${path}${sep}limit=${size}&offset=${offset}`);
    if (page === null) break;
    out.push(...page);
    // A page shorter than requested is the end of the table. It is also what a
    // server-side row cap looks like, which is why PAGE_SIZE matches that cap
    // rather than exceeding it.
    if (page.length < size) break;
  }
  return out;
}

/** Keep the first entry per URL. Belt to the tiebreaker's braces. */
function dedupe(entries: UrlEntry[]): UrlEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.loc)) return false;
    seen.add(e.loc);
    return true;
  });
}

/** XML text escaping. A business called "Bar & Grill" must not break the document. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isoDay(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function urlXml(entry: UrlEntry): string {
  const parts = [`<loc>${xmlEscape(SITE_URL + entry.loc)}</loc>`];
  if (entry.lastmod) parts.push(`<lastmod>${entry.lastmod}</lastmod>`);
  parts.push(`<changefreq>${entry.changefreq}</changefreq>`);
  parts.push(`<priority>${entry.priority}</priority>`);
  return `  <url>${parts.join('')}</url>`;
}

interface BusinessRow extends DiscoverableListing {
  id: string;
  username?: string | null;
  /** Accountability, not display. Decides whether the URL may be submitted. */
  claim_status?: string | null;
  listing_score?: number | null;
  data_status?: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).send('Method not allowed');
    return;
  }

  const [allBusinesses, adverts, media, projects] = await Promise.all([
    /*
     * `id` closes every order below. `updated_at` and `created_at` are not
     * unique — a bulk import stamps hundreds of rows with the same second —
     * so without it the page boundaries are undefined and rows fall through
     * the gaps between requests.
     */
    rest<BusinessRow>(
      'businesses?select=id,username,category,location,updated_at,created_at,claim_status,data_status,listing_score'
      + '&order=updated_at.desc,id.asc',
    ),
    rest<{ id: string; user_id?: string | null; owner_id?: string | null; lifecycle?: string | null; updated_at?: string; created_at?: string }>(
      'advertisements?select=id,user_id,owner_id,lifecycle,updated_at,created_at&order=created_at.desc,id.asc',
    ),
    rest<{ id: string; updated_at?: string; created_at?: string }>(
      'media_services?select=id,updated_at,created_at&order=created_at.desc,id.asc',
    ),
    /*
     * Project stories. `slug` is the shareable form; rows that predate slugs
     * fall back to their id, which is what their public URL already uses.
     * Selecting a column the migration has not created yet returns no rows,
     * so a fresh environment simply omits projects rather than failing.
     */
    rest<{ id: string; slug?: string | null; business_id: string; updated_at?: string; created_at?: string }>(
      'business_projects?select=id,slug,business_id,updated_at,created_at'
      + '&published=eq.true&order=created_at.desc,id.asc',
    ),
  ]);

  /*
   * A sitemap is a request to index. It must not contain pages the site itself
   * answers with `noindex` — that asks a crawler to consider a URL and then
   * tells it not to, which wastes crawl budget and reads as a site that does
   * not know its own mind.
   *
   * So this calls `isIndexableProfile` rather than restating its rule. The two
   * had the same logic written out twice, and when the rule gained a quality
   * requirement only one copy would have changed — which is the exact failure
   * this comment warns about.
   *
   * The rule: an owner who claimed it is accountable whatever the score; an
   * imported record has nobody vouching for its content, so the content has to
   * clear MIN_INDEXABLE_SCORE.
   *
   * MEASURED 2026-09-08: 100 profiles imported that morning averaged a score
   * of 30, and every one was in this sitemap while Discover was hiding all of
   * them as too thin to show.
   */
  const businesses = allBusinesses.filter((b) => isIndexableProfile({
    claim_status: b.claim_status,
    data_status: b.data_status,
    listing_score: b.listing_score,
  } as Parameters<typeof isIndexableProfile>[0]));

  const entries: UrlEntry[] = [...STATIC_ROUTES];

  // Discovery pages come before individual listings: they are the pages that
  // rank for what people search, and they only exist where the data supports
  // them (see discoveryPages).
  /*
   * MEASURED 2026-09-15, BEFORE THIS THRESHOLD WAS PASSED
   *
   * discoveryPages() defaulted to MIN_LISTINGS_PER_PAGE (3) while the renderer
   * required MIN_INDEXABLE (5) accountable listings. The sitemap submitted 220
   * discovery pages; sampling 40 of them through Googlebot returned `noindex`
   * on 40 of 40.
   *
   * Every row in `businesses` here has already passed isIndexableProfile, so it
   * is accountable by definition — which makes counting five of THESE at least
   * as strict as the renderer counting five accountable ones. A page that
   * reaches the sitemap is therefore guaranteed to be served `index`.
   */
  for (const page of discoveryPages(businesses, MIN_INDEXABLE)) {
    entries.push({
      loc: `/${page.path}`,
      changefreq: 'daily',
      // A denser page is a better landing page, and says so.
      priority: page.count >= 20 ? '0.9' : page.count >= 10 ? '0.8' : '0.7',
    });
  }

  for (const b of businesses) {
    // The branded URL when the owner has claimed one — that is the link they
    // share, so it is the one that should accumulate authority.
    entries.push({
      loc: b.username ? `/${b.username}` : `/businesses/${b.id}`,
      lastmod: isoDay(b.updated_at) ?? isoDay(b.created_at),
      changefreq: 'weekly',
      priority: '0.7',
    });
  }

  /*
   * Published project stories.
   *
   * Only for businesses already in the indexable set above: submitting a
   * project page whose owner profile we would not submit is asking a crawler to
   * trust a page we do not yet stand behind. Drafts never appear here — the
   * query filters `published = true`, and the renderer additionally returns
   * `noindex` for anything it cannot confirm as published.
   */
  const indexableBusinesses = new Set(businesses.map((b) => b.id));
  for (const project of projects) {
    if (!project.business_id || !indexableBusinesses.has(project.business_id)) continue;
    entries.push({
      loc: `/work/${encodeURIComponent(project.slug || project.id)}`,
      lastmod: isoDay(project.updated_at) ?? isoDay(project.created_at),
      changefreq: 'monthly',
      priority: '0.5',
    });
  }

  /*
   * The same accountability rule the business listings above are held to, now
   * applied to advertising inventory — which it never was.
   *
   * Measured: `advertisements` holds 97 rows, 89 of them `status = 'active'`,
   * and `user_id` is NULL on every single one. They name specific real-world
   * third-party sites — "2 Double-Sided Freestanding Screens, The Palms,
   * Lekki", "16 Digital Screens, Railway Ticketing & Waiting Area, Lagos" —
   * with day rates attached, and all 97 were being submitted for indexing.
   *
   * Whether NowOpen holds the rights to broker those placements cannot be
   * established from the data, and it must not be guessed. So the rule is the
   * conservative one and it is the same rule as above: no accountable owner,
   * no request to index. Nothing is deleted and nothing is marked verified —
   * the rows stay exactly as they are, and re-enter the sitemap the moment a
   * real owner or a verified rights record is attached.
   *
   * This also removes pure noise: every one of these URLs served the home
   * page's title and a canonical pointing at `/`, so submitting them asked
   * Google to index 97 declared duplicates of the front page.
   */
  // An accountable owner is either a legacy account (user_id) or a media
  // owner from the partner portal (owner_id). Portal placements keep user_id
  // NULL by design, so checking user_id alone kept every one of them out.
  // And never a placement that is not public: pending_review, rejected or
  // archived (listing.ts). AdvertDetail answers those with "not listed".
  const accountableAdverts = adverts.filter((a) => !!a.user_id || !!a.owner_id)
    .filter(isListedPlacement);

  for (const a of accountableAdverts) {
    entries.push({
      loc: `/adverts/${a.id}`,
      lastmod: isoDay(a.updated_at) ?? isoDay(a.created_at),
      changefreq: 'weekly',
      priority: '0.6',
    });
  }

  for (const m of media) {
    entries.push({
      loc: `/media/${m.id}`,
      lastmod: isoDay(m.updated_at) ?? isoDay(m.created_at),
      changefreq: 'weekly',
      priority: '0.6',
    });
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...dedupe(entries).slice(0, MAX_URLS).map(urlXml),
    '</urlset>',
  ].join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  // Long enough that crawlers are not re-querying the database constantly,
  // short enough that a business signing up is discoverable the same day.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(body);
}
