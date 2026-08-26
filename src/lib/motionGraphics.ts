// Motion Graphics Studio — the motion scene builder.
//
// The render engine (lib/renderVideo.ts) films a storyboard of DirectorScene
// title cards onto a canvas: gradient/backdrop, a big headline, an accent
// underline, the brand lockup, a voiceover strip and a call-to-action end
// card. That IS motion graphics — it just needed motion-shaped inputs.
//
// This module turns a motion job (logo reveal, motion poster, kinetic type,
// countdown, billboard LED, Apple TV key art, glassmorphic, isometric 3D, …)
// into those scenes. Pure, so every mapping is unit-testable:
// the same config always builds the same storyboard, and the render then
// films it the same way every time.

import type { DirectorScene, SceneTextElement, TextElementStyle } from './creativeDirector';
import type { RenderAspect } from './renderVideo';

export type MotionStyle =
  | 'logo-reveal'
  | 'motion-poster'
  | 'kinetic-type'
  | 'lower-third'
  | 'countdown'
  | 'badge'
  | 'reveal-title'
  | 'billboard-led'
  | 'premium-keyart'
  | 'glassmorphic'
  | 'isometric-3d';

export type MotionDuration = 'short' | 'medium' | 'long' | 'extended' | 'cinematic';

export interface MotionConfig {
  business: string;
  headline: string;
  subhead: string;
  cta: string;
  logoEmoji: string;
  aspect: RenderAspect;
  duration: MotionDuration;
  style: MotionStyle;

  // --- flyer content ---------------------------------------------------------
  //
  // Used by the business-flyer design templates (services list, proof-point
  // row, contact strip). Optional so every project saved before these existed
  // still loads: a template that wants a list and finds none simply draws no
  // rows rather than failing to render.
  /** Offer list — "Brand Design", "SEO & Content", … */
  services?: string[];
  /** Proof points: a number and what it counts. */
  stats?: { value: string; label: string }[];
  /** Contact strip — phone, email, website, in display order. */
  contact?: string[];
}

/** Seconds per card scene for the chosen pacing. */
export const MOTION_SECONDS: Record<MotionDuration, number> = {
  short: 2,
  medium: 3,
  long: 4,
  extended: 5,
  cinematic: 6,
};

const CAMERAS = ['Punch-in zoom', 'Slow push-in', 'Tracking shot', 'Rack focus', 'Static tripod'];
const MOTIONS = ['Energetic', 'Steady', 'Gentle', 'Hold'];

/** How many cards each job type produces for its arc. */
export const MOTION_SCENE_COUNTS: Record<MotionStyle, number> = {
  'logo-reveal': 3,
  'motion-poster': 3,
  'kinetic-type': 4,
  'lower-third': 2,
  countdown: 4,
  badge: 2,
  'reveal-title': 2,
  'billboard-led': 4,
  'premium-keyart': 3,
  glassmorphic: 3,
  'isometric-3d': 4,
};

function card(i: number, text: string, voiceover: string, seconds: number, total: number): DirectorScene {
  return {
    id: `motion-${i}`,
    order: i,
    seconds: Math.max(1, Math.round(seconds)),
    text,
    direction: voiceover,
    camera: CAMERAS[i % CAMERAS.length],
    voiceover,
    // The final card holds so the call to action reads; earlier cards blend.
    transition: i === total - 1 ? 'cut' : 'fade',
    grading: 'Warm daylight',
    motion: MOTIONS[i % MOTIONS.length],
  };
}

/** Kinetic type always fills its full 4-beat arc: the headline's own words, padded from a fallback pool. */
function kineticWords(headline: string): string[] {
  const words = headline.trim().split(/\s+/).filter((w) => w.length > 0);
  const out = [...words];
  if (out.length < 4) {
    for (const w of KINETIC_POOL) {
      if (out.length >= 4) break;
      if (!out.includes(w)) out.push(w);
    }
  }
  return out.slice(0, 4);
}

const KINETIC_POOL = ['Make', 'it', 'local', 'today'];

/**
 * The storyboard for a motion job. Scene count and card text follow the job
 * type (MOTION_SCENE_COUNTS); pacing comes from `duration`.
 */
