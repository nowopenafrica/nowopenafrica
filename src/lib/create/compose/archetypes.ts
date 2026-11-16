// Composition generators: one function per archetype, each drawing on a
// Canvas for whatever format it is given.
//
// All sixteen of the library's archetypes are built. Two say plainly what
// they cannot do alone: see the note above the last six.
//
// Every generator obeys the fundamentals: one focal element, a steep scale,
// equal outer margins, edges that align, and a designed answer for each
// aspect class. None reproduces an existing design; the geometry is ours.
//
// Two rules keep a layout whole whatever the customer writes:
//   - things that share a row are given separate halves of it (`footer`);
//   - a block that flows down the page is told where it must stop (`limit`),
//     and takes fewer lines, or is left out, rather than run into what follows.

import type { Format } from '../../design/formats';
import type { PatternKey } from '../../design/look';
import { BILLBOARD_MIN_BRAND, BILLBOARD_MIN_TEXT } from '../../design/quality/checks/flow';
import { minTextPx } from '../../design/quality/checks/geometry';
import { readableInk } from '../../design/palettes';
import { patternSvg } from '../../design/patterns';
import { contrastRatio, relativeLuminance, shade, tint } from '../../design/styles';
import type { FontKey } from '../../design/typefaces';
import type { DesignDocument } from '../../studio/designDocument';
import type { ArchetypeKey } from '../intel';
import { Canvas, lineWidth, type Placed } from './canvas';

export interface ConceptCopy {
  /** The business name, or the label "Your brand" until the customer gives one. */
  brand: string;
  eyebrow?: string;
  headline: string;
  support?: string;
  cta?: string;
  /** Facts the piece must carry: "Label: value" or a plain line. */
  details?: string[];
}

export interface ComposeInput {
  copy: ConceptCopy;
  colours: { ground: string; ink: string; primary: string; secondary: string; highlight: string };
  fonts: { display: FontKey; text: FontKey; accent: FontKey };
  /** Asset id or URL. Required by image-led archetypes. */
  image?: string;
  /** The repeat a pattern-led composition uses. From the pattern library; ignored by the others. */
  pattern?: PatternKey;
  /** Headlines in capitals. A movement's choice, not the archetype's. */
  upperHeadline?: boolean;
}

type Draw = (c: Canvas, i: ComposeInput) => string;
type Align = 'left' | 'center' | 'right';
const NONE: Placed = { x: 0, y: 0, w: 0, h: 0, size: 0, lines: 0 };

/* ── shared scale ─────────────────────────────────────────────────────────── */

/* On a board the headline is most of what a driver gets: a third larger than on a page of the same shape. */
const H = (c: Canvas) => c.by({ tall: 0.15, portrait: 0.125, square: 0.11, landscape: 0.075, wide: 0.058 }) * (c.distance ? 1.35 : 1);
/*
 * Body and label sizes never go under the format's floor, and every gap in
 * a layout is counted in these sizes. So on a business card or a billboard
 * the spacing opens up with the type, instead of large type sitting in
 * gaps measured for small type.
 */
const B = (c: Canvas) => Math.max(c.minSize, c.by({ tall: 0.043, portrait: 0.034, square: 0.031, landscape: 0.0215, wide: 0.0175 }));
const L = (c: Canvas) => Math.max(c.minSize, B(c) * 0.74);
const LINES = (c: Canvas) => c.by({ tall: 5, portrait: 4, square: 4, landscape: 3, wide: 2 });
const stacked = (c: Canvas) => c.cls === 'tall' || c.cls === 'portrait' || c.cls === 'square';
/** One line of body copy, as a fraction of the page height. */
const row = (c: Canvas) => c.rise(B(c));

/**
 * An accent colour that small type can be read in on this ground. The palette's
 * primary is kept when it measures 4.5:1; otherwise it is deepened (or
 * lightened, on a dark ground) only as far as it takes, so the hue survives.
 * The CI-3 review found blush-pink labels on a blush panel at under 2:1.
 */
export function legible(colour: string, ground: string): string {
  const move = relativeLuminance(ground) > 0.4 ? shade : tint;
  for (let k = 0; k <= 10; k += 1) {
    const tried = k ? move(colour, k * 0.1) : colour;
    if (contrastRatio(tried, ground) >= 4.5) return tried;
  }
  return readableInk(ground);
}

/** The face for small tracked capitals. A script is never set that way. */
const labelFont = (i: ComposeInput): FontKey => (i.fonts.accent === 'script' ? i.fonts.text : i.fonts.accent);
const labelStyle = (c: Canvas, i: ComposeInput) => ({ font: labelFont(i), weight: 700, tracking: 0.14, upper: true, size: L(c) });
const brandStyle = (c: Canvas, i: ComposeInput) => ({ font: i.fonts.text, weight: 700, tracking: 0.12, upper: true, size: B(c) * 0.95 });

function label(c: Canvas, i: ComposeInput, text: string, x: number, y: number, w: number, colour: string, opts: { align?: Align; anchor?: 'top' | 'bottom'; name?: string } = {}) {
  return c.text({ text, x, y, w, ...labelStyle(c, i), colour, maxLines: 1, min: L(c) * 0.7, name: opts.name ?? 'Label', ...opts });
}

/**
 * Two things on one row, left and right. Each gets the width it needs when
 * both fit; when they do not, the row is shared in proportion. Equal halves
 * cut "Your conference · Your dates" short beside a ten-letter brand.
 */
function shareRow(total: number, gutter: number, left: number, right: number): [number, number] {
  const room = total - gutter;
  const l = left * 1.06;
  const r = right * 1.06;
  if (l + r <= room) return [room - r, r];
  const lw = Math.max(room * 0.3, Math.min(room * 0.7, (room * l) / (l + r)));
  return [lw, room - lw];
}

function headline(c: Canvas, i: ComposeInput, x: number, y: number, w: number, colour: string, opts: { size?: number; maxLines?: number; align?: Align; anchor?: 'top' | 'bottom'; lineHeight?: number; maxH?: number } = {}) {
  return c.text({
    text: i.copy.headline, x, y, w, size: opts.size ?? H(c), font: i.fonts.display, weight: 700,
    tracking: i.upperHeadline ? 0 : -0.015, upper: i.upperHeadline, lineHeight: opts.lineHeight ?? 1.02,
    colour, maxLines: opts.maxLines ?? LINES(c), min: (opts.size ?? H(c)) * 0.45, align: opts.align, anchor: opts.anchor, maxH: opts.maxH,
    name: 'Headline', role: 'headline',
  });
}

/**
 * Running copy. With `limit` (a page-height fraction it must not pass) it
 * takes only the lines there is room for, and is left out when there is none.
 */
function body(c: Canvas, i: ComposeInput, text: string, x: number, y: number, w: number, colour: string, opts: { align?: Align; anchor?: 'top' | 'bottom'; scale?: number; name?: string; maxLines?: number; limit?: number; weight?: number } = {}): Placed {
  const size = B(c) * (opts.scale ?? 1);
  const lh = 1.38;
  let maxLines = opts.maxLines ?? 4;
  if (opts.limit !== undefined) {
    const room = Math.floor((opts.limit - y - c.rise(size) * 0.18) / (c.rise(size) * lh));
    if (room < 1) return NONE;
    maxLines = Math.min(maxLines, room);
  }
  return c.text({ text, x, y, w, size, font: i.fonts.text, weight: opts.weight ?? 400, lineHeight: lh, colour, maxLines, min: size * 0.8, align: opts.align, anchor: opts.anchor, name: opts.name ?? 'Supporting line', role: opts.name ? undefined : 'subline' });
}

function brand(c: Canvas, i: ComposeInput, x: number, y: number, w: number, colour: string, opts: { align?: Align; anchor?: 'top' | 'bottom' } = {}) {
  return c.text({ text: i.copy.brand, x, y, w, ...brandStyle(c, i), colour, maxLines: 1, min: B(c) * 0.6, name: 'Brand', role: 'brand', ...opts });
}

/** How the closing row will be set in this width: side by side, or the action above the name. */
function footerPlan(c: Canvas, i: ComposeInput, width: number): { bw: number; cw: number; stacked: boolean; extra: number } {
  const bs = brandStyle(c, i);
  const ls = labelStyle(c, i);
  const bw = lineWidth(i.copy.brand, { ...bs, size: Math.max(bs.size, c.minBrand) });
  const cw = i.copy.cta ? lineWidth(i.copy.cta, { ...ls, size: Math.max(ls.size, c.minSize) }) : 0;
  const stacked = !!i.copy.cta && (bw + cw) * 1.08 + c.mx * 0.6 > width;
  /* The height a second row adds, for a panel that has to be sized before its footer is drawn. */
  return { bw, cw, stacked, extra: stacked ? c.rise(Math.max(ls.size, c.minSize)) * 1.75 : 0 };
}

