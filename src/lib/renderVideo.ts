// NowOpen Studio — real render pipeline.
//
// Replaces the simulated "the generator produced a video" step with an actual
// in-browser renderer: the storyboard scenes are painted to a <canvas> and
// captured with MediaRecorder, producing a real, playable, downloadable video
// file (WebM or MP4) plus poster and contact-sheet PNGs. Everything is
// deterministic (seeded from the business + direction + scene + treatment) so
// the same brief always renders the same way. When the render is filming real
// footage, the clips' audio rides along (routed through a shared AudioContext
// into the capture stream), so the export is no longer silent.
//
// A scene carries a visual treatment on top of the shared layout: `default`
// (flat gradient look), `led` (billboard scanlines + neon), `premium`
// (Apple-TV key art), `glass` (frosted panels) or `3d` (parallax depth). The
// layout itself lives in one place — `sceneLayout` — so `sceneElementRegions`
// (normalised click targets used by the editable live preview) always hit-test
// exactly what `drawOverlay` paints. Session-local user-uploaded `layers`
// (images/videos, never persisted) stack bottom-to-top in place of the designed
// gradient in the preview and every export; they step aside for AI footage or
// key art when those cover a scene.
//
// The module keeps all pure planning math separate from the DOM work so it can
// be unit-tested in jsdom: `renderSeed`, `sceneRenderPlan`, `buildRenderTimeline`
// and `pickRenderMime` are pure; `drawSceneFrame`, `renderPoster`,
// `renderContactSheet` and `renderVideo` touch the canvas/MediaRecorder and are
// guarded so importing the module never needs a real browser.

import type { DirectorScene, SceneTextElement } from './creativeDirector';
import type { StockClip } from './stockFootage';
import { hashString, mulberry32 } from './videoCreator';

export type RenderAspect = 'Square' | 'Vertical' | 'Landscape';

/**
 * Visual treatment applied to a scene on top of the shared layout: backdrop
 * ambience (grids, scanlines, spotlight, floating shapes) plus typography
 * flair. Motion Studio maps its styles onto these; every other caller stays on
 * the default look.
 */
export type MotionTreatment = 'default' | 'led' | 'premium' | 'glass' | '3d';

export interface RenderDimensions {
  width: number;
  height: number;
}

export const RENDER_DIMENSIONS: Record<RenderAspect, RenderDimensions> = {
  Square: { width: 1080, height: 1080 },
  Vertical: { width: 1080, height: 1920 },
  Landscape: { width: 1920, height: 1080 },
};

export const RENDER_FPS = 30;

export interface RenderOptions {
  businessName: string;
  directionLabel: string;
  grade?: string;
  hook?: string;
  cta?: string;
  aspect: RenderAspect;
  fps?: number;
  logoEmoji?: string;
  /**
   * Force the motion-graphics palette for every scene. When unset each scene
   * picks one deterministically from its seed, so the same brief always films
   * the same way — but a motion studio that wants a chosen brand look can pin
   * it here.
   */
  palette?: [string, string, string];
  /**
   * Real stock footage per scene index (from stockFootage.resolveFootage).
   * When set, `drawFootageFrame`/`renderVideo` film the scene with the clip
   * (Ken Burns + film grade) under the caption overlay.
   */
  footage?: Record<number, StockClip>;
  /** Only needed to opt OUT: set false to ignore `footage` and use graphics. */
  footageEnabled?: boolean;
  /**
   * Real AI-generated key art per scene index (object/data URLs from
   * pollinations.fetchAiImage or aiKeyArt.generateKeyArt). When set, scenes
   * with a ready image are filmed over it (Ken Burns + film grade) instead of
   * the gradient — unless real footage wins by priority in drawTimelineFrame.
   */
  aiImages?: (string | null)[];
  /**
   * Style treatment for the renderer. When unset every scene keeps the default
   * flat look; Motion Studio sets it from the chosen motion style so a billboard
   * LED brief actually films like a billboard.
   */
  treatment?: MotionTreatment;
  /**
   * User-uploaded layers for the live preview and every export (video, poster,
   * contact sheet, still). Session-local only: they ride on the in-memory options,
   * are never persisted to a project or the database, and are drawn in place of the
   * designed gradient whenever no AI footage or key art covers a scene. Layer 0 is
   * the base (full-bleed cover); extra layers stack on top at their own opacity,
   * always under the caption overlay. The preloaded elements live in the caller;
   * the renderer never owns them.
   */
  layers?: MotionLayer[] | null;
}

/**
 * An uploaded image or video used to compose the film. Layer 0 acts as the base
 * backdrop (or steps aside for AI footage/key art); further layers composite on
 * top of it at `opacity` (0..1), under the captions. Object URLs only — the
 * renderer never persists or clones ownership beyond its own export film.
 */
export interface MotionLayer {
  kind: 'image' | 'video';
  url: string;
  /** 0..1 composite opacity; 1 for the base layer. */
  opacity?: number;
  name?: string;
  image?: HTMLImageElement | null;
  video?: HTMLVideoElement | null;
}

export type RenderTransition = 'cut' | 'fade';

export interface SceneRenderPlan {
  /** Numeric hash from renderSeed(); feeds mulberry32 and the film-grain RNG. */
  seed: number;
  gradient: [string, string, string];
  zoomIn: number;
  zoomOut: number;
  textColor: string;
  accentColor: string;
  drift: number;
  transition: RenderTransition;
  transitionFrames: number;
  endCard: boolean;
  /** The style treatment this scene was planned with (seeds the look). */
  treatment: MotionTreatment;
}

export interface RenderSceneTiming {
  index: number;
  frames: number;
  seconds: number;
  startFrame: number;
  endFrame: number;
}

export interface RenderTimeline {
  fps: number;
  totalFrames: number;
  totalSeconds: number;
  scenes: RenderSceneTiming[];
}

// --- Pure planning math ------------------------------------------------------

export function renderSeed(...parts: (string | number)[]): number {
  return hashString(parts.map((p) => String(p)).join('|'));
}

const PALETTES: [string, string, string][] = [
  // NowOpen Africa signature: deep violet → purple → blue (#9333ea → #2563eb).
  ['#2e1065', '#9333ea', '#2563eb'],
  ['#0f172a', '#7c3aed', '#ec4899'],
  ['#1e1b4b', '#4f46e5', '#22d3ee'],
  ['#0c4a6e', '#0891b2', '#f59e0b'],
  ['#111827', '#b45309', '#f59e0b'],
  ['#3b0764', '#a21caf', '#f472b6'],
  ['#022c22', '#047857', '#fbbf24'],
  ['#450a0a', '#dc2626', '#fbbf24'],
  ['#082f49', '#0284c7', '#38bdf8'],
  ['#18181b', '#a16207', '#fde047'],
  ['#312e81', '#0ea5e9', '#a3e635'],
];