export function motionScenesFromJob(cfg: MotionConfig): DirectorScene[] {
  const seconds = MOTION_SECONDS[cfg.duration];
  const total = MOTION_SCENE_COUNTS[cfg.style];
  const lines: { text: string; vo: string }[] = [];

  switch (cfg.style) {
    case 'logo-reveal':
      lines.push({ text: `${cfg.logoEmoji} ${cfg.business.toUpperCase()}`, vo: 'A NowOpen business' });
      lines.push({ text: cfg.headline, vo: cfg.subhead });
      lines.push({ text: 'OPEN NOW', vo: cfg.cta });
      break;
    case 'motion-poster':
      lines.push({ text: cfg.headline, vo: cfg.subhead });
      lines.push({ text: cfg.subhead, vo: cfg.headline });
      lines.push({ text: 'SAVE YOUR SPOT', vo: cfg.cta });
      break;
    case 'kinetic-type':
      kineticWords(cfg.headline).forEach((w, i) => {
        lines.push({ text: w.toUpperCase(), vo: i === 0 ? cfg.subhead : cfg.cta });
      });
      break;
    case 'lower-third':
      lines.push({ text: cfg.business.toUpperCase(), vo: cfg.headline });
      lines.push({ text: cfg.headline, vo: cfg.subhead });
      break;
    case 'countdown':
      lines.push({ text: '3', vo: 'Get ready' });
      lines.push({ text: '2', vo: 'Almost there' });
      lines.push({ text: '1', vo: 'Final call' });
      lines.push({ text: 'GO!', vo: cfg.cta });
      break;
    case 'badge':
      lines.push({ text: cfg.headline, vo: cfg.subhead });
      lines.push({ text: `${cfg.logoEmoji} ${cfg.business.toUpperCase()}`, vo: cfg.cta });
      break;
    case 'reveal-title':
      lines.push({ text: cfg.headline, vo: cfg.subhead });
      lines.push({ text: cfg.business.toUpperCase(), vo: cfg.cta });
      break;
    case 'billboard-led':
      lines.push({ text: cfg.headline, vo: cfg.business });
      lines.push({ text: cfg.subhead, vo: 'Open for business' });
      lines.push({ text: cfg.business.toUpperCase(), vo: cfg.headline });
      lines.push({ text: 'ACT NOW', vo: cfg.cta });
      break;
    case 'premium-keyart':
      lines.push({ text: cfg.headline, vo: cfg.subhead });
      lines.push({ text: cfg.business.toUpperCase(), vo: cfg.headline });
      lines.push({ text: 'OPEN NOW', vo: cfg.cta });
      break;
    case 'glassmorphic':
      lines.push({ text: cfg.headline, vo: cfg.subhead });
      lines.push({ text: cfg.subhead, vo: cfg.business });
      lines.push({ text: `${cfg.logoEmoji} ${cfg.business.toUpperCase()}`, vo: cfg.cta });
      break;
    case 'isometric-3d':
      lines.push({ text: cfg.headline, vo: cfg.subhead });
      lines.push({ text: cfg.subhead, vo: cfg.headline });
      lines.push({ text: cfg.business.toUpperCase(), vo: cfg.cta });
      lines.push({ text: 'SHOP NOW', vo: cfg.cta });
      break;
  }

  // Guard every card so an empty field never films a blank frame — the brand
  // name is the ultimate fallback.
  const fallback = cfg.business.trim() || 'NowOpen';
  return lines.slice(0, total).map((l, i) => card(i, l.text.trim() || fallback, l.vo.trim() || fallback, seconds, total));
}

export function motionTotalSeconds(cfg: MotionConfig): number {
  return motionScenesFromJob(cfg).reduce((s, x) => s + x.seconds, 0);
}

