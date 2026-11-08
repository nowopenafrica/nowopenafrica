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

export type Outcome = { ok: true } | { ok: false; reason: string };

export interface ReviewAsset {
  id: string;
  kind: string;
  title: string;
  status: AssetStatus;
  mime: string;
  storage_path: string;
  licence_key: string;
  licence_name: string;
  licence_restrictions: string;
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
  'id, kind, title, status, mime, storage_path, licence_key, licence_evidence_path, retrieved_at, ' +
  'restrictions, source_name, creator_name, sanitised_at, contains_people, contains_brands, release_on_file';

const CONSTRAINT_SENTENCES: Record<string, string> = {
  design_assets_approved_needs_evidence: 'Add the licence evidence and the date it was retrieved before approving.',
  design_assets_brands_never_approved: 'This asset shows a brand, so it cannot be approved.',
  design_assets_people_no_release_tagged:
    'This shows people with no release on file. It needs a licence that allows that, and the no-endorsement tag.',
  design_assets_retired_needs_reason: 'Give a reason before retiring.',
  design_assets_svg_sanitised_before_approval: 'This SVG has not passed the safety check.',
};

/** Known constraint names become short sentences; anything else shows raw. */
export function explainDbError(message: string): string {
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
    .select('key, name, restrictions');
  if (lic.error) return { ok: false, reason: explainDbError(lic.error.message) };
  const byKey = new Map((lic.data ?? []).map((l) => [l.key as string, l]));

  const rows = (data ?? []) as unknown as Omit<ReviewAsset, 'licence_name' | 'licence_restrictions'>[];
  return {
    ok: true,
    assets: rows.map((r) => {
      const l = byKey.get(r.licence_key);
      return {
        ...r,
        licence_name: (l?.name as string | undefined) ?? r.licence_key,
        licence_restrictions: (l?.restrictions as string | undefined) ?? '',
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

/** Copies the asset file to the public bucket, then approves the row. */
export async function approveAsset(id: string): Promise<Outcome> {
  const found = await supabase.from('design_assets').select('storage_path').eq('id', id);
  if (found.error) return { ok: false, reason: explainDbError(found.error.message) };
  const path = (found.data?.[0] as { storage_path?: string } | undefined)?.storage_path;
  if (!path) return { ok: false, reason: 'We could not find that asset.' };

  // The evidence file stays in the private intake bucket; only the asset goes public.
  const copied = await supabase.storage
    .from(INTAKE_BUCKET)
    .copy(path, path, { destinationBucket: PUBLIC_BUCKET });
  if (copied.error) return { ok: false, reason: copied.error.message };

  const updated = await setRow(id, { status: 'approved' });
  if (!updated.ok) {
    const removed = await supabase.storage.from(PUBLIC_BUCKET).remove([path]);
    if (removed.error) {
      return { ok: false, reason: `${updated.reason} The public copy could not be removed: ${removed.error.message}` };
    }
  }
  return updated;
}

/** Send back: status goes to draft. No note is stored (no column for it yet). */
export function returnAsset(id: string): Promise<Outcome> {
  return setRow(id, { status: 'draft' });
}

export async function retireAsset(id: string, reason: string): Promise<Outcome> {
  const why = reason.trim();
  if (!why) return { ok: false, reason: 'Give a reason before retiring.' };
  return setRow(id, { status: 'retired', retired_reason: why });
}

/** The evidence file is private: a short-lived signed URL, never a public one. */
export async function evidenceUrl(
  path: string,
): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  const { data, error } = await supabase.storage.from(INTAKE_BUCKET).createSignedUrl(path, EVIDENCE_URL_SECONDS);
  if (error || !data?.signedUrl) return { ok: false, reason: error?.message ?? 'Could not open the evidence.' };
  return { ok: true, url: data.signedUrl };
}
