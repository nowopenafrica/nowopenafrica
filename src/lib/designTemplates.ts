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
 * Background layers, listed bottom-up.
 *
 * A list rather than one flattened string so a caller can slot uploaded media
 * between them: photo underneath, surface tint over it, vignette on top. One
 * combined background would force the media either behind everything or in
 * front of everything, and neither reads well behind text.
 */
export function surfaceLayers(tpl: DesignTemplate, accent: string, base: string): string[] {
  const s = tpl.surface;
  const k = s.intensity ?? 0.5;
  const layers: string[] = [];

  switch (s.kind) {
    case 'solid':
    case 'frame':
      layers.push(`linear-gradient(0deg, ${hexAlpha(base, 0.92)}, ${hexAlpha(base, 0.92)})`);
      break;
    case 'spotlight':
      layers.push(`radial-gradient(120% 90% at 50% 12%, ${hexAlpha(accent, k)} 0%, ${hexAlpha(base, 0.94)} 68%)`);
      break;
    case 'wash':
      layers.push(`linear-gradient(${(s.angle ?? 180) + 90}deg, ${hexAlpha(accent, k * 0.6)} 0%, transparent 70%)`);
      layers.push(`linear-gradient(${s.angle ?? 180}deg, ${hexAlpha(base, 0.2)} 0%, ${hexAlpha(base, 0.94)} 100%)`);
      break;
    case 'gradient':
    default:
      layers.push(`linear-gradient(${s.angle ?? 160}deg, ${hexAlpha(accent, k)} 0%, ${hexAlpha(base, 0.95)} 72%)`);
      break;
  }

  if (s.vignette) {
    layers.push(`radial-gradient(115% 115% at 50% 45%, transparent 42%, ${hexAlpha('#000000', s.vignette)} 100%)`);
  }
  return layers;
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
    mood: 'editorial', scheme: 'dark',
    surface: { kind: 'wash', angle: 200, intensity: 0.4, vignette: 0.3 },
    slots: [
      { role: 'brand', x: 0.08, y: 0.09, w: 0.5, size: 0.05, motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.08, y: 0.2, w: 0.5, size: EYEBROW, upper: true, tracking: 0.22, treatment: 'bar', tone: 'accent', motion: { in: 'wipe', at: 0.3, dur: 0.6 } },
      { role: 'headline', x: 0.08, y: 0.44, w: 0.84, size: HEAD, weight: 800, tracking: -0.02, motion: { in: 'rise', at: 0.5, dur: 0.7 } },
      { role: 'subline', x: 0.08, y: 0.68, w: 0.7, size: SUB, tone: 'muted', motion: { in: 'rise', at: 0.85, dur: 0.6 } },
      { role: 'meta', x: 0.08, y: 0.14, w: 0.6, size: META, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1.05, dur: 0.5 } },
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
    mood: 'luxe', scheme: 'light',
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
    mood: 'street', scheme: 'dark',
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
    mood: 'minimal', scheme: 'light',
    surface: { kind: 'solid' },
    slots: [
      { role: 'brand', x: 0.12, y: 0.12, w: 0.4, size: 0.04, motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.12, y: 0.24, w: 0.5, size: 0.021, upper: true, tracking: 0.28, tone: 'accent', motion: { in: 'wipe', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.12, y: 0.34, w: 0.68, size: 0.086, weight: 700, tracking: -0.02, treatment: 'underline', motion: { in: 'rise', at: 0.3, dur: 0.7 } },
      { role: 'subline', x: 0.12, y: 0.56, w: 0.56, size: 0.031, tone: 'muted', motion: { in: 'rise', at: 0.75, dur: 0.6 } },
      { role: 'meta', x: 0.12, y: 0.12, w: 0.6, size: 0.02, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1.0, dur: 0.5 } },
    ],
  },
];

export const templateByKey = (key: string): DesignTemplate =>
  DESIGN_TEMPLATES.find(t => t.key === key) ?? DESIGN_TEMPLATES[0];

export const slotOf = (tpl: DesignTemplate, role: SlotRole): SlotSpec | undefined =>
  tpl.slots.find(s => s.role === role);
