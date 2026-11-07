// Canvas painter for a DesignTemplate.
//
// The DOM renderer (TemplateSurface) covers Creative Studio's editable preview.
// Motion Studio previews on a canvas and renderVideo exports through
// MediaRecorder on a canvas, so motion and export need a painter, not markup.
//
// Both consume the SAME resolvers from designTemplates: slotBox, motionAt,
// typePx, surfaceSpecLayers. Nothing about position, timing or colour is
// recomputed here. That is deliberate — a preview that disagrees with the
// exported file is the most damaging bug a design tool can have, and it is
// exactly what you get from two independent implementations of "where does the
// headline go".
//
// Everything degrades rather than throws. jsdom has no 2D context and older
// browsers lack ctx.filter or ctx.letterSpacing, so each is feature-detected:
// a missing blur loses an effect, it does not lose the frame.

import {
  type DesignTemplate, type SlotSpec, type SurfaceLayer, type ShapeSpec,
  slotBox, fitSlotSize, motionAt, settleTime, surfaceSpecLayers, hexAlpha, unitOf, fontStack,
  cameraAt,
  isListRole, listRowBoxes, shapeColor, shapeGeometry,
  type PriceRow,
} from './designTemplates';
import { resolveLook, type Look, type GradientSpec } from './design/look';
import { patternZoneBox } from './design/patterns';
import type { Palette, PaletteRole } from './design/palettes';

export interface TemplatePaintContent {
  brand?: string;
  eyebrow?: string;
  headline?: string;
  subline?: string;
  meta?: string;
  cta?: string;
  /** Rows for a 'services' slot — the offer list a business flyer is built on. */
  services?: string[];
  /** Rows for a 'stats' slot: a number and what it counts. */
  stats?: { value: string; label: string }[];
  /** Rows for a 'contact' slot — phone, email, site, address, in display order. */
  contact?: string[];
  /** Rows for a 'price' slot: what it is, what it costs, optionally what it was. */
  price?: PriceRow[];
  /** Already-loaded images. Loading is the caller's job — painting must be sync. */
  logo?: CanvasImageSource | null;
  qr?: CanvasImageSource | null;
  media?: CanvasImageSource | null;
}

export interface PaintOptions {
  accent: string;
  base?: string;
  /** Seconds into the scene. Omit for the settled frame. */
  t?: number;
  /** 0..1 — how much of the media shows through. */
  mediaOpacity?: number;
  /**
   * 0..1 — how opaque the template's own tint is over that media. 1 keeps the
   * design exactly as authored; lower lets a background photo or video read.
   */
  surfaceOpacity?: number;
  fontFamily?: string;
  /**
   * How long this scene runs, in seconds. Required for a camera move and for
   * nothing else.
   *
   * Absent means a still, and a still has no camera: it is one instant, so
   * there is nothing to move through. That is why this is optional rather than
   * defaulted — a guessed duration would put a half-finished push on every PNG.
   */
  sceneSeconds?: number;
  /** Overrides parts of the template's look (Remix, a locked palette). Ignored for a template with no look. */
  look?: Partial<Look>;
  /** The owner's brand as a palette. Wins over the look's own palette. */
  brandPalette?: Palette;
}

const DEFAULT_FONT = 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

/**
 * CSS gradient angle to a canvas gradient line.
 *
 * CSS 0deg points to the top and increases clockwise, which is neither the
 * canvas convention nor standard maths. Getting this wrong flips gradients
 * vertically — subtle enough to ship, obvious once it is on a billboard.
 */
export function gradientLine(angleDeg: number, w: number, h: number) {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = w / 2;
  const cy = h / 2;
  return {
    x0: cx - (dx * len) / 2,
    y0: cy - (dy * len) / 2,
    x1: cx + (dx * len) / 2,
    y1: cy + (dy * len) / 2,
  };
}

// ---- look support ---------------------------------------------------------
//
// Everything below mirrors TemplateSurface. The DOM renderer was written first;
// where the two could differ the DOM is the reference, because that is what the
// owner sees while editing.

/** The palette role a slot's tone names, if it names one. 'accent' is primary. */
function toneRole(tone: SlotSpec['tone']): PaletteRole | null {
  if (tone === 'accent' || tone === 'primary') return 'primary';
  if (tone === 'secondary' || tone === 'highlight') return tone;
  return null;
}

