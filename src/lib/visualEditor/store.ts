import { supabase } from '../supabase';
import { cleanPageOverrides } from './resolve';
import { LINK_TARGETS, slotsForPage } from './registry';
import type { PageOverrides } from './types';

/**
 * Reading and writing page content.
 *
 * Every read fails soft and returns `{}`. That is not laziness — it is the
 * central safety property of the whole design. An empty result means "no
 * overrides", which means every page renders the copy written in its component.
 * A missing table, an expired token, a network blip and a page nobody has ever
 * edited all produce the same, correct, page.
 *
 * Everything read is put through cleanPageOverrides() before it can reach a
 * component, so a hand-edited row or one left behind by a renamed slot is
 * dropped rather than rendered.
 */

async function fetchContent(table: string, page: string): Promise<PageOverrides> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select('content')
      .eq('page', page)
      .maybeSingle();
    if (error || !data) return {};
    return cleanPageOverrides(slotsForPage(page), (data as { content: unknown }).content, LINK_TARGETS);
  } catch {
    return {};
  }
}

/** What the public sees. */
export const fetchPublished = (page: string) => fetchContent('page_content', page);

/** Work in progress. Staff only — RLS returns nothing to anyone else. */
export const fetchDraft = (page: string) => fetchContent('page_content_draft', page);

/**
 * A draft the editor can open.
 *
 * When no draft row exists yet, the published content is the starting point —
 * so a first edit begins from what is live rather than from a blank page.
 */
export async function openDraft(page: string): Promise<PageOverrides> {
  const [draft, published] = await Promise.all([fetchDraft(page), fetchPublished(page)]);
  return Object.keys(draft).length ? draft : published;
}

export interface WriteResult {
  ok: boolean;
  message?: string;
}

/** Clean before sending as well as after reading: the database is not the only guard. */
export async function saveDraft(page: string, overrides: PageOverrides): Promise<WriteResult> {
  const content = cleanPageOverrides(slotsForPage(page), overrides, LINK_TARGETS);
  const { error } = await supabase.rpc('save_page_draft', { p_page: page, p_content: content });
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function publishPage(page: string, note?: string): Promise<WriteResult> {
  const { error } = await supabase.rpc('publish_page', { p_page: page, p_note: note ?? null });
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function discardDraft(page: string): Promise<WriteResult> {
  const { error } = await supabase.rpc('discard_page_draft', { p_page: page });
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function revertToVersion(versionId: string): Promise<WriteResult> {
  const { error } = await supabase.rpc('revert_page_draft', { p_version_id: versionId });
  return error ? { ok: false, message: error.message } : { ok: true };
}

export interface PageVersion {
  id: string;
  page: string;
  note: string | null;
  created_at: string;
  created_by: string | null;
}

export async function fetchVersions(page: string, limit = 20): Promise<PageVersion[]> {
  try {
    const { data, error } = await supabase
      .from('page_content_versions')
      .select('id,page,note,created_at,created_by')
      .eq('page', page)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as PageVersion[];
  } catch {
    return [];
  }
}