/**
 * The closing row: brand on the left, call to action on the right, with a
 * gutter between so neither can reach the other. Returns the row's top.
 */
function footer(c: Canvas, i: ComposeInput, x0: number, x1: number, bottom: number, brandColour: string, ctaColour: string): number {
  const gutter = c.mx * 0.6;
  if (!i.copy.cta) return brand(c, i, x0, bottom, x1 - x0, brandColour, { anchor: 'bottom' }).y - row(c) * 0.6;
  const ls = labelStyle(c, i);
  const { bw, cw, stacked: twoRows } = footerPlan(c, i, x1 - x0);
  if (twoRows) {
    /* Not room for both on one line at a readable size: the action sits above the name, and neither is cut. */
    const b = brand(c, i, x0, bottom, x1 - x0, brandColour, { anchor: 'bottom' });
    const a = label(c, i, i.copy.cta, x0, b.y - c.rise(Math.max(ls.size, c.minSize)) * 0.35, x1 - x0, ctaColour, { anchor: 'bottom', name: 'Call to action' });
    return a.y - row(c) * 0.6;
  }
  const [lw, rw] = shareRow(x1 - x0, gutter, bw, cw);
  const b = brand(c, i, x0, bottom, lw, brandColour, { anchor: 'bottom' });
  label(c, i, i.copy.cta, x1 - rw, bottom, rw, ctaColour, { align: 'right', anchor: 'bottom', name: 'Call to action' });
  return b.y - row(c) * 0.6;
}

/** Brand and eyebrow sharing a top row. Returns the row's bottom. */
function header(c: Canvas, i: ComposeInput, x0: number, x1: number, top: number, brandColour: string, eyebrowColour: string): number {
  const gutter = c.mx * 0.6;
  if (!i.copy.eyebrow) { const only = brand(c, i, x0, top, x1 - x0, brandColour); return only.y + only.h; }
  const [lw, rw] = shareRow(x1 - x0, gutter, lineWidth(i.copy.brand, brandStyle(c, i)), lineWidth(i.copy.eyebrow, labelStyle(c, i)));
  const b = brand(c, i, x0, top, lw, brandColour);
  label(c, i, i.copy.eyebrow, x1 - rw, top, rw, eyebrowColour, { align: 'right', name: 'Eyebrow' });
  return b.y + b.h;
}

/** One fact: its label, its value and the air before the next. */
const factCell = (c: Canvas, labelled: boolean) => (labelled ? c.rise(L(c)) * 1.9 : 0) + row(c) * 2.15;

/** The height `facts` will take for these details, its top rule included. 0 when there are none. */
function factsHeight(c: Canvas, details: string[], cols: number): number {
  if (!details.length) return 0;
  const labelled = details.some((d) => d.indexOf(':') > 0);
  return Math.ceil(details.length / cols) * factCell(c, labelled) + row(c) * 0.9;
}

/**
 * The facts a piece must carry, set as a grid that stands on `bottom`:
 * "Label: value" becomes a small label over its value, a plain line stays a
 * line. Returns the grid's top, or `bottom` when there are no facts. Without
 * this, a conference poster could reach the customer with no date on it.
 */
function facts(c: Canvas, i: ComposeInput, details: string[], x: number, bottom: number, w: number, ink: string, accent: string, cols: number, top = 0): number {
  if (!details.length) return bottom;
  const gutter = c.mx * 0.6;
  const cw = (w - gutter * (cols - 1)) / cols;
  const parts = details.map((d) => { const cut = d.indexOf(':'); return cut > 0 ? [d.slice(0, cut).trim(), d.slice(cut + 1).trim()] : ['', d]; });
  const labelled = parts.some(([name]) => name);
  const cell = factCell(c, labelled);
  const fit = Math.max(0, Math.floor((bottom - top - row(c) * 0.9) / cell));
  const rows = Math.min(Math.ceil(parts.length / cols), fit);
  if (!rows) return bottom;
  const y0 = bottom - rows * cell + row(c) * 0.5;
  c.rule('Facts rule', x, y0 - row(c) * 0.9, w, ink, 0.0014).opacity = 0.35;
  parts.slice(0, rows * cols).forEach(([name, value], k) => {
    const cx = x + (k % cols) * (cw + gutter);
    let cy = y0 + Math.floor(k / cols) * cell;
    const top = cy;
    if (labelled) cy += c.rise(L(c)) * 1.9;
    const placed = body(c, i, value, cx, cy, cw, ink, { name: `Detail ${k + 1}`, maxLines: 1, scale: 0.96, weight: 600 });
    /* A label with nothing under it says nothing: it goes when its value had no room. */
    if (placed.h && labelled && name) label(c, i, name, cx, top, cw, accent, { name: `Detail ${k + 1} label` });
  });
  return y0 - row(c) * 0.9;
}

/* ── type-led ─────────────────────────────────────────────────────────────── */

const typographicPoster: Draw = (c, i) => {
  const { ground, ink, primary } = i.colours;
  const accent = legible(primary, ground);
  const w = c.cls === 'wide' ? 0.6 : c.cls === 'landscape' ? 0.72 : 1 - 2 * c.mx;
  const foot = footer(c, i, c.mx, 1 - c.mx, 1 - c.my, ink, accent);
  let y = c.my;
  if (i.copy.eyebrow) y = label(c, i, i.copy.eyebrow, c.mx, y, w, accent, { name: 'Eyebrow' }).y + c.rise(L(c)) * 2.6;
  const details = (i.copy.details ?? []).slice(0, 4);
  /* The headline leaves room for every fact and two lines of support: it shrinks before a venue is dropped. */
  const factCols = stacked(c) ? 2 : c.cls === 'wide' ? 4 : 3;
  const need = factsHeight(c, details, factCols) + row(c) * (2.4 + (i.copy.support ? 3.4 : 0));
  const hl = headline(c, i, c.mx, y, w, ink, { size: H(c) * 1.18, maxH: Math.max(c.rise(H(c)) * 1.3, foot - y - need) });
  y = hl.y + hl.h + row(c) * 0.7;
  c.rule('Accent rule', c.mx, y, c.short(0.13), primary, 0.007);
  y += row(c) * 1.2;
  /* The facts stand on the footer; the supporting line takes what is left between. */
  const limit = facts(c, i, details, c.mx, foot - row(c) * 0.5, 1 - 2 * c.mx, ink, accent, factCols, y + (i.copy.support ? row(c) * 3 : 0));
  if (i.copy.support) body(c, i, i.copy.support, c.mx, y, Math.min(w, c.by({ tall: 0.86, portrait: 0.74, square: 0.7, landscape: 0.5, wide: 0.4 })), ink, { scale: 1.12, limit });
  return ground;
};

const monumentalType: Draw = (c, i) => {
  const { ground, ink, primary } = i.colours;
  const onPrimary = readableInk(primary);
  const accent = legible(primary, ground);
  const input = { ...i, upperHeadline: true };
  const details = (i.copy.details ?? []).slice(0, 4);
  if (stacked(c)) {
    /*
     * The band grows to hold what it must say, and the headline stands on it
     * from the bottom of the colour field. The first version hung the
     * headline from the top, which left 40% of the field empty under it.
     */
    const sup = i.copy.support ? c.measure({ text: i.copy.support, w: 0.72, size: B(c), font: i.fonts.text, weight: 400, lineHeight: 1.38, maxLines: 2, min: B(c) * 0.8 }) : null;
    const base = c.by({ tall: 0.2, portrait: 0.22, square: 0.26, landscape: 0, wide: 0 });
    const want = c.my * 1.3 + row(c) * 2.4 + factsHeight(c, details, 2) + (sup ? sup.h + row(c) * 0.9 : 0);
    const band = Math.min(0.46, Math.max(base, want));
    const field = 1 - band;
    let top = c.my * 0.9;
    if (i.copy.eyebrow) top = label(c, i, i.copy.eyebrow, c.mx, top, 1 - 2 * c.mx, onPrimary, { name: 'Eyebrow' }).y + c.rise(L(c)) * 2.8;
    headline(c, input, c.mx * 0.55, field - c.my * 0.35, 1 - c.mx * 1.1, onPrimary, { size: H(c) * 2.05, maxLines: 4, lineHeight: 0.9, anchor: 'bottom', maxH: field - c.my * 0.35 - top });
    c.rect('Band', 0, field, 1, band, ground);
    const foot = footer(c, i, c.mx, 1 - c.mx, 1 - c.my * 0.8, ink, accent);
    const y = field + c.my * 0.5;
    const limit = facts(c, i, details, c.mx, foot - row(c) * 0.3, 1 - 2 * c.mx, ink, accent, 2, y + (sup ? sup.h + row(c) * 0.4 : 0));
    if (i.copy.support) body(c, i, i.copy.support, c.mx, y, 0.72, ink, { maxLines: 2, limit });
  } else {
    const split = 0.67;
    headline(c, input, c.mx * 0.6, c.my * 0.8, split - c.mx, onPrimary, { size: H(c) * 2.1, maxLines: 3, lineHeight: 0.9, maxH: 1 - c.my * 1.6 });
    c.rect('Panel', split, 0, 1 - split, 1, ground);
    const px = split + c.mx * 0.9;
    const pw = 1 - px - c.mx;
    const top = brand(c, i, px, c.my, pw, ink);
    let limit = 1 - c.my;
    if (i.copy.cta) limit = label(c, i, i.copy.cta, px, 1 - c.my, pw, accent, { anchor: 'bottom', name: 'Call to action' }).y - row(c) * 0.6;
    const y = Math.max(0.36, top.y + top.h + row(c));
    limit = facts(c, i, details.slice(0, 2), px, limit - row(c) * 0.3, pw, ink, accent, 1, y + (i.copy.support ? row(c) * 3.4 : 0));
    if (i.copy.support) body(c, i, i.copy.support, px, y, pw, ink, { scale: 1.15, maxLines: 5, limit });
  }
  return primary;
};

