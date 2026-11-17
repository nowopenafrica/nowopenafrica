/**
 * What a customer actually receives, measured at the printer.
 *
 * ── TWO REGISTRIES, AND ONLY ONE OF THEM KNOWS ABOUT PAPER ───────────────
 *
 * This product has two format systems, and they do not agree:
 *
 *   src/lib/studio/formats.ts   PRESETS, declared in MILLIMETRES at
 *                               PRINT_DPI (300). A4 is 210x297mm, which
 *                               `presetPixels` turns into 2480x3508. Used by
 *                               the Studio editor and the export centre.
 *
 *   src/data/studioPresets.ts   DESIGN_FORMATS, declared in raw PIXELS with
 *                               no physical size at all. A4 is 1240x1754 —
 *                               the same sheet of paper at half the
 *                               resolution. Used by Create Media's template
 *                               customiser.
 *
 * So the Studio has always made a 300dpi A4 and Create Media a 150dpi one,
 * and nothing in either could say so, because `DESIGN_FORMATS` has no notion
 * of a millimetre. This module gives it one.
 *
 * ── THE CANVAS IS NOT THE FILE ───────────────────────────────────────────
 *
 * The first version of this module reported the canvas resolution and called
 * it the answer. It is not. The customiser rasterises through a pixel ratio:
 *
 *     ratio = max(1, min(2, 2400 / longest-edge))
 *
 * — so a small canvas is rendered UP to a 2400px long edge, and a large one
 * is rendered at 1:1 rather than being shrunk. The design is vector-composed
 * DOM, so that is a genuine render at the higher resolution, not an
 * interpolation of a smaller one.
 *
 * MEASURED, 2026-10-20:
 *
 *   key                canvas dpi   downloaded     delivered dpi
 *   a4                     150      1697x2400          205
 *   a3                     121      1697x2400          145   ← below print
 *   letter                 150      1855x2400          218
 *   half-a4                150      2400x1697          290
 *   business-card          300      2022x1276          600
 *   business-card-portr.   300      1276x2022          600
 *   letterhead             300      2480x3508          300
 *   compliment-slip        300      2480x1169          300
 *   postcard               300      2400x1703          412
 *
 * Every figure a customer is shown is therefore the DELIVERED one. Telling
 * somebody their A4 is 150dpi when the file is 205dpi is as much of a lie as
 * the reverse, and it is the one that loses an order.
 *
 * A3 is the single format that is genuinely not printable at its stated
 * size, and it stays that way until its canvas changes.
 */

import { DESIGN_FORMATS, type StudioFormat } from '../../data/studioPresets';
import { PRINT_DPI } from '../studio/formats';
import { FORMATS } from './formats';

const MM_PER_INCH = 25.4;

/**
 * Press minimum, taken from the Studio rather than declared again here.
 *
 * `formats.ts` already calls 300 "the usual commercial minimum" and builds
 * every millimetre preset against it. A second copy of that number is a
 * second thing to keep in step.
 */
export const PRESS_DPI = PRINT_DPI;
/** Below this, even a desk printer shows it. */
export const OFFICE_DPI = 150;

/**
 * The rasteriser's ceiling, and the reason the delivered file is not the
 * canvas.
 *
 * This is the customiser's own cap — a billboard at 4500px and pixelRatio 2
 * is a 9000px canvas that a mid-range Android cannot allocate, and the tab
 * dies with no error anybody can act on. It lives here so the component that
 * enforces it and the module that explains it cannot drift apart.
 */
export const EXPORT_MAX_EDGE = 2400;
/** Never render more than twice the canvas; beyond that it is empty detail. */
export const EXPORT_MAX_RATIO = 2;

/**
 * Trade standards, in millimetres.
 *
 * 3mm bleed and a 5mm safe margin are what a general commercial printer in
 * this market asks for. A specific printer's spec sheet always wins, which
 * is why the note says "typically" rather than stating them as law.
 */
export const BLEED_MM = 3;
export const SAFE_MM = 5;

export interface PhysicalSize {
  widthMm: number;
  heightMm: number;
  /** How it is described to a person, in the units they would use. */
  label: string;
}

/** Physical sizes come from the format registry; only the label lives here. */
const phys = (key: string, label: string): PhysicalSize => {
  const mm = FORMATS[key]?.mm;
  if (!mm) throw new Error(`printSpec: format "${key}" has no mm size in the registry`);
  return { widthMm: mm.w, heightMm: mm.h, label };
};

/**
 * The DESIGN_FORMATS entries that are a real object at a real size.
 *
 * Only these can have a resolution. Everything else either has no physical
 * size at all (a social post is pixels, full stop) or is printed at a scale
 * the supplier chooses (a billboard).
 */
