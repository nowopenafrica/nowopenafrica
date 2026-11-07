// GET /api/project/:slug — the crawlable project story.
//
// Reached two ways:
//   1. middleware.ts rewrites a crawler's request for /work/:slug here, so the
//      shared URL stays the one people use.
//   2. Directly, which is how you test it: curl /api/project/my-project-a1b2c3
//
// Same reasoning as api/business/[slug].ts — Supabase Edge Functions force
// text/plain, so anything a crawler must read has to be a Vercel function on
// our own domain.
//
// Reads with the ANON key. `business_projects` is publicly readable for
// published rows under RLS, and this route additionally filters
// `published = true` so a draft can never be rendered even if a policy changes.

import { renderProjectPage } from '../../src/lib/projectPageRender.js';
import type {
  ProjectPageBusiness, ProjectPageProject,
} from '../../src/lib/projectPageRender.js';

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

const PROJECT_COLUMNS = [
  'id', 'business_id', 'title', 'summary', 'client', 'location', 'completed_on',
  'cover_url', 'cover_video_url', 'category', 'images', 'link_url', 'tags',
  'sections', 'details', 'results', 'seo_title', 'seo_description', 'slug',
  'updated_at', 'published',
].join(',');

/*
 * The columns that existed before project stories. Used only when the richer
 * select returns nothing, so an unapplied migration degrades to the original
 * portfolio rather than hiding every row.
 */
const LEGACY_COLUMNS = [
  'id', 'business_id', 'title', 'summary', 'client', 'location', 'completed_on',
  'cover_url', 'images', 'link_url', 'tags', 'updated_at', 'published',
].join(',');

const BUSINESS_COLUMNS = [
  'id', 'username', 'name', 'category', 'location', 'phone', 'email', 'website',
  'image_url', 'logo_url',
].join(',');

const isUuid = (s: string) => /^[0-9a-fA-F]{8}-[0-9a-fA-F-]{20,30}$/.test(s);

async function findProject(slug: string): Promise<ProjectPageProject | null> {
  const key = isUuid(slug) ? 'id' : 'slug';
  const where = `business_projects?select=${PROJECT_COLUMNS}`
    + `&${key}=eq.${encodeURIComponent(slug)}&published=eq.true&limit=1`;

  const rows = await rest<ProjectPageProject>(where);
  if (rows[0]) return rows[0];

  const legacy = await rest<ProjectPageProject>(
    `business_projects?select=${LEGACY_COLUMNS}`
    + `&${key}=eq.${encodeURIComponent(slug)}&published=eq.true&limit=1`,
  );
  return legacy[0] ?? null;
}

async function findBusiness(id: string): Promise<ProjectPageBusiness | null> {
  const rows = await rest<ProjectPageBusiness>(
    `businesses?select=${BUSINESS_COLUMNS}&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  return rows[0] ?? null;
}

async function findRelated(
  businessId: string,
  excludeId: string,
): Promise<ProjectPageProject[]> {
  const where = (columns: string) =>
    `business_projects?select=${columns}`
    + `&business_id=eq.${encodeURIComponent(businessId)}`
    + `&id=neq.${encodeURIComponent(excludeId)}`
    + '&published=eq.true&order=position.asc,created_at.desc&limit=3';

  const rows = await rest<ProjectPageProject>(where(PROJECT_COLUMNS));
  if (rows.length) return rows;
  return rest<ProjectPageProject>(where(LEGACY_COLUMNS));
}

function notFound(res: VercelResponse) {
  res.status(404);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.send(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>Project not found — NowOpen Africa</title><meta name="robots" content="noindex">`
    + `</head><body style="font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:0 auto;padding:40px 16px">`
    + `<h1>Project not found</h1>`
    + `<p>This project does not exist, or it has not been published.</p>`
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
  if (!slug || slug.length > 128 || !/^[A-Za-z0-9._-]+$/.test(slug)) return notFound(res);

  const project = await findProject(slug);
  if (!project) return notFound(res);

  const business = await findBusiness(project.business_id || '');
  // A project without a resolvable owner cannot be attributed, and an
  // unattributed project page is not something to serve or index.
  if (!business) return notFound(res);

  const related = await findRelated(business.id, project.id);

  const html = renderProjectPage({
    project,
    business,
    related,
    siteUrl: SITE_URL,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
  res.status(200).send(html);
}
