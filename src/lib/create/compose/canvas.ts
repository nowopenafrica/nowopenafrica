// The composition canvas: an aspect-aware surface that archetypes draw on.
//
// An archetype never writes coordinates for one format. It asks the canvas
// for margins, a type scale and a text block that fits, and the canvas answers
// for the format in hand. That is what "recompose, never stretch" means here:
// the same generator run on 4:5 and on 3:1 makes two layouts, not one layout
// pulled out of shape.
//
// Units follow DesignDocument: positions and widths are fractions of the
// page; a text `size` is a fraction of the page WIDTH (DesignSurface draws it
// in cqw). `rise(size)` converts that to a fraction of the page height.

import type { FontKey } from '../../design/typefaces';
import { nearestWeight } from '../../design/typefaces';
import { METRIC_CHARS, METRIC_WIDTHS } from './fontMetrics';
import {
  SCHEMA_VERSION, objectId,
  type DesignDocument, type DesignObject, type ImageObject, type ShapeObject, type TextObject,
} from '../../studio/designDocument';

export type AspectClass = 'tall' | 'portrait' | 'square' | 'landscape' | 'wide';

export function aspectClass(width: number, height: number): AspectClass {
  const ar = width / height;
  if (ar < 0.62) return 'tall';
  if (ar < 0.9) return 'portrait';
  if (ar < 1.2) return 'square';
  if (ar < 1.9) return 'landscape';
  return 'wide';
}

/*
 * Character widths come from the shipped font files (fontMetrics.ts, written
 * by scripts/build-font-metrics.py), so a line is measured, not guessed. The
 * first version used one average per face and kept it generous; the CI-3
 * review found Bodoni Moda estimated a quarter too wide, which broke
 * headlines a line early. Kerning is not counted: it tightens far more often
 * than it loosens, so a measured line is at worst slightly long.
 */
const INDEX = new Map([...METRIC_CHARS].map((ch, k) => [ch, k]));
const AVERAGE = new Map<string, number>();

function advances(font: FontKey, weight: number | undefined): { widths: number[]; average: number } {
  const key = `${font}-${nearestWeight(font, weight ?? 600)}`;
  const widths = METRIC_WIDTHS[key] ?? METRIC_WIDTHS['sans-600'];
  let average = AVERAGE.get(key);
  if (average === undefined) {
    const known = widths.filter((w) => w >= 0);
    /* A character the face lacks is drawn by the fallback face: allow it a wide letter. */
    average = (known.reduce((a, w) => a + w, 0) / known.length) * 1.25;
    AVERAGE.set(key, average);
  }
  return { widths, average };
}

export interface TextStyle {
  font: FontKey;
  size: number;
  weight?: number;
  tracking?: number;
  upper?: boolean;
  lineHeight?: number;
}

/** Width of one line, as a fraction of the page width. */
export function lineWidth(text: string, s: TextStyle): number {
  const { widths, average } = advances(s.font, s.weight);
  let ems = 0;
  let n = 0;
  for (const ch of s.upper ? text.toUpperCase() : text) {
    const k = INDEX.get(ch);
    const w = k === undefined ? -1 : widths[k];
    ems += (w < 0 ? average : w) / 1000;
    n += 1;
  }
  return (ems + n * (s.tracking ?? 0)) * s.size;
}

/** Greedy word wrap into a box of the given width. Explicit line breaks are kept. */
export function wrap(text: string, boxW: number, s: TextStyle): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && lineWidth(next, s) > boxW) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

/**
 * The largest size, from `max` down to `min`, at which the text sets in at
 * most `maxLines` lines with no single word wider than the box.
 */
export function fit(text: string, boxW: number, s: Omit<TextStyle, 'size'>, max: number, min: number, maxLines: number): { size: number; lines: string[] } {
  let size = max;
  for (;;) {
    const style = { ...s, size };
    const lines = wrap(text, boxW, style);
    const widest = Math.max(...lines.map((l) => lineWidth(l, style)));
    if ((lines.length <= maxLines && widest <= boxW) || size <= min) return { size, lines };
    size = Math.max(min, size * 0.96);
  }
}

