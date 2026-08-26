// Shared design templates — one definition, rendered as a still OR as motion.
//
// WHY THIS EXISTS
//
// Every template in Creative Studio was a hardcoded JSX branch:
// `if (layoutKey === 'classic') return (<>…</>)`, thirty of them, inside a
// 1,900-line component. Nothing else could use them. Motion Studio therefore
// grew its own unrelated scene system, and Brand Card, Landing Pages and the
// admin studios each invented their own layout again. Adding one template meant
// editing one giant file and helped exactly one tool.
//
// Here a template is DATA: a surface plus a list of role-based slots, each with
// a fractional box, a type step, and an optional entrance. From that one object:
//
//   - a still renders by resolving slots at t = settled, and
//   - a motion scene renders by resolving the same slots at any t.
//
// So the same "Editorial Split" is a poster, an Instagram post, and an animated
// reel scene, and a new template is a few lines here that appears in every tool
// that reads this catalogue.
//
// GEOMETRY IS FRACTIONAL. Boxes are 0..1 of the canvas and type sizes are
// multiples of the canvas's short edge, so one template is correct at 1080x1080,
// 1080x1920 and a 2480x3508 print poster without per-format variants — the thing
// that made the old hardcoded layouts unusable outside their original size.

export type SlotRole =
  | 'brand' | 'eyebrow' | 'headline' | 'subline' | 'meta' | 'cta' | 'qr'
  // Repeating slots. Everything above renders ONE string; these render a list,
  // which is what a real business flyer is mostly made of — a services column,
  // a proof-point row, a contact strip. Without them the catalogue could only
  // ever produce posters, never the corporate layouts people actually order.
  | 'services' | 'stats' | 'contact' | 'price';

/** Roles that render a list of rows rather than a single string. */
export const LIST_ROLES: readonly SlotRole[] = ['services', 'stats', 'contact', 'price'];

export const isListRole = (role: SlotRole): boolean => LIST_ROLES.includes(role);

/** How a slot arrives. Named for the visual, not the CSS. */
export type MotionIn = 'fade' | 'rise' | 'drop' | 'wipe' | 'pop' | 'blur';

export type Mood = 'editorial' | 'bold' | 'minimal' | 'luxe' | 'street' | 'warm';

export type Treatment = 'plain' | 'pill' | 'panel' | 'underline' | 'outline' | 'bar' | 'disc';
//
// 'disc' is the discount badge every sale post is built around — a filled
// circle with a short line centred in it. Its diameter is the slot's own `w`
// rather than anything measured from the text, so the canvas and the DOM
// arrive at the same circle instead of each guessing from font metrics.

/**
 * Type families.
 *
 * Every template previously rendered in the same system sans, which is the main
 * reason they read as variations of one design rather than six designs. A serif
 * display or a mono eyebrow changes the character of a layout more than any
 * amount of colour work.
 *
 * Web-safe stacks only — no font loading. A template must render identically in
 * the editor, in an html2canvas PNG and in a canvas video frame, and a webfont
 * that has not finished loading silently substitutes in one of the three.
 */
export type FontKey = 'sans' | 'serif' | 'mono' | 'condensed';

export const FONT_STACKS: Record<FontKey, string> = {
  sans: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", "Iowan Old Style", serif',
  mono: '"SF Mono", ui-monospace, Menlo, Consolas, "Liberation Mono", monospace',
  condensed: '"Arial Narrow", "Helvetica Neue Condensed", "Roboto Condensed", Impact, sans-serif',
};

export const fontStack = (key: FontKey | undefined, fallback: FontKey = 'sans'): string =>
  FONT_STACKS[key ?? fallback];

export interface SlotMotion {
  in: MotionIn;
  /** Seconds into the scene when this slot starts arriving. */
  at: number;
  /** Seconds the arrival takes. */
  dur: number;
}

export interface SlotSpec {
  role: SlotRole;
  /** Fractions of the canvas: left, top, width. Height is content-driven. */
  x: number;
  y: number;
  w: number;
  align?: 'left' | 'center' | 'right';
  /** Multiplier of the canvas short edge. 0.09 of a 1080 square is ~97px. */
  size?: number;
  weight?: number;
  upper?: boolean;
  /** Letter spacing in em. Negative tightens display type. */
  tracking?: number;
  treatment?: Treatment;
  tone?: 'onSurface' | 'accent' | 'muted';
  /** Anchor from the bottom instead of the top, so footers stay pinned. */
  fromBottom?: boolean;
  /** Overrides the template font for this slot — a mono eyebrow over a serif headline. */
  font?: FontKey;
  motion?: SlotMotion;

  // --- list slots only -------------------------------------------------------
  /** Gap between rows, as a multiple of the row's type size. */
  gap?: number;
  /** Marker drawn before each row. */
  bullet?: 'dot' | 'check' | 'number' | 'bar' | 'none';
  /** Lay rows out across the box (a stat strip) instead of down it (a services column). */
  direction?: 'row' | 'column';
  /** Cap on rows drawn, so long content cannot overrun the layout. */
  max?: number;
}

// --- decorative geometry -----------------------------------------------------
//
// The single biggest thing separating this catalogue from a real flyer library
// was that a template could only paint a background and set type on it. Every
// corporate flyer worth copying is built on hard geometry: a diagonal corner
// wedge, a full-bleed footer bar carrying the phone number, a circular photo
// cut-out, an angled accent stripe. Those are shapes, not gradients, and no
// amount of surface tuning produces them.
//
// Painted between the surface and the type, in array order.

export type ShapeTone = 'accent' | 'ink' | 'base' | 'white' | 'black';

export type ShapeSpec =
  /** Right-angled triangle filling one corner. The diagonal-cut look. */
  | { kind: 'wedge'; corner: 'tl' | 'tr' | 'bl' | 'br'; w: number; h: number; tone: ShapeTone; alpha?: number }
  /** Band, panel or footer bar. `skew` shears the vertical edges for an angled block. */
  | { kind: 'rect'; x: number; y: number; w: number; h: number; tone: ShapeTone; alpha?: number; radius?: number; skew?: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; tone: ShapeTone; alpha?: number }
  /** Outline circle — a photo frame or a decorative orbit. */
  | { kind: 'ring'; cx: number; cy: number; r: number; tone: ShapeTone; alpha?: number; thickness?: number }
  /** Rotated bar, for accent slashes that cross the layout. */
  | { kind: 'stripe'; x: number; y: number; w: number; h: number; angle: number; tone: ShapeTone; alpha?: number };

export interface SurfaceSpec {
  kind: 'gradient' | 'solid' | 'spotlight' | 'wash' | 'frame';
  /** Gradient angle in degrees. */
  angle?: number;
  /** 0..1 — how strongly the accent colour reads. */
  intensity?: number;
  /** 0..1 — darkened edges, for text contrast over photography. */
  vignette?: number;
  /** Inset border as a fraction of the short edge. */
  frame?: number;
}

export interface DesignTemplate {
  key: string;
  label: string;
  desc: string;
  mood: Mood;
  /** 'dark' = light text on a dark surface. Decides the default ink colour. */
  scheme: 'dark' | 'light';
  /** Default family for every slot. Individual slots may override it. */
  font?: FontKey;
  surface: SurfaceSpec;
  /** Painted between surface and type, in order. */
  shapes?: ShapeSpec[];
  slots: SlotSpec[];
}

// --- geometry & type ---------------------------------------------------------

/**
 * The canvas short edge is the unit for every size.
 *
 * Short edge rather than width or area is what makes one template work across a
 * square post, a 9:16 story and an A3 poster: type stays in proportion to the
 * narrow dimension, which is what the eye reads as "how big is this".
 */
