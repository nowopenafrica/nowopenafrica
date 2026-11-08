// Composition descriptor: a 7-feature summary of a template's LAYOUT, a
// distance between two summaries, and the distinctness rule built on it.
//
// WHY: variety in the catalogue was mostly palette swaps. Colour is not
// measured here at all. Within one product (subcategory), any two directed
// templates must differ in at least MIN_DISTANCE of the 7 features, and no one
// direction may appear more than MAX_PER_DIRECTION times.
//
// Pure functions. Only templates with a `direction` are compared, so today's
// library (which has none yet) produces no issues.

import {
  DESIGN_TEMPLATES,
  type DesignTemplate, type ShapeSpec, type SlotSpec,
} from '../designTemplates';
import { subcategoryFor } from '../create/catalogueTaxonomy';
import type { DirectionKey } from './directions';

export interface Descriptor {
  anchor: string;
  headlineStep: number;
  imageShare: 0 | 1 | 2 | 3;
  textBlocks: number;
  align: 'left' | 'center' | 'right' | 'mixed';
  pattern: 'none' | 'accent' | 'field';
  container: boolean;
}

export const MIN_DISTANCE = 3;
export const MAX_PER_DIRECTION = 2;

/** Headline sizes this many steps apart (or more) count as a different scale. */
const STEP_TOLERANCE = 3;
/** Text-block counts this far apart (or more) count as a different density. */
const BLOCK_TOLERANCE = 2;

/*
 * designTemplates.ts exports no ordered list of type-size steps (HEAD, SUB etc.
 * are private constants and most slots use ad-hoc literals). So the steps are the
 * distinct headline sizes used across DESIGN_TEMPLATES, sorted ascending, and a
 * template's step is the index of the nearest one. Built lazily: this module is
 * imported by code that the template file itself pulls in.
 */
let stepsCache: number[] | null = null;
function headlineSteps(): number[] {
  if (!stepsCache) {
    const sizes = new Set<number>();
    for (const t of DESIGN_TEMPLATES) {
      const s = t.slots.find((x) => x.role === 'headline')?.size;
      if (s !== undefined) sizes.add(s);
    }
    stepsCache = [...sizes].sort((a, b) => a - b);
  }
  return stepsCache;
}

function stepOf(size: number | undefined): number {
  const steps = headlineSteps();
  if (size === undefined || steps.length === 0) return 0;
  let best = 0;
  for (let i = 1; i < steps.length; i += 1) {
    if (Math.abs(steps[i] - size) < Math.abs(steps[best] - size)) best = i;
  }
  return best;
}

const third = (v: number): 0 | 1 | 2 => (v < 1 / 3 ? 0 : v < 2 / 3 ? 1 : 2);

/** Row (t/m/b) then column (l/c/r) of the headline's top-centre on a 3x3 grid. */
function anchorOf(h: SlotSpec | undefined): string {
  if (!h) return 'mc';
  const y = h.fromBottom ? 1 - h.y : h.y;
  return 'tmb'[third(y)] + 'lcr'[third(h.x + h.w / 2)];
}

/** Opaque enough that whatever is under it is not really seen. */
const OPAQUE = 0.9;

/**
 * Share of the canvas showing photograph.
 *
 * The renderer paints media as a full-bleed cover image beneath the surface, so
 * a photoLed template starts at 100%. Opaque filled shapes (rect, wedge,
 * circle) are then laid over it and subtract their area. Overlaps are summed,
 * which can only over-subtract, and skew/rotation are ignored; both are
 * acceptable for a four-bucket measure. Shapes are in canvas fractions, circle
 * radii in short-edge fractions, so a square canvas is assumed. Not photoLed: 0.
 */
function imageShareOf(t: DesignTemplate): Descriptor['imageShare'] {
  if (!t.photoLed) return 0;
  let covered = 0;
  for (const s of t.shapes ?? []) {
    if (s.kind === 'ring' || s.kind === 'stripe' || (s.alpha ?? 1) < OPAQUE) continue;
    if (s.kind === 'rect') covered += s.w * s.h;
    else if (s.kind === 'wedge') covered += (s.w * s.h) / 2;
    else if (s.kind === 'circle') covered += Math.PI * s.r * s.r;
  }
  const share = Math.max(0, 1 - covered);
  return share > 0.6 ? 3 : share >= 0.25 ? 2 : share > 0 ? 1 : 0;
}

function alignOf(slots: SlotSpec[]): Descriptor['align'] {
  if (slots.length === 0) return 'left';
  const n = { left: 0, center: 0, right: 0 };
  for (const s of slots) n[s.align ?? 'left'] += 1;
  for (const k of ['left', 'center', 'right'] as const) if (n[k] * 2 > slots.length) return k;
  return 'mixed';
}

