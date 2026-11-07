import type { DesignPage } from './designDocument';

/**
 * Page sizes.
 *
 * ── WHAT THESE NUMBERS ARE, AND ARE NOT ──────────────────────────────────
 *
 * Widely used sizes, written down here. They are NOT fetched from any
 * platform's API and nothing in the product calls them official: networks
 * change their specifications without notice, and a product that promises
 * "the correct Instagram size" is promising something it cannot keep. The
 * user can always type their own dimensions, which is the only guarantee
 * that survives a platform redesign.
 *
 * Print sizes are held in millimetres and converted at a chosen resolution,
 * because a flyer is 210mm wide whatever the pixel count — and the pixel
 * count is a consequence of the resolution, not a property of the paper.
 */

export type Unit = 'px' | 'mm' | 'cm' | 'in';

export interface Preset {
  id: string;
  label: string;
  group: string;
  width: number;
  height: number;
  unit: Unit;
  /** For physical sizes: the resolution those millimetres are rendered at. */
  dpi?: number;
  note?: string;
}

/** The default for print. 300 is the usual commercial minimum. */
export const PRINT_DPI = 300;

const mm = (id: string, label: string, group: string, width: number, height: number, note?: string): Preset =>
  ({ id, label, group, width, height, unit: 'mm', dpi: PRINT_DPI, note });

const px = (id: string, label: string, group: string, width: number, height: number, note?: string): Preset =>
  ({ id, label, group, width, height, unit: 'px', note });

export const PRESETS: Preset[] = [
  // ── Social ────────────────────────────────────────────────────────────
  px('ig-square', 'Instagram post (square)', 'Social', 1080, 1080),
  px('ig-portrait', 'Instagram post (portrait)', 'Social', 1080, 1350),
  px('ig-story', 'Instagram story / reel', 'Social', 1080, 1920),
  px('tiktok', 'TikTok', 'Social', 1080, 1920),
  px('whatsapp-status', 'WhatsApp status', 'Social', 1080, 1920),
  px('facebook-post', 'Facebook post', 'Social', 1200, 630),
  px('facebook-cover', 'Facebook cover', 'Social', 820, 312),
  px('linkedin-post', 'LinkedIn post', 'Social', 1200, 627),
  px('linkedin-banner', 'LinkedIn banner', 'Social', 1584, 396),
  px('x-post', 'X post', 'Social', 1600, 900),
  px('pinterest', 'Pinterest pin', 'Social', 1000, 1500),

  // ── Video and thumbnails ──────────────────────────────────────────────
  px('youtube-thumb', 'YouTube thumbnail', 'Video', 1280, 720),
  px('youtube-art', 'YouTube channel art', 'Video', 2560, 1440, 'Keep anything important well inside the middle; the crop differs on every device.'),
  px('video-landscape', 'Video frame (16:9)', 'Video', 1920, 1080),
  px('video-vertical', 'Vertical video (9:16)', 'Video', 1080, 1920),
  px('video-square', 'Square video (1:1)', 'Video', 1080, 1080),

  // ── Web ───────────────────────────────────────────────────────────────
  px('web-hero', 'Website hero banner', 'Web', 1920, 600),
  px('web-leaderboard', 'Leaderboard advert', 'Web', 728, 90),
  px('web-rectangle', 'Medium rectangle advert', 'Web', 300, 250),
  px('web-skyscraper', 'Skyscraper advert', 'Web', 160, 600),
  px('email-header', 'Email header', 'Web', 600, 200),
  px('slide-wide', 'Presentation slide (16:9)', 'Web', 1920, 1080),
  px('slide-classic', 'Presentation slide (4:3)', 'Web', 1024, 768),

  // ── Mobile ────────────────────────────────────────────────────────────
  px('phone-wallpaper', 'Phone wallpaper', 'Mobile', 1080, 1920),
  px('app-screenshot', 'App store screenshot', 'Mobile', 1242, 2688),
  px('mobile-banner', 'In-app banner', 'Mobile', 640, 200),

  // ── Flyers and posters ────────────────────────────────────────────────
  mm('a3', 'A3 poster', 'Flyers & posters', 297, 420),
  mm('a4', 'A4 flyer', 'Flyers & posters', 210, 297),
  mm('a5', 'A5 flyer', 'Flyers & posters', 148, 210),
  mm('a6', 'A6 handbill', 'Flyers & posters', 105, 148),
  mm('dl', 'DL flyer', 'Flyers & posters', 99, 210),
  mm('a2', 'A2 poster', 'Flyers & posters', 420, 594, 'Very large at print resolution; the file is reduced to what browsers can produce.'),

  // ── Cards and stationery ──────────────────────────────────────────────
  mm('business-card', 'Business card', 'Cards & stationery', 85, 55, 'Keep text about 4mm clear of the edge; trimming is never exact.'),
  mm('postcard', 'Postcard', 'Cards & stationery', 148, 105),
  mm('invitation', 'Invitation (5×7in)', 'Cards & stationery', 127, 178),
  mm('certificate', 'Certificate (A4 landscape)', 'Cards & stationery', 297, 210),
  mm('menu', 'Menu (A4)', 'Cards & stationery', 210, 297),
  mm('label', 'Label / sticker', 'Cards & stationery', 100, 70),
];

export const PRESET_GROUPS = ['Social', 'Video', 'Web', 'Mobile', 'Flyers & posters', 'Cards & stationery'];

/** Millimetres, centimetres or inches into pixels at a resolution. */
export function toPixels(value: number, unit: Unit, dpi = PRINT_DPI): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  switch (unit) {
    case 'px': return Math.round(value);
    case 'mm': return Math.round((value / 25.4) * dpi);
    case 'cm': return Math.round((value / 2.54) * dpi);
    default: return Math.round(value * dpi);
  }
}