export const unitOf = (w: number, h: number): number => Math.min(w, h);

export function typePx(size: number | undefined, w: number, h: number): number {
  return Math.round((size ?? 0.05) * unitOf(w, h));
}

export interface SlotBox {
  left: number;
  top: number;
  width: number;
  textAlign: 'left' | 'center' | 'right';
}

/**
 * Resolve a slot's fractional box to pixels.
 *
 * Clamped so a bad template value cannot place content off-canvas: the export
 * is a flat image, so anything outside the frame is silently lost rather than
 * scrollable. A clamp turns an authoring mistake into a visible squeeze.
 */
export function slotBox(slot: SlotSpec, w: number, h: number): SlotBox {
  const fw = Math.max(0, Math.min(1, slot.w));
  const width = fw * w;
  const left = Math.max(0, Math.min(1 - fw, slot.x)) * w;
  const y = Math.max(0, Math.min(1, slot.y)) * h;
  return {
    left,
    top: slot.fromBottom ? h - y : y,
    width,
    textAlign: slot.align ?? 'left',
  };
}

// --- motion ------------------------------------------------------------------

export interface MotionState {
  opacity: number;
  /** Pixels, already scaled to the canvas. */
  dx: number;
  dy: number;
  scale: number;
  blurPx: number;
  /** inset() percentages for a wipe: [top, right, bottom, left]. */
  clip: [number, number, number, number] | null;
}

export const SETTLED: MotionState = { opacity: 1, dx: 0, dy: 0, scale: 1, blurPx: 0, clip: null };

/** Decelerating ease. Entrances should arrive quickly and settle, never coast. */
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

/** Travel distance for a rise/drop, as a fraction of the short edge. */
const TRAVEL = 0.06;

/**
 * Where a slot sits at time `t` seconds.
 *
 * Clamped at both ends deliberately: before `at` the slot is fully absent, and
 * at or after `at + dur` it is exactly SETTLED. That second guarantee is what
 * lets the still renderer reuse this function — resolve at settleTime() and
 * every slot is final, so a still can never drift from the animation's last
 * frame. Two renderers that agree by construction, not by coincidence.
 */
export function motionAt(slot: SlotSpec, t: number, w: number, h: number): MotionState {
  const m = slot.motion;
  if (!m) return SETTLED;

  const u = unitOf(w, h);
  const travel = TRAVEL * u;

  if (t <= m.at) {
    switch (m.in) {
      case 'rise': return { opacity: 0, dx: 0, dy: travel, scale: 1, blurPx: 0, clip: null };
      case 'drop': return { opacity: 0, dx: 0, dy: -travel, scale: 1, blurPx: 0, clip: null };
      case 'pop': return { opacity: 0, dx: 0, dy: 0, scale: 0.9, blurPx: 0, clip: null };
      case 'blur': return { opacity: 0, dx: 0, dy: 0, scale: 1.02, blurPx: 0.02 * u, clip: null };
      // A wipe reveals geometry, so it stays opaque and hides via the clip.
      case 'wipe': return { opacity: 1, dx: 0, dy: 0, scale: 1, blurPx: 0, clip: [0, 100, 0, 0] };
      default: return { opacity: 0, dx: 0, dy: 0, scale: 1, blurPx: 0, clip: null };
    }
  }
  if (t >= m.at + m.dur) return SETTLED;

  const p = easeOut((t - m.at) / m.dur);
  const remaining = travel * (1 - p);
  switch (m.in) {
    case 'rise': return { opacity: p, dx: 0, dy: remaining, scale: 1, blurPx: 0, clip: null };
    case 'drop': return { opacity: p, dx: 0, dy: -remaining, scale: 1, blurPx: 0, clip: null };
    case 'pop': return { opacity: p, dx: 0, dy: 0, scale: 0.9 + 0.1 * p, blurPx: 0, clip: null };
    case 'blur': return { opacity: p, dx: 0, dy: 0, scale: 1.02 - 0.02 * p, blurPx: 0.02 * u * (1 - p), clip: null };
    case 'wipe': return { opacity: 1, dx: 0, dy: 0, scale: 1, blurPx: 0, clip: [0, 100 * (1 - p), 0, 0] };
    default: return { opacity: p, dx: 0, dy: 0, scale: 1, blurPx: 0, clip: null };
  }
}

/** When every slot has settled — the natural minimum length of a scene. */
export function settleTime(tpl: DesignTemplate): number {
  return tpl.slots.reduce(
    (max, s) => (s.motion ? Math.max(max, s.motion.at + s.motion.dur) : max),
    0,
  );
}

// --- surface -----------------------------------------------------------------