const modularGrid: Draw = (c, i) => {
  const { ground, ink, primary } = i.colours;
  const accent = legible(primary, ground);
  const cols = 6;
  const span = (1 - 2 * c.mx) / cols;
  for (let k = 0; k <= cols; k += 1) {
    const line = c.rect(`Grid line ${k + 1}`, c.mx + k * span, 0, 1 / c.width, 1, ink);
    line.opacity = 0.1;
    line.locked = true;
  }
  let y = header(c, i, c.mx, 1 - c.mx, c.my, ink, ink) + row(c) * 0.5;
  c.rule('Header rule', c.mx, y, 1 - 2 * c.mx, ink, 0.003);
  y += c.rise(H(c)) * 0.5;
  let limit = 1 - c.my;
  if (i.copy.cta) limit = button(c, i, i.copy.cta, c.mx, 1 - c.my, primary) - row(c) * 0.7;
  const hw = stacked(c) ? span * 5 : span * 3.8;
  const details = (i.copy.details ?? []).slice(0, 4);
  /* On a stacked page the headline leaves room for every fact: a date is not optional. */
  const need = stacked(c) ? row(c) * (2.4 + (i.copy.support ? 3.6 : 0) + details.length * 1.9) : 0;
  /* On a wide page the headline still has to stop above the button: a two-line headline on a board ran under it. */
  const hl = headline(c, i, c.mx, y, hw, ink, { maxH: Math.max(c.rise(H(c)) * 1.1, limit - y - (stacked(c) ? need : row(c) * 3.2)) });
  y = hl.y + hl.h + row(c) * 0.8;
  c.rect('Signal bar', c.mx, y, span, row(c) * 0.42, primary);
  y += row(c) * 1.6;
  if (stacked(c)) {
    if (i.copy.support) y += body(c, i, i.copy.support, c.mx, y, span * 4.5, ink, { maxLines: 2, limit }).h + row(c) * 0.9;
    details.forEach((d, k) => {
      const placed = body(c, i, d, c.mx + span, y, span * 5, ink, { name: `Detail ${k + 1}`, maxLines: 1, scale: 0.92, limit });
      if (!placed.h) return;
      label(c, i, String(k + 1).padStart(2, '0'), c.mx, y + c.rise(B(c) * 0.92) * 0.2, span * 0.9, accent, { name: `Detail ${k + 1} number` });
      y += placed.h + row(c) * 0.25;
    });
  } else {
    if (i.copy.support) body(c, i, i.copy.support, c.mx, y, span * 3.4, ink, { limit });
    let dy = hl.y;
    const dx = c.mx + span * 4;
    details.forEach((d, k) => {
      const placed = body(c, i, d, dx + span * 0.5, dy, span * 1.5, ink, { name: `Detail ${k + 1}`, maxLines: 2, limit: 1 - c.my });
      if (!placed.h) return;
      label(c, i, String(k + 1).padStart(2, '0'), dx, dy + row(c) * 0.2, span * 0.45, accent, { name: `Detail ${k + 1} number` });
      dy += placed.h + row(c) * 0.5;
    });
  }
  return ground;
};

const centredEmblem: Draw = (c, i) => {
  const { ground, ink, primary } = i.colours;
  const accent = legible(primary, ground);
  const inset = 0.55;
  c.rect('Frame', c.mx * inset, c.my * inset, 1 - 2 * c.mx * inset, 1 - 2 * c.my * inset, 'transparent', { stroke: primary, strokeWidth: 0.0016 });
  const w = c.cls === 'wide' ? 0.5 : c.cls === 'landscape' ? 0.64 : 1 - 2.6 * c.mx;
  const x = (1 - w) / 2;
  /*
   * The brand and the call to action hold the frame's ends, and the message
   * is centred between them. The first version had no call to action at all:
   * a billboard with no way to reply.
   */
  let top = c.my * (stacked(c) ? 2.6 : 1.5);
  let limit: number;
  if (!stacked(c)) {
    limit = footer(c, i, c.mx * 1.5, 1 - c.mx * 1.5, 1 - c.my * 1.35, accent, ink) - row(c) * 0.2;
  } else if (i.copy.cta) {
    const head = brand(c, i, x, c.my * 1.5, w, accent, { align: 'center' });
    top = head.y + head.h + row(c) * 1.2;
    limit = label(c, i, i.copy.cta, x, 1 - c.my * 1.45, w, ink, { align: 'center', anchor: 'bottom', name: 'Call to action' }).y - row(c) * 0.8;
  } else {
    limit = brand(c, i, x, 1 - c.my * 1.35, w, accent, { align: 'center', anchor: 'bottom' }).y - row(c) * 0.8;
  }
  const hSize = H(c) * 0.92;
  const parts = {
    eyebrow: i.copy.eyebrow ? c.rise(L(c)) * 3.2 : 0,
    head: c.measure({ text: i.copy.headline, w, size: hSize, font: i.fonts.display, weight: 700, lineHeight: 1.08, maxLines: LINES(c), min: hSize * 0.45, upper: i.upperHeadline, tracking: i.upperHeadline ? 0 : -0.015 }).h,
    rule: row(c) * 2.4,
    support: i.copy.support ? c.measure({ text: i.copy.support, w: w * 0.86, size: B(c), font: i.fonts.text, weight: 400, lineHeight: 1.38, maxLines: 3, min: B(c) * 0.8 }).h : 0,
  };
  const total = parts.eyebrow + parts.head + parts.rule + parts.support;
  const centre = (top + limit) / 2;
  let y = Math.max(top, Math.min(centre - total / 2, limit - total));
  if (stacked(c) && y - c.rise(c.short(0.05)) - row(c) * 1.4 > top) {
    c.ellipse('Ornament', 0.5, y - c.rise(c.short(0.05)) / 2 - row(c) * 1.2, c.short(0.05), 'transparent', { stroke: primary, strokeWidth: 0.0016 });
  }
  if (i.copy.eyebrow) { label(c, i, i.copy.eyebrow, x, y, w, accent, { align: 'center', name: 'Eyebrow' }); y += parts.eyebrow; }
  const hl = headline(c, i, x, y, w, ink, { size: hSize, align: 'center', lineHeight: 1.08 });
  y = hl.y + hl.h + row(c) * 0.9;
  c.rule('Divider', 0.5 - c.short(0.045), y, c.short(0.09), primary, 0.0022);
  y += row(c) * 1.5;
  if (i.copy.support) body(c, i, i.copy.support, x + w * 0.07, y, w * 0.86, ink, { align: 'center', maxLines: 3, limit });
  return ground;
};

/** A filled button with its label centred inside. Returns the button's top. */
function button(c: Canvas, i: ComposeInput, text: string, x: number, bottom: number, fill: string): number {
  const style = { ...labelStyle(c, i), tracking: 0.12, size: L(c) * 1.1 };
  const padX = c.short(0.04);
  const m = c.measure({ text, w: 0.6, ...style, maxLines: 1, min: style.size * 0.7 });
  /* No room for the words means no button: an empty pill is a defect. */
  if (m.cut) { c.omitted.push('Call to action'); return bottom; }
  const w = Math.min(0.62, lineWidth(text, { ...style, size: m.size }) * 1.05 + padX * 2);
  const h = m.h + c.rise(style.size) * 1.0;
  c.rect('Button', x, bottom - h, w, h, fill, { radius: 0.5 });
  c.text({ text, x: x + padX * 0.5, y: bottom - h + c.rise(style.size) * 0.5, w: w - padX, ...style, colour: readableInk(fill), maxLines: 1, min: style.size * 0.7, align: 'center', name: 'Call to action' });
  return bottom - h;
}