/** Pixels back into a physical unit, for showing what was typed. */
export function fromPixels(pixels: number, unit: Unit, dpi = PRINT_DPI): number {
  if (!Number.isFinite(pixels) || pixels <= 0) return 0;
  switch (unit) {
    case 'px': return Math.round(pixels);
    case 'mm': return Math.round((pixels / dpi) * 25.4 * 10) / 10;
    case 'cm': return Math.round((pixels / dpi) * 2.54 * 10) / 10;
    default: return Math.round((pixels / dpi) * 100) / 100;
  }
}

/** A preset's size in the pixels a document actually uses. */
export const presetPixels = (preset: Preset): { width: number; height: number } => ({
  width: toPixels(preset.width, preset.unit, preset.dpi),
  height: toPixels(preset.height, preset.unit, preset.dpi),
});

/** The smallest and largest a page may be, so a document stays renderable. */
export const MIN_PAGE_PX = 16;
export const MAX_PAGE_PX = 20000;

export function clampPageSize(width: number, height: number): { width: number; height: number } {
  const fix = (n: number) => Math.min(MAX_PAGE_PX, Math.max(MIN_PAGE_PX, Math.round(Number.isFinite(n) ? n : MIN_PAGE_PX)));
  return { width: fix(width), height: fix(height) };
}

/**
 * How a design is carried into a new page size.
 *
 * `stretch` keeps every object's share of the page. It is right for a small
 * change and wrong for a large one: taking a square to a story this way makes
 * a round logo an oval, because the object keeps 20% of a width and 20% of a
 * height that are no longer in the same proportion.
 *
 * `fit` rescales the whole design uniformly and centres it, so nothing is
 * distorted — the cost is empty space along the longer axis, which the user
 * can then fill deliberately. That is the honest trade, and it is why the
 * choice is offered rather than guessed.
 */
export type RefitMode = 'fit' | 'stretch';

export function refitPage(page: DesignPage, width: number, height: number, mode: RefitMode): DesignPage {
  const size = clampPageSize(width, height);
  if (size.width === page.width && size.height === page.height) return page;

  if (mode === 'stretch' || page.objects.length === 0) {
    return { ...page, ...size };
  }

  /*
   * The uniform zoom that takes the old page into the new one. Measured in
   * absolute pixels, because that is the space in which "not distorted"
   * means anything.
   */
  const k = Math.min(size.width / page.width, size.height / page.height);
  const blockW = page.width * k;
  const blockH = page.height * k;
  const offsetX = (size.width - blockW) / 2;
  const offsetY = (size.height - blockH) / 2;

  return {
    ...page,
    ...size,
    objects: page.objects.map((o) => ({
      ...o,
      x: (o.x * page.width * k + offsetX) / size.width,
      y: (o.y * page.height * k + offsetY) / size.height,
      w: (o.w * page.width * k) / size.width,
      h: (o.h * page.height * k) / size.height,
    })),
  };
}

/**
 * Whether the shape is changing enough for the choice to matter.
 *
 * Nudging a page by a few percent does not need a dialogue about distortion;
 * going from a square to a story does.
 */
export function shapeChangesMuch(page: DesignPage, width: number, height: number, tolerance = 0.08): boolean {
  if (page.width <= 0 || page.height <= 0 || width <= 0 || height <= 0) return false;
  const before = page.width / page.height;
  const after = width / height;
  return Math.abs(before - after) / before > tolerance;
}

/** A readable size, in the unit it was chosen in. */
export function describeSize(width: number, height: number, unit: Unit = 'px', dpi = PRINT_DPI): string {
  if (unit === 'px') return `${width} × ${height} px`;
  return `${fromPixels(width, unit, dpi)} × ${fromPixels(height, unit, dpi)} ${unit} · ${width} × ${height} px`;
}

/* ── Physical assets ─────────────────────────────────────────────────────── */

/**
 * The printed size of the cards this product makes.
 *
 * ISO/IEC 7810 ID-1 — the size every card printer and wallet expects.
 */
export const CARD_MM = { width: 85.6, height: 54 } as const;

/**
 * The capture ratio that makes a design of `designWidthPx` come out at `dpi`.
 *
 * ── WHY THIS IS NOT JUST "pixelRatio: 2" ─────────────────────────────────
 *
 * A multiplier answers "how many times bigger than the preview", which is a
 * question about the screen. What a printer asks is "how many dots per inch",
 * which is a question about the paper — and the two only agree by accident.
 * The same card was being captured at 2 in one place and 3 in another, so the
 * file you downloaded and the file you printed were different sizes with no
 * stated resolution behind either.
 *
 * Derived from the physical width, the output is 300dpi because it was asked
 * to be, and the UI can say so.
 */
export function ratioForDpi(designWidthPx: number, physicalWidthMm: number, dpi = PRINT_DPI): number {
  if (designWidthPx <= 0 || physicalWidthMm <= 0) return 1;
  return toPixels(physicalWidthMm, 'mm', dpi) / designWidthPx;
}

/** What a capture at this resolution will measure, for showing the user. */
export function printedPixels(physicalMm: { width: number; height: number }, dpi = PRINT_DPI) {
  return {
    width: toPixels(physicalMm.width, 'mm', dpi),
    height: toPixels(physicalMm.height, 'mm', dpi),
  };
}

/** The resolution a given pixel width really achieves at a physical size. */
export function dpiOf(pixels: number, physicalMm: number): number {
  if (physicalMm <= 0) return 0;
  return Math.round(pixels / (physicalMm / 25.4));
}
