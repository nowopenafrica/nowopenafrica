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

export type SlotRole = 'brand' | 'eyebrow' | 'headline' | 'subline' | 'meta' | 'cta' | 'qr';

/** How a slot arrives. Named for the visual, not the CSS. */
export type MotionIn = 'fade' | 'rise' | 'drop' | 'wipe' | 'pop' | 'blur';

export type Mood = 'editorial' | 'bold' | 'minimal' | 'luxe' | 'street' | 'warm';

export type Treatment = 'plain' | 'pill' | 'panel' | 'underline' | 'outline' | 'bar';

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
}

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

// --- the catalogue -----------------------------------------------------------
//
// Type steps are named so a template reads as a design decision rather than a
// wall of magic numbers, and so the scale stays consistent between templates.

const HEAD = 0.092;
const HEAD_HERO = 0.115;
const SUB = 0.036;
const EYEBROW = 0.024;
const META = 0.022;

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
];

export const templateByKey = (key: string): DesignTemplate =>
  DESIGN_TEMPLATES.find(t => t.key === key) ?? DESIGN_TEMPLATES[0];

export const slotOf = (tpl: DesignTemplate, role: SlotRole): SlotSpec | undefined =>
  tpl.slots.find(s => s.role === role);
