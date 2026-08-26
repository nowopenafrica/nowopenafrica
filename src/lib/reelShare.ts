// Sharing an OpenReel to WhatsApp / Facebook / X.
//
// WHY A SEPARATE SHARE URL EXISTS
//
// Link previews are built by crawlers that do not execute JavaScript. This app
// is a client-rendered SPA whose per-page meta tags are written at runtime by
// applySeo, so every crawler — WhatsApp, Facebook, X, LinkedIn, Telegram —
// receives the static index.html and shows the generic homepage card no matter
// what was shared. There is no client-side fix for that.
//
// So a shared reel points at `/r/<galleryId>`, served by api/r/[id].ts — a
// Vercel function that renders real HTML per item: Open Graph tags the crawler
// can read, and a body that plays the reel immediately with a link through to
// the full profile. (It cannot be a Supabase Edge Function: that gateway forces
// every response to text/plain, so no crawler would parse the tags.)
//
// THE POSTER CONVENTION
//
// `og:image` must be a still image — a crawler will not accept an .mp4 there,
// which is why a video reel needs a poster frame. Rather than add a column to
// a schema that has already drifted from these migrations, the poster is stored
// beside its video at a derivable path: `reel-123.mp4` -> `reel-123-poster.jpg`.
// The URL is therefore computable from the video URL alone, with no extra
// lookup and nothing to keep in sync. Reels recorded before this existed simply
// have no poster, and the share card falls back to the business cover image.

import { SITE_URL } from './seo.js';
import { isVideoUrl } from './galleryMedia.js';

/** Suffix that turns a reel's stored name into its poster's. */
export const POSTER_SUFFIX = '-poster.jpg';

/**
 * Where a video's poster lives, derived from the video's own URL or path.
 * Returns null for anything that isn't a video, so callers don't invent a
 * poster for a photo (the photo is already its own share image).
 */
export function posterUrlForVideo(videoUrl: string | null | undefined): string | null {
  if (!videoUrl || !isVideoUrl(videoUrl)) return null;
  const [path, ...rest] = videoUrl.split(/(?=[?#])/);
  const swapped = path.replace(/\.[A-Za-z0-9]+$/, POSTER_SUFFIX);
  if (swapped === path) return null;
  // Query/fragment belong to the video (tokens, #t=), not to the still.
  void rest;
  return swapped;
}

/** The image a share card should use for a gallery item, if any. */
export function shareImageFor(
  url: string,
  fallbackImage?: string | null,
): string | null {
  if (!isVideoUrl(url)) return url;
  return posterUrlForVideo(url) || fallbackImage || null;
}

/** Branded, crawler-served share URL for one gallery item. */
export function reelShareUrl(galleryId: string): string {
  return `${SITE_URL}/r/${encodeURIComponent(galleryId)}`;
}

/** The message that travels with the link. */
export function reelShareText(businessName: string, caption?: string | null): string {
  const trimmed = (caption || '').trim();
  if (trimmed) return `${trimmed} — ${businessName} on NowOpen Africa`;
  return `${businessName} on NowOpen Africa`;
}

/** Title for the share card / page. */
export function reelShareTitle(businessName: string, isVideo: boolean): string {
  return `${businessName} — OpenReel ${isVideo ? 'video' : 'photo'}`;
}

// --- Sharing the media itself -------------------------------------------------
//
// WHY A LINK IS NOT ENOUGH
//
// WhatsApp renders a shared link as a preview CARD: thumbnail, title, tap to
// open. It only plays video inline for a handful of domains it special-cases
// (YouTube, Instagram, Facebook) — no Open Graph tag makes a third-party link
// play in the chat bubble, and Status cannot take a link as a video at all.
//
// What WhatsApp does play is a video FILE. So the share sheet is handed the
// actual bytes via Web Share API Level 2 (`navigator.share({ files })`): the reel
// arrives as a real video, plays inline in a chat and can be posted to Status,
// with the link riding along in the caption so the business is still reachable.
//
// Falls back to sharing the link when files can't be shared — desktop Firefox,
// older browsers, or a clip too large to be worth pushing over mobile data.

/** WhatsApp rejects video much past this, and it is a lot of mobile data. */
export const MAX_SHARE_FILE_BYTES = 16 * 1024 * 1024;

/**
 * Can this browser put a file into the share sheet?
 *
 * The type matters: a browser can accept an image and refuse a video, so a
 * caller sharing a still must probe with a still or it will hide a button that
 * would have worked.
 */
export function canShareFiles(mimeType = 'video/mp4'): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
  try {
    // canShare needs a real File to answer; an empty one is enough to probe.
    return navigator.canShare({ files: [new File([''], `probe.${ext}`, { type: mimeType })] });
  } catch {
    return false;
  }
}

/** Worth pushing the bytes, or should the link do? */
export function shouldShareAsFile(sizeBytes: number, max = MAX_SHARE_FILE_BYTES): boolean {
  return sizeBytes > 0 && sizeBytes <= max;
}

/** A filename the receiving app will show, derived from the media URL. */
export function shareFileName(mediaUrl: string, businessName: string): string {
  const path = (mediaUrl || '').split(/[?#]/)[0];
  const ext = (/\.([A-Za-z0-9]+)$/.exec(path)?.[1] || 'mp4').toLowerCase();
  const slug = (businessName || 'nowopen')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'nowopen';
  return `${slug}-openreel.${ext}`;
}

export type ShareOutcome = 'file' | 'link' | 'copied' | 'cancelled';

/**
 * Share one reel, preferring the media itself so it plays where it lands.
 *
 * `fetchMedia` is injected so this is testable and so callers can supply an
 * already-downloaded blob. Storage is same-origin-ish for CSP purposes
 * (connect-src allows *.supabase.co), so the fetch is permitted — unlike a
 * blob: URL, which connect-src does not cover.
 */
export async function shareReel(opts: {
  mediaUrl: string;
  isVideo: boolean;
  businessName: string;
  caption?: string | null;
  galleryId: string;
  fetchMedia?: (url: string) => Promise<Blob>;
}): Promise<ShareOutcome> {
  const url = reelShareUrl(opts.galleryId);
  const text = reelShareText(opts.businessName, opts.caption);
  const title = reelShareTitle(opts.businessName, opts.isVideo);

  if (canShareFiles()) {
    try {
      const fetcher = opts.fetchMedia ?? (async (u: string) => {
        const res = await fetch(u);
        if (!res.ok) throw new Error(`media ${res.status}`);
        return res.blob();
      });
      const blob = await fetcher(opts.mediaUrl);
      if (shouldShareAsFile(blob.size)) {
        const file = new File([blob], shareFileName(opts.mediaUrl, opts.businessName), {
          type: blob.type || (opts.isVideo ? 'video/mp4' : 'image/jpeg'),
        });
        // The link stays in the text so the reel remains traceable to the
        // business even once the video has been forwarded on.
        await navigator.share({ files: [file], title, text: `${text}\n${url}` });
        return 'file';
      }
    } catch (err) {
      // A cancelled sheet must not fall through to copying a link behind the
      // user's back; anything else is a genuine failure worth degrading from.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'link';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }

  await navigator.clipboard.writeText(`${text} ${url}`);
  return 'copied';
}
