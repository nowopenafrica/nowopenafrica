/**
 * What sits behind the design.
 *
 * ── WHY THIS IS NOT JUST A CSS STRING ────────────────────────────────────
 *
 * A page carried `background?: string` and rendered it straight into a style
 * — fine for a colour, useless for anything else. A photograph needs to know
 * how it crops, a video needs to know it is a video, and both need a way to
 * be dimmed so the words stay readable on top of them.
 *
 * The fields are optional and the colour is unchanged, so every document
 * saved before today still opens and still renders exactly as it did.
 *
 * ── THE PART THAT MUST BE SAID OUT LOUD ──────────────────────────────────
 *
 * A video background CANNOT be rasterised by the exporter. html-to-image
 * draws DOM, and a playing video is not DOM — the file would come back with
 * the colour behind it and no warning. So `exportNote` exists, the editor
 * shows it before anyone exports, and nobody discovers it from a customer.
 */

export type BackgroundKind = 'image' | 'video';

export interface PageBackground {
  /** Storage path or absolute URL. */
  assetId: string;
  kind: BackgroundKind;
  fit?: 'cover' | 'contain';
  /** 0..1 — a black veil over the media so text on top stays legible. */
  dim?: number;
}

const VIDEO_EXT = /\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp|svg)(\?|#|$)/i;

/**
 * Is this a picture or a film?
 *
 * Decided from the address, because that is all there is before it loads.
 * An address that says neither returns null rather than being guessed into
 * one: a video silently treated as an image renders as a broken icon, and an
 * image treated as a video renders as nothing at all.
 */
export function kindOfUrl(url: string): BackgroundKind | null {
  const clean = (url ?? '').trim();
  if (!clean) return null;
  if (VIDEO_EXT.test(clean)) return 'video';
  if (IMAGE_EXT.test(clean)) return 'image';
  return null;
}

/** Addresses the renderer is willing to load. */
export function isUsableUrl(url: string): boolean {
  const clean = (url ?? '').trim();
  if (!clean) return false;
  /*
   * http(s) only. A `javascript:` or `data:text/html` address in a src is a
   * script injection with a picture's job title, and a blob: URL cannot be
   * fetched under this app's CSP — it works in development and fails live.
   */
  return /^https?:\/\/\S+$/i.test(clean) || /^[\w-]+\/[\w./-]+$/.test(clean);
}

export const clampDim = (n: number): number =>
  (Number.isFinite(n) ? Math.min(0.9, Math.max(0, n)) : 0);

/**
 * What to tell the user before they export.
 *
 * Null when there is nothing to warn about, so the editor shows a note only
 * when one is true rather than carrying a permanent disclaimer nobody reads.
 */
export function exportNote(background: PageBackground | undefined | null): string | null {
  if (!background) return null;
  if (background.kind === 'video') {
    return 'A video background plays here but cannot be written into a PNG or PDF — the exported file will show the background colour instead.';
  }
  return null;
}

/** The style for the media layer itself. */
export function mediaStyle(background: PageBackground): React.CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: background.fit ?? 'cover',
    pointerEvents: 'none',
  };
}
