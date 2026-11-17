// Business Updates — 24-hour stories and announcements (pure, no React / Supabase I/O).
//
// THE DATABASE IS THE GATE. An update is public for exactly 24 hours because
// Postgres RLS filters `expires_at > now()` on every public read, and
// `expires_at` is a generated column nobody can edit. This file only mirrors
// those rules so the composer can say "that will be refused" before a round
// trip, and so the dashboard can label each update. If the two ever disagree,
// the server wins — see supabase/migrations/20261110010000_business_updates.sql,
// whose `business_update_state()` follows the same order as `deriveUpdateState`.

import type { KeepTopic } from './keeps';
import { formatLocalDate, isSameLocalDay } from './dates';

export type UpdateType = 'new_product' | 'new_service' | 'offer' | 'announcement' | 'event' | 'recent_work';

export const UPDATE_TYPES: { key: UpdateType; label: string }[] = [
  { key: 'new_product', label: 'New product' },
  { key: 'new_service', label: 'New service' },
  { key: 'offer', label: 'Offer' },
  { key: 'announcement', label: 'Announcement' },
  { key: 'event', label: 'Event' },
  { key: 'recent_work', label: 'Recent work' },
];

/**
 * Which Keep topic an update reaches. Topics are the consent record, so an
 * update only notifies people who asked for that kind of news. Mirrored by
 * `business_update_topic()` in SQL; a test compares the two.
 */
export const UPDATE_TOPIC: Record<UpdateType, KeepTopic> = {
  new_product: 'products',
  new_service: 'products',
  offer: 'promotions',
  announcement: 'announcements',
  event: 'events',
  recent_work: 'announcements',
};

/** Team roles that may publish, besides the owner and admins. Mirrored by `update_publisher_roles()`. */
export const PUBLISHER_ROLES = ['manager', 'marketing', 'content_editor'] as const;

export const UPDATE_LIFETIME_MS = 86_400_000;
export const MAX_SCHEDULE_AHEAD_MS = 14 * 86_400_000;
/** How far in the past a publish time may be, to absorb a phone's clock running fast or slow. */
export const CLOCK_SKEW_MS = 5 * 60_000;
export const MAX_MEDIA = 10;
export const MAX_TITLE = 80;
export const MAX_BODY = 500;
export const MAX_CTA_LABEL = 30;
/** Signed media links live at most this long, and never past the update's own end. */
export const SIGNED_URL_MAX_TTL_S = 600;

export type UpdateState = 'draft' | 'scheduled' | 'active' | 'ended' | 'hidden';

export interface UpdateLifecycleRow {
  published_at: string | null;
  expires_at: string | null;
  ended_at: string | null;
  moderation_status: 'ok' | 'hidden';
}

/** Hidden first: a moderation decision outranks everything the owner set. */
export function deriveUpdateState(row: UpdateLifecycleRow, now: Date = new Date()): UpdateState {
  if (row.moderation_status === 'hidden') return 'hidden';
  if (!row.published_at) return 'draft';
  const t = now.getTime();
  if (Date.parse(row.published_at) > t) return 'scheduled';
  if (row.ended_at) return 'ended';
  if (!row.expires_at || Date.parse(row.expires_at) <= t) return 'ended';
  return 'active';
}

export interface UpdateDraftInput {
  type: UpdateType;
  title: string;
  body: string;
  mediaCount: number;
  offerId: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  publishAt: Date | null;
}

export function validateUpdateDraft(input: UpdateDraftInput, now: Date = new Date()): string[] {
  const errors: string[] = [];
  const title = input.title.trim();
  const body = input.body.trim();

  if (!title && !body && input.mediaCount === 0) errors.push('Add some text, a photo or a video.');
  if (title.length > MAX_TITLE) errors.push(`Title can be up to ${MAX_TITLE} characters.`);
  if (body.length > MAX_BODY) errors.push(`Text can be up to ${MAX_BODY} characters.`);
  if (input.mediaCount > MAX_MEDIA) errors.push(`Up to ${MAX_MEDIA} photos or videos.`);
  if (input.type === 'offer' && !input.offerId) errors.push('Choose the offer this update is about.');

  const url = input.ctaUrl?.trim();
  if (url && !url.startsWith('https://') && !isInAppPath(url)) errors.push('Links must start with https:// or /.');
  if ((input.ctaLabel?.trim().length ?? 0) > MAX_CTA_LABEL) {
    errors.push(`Button text can be up to ${MAX_CTA_LABEL} characters.`);
  }

  if (input.publishAt) {
    const delta = input.publishAt.getTime() - now.getTime();
    if (delta > MAX_SCHEDULE_AHEAD_MS) errors.push('Schedule up to 14 days ahead.');
    if (delta < -CLOCK_SKEW_MS) errors.push('That time has already passed.');
  }
  return errors;
}

/**
 * How long a signed media link should live. Signing is refused by the server
 * once an update ends; this keeps a link signed near the end from outliving it
 * by more than the cap. 0 means "do not sign".
 */
export function signedUrlTtlSeconds(expiresAt: string, now: Date = new Date()): number {
  const left = Math.floor((Date.parse(expiresAt) - now.getTime()) / 1000);
  if (!Number.isFinite(left) || left <= 0) return 0;
  return Math.min(SIGNED_URL_MAX_TTL_S, left);
}

