/**
 * Pictures in a design.
 *
 * ── WHAT AN assetId IS ───────────────────────────────────────────────────
 *
 * The STORAGE PATH, not a URL. A document that stored
 * `https://<project>.supabase.co/storage/v1/object/public/...` would bake
 * today's host into every design ever saved; move the bucket or put a CDN in
 * front and thousands of stored documents point at nothing. A path is
 * resolved at render time, so the document outlives the hosting.
 *
 * An absolute URL is still accepted and passed through, because stock images
 * and template artwork already arrive that way. That is a deliberate second
 * form, not an accident — `assetUrl` is the only place that has to know.
 *
 * ── WHERE THE BYTES GO ───────────────────────────────────────────────────
 *
 * The existing `business-images` bucket, under `<user id>/studio/…`, which is
 * the convention every other upload in this app already follows and is what
 * the bucket's policies are written for: anyone may read, only the owner may
 * change or delete. Note that read is PUBLIC — an image placed in a design is
 * readable by anyone holding the URL, which is what a published design
 * requires, and is the same bargain as every other image in the product.
 */

export const STUDIO_BUCKET = 'business-images';

/**
 * Types a browser can reliably decode AND re-encode for export.
 *
 * HEIC is deliberately absent: an iPhone will happily hand one over and most
 * browsers cannot draw it, so it would upload and then render as nothing.
 */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

/**
 * The type of a file that arrived without one.
 *
 * Bytes pulled out of an archive have a name and nothing else — a .pptx
 * stores `ppt/media/image3.png` with no media type attached. Returns null for
 * anything outside the accepted list, which is how PowerPoint's EMF and WMF
 * vector parts get left out instead of being uploaded as files no browser
 * will draw.
 */
export function imageTypeOf(name: string): string | null {
  const byExtension: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  };
  const type = byExtension[name.toLowerCase().split('.').pop() ?? ''];
  return type && (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type) ? type : null;
}

/** Before compression. A modern phone photo is 3–8 MB; 25 is generous. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export type FileCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether a chosen file can become a design image.
 *
 * Says what is wrong in words the person can act on. "Upload failed" tells
 * someone nothing; "That is a HEIC photo" tells them to convert it.
 */
export function checkImageFile(file: { type: string; size: number; name: string }): FileCheck {
  if (file.size === 0) return { ok: false, reason: 'That file is empty.' };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: `That image is ${Math.round(file.size / 1024 / 1024)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` };
  }
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    const what = file.type || 'that file type';
    return { ok: false, reason: `${what} cannot be used in a design. Use a PNG, JPEG, WebP or GIF.` };
  }
  return { ok: true };
}

const extensionFor = (type: string): string =>
  ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' })[type] ?? 'bin';

/**
 * Where one upload is stored.
 *
 * Built from an allowlist, never from the file's own name: a name is user
 * input and may contain `../`, a second extension or a path separator. The
 * only parts that survive are the owner's id, a timestamp and a random tail,
 * so two uploads in the same millisecond cannot collide.
 */
export function assetPath(
  userId: string,
  type: string,
  now: number = Date.now(),
  tail: string = Math.random().toString(36).slice(2, 8),
): string {
  const safeTail = tail.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'x';
  return `${userId}/studio/${now}-${safeTail}.${extensionFor(type)}`;
}

/**
 * The URL to draw.
 *
 * `publicUrlFor` is passed in rather than imported so this stays testable
 * without a Supabase client, and so the resolution rule — absolute URLs pass
 * through, everything else is a bucket path — lives in one place.
 */
export function assetUrl(assetId: string, publicUrlFor: (path: string) => string): string {
  if (/^(https?:)?\/\//i.test(assetId) || assetId.startsWith('data:') || assetId.startsWith('blob:')) {
    return assetId;
  }
  return publicUrlFor(assetId);
}

/**
 * How big a picture should start out on the page.
 *
 * Fitted INSIDE a share of the page and centred, keeping its own proportions,
 * because an image dropped in at a fixed box is stretched the moment its
 * shape differs from that box — and a stretched photo of someone's shop is
 * the first thing they will notice and the last thing they will forgive.
 */
export function placeImage(
  natural: { width: number; height: number },
  page: { width: number; height: number },
  share = 0.6,
): { x: number; y: number; w: number; h: number } {
  const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 1);
  const imageRatio = safe(natural.width) / safe(natural.height);
  const pageRatio = safe(page.width) / safe(page.height);

  /* Both dimensions are fractions of the page, so compare in that space. */
  let w = share;
  let h = (share * pageRatio) / imageRatio;
  if (h > share) {
    h = share;
    w = (share * imageRatio) / pageRatio;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}