/**
 * The same number of lines, evened out: the narrowest box that still sets the
 * text in as many lines as `lines`. "Cut slow. Worn / long." becomes
 * "Cut slow. / Worn long." A last line of one short word is the commonest
 * thing a reviewer circles.
 */
export function balance(text: string, lines: string[], boxW: number, s: TextStyle): string[] {
  if (lines.length < 2 || text.includes('\n')) return lines;
  let lo = Math.max(...text.split(/\s+/).map((w) => lineWidth(w, s)));
  let hi = boxW;
  let best = lines;
  for (let k = 0; k < 14 && hi - lo > boxW * 0.004; k += 1) {
    const mid = (lo + hi) / 2;
    const tried = wrap(text, mid, s);
    if (tried.length <= lines.length) { best = tried; hi = mid; } else lo = mid;
  }
  return best;
}

export interface Placed { x: number; y: number; w: number; h: number; size: number; lines: number }

export interface TextOpts extends Omit<TextStyle, 'size'> {
  text: string;
  x: number;
  /** Top edge, or the bottom edge when `anchor` is 'bottom'. */
  y: number;
  w: number;
  size: number;
  /** Shrink no further than this. Defaults to 60% of `size`. */
  min?: number;
  maxLines?: number;
  /** The block may be no taller than this (a page-height fraction): the type shrinks, to `min`, to obey. */
  maxH?: number;
  colour: string;
  align?: 'left' | 'center' | 'right';
  anchor?: 'top' | 'bottom';
  name: string;
  role?: string;
}

export class Canvas {
  readonly cls: AspectClass;
  /** Width over height. */
  readonly ar: number;
  /** Outer margin as a fraction of the width and of the height (equal in pixels). */
  readonly mx: number;
  readonly my: number;
  /** A page pattern, drawn over the background and under every object. */
  pattern?: NonNullable<DesignDocument['pages'][number]['pattern']>;
  private objects: DesignObject[] = [];
  private z = 0;

  constructor(readonly width: number, readonly height: number, marginOfShortEdge = 0.07) {
    this.cls = aspectClass(width, height);
    this.ar = width / height;
    const px = Math.min(width, height) * marginOfShortEdge;
    this.mx = px / width;
    this.my = px / height;
  }

  /** A text size (fraction of width) as a fraction of the page height. */
  rise(size: number): number { return size * this.ar; }

  /** Pick a value for this format's aspect class. */
  by<T>(v: Record<AspectClass, T>): T { return v[this.cls]; }

  /** A length given as a fraction of the SHORT edge, returned as a fraction of the width. */
  short(f: number): number { return (Math.min(this.width, this.height) * f) / this.width; }

  private base(name: string, x: number, y: number, w: number, h: number) {
    this.z += 1;
    return { id: objectId(), name, x, y, w, h, rotation: 0, opacity: 1, visible: true, locked: false, z: this.z };
  }

  rect(name: string, x: number, y: number, w: number, h: number, fill: string, extra: Partial<ShapeObject> = {}): ShapeObject {
    const o: ShapeObject = { ...this.base(name, x, y, w, h), type: 'shape', shape: 'rect', fill, ...extra };
    this.objects.push(o);
    return o;
  }

  /** A square in page pixels: `d` is a fraction of the width. */
  ellipse(name: string, cx: number, cy: number, d: number, fill: string, extra: Partial<ShapeObject> = {}): ShapeObject {
    const h = d * this.ar;
    const o: ShapeObject = { ...this.base(name, cx - d / 2, cy - h / 2, d, h), type: 'shape', shape: 'ellipse', fill, ...extra };
    this.objects.push(o);
    return o;
  }

  polygon(name: string, x: number, y: number, w: number, h: number, points: [number, number][], fill: string): ShapeObject {
    const o: ShapeObject = { ...this.base(name, x, y, w, h), type: 'shape', shape: 'polygon', fill, points };
    this.objects.push(o);
    return o;
  }