/** A slot's text colour from its tone, given the ink that reads on its ground. */
function slotTone(slot: SlotSpec, roles: Record<PaletteRole, string>, ink: string): string {
  const role = toneRole(slot.tone);
  if (role) return roles[role];
  if (slot.tone === 'muted') return hexAlpha(ink, 0.72);
  return ink;
}

/**
 * A GradientSpec on a box, as TemplateSurface's gradientCss paints it: linear
 * runs along its angle across the box; anything else is a circle at 30% 20%
 * sized to the farthest corner (the CSS default), stops spread evenly.
 */
function gradientFor(
  ctx: CanvasRenderingContext2D,
  g: GradientSpec,
  roles: Record<PaletteRole, string>,
  bx: number, by: number, bw: number, bh: number,
): CanvasGradient {
  const cols = g.stops.map((r) => roles[r]);
  let grad: CanvasGradient;
  if (g.kind === 'linear') {
    const l = gradientLine(g.angle ?? 180, bw, bh);
    grad = ctx.createLinearGradient(bx + l.x0, by + l.y0, bx + l.x1, by + l.y1);
  } else {
    const cx = bx + bw * 0.3;
    const cy = by + bh * 0.2;
    const r = Math.hypot(Math.max(cx - bx, bx + bw - cx), Math.max(cy - by, by + bh - cy));
    grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
  }
  cols.forEach((c, i) => grad.addColorStop(cols.length === 1 ? 0 : i / (cols.length - 1), c));
  return grad;
}

const rgbOf = (hex: string): [number, number, number] => {
  const clean = (hex || '').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full.length === 6 ? full : '000000', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Duotone in place: each channel becomes dark + luma x (light - dark), Rec. 709
 * weights, in sRGB. This is the same arithmetic as the feColorMatrix the DOM
 * renderer builds, so the two land on the palette hexes at black and white.
 * Alpha is left alone.
 */
export function applyDuotone(data: Uint8ClampedArray, dark: string, light: string): void {
  const d = rgbOf(dark);
  const l = rgbOf(light);
  const span = [l[0] - d[0], l[1] - d[1], l[2] - d[2]];
  for (let i = 0; i < data.length; i += 4) {
    const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    data[i] = d[0] + luma * span[0];
    data[i + 1] = d[1] + luma * span[1];
    data[i + 2] = d[2] + luma * span[2];
  }
}

let scratch: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

/** An offscreen canvas for the duotone pass. Null where there is no DOM canvas. */
function scratchCanvas(w: number, h: number) {
  try {
    if (typeof document === 'undefined') return null;
    if (!scratch) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      scratch = { canvas, ctx };
    }
    if (scratch.canvas.width !== w) scratch.canvas.width = w;
    if (scratch.canvas.height !== h) scratch.canvas.height = h;
    return scratch;
  } catch {
    return null;
  }
}

/** Media through the two-colour map. False means the caller should draw it plain. */
function drawDuotoneCover(
  ctx: CanvasRenderingContext2D, media: CanvasImageSource, w: number, h: number, duo: [string, string],
): boolean {
  const s = scratchCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  if (!s) return false;
  try {
    s.ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
    drawCover(s.ctx, media, s.canvas.width, s.canvas.height);
    const img = s.ctx.getImageData(0, 0, s.canvas.width, s.canvas.height);
    applyDuotone(img.data, duo[0], duo[1]);
    s.ctx.putImageData(img, 0, 0);
    ctx.drawImage(s.canvas, 0, 0, w, h);
    return true;
  } catch {
    // A tainted source throws from getImageData. Plain media beats no media.
    return false;
  }
}

/*
 * Patterns arrive asynchronously: the SVG has to be decoded as an image, and
 * drawTemplateFrame is synchronous and returns a boolean (callers depend on
 * both). So the first call for a given pattern STARTS the load and paints
 * without it; every call after the image has decoded paints it. The cache is
 * keyed by the SVG text itself, which already encodes pattern key, canvas size,
 * scale, zone and colour, so a change to any of them is a new entry by
 * construction. Bounded, because a colour picker would otherwise leak one
 * full-frame bitmap per hue tried.
 */
interface PatternEntry {
  image: CanvasImageSource | null;
  loaded: Promise<void>;
}
const PATTERN_CACHE = new Map<string, PatternEntry>();
const PATTERN_CACHE_MAX = 16;