// ---------------------------------------------------------------------------
// Editor timeline — a project-level overlay on the generated storyboard.
//
// The brief always produces a base DirectorScene[] (motionScenesFromJob). The
// editor overlays a MotionTimeline on top of it so users can reorder, trim,
// split, duplicate and remove clips without rewriting the brief. It is stored
// on the MotionProject (persisted) and merged in via applyMotionTimeline —
// the base scenes stay the source of truth, so a stale timeline (e.g. after a
// style change that renames scene ids) degrades gracefully instead of breaking.
// ---------------------------------------------------------------------------

export interface MotionTimeline {
  /** Ordered clip ids — the timeline order (base scene ids + custom ids). */
  order: string[];
  /** Trimmed durations in seconds, keyed by clip id (base or custom). */
  seconds: Record<string, number>;
  /** Clips created by the editor (split / duplicate) that are not in the brief. */
  custom: Record<string, DirectorScene>;
  /** Base scene ids the user deleted — kept out of the timeline even after the brief regenerates them. */
  removed: string[];
  /**
   * Per-clip caption element overrides (move / hide / restyle / reword), keyed
   * by clip id. Merged onto the drawn scene by applyMotionTimeline so a stale
   * id (after a style change) is simply ignored.
   */
  elements?: Record<string, Partial<Record<SceneTextElement, TextElementStyle>>>;
}

export function emptyMotionTimeline(scenes: DirectorScene[]): MotionTimeline {
  return { order: scenes.map((s) => s.id), seconds: {}, custom: {}, removed: [] };
}

export const CLIP_SECONDS_MIN = 1;
export const CLIP_SECONDS_MAX = 12;

export function clampClipSeconds(n: number): number {
  return Math.max(CLIP_SECONDS_MIN, Math.min(CLIP_SECONDS_MAX, Math.round(n * 10) / 10));
}

/** Merge the timeline overlay into the generated storyboard. */
export function applyMotionTimeline(
  scenes: DirectorScene[],
  timeline: MotionTimeline | null | undefined,
): DirectorScene[] {
  if (!timeline || !Array.isArray(timeline.order) || timeline.order.length === 0) return scenes;
  const order = timeline.order;
  const seconds = timeline.seconds ?? {};
  const custom = timeline.custom ?? {};
  const removed = timeline.removed ?? [];
  const baseById = new Map(scenes.map((s) => [s.id, s]));
  const elementOverrides = timeline.elements ?? {};
  const mergeElements = (
    base?: Partial<Record<SceneTextElement, TextElementStyle>>,
    overrides?: Partial<Record<SceneTextElement, TextElementStyle>>,
  ): Partial<Record<SceneTextElement, TextElementStyle>> | undefined => {
    if (!overrides) return base;
    const merged: Partial<Record<SceneTextElement, TextElementStyle>> = { ...(base ?? {}) };
    (Object.keys(overrides) as SceneTextElement[]).forEach((k) => {
      merged[k] = { ...merged[k], ...overrides[k] };
    });
    return merged;
  };
  const placed = new Set<string>();
  const out: DirectorScene[] = [];
  const push = (id: string) => {
    if (removed.includes(id)) return;
    const src = custom[id] ?? baseById.get(id);
    if (!src) return;
    placed.add(id);
    const clipSeconds = seconds[id] != null ? clampClipSeconds(seconds[id]) : src.seconds;
    out.push({ ...src, order: out.length, seconds: clipSeconds, elements: mergeElements(src.elements, elementOverrides[id]) });
  };
  for (const id of order) push(id);
  // Anything the brief grew that the timeline does not mention appends at the
  // end (e.g. after a style change) instead of vanishing.
  for (const s of scenes) if (!placed.has(s.id)) push(s.id);
  return out;
}

function nextClipId(prefix: string, tl: MotionTimeline): string {
  let n = Object.keys(tl.custom).length + 1;
  let id = `${prefix}-${n}`;
  while (tl.order.includes(id)) {
    n += 1;
    id = `${prefix}-${n}`;
  }
  return id;
}

export function timelineMoveClip(tl: MotionTimeline, id: string, toIndex: number): MotionTimeline {
  if (!tl.order.includes(id)) return tl;
  const order = tl.order.filter((x) => x !== id);
  order.splice(Math.max(0, Math.min(order.length, toIndex)), 0, id);
  return { ...tl, order };
}