const bandAndField: Draw = (c, i) => {
  const { ground, ink, primary } = i.colours;
  const onPrimary = readableInk(primary);
  const accent = legible(primary, ground);
  const details = (i.copy.details ?? []).slice(0, 3);
  if (stacked(c)) {
    const band = c.by({ tall: 0.15, portrait: 0.16, square: 0.19, landscape: 0, wide: 0 });
    c.rect('Band', 0, 0, 1, band, primary);
    brand(c, i, c.mx, band / 2 - row(c) * 0.6, 1 - 2 * c.mx, onPrimary);
    const limit = (i.copy.cta ? button(c, i, i.copy.cta, c.mx, 1 - c.my, primary) : 1 - c.my) - row(c) * 0.7;
    let y = band + c.my * 1.1;
    if (i.copy.eyebrow) y = label(c, i, i.copy.eyebrow, c.mx, y, 1 - 2 * c.mx, accent, { name: 'Eyebrow' }).y + c.rise(L(c)) * 2.4;
    const hl = headline(c, i, c.mx, y, 1 - 2 * c.mx, ink, { size: H(c) * 0.9, maxLines: 3 });
    y = hl.y + hl.h + row(c) * 0.9;
    if (i.copy.support) y += body(c, i, i.copy.support, c.mx, y, 0.8, ink, { maxLines: 3, limit }).h + row(c) * 1.0;
    details.forEach((d, k) => {
      if (y + row(c) * 2.3 > limit) return;
      c.rule(`Row rule ${k + 1}`, c.mx, y, 1 - 2 * c.mx, ink, 0.0012).opacity = 0.3;
      y += row(c) * 0.55;
      y += body(c, i, d, c.mx, y, 1 - 2 * c.mx, ink, { name: `Detail ${k + 1}`, maxLines: 1, scale: 0.94, limit }).h + row(c) * 0.3;
    });
  } else {
    const band = 0.3;
    const bw = band - 1.6 * c.mx;
    c.rect('Band', 0, 0, band, 1, primary);
    const top = brand(c, i, c.mx, c.my, bw, onPrimary);
    let by = 1 - c.my;
    details.slice(0, 2).forEach((d, k) => {
      if (by - row(c) * 1.8 < top.y + top.h + row(c)) return;
      by = body(c, i, d, c.mx, by, bw, onPrimary, { anchor: 'bottom', name: `Detail ${k + 1}`, maxLines: 1, scale: 0.9 }).y - row(c) * 0.15;
    });
    const x = band + c.mx * 1.1;
    const w = 1 - x - c.mx;
    const limit = (i.copy.cta ? button(c, i, i.copy.cta, x, 1 - c.my, primary) : 1 - c.my) - row(c) * 0.7;
    let y = c.my;
    if (i.copy.eyebrow) y = label(c, i, i.copy.eyebrow, x, y, w, accent, { name: 'Eyebrow' }).y + c.rise(L(c)) * 2.6;
    const hl = headline(c, i, x, y, w, ink, { size: H(c) * 1.05, maxH: limit - y - row(c) * 2.6 });
    if (i.copy.support) body(c, i, i.copy.support, x, hl.y + hl.h + row(c) * 0.8, w * 0.8, ink, { maxLines: 3, limit });
  }
  return ground;
};

const informationLedger: Draw = (c, i) => {
  const { ground, ink, primary } = i.colours;
  const accent = legible(primary, ground);
  const rows = (i.copy.details ?? []).slice(0, 5);
  const wideish = !stacked(c);
  const lw = wideish ? 0.4 : 1 - 2 * c.mx;
  const limit = footer(c, i, c.mx, 1 - c.mx, 1 - c.my, ink, accent);
  let y = c.my;
  if (i.copy.eyebrow) y = label(c, i, i.copy.eyebrow, c.mx, y, lw, accent, { name: 'Eyebrow' }).y + c.rise(L(c)) * 2.4;
  const hl = headline(c, i, c.mx, y, lw, ink, { size: H(c) * 0.78, maxLines: 3 });
  let ry = hl.y + hl.h + row(c) * 1.1;
  let rx = c.mx;
  let rw = 1 - 2 * c.mx;
  if (wideish) {
    if (i.copy.support) body(c, i, i.copy.support, c.mx, ry, lw * 0.9, ink, { maxLines: 3, limit });
    rx = 0.5; rw = 0.5 - c.mx; ry = c.my;
  } else if (i.copy.support) {
    ry += body(c, i, i.copy.support, c.mx, ry, 0.8, ink, { maxLines: 2, limit }).h + row(c) * 1.1;
  }
  if (rows.length && ry + row(c) * 3 < limit) {
    c.rule('Table top', rx, ry, rw, ink, 0.0045);
    ry += row(c) * 0.7;
  }
  /* The table is opened out to reach the footer: three rows are not left huddled under the headline. */
  const pitch = row(c) * 2.5;
  const shown = Math.min(rows.length, Math.max(0, Math.floor((limit - ry) / pitch)));
  const air = shown ? Math.min(row(c) * 2.4, Math.max(0, (limit - row(c) * 0.6 - ry - shown * pitch) / shown)) : 0;
  rows.slice(0, shown).forEach((r, k) => {
    const cut = r.indexOf(':');
    const [name, value] = cut > 0 ? [r.slice(0, cut).trim(), r.slice(cut + 1).trim()] : [r, ''];
    const gutter = rw * 0.04;
    ry += air / 2;
    const valueStyle = { text: value, w: rw * 0.6, size: B(c), font: labelFont(i), weight: 700, lineHeight: 1.38, maxLines: 1, min: B(c) * 0.62 };
    /*
     * A row is whole or it is not there. When the value will not fit beside
     * its name (a card at six points), the row is set as one plain line; a
     * name with an empty space where its value should be reads as a mistake.
     */
    const beside = !value || !c.measure(valueStyle).cut;
    const left = beside
      ? body(c, i, name, rx, ry, value ? rw * 0.4 - gutter : rw, ink, { name: `Row ${k + 1}`, maxLines: 1, weight: 600, scale: 1 + Math.min(0.25, air / (row(c) * 6)) })
      : body(c, i, `${name}: ${value}`, rx, ry, rw, ink, { name: `Row ${k + 1}`, maxLines: 1, weight: 600 });
    if (!left.h) { ry -= air / 2; return; }
    if (value && beside) c.text({ ...valueStyle, x: rx + rw * 0.4, y: ry, colour: accent, align: 'right', name: `Row ${k + 1} value` });
    ry += left.h + row(c) * 0.35 + air / 2;
    c.rule(`Row rule ${k + 1}`, rx, ry, rw, ink, 0.0012).opacity = 0.28;
    ry += row(c) * 0.6;
  });
  return ground;
};

const diagonalEnergy: Draw = (c, i) => {
  const { ground, ink, primary, highlight } = i.colours;
  const onPrimary = readableInk(primary);
  const accent = legible(primary, ground);
  if (stacked(c)) {
    const details = (i.copy.details ?? []).slice(0, 4);
    /* With more than two facts to carry, the diagonal is cut higher so the colour field can hold them all. */
    const lift = details.length > 2 ? 0.12 : 0;
    c.polygon('Diagonal field', 0, 0, 1, 1, [[0, 0.66 - lift], [1, 0.46 - lift], [1, 1], [0, 1]], primary);
    const disc = c.short(0.14);
    c.ellipse('Accent disc', 1 - c.mx - disc / 2, c.my + c.rise(disc) / 2, disc, highlight);
    const foot = footer(c, i, c.mx, 1 - c.mx, 1 - c.my, onPrimary, onPrimary);
    const sy = 0.74 - lift * 1.5;
    /* The facts stand on the footer, on the colour field, below where the diagonal has fully crossed. */
    const limit = facts(c, i, details, c.mx, foot - row(c) * 0.4, 1 - 2 * c.mx, onPrimary, onPrimary, 2, sy + (i.copy.support ? row(c) * 3.1 : 0));
    let y = c.my;
    if (i.copy.eyebrow) y = label(c, i, i.copy.eyebrow, c.mx, y, 1 - 2 * c.mx - disc - c.mx * 0.5, accent, { name: 'Eyebrow' }).y + c.rise(L(c)) * 2.6;
    y = Math.max(y, c.my + c.rise(disc) + row(c) * 0.5);
    /* The headline stays on the ground colour: it must end above the diagonal's high side. */
    headline(c, i, c.mx, y, 1 - 2 * c.mx, ink, { size: H(c) * 1.05, maxLines: 3, maxH: 0.47 - lift - y });
    if (i.copy.support) body(c, i, i.copy.support, c.mx, sy, 0.74, onPrimary, { maxLines: lift ? 2 : 3, limit });
  } else {
    c.polygon('Diagonal field', 0, 0, 1, 1, [[0.62, 0], [1, 0], [1, 1], [0.5, 1]], primary);
    c.ellipse('Accent disc', 0.56, 0.5, c.short(0.16), highlight);
    const foot = brand(c, i, c.mx, 1 - c.my, 0.36, ink, { anchor: 'bottom' });
    let y = c.my;
    if (i.copy.eyebrow) y = label(c, i, i.copy.eyebrow, c.mx, y, 0.42, accent, { name: 'Eyebrow' }).y + c.rise(L(c)) * 2.6;
    headline(c, i, c.mx, y, 0.42, ink, { size: H(c) * 1.15, maxLines: 3, maxH: foot.y - y - row(c) });
    const x = 0.7;
    const w = 1 - x - c.mx;
    let limit = 1 - c.my;
    if (i.copy.cta) limit = label(c, i, i.copy.cta, x, 1 - c.my, w, onPrimary, { anchor: 'bottom', name: 'Call to action' }).y - row(c) * 0.6;
    limit = facts(c, i, (i.copy.details ?? []).slice(0, 2), x, limit - row(c) * 0.3, w, onPrimary, onPrimary, 1, 0.3 + (i.copy.support ? row(c) * 3.4 : 0));
    if (i.copy.support) body(c, i, i.copy.support, x, 0.3, w, onPrimary, { scale: 1.1, maxLines: 4, limit });
  }
  return ground;
};

