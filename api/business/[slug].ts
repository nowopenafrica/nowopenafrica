// GET /api/business/:slug — the crawlable business profile.
//
// Reached two ways:
//   1. middleware.ts rewrites a crawler's request for /:username here, so the
//      shared and indexed URL stays the one people actually use.
//   2. Directly, which is how you test it: curl /api/business/mama-put
//
// Same reasoning as api/r/[id].ts and api/live/[id].ts — a Supabase Edge
// Function cannot serve HTML (their gateway forces text/plain), so anything a
// crawler must read has to be a Vercel function on our own domain.
//
// Reads with the ANON key. Every table it touches is publicly readable by RLS,
// because all of it is already on the public profile.

import { renderBusinessPage } from '../../src/lib/businessPageRender.js';
import type {
  ProfileBusiness, ProfileProduct, ProfileService, ProfileReview,
} from '../../src/lib/businessPageRender.js';
import type { BusinessLocation } from '../../src/lib/locations.js';

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
 * How many rows match, without fetching them.
 *
 * PostgREST returns the total in Content-Range when asked for an exact count.
 * Needed because aggregateRating must state the count the average was taken
 * over — claiming a 4.6 from "10 reviews" when the average spans 24 is invalid
 * structured data, and Google treats invalid markup worse than absent markup.
 */
async function count(path: string): Promise<number> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return 0;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'HEAD',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    });
    const total = res.headers.get('content-range')?.split('/')[1];
    const n = Number(total);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

const BUSINESS_COLUMNS = [
  'id', 'username', 'name', 'description', 'category', 'location', 'phone', 'email',
  'website', 'image_url', 'logo_url', 'rating', 'verified', 'opening_hours', 'hours',
  'timezone', 'open_status',
  // Decide indexability, not display — see isIndexableProfile.
  'claim_status', 'data_status',
].join(',');

const isUuid = (s: string) => /^[0-9a-fA-F]{8}-[0-9a-fA-F-]{20,30}$/.test(s);

/**
 * Find the business by whichever form the URL used.
 *
 * A username is the shared form; the uuid path still exists for businesses that
 * never claimed one. The username lookup is exact — no ilike — so one business
 * can never be served under another's name.
 */
async function findBusiness(slug: string): Promise<ProfileBusiness | null> {
  const key = isUuid(slug) ? 'id' : 'username';
  const rows = await rest<ProfileBusiness>(
    `businesses?select=${BUSINESS_COLUMNS}&${key}=eq.${encodeURIComponent(slug)}&limit=1`,
  );
  return rows[0] ?? null;
}

function notFound(res: VercelResponse) {
  res.status(404);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">`
    + `<title>Business not found — NowOpen Africa</title><meta name="robots" content="noindex">`
    + `</head><body><h1>Business not found</h1>`
    + `<p><a href="${SITE_URL}/businesses">Browse businesses on NowOpen Africa</a></p>`
    + `</body></html>`,
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405);
    res.send('Method not allowed');
    return;
  }

  const raw = req.query.slug;
  const slug = (Array.isArray(raw) ? raw[0] : raw || '').trim();
  // Usernames are short and alphanumeric-ish; anything else is not worth a
  // database round trip.
  if (!slug || slug.length > 64 || !/^[A-Za-z0-9._-]+$/.test(slug)) return notFound(res);

  const business = await findBusiness(slug);
  if (!business) return notFound(res);

  const id = encodeURIComponent(business.id);
  // Fetched together; each failure degrades to an empty section rather than a
  // failed page, because a profile with no products is still worth indexing.
  const [products, services, reviews, reviewCount, locations] = await Promise.all([
    rest<ProfileProduct>(`business_products?select=id,name,description,price,image_url&business_id=eq.${id}&order=created_at&limit=60`),
    rest<ProfileService>(`business_services?select=id,name,description,price&business_id=eq.${id}&order=created_at&limit=60`),
    rest<ProfileReview>(`business_reviews?select=id,author_name,rating,comment,created_at&business_id=eq.${id}&order=created_at.desc&limit=10`),
    count(`business_reviews?select=id&business_id=eq.${id}`),
    rest<BusinessLocation>(`business_locations?select=id,name,address,phone,opening_hours,timezone,open_status,latitude,longitude,is_primary&business_id=eq.${id}&limit=50`),
  ]);

  const html = renderBusinessPage({
    business,
    products,
    services,
    reviews,
    // The TOTAL, not reviews.length — the page shows ten but the rating averages
    // all of them, and aggregateRating must agree with itself.
    reviewCount,
    locations,
    siteUrl: SITE_URL,
  });

  res.status(200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Short enough that an owner's edit shows up the same day, long enough to
  // absorb a crawl. The open/closed line is time-sensitive, which is the real
  // ceiling here.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
  res.send(html);
}