function patternOf(t: DesignTemplate): Descriptor['pattern'] {
  const p = t.look?.pattern;
  if (!p) return 'none';
  return !p.zone || p.zone === 'full' ? 'field' : 'accent';
}

/** Does this shape cover the box (fractions of the canvas)? */
function covers(s: ShapeSpec, box: { x0: number; y0: number; x1: number; y1: number }): boolean {
  if ((s.alpha ?? 1) < 0.5) return false;
  if (s.kind === 'rect') {
    return s.x <= box.x0 && s.y <= box.y0 && s.x + s.w >= box.x1 && s.y + s.h >= box.y1;
  }
  if (s.kind === 'wedge') {
    // Right triangle in a corner: test all four box corners against the diagonal.
    const pts = [[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1]];
    return pts.every(([px, py]) => {
      const dx = s.corner === 'tl' || s.corner === 'bl' ? px : 1 - px;
      const dy = s.corner === 'tl' || s.corner === 'tr' ? py : 1 - py;
      return dx <= s.w && dy <= s.h && dx / s.w + dy / s.h <= 1;
    });
  }
  return false;
}

function containerOf(t: DesignTemplate, h: SlotSpec | undefined): boolean {
  if (!h) return false;
  // Height is content-driven; budget two lines of the headline's own size.
  const height = (h.size ?? 0.05) * 2.2;
  const top = h.fromBottom ? 1 - h.y - height : h.y;
  const box = { x0: h.x, y0: top, x1: h.x + h.w, y1: top + height };
  return (t.shapes ?? []).some((s) => covers(s, box));
}

export function describe(t: DesignTemplate): Descriptor {
  const headline = t.slots.find((s) => s.role === 'headline');
  // Text blocks: every slot except the QR code; a list role is one block.
  const text = t.slots.filter((s) => s.role !== 'qr');
  return {
    anchor: anchorOf(headline),
    headlineStep: stepOf(headline?.size),
    imageShare: imageShareOf(t),
    textBlocks: text.length,
    align: alignOf(text),
    pattern: patternOf(t),
    container: containerOf(t, headline),
  };
}

/** Number of features that differ, 0..7. Step and block counts use a tolerance. */
export function distance(a: Descriptor, b: Descriptor): number {
  let d = 0;
  if (a.anchor !== b.anchor) d += 1;
  if (Math.abs(a.headlineStep - b.headlineStep) >= STEP_TOLERANCE) d += 1;
  if (a.imageShare !== b.imageShare) d += 1;
  if (Math.abs(a.textBlocks - b.textBlocks) >= BLOCK_TOLERANCE) d += 1;
  if (a.align !== b.align) d += 1;
  if (a.pattern !== b.pattern) d += 1;
  if (a.container !== b.container) d += 1;
  return d;
}

/** Directed templates grouped by subcategory key. Undirected or unfiled are skipped. */
function directedBySubcategory(ts: DesignTemplate[]): Map<string, DesignTemplate[]> {
  const out = new Map<string, DesignTemplate[]>();
  for (const t of ts) {
    if (!t.direction) continue;
    const key = subcategoryFor(t)?.key;
    if (!key) continue;
    out.set(key, [...(out.get(key) ?? []), t]);
  }
  return out;
}

export function distinctnessIssues(
  ts: DesignTemplate[],
): { subcategory: string; a: string; b: string; distance: number }[] {
  const issues: { subcategory: string; a: string; b: string; distance: number }[] = [];
  for (const [subcategory, group] of directedBySubcategory(ts)) {
    const ds = group.map(describe);
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const dist = distance(ds[i], ds[j]);
        if (dist < MIN_DISTANCE) issues.push({ subcategory, a: group[i].key, b: group[j].key, distance: dist });
      }
    }
  }
  return issues;
}

export function directionOverflow(
  ts: DesignTemplate[],
): { subcategory: string; direction: DirectionKey; keys: string[] }[] {
  const out: { subcategory: string; direction: DirectionKey; keys: string[] }[] = [];
  for (const [subcategory, group] of directedBySubcategory(ts)) {
    const byDir = new Map<DirectionKey, string[]>();
    for (const t of group) byDir.set(t.direction!, [...(byDir.get(t.direction!) ?? []), t.key]);
    for (const [direction, keys] of byDir) {
      if (keys.length > MAX_PER_DIRECTION) out.push({ subcategory, direction, keys });
    }
  }
  return out;
}
