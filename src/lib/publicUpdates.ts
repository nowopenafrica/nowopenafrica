// Business Updates — what the public reads, and how it reports.
//
// The database decides what is live: RLS on business_updates returns only
// published, unhidden updates inside their 24 hours, from businesses the
// caller may see. Nothing here filters by time to decide visibility. The
// clock is only used to sign photos for no longer than their update lives
// (storage refuses to sign once it ends, and a link signed near the end
// expires with it).
//
// A failed read is reported as a failure, never as "no updates": the profile
// then shows nothing at all, which claims nothing about the business.

import { supabase } from './supabase';
import { SIGNED_URL_MAX_TTL_S, signedUrlTtlSeconds, type UpdateType } from './businessUpdates';

const BUCKET = 'business-updates';

export interface PublicMedia {
  id: string;
  kind: 'image' | 'video';
  alt: string | null;
  path: string;
  url: string | null;
  /** When `url` stops working (ms since epoch); null when unsigned. */
  signedUntil: number | null;
}

export interface PublicUpdate {
  id: string;
  type: UpdateType;
  title: string;
  body: string;
  cta_label: string | null;
  cta_url: string | null;
  offer_id: string | null;
  published_at: string;
  expires_at: string;
  media: PublicMedia[];
}

type Row = Omit<PublicUpdate, 'media'> & {
  media: { id: string; kind: 'image' | 'video'; alt_text: string | null; storage_path: string; position: number }[] | null;
};

/** A link must have at least this long left to be reused rather than signed again. */
const REUSE_MARGIN_MS = 60_000;

/**
 * `previous` is the last successful read. A photo whose link is still good is
 * kept as it was: a new signature is a new URL, so re-signing every minute
 * would make every thumbnail download again on mobile data.
 */
