import { supabase } from '../supabase';

/**
 * Staff review of the design asset library.
 *
 * supabase-js returns `{ data, error }` and never throws for a refused query,
 * so `error` is read on every call. The database owns the approval rules (CHECK
 * constraints) and stamps `reviewed_by` / `reviewed_at` in its guard trigger,
 * so this module never sends either.
 */

export const INTAKE_BUCKET = 'design-assets-intake';
export const PUBLIC_BUCKET = 'design-assets';
export const EVIDENCE_URL_SECONDS = 300;

export type AssetStatus = 'draft' | 'in_review' | 'approved' | 'retired';

export type Outcome = { ok: true; warning?: string } | { ok: false; reason: string };

export interface ReviewAsset {
  id: string;
  kind: string;
  title: string;
  status: AssetStatus;
  mime: string;
  storage_path: string;
  thumb_path: string | null;
  tags: string[];
  licence_key: string;
  licence_name: string;
  licence_restrictions: string;
  licence_permits_people: boolean;
  licence_evidence_path: string | null;
  retrieved_at: string | null;
  restrictions: string | null;
  source_name: string;
  creator_name: string | null;
  sanitised_at: string | null;
  contains_people: boolean;
  contains_brands: boolean;
  release_on_file: boolean;
}

const ASSET_COLUMNS =
  'id, kind, title, status, mime, storage_path, thumb_path, tags, licence_key, licence_evidence_path, retrieved_at, ' +
  'restrictions, source_name, creator_name, sanitised_at, contains_people, contains_brands, release_on_file';

const CONSTRAINT_SENTENCES: Record<string, string> = {
  design_assets_approved_needs_evidence: 'Add the licence evidence and the date it was retrieved before approving.',
  design_assets_brands_never_approved: 'This asset shows a brand, so it cannot be approved.',
  design_assets_people_no_release_tagged:
    'This shows people with no release on file. It needs a licence that allows that, and the no-endorsement tag.',
  design_assets_retired_needs_reason: 'Give a reason before retiring.',
  design_assets_svg_sanitised_before_approval: 'This SVG has not passed the safety check.',
};

// Raised by the design_assets_guard trigger, which has no constraint name.
const GUARD_PEOPLE = /people without a release cannot be approved under licence/i;
const GUARD_PEOPLE_SENTENCE =
  'This shows people with no release on file, and its licence does not allow that.';

/** Known constraint names become short sentences; anything else shows raw. */
export function explainDbError(message: string): string {
  if (GUARD_PEOPLE.test(message)) return GUARD_PEOPLE_SENTENCE;
  for (const [name, sentence] of Object.entries(CONSTRAINT_SENTENCES)) {
    if (message.includes(name)) return sentence;
  }
  return message;
}

export async function listAssets(
  status: AssetStatus,
): Promise<{ ok: true; assets: ReviewAsset[] } | { ok: false; reason: string }> {
  const { data, error } = await supabase
    .from('design_assets')
    .select(ASSET_COLUMNS)
    .eq('status', status)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) return { ok: false, reason: explainDbError(error.message) };

  const lic = await supabase
    .from('design_asset_licences')
    .select('key, name, restrictions, permits_people_without_release');
  if (lic.error) return { ok: false, reason: explainDbError(lic.error.message) };
  const byKey = new Map((lic.data ?? []).map((l) => [l.key as string, l]));

  const rows = (data ?? []) as unknown as Omit<ReviewAsset, 'licence_name' | 'licence_restrictions' | 'licence_permits_people'>[];
  return {
    ok: true,
    assets: rows.map((r) => {
      const l = byKey.get(r.licence_key);
      return {
        ...r,
        licence_name: (l?.name as string | undefined) ?? r.licence_key,
        licence_restrictions: (l?.restrictions as string | undefined) ?? '',
        licence_permits_people: Boolean(l?.permits_people_without_release),
      };
    }),
  };
}

async function setRow(id: string, patch: Record<string, unknown>): Promise<Outcome> {
  const { data, error } = await supabase.from('design_assets').update(patch).eq('id', id).select('id');
  if (error) return { ok: false, reason: explainDbError(error.message) };
  if (!data || data.length === 0) return { ok: false, reason: 'Nothing was updated. The asset may have been removed.' };
  return { ok: true };
}

/**
 * Client-side pre-check of the approval rules, so Approve can say why it is
 * unavailable. The database stays the authority: it enforces every rule.
 */
