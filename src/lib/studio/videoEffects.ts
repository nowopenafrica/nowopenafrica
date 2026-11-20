/**
 * Video Studio effects: filters and adjustments, transitions, text
 * animations. Pure numbers only; lib/studio/videoCompositor.ts paints them.
 * Preview, saved frames and every export go through the same painter, so
 * what is seen while editing is what the file contains.
 */

import type {
  ClipEffects, TextAnimIn, TextAnimLoop, TextAnimOut, TextAnimation, Transition, TransitionType,
} from './videoDocument';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const easeOutBack = (x: number) => { const c1 = 1.70158; const c3 = c1 + 1; const t = clamp01(x) - 1; return 1 + c3 * t ** 3 + c1 * t ** 2; };
const easeOutBounce = (x: number) => {
  const n1 = 7.5625; const d1 = 2.75; let t = clamp01(x);
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

// ── filters and adjustments ─────────────────────────────────────────────────

/** Named looks. Each is a starting point; the sliders apply on top. */
export const FILTER_PRESETS: Record<string, { label: string; fx: ClipEffects }> = {
  none: { label: 'Original', fx: {} },
  vivid: { label: 'Vivid', fx: { saturation: 145, contrast: 112 } },
  warm: { label: 'Warm', fx: { sepia: 22, saturation: 115, brightness: 104 } },
  cool: { label: 'Cool', fx: { hue: 190, saturation: 90, sepia: 8, brightness: 102 } },
  golden: { label: 'Golden hour', fx: { sepia: 35, saturation: 130, contrast: 106, brightness: 106 } },
  film: { label: 'Film', fx: { contrast: 92, saturation: 85, sepia: 14, grain: 0.35, vignette: 0.35 } },
  vintage: { label: 'Vintage', fx: { sepia: 55, contrast: 90, brightness: 105, vignette: 0.5, grain: 0.25 } },
  faded: { label: 'Faded', fx: { contrast: 78, brightness: 110, saturation: 80 } },
  dramatic: { label: 'Dramatic', fx: { contrast: 140, saturation: 90, brightness: 92, vignette: 0.55 } },
  mono: { label: 'Mono', fx: { grayscale: 100, contrast: 110 } },
  noir: { label: 'Noir', fx: { grayscale: 100, contrast: 160, brightness: 88, vignette: 0.6 } },
  dreamy: { label: 'Dreamy', fx: { brightness: 112, contrast: 88, saturation: 120, blur: 0.0015 } },
  pop: { label: 'Pop', fx: { saturation: 175, contrast: 125, hue: 8 } },
  night: { label: 'Night', fx: { brightness: 80, hue: 200, saturation: 70, contrast: 115, vignette: 0.45 } },
  negative: { label: 'Negative', fx: { invert: 100 } },
};

/** The preset under the sliders: a slider the person moved wins over the preset's value. */
export function effectiveEffects(fx: ClipEffects | undefined): ClipEffects {
  if (!fx) return {};
  const base = fx.preset && FILTER_PRESETS[fx.preset] ? FILTER_PRESETS[fx.preset].fx : {};
  const own = Object.fromEntries(Object.entries(fx).filter(([k, v]) => k !== 'preset' && v !== undefined));
  return { ...base, ...own };
}

/** A CSS/canvas filter string, or 'none'. `frameWidth` turns the blur fraction into pixels. */
export function cssFilter(fx: ClipEffects | undefined, frameWidth: number, extraBlurPx = 0): string {
  const e = effectiveEffects(fx);
  const parts: string[] = [];
  const pct = (name: string, v: number | undefined, neutral: number) => { if (v !== undefined && v !== neutral) parts.push(`${name}(${Math.round(v)}%)`); };
  pct('brightness', e.brightness, 100);
  pct('contrast', e.contrast, 100);
  pct('saturate', e.saturation, 100);
  pct('grayscale', e.grayscale, 0);
  pct('sepia', e.sepia, 0);
  pct('invert', e.invert, 0);
  if (e.hue) parts.push(`hue-rotate(${Math.round(e.hue)}deg)`);
  const blur = (e.blur ?? 0) * frameWidth + extraBlurPx;
  if (blur > 0.25) parts.push(`blur(${Math.round(blur * 10) / 10}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

// ── transitions ─────────────────────────────────────────────────────────────

export const TRANSITION_LABELS: Record<TransitionType, string> = {
  cut: 'None', fade: 'Fade', slide: 'Slide from right', 'slide-left': 'Slide from left', 'slide-up': 'Slide up', 'slide-down': 'Slide down',
  'zoom-in': 'Zoom in', 'zoom-out': 'Zoom out', spin: 'Spin', 'wipe-left': 'Wipe from left', 'wipe-right': 'Wipe from right',
  'wipe-up': 'Wipe up', 'wipe-down': 'Wipe down', circle: 'Circle reveal', blur: 'Blur', 'dip-black': 'Dip to black', 'dip-white': 'Dip to white', flash: 'Flash',
};

/** What a transition does to a clip at one moment. Neutral = { alpha 1, no offsets, scale 1 }. */
export interface TransitionLook {
  alpha: number;
  /** Fractions of the frame. */
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  /** Fraction of the frame width. */
  blur: number;
  /** Visible part of the clip's own box, as fractions of the box; null = all of it. */
  reveal: null | { kind: 'rect'; x: number; y: number; w: number; h: number } | { kind: 'circle'; r: number };
  /** A colour laid over the clip (dip, flash). */
  overlay: null | { color: string; alpha: number };
}

export const NEUTRAL_LOOK: TransitionLook = { alpha: 1, dx: 0, dy: 0, scale: 1, rotation: 0, blur: 0, reveal: null, overlay: null };

/** One transition at progress p (0 = fully hidden, 1 = settled). `exit` mirrors the direction. */
export function transitionAt(type: TransitionType, p: number, exit = false): TransitionLook {
  const e = easeOut(p);
  const out: TransitionLook = { ...NEUTRAL_LOOK };
  const away = 1 - e;
  const dir = exit ? -1 : 1;
  switch (type) {
    case 'cut': break;
    case 'fade': out.alpha = clamp01(p); break;
    case 'slide': out.dx = away * dir; break;
    case 'slide-left': out.dx = -away * dir; break;
    case 'slide-up': out.dy = away * dir; break;
    case 'slide-down': out.dy = -away * dir; break;
    case 'zoom-in': out.scale = 0.55 + 0.45 * e; out.alpha = clamp01(p * 1.6); break;
    case 'zoom-out': out.scale = 1.6 - 0.6 * e; out.alpha = clamp01(p * 1.6); break;
    case 'spin': out.rotation = away * 180 * dir; out.scale = 0.3 + 0.7 * e; out.alpha = clamp01(p * 2); break;
    case 'wipe-left': out.reveal = { kind: 'rect', x: 0, y: 0, w: e, h: 1 }; break;
    case 'wipe-right': out.reveal = { kind: 'rect', x: 1 - e, y: 0, w: e, h: 1 }; break;
    case 'wipe-up': out.reveal = { kind: 'rect', x: 0, y: 1 - e, w: 1, h: e }; break;
    case 'wipe-down': out.reveal = { kind: 'rect', x: 0, y: 0, w: 1, h: e }; break;
    case 'circle': out.reveal = { kind: 'circle', r: e }; break;
    case 'blur': out.blur = away * 0.03; out.alpha = clamp01(p * 1.5); break;
    case 'dip-black': out.overlay = { color: '#000000', alpha: clamp01(1 - p) }; break;
    case 'dip-white': out.overlay = { color: '#ffffff', alpha: clamp01(1 - p) }; break;
    case 'flash': out.overlay = { color: '#ffffff', alpha: clamp01((1 - p) ** 2) }; out.alpha = clamp01(p * 3); break;
  }
  return out;
}

/** Combine two looks (entrance and exit can overlap on a very short clip). */
export function combineLooks(a: TransitionLook, b: TransitionLook): TransitionLook {
  return {
    alpha: a.alpha * b.alpha,
    dx: a.dx + b.dx,
    dy: a.dy + b.dy,
    scale: a.scale * b.scale,
    rotation: a.rotation + b.rotation,
    blur: a.blur + b.blur,
    reveal: a.reveal ?? b.reveal,
    overlay: a.overlay && b.overlay ? (a.overlay.alpha >= b.overlay.alpha ? a.overlay : b.overlay) : a.overlay ?? b.overlay,
  };
}

/** A clip's transitions at `localMs` into it. */
export function clipTransitionLook(clip: { durationMs: number; transitionIn?: Transition; transitionOut?: Transition }, localMs: number): TransitionLook {
  let look = NEUTRAL_LOOK;
  const tin = clip.transitionIn;
  if (tin && tin.type !== 'cut' && tin.ms > 0 && localMs < tin.ms) look = transitionAt(tin.type, localMs / tin.ms);
  const tout = clip.transitionOut;
  const left = clip.durationMs - localMs;
  if (tout && tout.type !== 'cut' && tout.ms > 0 && left < tout.ms) look = combineLooks(look, transitionAt(tout.type, left / tout.ms, true));
  return look;
}

// ── text animation ──────────────────────────────────────────────────────────

export const TEXT_IN_LABELS: Record<TextAnimIn, string> = {
  none: 'None', fade: 'Fade in', typewriter: 'Typewriter', pop: 'Pop', rise: 'Rise', drop: 'Drop', 'slide-left': 'Slide from left',
  'slide-right': 'Slide from right', zoom: 'Zoom', 'blur-in': 'Blur in', 'letters-fade': 'Letter by letter', 'letters-rise': 'Letters rise',
  bounce: 'Bounce', wave: 'Wave', flip: 'Flip',
};
export const TEXT_OUT_LABELS: Record<TextAnimOut, string> = {
  none: 'None', fade: 'Fade out', shrink: 'Shrink', sink: 'Sink', lift: 'Lift away', 'slide-left': 'Slide left', 'slide-right': 'Slide right',
  'blur-out': 'Blur out', 'letters-fade': 'Letters fade', 'typewriter-erase': 'Erase',
};
export const TEXT_LOOP_LABELS: Record<TextAnimLoop, string> = {
  none: 'None', pulse: 'Pulse', float: 'Float', shake: 'Shake', flicker: 'Flicker', wiggle: 'Wiggle', glow: 'Glow',
};

/** How the whole block of words looks at a moment. Offsets are fractions of the type size. */
export interface TextBlockLook {
  alpha: number;
  dx: number;
  dy: number;
  scale: number;
  /** Degrees. */
  rotation: number;
  /** Horizontal squash for a flip, 0..1. */
  scaleX: number;
  /** Fraction of the type size. */
  blur: number;
  /** 0..1 extra glow. */
  glow: number;
}

/** How one character looks, for animations that move letters separately. */
export interface CharLook { alpha: number; dy: number; scale: number }

export interface TextAnimFrame {
  block: TextBlockLook;
  /** How many characters show (typewriter); Infinity = all. */
  visibleChars: number;
  /** Set when letters animate separately. */
  perChar: ((index: number, count: number) => CharLook) | null;
}

const BLOCK: TextBlockLook = { alpha: 1, dx: 0, dy: 0, scale: 1, rotation: 0, scaleX: 1, blur: 0, glow: 0 };

/** Letters start one after another across the first 60% of the animation. */
function stagger(p: number, i: number, n: number): number {
  const spread = 0.6;
  const start = n <= 1 ? 0 : (i / (n - 1)) * spread;
  return clamp01((p - start) / (1 - spread));
}

export function textAnimAt(anim: TextAnimation | undefined, durationMs: number, localMs: number, charCount: number): TextAnimFrame {
  const block = { ...BLOCK };
  let visibleChars = Infinity;
  let perChar: TextAnimFrame['perChar'] = null;

  const tin = anim?.in;
  if (tin && tin.type !== 'none' && tin.ms > 0 && localMs < tin.ms) {
    const p = clamp01(localMs / tin.ms);
    const e = easeOut(p);
    switch (tin.type) {
      case 'fade': block.alpha *= p; break;
      case 'typewriter': visibleChars = Math.floor(p * charCount); break;
      case 'pop': block.scale *= Math.max(0, easeOutBack(p)); block.alpha *= clamp01(p * 3); break;
      case 'rise': block.dy += (1 - e) * 1.2; block.alpha *= p; break;
      case 'drop': block.dy -= (1 - e) * 1.2; block.alpha *= p; break;
      case 'slide-left': block.dx -= (1 - e) * 6; block.alpha *= clamp01(p * 2); break;
      case 'slide-right': block.dx += (1 - e) * 6; block.alpha *= clamp01(p * 2); break;
      case 'zoom': block.scale *= 2.2 - 1.2 * e; block.alpha *= p; break;
      case 'blur-in': block.blur += (1 - e) * 0.6; block.alpha *= p; break;
      case 'bounce': block.dy -= (1 - easeOutBounce(p)) * 2.5; break;
      case 'flip': block.scaleX *= Math.abs(Math.cos((1 - e) * Math.PI / 2)); block.alpha *= clamp01(p * 2); break;
      case 'letters-fade': perChar = (i, n) => ({ alpha: stagger(p, i, n), dy: 0, scale: 1 }); break;
      case 'letters-rise': perChar = (i, n) => { const q = stagger(p, i, n); return { alpha: q, dy: (1 - easeOut(q)) * 0.8, scale: 1 }; }; break;
      case 'wave': perChar = (i, n) => { const q = stagger(p, i, n); return { alpha: clamp01(q * 2), dy: -Math.sin(q * Math.PI) * 0.5, scale: 1 }; }; break;
    }
  }

  const tout = anim?.out;
  const left = durationMs - localMs;
  if (tout && tout.type !== 'none' && tout.ms > 0 && left < tout.ms) {
    const p = clamp01(left / tout.ms);
    const e = easeOut(p);
    switch (tout.type) {
      case 'fade': block.alpha *= p; break;
      case 'shrink': block.scale *= 0.2 + 0.8 * e; block.alpha *= p; break;
      case 'sink': block.dy += (1 - e) * 1.2; block.alpha *= p; break;
      case 'lift': block.dy -= (1 - e) * 1.2; block.alpha *= p; break;
      case 'slide-left': block.dx -= (1 - e) * 6; block.alpha *= clamp01(p * 2); break;
      case 'slide-right': block.dx += (1 - e) * 6; block.alpha *= clamp01(p * 2); break;
      case 'blur-out': block.blur += (1 - e) * 0.6; block.alpha *= p; break;
      case 'typewriter-erase': visibleChars = Math.min(visibleChars, Math.floor(p * charCount)); break;
      case 'letters-fade': { const prev = perChar; perChar = (i, n) => { const base = prev ? prev(i, n) : { alpha: 1, dy: 0, scale: 1 }; return { ...base, alpha: base.alpha * stagger(p, n - 1 - i, n) }; }; break; }
    }
  }

  const t = localMs / 1000;
  switch (anim?.loop) {
    case 'pulse': block.scale *= 1 + 0.05 * Math.sin(t * Math.PI * 2); break;
    case 'float': block.dy += 0.12 * Math.sin(t * Math.PI); break;
    case 'shake': block.dx += 0.06 * Math.sin(t * 47) ; block.dy += 0.04 * Math.sin(t * 61); break;
    case 'flicker': block.alpha *= 0.75 + 0.25 * (Math.sin(t * 31) > -0.6 ? 1 : 0.2); break;
    case 'wiggle': block.rotation += 4 * Math.sin(t * Math.PI * 3); break;
    case 'glow': block.glow = 0.5 + 0.5 * Math.sin(t * Math.PI * 2); break;
  }
  return { block, visibleChars, perChar };
}