export async function fetchActiveUpdates(
  businessId: string,
  previous: PublicUpdate[] = [],
): Promise<{ ok: true; value: PublicUpdate[] } | { ok: false }> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('business_updates')
    .select('id, type, title, body, cta_label, cta_url, offer_id, published_at, expires_at, media:business_update_media(id, kind, alt_text, storage_path, position)')
    .eq('business_id', businessId)
    // Live only, asked for explicitly. RLS gives the public exactly this, but it
    // also lets admins and the business's own team read drafts, scheduled,
    // ended and hidden updates, which must never be shown as public.
    .not('published_at', 'is', null)
    .lte('published_at', nowIso)
    .gt('expires_at', nowIso)
    .is('ended_at', null)
    .eq('moderation_status', 'ok')
    .order('published_at', { ascending: false })
    .order('id')
    .limit(20);
  if (error) return { ok: false };

  const now = Date.now();
  const reusable = new Map(
    previous.flatMap((u) => u.media)
      .filter((m) => m.url && m.signedUntil !== null && m.signedUntil - REUSE_MARGIN_MS > now)
      .map((m) => [m.path, m] as const),
  );

  const updates: PublicUpdate[] = ((data as Row[] | null) ?? []).map((r) => ({
    ...r,
    media: [...(r.media ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((m) => {
        const kept = reusable.get(m.storage_path);
        return {
          id: m.id, kind: m.kind, alt: m.alt_text, path: m.storage_path,
          url: kept?.url ?? null, signedUntil: kept?.signedUntil ?? null,
        };
      }),
  }));

  // One signing call per update with files still to sign, because each
  // update has its own time left.
  await Promise.all(updates.map(async (u) => {
    const ttl = signedUrlTtlSeconds(u.expires_at);
    const unsigned = u.media.filter((m) => !m.url);
    if (unsigned.length === 0 || ttl === 0) return;
    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(unsigned.map((m) => m.path), ttl);
    // Photos are optional to the update; its text still shows without them.
    if (signError || !signed) return;
    const byPath = new Map(signed.filter((s) => !s.error && s.signedUrl).map((s) => [s.path, s.signedUrl]));
    for (const m of unsigned) {
      m.url = byPath.get(m.path) ?? null;
      m.signedUntil = m.url ? now + ttl * 1000 : null;
    }
  }));

  return { ok: true, value: updates };
}

/** A fresh link for one file whose link has expired; null once the update is over or signing fails. */
export async function resignMedia(path: string, expiresAt: string): Promise<string | null> {
  const ttl = signedUrlTtlSeconds(expiresAt);
  if (ttl === 0) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttl);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export type UpdateReportReason = 'spam' | 'misleading' | 'offensive' | 'scam' | 'impersonation' | 'other';

export const UPDATE_REPORT_REASONS: { key: UpdateReportReason; label: string }[] = [
  { key: 'spam', label: 'Spam' },
  { key: 'misleading', label: 'Misleading or false' },
  { key: 'offensive', label: 'Offensive' },
  { key: 'scam', label: 'Looks like a scam' },
  { key: 'impersonation', label: 'Pretending to be someone else' },
  { key: 'other', label: 'Something else' },
];

export async function reportUpdate(
  updateId: string,
  reason: UpdateReportReason,
  detail: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  // Signed in is optional for reporting: if the session cannot be read, the
  // report is simply filed anonymously rather than refused.
  const { data: auth, error: authError } = await supabase.auth.getSession();
  const userId = authError ? null : auth?.session?.user?.id ?? null;
  // No .select(): reports have no public read policy, so asking for the row
  // back would make RLS refuse the whole insert.
  const { error } = await supabase.from('business_update_reports').insert({
    update_id: updateId,
    reason,
    detail: detail.trim().slice(0, 500) || null,
    user_id: userId,
  });
  if (!error) return { ok: true };
  if (error.code === '42501') return { ok: false, message: 'This update has ended, so it can no longer be reported.' };
  if (error.code === '53400') return { ok: false, message: 'Too many reports from this connection. Please try again later.' };
  return { ok: false, message: 'The report could not be sent. Please try again.' };
}

// --- Across businesses: Discover and Keeps -------------------------------------

export interface HappeningBusiness {
  id: string;
  name: string;
  username: string | null;
  image_url: string | null;
  category: string | null;
  location: string | null;
}

export interface HappeningItem {
  update: PublicUpdate;
  business: HappeningBusiness;
  /** The first photo, signed for the card; null when there is none or signing failed. */
  thumb: { url: string; signedUntil: number } | null;
}

type HappeningRow = Row & { business: HappeningBusiness };

/**
 * Live updates across businesses, newest first.
 *
 * The business embed is filtered explicitly to listable, published profiles,
 * the same filters Discover applies to businesses. RLS alone would also show
 * an admin or an owner their own unlisted rows. Only each update's first photo
 * is signed: a card shows one picture, and every other file would be data
 * spent on nothing.
 */
export async function fetchHappening(
  opts: { businessIds?: string[]; limit?: number },
  previous: HappeningItem[] = [],
): Promise<{ ok: true; value: HappeningItem[] } | { ok: false }> {
  if (opts.businessIds && opts.businessIds.length === 0) return { ok: true, value: [] };

  const nowIso = new Date().toISOString();
  let q = supabase
    .from('business_updates')
    .select('id, type, title, body, cta_label, cta_url, offer_id, published_at, expires_at, '
      + 'media:business_update_media(id, kind, alt_text, storage_path, position), '
      + 'business:businesses!inner(id, name, username, image_url, category, location)')
    .eq('business.is_listable', true)
    .eq('business.profile_state', 'published')
    // Live updates only, asked for explicitly: admins and a business's own team
    // can also read its drafts, scheduled, ended and hidden updates under RLS.
    // Without this, drafts (null published_at sorts first) would also fill the limit.
    .not('published_at', 'is', null)
    .lte('published_at', nowIso)
    .gt('expires_at', nowIso)
    .is('ended_at', null)
    .eq('moderation_status', 'ok');
  if (opts.businessIds) q = q.in('business_id', opts.businessIds);
  const { data, error } = await q
    .order('published_at', { ascending: false })
    .order('id')
    .limit(Math.min(Math.max(opts.limit ?? 24, 1), 50));
  if (error) return { ok: false };

  const now = Date.now();
  const kept = new Map(
    previous
      .filter((p) => p.thumb && p.thumb.signedUntil - REUSE_MARGIN_MS > now)
      .map((p) => [p.update.id, p.thumb] as const),
  );

  // supabase-js cannot type a select string built by concatenation; the shape
  // is the one requested above.
  const items: HappeningItem[] = ((data as unknown as HappeningRow[] | null) ?? []).map((r) => {
    const { business, ...rest } = r;
    const media = [...(rest.media ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((m) => ({ id: m.id, kind: m.kind, alt: m.alt_text, path: m.storage_path, url: null as string | null, signedUntil: null as number | null }));
    return { update: { ...rest, media }, business, thumb: kept.get(r.id) ?? null };
  });

  // First photos still to sign. Those with ten minutes or more left share one
  // call; any with less are signed alone, so no link outlives its update.
  const pending = items
    .filter((i) => !i.thumb)
    .map((i) => ({ item: i, path: i.update.media.find((m) => m.kind === 'image')?.path, ttl: signedUrlTtlSeconds(i.update.expires_at) }))
    .filter((p): p is { item: HappeningItem; path: string; ttl: number } => Boolean(p.path) && p.ttl > 0);

  const batches = [
    { ttl: SIGNED_URL_MAX_TTL_S, entries: pending.filter((p) => p.ttl >= SIGNED_URL_MAX_TTL_S) },
    ...pending.filter((p) => p.ttl < SIGNED_URL_MAX_TTL_S).map((p) => ({ ttl: p.ttl, entries: [p] })),
  ].filter((b) => b.entries.length > 0);

  await Promise.all(batches.map(async (b) => {
    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(b.entries.map((e) => e.path), b.ttl);
    // A missing picture is not a missing update; the card shows its type icon.
    if (signError || !signed) return;
    const byPath = new Map(signed.filter((s) => !s.error && s.signedUrl).map((s) => [s.path, s.signedUrl]));
    for (const e of b.entries) {
      const url = byPath.get(e.path);
      if (url) e.item.thumb = { url, signedUntil: now + b.ttl * 1000 };
    }
  }));

  return { ok: true, value: items };
}

/** Where a card opens the update: the profile, which shows it in the viewer. */
export function happeningHref(item: HappeningItem): string {
  const base = item.business.username ? `/${item.business.username}` : `/businesses/${item.business.id}`;
  return `${base}?update=${encodeURIComponent(item.update.id)}`;
}
