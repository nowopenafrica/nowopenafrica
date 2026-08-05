// NowOpen Studio — real render pipeline.
//
// Replaces the simulated "the generator produced a video" step with an actual
// in-browser renderer: the storyboard scenes are painted to a <canvas> and
// captured with MediaRecorder, producing a real, playable, downloadable video
// file (WebM) plus poster and contact-sheet PNGs. Everything is deterministic
// (seeded from the business + direction + scene) so the same brief always
// renders the same way.
//
// The module keeps all pure planning math separate from the DOM work so it can
// be unit-tested in jsdom: `renderSeed`, `sceneRenderPlan`, `buildRenderTimeline`
// and `pickRenderMime` are pure; `drawSceneFrame`, `renderPoster`,
// `renderContactSheet` and `renderVideo` touch the canvas/MediaRecorder and are
// guarded so importing the module never needs a real browser.

import type { DirectorScene } from './creativeDirector';
import type { StockClip } from './stockFootage';
import { hashString, mulberry32 } from './videoCreator';

export type RenderAspect = 'Square' | 'Vertical' | 'Landscape';

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
   * Real stock footage per scene index (from stockFootage.resolveFootage).
   * When set AND `footageEnabled`, `drawFootageFrame`/`renderVideo` film the
   * scene with the clip (Ken Burns + film grade) under the caption overlay.
   */
  footage?: Record<number, StockClip>;
  footageEnabled?: boolean;
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