/* ── image-led ────────────────────────────────────────────────────────────── */

const imageBleed: Draw = (c, i) => {
  const { ground, ink, primary } = i.colours;
  const accent = legible(primary, ground);
  c.image('Photograph', i.image as string, 0, 0, 1, 1);
  const pw = c.by({ tall: 0.8, portrait: 0.76, square: 0.72, landscape: 0.46, wide: 0.36 });
  const pad = c.mx * 0.75;
  const padY = c.my * 0.75;
  const tw = pw - pad * 2;
  const eyebrowH = i.copy.eyebrow ? c.rise(L(c)) * 2.6 : 0;
  const hSize = H(c) * c.by({ tall: 0.72, portrait: 0.72, square: 0.72, landscape: 0.8, wide: 0.86 });
  const hOpts = { text: i.copy.headline, w: tw, size: hSize, font: i.fonts.display, weight: 700, lineHeight: 1.04, maxLines: 3, min: hSize * 0.5, upper: i.upperHeadline, tracking: i.upperHeadline ? 0 : -0.015 };
  const head = c.measure(hOpts);
  const supLines = c.cls === 'wide' ? 2 : 3;
  const sup = i.copy.support ? c.measure({ text: i.copy.support, w: tw, size: B(c), font: i.fonts.text, weight: 400, lineHeight: 1.38, maxLines: supLines, min: B(c) * 0.8 }) : null;
  const footH = row(c) * 2.9 + footerPlan(c, i, tw).extra;
  const ph = Math.min(1 - 2 * c.my, padY * 2 + eyebrowH + head.h + (sup ? sup.h + row(c) * 0.7 : 0) + footH);
  const px = c.mx;
  const py = 1 - c.my - ph;
  c.rect('Panel', px, py, pw, ph, ground);
  const limit = footer(c, i, px + pad, px + pad + tw, py + ph - padY, ink, accent);
  let y = py + padY;
  if (i.copy.eyebrow) { label(c, i, i.copy.eyebrow, px + pad, y, tw, accent, { name: 'Eyebrow' }); y += eyebrowH; }
  const hl = headline(c, i, px + pad, y, tw, ink, { size: hSize, maxLines: 3, lineHeight: 1.04, maxH: limit - y });
  y = hl.y + hl.h + row(c) * 0.7;
  if (i.copy.support) body(c, i, i.copy.support, px + pad, y, tw, ink, { maxLines: supLines, limit });
  return ground;
};

const editorialSplit: Draw = (c, i) => {
  const { ground, ink, primary } = i.colours;
  const accent = legible(primary, ground);
  if (stacked(c)) {
    const cut = c.by({ tall: 0.5, portrait: 0.52, square: 0.46, landscape: 0, wide: 0 });
    c.image('Photograph', i.image as string, 0, 0, 1, cut);
    const limit = footer(c, i, c.mx, 1 - c.mx, 1 - c.my, ink, accent);
    let y = cut + c.my * 0.9;
    if (i.copy.eyebrow) y = label(c, i, i.copy.eyebrow, c.mx, y, 1 - 2 * c.mx, accent, { name: 'Eyebrow' }).y + c.rise(L(c)) * 2.4;
    const hl = headline(c, i, c.mx, y, 1 - 2 * c.mx, ink, { size: H(c) * 0.86, maxLines: c.cls === 'square' ? 2 : 3, lineHeight: 1.04, maxH: limit - y - row(c) * 0.4 });
    if (i.copy.support) body(c, i, i.copy.support, c.mx, hl.y + hl.h + row(c) * 0.7, 0.8, ink, { maxLines: 3, limit });
  } else {
    const cut = c.cls === 'wide' ? 0.5 : 0.52;
    c.image('Photograph', i.image as string, 0, 0, cut, 1);
    const x = cut + c.mx * 1.2;
    const w = 1 - x - c.mx;
    const limit = footer(c, i, x, 1 - c.mx, 1 - c.my, ink, accent);
    let y = c.my;
    if (i.copy.eyebrow) y = label(c, i, i.copy.eyebrow, x, y, w, accent, { name: 'Eyebrow' }).y + c.rise(L(c)) * 2.6;
    const hl = headline(c, i, x, y, w, ink, { size: H(c) * 0.95, lineHeight: 1.04, maxH: limit - y - row(c) * 0.4 });
    if (i.copy.support) body(c, i, i.copy.support, x, hl.y + hl.h + row(c) * 0.8, w * 0.9, ink, { maxLines: 3, limit });
  }
  return ground;
};

const passePartout: Draw = (c, i) => {
  const { ground, ink, primary } = i.colours;
  const accent = legible(primary, ground);
  if (stacked(c)) {
    const iw = c.by({ tall: 0.72, portrait: 0.66, square: 0.52, landscape: 0, wide: 0 });
    const base = c.by({ tall: 0.46, portrait: 0.48, square: 0.44, landscape: 0, wide: 0 });
    const w = 1 - 3 * c.mx;
    const hSize = H(c) * 0.62;
    const foot = brand(c, i, c.mx, 1 - c.my, 1 - 2 * c.mx, accent, { align: 'center', anchor: 'bottom' });
    const limit = foot.y - row(c) * 0.6;
    let iy = c.my * 1.5;
    if (i.copy.eyebrow) iy = label(c, i, i.copy.eyebrow, c.mx, c.my, 1 - 2 * c.mx, accent, { align: 'center', name: 'Eyebrow' }).y + c.rise(L(c)) * 2.6;
    /*
     * The picture takes the height the words leave. With a fixed picture a
     * short headline left a fifth of the page empty above the brand.
     */
    const head = c.measure({ text: i.copy.headline, w, size: hSize, font: i.fonts.display, weight: 700, lineHeight: 1.08, maxLines: 2, min: hSize * 0.45, upper: i.upperHeadline, tracking: i.upperHeadline ? 0 : -0.015 });
    const sup = i.copy.support ? c.measure({ text: i.copy.support, w: w * 0.8, size: B(c) * 0.92, font: i.fonts.text, weight: 400, lineHeight: 1.38, maxLines: 2, min: B(c) * 0.92 * 0.8 }) : null;
    const words = c.my * 0.8 + head.h + row(c) * 1.7 + (sup ? sup.h : 0) + row(c) * 1.3;
    const ih = Math.max(base * 0.8, Math.min(base * 1.3, limit - iy - words));
    c.image('Photograph', i.image as string, (1 - iw) / 2, iy, iw, ih);
    let y = iy + ih + c.my * 0.8;
    const hl = headline(c, i, (1 - w) / 2, y, w, ink, { size: hSize, maxLines: 2, align: 'center', lineHeight: 1.08 });
    y = hl.y + hl.h + row(c) * 0.6;
    c.rule('Divider', 0.5 - c.short(0.04), y, c.short(0.08), primary, 0.0022);
    y += row(c) * 1.1;
    if (i.copy.support) body(c, i, i.copy.support, (1 - w * 0.8) / 2, y, w * 0.8, ink, { align: 'center', maxLines: 2, scale: 0.92, limit });
  } else {
    const iw = 0.34;
    c.image('Photograph', i.image as string, c.mx * 2.2, c.my * 2, iw, 1 - c.my * 4);
    const x = c.mx * 2.2 + iw + c.mx * 2;
    const w = 1 - x - c.mx * 2.2;
    const foot = brand(c, i, x, 1 - c.my * 2, w, accent, { anchor: 'bottom' });
    const limit = foot.y - row(c) * 0.6;
    let y = c.my * 2;
    if (i.copy.eyebrow) y = label(c, i, i.copy.eyebrow, x, y, w, accent, { name: 'Eyebrow' }).y + c.rise(L(c)) * 2.6;
    const hl = headline(c, i, x, y, w, ink, { size: H(c) * 0.95, maxLines: 2, lineHeight: 1.06, maxH: limit - y - row(c) * 1.2 });
    y = hl.y + hl.h + row(c) * 0.7;
    c.rule('Divider', x, y, c.short(0.1), primary, 0.0026);
    if (i.copy.support) body(c, i, i.copy.support, x, y + row(c) * 1.1, w * 0.8, ink, { maxLines: 3, limit });
  }
  return ground;
};