export function approvalBlockers(
  row: Pick<ReviewAsset, 'contains_brands' | 'licence_evidence_path' | 'retrieved_at' | 'mime' | 'sanitised_at'
    | 'contains_people' | 'release_on_file' | 'tags'>,
  licence: { permits_people_without_release: boolean } | undefined,
): string[] {
  const out: string[] = [];
  if (row.contains_brands) out.push(CONSTRAINT_SENTENCES.design_assets_brands_never_approved);
  if (!row.licence_evidence_path?.trim() || !row.retrieved_at) {
    out.push(CONSTRAINT_SENTENCES.design_assets_approved_needs_evidence);
  }
  if (row.mime === 'image/svg+xml' && !row.sanitised_at) {
    out.push(CONSTRAINT_SENTENCES.design_assets_svg_sanitised_before_approval);
  }
  if (row.contains_people && !row.release_on_file) {
    if (!licence?.permits_people_without_release) out.push(GUARD_PEOPLE_SENTENCE);
    if (!row.tags.includes('no-endorsement')) {
      out.push('This shows people with no release on file, so it needs the no-endorsement tag.');
    }
  }
  return out;
}

/** Paths are content-addressed, so an object that is already there is the same file. */
function alreadyThere(err: { message: string; statusCode?: string | number; status?: number }): boolean {
  return /already exists|duplicate/i.test(err.message) || String(err.statusCode ?? err.status ?? '') === '409';
}

async function readFiles(id: string): Promise<
  { ok: true; status: AssetStatus; paths: string[] } | { ok: false; reason: string }
> {
  const found = await supabase.from('design_assets').select('status, storage_path, thumb_path').eq('id', id);
  if (found.error) return { ok: false, reason: explainDbError(found.error.message) };
  const row = found.data?.[0] as { status?: AssetStatus; storage_path?: string; thumb_path?: string | null } | undefined;
  if (!row?.storage_path || !row.status) return { ok: false, reason: 'We could not find that asset.' };
  return { ok: true, status: row.status, paths: [row.storage_path, row.thumb_path].filter((p): p is string => !!p) };
}

/**
 * The database decides first: the row is approved (every rule is enforced
 * there, atomically), and only then are the file and thumbnail copied to the
 * public bucket. A refused row never touches the public bucket. If a copy
 * fails, the row goes back to its previous status.
 */
export async function approveAsset(id: string): Promise<Outcome> {
  const read = await readFiles(id);
  if (!read.ok) return read;

  const updated = await setRow(id, { status: 'approved' });
  if (!updated.ok) return updated;

  const copied: string[] = [];
  for (const path of read.paths) {
    const r = await supabase.storage.from(INTAKE_BUCKET).copy(path, path, { destinationBucket: PUBLIC_BUCKET });
    if (r.error && !alreadyThere(r.error)) {
      const problems = [`The file could not be copied to the public library: ${r.error.message}`];
      if (copied.length) await supabase.storage.from(PUBLIC_BUCKET).remove(copied);
      if (read.status !== 'approved') {
        const back = await setRow(id, { status: read.status });
        if (!back.ok) problems.push(`The asset could not be put back to ${read.status}: ${back.reason}`);
      }
      return { ok: false, reason: problems.join(' ') };
    }
    if (!r.error) copied.push(path);
  }
  return { ok: true };
}

/** Send back: status goes to draft. No note is stored (no column for it yet). */
export function returnAsset(id: string): Promise<Outcome> {
  return setRow(id, { status: 'draft' });
}

/** Retires the row first; an approved asset's public files are removed after. */
export async function retireAsset(id: string, reason: string): Promise<Outcome> {
  const why = reason.trim();
  if (!why) return { ok: false, reason: 'Give a reason before retiring.' };
  const read = await readFiles(id);
  if (!read.ok) return read;

  const retired = await setRow(id, { status: 'retired', retired_reason: why });
  if (!retired.ok) return retired;

  if (read.status === 'approved') {
    const removed = await supabase.storage.from(PUBLIC_BUCKET).remove(read.paths);
    if (removed.error) {
      return { ok: true, warning: `Retired, but the public files could not be removed: ${removed.error.message}` };
    }
  }
  return { ok: true };
}

/** The evidence file is private: a short-lived signed URL, never a public one. */
export async function evidenceUrl(
  path: string,
): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  const { data, error } = await supabase.storage.from(INTAKE_BUCKET).createSignedUrl(path, EVIDENCE_URL_SECONDS);
  if (error || !data?.signedUrl) return { ok: false, reason: error?.message ?? 'Could not open the evidence.' };
  return { ok: true, url: data.signedUrl };
}
