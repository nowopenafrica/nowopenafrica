// Hero slides that come from a URL rather than an uploaded file.
//
// The banner slider only ever played files listed out of the `hero-videos`
// storage bucket, so putting a clip on the homepage meant uploading it. A
// YouTube link — the form most footage already exists in — could not be used at
// all.
//
// Two kinds of slide, and the difference matters more than it looks:
//
//   VIDEO — a real file, played in a <video>. The slider can hear its
//   timeupdate and ended events, so the crossfade lands exactly on the end of
//   the clip.
//
//   EMBED — YouTube or Vimeo, played in an <iframe>. There are no events to
//   listen to: reading playback out of a YouTube iframe needs their IFrame API,
//   and script-src does not allow youtube.com, so loading it would be blocked.
//   Embeds therefore advance on a fixed timer. That is a real limitation, not
//   an oversight — see EMBED_SLIDE_SECONDS.
//
// THE CSP TRAP, which is the whole reason parseSlideUrl refuses some URLs
//
// media-src is 'self' blob: https://*.supabase.co https://videos.pexels.com.
// An .mp4 pasted from anywhere else is blocked by the browser — and blocked
// ONLY in production, because the dev server sends no CSP. It would preview
// perfectly and show a black rectangle on the live site. So a direct file URL
// is validated against the hosts that can actually play, and rejected here with
// a reason the admin can act on, rather than discovered by a visitor.
//
// frame-src does allow youtube-nocookie, youtube and player.vimeo.com, so
// embeds have no such restriction.

export type HeroSlideKind = 'video' | 'embed';

export interface HeroSlide {
  id: string;
  /** Exactly what the admin typed, so the field can be edited back. */
  url: string;
  kind: HeroSlideKind;
  /** What actually goes in the src attribute. */
  playbackUrl: string;
  /** Optional admin label, for telling slides apart in the list. */
  title?: string;
}

/**
 * How long an embed slide stays up.
 *
 * A guess, because the iframe cannot tell us when its clip ends. Twelve seconds
 * is long enough to read a banner headline over and short enough that a viewer
 * on a slow connection is not staring at one frame — but a two-minute YouTube
 * clip will be cut off at twelve seconds either way. Hero clips are meant to be
 * short; anything longer belongs on the profile, not the banner.
 */
export const EMBED_SLIDE_SECONDS = 12;

/** Hosts whose video files media-src actually permits. Keep in step with vercel.json. */
export const PLAYABLE_VIDEO_HOSTS = ['videos.pexels.com'];
const SUPABASE_HOST = /(^|\.)supabase\.co$/i;

const VIDEO_EXT = /\.(mp4|m4v|webm|ogv|ogg|mov)$/i;