/* ── the last six ─────────────────────────────────────────────────────────── */

/*
 * These six were held back until the document could carry what they need. It
 * can: an object rotates (collage), a picture takes a rounded or round window
 * (portrait, product, stage), and a page carries a pattern from the pattern
 * library (pattern field). Two limits remain and are stated, not hidden:
 * `product-hero` and `render-stage` build the stage, but a cut-out or a
 * rendered object has to be supplied; given an ordinary photograph they
 * present it in a window.
 */

/** Eyebrow, headline and supporting line flowing down from `y`, stopping at `limit`. Returns where they end. */
function words(c: Canvas, i: ComposeInput, x: number, y: number, w: number, limit: number, ink: string, accent: string, o: { align?: Align; size?: number; maxLines?: number; supportLines?: number; supportW?: number } = {}): number {
  let at = y;
  if (i.copy.eyebrow) at = label(c, i, i.copy.eyebrow, x, at, w, accent, { align: o.align, name: 'Eyebrow' }).y + c.rise(L(c)) * 2.5;
  const keep = i.copy.support ? row(c) * 3.2 : row(c) * 0.3;
  const hl = headline(c, i, x, at, w, ink, { size: o.size, maxLines: o.maxLines ?? 3, align: o.align, lineHeight: 1.04, maxH: Math.max(c.rise(H(c)) * 0.6, limit - at - keep) });
  at = hl.y + hl.h;
  if (i.copy.support) {
    const sw = w * (o.supportW ?? (o.align === 'center' ? 0.84 : 0.9));
    const sx = o.align === 'center' ? x + (w - sw) / 2 : x;
    at += row(c) * 0.7;
    at += body(c, i, i.copy.support, sx, at, sw, ink, { align: o.align, maxLines: o.supportLines ?? 3, limit }).h;
  }
  return at;
}

const DARKER = (a: string, b: string) => (relativeLuminance(a) <= relativeLuminance(b) ? a : b);

const patternField: Draw = (c, i) => {
  const { ground, ink, primary, highlight } = i.colours;
  const accent = legible(primary, ground);
  /* The pattern is the surface, in one colour on the primary; the words never sit on it. */
  const colour = contrastRatio(highlight, primary) >= 1.6 ? highlight : readableInk(primary);
  c.pattern = { svg: patternSvg({ key: i.pattern ?? 'diamond-weave', role: 'highlight', opacity: 0.9, scale: c.by({ tall: 0.2, portrait: 0.2, square: 0.2, landscape: 0.16, wide: 0.22 }), zone: 'full' }, c.width, c.height, colour), opacity: 0.9, zone: 'full' };
  const pw = c.by({ tall: 0.78, portrait: 0.76, square: 0.74, landscape: 0.5, wide: 0.42 });
  const pad = c.mx * 0.85;
  const padY = c.my * 0.9;
  const tw = pw - pad * 2;
  const hSize = H(c) * c.by({ tall: 0.74, portrait: 0.74, square: 0.74, landscape: 0.86, wide: 0.9 });
  const head = c.measure({ text: i.copy.headline, w: tw, size: hSize, font: i.fonts.display, weight: 700, lineHeight: 1.04, maxLines: 3, min: hSize * 0.45, upper: i.upperHeadline, tracking: i.upperHeadline ? 0 : -0.015 });
  const sup = i.copy.support ? c.measure({ text: i.copy.support, w: tw * 0.9, size: B(c), font: i.fonts.text, weight: 400, lineHeight: 1.38, maxLines: 3, min: B(c) * 0.8 }) : null;
  const want = padY * 2 + (i.copy.eyebrow ? c.rise(L(c)) * 2.5 : 0) + head.h + (sup ? sup.h + row(c) * 0.7 : 0) + row(c) * 3.4 + footerPlan(c, i, tw).extra;
  const ph = stacked(c) ? Math.min(1 - 2.4 * c.my, want) : 1 - 2 * c.my;
  const px = stacked(c) ? (1 - pw) / 2 : c.mx;
  const py = stacked(c) ? (1 - ph) / 2 : c.my;
  c.rect('Panel', px, py, pw, ph, ground);
  const limit = footer(c, i, px + pad, px + pw - pad, py + ph - padY, ink, accent);
  words(c, i, px + pad, py + padY, tw, limit, ink, accent, { size: hSize });
  return primary;
};

const serialTiles: Draw = (c, i) => {
  const { ground, ink, primary, secondary, highlight } = i.colours;
  const ox = c.short(0.04);
  const oy = c.rise(ox);
  const gx = c.short(0.016);
  const gy = c.rise(gx);
  const pad = c.short(0.04);
  const padY = c.rise(pad);
  type Cell = { kind: 'fact'; top: string; text: string } | { kind: 'close' } | { kind: 'motif' } | { kind: 'name' } | { kind: 'act' };
  /* Three facts outrank the supporting line: a tile each for the date, the city and the venue. */
  const support = (i.copy.details ?? []).length < 3 ? i.copy.support : undefined;
  const facts: Cell[] = (i.copy.details ?? []).slice(0, support ? 2 : 3).map((d, k) => {
    const cut = d.indexOf(':');
    return cut > 0 ? { kind: 'fact', top: d.slice(0, cut).trim(), text: d.slice(cut + 1).trim() } : { kind: 'fact', top: String(k + 1).padStart(2, '0'), text: d };
  });
  const cells: Cell[] = [...(support ? [{ kind: 'fact', top: '', text: support } as Cell] : []), ...facts];
  while (cells.length < 3) cells.push({ kind: 'motif' });
  cells.push({ kind: 'close' });
  /*
   * On a board the type is too large to share a quarter tile, and the
   * action line was being left out. Two full-width tiles instead: the name,
   * and the line to act on.
   */
  const cols = c.distance ? 1 : 2;
  if (c.distance) cells.splice(0, cells.length, { kind: 'name' }, ...(i.copy.cta ? [{ kind: 'act' } as Cell] : [{ kind: 'motif' } as Cell]));
  const fills = [secondary, highlight, ink, primary];

  /* The lead tile, then four that repeat its system: same padding, label on top, words on the floor. */
  const lead = stacked(c)
    ? { x: ox, y: oy, w: 1 - 2 * ox, h: (1 - 2 * oy - 2 * gy) * 0.44 }
    : { x: ox, y: oy, w: (1 - 2 * ox - gx) * 0.5, h: 1 - 2 * oy };
  const area = stacked(c)
    ? { x: ox, y: lead.y + lead.h + gy, w: 1 - 2 * ox, h: 1 - oy - (lead.y + lead.h + gy) }
    : { x: lead.x + lead.w + gx, y: oy, w: 1 - ox - (lead.x + lead.w + gx), h: 1 - 2 * oy };
  const cw = (area.w - gx * (cols - 1)) / cols;
  const ch = (area.h - gy) / 2;

  const onLead = readableInk(primary);
  c.rect('Lead tile', lead.x, lead.y, lead.w, lead.h, primary);
  let top = lead.y + padY;
  if (i.copy.eyebrow) top = label(c, i, i.copy.eyebrow, lead.x + pad, top, lead.w - 2 * pad, onLead, { name: 'Eyebrow' }).y + c.rise(L(c)) * 2.4;
  headline(c, i, lead.x + pad, lead.y + lead.h - padY * 0.8, lead.w - 2 * pad, onLead, { size: H(c) * (stacked(c) ? 0.95 : 1.05), maxLines: stacked(c) ? 3 : 4, anchor: 'bottom', maxH: lead.y + lead.h - padY * 0.8 - top });

  cells.forEach((cell, k) => {
    const x = area.x + (k % cols) * (cw + gx);
    const y = area.y + Math.floor(k / cols) * (ch + gy);
    const fill = fills[c.distance ? k + 2 : k];
    const on = readableInk(fill);
    c.rect(`Tile ${k + 1}`, x, y, cw, ch, fill);
    const tw = cw - 2 * pad;
    const mark = () => c.ellipse(`Tile ${k + 1} mark`, x + cw / 2, y + ch / 2, Math.min(cw, ch / c.ar) * 0.46, ground);
    if (cell.kind === 'motif') {
      mark();
    } else if (cell.kind === 'name') {
      brand(c, i, x + pad, y + ch / 2 - c.rise(Math.max(B(c) * 0.95, c.minBrand)) * 0.7, tw, on);
    } else if (cell.kind === 'act') {
      label(c, i, i.copy.cta as string, x + pad, y + ch / 2 - c.rise(L(c)) * 0.7, tw, on, { name: 'Call to action' });
    } else if (cell.kind === 'close') {
      brand(c, i, x + pad, y + padY, tw, on);
      if (i.copy.cta) label(c, i, i.copy.cta, x + pad, y + ch - padY, tw, on, { anchor: 'bottom', name: 'Call to action' });
    } else {
      const headH = cell.top ? c.rise(L(c)) * 1.3 + row(c) * 0.4 : 0;
      const room = ch - 2 * padY - headH;
      const lines = Math.max(1, Math.min(4, Math.floor((room - row(c) * 0.2) / (row(c) * 1.38))));
      const placed = body(c, i, cell.text, x + pad, y + ch - padY, tw, on, { anchor: 'bottom', name: cell.top ? `Detail ${k + 1}` : undefined, maxLines: lines, weight: cell.top ? 600 : 400 });
      /* The words did not fit this tile: it becomes a plain mark, not a label over nothing. */
      if (!placed.h) mark();
      else if (cell.top) label(c, i, cell.top, x + pad, y + padY, tw, on, { name: `Detail ${k + 1} label` });
    }
  });
  return ground;
};