/** Opens the update on the business profile; shows "This update has ended" after expiry. */
export const updateShareLink = (slug: string, updateId: string): string =>
  `/${slug}?update=${encodeURIComponent(updateId)}`;

// --- Media -----------------------------------------------------------------------

/** Checked before compression, on what the person picked. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_MS = 60_000;

/** The bucket's MIME allowlist (migration 20261110010000). HEIC is not on it. */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);

export function classifyMediaFile(
  f: { type: string; size: number; durationMs?: number | null },
): { kind: 'image' | 'video' } | { error: string } {
  if (IMAGE_TYPES.has(f.type)) {
    if (f.size > MAX_IMAGE_BYTES) return { error: 'That photo is over 10 MB. Try a smaller one.' };
    return { kind: 'image' };
  }
  if (VIDEO_TYPES.has(f.type)) {
    if (f.size > MAX_VIDEO_BYTES) return { error: 'That video is over 50 MB. Try a shorter clip.' };
    // An unreadable length is refused, not waved through: the database cap only
    // applies to a duration the client reports, so null would mean uncapped.
    if (f.durationMs == null) return { error: "We couldn't read this video's length. Try an MP4 from your phone's camera." };
    if (f.durationMs > MAX_VIDEO_MS) return { error: 'Videos can be up to 60 seconds.' };
    return { kind: 'video' };
  }
  return { error: 'Choose a photo or a video.' };
}

/** `<business_id>/<update_id>/<file>.<ext>` — the only shape storage accepts. */
export function updateMediaPath(businessId: string, updateId: string, fileId: string, ext: string): string {
  const clean = ext.toLowerCase();
  return `${businessId}/${updateId}/${fileId}.${/^[a-z0-9]{1,5}$/.test(clean) ? clean : 'bin'}`;
}

// --- Dashboard -----------------------------------------------------------------

export type OwnerGroup = 'active' | 'upcoming' | 'archive';

export function ownerGroup(state: UpdateState): OwnerGroup {
  if (state === 'active') return 'active';
  if (state === 'draft' || state === 'scheduled') return 'upcoming';
  return 'archive';
}

/** "6:40 pm" on the device's clock, as src/lib/dates.ts reads local time. */
function clock(d: Date): string {
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

function dayWord(d: Date, now: Date): string {
  if (isSameLocalDay(d.toISOString(), now)) return '';
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (isSameLocalDay(d.toISOString(), tomorrow)) return 'tomorrow ';
  return `${formatLocalDate(d.toISOString())}, `;
}

export function updateTimeLabel(row: UpdateLifecycleRow, now: Date = new Date()): string {
  const state = deriveUpdateState(row, now);
  if (state === 'hidden') return 'Hidden by NowOpen';
  if (state === 'draft') return 'Draft';
  if (state === 'ended') return 'Ended';
  if (state === 'scheduled') {
    const at = new Date(row.published_at as string);
    return `Goes live ${dayWord(at, now)}${clock(at)}`;
  }
  const ends = new Date(row.expires_at as string);
  return `Ends ${dayWord(ends, now)}${clock(ends)}`;
}

// --- Public profile -------------------------------------------------------------

/** "3h ago" for the viewer's line. A clock running behind never shows a negative time. */
export function postedAgoLabel(publishedAt: string, now: Date = new Date()): string {
  const ms = now.getTime() - Date.parse(publishedAt);
  if (!Number.isFinite(ms) || ms < 60_000) return 'Just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  const days = Math.floor(ms / 86_400_000);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * A path on NowOpen itself. "//host" and "/\host" also start with a slash, but
 * browsers (and the router) read them as another site, so they are not.
 */
export function isInAppPath(url: string): boolean {
  return /^\/(?![/\\])/.test(url);
}

// --- Discover and Keeps ---------------------------------------------------------

interface Rankable {
  update: { published_at: string };
  business: { id: string; location: string | null; category: string | null };
}

/**
 * "Happening on NowOpen" order: newest first, always. Relevance only breaks
 * ties inside the same clock hour (kept businesses, then the place typed, then
 * the category chosen), so nothing old is ever lifted above something new and
 * no signal is invented. Returns a new array.
 */
export function rankHappening<T extends Rankable>(
  items: T[],
  ctx: { keptIds: Set<string>; place: string; category: string },
  // Part of the signature for symmetry with the other clock-aware helpers;
  // the order depends only on the items themselves.
  _now: Date = new Date(),
): T[] {
  const place = ctx.place.trim().toLowerCase();
  const score = (x: T) =>
    (ctx.keptIds.has(x.business.id) ? 4 : 0)
    + (place && (x.business.location ?? '').toLowerCase().includes(place) ? 2 : 0)
    + (ctx.category && x.business.category === ctx.category ? 1 : 0);
  const time = (x: T) => Date.parse(x.update.published_at);
  const hour = (x: T) => Math.floor(time(x) / 3_600_000);
  return [...items].sort((a, b) => (hour(b) - hour(a)) || (score(b) - score(a)) || (time(b) - time(a)));
}
