// Business Updates — reads and writes, for the owner's dashboard.
//
// The database is the authority (migrations 20261110010000 / 20261110020000):
// RLS decides who may write, the guard trigger decides what may change, and
// its refusals are written for people, so they are shown as they come. This
// module only sequences the calls, in the one order the server accepts:
//
//   draft row (client id, no .select()) -> upload files into
//   <business>/<update>/ -> media rows -> published_at
//
// Uploads never publish. A failed file leaves a draft, never a live update
// with a hole in it.

import { supabase } from './supabase';
import { compressImage } from './imageCompression';
import { ALL_TOPICS, reachFor, type KeepTopic } from './keeps';
import {
  SIGNED_URL_MAX_TTL_S, updateMediaPath,
  type UpdateType, type UpdateLifecycleRow,
} from './businessUpdates';

const BUCKET = 'business-updates';

export interface OwnerMedia {
  id: string;
  storage_path: string;
  kind: 'image' | 'video';
  position: number;
  alt_text: string | null;
  /** Signed for ten minutes; null when signing failed. */
  url: string | null;
}

export interface OwnerUpdate extends UpdateLifecycleRow {
  id: string;
  business_id: string;
  author_id: string | null;
  type: UpdateType;
  title: string;
  body: string;
  offer_id: string | null;
  event_starts_at: string | null;
  cta_label: string | null;
  cta_url: string | null;
  notify_keepers: boolean;
  notified_at: string | null;
  moderation_note: string | null;
  created_at: string;
  media: OwnerMedia[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; message: string; missing?: boolean };

type DbError = { code?: string; message?: string } | null | undefined;

const isMissingTable = (e: DbError) => e?.code === '42P01' || e?.code === 'PGRST205';

export function readableError(e: DbError): string {
  if (e?.code === '42501') return "You don't have permission to post for this business.";
  // The guard's RAISE EXCEPTION messages are written for the person reading them.
  if (e?.code === 'P0001' && e.message) return e.message;
  return 'Something went wrong. Please try again.';
}

const fail = (e: DbError): { ok: false; message: string; missing?: boolean } =>
  isMissingTable(e) ? { ok: false, message: 'Updates are not set up on this database yet.', missing: true }
    : { ok: false, message: readableError(e) };

const newId = (): string => globalThis.crypto.randomUUID();

const extensionOf = (name: string, fallback: string): string => {
  const ext = name.includes('.') ? name.split('.').pop() ?? '' : '';
  return ext || fallback;
};

export async function listOwnerUpdates(businessId: string): Promise<Result<OwnerUpdate[]>> {
  const { data, error } = await supabase
    .from('business_updates')
    .select('*, media:business_update_media(*)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return fail(error);

  const rows = ((data as OwnerUpdate[] | null) ?? []).map((u) => ({
    ...u,
    media: [...(u.media ?? [])].sort((a, b) => a.position - b.position).map((m) => ({ ...m, url: null as string | null })),
  }));

  const paths = rows.flatMap((u) => u.media.map((m) => m.storage_path));
  if (paths.length > 0) {
    const { data: signed, error: signError } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_MAX_TTL_S);
    // Thumbnails are a convenience: if signing fails the list still loads and
    // each row shows its type icon (url stays null) instead of a broken image.
    const usable = signError ? [] : (signed ?? []);
    const byPath = new Map(usable.filter((s) => !s.error && s.signedUrl).map((s) => [s.path, s.signedUrl]));
    for (const u of rows) for (const m of u.media) m.url = byPath.get(m.storage_path) ?? null;
  }
  return { ok: true, value: rows };
}

export interface DraftInput {
  businessId: string;
  type: UpdateType;
  title: string;
  body: string;
  offerId: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  notifyKeepers: boolean;
}

export async function createDraftUpdate(input: DraftInput): Promise<Result<string>> {
  const id = newId();
  // No .select(): the id is ours, so nothing needs reading back.
  const { error } = await supabase.from('business_updates').insert({
    id,
    business_id: input.businessId,
    type: input.type,
    title: input.title.trim(),
    body: input.body.trim(),
    offer_id: input.type === 'offer' ? input.offerId : null,
    cta_label: input.ctaLabel?.trim() || null,
    cta_url: input.ctaUrl?.trim() || null,
    notify_keepers: input.notifyKeepers,
  });
  if (error) return fail(error);
  return { ok: true, value: id };
}

export interface PickedMedia {
  file: File;
  durationMs: number | null;
  alt: string;
}

export async function uploadUpdateMedia(
  businessId: string,
  updateId: string,
  files: PickedMedia[],
): Promise<{ uploaded: number; failed: { name: string; message: string }[] }> {
  const bucket = supabase.storage.from(BUCKET);
  const failed: { name: string; message: string }[] = [];
  let uploaded = 0;

  for (const [position, picked] of files.entries()) {
    const isImage = picked.file.type.startsWith('image/');
    try {
      const body: File = isImage ? await compressImage(picked.file) : picked.file;
      const ext = extensionOf(body.name, isImage ? 'jpg' : 'mp4');
      const path = updateMediaPath(businessId, updateId, newId(), ext);
      const { error: upErr } = await bucket.upload(path, body, {
        upsert: false, contentType: body.type || picked.file.type, cacheControl: '3600',
      });
      if (upErr) { failed.push({ name: picked.file.name, message: upErr.message }); continue; }

      const { error: rowErr } = await supabase.from('business_update_media').insert({
        update_id: updateId,
        business_id: businessId,
        position,
        kind: isImage ? 'image' : 'video',
        storage_path: path,
        duration_ms: picked.durationMs,
        alt_text: picked.alt.trim() || null,
      });
      if (rowErr) {
        // No row points at the file, so nothing could ever find it to delete it.
        // The update is still a draft, which storage allows us to clean up.
        await bucket.remove([path]);
        failed.push({ name: picked.file.name, message: readableError(rowErr) });
        continue;
      }
      uploaded += 1;
    } catch (e) {
      failed.push({ name: picked.file.name, message: e instanceof Error ? e.message : 'Upload failed.' });
    }
  }
  return { uploaded, failed };
}

/**
 * Through publish_business_update (migration 20261112010000) so that "now" is
 * the server's now(). A phone clock five minutes slow would otherwise be
 * refused as "already passed", and one running fast would schedule instead of
 * publishing while the screen said "live now".
 */
export async function publishUpdate(updateId: string, at: Date | null): Promise<Result<void>> {
  const { error } = await supabase.rpc('publish_business_update', {
    p_id: updateId,
    p_at: at ? at.toISOString() : null,
  });
  if (error) return fail(error);
  return { ok: true, value: undefined };
}

export async function updateDraftText(
  updateId: string,
  fields: { title: string; body: string; ctaLabel: string | null; ctaUrl: string | null },
): Promise<Result<void>> {
  const { error } = await supabase
    .from('business_updates')
    .update({
      title: fields.title.trim(),
      body: fields.body.trim(),
      cta_label: fields.ctaLabel?.trim() || null,
      cta_url: fields.ctaUrl?.trim() || null,
    })
    .eq('id', updateId);
  if (error) return fail(error);
  return { ok: true, value: undefined };
}

/** The server stamps its own now(); the value sent only has to be non-null. */
export async function endUpdate(updateId: string): Promise<Result<void>> {
  const { error } = await supabase
    .from('business_updates')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', updateId);
  if (error) return fail(error);
  return { ok: true, value: undefined };
}

/**
 * Storage refuses to delete a live update's files, so a live update is ended
 * first. Files go before the row: a row whose files remain is still visible to
 * its owner and can be retried; files whose row is gone could not be found.
 */
export async function deleteUpdate(u: OwnerUpdate): Promise<Result<void>> {
  // Decided from the row, not this device's clock: a phone running fast would
  // think a still-live update had ended, skip this, and have its files refused.
  if (u.published_at && !u.ended_at && u.moderation_status === 'ok') {
    const ended = await endUpdate(u.id);
    if (!ended.ok) return ended;
  }
  const paths = u.media.map((m) => m.storage_path);
  if (paths.length > 0) {
    // A storage policy refusal is not an error here: remove() just returns
    // fewer objects. Counting them is the only way to know.
    const { data, error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error || (data?.length ?? 0) < paths.length) {
      return { ok: false, message: 'Its photos and videos could not be removed, so the update was kept. Please try again.' };
    }
  }
  const { error } = await supabase.from('business_updates').delete().eq('id', u.id);
  if (error) return fail(error);
  return { ok: true, value: undefined };
}

/**
 * Real keeper counts per topic, from the owner-readable business_keeps rows.
 * The owner is left out because notify_keepers never messages them. Null when
 * unreadable, so the composer shows no number rather than a wrong one.
 */
export async function loadKeeperReach(businessId: string): Promise<Record<KeepTopic, number> | null> {
  const [{ data, error }, { data: biz, error: bizErr }] = await Promise.all([
    supabase.from('business_keeps').select('user_id, topics').eq('business_id', businessId),
    supabase.from('businesses').select('user_id').eq('id', businessId),
  ]);
  if (error || !data || bizErr) return null;
  const owner = (biz as { user_id?: string | null }[] | null)?.[0]?.user_id ?? null;
  const rows = (data as { user_id?: string; topics?: unknown }[]).filter((r) => !owner || r.user_id !== owner);
  return Object.fromEntries(ALL_TOPICS.map((t) => [t, reachFor(rows, t)])) as Record<KeepTopic, number>;
}

export interface OfferOption { id: string; title: string; headline: string | null }

/** Owner/admin only under the offers RLS; a team member gets an empty list. */
export async function loadOwnOffers(businessId: string): Promise<Result<OfferOption[]>> {
  const { data, error } = await supabase
    .from('business_offers')
    .select('id, title, headline')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return fail(error);
  return { ok: true, value: (data as OfferOption[] | null) ?? [] };
}
