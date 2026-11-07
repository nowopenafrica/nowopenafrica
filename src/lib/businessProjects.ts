/**
 * Finished work shown on a business profile.
 *
 * The tab is called "Portfolio" or "Projects" depending on the trade — see
 * `portfolioLabel` in data/categoryTabLabels.ts — but the data is one shape,
 * because the thing being described is the same: a job that was done, for
 * somebody, that the next customer should see.
 *
 * ── EMPTY IS NOT THE SAME AS UNAVAILABLE ─────────────────────────────────
 *
 * This product has made that mistake before, in the other direction: eleven
 * admin panels reported an EMPTY table as a missing migration. Here the risk
 * is the reverse, and worse, because it faces the public — if the table does
 * not exist yet, a plain `catch` would render "no projects yet" on a profile
 * belonging to a builder with thirty of them.
 *
 * So a read has three outcomes, not two: rows, none, or **we could not ask**.
 * The last one says so.
 */

import { supabase } from './supabase';
import {
  normalizeDetails,
  normalizeMediaList,
  normalizeResults,
  normalizeSections,
  slugify,
  type ProjectDetails,
  type ProjectMedia,
  type ProjectResult,
  type ProjectSection,
} from './projectStory';

export interface BusinessProject {
  id: string;
  business_id: string;
  title: string;
  summary: string | null;
  client: string | null;
  location: string | null;
  completed_on: string | null;
  cover_url: string | null;
  cover_video_url: string | null;
  category: string | null;
  /**
   * Ordered images, with captions and alt text.
   *
   * Legacy rows stored bare URL strings in this jsonb column; `toProject`
   * upgrades them. The database never needs to know which form it holds.
   */
  images: ProjectMedia[];
  link_url: string | null;
  tags: string[];
  position: number;
  published: boolean;
  featured: boolean;
  sections: ProjectSection[];
  details: ProjectDetails;
  results: ProjectResult[];
  seo_title: string | null;
  seo_description: string | null;
  slug: string | null;
  created_at: string;
  updated_at: string | null;
}

export type ProjectsRead =
  | { state: 'ready'; projects: BusinessProject[] }
  /** The read failed, or the table is not there yet. Never claim zero. */
  | { state: 'unavailable'; reason: string };

export type ProjectRead =
  | { state: 'ready'; project: BusinessProject | null }
  | { state: 'unavailable'; reason: string };

/**
 * Postgres says `42P01` for "relation does not exist", and PostgREST passes
 * it through. Worth telling apart from a dropped connection: one is a
 * migration that has not been applied, the other is the network.
 */
const MISSING_TABLE = '42P01';

/**
 * The story columns arrived in 20261101090000_business_project_stories.sql.
 * Until that migration is applied, selects naming them fail with 42703 or a
 * stale PostgREST schema cache (PGRST204). Falling back to the original columns
 * keeps every existing portfolio visible instead of turning the whole tab into
 * "we could not load this".
 */
const MISSING_COLUMN = new Set(['42703', 'PGRST204']);

/** Internal marker: retry with legacy columns, do not show this to a visitor. */
const MISSING_COLUMN_REASON = 'story-columns-missing';

export const isMissingTable = (code: string | undefined | null): boolean =>
  code === MISSING_TABLE || code === 'PGRST205';

export const isMissingColumn = (code: string | undefined | null): boolean =>
  !!code && MISSING_COLUMN.has(code);

const FULL_COLUMNS = [
  'id', 'business_id', 'title', 'summary', 'client', 'location', 'completed_on',
  'cover_url', 'cover_video_url', 'category', 'images', 'link_url', 'tags',
  'position', 'published', 'featured', 'sections', 'details', 'results',
  'seo_title', 'seo_description', 'slug', 'created_at', 'updated_at',
].join(',');

const LEGACY_COLUMNS = [
  'id', 'business_id', 'title', 'summary', 'client', 'location', 'completed_on',
  'cover_url', 'images', 'link_url', 'tags', 'position', 'published',
  'created_at', 'updated_at',
].join(',');

/** Newest finished work first, with the owner's own order winning. */
export function sortProjects(rows: readonly BusinessProject[]): BusinessProject[] {
  return [...rows].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    const aDone = a.completed_on ?? '';
    const bDone = b.completed_on ?? '';
    if (aDone !== bDone) return bDone.localeCompare(aDone);
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });
}

/** Normalise a row, so a null array from the database is never iterated. */
export function toProject(row: Record<string, unknown>): BusinessProject {
  const rawImages = Array.isArray(row.images) ? row.images : [];
  const tags = Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === 'string') : [];
  return {
    id: String(row.id ?? ''),
    business_id: String(row.business_id ?? ''),
    title: String(row.title ?? '').trim(),
    summary: (row.summary as string) ?? null,
    client: (row.client as string) ?? null,
    location: (row.location as string) ?? null,
    completed_on: (row.completed_on as string) ?? null,
    cover_url: (row.cover_url as string) ?? null,
    cover_video_url: (row.cover_video_url as string) ?? null,
    category: (row.category as string) ?? null,
    images: normalizeMediaList(rawImages),
    link_url: (row.link_url as string) ?? null,
    tags,
    position: Number(row.position ?? 0),
    published: row.published !== false,
    featured: row.featured === true,
    sections: normalizeSections(row.sections),
    details: normalizeDetails(row.details),
    results: normalizeResults(row.results),
    seo_title: (row.seo_title as string) ?? null,
    seo_description: (row.seo_description as string) ?? null,
    slug: (row.slug as string) ?? null,
    created_at: String(row.created_at ?? ''),
    updated_at: (row.updated_at as string) ?? null,
  };
}