export function timelineSetSeconds(tl: MotionTimeline, id: string, seconds: number): MotionTimeline {
  return { ...tl, seconds: { ...tl.seconds, [id]: clampClipSeconds(seconds) } };
}

export function timelineResetSeconds(tl: MotionTimeline, id: string): MotionTimeline {
  if (tl.seconds[id] == null) return tl;
  const seconds = { ...tl.seconds };
  delete seconds[id];
  return { ...tl, seconds };
}

/** Override one caption element of a clip (text, font, weight, size, colour, position, visibility). */
export function timelineSetElement(
  tl: MotionTimeline,
  id: string,
  key: SceneTextElement,
  patch: Partial<TextElementStyle>,
): MotionTimeline {
  const elements = { ...(tl.elements ?? {}) };
  const current = elements[id] ?? {};
  elements[id] = { ...current, [key]: { ...current[key], ...patch } };
  return { ...tl, elements };
}

/** Drop every override for one caption element of a clip (back to the designed look). */
export function timelineResetElement(
  tl: MotionTimeline,
  id: string,
  key: SceneTextElement,
): MotionTimeline {
  const elements = { ...(tl.elements ?? {}) };
  const current = { ...(elements[id] ?? {}) };
  delete current[key];
  if (Object.keys(current).length === 0) delete elements[id];
  else elements[id] = current;
  return { ...tl, elements };
}

/** Append a brand-new clip to the end of the timeline, cloned from `base`. */
export function timelineAppendClip(tl: MotionTimeline, base: DirectorScene): MotionTimeline {
  const newId = nextClipId('clip', tl);
  const order = [...tl.order, newId];
  const custom = { ...tl.custom, [newId]: { ...base, id: newId, order: tl.order.length, transition: 'fade' } };
  return { ...tl, order, custom, seconds: { ...tl.seconds, [newId]: clampClipSeconds(base.seconds) } };
}

export function timelineDuplicate(scenes: DirectorScene[], tl: MotionTimeline, id: string): MotionTimeline {
  const src = tl.custom[id] ?? scenes.find((s) => s.id === id);
  if (!src) return tl;
  const newId = nextClipId(`${id}:copy`, tl);
  const idx = tl.order.indexOf(id);
  const order = [...tl.order];
  order.splice(idx + 1, 0, newId);
  const custom = { ...tl.custom, [newId]: { ...src, id: newId, transition: 'fade' } };
  const seconds = { ...tl.seconds, [newId]: tl.seconds[id] };
  return { ...tl, order, custom, seconds };
}

/** Split a clip at `atSeconds` — the first half keeps the id, a new clip holds the rest. */
export function timelineSplit(scenes: DirectorScene[], tl: MotionTimeline, id: string, atSeconds: number): MotionTimeline {
  const src = tl.custom[id] ?? scenes.find((s) => s.id === id);
  if (!src) return tl;
  const total = tl.seconds[id] != null ? clampClipSeconds(tl.seconds[id]) : src.seconds;
  const cut = clampClipSeconds(atSeconds);
  if (cut <= 0 || cut >= total) return tl;
  const newId = nextClipId(`${id}:split`, tl);
  const idx = tl.order.indexOf(id);
  const order = [...tl.order];
  order.splice(idx + 1, 0, newId);
  const custom = { ...tl.custom, [newId]: { ...src, id: newId, text: `${src.text} · continued`, transition: 'fade' } };
  const seconds = { ...tl.seconds, [id]: cut, [newId]: Math.round((total - cut) * 10) / 10 };
  return { ...tl, order, custom, seconds };
}

export function timelineRemove(tl: MotionTimeline, id: string): MotionTimeline {
  if (!tl.order.includes(id)) return tl;
  const order = tl.order.filter((x) => x !== id);
  const custom = { ...tl.custom };
  delete custom[id];
  const seconds = { ...tl.seconds };
  delete seconds[id];
  const elements = { ...(tl.elements ?? {}) };
  delete elements[id];
  const removed = [...tl.removed];
  if (!removed.includes(id)) removed.push(id);
  return { ...tl, order, custom, seconds, removed, elements };
}
