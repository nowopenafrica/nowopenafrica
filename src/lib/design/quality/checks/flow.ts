/**
 * Where a template's words actually land, and whether they run into each
 * other (Task 18c, S4b) or are too small and too many for a roadside board
 * (S5). Inputs to C5.
 *
 * ── WHY A SECOND ESTIMATE ───────────────────────────────────────────────
 *
 * The fitter (fitSlotSize) budgets lines by dividing characters evenly, so a
 * headline it thinks takes two lines can set on three: no line can hold a
 * long word next to its neighbour. bb-contemporary's "YOUR CAMPAIGN LINE"
 * did exactly that and ran its third line into the @handle on the foot band.
 * The boxes here wrap word by word (wrapEstimate), the way the DOM and the
 * canvas wrap, so the third line is seen.
 *
 * Pure: no rendering. Widths come from the per-face advance table, so a box
 * is an estimate in the same units both renderers lay out with.
 */
import {
  fitSlotSize, frontShapes, isListRole, lineHeightFor, listRowBoxes, photoMaskShapes, shapeGeometry, slotBox, typePx, unitOf,
  wrapEstimate,
  type DesignTemplate, type ShapeSpec, type SlotRole, type SlotSpec,
} from '../../../designTemplates';
import type { PaletteRole } from '../../palettes';
import { iconIndent, rowGlyph } from '../../icons';
import { sampleRow } from '../../../create/sampleCopy';
import type { TemplateContent } from '../../../../components/studio/TemplateSurface';
import { pagesOf, slotText } from './copy';

export interface TextRect {
  where: string;
  role: SlotRole;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The lines a slot sets: one for the one-line roles, its own limit when it declares one. */
function lineCap(slot: SlotSpec, hasIcon: boolean): number {
  if (slot.role === 'brand' || hasIcon) return 1;
  return slot.maxLines ?? Infinity;
}

/**
 * The box each slot's words occupy on one page, in pixels: x and width from
 * the alignment and the widest estimated line, height from the lines it
 * wraps to. A `fromBottom` slot grows upward from its anchor, as the DOM
 * draws it. A QR code is its square; a list is its rows.
 */
export function pageTextRects(
  tpl: DesignTemplate, pageName: string, slots: SlotSpec[], content: TemplateContent, w: number, h: number,
): TextRect[] {
  const out: TextRect[] = [];
  for (const slot of slots) {
    const where = `${pageName}.${slot.role}`;
    const box = slotBox(slot, w, h);
    if (slot.role === 'qr') {
      if (!content.qrUrl) continue;
      const side = slot.w * w;
      out.push({ where, role: slot.role, x: box.left, y: slot.fromBottom ? box.top - side : box.top, w: side, h: side });
      continue;
    }
    const rows = slotText(slot, content);
    if (!rows.length) continue;

    if (isListRole(slot.role)) {
      // Rows are items: a price row or a stat is several strings but one row.
      const items = slot.role === 'price' ? (content.price?.length ?? 0)
        : slot.role === 'stats' ? (content.stats?.length ?? 0)
          : rows.length;
      const count = slot.max ? Math.min(items, slot.max) : items;
      const cells = listRowBoxes(slot, w, h, count);
      if (!cells.length) continue;
      const size = typePx(slot.size, w, h);
      const rowH = slot.role === 'stats' ? size * 2.4 : size * 1.4;
      // Ink, not leading: a 1.4 row carries 0.2 em of air above and below.
      const air = size * 0.2;
      const top = cells[0].y + air;
      const bottom = cells[cells.length - 1].y + rowH - air;
      out.push({ where, role: slot.role, x: box.left, y: top, w: box.width, h: Math.max(0, bottom - top) });
      continue;
    }

    const text = rows.join(' ');
    const px = fitSlotSize(slot, slots, text, w, h);
    if (slot.treatment === 'disc') {
      out.push({ where, role: slot.role, x: box.left, y: box.top, w: box.width, h: box.width });
      continue;
    }
    const glyph = rowGlyph(slot, 0, text, { sample: sampleRow(tpl, slot.role, 0) });
    const indent = glyph ? iconIndent(px) : 0;
    const lines = wrapEstimate(text, { ...slot, w: Math.max(0, slot.w - indent / w) }, px, w);
    const n = Math.min(lines.length, lineCap(slot, !!glyph));
    const widest = Math.min(box.width, Math.max(...lines.slice(0, n)) + indent);
    const lh = lineHeightFor(slot.size);
    const height = n * px * lh;
    const x = box.textAlign === 'center' ? box.left + (box.width - widest) / 2
      : box.textAlign === 'right' ? box.left + box.width - widest
        : box.left;
    const y = slot.fromBottom ? box.top - height : box.top;
    // Ink, not leading: half the leading above the first line and below the last is air.
    const air = Math.max(0, (px * (lh - 1)) / 2);
    out.push({ where, role: slot.role, x, y: y + air, w: widest, h: Math.max(0, height - air * 2) });
  }
  return out;
}

/** Every page's text boxes. */
export function textRects(tpl: DesignTemplate, content: TemplateContent, w: number, h: number): TextRect[] {
  return pagesOf(tpl).flatMap((p) => pageTextRects(tpl, p.name, p.slots, content, w, h));
}

/**
 * Pairs of text boxes on one page that overlap, by more than a hair in both
 * directions (half a percent of the short edge). Boxes are the ink, with the
 * half-leading above and below taken off, so lines that merely share leading
 * do not count.
 */
export function textOverlaps(tpl: DesignTemplate, content: TemplateContent, w: number, h: number): string[] {
  const tol = unitOf(w, h) * 0.005;
  const out: string[] = [];
  for (const page of pagesOf(tpl)) {
    const rects = pageTextRects(tpl, page.name, page.slots, content, w, h);
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > tol && oy > tol) {
          out.push(`${a.where} runs into ${b.where} (${Math.round(ox)} x ${Math.round(oy)} px)`);
        }
      }
    }
  }
  return out;
}

