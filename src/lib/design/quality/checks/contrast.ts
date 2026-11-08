/**
 * Text contrast as the renderer draws it. Shared by looks.test.ts (the look
 * contrast suite) and the quality scorer (C5, access, editability).
 *
 * What "as drawn" means, mirroring TemplateSurface:
 *  - a role-toned slot (accent / primary / secondary / highlight) is set in
 *    that role's colour; a plain slot in inkOn[slot.on ?? 'ground'];
 *  - a 'muted' slot is the same ink at 0.72 alpha, composited over each colour
 *    beneath it before measuring;
 *  - a stat's value takes the slot's role or primary, at 1.55x the slot size
 *    (a muted stat's value is the muted ink); its label is the ink at 0.7
 *    alpha. A price's value is the role or primary;
 *  - beneath the words is the ground (every gradient stop, since there is no
 *    knowing which stop a word lands on), and over it every shape that paints
 *    there, in order. A translucent shape is composited. Rings are skipped.
 *
 * Words are measured as ONE line, sampled at nine points so a shape clipping a
 * corner counts.
 *
 * A template WITHOUT a look takes resolveLook's fallback path: the ground is
 * the `base` the caller passes (what styleColours gives the gallery) and
 * shapes take the caller's `accent`. The fallback's surface gradient is not
 * modelled, only its base colour, so for those templates this is an
 * approximation; for looked templates it is exact.
 */
import {
  frontShapes, isListRole, photoBoxPx, shapeColor, shapeGeometry,
  type DesignTemplate, type FallbackTone, type ShapeSpec, type SlotSpec,
} from '../../../designTemplates';
import { resolveLook, type Look, type ResolvedLook } from '../../look';
import type { Palette, PaletteRole } from '../../palettes';
import { sampleBox, textSlotBox, type TextSlotBox } from '../../remix';
import { contrastRatio } from '../../styles';

/** The alphas TemplateSurface, drawTemplate and the editor draw with. */
export const MUTED_ALPHA = 0.72;
export const STAT_LABEL_ALPHA = 0.7;

const DEFAULT_ACCENT = '#2563eb';

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHexString = ([r, g, b]: [number, number, number]): string =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** `top` painted at `alpha` over `under`. */
export const composite = (top: string, under: string, alpha: number): string => {
  const [a, b] = [rgb(top), rgb(under)];
  return toHexString([0, 1, 2].map((i) => a[i] * alpha + b[i] * (1 - alpha)) as [number, number, number]);
};

/** The colours a shape paints: one per gradient stop, or its single tone. */
function shapeColours(shape: ShapeSpec, r: ResolvedLook, accent: string): string[] {
  const fill = (shape.kind === 'rect' || shape.kind === 'circle') ? shape.fill : undefined;
  if (fill) return fill.stops.map((role) => r.roles[role]);
  return [shapeColor(shape.tone, accent, r.roles.ink, r.roles.ground, r.roles)];
}

