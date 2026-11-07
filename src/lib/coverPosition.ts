/**
 * Where a cover photo or video should sit inside its frame.
 *
 * ── WHY A FOCAL POINT AND NOT A CROP ─────────────────────────────────────
 *
 * The cover frame is `h-36 sm:h-72 md:h-96` at full width, so its aspect
 * ratio changes with the viewport — and the same image is re-cropped again as
 * a directory card. A stored crop would be right at one size and wrong at
 * every other, and re-cropping on upload would destroy the original.
 *
 * A focal point survives all of that: it says which part of the picture must
 * stay visible, and the browser honours it at any frame shape through
 * `object-position`. Nothing is re-encoded, and changing it later costs two
 * integers.
 *
 * ── WHY TWO NUMBERS AND NOT A CSS STRING ─────────────────────────────────
 *
 * This value ends up inside a style attribute. Storing `object-position` as
 * free text would put user-controlled content straight into CSS, so it is
 * stored as two integers with a database CHECK, and the CSS is composed here
 * from numbers that cannot be anything else.
 */

/** Dead centre — what every existing cover already renders as. */
export const DEFAULT_FOCAL = { x: 50, y: 50 } as const;

export interface FocalPoint {
  /** Percent across, 0 = left edge, 100 = right edge. */
  x: number;
  /** Percent down, 0 = top edge, 100 = bottom edge. */
  y: number;
}

/**
 * Force any input into a usable point.
 *
 * Rounded to whole percents: a cover is hundreds of pixels wide, so tenths
 * move nothing a person can see and only make the value harder to read.
 */
export function clampFocal(x: unknown, y: unknown): FocalPoint {
  const one = (v: unknown, fallback: number): number => {
    /*
     * `null` must be treated as ABSENT, not as a number.
     *
     * Number(null) is 0, which is finite — so an unset database column would
     * have clamped to 0 and aligned every un-adjusted cover to the top-left
     * corner instead of the centre. Empty string has the same trap.
     */
    if (v === null || v === undefined || v === '') return fallback;
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(100, Math.max(0, Math.round(n)));
  };
  return { x: one(x, DEFAULT_FOCAL.x), y: one(y, DEFAULT_FOCAL.y) };
}

/**
 * The CSS value.
 *
 * Built from clamped numbers, never from the stored text, so a bad row can
 * only ever produce a harmless percentage pair.
 */
export function focalToCss(x: unknown, y: unknown): string {
  const p = clampFocal(x, y);
  return `${p.x}% ${p.y}%`;
}

/**
 * Is this worth storing?
 *
 * Centre is the default and what every cover already does, so writing it back
 * would mark thousands of untouched rows as deliberately positioned and make
 * "has the owner adjusted this?" unanswerable.
 */
export function isDefaultFocal(x: unknown, y: unknown): boolean {
  const p = clampFocal(x, y);
  return p.x === DEFAULT_FOCAL.x && p.y === DEFAULT_FOCAL.y;
}

/**
 * Turn a pointer position inside the preview into a focal point.
 *
 * Takes the rectangle rather than an event so the arithmetic is testable
 * without a DOM. A zero-sized rect returns centre instead of dividing by zero
 * — that happens when the frame is measured before layout.
 */
export function focalFromPointer(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): FocalPoint {
  if (!(rect.width > 0) || !(rect.height > 0)) return { ...DEFAULT_FOCAL };
  return clampFocal(
    ((clientX - rect.left) / rect.width) * 100,
    ((clientY - rect.top) / rect.height) * 100,
  );
}

/** Nudge, for keyboard users. One percent a press, five with shift. */
export function nudgeFocal(point: FocalPoint, dx: number, dy: number, big = false): FocalPoint {
  const step = big ? 5 : 1;
  return clampFocal(point.x + dx * step, point.y + dy * step);
}