/** The selectable brand palettes (dark base, accent, highlight) exposed to the
 *  Motion Graphics Studio. Backed by the same list sceneRenderPlan draws from
 *  when no explicit palette is given. */
export const RENDER_PALETTES: [string, string, string][] = PALETTES;

export function sceneRenderPlan(opts: RenderOptions, scene: DirectorScene, index: number): SceneRenderPlan {
  const fps = opts.fps ?? RENDER_FPS;
  const treatment = opts.treatment ?? 'default';
  // The treatment is part of the seed so switching style genuinely re-plans
  // the scene (palette pick, grain, drift) instead of only re-skinning it.
  const seed = renderSeed(opts.businessName, opts.directionLabel, index, scene.text, treatment);
  const rng = mulberry32(seed);
  const palette = opts.palette ?? PALETTES[Math.floor(rng() * PALETTES.length)];

  const lower = scene.transition.toLowerCase();
  const transition: RenderTransition = lower.includes('fade') ? 'fade' : 'cut';
  const transitionFrames = transition === 'fade' ? Math.round(fps * 0.5) : 0;

  // Opening scenes open wide then push in; later scenes drift and breathe.
  const zoomIn = index === 0 ? 1.06 : index % 2 === 0 ? 1.0 : 1.03;
  const zoomOut = index === 0 ? 1.0 : index % 2 === 0 ? 1.03 : 1.0;
  const drift = index % 2 === 0 ? 0 : Math.round(24 * rng() + 12);

  return {
    seed,
    gradient: palette,
    zoomIn,
    zoomOut,
    textColor: '#ffffff',
    accentColor: palette[2],
    drift,
    transition,
    transitionFrames,
    endCard: false,
    treatment,
  };
}

export function buildRenderTimeline(scenes: Pick<DirectorScene, 'seconds' | 'text' | 'transition'>[], opts: RenderOptions): RenderTimeline {
  const fps = opts.fps ?? RENDER_FPS;
  const timings: RenderSceneTiming[] = [];
  let acc = 0;
  scenes.forEach((scene, index) => {
    const frames = Math.max(fps, Math.round(scene.seconds * fps));
    timings.push({
      index,
      frames,
      seconds: frames / fps,
      startFrame: acc,
      endFrame: acc + frames,
    });
    acc += frames;
  });
  return { fps, totalFrames: acc, totalSeconds: acc / fps, scenes: timings };
}

export function renderTotalSeconds(scenes: Pick<DirectorScene, 'seconds'>[]): number {
  return scenes.reduce((s, x) => s + x.seconds, 0);
}

/** Which scene is on screen at `frame`, plus the local progress within it. */
export function timelineAt(timeline: RenderTimeline, frame: number): { scene: RenderSceneTiming; t: number } {
  const clamped = Math.max(0, Math.min(timeline.totalFrames - 1, Math.floor(frame)));
  const scene = timeline.scenes.find((s) => clamped >= s.startFrame && clamped < s.endFrame) ?? timeline.scenes[timeline.scenes.length - 1];
  const t = scene.frames > 0 ? (clamped - scene.startFrame) / scene.frames : 0;
  return { scene, t };
}

export function pickRenderMime(
  candidates: string[],
  isSupported: (type: string) => boolean = (t) => typeof window !== 'undefined' && !!window.MediaRecorder && window.MediaRecorder.isTypeSupported(t),
): string | null {
  for (const c of candidates) {
    if (isSupported(c)) return c;
  }
  return null;
}

export const RENDER_MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
];

/**
 * Candidates for a stream that CONTAINS AN AUDIO TRACK.
 *
 * A codecs= parameter is a complete declaration of the track types in the file.
 * "video/webm;codecs=vp8" says "one VP8 video track and nothing else", so
 * recording a stream that also has audio is a contradiction — Firefox rejects
 * MediaRecorder.start() with "An audio track cannot be recorded:
 * video/webm;codecs=vp8 indicates an unsupported codec".
 *
 * The trap is that isTypeSupported('video/webm;codecs=vp8') returns TRUE. It
 * answers "can you produce this type at all", not "for this stream". So the
 * check passes and start() throws afterwards.
 *
 * These declare an audio codec alongside the video one. The bare types are kept
 * last: with no codecs= parameter the browser picks both itself, which is always
 * consistent with whatever the stream holds.
 */
export const RENDER_MIME_CANDIDATES_WITH_AUDIO = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

/**
 * Pick a recorder MIME type for a stream, given whether it carries audio.
 * Returns null when nothing matches, in which case the caller should construct
 * MediaRecorder without a mimeType and let the browser choose.
 */
export function pickRecorderMime(
  hasAudio: boolean,
  isSupported?: (type: string) => boolean,
): string | null {
  return pickRenderMime(
    hasAudio ? RENDER_MIME_CANDIDATES_WITH_AUDIO : RENDER_MIME_CANDIDATES,
    isSupported,
  );
}

// --- Drawing helpers (DOM) ----------------------------------------------------

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface SceneLayoutSpec {
  isLandscape: boolean;
  isVertical: boolean;
  minDim: number;
  baseTitle: number;
  brandSize: number;
  smallSize: number;
  titleY: number;
  lineH: number;
  voY: number;
  voLineH: number;
  ctaY: number;
  chipY: number;
  brandTop: number;
  brandBottom: number;
  titleBlockTop: number;
  titleBlockH: number;
  voBlockTop: number;
  voBlockH: number;
}

/**
 * The single source of truth for the caption overlay's geometry. drawOverlay
 * draws from it and sceneElementRegions hit-tests against it, so an element the
 * preview lets you click is exactly where it was drawn.
 */
export function sceneLayout(w: number, h: number, aspect: RenderAspect): SceneLayoutSpec {
  const isLandscape = aspect === 'Landscape';
  const isVertical = aspect === 'Vertical';
  const minDim = Math.min(w, h);
  const baseTitle = isLandscape ? Math.round(minDim * 0.085) : isVertical ? Math.round(minDim * 0.075) : Math.round(minDim * 0.07);
  const brandSize = Math.round(baseTitle * 0.28);
  const smallSize = Math.round(baseTitle * 0.22);
  const lineH = baseTitle * 1.18;
  const voLineH = Math.round(baseTitle * 0.3);
  return {
    isLandscape,
    isVertical,
    minDim,
    baseTitle,
    brandSize,
    smallSize,
    titleY: isLandscape ? h * 0.44 : h * 0.4,
    lineH,
    voY: h - (isVertical ? 240 : 168),
    voLineH,
    ctaY: h - (isVertical ? 170 : 118),
    chipY: h - (isVertical ? 110 : 76),
    brandTop: 12,
    brandBottom: brandSize * 1.6 + 12 + brandSize * 1.3,
    titleBlockTop: (isLandscape ? h * 0.44 : h * 0.4) - lineH * 1.2,
    titleBlockH: lineH * 3.2,
    voBlockTop: h - (isVertical ? 240 : 168) - voLineH * 0.6,
    voBlockH: voLineH * 2.6,
  };
}

