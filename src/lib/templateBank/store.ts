import { supabase } from '../supabase';
import { registerTemplates, type DesignTemplate } from '../designTemplates';
import { usableDefinition } from './schema';
import type { BankSample, BankTemplate, QualityCriterion } from './package';

/**
 * Reading and writing the Template Bank tables.
 *
 * Every definition read back from the database is parsed and gated again
 * before it reaches a renderer. The table is admin-writable, so a row that was
 * valid at import can be edited afterwards; a malformed slot must cost that one
 * template, not the gallery.
 */

export { usableDefinition };

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface CollectionRow {
  id: string;
  name: string;
  version: string;
  template_count: number;
  imported_at: string;
  published_at: string | null;
}

export interface TemplateRow {
  id: string;
  collection_id: string;
  template_id: string;
  key: string;
  version: number;
  division: string;
  category: string;
  definition: unknown;
  meta: Partial<Omit<BankTemplate, 'definition'>>;
  review_status: ReviewStatus;
  review_score: number | null;
  review_scores: Partial<Record<QualityCriterion, number>> | null;
  review_note: string | null;
  reviewed_at: string | null;
  published: boolean;
}

const samples = new Map<string, BankSample>();

/** The placeholder copy a published template was art-directed with, if any. */
export const sampleFor = (key: string): BankSample | undefined => samples.get(key);

let loading: Promise<number> | null = null;

/**
 * Fetch published templates and register them with the catalogue. Runs once
 * per page load however many components ask. Never throws: with no network or
 * no table the library is simply the built-in layouts, which is what it was
 * before the bank existed.
 */
export function loadTemplateLibrary(): Promise<number> {
  loading ??= (async () => {
    try {
      const { data, error } = await supabase
        .from('design_templates')
        .select('key, definition, meta')
        .eq('published', true)
        .order('key');
      if (error || !data) return 0;
      const usable: DesignTemplate[] = [];
      for (const row of data as Pick<TemplateRow, 'key' | 'definition' | 'meta'>[]) {
        const tpl = usableDefinition(row.definition);
        if (!tpl || tpl.key !== row.key) continue;
        usable.push(tpl);
        if (row.meta?.sample) samples.set(tpl.key, row.meta.sample);
      }
      registerTemplates(usable);
      return usable.length;
    } catch {
      return 0;
    }
  })();
  return loading;
}

/** Forget the cached load, so the next call re-reads. Used after a publish. */
export function resetTemplateLibrary(): void {
  loading = null;
}

export async function listCollections(): Promise<CollectionRow[]> {
  const { data, error } = await supabase
    .from('design_template_collections')
    .select('id, name, version, template_count, imported_at, published_at')
    .order('imported_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as CollectionRow[]) ?? [];
}

export async function listTemplates(): Promise<TemplateRow[]> {
  const { data, error } = await supabase
    .from('design_templates')
    .select('id, collection_id, template_id, key, version, division, category, definition, meta, review_status, review_score, review_scores, review_note, reviewed_at, published')
    .order('template_id');
  if (error) throw new Error(error.message);
  return (data as TemplateRow[]) ?? [];
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function importCollection(
  name: string, version: string, checksum: string, templates: BankTemplate[],
): Promise<string> {
  const { data, error } = await supabase.rpc('import_template_collection', {
    p_name: name, p_version: version, p_checksum: checksum, p_templates: templates,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function reviewTemplate(
  id: string,
  status: ReviewStatus,
  score: number | null,
  scores: Partial<Record<QualityCriterion, number>> | null,
  note: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('review_template', {
    p_id: id, p_status: status, p_score: score, p_scores: scores, p_note: note,
  });
  if (error) throw new Error(error.message);
}

export async function publishCollection(id: string): Promise<number> {
  const { data, error } = await supabase.rpc('publish_template_collection', { p_collection: id });
  if (error) throw new Error(error.message);
  resetTemplateLibrary();
  return (data as number) ?? 0;
}

export async function unpublishTemplate(id: string): Promise<void> {
  const { error } = await supabase.rpc('unpublish_template', { p_id: id });
  if (error) throw new Error(error.message);
  resetTemplateLibrary();
}