/* ── S5: the roadside board ──────────────────────────────────────────── */

/** Read at speed from a road: the floors, as fractions of the board's height. */
export const BILLBOARD_MIN_TEXT = 0.07;
export const BILLBOARD_MIN_BRAND = 0.08;
/** Words a driver reads in about three seconds, not counting the name and one line to act on. */
export const BILLBOARD_MAX_WORDS = 7;

/** Is this a roadside board (a 48-sheet, or any billboard subcategory)? */
export const isBillboard = (subcategory: string | undefined): boolean =>
  !!subcategory && subcategory.startsWith('billboard');

const wordCount = (s: string): number => s.split(/\s+/).filter((t) => /[\p{L}\p{N}@]/u.test(t)).length;

/**
 * S5. Every text slot at least 0.07 of the board's height as fitted (the
 * brand 0.08), and at most seven words across all the slots, with the name
 * and one action line (a call to act, or a contact) left out of the count
 * (premium-design-brief §2).
 */
export function billboardProblems(tpl: DesignTemplate, content: TemplateContent, w: number, h: number): string[] {
  const out: string[] = [];
  let words = 0;
  let actionSeen = false;
  for (const page of pagesOf(tpl)) {
    for (const slot of page.slots) {
      if (slot.role === 'qr') continue;
      const rows = slotText(slot, content);
      if (!rows.length) continue;
      const where = `${page.name}.${slot.role}`;
      const floor = slot.role === 'brand' ? BILLBOARD_MIN_BRAND : BILLBOARD_MIN_TEXT;
      const px = isListRole(slot.role) ? typePx(slot.size, w, h) : fitSlotSize(slot, page.slots, rows.join(' '), w, h);
      const rel = px / h;
      if (rel < floor - 1e-9) out.push(`${where} is ${rel.toFixed(3)} of the board's height, below ${floor}`);
      const isAction = (slot.role === 'cta' || slot.role === 'contact') && !actionSeen;
      if (slot.role === 'brand') continue;
      // The action line is ONE line: the first row of a contact list; further rows count.
      const counted = isAction ? rows.slice(1) : rows;
      if (isAction) actionSeen = true;
      words += counted.reduce((n, r) => n + wordCount(r), 0);
    }
  }
  if (words > BILLBOARD_MAX_WORDS) {
    out.push(`${words} words besides the name and one action line, more than ${BILLBOARD_MAX_WORDS}`);
  }
  return out;
}