/** Which caption element a scene draws, for the editable live preview. */
export type SceneElementKey = SceneTextElement;

export interface SceneElementRegion {
  key: SceneElementKey;
  /** Normalised 0..1 against the canvas, so any display size hit-tests the same. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Clickable regions of the current scene, in normalised canvas coordinates.
 * The brand lockup, headline block and voiceover strip are always there; the
 * call-to-action only exists on the final card. Per-clip element overrides are
 * honoured: hidden elements are dropped and moved elements shift their boxes so
 * the hit-test always matches what was drawn. Used by the editable preview to
 * turn a click into "edit this element".
 */
export function sceneElementRegions(opts: SceneFrameOptions, scene: DirectorScene, index: number): SceneElementRegion[] {
  const { width: w, height: h } = RENDER_DIMENSIONS[opts.aspect];
  const L = sceneLayout(w, h, opts.aspect);
  const el = (key: SceneElementKey) => scene.elements?.[key];
  const raw: { key: SceneElementKey; x: number; y: number; w: number; h: number }[] = [
    { key: 'brand', x: w * 0.16, y: L.brandTop, w: w * 0.68, h: Math.max(28, L.brandBottom - L.brandTop) },
    { key: 'title', x: w * 0.09, y: L.titleBlockTop, w: w * 0.82, h: L.titleBlockH },
    { key: 'subline', x: w * 0.11, y: L.voBlockTop, w: w * 0.78, h: L.voBlockH },
  ];
  if (index === opts.scenesCount - 1) {
    raw.push({ key: 'cta', x: w * 0.2, y: L.ctaY - L.baseTitle, w: w * 0.6, h: L.baseTitle * 1.7 });
  }
  return raw
    .filter((r) => el(r.key)?.hidden !== true)
    .map((r) => ({
      key: r.key,
      x: (r.x + (el(r.key)?.dx ?? 0) * w) / w,
      y: (r.y + (el(r.key)?.dy ?? 0) * h) / h,
      w: r.w / w,
      h: r.h / h,
    }));
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, plan: SceneRenderPlan): void {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, plan.gradient[0]);
  g.addColorStop(0.55, plan.gradient[1]);
  g.addColorStop(1, plan.gradient[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w * 0.7, h * 0.25, 0, w * 0.7, h * 0.25, w * 0.7);
  glow.addColorStop(0, `${plan.accentColor}55`);
  glow.addColorStop(1, `${plan.accentColor}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

type FrameSource =
  | { kind: 'gradient' }
  | { kind: 'video'; video: HTMLVideoElement | null }
  | { kind: 'image'; image: HTMLImageElement | null };

function isVideoReady(v: HTMLVideoElement | null): v is HTMLVideoElement {
  return !!v && v.readyState >= 2 && v.videoWidth > 0;
}

function isImageReady(img: HTMLImageElement | null): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0;
}

/**
 * Cover-fit an arbitrary source rect into the canvas.
 * Pure geometry — the caller's `draw` callback owns the context, so this takes
 * no ctx of its own.
 */
function drawCover(
  w: number,
  h: number,
  srcW: number,
  srcH: number,
  draw: (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) => void,
): void {
  if (!srcW || !srcH) return;
  const canvasA = w / h;
  const srcA = srcW / srcH;
  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;
  if (srcA > canvasA) {
    sw = srcH * canvasA;
    sx = (srcW - sw) / 2;
  } else {
    sh = srcW / canvasA;
    sy = (srcH - sh) / 2;
  }
  draw(sx, sy, sw, sh, 0, 0, w, h);
}

/** Cover-fit the current video frame into the (already transformed) canvas. */
function drawVideoCover(ctx: CanvasRenderingContext2D, w: number, h: number, video: HTMLVideoElement): void {
  drawCover(w, h, video.videoWidth, video.videoHeight, (sx, sy, sw, sh, dx, dy, dw, dh) =>
    ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh));
}

/** Cover-fit a still image (AI key art) into the (already transformed) canvas. */
function drawImageCover(ctx: CanvasRenderingContext2D, w: number, h: number, image: HTMLImageElement): void {
  drawCover(w, h, image.naturalWidth, image.naturalHeight, (sx, sy, sw, sh, dx, dy, dw, dh) =>
    ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh));
}

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawFilmGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, frame: number): void {
  const rng = mulberry32((seed + frame * 1009) >>> 0);
  const n = Math.max(140, Math.round((w * h) / 6000));
  ctx.save();
  for (let i = 0; i < n; i += 1) {
    const x = rng() * w;
    const y = rng() * h;
    const s = 1 + rng() * 2;
    ctx.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${0.02 + rng() * 0.03})` : `rgba(0,0,0,${0.02 + rng() * 0.03})`;
    ctx.fillRect(x, y, s, s);
  }
  ctx.restore();
}

/** 6-digit hex + 2-digit alpha → valid 8-digit hex (never re-appends on an 8-digit colour). */
function alphaHex(hex: string, alpha: string): string {
  return hex.length === 7 ? `${hex}${alpha}` : hex;
}

/** Billboard LED — neon glow pools, scanlines and a perspective floor grid. */
function drawLedBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, plan: SceneRenderPlan): void {
  const r = Math.min(w, h);
  const pools = [
    { x: w * 0.16, y: h * 0.14, r: r * 0.45, c: plan.accentColor },
    { x: w * 0.86, y: h * 0.84, r: r * 0.4, c: plan.gradient[1] },
  ];
  for (const p of pools) {
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    g.addColorStop(0, alphaHex(p.c, '30'));
    g.addColorStop(1, alphaHex(p.c, '00'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
  const horizon = h * 0.72;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    ctx.beginPath();
    ctx.moveTo(w / 2 + (t - 0.5) * w * 0.9, horizon);
    ctx.lineTo(w / 2 + (t - 0.5) * w * 2.2, h);
    ctx.stroke();
  }
  for (let i = 1; i <= 4; i++) {
    const t = i / 4;
    const y = horizon + (h - horizon) * t * t;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

/** Apple TV standard — a soft spotlight, fine hairline rings and quiet space. */
function drawPremiumBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, plan: SceneRenderPlan, frame: number): void {
  const cx = w / 2;
  const cy = h * 0.42;
  const spot = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.75);
  spot.addColorStop(0, 'rgba(255,255,255,0.14)');
  spot.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  spot.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, w, h);
  const t = (frame % 160) / 160;
  const dx = Math.sin(t * Math.PI * 2) * w * 0.02;
  const dy = Math.cos(t * Math.PI * 2) * h * 0.012;
  const r = Math.min(w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(w * 0.84 + dx, h * 0.2 + dy, r * 0.11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w * 0.14 - dx, h * 0.8 - dy, r * 0.07, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = alphaHex(plan.accentColor, '55');
  ctx.fillRect(0, 0, w, 2);
}

/** Glassmorphism — drifting colour blobs and a faint dot grid. */
function drawGlassBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, plan: SceneRenderPlan, frame: number): void {
  const t = (frame % 220) / 220;
  const dx = Math.sin(t * Math.PI * 2) * w * 0.015;
  const r = Math.min(w, h);
  const blobs = [
    { x: w * 0.22, y: h * 0.2, r: r * 0.4, c: plan.gradient[1] },
    { x: w * 0.82, y: h * 0.74, r: r * 0.36, c: plan.gradient[2] },
    { x: w * 0.58, y: h * 0.32, r: r * 0.26, c: plan.gradient[0] },
  ];
  for (const b of blobs) {
    const g = ctx.createRadialGradient(b.x + dx, b.y - dx, 0, b.x + dx, b.y - dx, b.r);
    g.addColorStop(0, alphaHex(b.c, '38'));
    g.addColorStop(1, alphaHex(b.c, '00'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  const step = Math.max(16, Math.round(r * 0.045));
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let x = 0; x < w; x += step) {
    for (let y = 0; y < h; y += step) ctx.fillRect(x, y, 1, 1);
  }
}

/** 3D depth — layered parallax shapes at different speeds plus a ground line. */
function drawDepthBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, plan: SceneRenderPlan, frame: number): void {
  const rng = mulberry32((plan.seed + frame * 1009) >>> 0);
  const r = Math.min(w, h);
  for (let i = 0; i < 7; i++) {
    const depth = 0.35 + rng() * 0.65;
    const speed = (0.5 + rng() * 0.9) * (rng() > 0.5 ? 1 : -1);
    const baseX = rng() * w;
    const baseY = h * 0.12 + rng() * h * 0.68;
    const size = (0.03 + rng() * 0.05) * r;
    const span = w + size * 2;
    const x = ((((baseX + speed * (frame % 300) * depth * 0.06) % span) + span) % span) - size;
    const a = 0.06 + depth * 0.12;
    const kind = rng();
    ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    ctx.fillStyle = `rgba(255,255,255,${(a * 0.3).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, Math.round(size * 0.04));
    if (kind < 0.4) {
      ctx.beginPath();
      ctx.arc(x, baseY, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (kind < 0.7) {
      ctx.save();
      ctx.translate(x, baseY);
      ctx.rotate((rng() - 0.5) * 0.7);
      ctx.strokeRect(-size, -size, size * 2, size * 2);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.moveTo(x, baseY - size);
      ctx.lineTo(x + size * 1.15, baseY + size * 0.85);
      ctx.lineTo(x - size * 1.15, baseY + size * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.78);
  ctx.lineTo(w, h * 0.78);
  ctx.stroke();
}

function drawTreatmentBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, plan: SceneRenderPlan, frame: number): void {
  switch (plan.treatment) {
    case 'led': return drawLedBackdrop(ctx, w, h, plan);
    case 'premium': return drawPremiumBackdrop(ctx, w, h, plan, frame);
    case 'glass': return drawGlassBackdrop(ctx, w, h, plan, frame);
    case '3d': return drawDepthBackdrop(ctx, w, h, plan, frame);
    default: return;
  }
}

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  plan: SceneRenderPlan,
  source: FrameSource,
  frame: number,
  layers?: MotionLayer[] | null,
  clean = false,
): void {
  if (source.kind === 'video' && isVideoReady(source.video)) {
    drawVideoCover(ctx, w, h, source.video);
    drawVignette(ctx, w, h);
    drawFilmGrain(ctx, w, h, plan.seed, frame);
  } else if (source.kind === 'image' && isImageReady(source.image)) {
    drawImageCover(ctx, w, h, source.image);
    drawVignette(ctx, w, h);
    drawFilmGrain(ctx, w, h, plan.seed, frame);
  } else {
    drawBackground(ctx, w, h, plan);
  }
  // Style ambience on top of whatever backdrop won (grid/scanlines/spotlight/
  // shapes). Deterministic per seed+frame, so a brief always films the same.
  // Skipped when the user composed uploads — those should read clean.
  if (!clean) drawTreatmentBackdrop(ctx, w, h, plan, frame);
  // Composite the user's uploads. The base layer is already the winning source
  // (or it steps aside for AI media); extra layers stack above it at their own
  // opacity — a simple bottom-to-top compositor under the captions.
  if (layers) {
    const baseWon = layerIsSource(source, layers[0]);
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      if (i === 0 && baseWon) continue;
      const alpha = clamp(layer.opacity ?? 1, 0, 1);
      if (alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (layer.kind === 'video' && layer.video && isVideoReady(layer.video)) {
        drawVideoCover(ctx, w, h, layer.video);
      } else if (layer.kind === 'image' && layer.image && isImageReady(layer.image)) {
        drawImageCover(ctx, w, h, layer.image);
      }
      ctx.restore();
    }
  }
}

function drawSceneContent(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  plan: SceneRenderPlan,
  index: number,
  scene: DirectorScene,
  t: number,
  // SceneFrameOptions, not RenderOptions: drawOverlay below needs scenesCount
  // for the progress dots and the final-scene end card. Every caller already
  // passes the wider type — only these two annotations were too narrow.
  opts: SceneFrameOptions,
  source: FrameSource,
  frame: number,
): void {
  const scale = lerp(plan.zoomIn, plan.zoomOut, easeInOut(t));
  const drift = plan.drift * easeInOut(clamp((t - 0.25) / 0.5, 0, 1));

  ctx.save();
  ctx.translate(w / 2 + drift, h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-w / 2, -h / 2);
  const hasUploads = !!opts.layers?.length;
  drawBackdrop(ctx, w, h, plan, source, frame, opts.layers, hasUploads);
  ctx.restore();

  drawOverlay(
    ctx, w, h, plan, index, scene, t, opts, frame,
    (source.kind === 'video' && isVideoReady(source.video)) ||
      (source.kind === 'image' && isImageReady(source.image)),
  );
}

/** Billboard LED marquee — the voiceover scrolls across a ticker strip. */
function drawLedTicker(
  ctx: CanvasRenderingContext2D,
  w: number,
  text: string,
  frame: number,
  L: SceneLayoutSpec,
  plan: SceneRenderPlan,
  shiftY = 0,
): void {
  const tickerH = Math.max(24, Math.round(L.baseTitle * 0.5));
  const y = L.chipY - tickerH - 8 + shiftY;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, y, w, tickerH);
  const label = text || 'OPEN FOR BUSINESS';
  const full = `  ${label}   ${label}   ${label}  `;
  ctx.fillStyle = plan.accentColor;
  ctx.font = `800 ${Math.round(tickerH * 0.62)}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const unit = Math.max(1, ctx.measureText(full).width / full.length);
  const scroll = (frame % 180) / 180;
  ctx.beginPath();
  ctx.rect(0, y, w, tickerH);
  ctx.clip();
  ctx.fillText(full, -scroll * full.length * unit, y + tickerH / 2 + 1);
  ctx.restore();
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  plan: SceneRenderPlan,
  index: number,
  scene: DirectorScene,
  t: number,
  opts: SceneFrameOptions,
  frame: number,
  overVideo: boolean,
): void {
  const L = sceneLayout(w, h, opts.aspect);
  const isVertical = L.isVertical;
  const minDim = L.minDim;
  const baseTitle = L.baseTitle;
  const brandSize = L.brandSize;
  const smallSize = L.smallSize;
  const titleY = L.titleY;
  const lineH = L.lineH;
  const treatment = opts.treatment ?? 'default';

  // Per-clip caption overrides. Every element reads through these helpers so the
  // designed look stays the default and an override only nudges what it touches.
  const el = (key: SceneElementKey) => scene.elements?.[key];
  const hidden = (key: SceneElementKey) => el(key)?.hidden === true;
  const textOf = (key: SceneElementKey, fallback: string) => el(key)?.text ?? fallback;
  const shifted = (key: SceneElementKey, x: number, y: number) => ({
    x: x + (el(key)?.dx ?? 0) * w,
    y: y + (el(key)?.dy ?? 0) * h,
  });
  const styled = (key: SceneElementKey, size: number, weight: number) => ({
    size: Math.max(8, Math.round(size * (el(key)?.scale ?? 1))),
    weight: el(key)?.fontWeight ?? weight,
    family: el(key)?.fontFamily ?? 'system-ui, sans-serif',
  });
  const font = (s: { size: number; weight: number; family: string }) => `${s.weight} ${s.size}px ${s.family}`;
  const colorOf = (key: SceneElementKey, fallback: string) => el(key)?.color ?? fallback;

  // Soft bottom scrim over real footage so captions always read.
  if (overVideo) {
    const scrim = ctx.createLinearGradient(0, h * 0.45, 0, h);
    scrim.addColorStop(0, 'rgba(0,0,0,0)');
    scrim.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, w, h);
  }

  // Brand lockup, top.
  ctx.save();
  ctx.textAlign = 'center';
  if (!hidden('brand')) {
    const brandPos = shifted('brand', w / 2, brandSize * 1.6 + 12);
    ctx.fillStyle = colorOf('brand', 'rgba(255,255,255,0.9)');
    ctx.font = font(styled('brand', brandSize, 900));
    ctx.fillText(textOf('brand', `${opts.logoEmoji ?? '✦'} ${opts.businessName.toUpperCase()}`), brandPos.x, brandPos.y);
    ctx.fillStyle = colorOf('brand', 'rgba(255,255,255,0.45)');
    ctx.font = font(styled('brand', Math.round(brandSize * 0.7), 700));
    ctx.fillText(opts.directionLabel.toUpperCase(), brandPos.x, brandPos.y + brandSize);
  }
  ctx.restore();

  // Scene number chip + progress dots.
  const chipY = L.chipY;
  const chipW = Math.round(brandSize * 4.4);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  roundRect(ctx, w / 2 - chipW / 2, chipY, chipW, Math.round(brandSize * 1.5), Math.round(brandSize * 0.35));
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${smallSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`SCENE ${index + 1} · ${scene.camera.toUpperCase()}`, w / 2, chipY + smallSize * 1.35);
  ctx.restore();

  // Voiceover strip: a scrolling LED ticker for billboard work, the standard
  // caption pill everywhere else.
  if (!hidden('subline')) {
    const sublineText = textOf('subline', scene.voiceover);
    const subPos = shifted('subline', w / 2, L.voY);
    if (treatment === 'led' && sublineText) {
      drawLedTicker(ctx, w, sublineText, frame, L, plan, (el('subline')?.dy ?? 0) * h);
    } else if (sublineText) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = font(styled('subline', Math.round(baseTitle * 0.24), 500));
      const voLines = wrapLines(ctx, sublineText, w * 0.78);
      const voY = subPos.y;
      const voLineH = L.voLineH;
      if (overVideo) {
        const pillW = w * 0.8;
        const pillH = voLines.length * voLineH + voLineH * 0.7;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        roundRect(ctx, subPos.x - pillW / 2, voY - voLineH * 0.6, pillW, pillH, Math.round(baseTitle * 0.12));
        ctx.fill();
      }
      ctx.fillStyle = colorOf('subline', overVideo ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.75)');
      voLines.forEach((line, i) => {
        ctx.fillText(line, subPos.x, voY + i * voLineH);
      });
      ctx.restore();
    }
  }

  // Progress dots.
  ctx.save();
  const dotR = Math.round(minDim * 0.0045);
  const gap = Math.round(dotR * 4);
  const startX = w / 2 - ((opts.scenesCount - 1) * gap) / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = `${Math.round(brandSize * 0.9)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  for (let i = 0; i < opts.scenesCount; i++) {
    ctx.beginPath();
    ctx.arc(startX + i * gap, h - (isVertical ? 52 : 40), dotR, 0, Math.PI * 2);
    ctx.fillStyle = i === index ? '#ffffff' : 'rgba(255,255,255,0.3)';
    ctx.fill();
  }
  ctx.restore();

  // Main title text.
  const title = textOf('title', index === 0 ? opts.hook || scene.text : scene.text);
  const titlePos = shifted('title', w / 2, titleY);
  if (!hidden('title')) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = font(styled('title', treatment === 'premium' ? Math.round(baseTitle * 1.08) : baseTitle, treatment === 'premium' ? 700 : 900));
    if (treatment === 'premium') {
      try { ctx.letterSpacing = '0.04em'; } catch { /* older browsers ignore */ }
    }
    const titleLines = wrapLines(ctx, title, w * 0.82);
    const titleCount = Math.min(3, titleLines.length);

    // Apple TV standard: a small accent kicker + hairline above the headline.
    if (treatment === 'premium') {
      ctx.fillStyle = plan.accentColor;
      ctx.font = `700 ${Math.round(smallSize * 1.1)}px system-ui, sans-serif`;
      ctx.fillText(opts.directionLabel.toUpperCase(), titlePos.x, titlePos.y - lineH * 1.55);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      const ruleW = Math.round(Math.min(140, w * 0.12));
      ctx.fillRect(titlePos.x - ruleW / 2, titlePos.y - lineH * 1.2, ruleW, 2);
    }

    // Glassmorphism: a frosted panel sits behind the headline block.
    if (treatment === 'glass') {
      const panelTop = titlePos.y - lineH * 1.45;
      const panelH = titleCount * lineH + lineH * 0.9;
      const panelW = w * 0.88;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, titlePos.x - panelW / 2, panelTop, panelW, panelH, Math.round(baseTitle * 0.18));
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 3D: the headline drifts a hair against the parallax shapes below it.
    if (treatment === '3d') {
      ctx.translate(Math.round(Math.sin((frame * 0.03) % (Math.PI * 2)) * w * 0.006), 0);
    }

    ctx.shadowColor = treatment === 'led' ? plan.accentColor : 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = treatment === 'led' ? Math.round(baseTitle * 0.9) : Math.round(baseTitle * 0.35);
    ctx.fillStyle = colorOf('title', plan.textColor);
    titleLines.slice(0, 3).forEach((line, i) => {
      ctx.fillText(line, titlePos.x, titlePos.y + (i - (titleCount - 1) / 2) * lineH);
    });
    ctx.shadowBlur = 0;
    if (treatment === 'premium') {
      try { ctx.letterSpacing = '0px'; } catch { /* older browsers ignore */ }
    }

    // Accent underline (parallax with the title on the 3D treatment).
    const accW = Math.round(Math.min(300, w * 0.24));
    ctx.fillStyle = plan.accentColor;
    roundRect(ctx, titlePos.x - accW / 2, titlePos.y + lineH * 0.72, accW, Math.max(6, Math.round(baseTitle * 0.09)), Math.round(baseTitle * 0.05));
    ctx.fill();
    ctx.restore();
  }

  // CTA + phone end card on the final scene.
  if (index === opts.scenesCount - 1 && t > 0.62 && !hidden('cta')) {
    const fadeIn = clamp((t - 0.62) / 0.18, 0, 1);
    const ctaPos = shifted('cta', w / 2, L.ctaY);
    ctx.save();
    ctx.globalAlpha = fadeIn;
    ctx.textAlign = 'center';
    ctx.font = font(styled('cta', Math.round(baseTitle * 0.42), 900));
    ctx.fillStyle = colorOf('cta', plan.accentColor);
    ctx.fillText(textOf('cta', opts.cta ?? 'Tap to order').toUpperCase(), ctaPos.x, ctaPos.y);
    ctx.restore();
  }

  // NowOpen Africa platform mark — a subtle bottom-corner watermark on every
  // scene so every design style carries the house brand next to the business's.
  ctx.save();
  ctx.textAlign = 'left';
  ctx.font = `800 ${Math.round(smallSize * 0.78)}px system-ui, sans-serif`;
  try { ctx.letterSpacing = '0.14em'; } catch { /* older browsers ignore */ }
  ctx.fillStyle = 'rgba(255,255,255,0.34)';
  ctx.fillText('✦ NOWOPEN AFRICA', Math.round(w * 0.035), h - (isVertical ? 22 : 18));
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export interface SceneFrameOptions extends RenderOptions {
  scenesCount: number;
}

function drawTimelineFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: SceneFrameOptions,
  scenes: DirectorScene[],
  timeline: RenderTimeline,
  frame: number,
  videos: (HTMLVideoElement | null)[] | null,
  images: (HTMLImageElement | null)[] | null,
): void {
  const { scene, t } = timelineAt(timeline, frame);
  const current = scenes[scene.index];
  const plan = sceneRenderPlan(opts, current, scene.index);
  const source = resolveSource(videos?.[scene.index] ?? null, images?.[scene.index] ?? null, opts.layers);

  drawSceneContent(ctx, w, h, plan, scene.index, current, t, opts, source, frame);

  // Crossfade into the next scene during the last transitionFrames of this one.
  const nextIndex = scene.index + 1;
  if (plan.transition === 'fade' && plan.transitionFrames > 0 && nextIndex < scenes.length) {
    const within = scene.endFrame - frame;
    if (within <= plan.transitionFrames) {
      const blend = 1 - within / plan.transitionFrames;
      const nextPlan = sceneRenderPlan(opts, scenes[nextIndex], nextIndex);
      const nextSource = resolveSource(videos?.[nextIndex] ?? null, images?.[nextIndex] ?? null, opts.layers);
      ctx.save();
      ctx.globalAlpha = clamp(blend, 0, 1);
      drawSceneContent(ctx, w, h, nextPlan, nextIndex, scenes[nextIndex], 0, opts, nextSource, frame);
      ctx.restore();
    }
  }
}

/**
 * Backdrop priority: real footage video, then AI key art, then the first
 * uploaded layer, then the gradient. Pure geometry — no DOM needed, so it is
 * exported for unit tests.
 */
export function resolveSource(
  video: HTMLVideoElement | null,
  image: HTMLImageElement | null,
  layers?: MotionLayer[] | null,
): FrameSource {
  const base = layers?.[0] ?? null;
  if (isVideoReady(video)) return { kind: 'video', video };
  if (isImageReady(image)) return { kind: 'image', image };
  if (base?.kind === 'video' && isVideoReady(base.video ?? null)) return { kind: 'video', video: base.video ?? null };
  if (base?.kind === 'image' && isImageReady(base.image ?? null)) return { kind: 'image', image: base.image ?? null };
  return { kind: 'gradient' };
}

/**
 * Whether the winning source came from a user-uploaded layer. When the base
 * layer wins, the style ambience (scanlines/spotlight/blobs) steps aside so the
 * upload reads as the background the user actually chose.
 */
function layerIsSource(source: FrameSource, layer?: MotionLayer | null): boolean {
  if (!layer) return false;
  if (source.kind === 'video' && layer.kind === 'video' && source.video === layer.video) return true;
  if (source.kind === 'image' && layer.kind === 'image' && source.image === layer.image) return true;
  return false;
}

export function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: SceneFrameOptions,
  scenes: DirectorScene[],
  timeline: RenderTimeline,
  frame: number,
  images?: (HTMLImageElement | null)[] | null,
): void {
  drawTimelineFrame(ctx, w, h, opts, scenes, timeline, frame, null, images ?? null);
}

/** Same as drawSceneFrame but films each scene over its real stock clip. */
export function drawFootageFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: SceneFrameOptions,
  scenes: DirectorScene[],
  timeline: RenderTimeline,
  frame: number,
  videos: (HTMLVideoElement | null)[],
  images?: (HTMLImageElement | null)[] | null,
): void {
  drawTimelineFrame(ctx, w, h, opts, scenes, timeline, frame, videos, images ?? null);
}

// --- Poster & contact sheet (still frames) -----------------------------------

export interface RenderedStill {
  dataUrl: string;
  width: number;
  height: number;
}

export function renderPoster(opts: SceneFrameOptions, scenes: DirectorScene[], frame = 0): RenderedStill | null {
  const dims = RENDER_DIMENSIONS[opts.aspect];
  const canvas = makeCanvas(dims.width, dims.height);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const timeline = buildRenderTimeline(scenes, opts);
  drawSceneFrame(ctx, dims.width, dims.height, opts, scenes, timeline, clamp(frame, 0, timeline.totalFrames - 1));
  return { dataUrl: canvas.toDataURL('image/png'), width: dims.width, height: dims.height };
}

export function renderContactSheet(opts: SceneFrameOptions, scenes: DirectorScene[], cols = 4): RenderedStill | null {
  if (!scenes.length) return null;
  const cellW = 480;
  const cellH = Math.round(cellW * (RENDER_DIMENSIONS[opts.aspect].height / RENDER_DIMENSIONS[opts.aspect].width));
  const rows = Math.ceil(scenes.length / cols);
  const canvas = makeCanvas(cols * cellW, rows * cellH + 120);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${opts.businessName} — ${opts.directionLabel} storyboard`, canvas.width / 2, 70);

  const backdropSource = resolveSource(null, null, opts.layers);
  scenes.forEach((scene, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW;
    const y = row * cellH + 120;
    const plan = sceneRenderPlan(opts, scene, i);
    ctx.save();
    ctx.translate(x, y);
    drawSceneContent(ctx, cellW, cellH, plan, i, scene, 0.5, opts, backdropSource, 0);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`S${i + 1} · ${scene.seconds}s · ${scene.camera}`, x + 16, y + cellH - 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
  });

  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

/** Render one storyboard scene as a still frame (AI key art / gradient backdrop + caption overlay). */
export function renderSceneStill(
  opts: SceneFrameOptions,
  scene: DirectorScene,
  index: number,
  width = 480,
  image?: HTMLImageElement | null,
): RenderedStill | null {
  const dims = RENDER_DIMENSIONS[opts.aspect];
  const w = width;
  const h = Math.round((w * dims.height) / dims.width);
  const canvas = makeCanvas(w, h);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const plan = sceneRenderPlan(opts, scene, index);
  drawSceneContent(ctx, w, h, plan, index, scene, 0.5, opts, resolveSource(null, image ?? null, opts.layers), 0);
  return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h };
}

// --- Real video capture --------------------------------------------------------

export interface RenderVideoResult {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  duration: number;
  totalFrames: number;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function makeFootageVideo(url: string): HTMLVideoElement {
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.loop = true;
  v.src = url;
  return v;
}

/**
 * Start loading an uploaded backdrop video (looping + muted, so it can autoplay
 * in the live preview). The returned element is session-local and owned by the
 * caller; the renderer clones its own during an export so the preview never
 * jumps.
 */
export function createBackgroundVideo(url: string): HTMLVideoElement {
  return makeFootageVideo(url);
}

/** Start loading an uploaded backdrop image. */
export function createBackgroundImage(url: string): HTMLImageElement {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.src = url;
  return img;
}

/**
 * Whether a render should film the supplied clips.
 *
 * Passing `footage` defaults to USING it. This used to require a second flag,
 * which meant a caller could hand over a full footage map, receive a video of
 * plain gradients, and get no error anywhere to say why — a silent failure that
 * looked exactly like "no clips were found". Opting out is still possible, but
 * now has to be deliberate.
 *
 * Exported so the rule is testable: renderVideo itself needs MediaRecorder and
 * a real canvas, so nothing inside it can be covered under jsdom.
 */
export function footageIsEnabled(opts: Pick<SceneFrameOptions, 'footage' | 'footageEnabled'>): boolean {
  return opts.footageEnabled !== false && !!opts.footage && Object.keys(opts.footage).length > 0;
}

/** Wait (bounded) for every footage clip to be ready to draw; failures fall back to graphics. */
async function preloadFootageVideos(videos: (HTMLVideoElement | null)[]): Promise<void> {
  const pending = videos.filter((v): v is HTMLVideoElement => !!v && v.readyState < 2);
  if (!pending.length) return;
  await Promise.allSettled(
    pending.map((v) => new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 15000);
      const done = () => { window.clearTimeout(timer); resolve(); };
      v.addEventListener('loadeddata', done, { once: true });
      v.addEventListener('error', done, { once: true });
    })),
  );
}