function requestPattern(svg: string): PatternEntry {
  const hit = PATTERN_CACHE.get(svg);
  if (hit) return hit;

  const entry: PatternEntry = { image: null, loaded: Promise.resolve() };
  if (typeof Image !== 'undefined') {
    entry.loaded = new Promise<void>((resolve) => {
      try {
        const img = new Image();
        img.onload = () => { entry.image = img; resolve(); };
        img.onerror = () => resolve();
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      } catch {
        resolve();
      }
    });
  }
  PATTERN_CACHE.set(svg, entry);
  if (PATTERN_CACHE.size > PATTERN_CACHE_MAX) {
    const oldest = PATTERN_CACHE.keys().next().value;
    if (oldest !== undefined) PATTERN_CACHE.delete(oldest);
  }
  return entry;
}

/**
 * Start (and await) the decode of this template's pattern for a frame size.
 * Resolves when the pattern is ready, failed, or after `timeoutMs`; never
 * rejects. An export loop awaits this once so frame 0 already has its pattern.
 */
export async function preloadTemplatePatterns(
  tpl: DesignTemplate,
  w: number,
  h: number,
  opts: Pick<PaintOptions, 'accent' | 'base' | 'look' | 'brandPalette'>,
  timeoutMs = 3000,
): Promise<void> {
  try {
    const resolved = resolveLook(tpl, {
      override: opts.look, brandPalette: opts.brandPalette, accent: opts.accent, base: opts.base, width: w, height: h,
    });
    if (!resolved.pattern) return;
    const { loaded } = requestPattern(resolved.pattern.svg);
    await Promise.race([loaded, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
  } catch {
    /* a missing pattern is a missing texture, not a failed export */
  }
}

function paintLayer(ctx: CanvasRenderingContext2D, layer: SurfaceLayer, w: number, h: number) {
  if (layer.kind === 'linear') {
    const { x0, y0, x1, y1 } = gradientLine(layer.angle, w, h);
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const s of layer.stops) g.addColorStop(Math.max(0, Math.min(1, s.at)), s.color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  // CSS radial radii are a percentage of width and of height independently, so
  // the shape is an ellipse. Canvas gradients are circular; scaling the context
  // reproduces the ellipse exactly instead of approximating it with a circle.
  const rx = Math.max(1, layer.r * w);
  const ry = Math.max(1, layer.r * h);
  ctx.save();
  ctx.translate(layer.cx * w, layer.cy * h);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  for (const s of layer.stops) g.addColorStop(Math.max(0, Math.min(1, s.at)), s.color);
  ctx.fillStyle = g;
  // Cover the whole canvas in the scaled space, whatever the translation.
  ctx.fillRect(-w * 2, (-h * 2 * rx) / ry, w * 4, (h * 4 * rx) / ry);
  ctx.restore();
}

/**
 * Break text to fit a width.
 *
 * A word longer than the box is left on its own line rather than split: a
 * hyphenated business name reads as a typo, an overhanging one reads as tight
 * spacing. `maxLines` then truncates with an ellipsis instead of letting a long
 * headline push the rest of the layout off the canvas.
 */
export function wrapLines(
  measure: (s: string) => number,
  text: string,
  maxWidth: number,
  maxLines = 4,
): string[] {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = words[0];

  for (let i = 1; i < words.length; i++) {
    const next = `${line} ${words[i]}`;
    if (measure(next) <= maxWidth) {
      line = next;
    } else {
      lines.push(line);
      line = words[i];
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines) lines.push(line);

  if (lines.length === maxLines) {
    const consumed = lines.join(' ').split(/\s+/).length;
    if (consumed < words.length) {
      let last = lines[maxLines - 1];
      while (last.length > 1 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

const textFor = (c: TemplatePaintContent, role: SlotSpec['role']): string => {
  switch (role) {
    case 'brand': return c.brand ?? '';
    case 'eyebrow': return c.eyebrow ?? '';
    case 'headline': return c.headline ?? '';
    case 'subline': return c.subline ?? '';
    case 'meta': return c.meta ?? '';
    case 'cta': return c.cta ?? '';
    default: return '';
  }
};

/** How many rows a list slot has content for. */
function listCount(content: TemplatePaintContent, slot: SlotSpec): number {
  const n =
    slot.role === 'services' ? (content.services?.length ?? 0)
    : slot.role === 'stats' ? (content.stats?.length ?? 0)
    : slot.role === 'contact' ? (content.contact?.length ?? 0)
    : slot.role === 'price' ? (content.price?.length ?? 0)
    : 0;
  return slot.max ? Math.min(n, slot.max) : n;
}

/** Whether this context can stroke paths at all — jsdom and polyfills cannot. */
const canPathHere = (ctx: CanvasRenderingContext2D): boolean =>
  typeof ctx.beginPath === 'function' && typeof ctx.arc === 'function' && typeof ctx.fill === 'function';

function paintShape(
  ctx: CanvasRenderingContext2D,
  shape: ShapeSpec,
  w: number,
  h: number,
  accent: string,
  ink: string,
  base: string,
  roles: Record<PaletteRole, string>,
) {
  const geom = shapeGeometry(shape, w, h);
  const color = shapeColor(shape.tone, accent, ink, base, roles);

  // Same feature-detection contract as the rest of this file: a context that
  // cannot draw paths (jsdom, and any canvas polyfill) loses the decoration,
  // not the frame. Shapes are the one part of a template that is purely
  // decorative, so dropping them degrades cleanly.
  const canPath =
    typeof ctx.beginPath === 'function' &&
    typeof ctx.fill === 'function' &&
    typeof ctx.arc === 'function';
  if (!canPath && geom.kind !== 'rect') return;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, shape.alpha ?? 1));
  ctx.fillStyle = color;

  // A gradient fill (rect and circle only) paints from the roles. The box it
  // spans is what TemplateSurface's CSS background spans: the shape's own box,
  // except a skewed rect, which the DOM draws as a clipped full-canvas div.
  const spec = (shape.kind === 'rect' || shape.kind === 'circle') ? shape.fill : undefined;
  if (spec && typeof ctx.createLinearGradient === 'function') {
    const box = geom.kind === 'rect' ? { x: geom.x, y: geom.y, w: geom.w, h: geom.h }
      : geom.kind === 'circle' ? { x: geom.cx - geom.r, y: geom.cy - geom.r, w: geom.r * 2, h: geom.r * 2 }
      : { x: 0, y: 0, w, h };
    ctx.fillStyle = gradientFor(ctx, spec, roles, box.x, box.y, box.w, box.h);
  }

  switch (geom.kind) {
    case 'polygon': {
      ctx.beginPath();
      geom.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'circle':
      ctx.beginPath();
      ctx.arc(geom.cx, geom.cy, geom.r, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'ring':
      ctx.beginPath();
      ctx.arc(geom.cx, geom.cy, geom.r, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = geom.thickness;
      ctx.stroke();
      break;
    case 'rect':
      if (geom.radius > 0 && canPath) {
        roundRect(ctx, geom.x, geom.y, geom.w, geom.h, geom.radius);
        ctx.fill();
      } else if (typeof ctx.fillRect === 'function') {
        ctx.fillRect(geom.x, geom.y, geom.w, geom.h);
      }
      break;
  }
  ctx.restore();
}

/** The marker before a list row. Returns how far to indent the text. */
function paintBullet(
  ctx: CanvasRenderingContext2D,
  slot: SlotSpec,
  x: number,
  baseline: number,
  size: number,
  index: number,
  accent: string,
  family: string,
): number {
  const style = slot.bullet ?? 'none';
  if (style === 'none') return 0;

  const mid = baseline - size * 0.32;
  ctx.save();
  ctx.fillStyle = accent;

  switch (style) {
    case 'dot':
      ctx.beginPath();
      ctx.arc(x + size * 0.28, mid, size * 0.19, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'bar':
      ctx.fillRect(x, mid - size * 0.32, size * 0.16, size * 0.64);
      break;
    case 'check':
      // Drawn, not a glyph: ✓ is missing from enough system fonts that a
      // tofu box would ship into an exported poster.
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1.5, size * 0.11);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + size * 0.06, mid + size * 0.02);
      ctx.lineTo(x + size * 0.24, mid + size * 0.22);
      ctx.lineTo(x + size * 0.55, mid - size * 0.26);
      ctx.stroke();
      break;
    case 'number': {
      ctx.font = `700 ${Math.round(size * 0.86)}px ${family}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = accent;
      ctx.fillText(String(index + 1).padStart(2, '0'), x, baseline);
      break;
    }
  }
  ctx.restore();
  return size * (style === 'number' ? 1.7 : 0.95);
}

/**
 * Paint a repeating slot.
 *
 * Kept separate from the single-string path because the two disagree about
 * almost everything: a list owns its own vertical rhythm, draws a marker per
 * row, and in the 'stats' case stacks two type sizes inside one cell.
 */
function paintListSlot(
  ctx: CanvasRenderingContext2D,
  slot: SlotSpec,
  content: TemplatePaintContent,
  w: number,
  h: number,
  accent: string,
  ink: string,
  family: string,
  /** The row text colour, resolved from the slot's tone (role tones read the palette). */
  tone: string,
) {
  const count = listCount(content, slot);
  if (count === 0) return;

  const boxes = listRowBoxes(slot, w, h, count);
  const weight = slot.weight ?? 600;
  const align = slot.align ?? 'left';

  for (let i = 0; i < count; i++) {
    const row = boxes[i];
    const size = row.size;

    if (slot.role === 'stats') {
      const stat = content.stats![i];
      const cx = align === 'center' ? row.x + row.w / 2 : align === 'right' ? row.x + row.w : row.x;
      ctx.textAlign = align;

      // The number is the point of a stat, so it carries the accent and the
      // weight; the label rides underneath at a fraction of the size.
      ctx.font = `800 ${Math.round(size * 1.55)}px ${family}`;
      ctx.fillStyle = slot.tone === 'muted' ? tone : accent;
      ctx.fillText(stat.value ?? '', cx, row.y + size * 1.4);

      ctx.font = `600 ${Math.round(size * 0.62)}px ${family}`;
      ctx.fillStyle = hexAlpha(ink, 0.7);
      ctx.fillText((stat.label ?? '').toUpperCase(), cx, row.y + size * 2.25);
      continue;
    }

    if (slot.role === 'price') {
      const item: PriceRow = content.price![i];
      const baseline = row.y + size;

      // Label left, price right, on one baseline. A leader rule fills the gap
      // so the eye tracks across — the thing that makes a list read as a menu
      // rather than two unrelated columns.
      ctx.textAlign = 'left';
      ctx.font = `${slot.weight ?? 600} ${Math.round(size)}px ${family}`;
      ctx.fillStyle = tone;
      const label = slot.upper ? (item.label ?? '').toUpperCase() : (item.label ?? '');
      const priceText = item.price ?? '';

      ctx.save();
      ctx.font = `800 ${Math.round(size)}px ${family}`;
      const priceW = ctx.measureText(priceText).width;
      const wasW = item.was ? ctx.measureText(item.was).width + size * 0.5 : 0;
      ctx.restore();

      ctx.font = `${slot.weight ?? 600} ${Math.round(size)}px ${family}`;
      const [labelLine] = wrapLines(
        (t) => ctx.measureText(t).width,
        label,
        Math.max(0, row.w - priceW - wasW - size * 0.8),
        1,
      );
      ctx.fillText(labelLine, row.x, baseline);

      const labelW = ctx.measureText(labelLine).width;
      const gapStart = row.x + labelW + size * 0.35;
      const gapEnd = row.x + row.w - priceW - wasW - size * 0.35;
      if (gapEnd > gapStart) {
        ctx.save();
        ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.35;
        ctx.fillStyle = tone;
        ctx.fillRect(gapStart, baseline - size * 0.22, gapEnd - gapStart, Math.max(1, size * 0.045));
        ctx.restore();
      }

      ctx.textAlign = 'right';
      if (item.was) {
        ctx.font = `600 ${Math.round(size)}px ${family}`;
        ctx.fillStyle = hexAlpha(ink, 0.55);
        const wasX = row.x + row.w - priceW - size * 0.5;
        ctx.fillText(item.was, wasX, baseline);
        // Struck through, because "was" only means anything crossed out.
        const wm = ctx.measureText(item.was).width;
        ctx.fillRect(wasX - wm, baseline - size * 0.28, wm, Math.max(1, size * 0.05));
      }
      ctx.font = `800 ${Math.round(size)}px ${family}`;
      ctx.fillStyle = accent;
      ctx.fillText(priceText, row.x + row.w, baseline);
      continue;
    }

    const raw = slot.role === 'services' ? content.services![i] : content.contact![i];
    const text = slot.upper ? (raw ?? '').toUpperCase() : (raw ?? '');
    if (!text) continue;

    const baseline = row.y + size;
    ctx.textAlign = 'left';
    const indent = paintBullet(ctx, slot, row.x, baseline, size, i, accent, family);

    ctx.font = `${weight} ${Math.round(size)}px ${family}`;
    ctx.fillStyle = tone;
    const avail = Math.max(0, row.w - indent);
    const [line] = wrapLines((t) => ctx.measureText(t).width, text, avail, 1);
    ctx.fillText(line, row.x + indent, baseline);
  }
}

/** Headlines wrap to a few lines; supporting copy stays on one or two. */
const maxLinesFor = (role: SlotSpec['role']): number =>
  role === 'headline' ? 3 : role === 'subline' ? 2 : 1;

/**
 * Paint one frame of a template.
 *
 * Returns false when there is no usable context (jsdom), so callers can skip
 * work rather than guard every call site.
 */
export function drawTemplateFrame(
  ctx: CanvasRenderingContext2D | null,
  tpl: DesignTemplate,
  content: TemplatePaintContent,
  w: number,
  h: number,
  opts: PaintOptions,
): boolean {
  if (!ctx || typeof ctx.fillRect !== 'function') return false;

  /*
   * Every colour comes from the resolved look, exactly as in TemplateSurface.
   * With no look the resolver's fallback hands back today's values (ground is
   * the base, inkOn.ground the scheme ink, every role the accent), so a
   * look-less template takes the same branches and paints the same calls.
   */
  const resolved = resolveLook(tpl, {
    override: opts.look, brandPalette: opts.brandPalette, accent: opts.accent, base: opts.base, width: w, height: h,
  });
  const hasLook = resolved.source === 'look';
  const { roles, inkOn } = resolved;
  const ink = inkOn.ground;
  const base = roles.ground;
  const accent = roles.primary;
  const t = opts.t ?? settleTime(tpl);
  const u = unitOf(w, h);
  const font = opts.fontFamily ?? DEFAULT_FONT;

  /** The ink that reads on whatever this slot sits on. */
  const inkOf = (slot: SlotSpec): string => inkOn[slot.on ?? 'ground'];

  /** Type comes from the look's pairing only when the template has a look. */
  const lookFamily = (slot: SlotSpec): string | undefined => {
    if (!hasLook) return undefined;
    const p = resolved.pairing;
    return fontStack(
      slot.role === 'headline' || (slot.size ?? 0) >= 0.06 ? p.display
        : slot.role === 'eyebrow' ? p.accent : p.text,
    );
  };

  ctx.save();
  ctx.clearRect(0, 0, w, h);

  /*
   * The camera, applied to everything that follows.
   *
   * This is the difference between a slideshow and something that looks filmed.
   * A static frame with text arriving on it reads as a slide; the same frame
   * drifting 4% closer across the scene reads as a shot — and it costs one
   * transform rather than a per-template rewrite.
   *
   * Scaled about the centre so the move has no preferred corner, and every
   * move keeps scale >= 1 for its whole duration so the frame edges never come
   * into view.
   */
  const cam = cameraAt(tpl.camera, t, opts.sceneSeconds ?? 0, w, h);
  if (cam.scale !== 1 || cam.dx !== 0 || cam.dy !== 0) {
    ctx.translate(w / 2 + cam.dx, h / 2 + cam.dy);
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-w / 2, -h / 2);
  }
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Media first, so the surface tint sits over it and keeps text readable.
  if (content.media) {
    const alpha = (opts.mediaOpacity ?? 1);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    try {
      // Duotone maps the photo's luma onto the look's two roles; a context
      // that cannot do the offscreen pass draws it plain.
      if (!(resolved.duotone && drawDuotoneCover(ctx, content.media, w, h, resolved.duotone))) {
        drawCover(ctx, content.media, w, h);
      }
    } catch {
      // A tainted or not-yet-decoded source must not abort the whole frame.
    }
    ctx.globalAlpha = 1;
  }

  if (hasLook) {
    // A look's ground is flat or a designed gradient, thinned with plain
    // alpha over the media, as the DOM renderer does.
    const so = opts.surfaceOpacity ?? 1;
    if (so < 1) ctx.globalAlpha = Math.max(0, so);
    for (const layer of resolved.groundLayers) paintLayer(ctx, layer, w, h);
    ctx.globalAlpha = 1;
  } else {
    for (const layer of surfaceSpecLayers(tpl, accent, base, opts.surfaceOpacity ?? 1)) {
      paintLayer(ctx, layer, w, h);
    }
  }

  /*
   * Pattern: over the ground, under shapes and type (the DOM order). Clipped to
   * its zone by the source rectangle, opacity applied here because the SVG is
   * opaque. If the bitmap is not decoded yet the frame paints without it and
   * the next frame has it; see requestPattern.
   */
  if (resolved.pattern) {
    const bitmap = requestPattern(resolved.pattern.svg).image;
    if (bitmap) {
      const z = patternZoneBox(resolved.pattern.zone, w, h);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, resolved.pattern.opacity));
      try {
        ctx.drawImage(bitmap, z.x, z.y, z.w, z.h, z.x, z.y, z.w, z.h);
      } catch {
        // An image that decoded badly loses the texture, not the frame.
      }
      ctx.restore();
    }
  }

  // Geometry over the surface, under the type. A wedge that covered the
  // headline would make the template unusable, and shapes are decoration.
  for (const shape of tpl.shapes ?? []) {
    paintShape(ctx, shape, w, h, accent, roles.ink, base, roles);
  }

  if (tpl.surface.kind === 'frame') {
    const inset = (tpl.surface.frame ?? 0.035) * u;
    ctx.strokeStyle = hexAlpha(ink, 0.9);
    ctx.lineWidth = Math.max(2, u * 0.006);
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  }

  for (const slot of tpl.slots) {
    const m = motionAt(slot, t, w, h);
    if (m.opacity <= 0 && !m.clip) continue;

    const box = slotBox(slot, w, h);
    /*
     * The SAME fit the DOM preview applies. If only one of the two shrank a
     * long headline the exported PNG would not be the design the owner edited,
     * which is the one guarantee this file exists to keep.
     */
    const size = fitSlotSize(slot, tpl.slots, textFor(content, slot.role), w, h);
    const weight = slot.weight ?? 600;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, m.opacity));

    const slotInk = inkOf(slot);

    if (isListRole(slot.role)) {
      const family = lookFamily(slot) ?? (slot.font || tpl.font ? fontStack(slot.font ?? tpl.font) : font);
      ctx.translate(m.dx, m.dy);
      // Bullets, prices and stat values follow the slot's role tone on a look;
      // without one they stay the accent, exactly as before.
      paintListSlot(
        ctx, slot, content, w, h,
        hasLook ? roles[toneRole(slot.tone) ?? 'primary'] : accent,
        slotInk, family, slotTone(slot, roles, slotInk),
      );
      ctx.restore();
      continue;
    }

    // A wipe reveals by geometry, so it clips rather than fades.
    if (m.clip) {
      const cw = box.width * (1 - m.clip[1] / 100);
      ctx.beginPath();
      ctx.rect(box.left, box.top - size * 1.4, Math.max(0, cw), size * 4);
      ctx.clip();
    }

    if (m.blurPx > 0 && 'filter' in ctx) {
      try { (ctx as CanvasRenderingContext2D).filter = `blur(${m.blurPx}px)`; } catch { /* unsupported */ }
    }

    ctx.translate(box.left + m.dx, box.top + m.dy);
    if (m.scale !== 1) {
      const ox = box.textAlign === 'center' ? box.width / 2 : 0;
      ctx.translate(ox, 0);
      ctx.scale(m.scale, m.scale);
      ctx.translate(-ox, 0);
    }

    if (slot.role === 'qr' && content.qr) {
      const s = slot.w * w;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s, s);
      try { ctx.drawImage(content.qr, u * 0.008, u * 0.008, s - u * 0.016, s - u * 0.016); } catch { /* not decoded */ }
      ctx.restore();
      continue;
    }

    const value = textFor(content, slot.role);
    if (!value) { ctx.restore(); continue; }

    const shown = slot.upper ? value.toUpperCase() : value;
    // A look's pairing wins; otherwise the slot font wins over the template's,
    // which wins over the caller's default.
    const family = lookFamily(slot) ?? (slot.font || tpl.font ? fontStack(slot.font ?? tpl.font) : font);
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.textBaseline = 'top';
    if (slot.tracking && 'letterSpacing' in ctx) {
      try { (ctx as unknown as { letterSpacing: string }).letterSpacing = `${slot.tracking * size}px`; } catch { /* unsupported */ }
    }

    const tone = slotTone(slot, roles, slotInk);
    const role = toneRole(slot.tone);
    const lines = wrapLines((s) => ctx.measureText(s).width, shown, box.width, maxLinesFor(slot.role));
    const lineHeight = size * ((slot.size ?? 0.05) > 0.07 ? 1.06 : 1.28);
    const widest = lines.reduce((mx, l) => Math.max(mx, ctx.measureText(l).width), 0);
    const pad = u * 0.014;

    const anchorX = box.textAlign === 'center' ? box.width / 2 : box.textAlign === 'right' ? box.width : 0;
    ctx.textAlign = box.textAlign === 'center' ? 'center' : box.textAlign === 'right' ? 'right' : 'left';

    // Treatment chrome, painted behind the glyphs.
    const blockW = widest + pad * 2;
    const blockH = lines.length * lineHeight + pad * 1.4;
    const blockX = box.textAlign === 'center' ? anchorX - blockW / 2 : box.textAlign === 'right' ? anchorX - blockW : 0;

    if (slot.treatment === 'pill' || slot.treatment === 'panel' || slot.treatment === 'outline') {
      const r = slot.treatment === 'pill' ? blockH / 2 : slot.treatment === 'panel' ? u * 0.02 : 0;
      roundRect(ctx, blockX, -pad * 0.7, blockW, blockH, r);
      if (slot.treatment === 'outline') {
        ctx.strokeStyle = hexAlpha(slotInk, 0.75);
        ctx.lineWidth = Math.max(1, u * 0.003);
        ctx.stroke();
      } else {
        ctx.fillStyle = slot.treatment === 'panel'
          ? hexAlpha(base, 0.55)
          : hexAlpha(role ? roles[role] : slotInk, 0.18);
        ctx.fill();
      }
    }

    if (slot.treatment === 'bar') {
      ctx.fillStyle = accent;
      ctx.fillRect(-pad, 0, Math.max(2, u * 0.008), blockH - pad * 0.4);
    }

    // The discount badge. Diameter comes from the slot's own width, never from
    // measured text, so this circle and the DOM renderer's circle are the same
    // circle — font metrics differ enough between the two to shift a badge by
    // several pixels otherwise.
    if (slot.treatment === 'disc' && canPathHere(ctx)) {
      const d = box.width;
      const cx = box.textAlign === 'center' ? anchorX : box.textAlign === 'right' ? anchorX - d / 2 : d / 2;
      const cy = (lines.length * lineHeight) / 2 - lineHeight * 0.18;
      ctx.beginPath();
      ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
      ctx.fillStyle = role ? roles[role] : hexAlpha(slotInk, 0.92);
      ctx.fill();
    }

    // On a filled disc the slot tone is the disc, so the words take a colour
    // that reads on it: today's rule (the surface) without a look, the ink
    // measured for that role with one — TemplateSurface's discText.
    const discText = !role ? accent : hasLook ? inkOn[role] : base;
    ctx.fillStyle = slot.treatment === 'disc' ? discText : tone;

    /*
     * Gradient headline. The DOM has to gate this on background-clip support;
     * a canvas fills glyphs with a gradient natively, so no fallback is needed.
     * The span is the slot box, which is what the DOM's block-level background
     * covers. Treatments that paint their own chrome keep flat ink, as in DOM.
     * Colours are the resolver's: primary to secondary, left to right.
     */
    if (
      resolved.headlineGradient && slot.role === 'headline'
      && slot.treatment !== 'pill' && slot.treatment !== 'panel' && slot.treatment !== 'disc'
      && typeof ctx.createLinearGradient === 'function'
    ) {
      const g = ctx.createLinearGradient(0, 0, box.width, 0);
      g.addColorStop(0, roles.primary);
      g.addColorStop(1, roles.secondary);
      ctx.fillStyle = g;
    }
    lines.forEach((line, i) => ctx.fillText(line, anchorX, i * lineHeight));

    if (slot.treatment === 'underline') {
      const y = lines.length * lineHeight + pad * 0.4;
      ctx.fillStyle = accent;
      ctx.fillRect(blockX + pad, y, Math.max(2, widest), Math.max(2, u * 0.006));
    }

    ctx.restore();
  }

  ctx.restore();
  return true;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/** object-fit: cover, for a canvas. */
export function coverRect(sw: number, sh: number, w: number, h: number) {
  if (!sw || !sh) return { x: 0, y: 0, w, h };
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
}

function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, w: number, h: number) {
  const anySrc = src as unknown as { videoWidth?: number; videoHeight?: number; width?: number; height?: number };
  const sw = anySrc.videoWidth || anySrc.width || 0;
  const sh = anySrc.videoHeight || anySrc.height || 0;
  const r = coverRect(Number(sw), Number(sh), w, h);
  ctx.drawImage(src, r.x, r.y, r.w, r.h);
}