export const PHYSICAL: Record<string, PhysicalSize> = {
  'a4': phys('a4', 'A4 · 210×297mm'),
  'a3': phys('a3', 'A3 · 297×420mm'),
  'letter': phys('letter', 'US Letter · 8.5×11in'),
  /*
   * Half of A4 is A5 — 210x148.5mm — which is exactly what these pixels are
   * at 150dpi. The format's own label reads "Half A4 / DL", and DL is
   * 210x99mm: a different, narrower sheet. `compliment-slip` is the real DL.
   */
  'half-a4': phys('half-a4', 'A5 landscape · 210×148.5mm'),
  'business-card': phys('business-card', 'Business card · 85.6×54mm'),
  'business-card-portrait': phys('business-card-portrait', 'Business card, portrait · 54×85.6mm'),
  'letterhead': phys('letterhead', 'Letterhead, A4 · 210×297mm'),
  'compliment-slip': phys('compliment-slip', 'Compliment slip, DL · 210×99mm'),
  'postcard': phys('postcard', 'Postcard · 148×105mm'),
};

/**
 * Printed, but at a scale the printer sets.
 *
 * A billboard is not 4500px at some resolution — it is a ratio, enlarged to
 * whatever the site is, and judged at thirty metres rather than at arm's
 * length. Quoting a dpi for one of these would be a precise-sounding lie.
 */
export const LARGE_FORMAT = new Set(['billboard', 'board-48-sheet', 'led', 'rollup', 'backdrop', 'street']);

export type Readiness =
  /** 300dpi or better in the delivered file. Safe to send to a press. */
  | 'press'
  /** 150–299dpi. Fine from a desk printer, soft from a press. */
  | 'office'
  /** Under 150dpi. Should not be printed at this size. */
  | 'below-print'
  /** Printed at a scale the supplier sets; resolution is their call. */
  | 'large-format'
  /** Pixels for a screen. No physical size, and none needed. */
  | 'screen';

export interface PrintSpec {
  key: string;
  readiness: Readiness;
  /** The editable document's own resolution. Null without a physical size. */
  canvasDpi: number | null;
  /** The resolution of the file the customer downloads. */
  deliveredDpi: number | null;
  /** The pixel size of that downloaded file. */
  deliveredPx: { w: number; h: number } | null;
  physical: PhysicalSize | null;
  /** Null unless the delivered file is press-ready. */
  bleedPx: number | null;
  safePx: number | null;
}

const formatOf = (key: string): StudioFormat | null =>
  DESIGN_FORMATS.find((f) => f.key === key) ?? null;

/**
 * The customiser's rasterising ratio for a canvas of this size.
 *
 * Mirrors `TemplateCustomiser`'s download path exactly; that component
 * imports these constants so there is one rule, not two.
 */
export function exportPixelRatio(longestEdgePx: number): number {
  if (!Number.isFinite(longestEdgePx) || longestEdgePx <= 0) return 1;
  return Math.max(1, Math.min(EXPORT_MAX_RATIO, EXPORT_MAX_EDGE / longestEdgePx));
}

/**
 * Resolution at the format's stated physical size.
 *
 * The two axes are computed separately and the LOWER is returned: a file is
 * only as printable as its worst axis, and a format whose axes disagree is
 * one whose pixel aspect does not match the paper it claims.
 */
function dpiFrom(w: number, h: number, physical: PhysicalSize): number {
  const across = w / (physical.widthMm / MM_PER_INCH);
  const down = h / (physical.heightMm / MM_PER_INCH);
  return Math.round(Math.min(across, down));
}

/** What the editable document is. */
export function canvasDpiOf(key: string): number | null {
  const format = formatOf(key);
  const physical = PHYSICAL[key];
  if (!format || !physical) return null;
  return dpiFrom(format.w, format.h, physical);
}

/** What the downloaded PNG is — the number that matters to a customer. */
export function deliveredDpiOf(key: string): number | null {
  const format = formatOf(key);
  const physical = PHYSICAL[key];
  if (!format || !physical) return null;
  const ratio = exportPixelRatio(Math.max(format.w, format.h));
  /* Floor, to match the pixels the rasteriser actually produces. */
  return dpiFrom(Math.floor(format.w * ratio), Math.floor(format.h * ratio), physical);
}