function makeAiImage(url: string): HTMLImageElement {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.src = url;
  return img;
}

/** Preload AI key art; failures become null and that scene falls back to the gradient. */
async function preloadAiImages(urls: (string | null)[]): Promise<(HTMLImageElement | null)[]> {
  return Promise.all(
    urls.map((url) => (!url ? Promise.resolve(null) : new Promise<HTMLImageElement | null>((resolve) => {
      const img = makeAiImage(url);
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
    }))),
  );
}

/**
 * Route every footage clip's audio into the canvas capture stream.
 *
 * canvas.captureStream() is video-only, so an export is silent no matter what
 * the clips contain. The same trick DesignStudio uses for its uploaded clip
 * fixes that: a shared AudioContext pipes each element through
 * MediaElementSource into one MediaStreamDestination, whose track the renderer
 * records alongside the canvas.
 *
 * Two rules that keep this safe:
 *  - A media element can only be connected to an AudioContext once, ever, so
 *    this runs on the fresh elements renderVideo just created, before they
 *    play, and never on one that already had a source made.
 *  - `muted` elements deliver silence to MediaElementAudioSourceNode, so the
 *    clips are un-muted here. That is not audible in the room: creating the
 *    source re-routes the element's output into the graph, and nothing is ever
 *    connected to ctx.destination.
 *
 * Returns null (a silent, video-only export) when there is no audio support,
 * no clips to route, or the capture fails for any reason — never throws.
 */