/* ── S4b, second half: words across a shape's edge ───────────────────── */

const SHAPE_ROLE: Partial<Record<ShapeSpec['tone'], PaletteRole>> = {
  primary: 'primary', accent: 'primary', secondary: 'secondary', highlight: 'highlight', ink: 'ink', base: 'ground',
};

/** Is (x, y) inside the shape as drawn? Rings and translucent shapes are not edges anyone reads across. */
function inside(shape: ShapeSpec, x: number, y: number, w: number, h: number): boolean {
  const g = shapeGeometry(shape, w, h);
  if (g.kind === 'rect') return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h;
  if (g.kind === 'circle') return (x - g.cx) ** 2 + (y - g.cy) ** 2 <= g.r ** 2;
  if (g.kind === 'polygon') {
    let hit = false;
    for (let i = 0, j = g.points.length - 1; i < g.points.length; j = i, i += 1) {
      const [xi, yi] = g.points[i];
      const [xj, yj] = g.points[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  return false;
}

/**
 * Text whose ink runs across the edge of an opaque shape it does not say it
 * sits `on`: half the words on one colour, half on another, or a rule drawn
 * through them. The ground around a photo box counts as a shape (its edge is
 * where the photograph starts). The ink box is sampled on a 9 x 5 grid; some
 * samples inside and some outside is a crossing.
 */
export function shapeEdgeCrossings(tpl: DesignTemplate, content: TemplateContent, w: number, h: number): string[] {
  const out: string[] = [];
  for (const page of pagesOf(tpl)) {
    // The panels round a photo box are one ground: only its outline is an edge.
    const mask = photoMaskShapes(page.template);
    const groups: ShapeSpec[][] = [
      ...(mask.length ? [mask] : []),
      ...frontShapes(page.template).filter((s) => s.kind !== 'ring' && (s.alpha ?? 1) >= 0.5).map((s) => [s]),
    ];
    const rects = pageTextRects(tpl, page.name, page.slots, content, w, h);
    for (const r of rects) {
      const slot = page.slots.find((s) => `${page.name}.${s.role}` === r.where);
      if (!slot || r.w <= 0 || r.h <= 0) continue;
      for (const group of groups) {
        const shape = group[0];
        if (SHAPE_ROLE[shape.tone] && SHAPE_ROLE[shape.tone] === (slot.on ?? 'none')) continue;
        let n = 0;
        let k = 0;
        for (let iy = 0; iy < 5; iy += 1) {
          for (let ix = 0; ix < 9; ix += 1) {
            n += 1;
            const px = r.x + (r.w * (ix + 0.5)) / 9;
            const py = r.y + (r.h * (iy + 0.5)) / 5;
            if (group.some((g) => inside(g, px, py, w, h))) k += 1;
          }
        }
        if (k > 0 && k < n) {
          out.push(`${r.where} runs across the edge of a ${shape.tone} ${shape.kind} (${k} of ${n} samples on it)`);
          break;
        }
      }
    }
  }
  return out;
}

/* ── S13: the Instagram crops (Ruling AN) ────────────────────────────── */

/** The profile grid shows the central 3:4 of a 4:5 post: 0.032 off each side. */
export const IG_SIDE = 0.032;
/** The headline and the call to act also clear the old square crop's band. */
export const IG_TOP = 0.1;
export const IG_BOTTOM = 0.9;

/** Words outside the crops a 4:5 post is seen through. */
export function instagramCropProblems(tpl: DesignTemplate, content: TemplateContent, w: number, h: number): string[] {
  const out: string[] = [];
  const tol = 0.5;
  for (const r of textRects(tpl, content, w, h)) {
    if (r.x < IG_SIDE * w - tol || r.x + r.w > (1 - IG_SIDE) * w + tol) {
      out.push(`${r.where} reaches outside the 3:4 profile crop`);
    }
    if ((r.role === 'headline' || r.role === 'cta') && (r.y < IG_TOP * h - tol || r.y + r.h > IG_BOTTOM * h + tol)) {
      out.push(`${r.where} reaches outside the square crop band (y ${IG_TOP} to ${IG_BOTTOM})`);
    }
  }
  return out;
}