export const hexAlpha = (hex: string, a: number): string => {
  const clean = (hex || '').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const n = parseInt(full.length === 6 ? full : '000000', 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`;
};

/**
 * A background layer, described structurally rather than as a CSS string.
 *
 * The DOM renderer needs `linear-gradient(...)`; the canvas renderer needs
 * ctx.createLinearGradient. Deriving both from one description is the only way
 * they stay identical — a preview that does not match the exported frame is the
 * single most damaging bug a design tool can have, and building the two
 * independently guarantees it eventually.
 */
export type SurfaceLayer =
  | { kind: 'linear'; angle: number; stops: { at: number; color: string }[] }
  | { kind: 'radial'; cx: number; cy: number; r: number; stops: { at: number; color: string }[] };

/** The structured surface description. Both renderers consume this. */
export function surfaceSpecLayers(tpl: DesignTemplate, accent: string, base: string): SurfaceLayer[] {
  const s = tpl.surface;
  const k = s.intensity ?? 0.5;
  const out: SurfaceLayer[] = [];

  switch (s.kind) {
    case 'solid':
    case 'frame':
      out.push({ kind: 'linear', angle: 0, stops: [
        { at: 0, color: hexAlpha(base, 0.92) },
        { at: 1, color: hexAlpha(base, 0.92) },
      ] });
      break;
    case 'spotlight':
      out.push({ kind: 'radial', cx: 0.5, cy: 0.12, r: 1.1, stops: [
        { at: 0, color: hexAlpha(accent, k) },
        { at: 0.68, color: hexAlpha(base, 0.94) },
        { at: 1, color: hexAlpha(base, 0.97) },
      ] });
      break;
    case 'wash':
      out.push({ kind: 'linear', angle: (s.angle ?? 180) + 90, stops: [
        { at: 0, color: hexAlpha(accent, k * 0.6) },
        { at: 0.7, color: hexAlpha(accent, 0) },
      ] });
      out.push({ kind: 'linear', angle: s.angle ?? 180, stops: [
        { at: 0, color: hexAlpha(base, 0.2) },
        { at: 1, color: hexAlpha(base, 0.94) },
      ] });
      break;
    case 'gradient':
    default:
      out.push({ kind: 'linear', angle: s.angle ?? 160, stops: [
        { at: 0, color: hexAlpha(accent, k) },
        { at: 0.72, color: hexAlpha(base, 0.95) },
        { at: 1, color: hexAlpha(base, 0.98) },
      ] });
      break;
  }

  if (s.vignette) {
    out.push({ kind: 'radial', cx: 0.5, cy: 0.45, r: 1.15, stops: [
      { at: 0.42, color: hexAlpha('#000000', 0) },
      { at: 1, color: hexAlpha('#000000', s.vignette) },
    ] });
  }
  return out;
}

/** CSS form, for the DOM renderer. Derived from surfaceSpecLayers. */
export function surfaceLayers(tpl: DesignTemplate, accent: string, base: string): string[] {
  return surfaceSpecLayers(tpl, accent, base).map((l) => {
    const stops = l.stops.map(st => `${st.color} ${Math.round(st.at * 100)}%`).join(', ');
    return l.kind === 'linear'
      ? `linear-gradient(${l.angle}deg, ${stops})`
      : `radial-gradient(${Math.round(l.r * 100)}% ${Math.round(l.r * 100)}% at ${Math.round(l.cx * 100)}% ${Math.round(l.cy * 100)}%, ${stops})`;
  });
}

/** Default ink for the template's scheme. */
export const inkFor = (tpl: DesignTemplate): string => (tpl.scheme === 'dark' ? '#ffffff' : '#0b1220');

// --- shapes: one geometry, both renderers ------------------------------------
//
// Same contract as surfaceSpecLayers: resolve to pixel geometry HERE, so the
// canvas painter and the DOM painter cannot disagree about where a wedge sits.
// The canvas strokes these as paths; the DOM turns polygons into clip-path.

export function shapeColor(tone: ShapeTone, accent: string, ink: string, base: string): string {
  switch (tone) {
    case 'accent': return accent;
    case 'ink': return ink;
    case 'base': return base;
    case 'white': return '#ffffff';
    case 'black': return '#000000';
    default: return accent;
  }
}

export type ShapeGeom =
  | { kind: 'polygon'; points: [number, number][] }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ring'; cx: number; cy: number; r: number; thickness: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; radius: number };

/** Resolve a shape's fractional description to pixels on a w x h canvas. */
export function shapeGeometry(shape: ShapeSpec, w: number, h: number): ShapeGeom {
  const u = unitOf(w, h);

  switch (shape.kind) {
    case 'wedge': {
      const sw = shape.w * w;
      const sh = shape.h * h;
      // The right angle sits IN the corner; the hypotenuse cuts across. Which
      // two edges it runs between is what makes a wedge read as top-left vs
      // bottom-right, so each corner needs its own winding.
      const pts: Record<string, [number, number][]> = {
        tl: [[0, 0], [sw, 0], [0, sh]],
        tr: [[w, 0], [w - sw, 0], [w, sh]],
        bl: [[0, h], [sw, h], [0, h - sh]],
        br: [[w, h], [w - sw, h], [w, h - sh]],
      };
      return { kind: 'polygon', points: pts[shape.corner] };
    }
    case 'rect': {
      const x = shape.x * w;
      const y = shape.y * h;
      const rw = shape.w * w;
      const rh = shape.h * h;
      if (shape.skew) {
        // Shear the vertical edges. A positive skew leans the block right,
        // which is the angled colour panel used across corporate flyers.
        const d = shape.skew * rh;
        return { kind: 'polygon', points: [[x + d, y], [x + rw + d, y], [x + rw, y + rh], [x, y + rh]] };
      }
      return { kind: 'rect', x, y, w: rw, h: rh, radius: (shape.radius ?? 0) * u };
    }
    case 'circle':
      return { kind: 'circle', cx: shape.cx * w, cy: shape.cy * h, r: shape.r * u };
    case 'ring':
      return {
        kind: 'ring',
        cx: shape.cx * w,
        cy: shape.cy * h,
        r: shape.r * u,
        thickness: (shape.thickness ?? 0.006) * u,
      };
    case 'stripe': {
      const cx = (shape.x + shape.w / 2) * w;
      const cy = (shape.y + shape.h / 2) * h;
      const hw = (shape.w * w) / 2;
      const hh = (shape.h * h) / 2;
      const rad = (shape.angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const corner = (dx: number, dy: number): [number, number] => [
        cx + dx * cos - dy * sin,
        cy + dx * sin + dy * cos,
      ];
      return {
        kind: 'polygon',
        points: [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)],
      };
    }
    default:
      return { kind: 'rect', x: 0, y: 0, w: 0, h: 0, radius: 0 };
  }
}

// --- list slots --------------------------------------------------------------

export interface ListRowBox {
  x: number;
  y: number;
  w: number;
  /** Type size for this row, in pixels. */
  size: number;
}

/** One row of a 'price' slot: what it is, and what it costs. */
export interface PriceRow {
  label: string;
  price: string;
  /** Optional was-price, struck through beside the current one. */
  was?: string;
}

/**
 * Where each row of a list slot sits.
 *
 * A 'column' list (services, "why choose us") steps DOWN by the type size times
 * the gap. A 'row' list (a stat strip, a contact bar) divides the box ACROSS
 * into equal cells. Both are resolved here so the canvas and DOM painters place
 * row three in the same place.
 */
export function listRowBoxes(slot: SlotSpec, w: number, h: number, count: number): ListRowBox[] {
  if (count <= 0) return [];
  const box = slotBox(slot, w, h);
  const size = typePx(slot.size, w, h);
  const out: ListRowBox[] = [];

  if (slot.direction === 'row') {
    const cell = box.width / count;
    for (let i = 0; i < count; i++) {
      out.push({ x: box.left + i * cell, y: box.top, w: cell, size });
    }
    return out;
  }

  const step = size * (slot.gap ?? 1.9);
  for (let i = 0; i < count; i++) {
    out.push({ x: box.left, y: box.top + i * step, w: box.width, size });
  }
  return out;
}

/** Total height a column list occupies — used to keep a following slot clear. */
export function listHeight(slot: SlotSpec, w: number, h: number, count: number): number {
  if (count <= 0 || slot.direction === 'row') return 0;
  return typePx(slot.size, w, h) * (slot.gap ?? 1.9) * count;
}

// --- the catalogue -----------------------------------------------------------
//
// Type steps are named so a template reads as a design decision rather than a
// wall of magic numbers, and so the scale stays consistent between templates.

const HEAD = 0.092;
const HEAD_HERO = 0.115;
const SUB = 0.036;
const EYEBROW = 0.024;
const META = 0.022;
/** Row type for a services / "why choose us" column. */
const LIST = 0.030;
/** Base for a stat cell — the number renders at 1.55x this, the label at 0.62x. */
const STAT = 0.034;
/** Footer contact strip. Small on purpose: it is reference, not reading. */
const CONTACT = 0.019;

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    key: 'editorial-split',
    label: 'Editorial Split',
    desc: 'Magazine masthead, accent rule, low headline',
    mood: 'editorial', scheme: 'dark', font: 'serif',
    surface: { kind: 'wash', angle: 200, intensity: 0.4, vignette: 0.3 },
    slots: [
      { role: 'brand', x: 0.08, y: 0.09, w: 0.5, size: 0.05, motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.08, y: 0.2, w: 0.5, size: EYEBROW, upper: true, tracking: 0.22, treatment: 'bar', tone: 'accent', font: 'mono', motion: { in: 'wipe', at: 0.3, dur: 0.6 } },
      { role: 'headline', x: 0.08, y: 0.44, w: 0.84, size: HEAD, weight: 800, tracking: -0.02, motion: { in: 'rise', at: 0.5, dur: 0.7 } },
      { role: 'subline', x: 0.08, y: 0.68, w: 0.7, size: SUB, tone: 'muted', motion: { in: 'rise', at: 0.85, dur: 0.6 } },
      { role: 'meta', x: 0.08, y: 0.14, w: 0.6, size: META, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 1.05, dur: 0.5 } },
      { role: 'qr', x: 0.78, y: 0.2, w: 0.14, fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.5 } },
    ],
  },
  {
    key: 'statement',
    label: 'Statement',
    desc: 'One enormous centred line',
    mood: 'bold', scheme: 'dark',
    surface: { kind: 'spotlight', intensity: 0.62, vignette: 0.34 },
    slots: [
      { role: 'brand', x: 0.25, y: 0.1, w: 0.5, size: 0.046, align: 'center', motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.25, y: 0.32, w: 0.5, size: EYEBROW, align: 'center', upper: true, tracking: 0.26, treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0.25, dur: 0.5 } },
      { role: 'headline', x: 0.08, y: 0.41, w: 0.84, size: HEAD_HERO, weight: 900, align: 'center', tracking: -0.03, motion: { in: 'pop', at: 0.45, dur: 0.7 } },
      { role: 'subline', x: 0.16, y: 0.66, w: 0.68, size: SUB, align: 'center', tone: 'muted', motion: { in: 'rise', at: 0.9, dur: 0.6 } },
      { role: 'cta', x: 0.3, y: 0.2, w: 0.4, size: 0.03, align: 'center', treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.5 } },
      { role: 'meta', x: 0.2, y: 0.1, w: 0.6, size: META, align: 'center', fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1.25, dur: 0.5 } },
    ],
  },
  {
    key: 'quiet-luxe',
    label: 'Quiet Luxe',
    desc: 'Airy light layout, thin rules, wide tracking',
    mood: 'luxe', scheme: 'light', font: 'serif',
    surface: { kind: 'solid' },
    slots: [
      { role: 'brand', x: 0.1, y: 0.11, w: 0.5, size: 0.042, motion: { in: 'fade', at: 0, dur: 0.6 } },
      { role: 'eyebrow', x: 0.1, y: 0.26, w: 0.6, size: 0.022, upper: true, tracking: 0.34, tone: 'muted', motion: { in: 'wipe', at: 0.3, dur: 0.7 } },
      { role: 'headline', x: 0.1, y: 0.36, w: 0.72, size: 0.082, weight: 500, tracking: -0.015, motion: { in: 'blur', at: 0.5, dur: 0.8 } },
      { role: 'subline', x: 0.1, y: 0.6, w: 0.6, size: 0.032, tone: 'muted', motion: { in: 'rise', at: 0.95, dur: 0.6 } },
      { role: 'meta', x: 0.1, y: 0.13, w: 0.55, size: 0.02, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1.15, dur: 0.5 } },
      { role: 'qr', x: 0.76, y: 0.19, w: 0.14, fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.5 } },
    ],
  },
  {
    key: 'street-poster',
    label: 'Street Poster',
    desc: 'Hard frame, stacked caps, high contrast',
    mood: 'street', scheme: 'dark', font: 'condensed',
    surface: { kind: 'frame', frame: 0.035, intensity: 0.5, vignette: 0.22 },
    slots: [
      { role: 'eyebrow', x: 0.1, y: 0.14, w: 0.8, size: 0.026, upper: true, tracking: 0.3, treatment: 'outline', motion: { in: 'drop', at: 0, dur: 0.5 } },
      { role: 'headline', x: 0.1, y: 0.3, w: 0.8, size: 0.108, weight: 900, upper: true, tracking: -0.03, motion: { in: 'wipe', at: 0.35, dur: 0.7 } },
      { role: 'subline', x: 0.1, y: 0.62, w: 0.66, size: 0.034, motion: { in: 'rise', at: 0.8, dur: 0.6 } },
      { role: 'brand', x: 0.1, y: 0.17, w: 0.5, size: 0.04, fromBottom: true, motion: { in: 'fade', at: 1.0, dur: 0.5 } },
      { role: 'qr', x: 0.75, y: 0.17, w: 0.15, fromBottom: true, motion: { in: 'pop', at: 1.05, dur: 0.45 } },
    ],
  },
  {
    key: 'warm-offer',
    label: 'Warm Offer',
    desc: 'Panel-backed detail and a clear call to action',
    mood: 'warm', scheme: 'dark',
    surface: { kind: 'gradient', angle: 150, intensity: 0.58, vignette: 0.26 },
    slots: [
      { role: 'brand', x: 0.08, y: 0.1, w: 0.5, size: 0.046, motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.08, y: 0.24, w: 0.55, size: EYEBROW, upper: true, tracking: 0.2, treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0.25, dur: 0.5 } },
      { role: 'headline', x: 0.08, y: 0.36, w: 0.8, size: 0.098, weight: 800, tracking: -0.02, motion: { in: 'rise', at: 0.45, dur: 0.7 } },
      { role: 'subline', x: 0.08, y: 0.58, w: 0.62, size: SUB, treatment: 'panel', motion: { in: 'wipe', at: 0.85, dur: 0.6 } },
      { role: 'cta', x: 0.08, y: 0.19, w: 0.44, size: 0.032, treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 1.05, dur: 0.5 } },
      { role: 'meta', x: 0.08, y: 0.1, w: 0.6, size: META, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1.2, dur: 0.5 } },
      { role: 'qr', x: 0.77, y: 0.18, w: 0.15, fromBottom: true, motion: { in: 'pop', at: 1.15, dur: 0.45 } },
    ],
  },
  {
    key: 'minimal-grid',
    label: 'Minimal Grid',
    desc: 'Left rail, generous space, underlined heading',
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid' },
    slots: [
      { role: 'brand', x: 0.12, y: 0.12, w: 0.4, size: 0.04, motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.12, y: 0.24, w: 0.5, size: 0.021, upper: true, tracking: 0.28, tone: 'accent', motion: { in: 'wipe', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.12, y: 0.34, w: 0.68, size: 0.086, weight: 700, tracking: -0.02, treatment: 'underline', motion: { in: 'rise', at: 0.3, dur: 0.7 } },
      { role: 'subline', x: 0.12, y: 0.56, w: 0.56, size: 0.031, tone: 'muted', motion: { in: 'rise', at: 0.75, dur: 0.6 } },
      { role: 'meta', x: 0.12, y: 0.12, w: 0.6, size: 0.02, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1.0, dur: 0.5 } },
    ],
  },
  {
    key: 'soft-glass',
    label: 'Soft Glass',
    desc: 'Frosted panel over a soft-focus photo',
    mood: 'minimal', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 200, intensity: 0.34, vignette: 0.4 },
    slots: [
      { role: 'brand', x: 0.09, y: 0.1, w: 0.5, size: 0.044, motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.09, y: 0.46, w: 0.5, size: 0.021, upper: true, tracking: 0.3, font: 'mono', tone: 'accent', motion: { in: 'fade', at: 0.3, dur: 0.5 } },
      { role: 'headline', x: 0.09, y: 0.53, w: 0.74, size: 0.084, weight: 650, tracking: -0.02, treatment: 'panel', motion: { in: 'blur', at: 0.45, dur: 0.75 } },
      { role: 'subline', x: 0.09, y: 0.74, w: 0.62, size: 0.031, tone: 'muted', motion: { in: 'rise', at: 0.95, dur: 0.55 } },
      { role: 'cta', x: 0.09, y: 0.16, w: 0.42, size: 0.03, treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 1.15, dur: 0.45 } },
      { role: 'qr', x: 0.76, y: 0.16, w: 0.14, fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.4 } },
    ],
  },
  {
    key: 'mesh-accent',
    label: 'Mesh Accent',
    desc: 'Layered colour bloom, tight modern sans',
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'spotlight', intensity: 0.7, vignette: 0.2 },
    slots: [
      { role: 'eyebrow', x: 0.09, y: 0.12, w: 0.46, size: 0.02, upper: true, tracking: 0.32, font: 'mono', tone: 'accent', motion: { in: 'wipe', at: 0, dur: 0.5 } },
      { role: 'headline', x: 0.09, y: 0.24, w: 0.8, size: 0.104, weight: 800, tracking: -0.035, motion: { in: 'rise', at: 0.25, dur: 0.7 } },
      { role: 'subline', x: 0.09, y: 0.56, w: 0.6, size: 0.033, tone: 'muted', motion: { in: 'rise', at: 0.75, dur: 0.6 } },
      { role: 'brand', x: 0.09, y: 0.15, w: 0.5, size: 0.042, fromBottom: true, motion: { in: 'fade', at: 1.0, dur: 0.5 } },
      { role: 'meta', x: 0.09, y: 0.09, w: 0.6, size: 0.02, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 1.15, dur: 0.45 } },
      { role: 'qr', x: 0.77, y: 0.15, w: 0.14, fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.45 } },
    ],
  },
  {
    key: 'gallery-serif',
    label: 'Gallery Serif',
    desc: 'Exhibition card - light, serif, wide margins',
    mood: 'luxe', scheme: 'light', font: 'serif',
    surface: { kind: 'solid' },
    slots: [
      { role: 'eyebrow', x: 0.14, y: 0.18, w: 0.5, size: 0.019, upper: true, tracking: 0.38, font: 'mono', tone: 'muted', motion: { in: 'fade', at: 0, dur: 0.6 } },
      { role: 'headline', x: 0.14, y: 0.28, w: 0.66, size: 0.088, weight: 400, tracking: -0.01, motion: { in: 'blur', at: 0.35, dur: 0.85 } },
      { role: 'subline', x: 0.14, y: 0.54, w: 0.52, size: 0.029, tone: 'muted', motion: { in: 'rise', at: 0.95, dur: 0.6 } },
      { role: 'brand', x: 0.14, y: 0.16, w: 0.5, size: 0.036, fromBottom: true, motion: { in: 'fade', at: 1.1, dur: 0.5 } },
      { role: 'meta', x: 0.14, y: 0.1, w: 0.55, size: 0.019, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 1.25, dur: 0.45 } },
    ],
  },
  {
    key: 'ticket',
    label: 'Ticket',
    desc: 'Stub-style panels, mono detail, event feel',
    mood: 'street', scheme: 'dark', font: 'condensed',
    surface: { kind: 'gradient', angle: 120, intensity: 0.44, vignette: 0.3 },
    slots: [
      { role: 'brand', x: 0.09, y: 0.11, w: 0.5, size: 0.042, font: 'sans', motion: { in: 'drop', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.09, y: 0.24, w: 0.5, size: 0.022, upper: true, tracking: 0.26, font: 'mono', treatment: 'outline', motion: { in: 'fade', at: 0.15, dur: 0.45 } },
      { role: 'headline', x: 0.09, y: 0.3, w: 0.82, size: 0.112, weight: 700, upper: true, tracking: -0.02, motion: { in: 'wipe', at: 0.3, dur: 0.7 } },
      { role: 'subline', x: 0.09, y: 0.6, w: 0.64, size: 0.032, font: 'sans', treatment: 'panel', motion: { in: 'rise', at: 0.85, dur: 0.6 } },
      { role: 'meta', x: 0.09, y: 0.12, w: 0.55, size: 0.021, fromBottom: true, font: 'mono', tone: 'muted', motion: { in: 'fade', at: 1.1, dur: 0.45 } },
      { role: 'qr', x: 0.76, y: 0.17, w: 0.15, fromBottom: true, motion: { in: 'pop', at: 1.05, dur: 0.45 } },
    ],
  },
  {
    key: 'story-caption',
    label: 'Story Caption',
    desc: 'Built for 9:16 - copy low and thumb-safe',
    mood: 'warm', scheme: 'dark', font: 'sans',
    surface: { kind: 'wash', angle: 190, intensity: 0.3, vignette: 0.44 },
    slots: [
      { role: 'brand', x: 0.09, y: 0.08, w: 0.6, size: 0.04, motion: { in: 'fade', at: 0, dur: 0.5 } },
      // Anchored low so copy clears a story's own UI at the top and bottom.
      { role: 'eyebrow', x: 0.09, y: 0.42, w: 0.5, size: 0.021, upper: true, tracking: 0.28, font: 'mono', tone: 'accent', fromBottom: true, motion: { in: 'wipe', at: 0.3, dur: 0.5 } },
      { role: 'headline', x: 0.09, y: 0.3, w: 0.82, size: 0.09, weight: 800, tracking: -0.025, fromBottom: true, motion: { in: 'rise', at: 0.45, dur: 0.7 } },
      { role: 'subline', x: 0.09, y: 0.22, w: 0.7, size: 0.03, tone: 'muted', fromBottom: true, motion: { in: 'rise', at: 0.9, dur: 0.55 } },
      { role: 'cta', x: 0.09, y: 0.12, w: 0.44, size: 0.029, treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.45 } },
    ],
  },
  {
    key: 'price-block',
    label: 'Price Block',
    desc: 'Offer-led - the number is the hero',
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 165, intensity: 0.6, vignette: 0.24 },
    slots: [
      { role: 'brand', x: 0.09, y: 0.1, w: 0.5, size: 0.042, motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.09, y: 0.26, w: 0.55, size: 0.022, upper: true, tracking: 0.24, treatment: 'pill', tone: 'accent', font: 'mono', motion: { in: 'pop', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.09, y: 0.36, w: 0.7, size: 0.13, weight: 900, tracking: -0.04, motion: { in: 'pop', at: 0.4, dur: 0.65 } },
      { role: 'subline', x: 0.09, y: 0.62, w: 0.62, size: 0.032, tone: 'muted', motion: { in: 'rise', at: 0.85, dur: 0.55 } },
      { role: 'cta', x: 0.09, y: 0.18, w: 0.46, size: 0.032, treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 1.05, dur: 0.45 } },
      { role: 'meta', x: 0.09, y: 0.1, w: 0.6, size: 0.02, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 1.2, dur: 0.45 } },
      { role: 'qr', x: 0.77, y: 0.17, w: 0.14, fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.45 } },
    ],
  },

  // --- business flyers -------------------------------------------------------
  //
  // The twelve templates above are posters: a statement, some air, one idea.
  // These are the layouts businesses actually commission — a service list, a
  // reason to trust, a number to call. They are why 'services', 'stats',
  // 'contact' and the shape layer exist; none of them can be built without.

  {
    key: 'agency-services',
    label: 'Agency Services',
    desc: 'Diagonal cut, service list, contact bar',
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 155, intensity: 0.4, vignette: 0.24 },
    shapes: [
      { kind: 'wedge', corner: 'tr', w: 0.44, h: 0.19, tone: 'accent', alpha: 0.92 },
      { kind: 'rect', x: 0, y: 0.885, w: 1, h: 0.115, tone: 'accent', alpha: 0.95 },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.085, w: 0.46, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.185, w: 0.56, size: EYEBROW, upper: true, tracking: 0.2, treatment: 'bar', tone: 'accent', motion: { in: 'wipe', at: 0.25, dur: 0.5 } },
      { role: 'headline', x: 0.08, y: 0.245, w: 0.8, size: HEAD, weight: 800, tracking: -0.025, motion: { in: 'rise', at: 0.4, dur: 0.6 } },
      { role: 'subline', x: 0.08, y: 0.46, w: 0.74, size: SUB, tone: 'muted', motion: { in: 'fade', at: 0.7, dur: 0.5 } },
      { role: 'services', x: 0.08, y: 0.57, w: 0.8, size: LIST, weight: 600, bullet: 'dot', gap: 1.95, max: 4, motion: { in: 'rise', at: 0.9, dur: 0.6 } },
      { role: 'cta', x: 0.08, y: 0.2, w: 0.5, size: 0.03, weight: 700, treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 1.25, dur: 0.45 } },
      { role: 'contact', x: 0.07, y: 0.055, w: 0.86, size: CONTACT, weight: 700, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.4, dur: 0.4 } },
    ],
  },
  {
    key: 'why-choose-us',
    label: 'Why Choose Us',
    desc: 'Ticked reasons to trust, light and corporate',
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid' },
    shapes: [
      { kind: 'wedge', corner: 'tr', w: 0.5, h: 0.16, tone: 'accent', alpha: 0.9 },
      { kind: 'stripe', x: 0.04, y: 0.145, w: 0.16, h: 0.008, angle: 0, tone: 'accent' },
      { kind: 'rect', x: 0, y: 0.9, w: 1, h: 0.1, tone: 'accent', alpha: 0.12 },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.08, w: 0.44, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'headline', x: 0.08, y: 0.2, w: 0.76, size: HEAD, weight: 800, tracking: -0.025, motion: { in: 'rise', at: 0.25, dur: 0.6 } },
      { role: 'subline', x: 0.08, y: 0.4, w: 0.7, size: SUB, tone: 'muted', motion: { in: 'fade', at: 0.6, dur: 0.5 } },
      { role: 'services', x: 0.08, y: 0.51, w: 0.82, size: LIST, weight: 600, bullet: 'check', gap: 2.05, max: 4, motion: { in: 'rise', at: 0.8, dur: 0.6 } },
      { role: 'cta', x: 0.08, y: 0.21, w: 0.5, size: 0.03, weight: 700, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 1.2, dur: 0.45 } },
      { role: 'contact', x: 0.07, y: 0.05, w: 0.86, size: CONTACT, weight: 700, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.35, dur: 0.4 } },
    ],
  },
  {
    key: 'proof-points',
    label: 'Proof Points',
    desc: 'The numbers lead — clients, projects, years',
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'spotlight', intensity: 0.45, vignette: 0.3 },
    shapes: [
      { kind: 'rect', x: 0.06, y: 0.585, w: 0.88, h: 0.185, tone: 'white', alpha: 0.07, radius: 0.03 },
      { kind: 'circle', cx: 0.9, cy: 0.13, r: 0.11, tone: 'accent', alpha: 0.2 },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.085, w: 0.44, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.19, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, tone: 'accent', motion: { in: 'rise', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.08, y: 0.25, w: 0.8, size: HEAD, weight: 800, tracking: -0.025, motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      { role: 'subline', x: 0.08, y: 0.46, w: 0.72, size: SUB, tone: 'muted', motion: { in: 'fade', at: 0.65, dur: 0.5 } },
      { role: 'stats', x: 0.09, y: 0.625, w: 0.82, size: STAT, direction: 'row', align: 'left', max: 3, motion: { in: 'pop', at: 0.85, dur: 0.55 } },
      { role: 'cta', x: 0.08, y: 0.19, w: 0.52, size: 0.03, weight: 700, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 1.15, dur: 0.45 } },
      { role: 'contact', x: 0.08, y: 0.095, w: 0.84, size: CONTACT, weight: 600, tone: 'muted', direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.3, dur: 0.4 } },
    ],
  },
  {
    key: 'numbered-services',
    label: 'Numbered Services',
    desc: '01-04 down the page, editorial and calm',
    mood: 'editorial', scheme: 'dark', font: 'sans',
    surface: { kind: 'wash', angle: 190, intensity: 0.34, vignette: 0.28 },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.02, h: 1, tone: 'accent', alpha: 0.9 },
    ],
    slots: [
      { role: 'brand', x: 0.1, y: 0.085, w: 0.44, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.1, y: 0.18, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, tone: 'accent', font: 'mono', motion: { in: 'wipe', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.1, y: 0.235, w: 0.78, size: 0.085, weight: 800, tracking: -0.02, motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      { role: 'services', x: 0.1, y: 0.45, w: 0.8, size: LIST, weight: 600, bullet: 'number', gap: 2.2, max: 4, motion: { in: 'rise', at: 0.65, dur: 0.65 } },
      { role: 'subline', x: 0.1, y: 0.24, w: 0.7, size: 0.03, tone: 'muted', fromBottom: true, motion: { in: 'fade', at: 1.05, dur: 0.5 } },
      { role: 'contact', x: 0.1, y: 0.1, w: 0.82, size: CONTACT, weight: 600, tone: 'muted', direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.25, dur: 0.4 } },
    ],
  },
  {
    key: 'speaker-card',
    label: 'Speaker Card',
    desc: 'Portrait ring, name, role and the date',
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 165, intensity: 0.5, vignette: 0.34 },
    shapes: [
      { kind: 'wedge', corner: 'bl', w: 0.5, h: 0.22, tone: 'accent', alpha: 0.16 },
      // Disc under ring. Alone, the ring read as an empty outline — a template
      // that looks like it failed to load. Filled, it is a portrait vignette
      // that works with a photo behind it and still looks deliberate without.
      { kind: 'circle', cx: 0.5, cy: 0.29, r: 0.19, tone: 'white', alpha: 0.07 },
      { kind: 'ring', cx: 0.5, cy: 0.29, r: 0.19, tone: 'accent', alpha: 0.85, thickness: 0.008 },
    ],
    slots: [
      { role: 'eyebrow', x: 0.1, y: 0.085, w: 0.8, size: EYEBROW, align: 'center', upper: true, tracking: 0.24, tone: 'accent', motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'headline', x: 0.1, y: 0.53, w: 0.8, size: 0.082, weight: 800, align: 'center', tracking: -0.02, motion: { in: 'rise', at: 0.45, dur: 0.6 } },
      { role: 'subline', x: 0.12, y: 0.665, w: 0.76, size: 0.03, align: 'center', tone: 'accent', upper: true, tracking: 0.12, motion: { in: 'fade', at: 0.75, dur: 0.5 } },
      { role: 'meta', x: 0.15, y: 0.745, w: 0.7, size: META, align: 'center', treatment: 'pill', motion: { in: 'pop', at: 0.95, dur: 0.45 } },
      { role: 'cta', x: 0.2, y: 0.155, w: 0.6, size: 0.028, weight: 700, align: 'center', treatment: 'outline', fromBottom: true, motion: { in: 'pop', at: 1.15, dur: 0.45 } },
      { role: 'brand', x: 0.1, y: 0.075, w: 0.8, size: 0.024, align: 'center', upper: true, tracking: 0.18, tone: 'muted', fromBottom: true, motion: { in: 'fade', at: 1.3, dur: 0.4 } },
    ],
  },
  {
    key: 'promo-burst',
    label: 'Promo Burst',
    desc: 'The discount is the hero - dates and a deadline',
    mood: 'street', scheme: 'dark', font: 'condensed',
    surface: { kind: 'gradient', angle: 145, intensity: 0.62, vignette: 0.2 },
    shapes: [
      // Clear of the headline box on purpose: at cx 0.78 / r 0.2 this circle
      // overlapped the first line of a two-line headline on every format.
      { kind: 'circle', cx: 0.84, cy: 0.15, r: 0.13, tone: 'accent', alpha: 0.9 },
      { kind: 'rect', x: -0.05, y: 0.6, w: 1.1, h: 0.1, tone: 'black', alpha: 0.35, skew: 0.12 },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.085, w: 0.44, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.2, w: 0.5, size: EYEBROW, upper: true, tracking: 0.22, treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.08, y: 0.29, w: 0.66, size: HEAD_HERO, weight: 800, upper: true, tracking: -0.03, motion: { in: 'pop', at: 0.35, dur: 0.55 } },
      { role: 'subline', x: 0.08, y: 0.62, w: 0.7, size: 0.032, weight: 700, upper: true, tracking: 0.08, motion: { in: 'wipe', at: 0.7, dur: 0.5 } },
      { role: 'meta', x: 0.08, y: 0.73, w: 0.6, size: META, tone: 'muted', motion: { in: 'fade', at: 0.95, dur: 0.45 } },
      { role: 'cta', x: 0.08, y: 0.19, w: 0.56, size: 0.032, weight: 800, upper: true, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.45 } },
      { role: 'contact', x: 0.08, y: 0.09, w: 0.84, size: CONTACT, weight: 700, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.25, dur: 0.4 } },
    ],
  },
  {
    key: 'consulting-clean',
    label: 'Consulting Clean',
    desc: 'Left rail, quiet type, services and a number to call',
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid' },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.055, h: 1, tone: 'accent', alpha: 0.95 },
      { kind: 'rect', x: 0.115, y: 0.885, w: 0.82, h: 0.002, tone: 'ink', alpha: 0.2 },
    ],
    slots: [
      { role: 'brand', x: 0.115, y: 0.09, w: 0.5, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.115, y: 0.19, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, tone: 'accent', motion: { in: 'rise', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.115, y: 0.25, w: 0.76, size: 0.086, weight: 700, tracking: -0.02, motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      { role: 'subline', x: 0.115, y: 0.45, w: 0.7, size: SUB, tone: 'muted', motion: { in: 'fade', at: 0.65, dur: 0.5 } },
      { role: 'services', x: 0.115, y: 0.56, w: 0.78, size: LIST, weight: 600, bullet: 'bar', gap: 2.0, max: 4, motion: { in: 'rise', at: 0.85, dur: 0.6 } },
      { role: 'contact', x: 0.115, y: 0.075, w: 0.82, size: CONTACT, weight: 600, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.4 } },
    ],
  },
  {
    key: 'report-cover',
    label: 'Report Cover',
    desc: 'Annual-report restraint - year, title, one rule',
    mood: 'luxe', scheme: 'light', font: 'serif',
    surface: { kind: 'frame', frame: 0.045 },
    shapes: [
      { kind: 'rect', x: 0.12, y: 0.455, w: 0.2, h: 0.004, tone: 'accent' },
      { kind: 'rect', x: 0, y: 0.78, w: 1, h: 0.22, tone: 'accent', alpha: 0.08 },
    ],
    slots: [
      { role: 'brand', x: 0.12, y: 0.13, w: 0.5, size: 0.028, weight: 700, upper: true, tracking: 0.2, font: 'sans', motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.12, y: 0.24, w: 0.5, size: 0.05, weight: 400, tone: 'accent', font: 'sans', motion: { in: 'rise', at: 0.25, dur: 0.5 } },
      { role: 'headline', x: 0.12, y: 0.3, w: 0.74, size: 0.088, weight: 500, tracking: -0.015, motion: { in: 'rise', at: 0.4, dur: 0.65 } },
      { role: 'subline', x: 0.12, y: 0.51, w: 0.62, size: 0.032, tone: 'muted', font: 'sans', motion: { in: 'fade', at: 0.75, dur: 0.55 } },
      { role: 'stats', x: 0.12, y: 0.83, w: 0.76, size: 0.03, direction: 'row', align: 'left', max: 3, font: 'sans', motion: { in: 'rise', at: 0.95, dur: 0.55 } },
      { role: 'meta', x: 0.12, y: 0.075, w: 0.6, size: META, tone: 'muted', font: 'sans', fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.45 } },
    ],
  },

  // --- social promo posts ----------------------------------------------------
  //
  // The flyers above are what a business hands someone. These are what it posts
  // on a Tuesday: a discount, a price list, a countdown, a giveaway, a review.
  // They are square-first because that is where they live, and they lean on the
  // 'disc' badge and the 'price' rows rather than long-form copy.

  {
    key: 'flash-sale',
    label: 'Flash Sale',
    desc: 'The discount is a badge and nothing competes with it',
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 150, intensity: 0.6, vignette: 0.22 },
    shapes: [
      { kind: 'wedge', corner: 'tl', w: 0.4, h: 0.16, tone: 'accent', alpha: 0.18 },
      { kind: 'rect', x: 0, y: 0.9, w: 1, h: 0.1, tone: 'black', alpha: 0.35 },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.08, w: 0.5, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.19, w: 0.55, size: EYEBROW, upper: true, tracking: 0.22, treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.08, y: 0.28, w: 0.56, size: 0.086, weight: 800, tracking: -0.025, motion: { in: 'rise', at: 0.35, dur: 0.55 } },
      // The badge: a disc whose diameter is this slot's width.
      { role: 'cta', x: 0.63, y: 0.3, w: 0.29, size: 0.05, weight: 800, align: 'center', upper: true, treatment: 'disc', tone: 'accent', motion: { in: 'pop', at: 0.55, dur: 0.5 } },
      { role: 'subline', x: 0.08, y: 0.56, w: 0.72, size: SUB, tone: 'muted', motion: { in: 'fade', at: 0.8, dur: 0.5 } },
      { role: 'meta', x: 0.08, y: 0.68, w: 0.6, size: META, upper: true, tracking: 0.1, treatment: 'bar', tone: 'accent', motion: { in: 'wipe', at: 1, dur: 0.45 } },
      { role: 'contact', x: 0.08, y: 0.055, w: 0.84, size: CONTACT, weight: 700, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.4 } },
    ],
  },
  {
    key: 'price-list',
    label: 'Price List',
    desc: 'Menu-style rows, leader rules, prices right',
    mood: 'editorial', scheme: 'dark', font: 'sans',
    surface: { kind: 'spotlight', intensity: 0.36, vignette: 0.32 },
    shapes: [
      { kind: 'rect', x: 0.06, y: 0.3, w: 0.88, h: 0.53, tone: 'white', alpha: 0.06, radius: 0.03 },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.085, w: 0.5, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.16, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, tone: 'accent', motion: { in: 'rise', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.08, y: 0.205, w: 0.8, size: 0.072, weight: 800, tracking: -0.02, motion: { in: 'rise', at: 0.3, dur: 0.55 } },
      { role: 'price', x: 0.1, y: 0.35, w: 0.8, size: 0.031, weight: 600, gap: 2.1, max: 5, motion: { in: 'rise', at: 0.55, dur: 0.6 } },
      { role: 'cta', x: 0.08, y: 0.2, w: 0.54, size: 0.03, weight: 700, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 1.05, dur: 0.45 } },
      { role: 'contact', x: 0.08, y: 0.085, w: 0.84, size: CONTACT, weight: 600, tone: 'muted', direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.25, dur: 0.4 } },
    ],
  },
  {
    key: 'price-drop',
    label: 'Price Drop',
    desc: 'Was and now, with the old price struck out',
    mood: 'bold', scheme: 'light', font: 'sans',
    surface: { kind: 'solid' },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.14, tone: 'accent', alpha: 0.95 },
      { kind: 'circle', cx: 0.85, cy: 0.62, r: 0.13, tone: 'accent', alpha: 0.14 },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.045, w: 0.5, size: 0.026, weight: 800, upper: true, tracking: 0.18, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.2, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, tone: 'accent', motion: { in: 'rise', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.08, y: 0.25, w: 0.76, size: 0.072, weight: 800, tracking: -0.02, motion: { in: 'rise', at: 0.32, dur: 0.55 } },
      { role: 'subline', x: 0.08, y: 0.43, w: 0.7, size: 0.03, tone: 'muted', motion: { in: 'fade', at: 0.6, dur: 0.45 } },
      // The was/now pair goes through the price row rather than a struck meta
      // slot. Overloading meta meant that any content WITHOUT a price — which
      // is what a generic caller passes — rendered a struck-through sentence.
      // A price slot with no price data simply draws nothing.
      { role: 'price', x: 0.08, y: 0.55, w: 0.84, size: 0.046, weight: 700, gap: 2.1, max: 2, motion: { in: 'pop', at: 0.8, dur: 0.5 } },
      { role: 'cta', x: 0.08, y: 0.22, w: 0.52, size: 0.03, weight: 700, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.45 } },
      { role: 'contact', x: 0.08, y: 0.09, w: 0.84, size: CONTACT, weight: 600, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.25, dur: 0.4 } },
    ],
  },
  {
    key: 'countdown-post',
    label: 'Countdown',
    desc: 'Days to go, huge — then where and when',
    mood: 'street', scheme: 'dark', font: 'condensed',
    surface: { kind: 'gradient', angle: 170, intensity: 0.55, vignette: 0.3 },
    shapes: [
      { kind: 'wedge', corner: 'br', w: 0.58, h: 0.28, tone: 'accent', alpha: 0.18 },
      { kind: 'rect', x: 0.08, y: 0.355, w: 0.16, h: 0.008, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.085, w: 0.5, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.2, w: 0.6, size: EYEBROW, upper: true, tracking: 0.24, tone: 'accent', motion: { in: 'rise', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.08, y: 0.42, w: 0.84, size: HEAD_HERO, weight: 800, upper: true, tracking: -0.03, motion: { in: 'pop', at: 0.4, dur: 0.55 } },
      { role: 'subline', x: 0.08, y: 0.63, w: 0.72, size: 0.034, weight: 700, upper: true, tracking: 0.08, motion: { in: 'wipe', at: 0.75, dur: 0.5 } },
      { role: 'meta', x: 0.08, y: 0.72, w: 0.66, size: META, tone: 'muted', motion: { in: 'fade', at: 0.95, dur: 0.45 } },
      { role: 'cta', x: 0.08, y: 0.2, w: 0.56, size: 0.03, weight: 800, upper: true, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.45 } },
      { role: 'contact', x: 0.08, y: 0.09, w: 0.84, size: CONTACT, weight: 700, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.25, dur: 0.4 } },
    ],
  },
  {
    key: 'giveaway-steps',
    label: 'Giveaway',
    desc: 'Numbered steps to enter, prize up top',
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 200, intensity: 0.52, vignette: 0.24 },
    shapes: [
      { kind: 'circle', cx: 0.12, cy: 0.12, r: 0.09, tone: 'accent', alpha: 0.22 },
      { kind: 'circle', cx: 0.9, cy: 0.2, r: 0.06, tone: 'accent', alpha: 0.3 },
      { kind: 'rect', x: 0.06, y: 0.47, w: 0.88, h: 0.34, tone: 'white', alpha: 0.07, radius: 0.035 },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.085, w: 0.5, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.2, w: 0.6, size: EYEBROW, upper: true, tracking: 0.24, tone: 'accent', motion: { in: 'pop', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.08, y: 0.25, w: 0.8, size: 0.082, weight: 800, tracking: -0.025, motion: { in: 'rise', at: 0.32, dur: 0.55 } },
      { role: 'subline', x: 0.08, y: 0.42, w: 0.74, size: 0.03, tone: 'muted', motion: { in: 'fade', at: 0.6, dur: 0.45 } },
      { role: 'services', x: 0.1, y: 0.52, w: 0.78, size: LIST, weight: 700, bullet: 'number', gap: 2.15, max: 3, motion: { in: 'rise', at: 0.75, dur: 0.6 } },
      { role: 'meta', x: 0.08, y: 0.19, w: 0.7, size: META, tone: 'muted', fromBottom: true, motion: { in: 'fade', at: 1.05, dur: 0.45 } },
      { role: 'contact', x: 0.08, y: 0.09, w: 0.84, size: CONTACT, weight: 700, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.4 } },
    ],
  },
  {
    key: 'testimonial-card',
    label: 'Client Review',
    desc: 'A quote, who said it, and a rating',
    mood: 'warm', scheme: 'light', font: 'serif',
    surface: { kind: 'solid' },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.06, h: 1, tone: 'accent', alpha: 0.9 },
      { kind: 'circle', cx: 0.86, cy: 0.16, r: 0.1, tone: 'accent', alpha: 0.12 },
    ],
    slots: [
      { role: 'brand', x: 0.13, y: 0.09, w: 0.5, size: 0.026, weight: 800, upper: true, tracking: 0.18, font: 'sans', motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.13, y: 0.2, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, tone: 'accent', font: 'sans', motion: { in: 'rise', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.13, y: 0.27, w: 0.76, size: 0.062, weight: 500, tracking: -0.01, motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      { role: 'subline', x: 0.13, y: 0.6, w: 0.66, size: 0.03, weight: 700, upper: true, tracking: 0.1, tone: 'accent', font: 'sans', motion: { in: 'fade', at: 0.8, dur: 0.5 } },
      { role: 'meta', x: 0.13, y: 0.67, w: 0.6, size: META, tone: 'muted', font: 'sans', motion: { in: 'fade', at: 0.95, dur: 0.45 } },
      { role: 'stats', x: 0.13, y: 0.8, w: 0.74, size: 0.028, direction: 'row', align: 'left', max: 3, font: 'sans', motion: { in: 'rise', at: 1.05, dur: 0.5 } },
      { role: 'contact', x: 0.13, y: 0.075, w: 0.8, size: CONTACT, weight: 600, direction: 'row', max: 3, fromBottom: true, font: 'sans', motion: { in: 'fade', at: 1.25, dur: 0.4 } },
    ],
  },
  {
    key: 'coming-soon',
    label: 'Coming Soon',
    desc: 'One promise, a date, and room to breathe',
    mood: 'minimal', scheme: 'dark', font: 'sans',
    surface: { kind: 'spotlight', intensity: 0.42, vignette: 0.36 },
    shapes: [
      { kind: 'ring', cx: 0.5, cy: 0.5, r: 0.34, tone: 'accent', alpha: 0.25, thickness: 0.004 },
    ],
    slots: [
      { role: 'brand', x: 0.1, y: 0.09, w: 0.8, size: 0.026, align: 'center', weight: 800, upper: true, tracking: 0.2, motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.15, y: 0.38, w: 0.7, size: EYEBROW, align: 'center', upper: true, tracking: 0.3, tone: 'accent', motion: { in: 'rise', at: 0.3, dur: 0.5 } },
      { role: 'headline', x: 0.1, y: 0.44, w: 0.8, size: 0.088, weight: 800, align: 'center', tracking: -0.03, upper: true, motion: { in: 'pop', at: 0.45, dur: 0.55 } },
      { role: 'subline', x: 0.15, y: 0.62, w: 0.7, size: 0.03, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.8, dur: 0.5 } },
      { role: 'meta', x: 0.25, y: 0.28, w: 0.5, size: META, align: 'center', treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 1, dur: 0.45 } },
      { role: 'contact', x: 0.1, y: 0.09, w: 0.8, size: CONTACT, weight: 600, tone: 'muted', direction: 'row', max: 3, align: 'center', fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.4 } },
    ],
  },
];export const templateByKey = (key: string): DesignTemplate =>
  DESIGN_TEMPLATES.find(t => t.key === key) ?? DESIGN_TEMPLATES[0];

export const slotOf = (tpl: DesignTemplate, role: SlotRole): SlotSpec | undefined =>
  tpl.slots.find(s => s.role === role);

/**
 * Which list roles a template actually uses.
 *
 * Drives the editor: a template with no services column should not offer a
 * services editor. Showing every field for every template is what turns a
 * design tool into a form.
 */
export function templateListRoles(tpl: DesignTemplate): SlotRole[] {
  const seen = new Set<SlotRole>();
  for (const slot of tpl.slots) if (isListRole(slot.role)) seen.add(slot.role);
  return [...seen];
}
