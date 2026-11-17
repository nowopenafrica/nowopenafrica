/*
 * GENERATED FILE — DO NOT EDIT.
 *
 * Derived from src/lib/brandPublish.ts by scripts/sync-brand-social.mjs.
 * Edit the source and run `npm run sync:brand-social`; `npm run verify`
 * fails if this file and its source have drifted.
 *
 * The admin screen and the dispatcher must agree on what may be posted as the
 * brand. Two hand-maintained copies would eventually disagree.
 */

/**
 * Brand publish — the rules brand-social-publish follows when it posts an
 * approved brand post straight to Meta at its planned time.
 *
 * Pure and import-free, so the edge function runs this exact file (generated
 * copy via `npm run sync:brand-social`) and every rule is pinned by a test.
 */

export const MAX_PUBLISH_ATTEMPTS = 3;
/** Variants handled per tick, so one tick stays well inside an edge function's time. */
export const PUBLISH_BATCH = 6;

// ── Is it due? ───────────────────────────────────────────────────────────────

export interface DueInput {
  plannedAt: string | null;
  now: Date;
  graceMinutes: number;
  contentStatus: string;
  approvedBy: string | null;
  dispatchStatus: string;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
}

export type DueVerdict =
  | { due: true }
  | { due: false; reason: 'not_approved' | 'no_time' | 'not_yet' | 'too_late' | 'done' | 'in_flight' | 'uncertain' | 'gave_up' | 'backing_off' };

/**
 * Whether one channel of one post should be published now.
 *
 * "Too late" matters as much as "due": a post planned for 08:30 yesterday is
 * not posted at midnight because the scheduler happened to be down. It waits
 * for a person to reschedule it.
 */
export function isDue(i: DueInput): DueVerdict {
  // 'sent' means the Zoho channels of this post were handed over; its direct
  // channels can still be due. Anything else was never approved, or was pulled.
  if (!['approved', 'sent'].includes(i.contentStatus) || !i.approvedBy) return { due: false, reason: 'not_approved' };
  if (i.dispatchStatus === 'sent') return { due: false, reason: 'done' };
  if (i.dispatchStatus === 'sending') return { due: false, reason: 'in_flight' };
  if (i.lastError?.startsWith('UNCERTAIN')) return { due: false, reason: 'uncertain' };
  if (i.attempts >= MAX_PUBLISH_ATTEMPTS) return { due: false, reason: 'gave_up' };
  if (i.dispatchStatus === 'failed' && !i.nextAttemptAt) return { due: false, reason: 'gave_up' };
  if (!i.plannedAt) return { due: false, reason: 'no_time' };
  const planned = new Date(i.plannedAt).getTime();
  const now = i.now.getTime();
  if (Number.isNaN(planned)) return { due: false, reason: 'no_time' };
  if (planned > now) return { due: false, reason: 'not_yet' };
  if (now - planned > i.graceMinutes * 60_000) return { due: false, reason: 'too_late' };
  if (i.nextAttemptAt && new Date(i.nextAttemptAt).getTime() > now) return { due: false, reason: 'backing_off' };
  return { due: true };
}

// ── Formats ──────────────────────────────────────────────────────────────────

export type PostFormat = 'post' | 'reel' | 'story' | 'carousel';
export const POST_FORMATS: PostFormat[] = ['post', 'reel', 'story', 'carousel'];
export const FORMAT_LABEL: Record<PostFormat, string> = { post: 'Post', reel: 'Reel', story: 'Story', carousel: 'Carousel' };

/**
 * What each channel can take when published directly. Channels not listed
 * here only take a plain post (they go through Zoho, which has no reel or
 * story upload in its bulk file).
 */
export const FORMATS_BY_CHANNEL: Record<string, PostFormat[]> = {
  facebook: ['post', 'reel', 'story'],
  instagram: ['post', 'carousel', 'reel', 'story'],
  threads: ['post', 'carousel'],
  x: ['post'],
  linkedin_company: ['post'],
  linkedin_profile: ['post'],
  /** TikTok takes video only; a "reel" is a TikTok video. */
  tiktok: ['reel'],
  /** YouTube: reel = a Short (vertical, up to 3 minutes); post = a regular video. */
  youtube: ['reel', 'post'],
};

/** The OAuth account a direct channel publishes with. */
export function providerForChannel(channel: string): 'x' | 'linkedin' | 'tiktok' | 'youtube' | null {
  if (channel === 'x' || channel === 'tiktok' || channel === 'youtube') return channel;
  if (channel === 'linkedin_company' || channel === 'linkedin_profile') return 'linkedin';
  return null;
}

export function formatsFor(channel: string): PostFormat[] {
  return FORMATS_BY_CHANNEL[channel] ?? ['post'];
}

