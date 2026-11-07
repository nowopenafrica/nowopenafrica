import { nearestWeight, TYPEFACES, typefaceOf, type FontKey } from '../design/typefaces';

/**
 * Typography and transparency controls.
 *
 * ── WHY THE WEIGHTS COME FROM THE FACE ───────────────────────────────────
 *
 * Offering 100–900 for every typeface is the usual shortcut and it lies:
 * Archivo Black ships one weight, Bebas Neue ships one, and asking a browser
 * for a weight a face does not have gets you a synthesised fake — smeared
 * outlines on screen and, in an export, a headline that does not match the
 * preview. The picker therefore offers each face's OWN weights, and anything
 * arriving from an older document is snapped to the nearest real one.
 *
 * ── WHY EVERY NUMBER IS CLAMPED ──────────────────────────────────────────
 *
 * These values come from sliders and from typed input, and a text object
 * with a size of 0, a negative line height or an opacity of 40 is not an
 * unusual design — it is an object that has silently disappeared, with
 * nothing on screen to say why. The bounds below keep every value inside
 * what can still be seen and grabbed.
 */

/** The faces on offer, with the names a designer would recognise. */
export const FONT_CHOICES: { key: FontKey; label: string; voice: string }[] =
  TYPEFACES.map((face) => ({ key: face.key, label: face.label, voice: face.voice }));

/** The weights a given face actually ships. */
export const weightsFor = (font: FontKey | undefined): number[] => typefaceOf(font).weights;

/** The nearest weight that face really has. */
export const resolveWeight = (font: FontKey | undefined, want: number): number =>
  nearestWeight(font, Number.isFinite(want) ? want : 400);

/* ── Bounds ──────────────────────────────────────────────────────────────── */

/** Text size as a fraction of the page width. 0.008 is small print; 0.4 is a word per line. */
export const MIN_TEXT_SIZE = 0.008;
export const MAX_TEXT_SIZE = 0.4;

const bounded = (n: number, lo: number, hi: number, fallback: number) =>
  (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback);

export const clampTextSize = (n: number): number => bounded(n, MIN_TEXT_SIZE, MAX_TEXT_SIZE, 0.05);

/**
 * Transparency, 0..1.
 *
 * Fully transparent is allowed — it is a legitimate way to hold a layer in
 * reserve — but it is why the layers list shows every object whatever its
 * opacity, so an invisible one can still be reached and brought back.
 */
export const clampOpacity = (n: number): number => bounded(n, 0, 1, 1);

/** Letter spacing in em. Negative tightens; beyond half an em it stops being text. */
export const clampTracking = (n: number): number => bounded(n, -0.1, 0.5, 0);

/** Line height as a multiple. Below 0.7 lines collide; above 3 it is a list. */
export const clampLineHeight = (n: number): number => bounded(n, 0.7, 3, 1.1);

/* ── Display helpers ─────────────────────────────────────────────────────── */

/** A size shown as a percentage of the page, which is what the number means. */
export const sizeToPercent = (size: number): number => Math.round(clampTextSize(size) * 1000) / 10;
export const percentToSize = (percent: number): number => clampTextSize((Number(percent) || 0) / 100);

export const opacityToPercent = (opacity: number): number => Math.round(clampOpacity(opacity) * 100);
export const percentToOpacity = (percent: number): number => clampOpacity((Number(percent) || 0) / 100);

/**
 * A colour the browser will accept, or nothing.
 *
 * `<input type="color">` only ever yields `#rrggbb`, but a document can carry
 * whatever an older build or an import put there. An unparseable colour is
 * returned as undefined so the renderer falls back to its default, rather
 * than writing an invalid value into the style and losing the text.
 */
export function safeColour(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return undefined;
}