async function selectProjects(
  businessId: string,
  columns: string,
  publishedOnly: boolean,
): Promise<ProjectsRead> {
  let query = supabase
    .from('business_projects')
    .select(columns)
    .eq('business_id', businessId);
  if (publishedOnly) query = query.eq('published', true);

  const { data, error } = await query;
  if (error) {
    return {
      state: 'unavailable',
      reason: isMissingColumn(error.code)
        ? MISSING_COLUMN_REASON
        : isMissingTable(error.code)
          ? 'This is not switched on yet.'
          : 'We could not load this just now.',
    };
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return { state: 'ready', projects: sortProjects(rows.map(toProject)) };
}

/**
 * The published work for one business.
 *
 * `error` is read, not discarded — supabase-js resolves with `{ data, error }`
 * rather than throwing, so a dropped `error` here would render an empty tab
 * that looks exactly like a business with nothing to show.
 */
export async function fetchProjects(businessId: string): Promise<ProjectsRead> {
  if (!businessId) return { state: 'ready', projects: [] };

  /*
   * The fallback is for one specific failure: a story column that does not
   * exist yet. A dropped connection is not a reason to ask again with fewer
   * columns — it would fail the same way, twice, and report the second answer.
   */
  const full = await selectProjects(businessId, FULL_COLUMNS, true);
  if (full.state === 'unavailable' && full.reason === MISSING_COLUMN_REASON) {
    return selectProjects(businessId, LEGACY_COLUMNS, true);
  }
  return full;
}

/**
 * Every project belonging to one business, published or not.
 *
 * Only the owner (and their members/admins) can read drafts, and that is
 * enforced by RLS rather than by this query. The dashboard calls this; the
 * public profile calls `fetchProjects`, which adds `published = true`.
 */
export async function fetchOwnProjects(businessId: string): Promise<ProjectsRead> {
  if (!businessId) return { state: 'ready', projects: [] };
  const full = await selectProjects(businessId, FULL_COLUMNS, false);
  if (full.state === 'unavailable' && full.reason === MISSING_COLUMN_REASON) {
    return selectProjects(businessId, LEGACY_COLUMNS, false);
  }
  return full;
}

/**
 * One public project, by slug or, for rows that predate slugs, by id.
 *
 * `published = true` is in the query rather than applied afterwards, so an
 * unpublished project can never be returned to a visitor even for a moment.
 */
export async function fetchPublishedProject(key: string): Promise<ProjectRead> {
  if (!key) return { state: 'ready', project: null };
  const isUuid = /^[0-9a-f]{8}-[0-9a-f-]{20,30}$/i.test(key);

  const read = async (columns: string) => {
    const field = isUuid ? 'id' : 'slug';
    const { data, error } = await supabase
      .from('business_projects')
      .select(columns)
      .eq(field, key)
      .eq('published', true)
      .maybeSingle();
    return { row: data as unknown as Record<string, unknown> | null, error };
  };

  const full = await read(FULL_COLUMNS);
  if (!full.error) return { state: 'ready', project: full.row ? toProject(full.row) : null };

  if (isMissingColumn(full.error.code)) {
    const legacy = await read(LEGACY_COLUMNS);
    if (!legacy.error) return { state: 'ready', project: legacy.row ? toProject(legacy.row) : null };
  }

  return {
    state: 'unavailable',
    reason: isMissingTable(full.error.code)
      ? 'This is not switched on yet.'
      : 'We could not load this just now.',
  };
}

/** The public fields of the business that owns a project. */
export interface ProjectBusiness {
  id: string;
  name: string;
  username: string | null;
  category: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  image_url: string | null;
  logo_url: string | null;
  user_id: string | null;
}

export async function fetchProjectBusiness(id: string): Promise<ProjectBusiness | null> {
  if (!id) return null;
  const { data, error } = await supabase
    .from('businesses')
    .select('id,name,username,category,location,phone,email,website,image_url,logo_url,user_id')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as ProjectBusiness;
}

/** More work from the same business, excluding the project being read. */
export async function fetchRelatedProjects(
  businessId: string,
  excludeId: string,
  limit = 3,
): Promise<BusinessProject[]> {
  if (!businessId) return [];
  const read = async (columns: string) => {
    const { data, error } = await supabase
      .from('business_projects')
      .select(columns)
      .eq('business_id', businessId)
      .eq('published', true)
      .neq('id', excludeId)
      .limit(limit);
    return { data, error };
  };

  const full = await read(FULL_COLUMNS);
  if (!full.error) {
    return sortProjects(((full.data ?? []) as unknown as Record<string, unknown>[]).map(toProject));
  }
  const legacy = await read(LEGACY_COLUMNS);
  if (legacy.error) return [];
  return sortProjects(((legacy.data ?? []) as unknown as Record<string, unknown>[]).map(toProject));
}

/** A short line under the title: who it was for, where, and when. */
export function projectMeta(project: BusinessProject): string {
  const parts: string[] = [];
  if (project.client) parts.push(project.client);
  if (project.location) parts.push(project.location);
  if (project.completed_on) {
    /* The year alone. A precise date on past work invites "why so long ago". */
    const year = project.completed_on.slice(0, 4);
    if (/^\d{4}$/.test(year)) parts.push(year);
  }
  return parts.join(' · ');
}

/** A title that is safe to put in a URL, stable once the project exists. */
export function suggestedSlug(title: string, id: string): string {
  return slugify(title) ? `${slugify(title)}-${id.replace(/[^a-z0-9]/gi, '').slice(-6).toLowerCase()}` : '';
}
