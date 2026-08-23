// Gallery (OpenReel) media helpers — classification, thumbnails and filtering.
//
// Two problems live here:
//
// 1. VIDEO THUMBNAILS. A `<video preload="metadata">` with no poster loads its
//    metadata but sits at currentTime 0, and whether a frame is actually
//    painted is up to the browser: desktop Chrome shows one, iOS Safari shows a
//    black rectangle. Since OpenReels are recorded on phones and viewed on
//    phones, that meant most reels had no visible thumbnail. Appending a `#t=`
//    media fragment makes the browser seek to that offset and paint the frame
//    there, which is the portable way to get a poster without generating and
//    storing a separate image for every upload.
//
// 2. CLASSIFICATION. Deciding photo-vs-video from the URL has to ignore query
//    strings — the seeded gallery rows are Pexels URLs like
//    `...photo.jpeg?auto=compress&w=640`, and a video URL carrying any query
//    would otherwise be mistaken for a photo and rendered inside an `<img>`.

// A third kind, 'embed', covers a link pasted from YouTube / TikTok / Instagram
// and friends: those play in the platform's own iframe rather than a <video>,
// because the underlying media file is not addressable (see lib/videoEmbeds).
export type MediaKind = 'photo' | 'video' | 'embed';
export type Orientation = 'portrait' | 'landscape' | 'square';

import { isEmbeddableVideoUrl } from './videoEmbeds.js';

const VIDEO_EXTENSIONS = /\.(mp4|m4v|webm|ogv|ogg|mov|qt)$/i;

/** Strip query and fragment so the extension test sees a real path. */
const pathOf = (url: string): string => (url || '').split(/[?#]/)[0];

export function isVideoUrl(url: string | null | undefined): boolean {
  return VIDEO_EXTENSIONS.test(pathOf(url || ''));
}

export function mediaKindOf(url: string | null | undefined): MediaKind {
  if (isVideoUrl(url)) return 'video';
  // A platform link is neither a playable file nor an image — it is an iframe.
  if (url && isEmbeddableVideoUrl(url)) return 'embed';
  return 'photo';
}

/**
 * A video URL that paints a still frame when idle. The offset is small but
 * non-zero: at exactly 0 some decoders stay on a blank frame, which is the
 * behaviour this works around.
 *
 * Preserves any existing query string, and leaves a URL that already carries a
 * `#t=` fragment alone rather than appending a second one.
 */
export function videoThumbnailSrc(url: string, seconds = 0.1): string {
  if (!url) return url;
  const [withoutHash] = url.split('#');
  const existing = url.slice(withoutHash.length);
  if (/^#t=/.test(existing)) return url;
  return `${withoutHash}#t=${seconds}`;
}

/**
 * Orientation from intrinsic dimensions, or null when they aren't known yet
 * (nothing has loaded, or the media failed). A small tolerance keeps
 * near-square media out of portrait/landscape.
 */
export function orientationOf(
  width: number | null | undefined,
  height: number | null | undefined,
): Orientation | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const ratio = width / height;
  if (ratio > 1.05) return 'landscape';
  if (ratio < 0.95) return 'portrait';
  return 'square';
}

export const GALLERY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'video', label: 'Videos' },
  { key: 'photo', label: 'Photos' },
  { key: 'embed', label: 'Linked' },
  { key: 'portrait', label: 'Portrait' },
  { key: 'landscape', label: 'Landscape' },
  { key: 'square', label: 'Square' },
] as const;

export type GalleryFilter = (typeof GALLERY_FILTERS)[number]['key'];

export interface FilterableMedia {
  kind: MediaKind;
  /** null until the browser has reported the intrinsic size. */
  orientation: Orientation | null;
}

export function matchesGalleryFilter(item: FilterableMedia, filter: GalleryFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'photo': return item.kind === 'photo';
    case 'video': return item.kind === 'video';
    case 'embed': return item.kind === 'embed';
    // Orientation is only known once the media has loaded; an unmeasured item
    // is not claimed to be portrait or landscape.
    case 'portrait':
    case 'landscape':
    case 'square': return item.orientation === filter;
    default: return true;
  }
}

/**
 * How many items each filter would show. Used to hide filters that would lead
 * to an empty grid, so the chip row only offers real choices.
 */
export function galleryFilterCounts(items: FilterableMedia[]): Record<GalleryFilter, number> {
  const counts = Object.fromEntries(
    GALLERY_FILTERS.map((f) => [f.key, 0]),
  ) as Record<GalleryFilter, number>;
  for (const f of GALLERY_FILTERS) {
    counts[f.key] = items.filter((i) => matchesGalleryFilter(i, f.key)).length;
  }
  return counts;
}