function attachFootageAudio(videos: (HTMLVideoElement | null)[]): MediaStreamTrack | null {
  const used = videos.filter((v): v is HTMLVideoElement => !!v);
  if (!used.length) return null;
  if (typeof AudioContext === 'undefined') return null;
  try {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    for (const v of used) {
      try {
        const src = ctx.createMediaElementSource(v);
        src.connect(dest);
        v.muted = false;
      } catch {
        // A clip that refuses a source just stays silent — the others still count.
      }
    }
    return dest.stream.getAudioTracks()[0] ?? null;
  } catch (e) {
    console.error('Audio capture failed — exporting without sound.', e);
    return null;
  }
}

export async function renderVideo(
  opts: SceneFrameOptions,
  scenes: DirectorScene[],
  onProgress?: (progress: number, frame: number, total: number) => void,
): Promise<RenderVideoResult> {
  if (typeof window === 'undefined' || !window.MediaRecorder) {
    throw new Error('Video recording is not supported in this browser.');
  }
  const dims = RENDER_DIMENSIONS[opts.aspect];
  const canvas = makeCanvas(dims.width, dims.height);
  if (!canvas) throw new Error('Could not create the render canvas.');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not start the render context.');

  const timeline = buildRenderTimeline(scenes, opts);
  const fps = timeline.fps;

  const footageOn = footageIsEnabled(opts);
  const videos: (HTMLVideoElement | null)[] = scenes.map((_, i) => {
    const clip = opts.footage?.[i];
    return footageOn && clip ? makeFootageVideo(clip.url) : null;
  });
  if (footageOn) await preloadFootageVideos(videos);
  const startOffsets: number[] = scenes.map((_, i) => {
    const clip = opts.footage?.[i];
    if (!clip || clip.duration <= 0) return 0;
    const rng = mulberry32(renderSeed('footage', opts.businessName, i));
    return Math.floor(rng() * clip.duration);
  });

  // The export films its OWN layer videos (cloned from the upload URLs) so
  // seeking/playing them never disturbs the elements the live preview animates.
  const exportOpts: SceneFrameOptions =
    (opts.layers ?? []).some((l) => l.kind === 'video')
      ? {
          ...opts,
          layers: (opts.layers ?? []).map((l) =>
            l.kind === 'video' ? { ...l, video: createBackgroundVideo(l.url) } : l,
          ),
        }
      : opts;
  const exportLayerVideos: HTMLVideoElement[] = [];
  (exportOpts.layers ?? []).forEach((l) => {
    if (l.kind === 'video' && l.video) exportLayerVideos.push(l.video);
  });
  if (exportLayerVideos.length > 0) {
    await preloadFootageVideos(exportLayerVideos.filter((v) => !isVideoReady(v)));
    exportLayerVideos.forEach((v, i) => {
      if (!isVideoReady(v)) return;
      const dur = v.duration;
      const offset = isFinite(dur) && dur > 0
        ? Math.floor(mulberry32(renderSeed('layer', opts.businessName, i))() * dur)
        : 0;
      try { v.currentTime = offset; } catch { /* stay at 0 */ }
      const p = v.play();
      if (p) p.catch(() => { /* a stalled layer just draws its ready frame */ });
    });
  }

  // Preload AI key art when present; scenes without a ready image fall back to
  // the gradient (or to footage when that wins priority).
  const images = await preloadAiImages(opts.aiImages ?? []);

  const stream = canvas.captureStream(fps);
  // Film the footage audio too: a silent export of real clips is exactly the
  // "looks like it failed" failure this pipeline is meant to avoid.
  const audioTrack = footageOn ? attachFootageAudio(videos) : null;
  if (audioTrack) stream.addTrack(audioTrack);

  const mimeType = pickRecorderMime(audioTrack !== null);
  const track = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;

  // A codecs= MIME is a complete declaration of the track types, so a stream
  // that carries audio must be recorded with an audio-capable type — the
  // isTypeSupported() lie (video-only type accepted, start() throws) is exactly
  // what pickRecorderMime guards against. Even so, the browser can still refuse
  // at construction/start: drop the mimeType and let it pick a combination it
  // can honour rather than losing the whole export.
  const chunks: Blob[] = [];
  const makeRecorder = (withMime: boolean): MediaRecorder => {
    const rec = withMime && mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    return rec;
  };

  let recorder: MediaRecorder;
  try {
    recorder = makeRecorder(true);
  } catch (e) {
    console.warn('Renderer rejected', mimeType, '— retrying on the browser default.', e);
    recorder = makeRecorder(false);
  }
  let finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType ?? 'video/webm' }));
  });

  try {
    recorder.start(250);
  } catch (e) {
    console.warn('Renderer refused to start with', mimeType, '— retrying on the browser default.', e);
    recorder = makeRecorder(false);
    finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });
    recorder.start(250);
  }

  await new Promise<void>((resolve, reject) => {
    let frame = 0;
    let activeScene = -1;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (frame >= timeline.totalFrames) {
        recorder.stop();
        resolve();
        return;
      }
      const { scene } = timelineAt(timeline, frame);
      if (scene.index !== activeScene) {
        activeScene = scene.index;
        const v = videos[scene.index];
        if (v && isVideoReady(v)) {
          try {
            if (v.currentTime !== startOffsets[scene.index]) v.currentTime = startOffsets[scene.index];
            const p = v.play();
            if (p) p.catch(() => { /* autoplay can be interrupted; frame draws whatever is ready */ });
          } catch { /* keep rendering */ }
        }
      }
      drawTimelineFrame(ctx, dims.width, dims.height, exportOpts, scenes, timeline, frame, videos, images);
      try { track?.requestFrame?.(); } catch { /* older captureStream ignores requestFrame */ }
      onProgress?.(timeline.totalFrames > 0 ? frame / timeline.totalFrames : 0, frame, timeline.totalFrames);
      frame += 1;
      window.setTimeout(tick, Math.max(8, Math.round(1000 / fps)));
    };
    recorder.onerror = () => {
      cancelled = true;
      reject(new Error('The renderer stopped recording — try again or use a still poster instead.'));
    };
    tick();
  });

  const blob = await finished;
  return {
    blob,
    mimeType: mimeType ?? blob.type ?? 'video/webm',
    width: dims.width,
    height: dims.height,
    duration: timeline.totalSeconds,
    totalFrames: timeline.totalFrames,
  };
}