function covers(shape: ShapeSpec, x: number, y: number, w: number, h: number): boolean {
  if (shape.kind === 'ring') return false;
  const g = shapeGeometry(shape, w, h);
  if (g.kind === 'circle') return (x - g.cx) ** 2 + (y - g.cy) ** 2 <= g.r ** 2;
  if (g.kind === 'rect') return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h;
  if (g.kind === 'polygon') {
    let inside = false;
    for (let i = 0, j = g.points.length - 1; i < g.points.length; j = i, i += 1) {
      const [xi, yi] = g.points[i];
      const [xj, yj] = g.points[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  return false;
}

/** The roles the ground is painted from: the gradient's stops, else the ground. */
const groundRoles = (look: Look | undefined): PaletteRole[] =>
  look?.gradient ? [...new Set<PaletteRole>(look.gradient.stops)] : ['ground'];

/** Every colour that can sit beneath a point: each ground stop, shapes composited over it. */
function coloursAt(
  tpl: DesignTemplate, look: Look | undefined, r: ResolvedLook, accent: string,
  x: number, y: number, w: number, h: number,
): string[] {
  let stack: string[] = groundRoles(look).map((role) => r.roles[role]);
  /*
   * Inside the photo box of a design with a no-photo state (S1), the words may
   * sit on that state, so it is measured as drawn: each fill layer over the
   * ground (every stop of a gradient), then its geometry. With a photograph
   * the scrim governs, as before; this is the case nothing used to measure.
   */
  const fb = tpl.photoLed ? tpl.photo?.fallback : undefined;
  if (fb) {
    const b = photoBoxPx(tpl, w, h);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      const over = (t: FallbackTone) => (under: string) => composite(r.roles[t.role], under, t.alpha ?? 1);
      stack = [];
      for (const l of fb.layers) {
        // Outside a radial glow only its last stop paints; inside it, any stop may.
        const beyond = l.kind === 'radial'
          && Math.hypot(x - (b.x + l.cx * b.w), y - (b.y + l.cy * b.h)) >= l.r * Math.max(b.w, b.h);
        const tones = l.kind === 'flat' ? [l.tone] : beyond ? [l.stops[l.stops.length - 1]] : l.stops;
        stack = stack.length === 0
          ? tones.map((t) => over(t)(r.roles.ground))
          : stack.flatMap((under) => tones.map((t) => over(t)(under)));
      }
      if (stack.length === 0) stack = [r.roles.ground];
      for (const shape of fb.shapes ?? []) {
        if (!covers(shape, x, y, w, h)) continue;
        const alpha = shape.alpha ?? 1;
        stack = stack.flatMap((under) => shapeColours(shape, r, accent).map((c) => composite(c, under, alpha)));
      }
    }
  }
  for (const shape of frontShapes(tpl)) {
    if (!covers(shape, x, y, w, h)) continue;
    const alpha = shape.alpha ?? 1;
    stack = stack.flatMap((under) => shapeColours(shape, r, accent).map((c) => composite(c, under, alpha)));
  }
  return stack;
}

/** `alpha` below 1 means the renderer draws `fg` translucent; it is composited before measuring. */
interface Run {
  label: string; fg: string; min: number; box: TextSlotBox; alpha?: number;
  /** A ground the run paints for itself (a solid pill): measured on this alone. */
  on?: string;
}

export const toneRole = (tone: SlotSpec['tone']): PaletteRole | null =>
  tone === 'accent' || tone === 'primary' ? 'primary'
    : tone === 'secondary' || tone === 'highlight' ? tone : null;

/** The coloured runs of text a template draws, as the renderer will colour them. */
function runsOf(tpl: DesignTemplate, r: ResolvedLook, w: number, h: number): Run[] {
  const out: Run[] = [];
  for (const slot of tpl.slots) {
    if (slot.role === 'qr') continue;
    const box = textSlotBox(slot, w, h);
    const ink = r.inkOn[slot.on ?? 'ground'];
    const toned = toneRole(slot.tone);
    const size = slot.size ?? 0.05;
    const body = size >= 0.06 ? 3 : 4.5;
    const tag = (what: string) => `${tpl.key}/${slot.role}${what}`;
    const muted = !toned && slot.tone === 'muted' ? MUTED_ALPHA : undefined;
    const plain = { fg: toned ? r.roles[toned] : ink, alpha: muted };
    if (isListRole(slot.role)) {
      if (slot.role === 'stats') {
        // TemplateSurface: a muted stat's value is the muted tone, otherwise the slot's role or primary.
        const value = muted ? { fg: ink, alpha: muted } : { fg: r.roles[toned ?? 'primary'] };
        out.push({ label: tag(' value'), ...value, min: size * 1.55 >= 0.06 ? 3 : 4.5, box });
        out.push({ label: tag(' label'), fg: ink, alpha: STAT_LABEL_ALPHA, min: 4.5, box });
      } else {
        out.push({ label: tag(''), ...plain, min: body, box });
        // A price is always set in the slot's role, or primary; never muted.
        if (slot.role === 'price') out.push({ label: tag(' value'), fg: r.roles[toned ?? 'primary'], min: body, box });
      }
    } else if (slot.treatment === 'disc' && toned) {
      out.push({ label: tag(' on disc'), fg: r.inkOn[toned], min: body, box });
    } else if (slot.treatment === 'pill' && slot.pillStyle === 'solid') {
      // A solid pill (S7) paints its own ground: the words are measured on the pill.
      // Untoned, the pill is the slot's ink and the words are the ground colour.
      if (toned) out.push({ label: tag(' on pill'), fg: r.inkOn[toned], min: body, box, on: r.roles[toned] });
      else out.push({ label: tag(' on pill'), fg: r.roles.ground, min: body, box, on: ink });
    } else {
      out.push({ label: tag(''), ...plain, min: body, box });
    }
  }
  return out;
}

export interface ContrastOptions {
  /** [name, width, height] canvases to measure at. */
  formats: [string, number, number][];
  /** A brand palette, which wins over the look's own. */
  brand?: Palette;
  /** The accent the fallback path and accent-toned shapes use. */
  accent?: string;
  /** The fallback path's ground (styleColours().base). */
  base?: string;
  /** The style a fallback template is dressed in, for its pairing. */
  styleKey?: string;
  /** Throw if the template does not resolve through its look (the look suite's guard). */
  requireLook?: boolean;
}

export interface ContrastResult {
  failures: string[];
  /** The lowest measured ratio over the ratio it needed. 1 is exactly at the minimum. */
  worstMargin: number;
}

/** Every contrast failure of a template, and its worst margin, across the given canvases. */
export function measureContrast(tpl: DesignTemplate, look: Look | undefined, opts: ContrastOptions): ContrastResult {
  const failures: string[] = [];
  let worstMargin = Infinity;
  const accent = opts.accent ?? DEFAULT_ACCENT;
  for (const [name, w, h] of opts.formats) {
    const r = resolveLook(tpl, {
      override: look, brandPalette: opts.brand, accent, base: opts.base, styleKey: opts.styleKey, width: w, height: h,
    });
    if (opts.requireLook && r.source !== 'look') throw new Error(`${tpl.key} does not resolve through its look`);
    const groundLook = r.source === 'look' ? look ?? tpl.look : undefined;
    for (const run of runsOf(tpl, r, w, h)) {
      const beneath = new Set<string>();
      if (run.on) beneath.add(run.on);
      else {
        for (const [x, y] of sampleBox(run.box)) {
          for (const c of coloursAt(tpl, groundLook, r, accent, x, y, w, h)) beneath.add(c);
        }
      }
      for (const bg of beneath) {
        const fg = run.alpha !== undefined ? composite(run.fg, bg, run.alpha) : run.fg;
        const ratio = contrastRatio(fg, bg);
        worstMargin = Math.min(worstMargin, ratio / run.min);
        if (ratio < run.min) {
          const shown = run.alpha !== undefined ? `${run.fg}@${run.alpha}` : run.fg;
          failures.push(`${run.label} @ ${name}: ${shown} on ${bg} is ${ratio.toFixed(2)}:1, needs ${run.min}`);
        }
      }
    }
  }
  return { failures, worstMargin: Number.isFinite(worstMargin) ? worstMargin : 1 };
}

/** The failures alone. */
export const contrastFailures = (tpl: DesignTemplate, look: Look | undefined, opts: ContrastOptions): string[] =>
  measureContrast(tpl, look, opts).failures;