  /** A hairline, drawn as a thin rectangle so it exports at any scale. */
  rule(name: string, x: number, y: number, w: number, colour: string, weightOfShortEdge = 0.002): ShapeObject {
    const h = (Math.min(this.width, this.height) * weightOfShortEdge) / this.height;
    return this.rect(name, x, y, w, Math.max(h, 1 / this.height), colour);
  }

  image(name: string, assetId: string, x: number, y: number, w: number, h: number, extra: Partial<ImageObject> = {}): ImageObject {
    const o: ImageObject = { ...this.base(name, x, y, w, h), type: 'image', assetId, fit: 'cover', ...extra };
    this.objects.push(o);
    return o;
  }

  /**
   * A fitted text block. The text is wrapped here and stored with its line
   * breaks, so the browser sets the same lines the layout was planned around.
   */
  /** The space a text block would take, without drawing it. For panels sized to their content. */
  measure(o: Omit<TextOpts, 'colour' | 'name' | 'x' | 'y'>): { h: number; size: number; lines: string[] } {
    const style = { font: o.font, weight: o.weight, tracking: o.tracking, upper: o.upper, lineHeight: o.lineHeight };
    /* 3% slack: kerning and sub-pixel rounding differ a little between browsers. */
    const box = o.w * 0.97;
    const lh = o.lineHeight ?? 1.1;
    const under = Math.max(0.18, 1.34 - lh);
    const floor = o.min ?? o.size * 0.6;
    let fitted = fit(o.text, box, style, o.size, floor, o.maxLines ?? 3);
    /* A height to respect as well as a width: shrink again until the block is short enough. */
    while (o.maxH !== undefined && fitted.size > floor && this.rise(fitted.size) * (lh * Math.min(fitted.lines.length, o.maxLines ?? 3) + under) > o.maxH) {
      fitted = fit(o.text, box, style, Math.max(floor, fitted.size * 0.96), floor, o.maxLines ?? 3);
    }
    const size = fitted.size;
    /*
     * At the floor size the words may still need more lines than the space
     * has. The block is cut at the last line that fits and marked with an
     * ellipsis, so the layout holds. Cut copy is something the customer must
     * be told about, never a silent fix: `cutText` finds these blocks.
     */
    const max = o.maxLines ?? 3;
    const cut = fitted.lines.length > max;
    const kept = cut
      ? [...fitted.lines.slice(0, max - 1), `${fitted.lines[max - 1].replace(/[\s.,;:]+$/, '')}…`]
      : balance(o.text, fitted.lines, box, { ...style, size });
    /*
     * A line box shorter than the face's own height lets descenders hang
     * below it, so tightly leaded type needs more room under its last line.
     */
    return { size, lines: kept, h: this.rise(size) * lh * kept.length + this.rise(size) * under };
  }

  text(o: TextOpts): Placed {
    const { size, lines, h } = this.measure(o);
    const lh = o.lineHeight ?? 1.1;
    const y = o.anchor === 'bottom' ? o.y - h : o.y;
    const t: TextObject = {
      ...this.base(o.name, o.x, y, o.w, h), type: 'text', text: lines.join('\n'), font: o.font, size,
      weight: nearestWeight(o.font, o.weight ?? 600), tracking: o.tracking, lineHeight: lh, align: o.align ?? 'left',
      upper: o.upper, colour: o.colour, ...(o.role && { slotRole: o.role }),
    };
    this.objects.push(t);
    return { x: o.x, y, w: o.w, h, size, lines: lines.length };
  }

  document(title: string, background: string): DesignDocument {
    return {
      schemaVersion: SCHEMA_VERSION, title,
      pages: [{ id: objectId('p'), name: 'Page 1', width: this.width, height: this.height, background, objects: this.objects, ...(this.pattern && { pattern: this.pattern }) }],
    };
  }
}
