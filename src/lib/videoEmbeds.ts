// Pasting a video link from another platform.
//
// WHAT IS AND ISN'T POSSIBLE HERE
//
// Instagram, TikTok and YouTube do not expose direct media files. A Reel's or a
// Short's actual stream sits behind signed, short-lived, geo-fenced URLs, so you
// cannot put one in `<video src>` — and re-hosting their video would breach
// their terms and break the moment they rotate a URL.
//
// What every one of them does provide is an official embed player, addressed by
// the id in the link. So a pasted link is parsed into `{ platform, id }` and
// rendered as that platform's own iframe: the video plays, the creator keeps
// their view count and attribution, and nothing is copied.
//
// Direct file URLs (`.mp4`, `.webm`, …) are still handled as plain video, since
// those are the ones a `<video>` element can actually play.

export type EmbedPlatform = 'youtube' | 'tiktok' | 'instagram' | 'vimeo' | 'facebook';

export interface VideoEmbed {
  platform: EmbedPlatform;
  /** Platform-native id (or shortcode) taken from the link. */
  id: string;
  /** URL for an <iframe src>. */
  embedUrl: string;
  /** The link as pasted, kept for attribution and for opening the original. */
  originalUrl: string;
  label: string;
}

/** Hosts whose iframes the CSP must allow — kept beside the parsers so the
 *  two can't drift. Mirrored in vercel.json's frame-src. */
export const EMBED_FRAME_HOSTS = [
  'https://www.youtube-nocookie.com',
  'https://www.youtube.com',
  'https://www.tiktok.com',
  'https://www.instagram.com',
  'https://player.vimeo.com',
  'https://www.facebook.com',
] as const;

const PLATFORM_LABELS: Record<EmbedPlatform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  vimeo: 'Vimeo',
  facebook: 'Facebook',
};

/** Parse, tolerating whitespace and a missing scheme ("youtu.be/abc"). */
function toUrl(raw: string): URL | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

const host = (u: URL) => u.hostname.replace(/^www\./i, '').toLowerCase();

/**
 * Recognise a shareable video link and return how to embed it, or null when the
 * link isn't a supported platform video (a direct file, or something else).
 */
export function parseVideoEmbed(raw: string): VideoEmbed | null {
  const u = toUrl(raw);
  if (!u) return null;
  const h = host(u);
  const segments = u.pathname.split('/').filter(Boolean);
  const original = u.toString();

  const make = (platform: EmbedPlatform, id: string, embedUrl: string): VideoEmbed | null =>
    id ? { platform, id, embedUrl, originalUrl: original, label: PLATFORM_LABELS[platform] } : null;

  // YouTube: watch?v=, youtu.be/, /shorts/, /embed/, /live/
  if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    const fromPath = ['shorts', 'embed', 'live', 'v'].includes(segments[0]) ? segments[1] : '';
    const id = (v || fromPath || '').split(/[?&#]/)[0];
    // nocookie keeps a viewer's profile out of it until they press play.
    return make('youtube', id, `https://www.youtube-nocookie.com/embed/${id}`);
  }
  if (h === 'youtu.be') {
    const id = segments[0] || '';
    return make('youtube', id, `https://www.youtube-nocookie.com/embed/${id}`);
  }

  // TikTok: /@user/video/<id>, and the short vm./vt. links (which need the id,
  // so a shortlink can only be embedded once it has been resolved).
  if (h === 'tiktok.com' || h === 'm.tiktok.com') {
    const videoIdx = segments.indexOf('video');
    const id = videoIdx >= 0 ? segments[videoIdx + 1] : (segments[0] === 'embed' ? segments[segments.length - 1] : '');
    return make('tiktok', (id || '').replace(/\D/g, ''), `https://www.tiktok.com/embed/v2/${(id || '').replace(/\D/g, '')}`);
  }

  // Instagram: /reel/<code>, /p/<code>, /tv/<code>
  if (h === 'instagram.com') {
    const kind = segments[0];
    const code = ['reel', 'reels', 'p', 'tv'].includes(kind) ? segments[1] : '';
    const path = kind === 'p' ? 'p' : 'reel';
    return make('instagram', code || '', `https://www.instagram.com/${path}/${code}/embed`);
  }

  // Vimeo: /<numeric id>
  if (h === 'vimeo.com' || h === 'player.vimeo.com') {
    const id = (segments.find((s) => /^\d+$/.test(s)) || '');
    return make('vimeo', id, `https://player.vimeo.com/video/${id}`);
  }

  // Facebook watch/reel — embedded through their plugin endpoint.
  if (h === 'facebook.com' || h === 'fb.watch') {
    const id = u.searchParams.get('v') || segments[segments.length - 1] || '';
    return make('facebook', id, `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(original)}&show_text=false`);
  }

  return null;
}

/** True when the URL is a platform link we can embed. */
export const isEmbeddableVideoUrl = (raw: string): boolean => parseVideoEmbed(raw) !== null;

/**
 * Why a link can't be a *rendered* background, or null when it can.
 *
 * Design and motion backgrounds are composited into a canvas to produce the
 * downloadable file. A platform embed is an iframe, and a canvas cannot draw
 * one — so a YouTube link is watchable but can never be a background. Saying so
 * up front beats letting someone design against a preview that exports blank.
 */
export function backgroundSourceIssue(raw: string): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  const embed = parseVideoEmbed(trimmed);
  if (embed) {
    return `${embed.label} links play in their own player, so they can't be drawn into a downloadable design. Upload the file, record with OpenReel, or paste a direct image/video address.`;
  }
  return null;
}

/**
 * Why a pasted link can't be used, in words an owner can act on. Returns null
 * when the link is fine.
 */
export function embedRejectionReason(raw: string): string | null {
  const u = toUrl(raw);
  if (!u) return 'That doesn\'t look like a link. Paste the full video address.';
  const h = host(u);
  if (h === 'vm.tiktok.com' || h === 'vt.tiktok.com' || h === 'fb.watch') {
    return 'Short links don\'t carry the video id. Open the video and copy the full link from the address bar.';
  }
  if (parseVideoEmbed(raw)) return null;
  if (/\.(mp4|m4v|webm|ogv|mov)(\?|#|$)/i.test(u.pathname + u.search)) return null; // direct file
  return 'Paste a YouTube, TikTok, Instagram, Vimeo or Facebook video link — or a direct .mp4 address.';
}