const framedPortrait: Draw = (c, i) => {
  const { ground, ink, primary, highlight } = i.colours;
  const accent = legible(primary, ground);
  /** A round window: equal in page pixels, so `d` wide and `rise(d)` tall. */
  const portrait = (cx: number, cy: number, d: number) => {
    const off = d * 0.07;
    c.ellipse('Colour disc', cx + off, cy + c.rise(off), d, primary);
    c.image('Photograph', i.image as string, cx - d / 2, cy - c.rise(d) / 2, d, c.rise(d), { radius: 0.5 });
    c.ellipse('Ring', cx, cy, d * 1.09, 'transparent', { stroke: accent, strokeWidth: 0.0018 });
    c.ellipse('Accent dot', cx - d * 0.46, cy + c.rise(d) * 0.34, d * 0.13, highlight);
  };
  if (stacked(c)) {
    const limit = footer(c, i, c.mx, 1 - c.mx, 1 - c.my, ink, accent);
    const hSize = H(c) * 0.7;
    const head = c.measure({ text: i.copy.headline, w: 1 - 2 * c.mx, size: hSize, font: i.fonts.display, weight: 700, lineHeight: 1.04, maxLines: 2, min: hSize * 0.45, upper: i.upperHeadline, tracking: i.upperHeadline ? 0 : -0.015 });
    const below = (i.copy.eyebrow ? c.rise(L(c)) * 2.5 : 0) + head.h + (i.copy.support ? row(c) * 4.4 : 0) + row(c) * 2.4;
    /* The window is as large as the words allow, up to most of the width. */
    const room = limit - c.my * 1.3 - below;
    const d = Math.max(c.short(0.36), Math.min(c.short(0.7), room / c.ar / 1.12));
    const cy = c.my * 1.3 + c.rise(d) * 0.56;
    portrait(0.5, cy, d);
    words(c, i, c.mx, cy + c.rise(d) * 0.56 + row(c) * 1.4, 1 - 2 * c.mx, limit, ink, accent, { align: 'center', size: hSize, maxLines: 2, supportLines: 2 });
  } else {
    const d = Math.min(0.36, (1 - 3 * c.my) / c.ar / 1.1);
    portrait(c.mx * 1.6 + d / 2, 0.5, d);
    const x = c.mx * 1.6 + d * 1.16 + c.mx;
    const limit = footer(c, i, x, 1 - c.mx, 1 - c.my * 1.4, ink, accent);
    words(c, i, x, c.my * 1.6, 1 - x - c.mx, limit, ink, accent, { size: H(c) });
  }
  return ground;
};

const productHero: Draw = (c, i) => {
  const { primary, highlight } = i.colours;
  const on = readableInk(primary);
  const disc = contrastRatio(highlight, primary) >= 1.3 ? highlight : i.colours.ground;
  /** The object's window on its disc. `w` wide; four units wide to five tall in page pixels. */
  const stage = (cx: number, top: number, w: number) => {
    const h = c.rise(w) * 1.25;
    c.ellipse('Stage disc', cx, top + h * 0.52, w * 1.42, disc);
    c.image('Photograph', i.image as string, cx - w / 2, top, w, h, { radius: 0.07 });
    return h;
  };
  if (stacked(c)) {
    const limit = footer(c, i, c.mx, 1 - c.mx, 1 - c.my, on, on);
    /* The words take the top third at most; the object takes what is left. */
    const end = words(c, i, c.mx, c.my, 1 - 2 * c.mx, c.my + (limit - c.my) * 0.4, on, on, { size: H(c) * 0.96, maxLines: 2, supportLines: 2, supportW: 0.72 });
    const top = end + row(c) * 1.4;
    const h = limit - row(c) * 1.2 - top;
    stage(0.5, top, Math.min(0.6, h / 1.25 / c.ar));
  } else {
    const h = 1 - c.my * 2.4;
    const w = h / 1.25 / c.ar;
    const cx = 1 - c.mx * 1.8 - w * 0.71;
    stage(cx, c.my * 1.2, w);
    const tw = cx - w * 0.71 - c.mx * 1.8;
    const limit = footer(c, i, c.mx, c.mx + tw, 1 - c.my, on, on);
    words(c, i, c.mx, c.my, tw, limit, on, on, { size: H(c) * 1.05, maxLines: 3 });
  }
  return primary;
};

const collageLayered: Draw = (c, i) => {
  const { ground, ink, primary, secondary, highlight } = i.colours;
  const accent = legible(primary, ground);
  const onPrimary = readableInk(primary);
  const turn = <T extends { rotation: number }>(o: T, deg: number): T => { o.rotation = deg; return o; };
  /** Paper, picture, tape and a disc, overlapped. The picture is one object; the papers are cut from the palette. */
  const pile = (x: number, y: number, w: number, h: number) => {
    turn(c.rect('Paper sheet', x - w * 0.09, y + h * 0.06, w * 0.86, h * 0.98, secondary), -5);
    c.ellipse('Paper disc', x + w * 0.97, y + h * 0.84, w * 0.34, highlight);
    turn(c.image('Photograph', i.image as string, x, y, w, h), 2.5);
    /* On a corner, where it holds the picture down and covers no face. */
    turn(c.rect('Tape', x + w * 0.8, y - h * 0.01, w * 0.26, h * 0.07, highlight, { opacity: 0.88 }), 38);
  };
  const hSize = H(c) * (stacked(c) ? 0.84 : 0.95);
  const pad = c.mx * 0.6;
  const padY = c.my * 0.5;
  if (stacked(c)) {
    const limit = footer(c, i, c.mx, 1 - c.mx, 1 - c.my, ink, accent);
    const bw = 1 - c.mx * 2.6;
    const head = c.measure({ text: i.copy.headline, w: bw - 2 * pad, size: hSize, font: i.fonts.display, weight: 700, lineHeight: 1.02, maxLines: 3, min: hSize * 0.45, upper: i.upperHeadline, tracking: i.upperHeadline ? 0 : -0.015 });
    const bh = head.h + padY * 2;
    const after = i.copy.support ? row(c) * 4.2 : row(c) * 0.8;
    /* The headline's paper block bites into the foot of the picture: that overlap is the composition. */
    const by = limit - after - bh;
    const top = c.my * (i.copy.eyebrow ? 2.1 : 1.3);
    if (i.copy.eyebrow) label(c, i, i.copy.eyebrow, c.mx, c.my * 0.9, 1 - 2 * c.mx, accent, { name: 'Eyebrow' });
    const ph = Math.max(0.2, by + bh * 0.28 - top);
    pile(c.mx * 1.9, top, 1 - c.mx * 3.6, ph);
    c.rect('Headline paper', c.mx * 0.7, by, bw, bh, primary);
    headline(c, i, c.mx * 0.7 + pad, by + padY, bw - 2 * pad, onPrimary, { size: hSize, maxLines: 3 });
    if (i.copy.support) body(c, i, i.copy.support, c.mx, by + bh + row(c) * 0.8, 0.8, ink, { maxLines: 2, limit });
  } else {
    const ph = 1 - c.my * 3.2;
    const pw = Math.min(0.4, (ph / c.ar) * 1.1);
    pile(c.mx * 1.8, c.my * 1.6, pw, ph);
    const x = c.mx * 1.8 + pw - c.mx * 0.9;
    const bw = 1 - x - c.mx;
    /* The disc reaches 14% past the picture. Words on the ground start beyond it; only the headline's own paper overlaps the pile. */
    const tx = c.mx * 1.8 + pw * 1.15 + c.mx * 0.5;
    const limit = footer(c, i, tx, 1 - c.mx, 1 - c.my, ink, accent);
    let y = c.my * 1.4;
    if (i.copy.eyebrow) y = label(c, i, i.copy.eyebrow, tx, y, 1 - tx - c.mx, accent, { name: 'Eyebrow' }).y + c.rise(L(c)) * 2.6;
    const maxH = limit - y - (i.copy.support ? row(c) * 4.6 : row(c)) - padY * 2;
    const head = c.measure({ text: i.copy.headline, w: bw - 2 * pad, size: hSize, font: i.fonts.display, weight: 700, lineHeight: 1.02, maxLines: 3, min: hSize * 0.45, upper: i.upperHeadline, tracking: i.upperHeadline ? 0 : -0.015, maxH });
    const bh = head.h + padY * 2;
    c.rect('Headline paper', x, y, bw, bh, primary);
    headline(c, i, x + pad, y + padY, bw - 2 * pad, onPrimary, { size: hSize, maxLines: 3, maxH });
    if (i.copy.support) body(c, i, i.copy.support, tx, y + bh + row(c) * 0.9, (1 - tx - c.mx) * 0.95, ink, { maxLines: 3, limit });
  }
  return ground;
};