export function sceneRenderPlan(opts: RenderOptions, scene: DirectorScene, index: number): SceneRenderPlan {
  const fps = opts.fps ?? RENDER_FPS;
  const seed = renderSeed(opts.businessName, opts.directionLabel, index, scene.text);
  const rng = mulberry32(seed);
  const palette = PALETTES[Math.floor(rng() * PALETTES.length)];

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
  | { kind: 'video'; video: HTMLVideoElement | null };

function isVideoReady(v: HTMLVideoElement | null): v is HTMLVideoElement {
  return !!v && v.readyState >= 2 && v.videoWidth > 0;
}

/** Cover-fit the current video frame into the (already transformed) canvas. */
function drawVideoCover(ctx: CanvasRenderingContext2D, w: number, h: number, video: HTMLVideoElement): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const canvasA = w / h;
  const videoA = vw / vh;
  let sx = 0;
  let sy = 0;
  let sw = vw;
  let sh = vh;
  if (videoA > canvasA) {
    sw = vh * canvasA;
    sx = (vw - sw) / 2;
  } else {
    sh = vw / canvasA;
    sy = (vh - sh) / 2;
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
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

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  plan: SceneRenderPlan,
  source: FrameSource,
  frame: number,
): void {
  if (source.kind === 'video' && isVideoReady(source.video)) {
    drawVideoCover(ctx, w, h, source.video);
    drawVignette(ctx, w, h);
    drawFilmGrain(ctx, w, h, plan.seed, frame);
  } else {
    drawBackground(ctx, w, h, plan);
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
  // passes it — only these two annotations were too narrow.
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
  drawBackdrop(ctx, w, h, plan, source, frame);
  ctx.restore();

  drawOverlay(ctx, w, h, plan, index, scene, t, opts, source.kind === 'video' && isVideoReady(source.video));
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
  overVideo: boolean,
): void {
  const isLandscape = opts.aspect === 'Landscape';
  const isVertical = opts.aspect === 'Vertical';
  const minDim = Math.min(w, h);
  const baseTitle = isLandscape ? Math.round(minDim * 0.085) : isVertical ? Math.round(minDim * 0.075) : Math.round(minDim * 0.07);
  const brandSize = Math.round(baseTitle * 0.28);
  const smallSize = Math.round(baseTitle * 0.22);

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
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `900 ${brandSize}px system-ui, sans-serif`;
  ctx.fillText(`${opts.logoEmoji ?? '✦'} ${opts.businessName.toUpperCase()}`, w / 2, brandSize * 1.6 + 12);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = `700 ${Math.round(brandSize * 0.7)}px system-ui, sans-serif`;
  ctx.fillText(opts.directionLabel.toUpperCase(), w / 2, brandSize * 1.6 + 12 + brandSize);
  ctx.restore();

  // Scene number chip + progress dots.
  const chipY = h - (isVertical ? 110 : 76);
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

  // Voiceover as a small caption strip near the bottom (pill over footage).
  if (scene.voiceover) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `500 ${Math.round(baseTitle * 0.24)}px system-ui, sans-serif`;
    const voLines = wrapLines(ctx, scene.voiceover, w * 0.78);
    const voY = h - (isVertical ? 240 : 168);
    const voLineH = Math.round(baseTitle * 0.3);
    if (overVideo) {
      const pillW = w * 0.8;
      const pillH = voLines.length * voLineH + voLineH * 0.7;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(ctx, w / 2 - pillW / 2, voY - voLineH * 0.6, pillW, pillH, Math.round(baseTitle * 0.12));
      ctx.fill();
    }
    ctx.fillStyle = overVideo ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.75)';
    voLines.forEach((line, i) => {
      ctx.fillText(line, w / 2, voY + i * voLineH);
    });
    ctx.restore();
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
  ctx.save();
  ctx.textAlign = 'center';
  const titleY = isLandscape ? h * 0.44 : isVertical ? h * 0.4 : h * 0.4;
  const title = index === 0 ? opts.hook || scene.text : scene.text;
  ctx.font = `900 ${baseTitle}px system-ui, sans-serif`;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = Math.round(baseTitle * 0.35);
  ctx.fillStyle = plan.textColor;
  const titleLines = wrapLines(ctx, title, w * 0.82);
  const lineH = baseTitle * 1.18;
  titleLines.slice(0, 3).forEach((line, i) => {
    ctx.fillText(line, w / 2, titleY + (i - (Math.min(3, titleLines.length) - 1) / 2) * lineH);
  });
  ctx.shadowBlur = 0;

  // Accent underline.
  const accW = Math.round(Math.min(300, w * 0.24));
  ctx.fillStyle = plan.accentColor;
  roundRect(ctx, w / 2 - accW / 2, titleY + lineH * 0.72, accW, Math.max(6, Math.round(baseTitle * 0.09)), Math.round(baseTitle * 0.05));
  ctx.fill();
  ctx.restore();

  // CTA + phone end card on the final scene.
  if (index === opts.scenesCount - 1 && t > 0.62) {
    const fadeIn = clamp((t - 0.62) / 0.18, 0, 1);
    ctx.save();
    ctx.globalAlpha = fadeIn;
    ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(baseTitle * 0.42)}px system-ui, sans-serif`;
    ctx.fillStyle = plan.accentColor;
    ctx.fillText((opts.cta ?? 'Tap to order').toUpperCase(), w / 2, h - (isVertical ? 170 : 118));
    ctx.restore();
  }
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
): void {
  const { scene, t } = timelineAt(timeline, frame);
  const current = scenes[scene.index];
  const plan = sceneRenderPlan(opts, current, scene.index);
  const source: FrameSource = videos ? { kind: 'video', video: videos[scene.index] } : { kind: 'gradient' };

  drawSceneContent(ctx, w, h, plan, scene.index, current, t, opts, source, frame);

  // Crossfade into the next scene during the last transitionFrames of this one.
  const nextIndex = scene.index + 1;
  if (plan.transition === 'fade' && plan.transitionFrames > 0 && nextIndex < scenes.length) {
    const within = scene.endFrame - frame;
    if (within <= plan.transitionFrames) {
      const blend = 1 - within / plan.transitionFrames;
      const nextPlan = sceneRenderPlan(opts, scenes[nextIndex], nextIndex);
      const nextSource: FrameSource = videos ? { kind: 'video', video: videos[nextIndex] } : { kind: 'gradient' };
      ctx.save();
      ctx.globalAlpha = clamp(blend, 0, 1);
      drawSceneContent(ctx, w, h, nextPlan, nextIndex, scenes[nextIndex], 0, opts, nextSource, frame);
      ctx.restore();
    }
  }
}

export function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: SceneFrameOptions,
  scenes: DirectorScene[],
  timeline: RenderTimeline,
  frame: number,
): void {
  drawTimelineFrame(ctx, w, h, opts, scenes, timeline, frame, null);
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
): void {
  drawTimelineFrame(ctx, w, h, opts, scenes, timeline, frame, videos);
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

  scenes.forEach((scene, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW;
    const y = row * cellH + 120;
    const plan = sceneRenderPlan(opts, scene, i);
    ctx.save();
    ctx.translate(x, y);
    drawSceneContent(ctx, cellW, cellH, plan, i, scene, 0.5, opts, { kind: 'gradient' }, 0);
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

/** Render one storyboard scene as a still frame (gradient backdrop + caption overlay). */
export function renderSceneStill(
  opts: SceneFrameOptions,
  scene: DirectorScene,
  index: number,
  width = 480,
): RenderedStill | null {
  const dims = RENDER_DIMENSIONS[opts.aspect];
  const w = width;
  const h = Math.round((w * dims.height) / dims.width);
  const canvas = makeCanvas(w, h);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const plan = sceneRenderPlan(opts, scene, index);
  drawSceneContent(ctx, w, h, plan, index, scene, 0.5, opts, { kind: 'gradient' }, 0);
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
  const mimeType = pickRenderMime(RENDER_MIME_CANDIDATES);

  // Preload real stock footage when enabled; otherwise fall back to graphics.
  const footageOn = !!opts.footageEnabled && !!opts.footage;
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

  const stream = canvas.captureStream(fps);
  const track = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;

  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType ?? 'video/webm' }));
  });

  recorder.start(250);

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
      if (videos.some(Boolean)) {
        drawFootageFrame(ctx, dims.width, dims.height, opts, scenes, timeline, frame, videos);
      } else {
        drawSceneFrame(ctx, dims.width, dims.height, opts, scenes, timeline, frame);
      }
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
