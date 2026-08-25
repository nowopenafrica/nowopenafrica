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

const SITE_URL = (process.env.APP_BASE_URL || 'https://nowopenafrica.com').replace(/\/$/, '');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

/** Sitemaps cap at 50,000 URLs; well under it, but the guard is cheap. */
const MAX_URLS = 45000;
const PER_TABLE = 5000;

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
  { loc: '/adverts', changefreq: 'daily', priority: '0.8' },
  { loc: '/media', changefreq: 'daily', priority: '0.8' },
  { loc: '/platform', changefreq: 'weekly', priority: '0.7' },
  { loc: '/pricing', changefreq: 'weekly', priority: '0.7' },
  { loc: '/waitlist', changefreq: 'weekly', priority: '0.6' },
  { loc: '/about', changefreq: 'monthly', priority: '0.5' },
  { loc: '/contact', changefreq: 'monthly', priority: '0.5' },
  { loc: '/founder', changefreq: 'monthly', priority: '0.4' },
  { loc: '/terms', changefreq: 'yearly', priority: '0.2' },
  { loc: '/privacy', changefreq: 'yearly', priority: '0.2' },
];

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
    // A sitemap that omits listings is a bad day; one that 500s tells search
    // engines the whole site is broken. Degrade to the static routes instead.
    return [];
  }
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
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).send('Method not allowed');
    return;
  }

  const [businesses, adverts, media] = await Promise.all([
    rest<BusinessRow>(
      `businesses?select=id,username,category,location,updated_at,created_at&order=updated_at.desc&limit=${PER_TABLE}`,
    ),
    rest<{ id: string; updated_at?: string; created_at?: string }>(
      `advertisements?select=id,updated_at,created_at&order=created_at.desc&limit=${PER_TABLE}`,
    ),
    rest<{ id: string; updated_at?: string; created_at?: string }>(
      `media_services?select=id,updated_at,created_at&order=created_at.desc&limit=${PER_TABLE}`,
    ),
  ]);

  const entries: UrlEntry[] = [...STATIC_ROUTES];

  // Discovery pages come before individual listings: they are the pages that
  // rank for what people search, and they only exist where the data supports
  // them (see discoveryPages).
  for (const page of discoveryPages(businesses)) {
    entries.push({
      loc: `/${page.path}`,
      changefreq: 'daily',
      // A denser page is a better landing page, and says so.
      priority: page.count >= 10 ? '0.9' : page.count >= 5 ? '0.8' : '0.7',
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

  for (const a of adverts) {
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
    ...entries.slice(0, MAX_URLS).map(urlXml),
    '</urlset>',
  ].join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  // Long enough that crawlers are not re-querying the database constantly,
  // short enough that a business signing up is discoverable the same day.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(body);
}