const renderStage: Draw = (c, i) => {
  const { ground, ink, primary } = i.colours;
  const dark = DARKER(ink, ground);
  const light = dark === ink ? ground : ink;
  const glow = legible(primary, dark);
  /** A pool of light, a floor and the object's window standing on it. */
  const set = (cx: number, top: number, w: number, h: number) => {
    [1.9, 1.5, 1.15].forEach((k, n) => { c.ellipse(`Light ${n + 1}`, cx, top + h * 0.5, w * k, primary).opacity = 0.13 + n * 0.05; });
    const floor = c.rect('Floor', cx - w * 0.78, top + h - c.rise(w) * 0.06, w * 1.56, c.rise(w) * 0.16, light, { radius: 0.5 });
    floor.opacity = 0.16;
    c.image('Photograph', i.image as string, cx - w / 2, top, w, h, { radius: 0.05 });
  };
  if (stacked(c)) {
    const limit = footer(c, i, c.mx, 1 - c.mx, 1 - c.my, light, glow);
    const hSize = H(c) * 0.74;
    const head = c.measure({ text: i.copy.headline, w: 1 - 2 * c.mx, size: hSize, font: i.fonts.display, weight: 700, lineHeight: 1.04, maxLines: 2, min: hSize * 0.45, upper: i.upperHeadline, tracking: i.upperHeadline ? 0 : -0.015 });
    const below = (i.copy.eyebrow ? c.rise(L(c)) * 2.5 : 0) + head.h + (i.copy.support ? row(c) * 4.4 : 0) + row(c) * 1.6;
    const top = c.my * 1.5;
    const h = Math.max(0.2, limit - below - top - row(c) * 1.6);
    const w = Math.min(0.62, (h / c.ar) * 0.86);
    set(0.5, top, w, h);
    words(c, i, c.mx, top + h + row(c) * 1.8, 1 - 2 * c.mx, limit, light, glow, { align: 'center', size: hSize, maxLines: 2, supportLines: 2 });
  } else {
    const h = 1 - c.my * 3;
    const w = Math.min(0.3, (h / c.ar) * 0.9);
    const cx = 1 - c.mx * 2.4 - w * 0.78;
    set(cx, c.my * 1.4, w, h);
    const tw = cx - w * 0.9 - c.mx * 1.6;
    const limit = footer(c, i, c.mx, c.mx + tw, 1 - c.my, light, glow);
    words(c, i, c.mx, c.my, tw, limit, light, glow, { size: H(c) * 1.05 });
  }
  return dark;
};

const GENERATORS: Partial<Record<ArchetypeKey, Draw>> = {
  'typographic-poster': typographicPoster,
  'monumental-type': monumentalType,
  'modular-grid': modularGrid,
  'centred-emblem': centredEmblem,
  'band-and-field': bandAndField,
  'information-ledger': informationLedger,
  'diagonal-energy': diagonalEnergy,
  'image-bleed': imageBleed,
  'editorial-split': editorialSplit,
  'passe-partout': passePartout,
  'pattern-field': patternField,
  'serial-tiles': serialTiles,
  'framed-portrait': framedPortrait,
  'product-hero': productHero,
  'collage-layered': collageLayered,
  'render-stage': renderStage,
};

/** Archetypes a concept may use today. */
export const IMPLEMENTED = Object.keys(GENERATORS) as ArchetypeKey[];

export interface ComposeOptions {
  /** A piece read at speed from a road (a billboard). Few words, all of them large. */
  distance?: boolean;
}

/** The format as `compose` needs it: a size, and the physical facts when it is a real object. */
export type ComposeFormat = { w: number; h: number } & Partial<Pick<Format, 'mm' | 'safeMm' | 'targetDpi' | 'medium' | 'key' | 'label' | 'bleedMm'>>;

/**
 * What this format demands, as fractions the canvas can use. These are the
 * house rules the quality gate checks (conceptChecks.ts); composing to them
 * is how a concept passes the gate by construction instead of by luck.
 */
function rulesFor(format: ComposeFormat, distance: boolean) {
  if (distance) {
    /* S5: every line at least 0.07 of the board's height, the name 0.08. Sizes are fractions of the width. */
    return { distance, minSize: (BILLBOARD_MIN_TEXT * format.h) / format.w, minBrand: (BILLBOARD_MIN_BRAND * format.h) / format.w };
  }
  const physical = format.mm ? (format as Format) : null;
  const minSize = minTextPx(physical) / format.w;
  /* Words stay inside the safe area, with a millimetre to spare. */
  const marginOfShortEdge = physical && physical.safeMm > 0 ? (physical.safeMm + 1) / Math.min(physical.mm!.w, physical.mm!.h) : 0;
  const safe = physical && physical.safeMm > 0 ? { x: (physical.safeMm + 0.3) / physical.mm!.w, y: (physical.safeMm + 0.3) / physical.mm!.h } : undefined;
  return { distance, minSize, marginOfShortEdge, safe };
}

/**
 * A colour small type can be read on. Some palette colours are mid-tones on
 * which neither white nor near-black reaches 4.5:1; they are fine for a
 * headline and wrong for a phone number. A field that carries words is
 * deepened, or lightened, only as far as its own ink needs.
 */
export function carries(fill: string): string {
  const ink = readableInk(fill);
  const move = relativeLuminance(ink) > 0.5 ? shade : tint;
  for (let k = 0; k <= 12; k += 1) {
    const tried = k ? move(fill, k * 0.04) : fill;
    if (contrastRatio(readableInk(tried), tried) >= 4.5) return tried;
  }
  return fill;
}

/** The document, and the names of any lines the format had no room for. */
export function composeWithReport(archetype: ArchetypeKey, input: ComposeInput, format: ComposeFormat, title = 'Concept', opts: ComposeOptions = {}): { doc: DesignDocument; omitted: string[] } {
  const draw = GENERATORS[archetype];
  if (!draw) throw new Error(`Archetype "${archetype}" has no generator yet.`);
  const canvas = new Canvas(format.w, format.h, rulesFor(format, !!opts.distance));
  /*
   * A driver reads about seven words. A board carries the headline, the name
   * and one line to act on, and nothing else: the label, the supporting line
   * and the list of facts belong on something a person can stand in front of.
   */
  const { colours } = input;
  const fields = { ...colours, primary: carries(colours.primary), secondary: carries(colours.secondary), highlight: carries(colours.highlight) };
  const told: ComposeInput = opts.distance
    ? { ...input, colours: fields, copy: { brand: input.copy.brand, headline: input.copy.headline, cta: input.copy.cta } }
    : { ...input, colours: fields };
  const background = draw(canvas, told);
  return { doc: canvas.document(title, background), omitted: [...new Set(canvas.omitted)] };
}

export function compose(archetype: ArchetypeKey, input: ComposeInput, format: ComposeFormat, title = 'Concept', opts: ComposeOptions = {}): DesignDocument {
  return composeWithReport(archetype, input, format, title, opts).doc;
}
