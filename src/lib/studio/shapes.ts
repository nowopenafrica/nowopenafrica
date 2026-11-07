/**
 * The shapes a person can add, and what each one is.
 *
 * ── WHY THIS IS A LIST AND NOT FOUR BUTTONS ──────────────────────────────
 *
 * The editor offered exactly one shape — a rectangle with a 2% corner
 * radius — while the renderer had always drawn ellipses, polygons, strokes
 * and any radius you asked for. The capability was there; the way to reach
 * it was not.
 *
 * Keeping the catalogue here, as data, means the rail and the properties
 * panel read the same list, and adding a shape is one entry rather than a
 * button plus a case plus a label somewhere else.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────
 *
 * Nothing the renderer cannot actually draw. `DesignSurface` turns a shape
 * into a div: `ellipse` becomes a 50% border-radius, `rect` takes its radius
 * as a percentage, `polygon` becomes a clip-path, and a stroke becomes a
 * border. A "star" or a "speech bubble" would need real geometry, so they
 * are absent rather than offered and broken.
 *
 * A LINE is a rectangle a few pixels tall. That is not a shortcut — it is
 * what a line is in a box-model renderer, and it moves, resizes, rotates and
 * exports like everything else because it IS everything else.
 */

import type { DesignPage, ShapeObject } from './designDocument';
import { objectId } from './designDocument';
import { topZ } from './editorGeometry';

export type ShapeKind = 'rect' | 'rounded' | 'circle' | 'line';

export interface ShapeChoice {
  kind: ShapeKind;
  label: string;
  /** What it is for, in the words somebody would use looking for it. */
  hint: string;
}

export const SHAPE_CHOICES: ShapeChoice[] = [
  { kind: 'rect', label: 'Rectangle', hint: 'A block of colour — bands, panels, a solid ground.' },
  { kind: 'rounded', label: 'Rounded rectangle', hint: 'A softer block: cards, buttons, tags.' },
  { kind: 'circle', label: 'Circle', hint: 'A dot, a badge, a photo mask. Drag a corner for an oval.' },
  { kind: 'line', label: 'Line', hint: 'A rule under a heading, or a divider.' },
];

/** Proportions each kind starts at, as a fraction of the page. */
const SIZES: Record<ShapeKind, { w: number; h: number }> = {
  rect: { w: 0.4, h: 0.22 },
  rounded: { w: 0.4, h: 0.22 },
  /*
   * Square, so a "circle" is a circle. The renderer draws a 50% radius on
   * whatever box it is given, so an oblong box would produce an oval — which
   * is a fine thing to want, and a surprising thing to be handed.
   */
  circle: { w: 0.26, h: 0.26 },
  /* Thin enough to read as a rule rather than a very flat box. */
  line: { w: 0.5, h: 0.006 },
};

/**
 * Build a new shape, centred on the page.
 *
 * Centred rather than dropped at a corner: the middle is where the eye
 * already is, and an object that appears under the toolbar reads as nothing
 * having happened.
 */
export function newShape(kind: ShapeKind, page: DesignPage, fill = '#4f46e5'): ShapeObject {
  const size = SIZES[kind];
  const choice = SHAPE_CHOICES.find((c) => c.kind === kind) ?? SHAPE_CHOICES[0];

  return {
    id: objectId('s'),
    type: 'shape',
    name: choice.label,
    shape: kind === 'circle' ? 'ellipse' : 'rect',
    x: (1 - size.w) / 2,
    y: (1 - size.h) / 2,
    w: size.w,
    h: size.h,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    z: topZ(page) + 1,
    fill,
    /*
     * A line gets a full radius so its ends are round, which is what a rule
     * drawn by hand looks like. A plain rectangle gets none: a 2% radius was
     * applied to every shape before, so nobody could draw a sharp corner.
     */
    radius: kind === 'rounded' ? 0.06 : kind === 'line' ? 0.5 : 0,
  };
}

/**
 * The corner radius a kind may have.
 *
 * An ellipse's radius is already 50% by definition, so offering a slider
 * that changes nothing is worse than not offering one.
 */
export const supportsRadius = (shape: ShapeObject): boolean => shape.shape !== 'ellipse';

/** Shape strokes are a fraction of the page width, like everything else. */
export const MAX_STROKE = 0.02;
export const clampStroke = (value: number): number =>
  Math.max(0, Math.min(MAX_STROKE, Number.isFinite(value) ? value : 0));

export const clampRadius = (value: number): number =>
  Math.max(0, Math.min(0.5, Number.isFinite(value) ? value : 0));
