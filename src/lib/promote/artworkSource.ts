/**
 * What a piece of advert artwork is, decided before anything tries to load it.
 *
 * The preview used to accept four image MIME types and nothing else. That
 * refused GIF and AVIF, every video, and — on some Windows browsers, which hand
 * over a perfectly good JPG with an empty `file.type` — ordinary photographs.
 * So the type is read from the MIME type when there is one and from the
 * extension when there is not, and every refusal says what WOULD work.
 */

export type ArtworkKind = 'image' | 'video';

export type ArtworkVerdict =
  | { ok: true; kind: ArtworkKind }
  | { ok: false; problem: string };

const IMAGE_TYPES = /^image\/(png|jpeg|webp|svg\+xml|gif|avif)$/;
const VIDEO_TYPES = /^video\/(mp4|webm|quicktime|ogg|x-m4v)$/;
const IMAGE_EXT = /\.(png|jpe?g|jfif|webp|svg|gif|avif)$/i;
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv)$/i;
const HEIC = /\.(heic|heif)$|^image\/hei[cf]$/i;

/** Images up to 25MB; a preview never needs the print file. Video up to 200MB. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

const UNSUPPORTED =
  'That file type cannot be previewed. Upload an image (PNG, JPG, WebP, SVG, GIF) or a video (MP4, WebM, MOV).';

export function classifyArtworkFile(file: { name: string; type: string; size: number }): ArtworkVerdict {
  const type = (file.type || '').toLowerCase();
  if (HEIC.test(type) || HEIC.test(file.name)) {
    return { ok: false, problem: 'iPhone HEIC photos cannot be shown in a browser. Export it as JPG or PNG and upload that.' };
  }
  const kind: ArtworkKind | null =
    IMAGE_TYPES.test(type) ? 'image'
    : VIDEO_TYPES.test(type) ? 'video'
    // An empty or generic type is common; the extension is the next best witness.
    : (!type || type === 'application/octet-stream') && IMAGE_EXT.test(file.name) ? 'image'
    : (!type || type === 'application/octet-stream') && VIDEO_EXT.test(file.name) ? 'video'
    : null;
  if (!kind) return { ok: false, problem: UNSUPPORTED };
  if (kind === 'image' && file.size > MAX_IMAGE_BYTES) {
    return { ok: false, problem: 'That image is over 25MB. Export a smaller version — a preview does not need the print file.' };
  }
  if (kind === 'video' && file.size > MAX_VIDEO_BYTES) {
    return { ok: false, problem: 'That video is over 200MB. Export a shorter or lighter version for the preview.' };
  }
  return { ok: true, kind };
}

/**
 * A pasted link. Only a direct link to the file itself can be shown: a
 * YouTube or Instagram PAGE is a web page, not a picture, and loading it as one
 * fails in a way nobody could diagnose — so it is refused with the reason.
 */
export type UrlVerdict =
  | { ok: true; url: string; kind: ArtworkKind | 'unknown'; name: string }
  | { ok: false; problem: string };

const PAGE_HOSTS = /(^|\.)(youtube\.com|youtu\.be|instagram\.com|facebook\.com|tiktok\.com|x\.com|twitter\.com|vimeo\.com|drive\.google\.com)$/i;

export function classifyArtworkUrl(input: string): UrlVerdict {
  const raw = input.trim();
  if (!raw) return { ok: false, problem: 'Paste a link to an image or video of your advert.' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, problem: 'That is not a web address. Paste a link starting with https://' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, problem: 'Only web links (https://) can be previewed.' };
  }
  if (PAGE_HOSTS.test(url.hostname)) {
    return {
      ok: false,
      problem: 'That is a page, not the file itself. Paste a direct link to the image or video (ending in .jpg, .png, .mp4 and so on), or download it and upload it here.',
    };
  }
  const path = decodeURIComponent(url.pathname);
  const name = path.split('/').filter(Boolean).pop() || url.hostname;
  const kind: ArtworkKind | 'unknown' =
    VIDEO_EXT.test(path) ? 'video' : IMAGE_EXT.test(path) ? 'image' : 'unknown';
  return { ok: true, url: url.toString(), kind, name };
}