function kindOf(url: string): 'image' | 'video' | null {
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (/\.(mp4|mov|m4v|webm)$/.test(path)) return 'video';
  if (/\.(jpe?g|png|webp)$/.test(path)) return 'image';
  return null;
}

/**
 * Why this channel cannot publish this format with this media, or null when
 * it can. Mirrors Meta's own rules so a post is refused here, with a clear
 * reason, instead of failing at the platform.
 */
export function formatProblem(channel: string, format: PostFormat, media: string[]): string | null {
  if (!formatsFor(channel).includes(format)) return `${channel} cannot take a ${FORMAT_LABEL[format].toLowerCase()} from here.`;
  const kinds = media.map(kindOf);
  if (kinds.some((k) => k === null)) return 'A media link is not a recognised image or video file.';
  const first = kinds[0] ?? null;
  switch (format) {
    case 'reel':
      return media.length === 1 && first === 'video' ? null : 'A reel needs exactly one video.';
    case 'story':
      return media.length === 1 ? null : 'A story needs exactly one image or video.';
    case 'carousel':
      if (media.length < 2 || media.length > 10) return 'A carousel needs 2 to 10 images or videos.';
      return null;
    case 'post':
      if (channel === 'youtube') return media.length === 1 && first === 'video' ? null : 'A YouTube video needs exactly one video file.';
      if (channel === 'instagram' && first !== 'image') return 'An Instagram post needs one image. Use Reel for a video.';
      if ((channel === 'x' || channel.startsWith('linkedin')) && first === 'video') return 'Video posts to X and LinkedIn go through Zoho for now; attach an image or none.';
      if (media.length > 1) return 'A post takes one image or video. Use Carousel for more.';
      return null;
  }
}

// ── What to send ─────────────────────────────────────────────────────────────

export type MediaKind = 'image' | 'video' | null;

export interface FacebookRequest {
  /** Graph edge on the Page: feed, photos or videos. */
  edge: 'feed' | 'photos' | 'videos';
  params: Record<string, string>;
}

/**
 * The Graph call for a Facebook Page post.
 *
 * A link goes in the text as well as the `link` field for text posts, so the
 * reader sees the tracked URL even when Facebook decides not to render a
 * preview card. For photos and videos Facebook has no link field, so the link
 * is appended to the text when it is not already there.
 */
export function facebookRequest(caption: string, link: string | null, mediaUrl: string | null, kind: MediaKind, published = true): FacebookRequest {
  const text = link && !caption.includes(link) ? `${caption}\n\n${link}` : caption;
  const pub = published ? 'true' : 'false';
  if (mediaUrl && kind === 'image') return { edge: 'photos', params: { url: mediaUrl, caption: text, published: pub } };
  if (mediaUrl && kind === 'video') return { edge: 'videos', params: { file_url: mediaUrl, description: text, published: pub } };
  const params: Record<string, string> = { message: text, published: pub };
  if (link) params.link = link;
  return { edge: 'feed', params };
}

// ── Reading Meta's errors ────────────────────────────────────────────────────

export type ErrorClass =
  /** The token is dead or lacks a permission: stop, a person must reconnect. */
  | 'auth'
  /** Rate-limited or Meta is having a moment: try again later. */
  | 'retry'
  /** Meta refused this post (bad media, too long, duplicate): retrying will not help. */
  | 'permanent';

/** Codes from Meta's Graph error reference. */
const AUTH_CODES = new Set([102, 190, 200, 10, 3]);
const RETRY_CODES = new Set([1, 2, 4, 17, 32, 341, 368, 613]);

export function classifyGraphError(httpStatus: number, error: { code?: number; is_transient?: boolean } | null | undefined): ErrorClass {
  const code = error?.code;
  if (typeof code === 'number' && AUTH_CODES.has(code)) return 'auth';
  if (error?.is_transient) return 'retry';
  if (typeof code === 'number' && RETRY_CODES.has(code)) return 'retry';
  if (httpStatus === 401 || httpStatus === 403) return 'auth';
  if (httpStatus === 429 || httpStatus >= 500 || httpStatus === 0) return 'retry';
  return 'permanent';
}

/** Wait before attempt n+1: 5, 20, then 80 minutes. */
export function backoffMinutes(attemptsSoFar: number): number {
  return 5 * 4 ** Math.max(0, attemptsSoFar - 1);
}

// ── Did it really go out? ────────────────────────────────────────────────────

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/https?:\/\/\S+/g, ' ').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));
}

/**
 * Whether a post found on the Page is ours. Used after an UNCERTAIN attempt
 * (a timeout: Meta may have posted it) so the record can be settled from what
 * is actually on the Page instead of posting a second copy.
 */
export function looksLikeOurPost(ourCaption: string, theirMessage: string, threshold = 0.85): boolean {
  const a = words(ourCaption); const b = words(theirMessage);
  if (!a.size || !b.size) return false;
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both) >= threshold;
}