export function specFor(key: string): PrintSpec {
  const format = formatOf(key);
  const physical = PHYSICAL[key] ?? null;
  const canvasDpi = canvasDpiOf(key);
  const deliveredDpi = deliveredDpiOf(key);

  /*
   * FLOOR, not round, and it was measured rather than assumed.
   *
   * Three real downloads driven through the UI: A4 came back 1696x2400
   * where rounding predicts 1697, A3 1696x2400 against 1697, and postcard
   * 2400x1702 against 1703. The rasteriser truncates. One sample could not
   * have told the two rules apart, which is why there were three.
   */
  const deliveredPx = format
    ? (() => {
        const ratio = exportPixelRatio(Math.max(format.w, format.h));
        return { w: Math.floor(format.w * ratio), h: Math.floor(format.h * ratio) };
      })()
    : null;

  let readiness: Readiness;
  if (LARGE_FORMAT.has(key)) readiness = 'large-format';
  else if (deliveredDpi === null) readiness = 'screen';
  else if (deliveredDpi >= PRESS_DPI) readiness = 'press';
  else if (deliveredDpi >= OFFICE_DPI) readiness = 'office';
  else readiness = 'below-print';

  /*
   * Bleed and safe area are quoted only where the file is actually going to
   * a press. Printing a 145dpi poster at home needs no bleed, and offering
   * the number anyway invites somebody to believe the rest of the sentence.
   */
  const pressBound = readiness === 'press' && deliveredDpi !== null;
  const pxPerMm = pressBound ? deliveredDpi! / MM_PER_INCH : null;

  return {
    key,
    readiness,
    canvasDpi,
    deliveredDpi,
    deliveredPx: physical ? deliveredPx : null,
    physical,
    bleedPx: pxPerMm ? Math.round(BLEED_MM * pxPerMm) : null,
    safePx: pxPerMm ? Math.round(SAFE_MM * pxPerMm) : null,
  };
}

/**
 * The sentence to show a customer, or null when there is nothing to say.
 *
 * Never contains the words "print-ready" unless the DELIVERED file is. This
 * is the whole point of the module: a poster that arrives at 145dpi gets
 * told the truth about itself before somebody pays a printer to discover it.
 */
export function printNoteFor(key: string): string | null {
  const spec = specFor(key);
  const size = spec.deliveredPx ? `${spec.deliveredPx.w}×${spec.deliveredPx.h}` : '';
  switch (spec.readiness) {
    case 'press':
      return `Print-ready at ${spec.physical?.label}. You download ${size} — ${spec.deliveredDpi}dpi. `
        + `Printers typically want ${BLEED_MM}mm bleed (${spec.bleedPx}px) `
        + `and nothing important within ${SAFE_MM}mm of the trim (${spec.safePx}px).`;
    case 'office':
      return `${spec.physical?.label}. You download ${size} — ${spec.deliveredDpi}dpi, `
        + 'good from a desk printer but under the 300dpi a commercial press wants. '
        + 'Ask us for a press-resolution version before a print run.';
    case 'below-print':
      return `${spec.physical?.label}. You download ${size} — only ${spec.deliveredDpi}dpi. `
        + 'This should not go to a printer at this size; ask us for a press-resolution version.';
    case 'large-format':
      return 'Supplied as artwork at the correct proportions; the printer sets the final scale. '
        + 'Large-format work is judged at viewing distance, so no dpi figure applies.';
    case 'screen':
      return null;
  }
}

/** Every format that claims paper but does not arrive press-ready. */
export function belowPressFormats(): PrintSpec[] {
  return Object.keys(PHYSICAL)
    .map(specFor)
    .filter((s) => s.readiness === 'office' || s.readiness === 'below-print')
    /* Worst first; key breaks a tie, so the order does not depend on the
       order PHYSICAL happens to be written in. */
    .sort((a, b) => (a.deliveredDpi ?? 0) - (b.deliveredDpi ?? 0) || a.key.localeCompare(b.key));
}

/**
 * The canvas this format would need for the DELIVERED file to be press-ready.
 *
 * Nothing calls this to resize anything. It exists so the cost of fixing a
 * format is a number somebody can look at rather than a guess.
 *
 * The delivered resolution is the canvas times the export ratio, and that
 * ratio falls to 1 once the canvas passes 2400px — so the canvas has to
 * carry the full 300dpi itself. For A3 that is 3508x4961, which is 6.2x the
 * pixels it has now AND over the 4096-per-side ceiling the export path
 * enforces for iOS Safari. A3 therefore cannot reach 300dpi through the
 * browser at all; its ceiling is `exportCeilingDpi('a3')`.
 */
export function pressCanvasFor(key: string): { w: number; h: number; growth: number } | null {
  const format = formatOf(key);
  const physical = PHYSICAL[key];
  if (!format || !physical) return null;
  const w = Math.round((physical.widthMm / MM_PER_INCH) * PRESS_DPI);
  const h = Math.round((physical.heightMm / MM_PER_INCH) * PRESS_DPI);
  return { w, h, growth: Number(((w * h) / (format.w * format.h)).toFixed(1)) };
}

/**
 * The best resolution this format can ever reach in a browser.
 *
 * Bounded by the 4096-per-side canvas limit that `exportDesign.ts` enforces,
 * because above it iOS Safari returns a BLANK canvas rather than an error —
 * the customer gets an empty PNG and nobody finds out.
 */
export function exportCeilingDpi(key: string, maxSidePx = 4096): number | null {
  const physical = PHYSICAL[key];
  if (!physical) return null;
  const longestMm = Math.max(physical.widthMm, physical.heightMm);
  return Math.floor(maxSidePx / (longestMm / MM_PER_INCH));
}