/** Strip query and fragment before testing an extension. */
const pathOf = (url: string): string => (url || '').split(/[?#]/)[0];

export function youTubeId(url: string): string | null {
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
    .exec((url || '').trim());
  return m ? m[1] : null;
}

export function vimeoId(url: string): string | null {
  const m = /vimeo\.com\/(?:video\/)?(\d{6,})/.exec((url || '').trim());
  return m ? m[1] : null;
}

/**
 * The embed URL for a hero slide.
 *
 * Muted and looping because a banner that makes noise at a visitor is the
 * fastest way to lose them, and autoplay is refused by every browser unless the
 * video is muted. `playlist` repeats the same id, which is the only way YouTube
 * loops a single video. Controls and related videos are off: this is a
 * background, not a player, and "watch next" thumbnails over a hero look like a
 * mistake.
 */
export function youTubeEmbedUrl(id: string): string {
  const params = new URLSearchParams({
    autoplay: '1', mute: '1', loop: '1', playlist: id,
    controls: '0', modestbranding: '1', rel: '0', playsinline: '1',
    disablekb: '1', iv_load_policy: '3',
  });
  // nocookie, because a homepage should not set advertising cookies on someone
  // who has not asked to watch anything.
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

export function vimeoEmbedUrl(id: string): string {
  const params = new URLSearchParams({
    autoplay: '1', muted: '1', loop: '1', background: '1', title: '0', byline: '0', portrait: '0',
  });
  return `https://player.vimeo.com/video/${id}?${params.toString()}`;
}

/** Poster for a YouTube slide, so something is on screen while the iframe loads. */
export const youTubeThumbnail = (id: string): string => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export type SlideParse =
  | { ok: true; kind: HeroSlideKind; playbackUrl: string; poster?: string }
  | { ok: false; reason: string };

/**
 * Work out what a pasted URL is, and whether it can actually play here.
 *
 * Returns a REASON on failure rather than just null, because every rejection
 * here is something the admin can fix — a wrong link, or a file hosted
 * somewhere the page is not allowed to load from — and a silent "invalid URL"
 * gives them nothing to act on.
 */
export function parseSlideUrl(raw: string): SlideParse {
  const url = (raw || '').trim();
  if (!url) return { ok: false, reason: 'Paste a video link first.' };

  const yt = youTubeId(url);
  if (yt) return { ok: true, kind: 'embed', playbackUrl: youTubeEmbedUrl(yt), poster: youTubeThumbnail(yt) };

  const vimeo = vimeoId(url);
  if (vimeo) return { ok: true, kind: 'embed', playbackUrl: vimeoEmbedUrl(vimeo) };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'That is not a full link — include https://' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Use an https link; the site will not load video over http.' };
  }

  if (!VIDEO_EXT.test(pathOf(url))) {
    return {
      ok: false,
      reason: 'Not a video link. Use a YouTube or Vimeo link, or a direct .mp4 / .webm file.',
    };
  }

  const host = parsed.hostname;
  const allowed = SUPABASE_HOST.test(host) || PLAYABLE_VIDEO_HOSTS.includes(host);
  if (!allowed) {
    // The important one. This would preview fine and be blank on the live site.
    return {
      ok: false,
      reason: `The site's security policy will not play video files from ${host}. `
        + 'Upload the file instead, or use a YouTube link.',
    };
  }

  return { ok: true, kind: 'video', playbackUrl: url };
}

const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Build a slide from a pasted URL, or explain why it cannot be one. */
export function makeSlide(raw: string, title?: string): { slide: HeroSlide } | { error: string } {
  const parsed = parseSlideUrl(raw);
  if (!parsed.ok) return { error: parsed.reason };
  return {
    slide: {
      id: uid(),
      url: raw.trim(),
      kind: parsed.kind,
      playbackUrl: parsed.playbackUrl,
      title: (title || '').trim() || undefined,
    },
  };
}

/** Accept only slides we understand; anything else is dropped, not rendered. */
export function parseHeroSlides(value: unknown): HeroSlide[] {
  if (!Array.isArray(value)) return [];
  const out: HeroSlide[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const v = item as Record<string, unknown>;
    if (typeof v.url !== 'string') continue;
    // Re-derived rather than trusted: playbackUrl is what goes into a src, and
    // the embed parameters may have changed since the row was written.
    const parsed = parseSlideUrl(v.url);
    if (!parsed.ok) continue;
    out.push({
      id: typeof v.id === 'string' && v.id ? v.id : uid(),
      url: v.url,
      kind: parsed.kind,
      playbackUrl: parsed.playbackUrl,
      title: typeof v.title === 'string' && v.title.trim() ? v.title.trim() : undefined,
    });
  }
  return out;
}

/**
 * The full playlist: uploaded files first, then URL slides.
 *
 * Uploads lead because they are the ones an admin curated deliberately into the
 * bucket, and because a file slide can end its own clip cleanly while an embed
 * cuts off on a timer — so the sequence opens on the better-behaved kind.
 */
export function heroPlaylist(bucketUrls: string[], slides: HeroSlide[]): HeroSlide[] {
  const uploads: HeroSlide[] = (bucketUrls || []).map((url, i) => ({
    id: `upload-${i}`, url, kind: 'video', playbackUrl: url,
  }));
  return [...uploads, ...(slides || [])];
}
