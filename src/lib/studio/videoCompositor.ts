/**
 * Paints one moment of a VideoDocument onto a 2D canvas.
 *
 * ONE painter for the preview and (Phase D) the export, the design editor's
 * rule: a second renderer for export is a promise the two stay in step.
 *
 * The painter never seeks or plays media. The caller owns the <video> and
 * <audio> elements and keeps them at the right time; this draws whatever
 * frame each element currently shows. That split is what lets the export
 * step frame by frame while the preview plays in real time.
 *
 * `motion-scene` clips are handed to lib/renderVideo's scene painter with a
 * one-scene timeline built from the clip, so converted Motion Studio work
 * looks exactly as it did there.
 */

import { drawSceneFrame, RENDER_DIMENSIONS, type RenderAspect, type RenderTimeline, type SceneFrameOptions } from '../renderVideo';
import type { DirectorScene } from '../creativeDirector';
import { fontStack, type FontKey } from '../design/typefaces';
import {
  clipAt, clipEndMs,
  type Clip, type Ease, type KeyframeProp, type MotionSceneClip, type TextClip, type Track, type Transform, type VideoDocument,
} from './videoDocument';

export type MediaSource = HTMLImageElement | HTMLVideoElement;

export interface FrameResources {
  /** The loaded element for an asset id, or null while it loads. */
  media: (assetId: string) => MediaSource | null;
}

// ── pure maths (tested) ─────────────────────────────────────────────────────

export function ease(kind: Ease, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (kind) {
    case 'easeIn': return x * x;
    case 'easeOut': return 1 - (1 - x) * (1 - x);
    case 'easeInOut': return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
    default: return x;
  }
}

/** A transform property at a moment within the clip: the base value unless keyframes say otherwise. */
export function valueAt(clip: Pick<Clip, 'keyframes'>, prop: KeyframeProp, base: number, localMs: number): number {
  const kfs = (clip.keyframes ?? []).filter((k) => k.prop === prop).sort((a, b) => a.tMs - b.tMs);
  if (kfs.length === 0) return base;
  if (localMs <= kfs[0].tMs) return kfs[0].value;
  const last = kfs[kfs.length - 1];
  if (localMs >= last.tMs) return last.value;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (localMs >= a.tMs && localMs <= b.tMs) {
      const span = b.tMs - a.tMs;
      return span === 0 ? b.value : a.value + (b.value - a.value) * ease(b.ease, (localMs - a.tMs) / span);
    }
  }
  return last.value;
}

export function transformAt(clip: Clip & { transform: Transform }, localMs: number): Transform {
  const t = clip.transform;
  return {
    x: valueAt(clip, 'x', t.x, localMs),
    y: valueAt(clip, 'y', t.y, localMs),
    w: valueAt(clip, 'w', t.w, localMs),
    h: valueAt(clip, 'h', t.h, localMs),
    rotation: valueAt(clip, 'rotation', t.rotation, localMs),
    opacity: valueAt(clip, 'opacity', t.opacity, localMs),
  };
}

/** How far in a clip's entrance transition is: 0 = not yet visible, 1 = settled. */
export function transitionProgress(clip: Pick<Clip, 'transitionIn'>, localMs: number): number {
  const tr = clip.transitionIn;
  if (!tr || tr.type === 'cut' || tr.ms <= 0) return 1;
  return Math.min(1, Math.max(0, localMs / tr.ms));
}

/** Fill a box with a source of another shape, cropping the overflow (CSS object-fit: cover). */
export function coverRect(srcW: number, srcH: number, boxW: number, boxH: number): { sx: number; sy: number; sw: number; sh: number } {
  if (srcW <= 0 || srcH <= 0 || boxW <= 0 || boxH <= 0) return { sx: 0, sy: 0, sw: srcW, sh: srcH };
  const scale = Math.max(boxW / srcW, boxH / srcH);
  const sw = boxW / scale;
  const sh = boxH / scale;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

/** The motion renderer's layout depends on its named aspect; pick the one nearest this frame. */
export function aspectFor(width: number, height: number): RenderAspect {
  const want = width / height;
  let best: RenderAspect = 'Vertical';
  let bestD = Infinity;
  for (const [k, d] of Object.entries(RENDER_DIMENSIONS) as [RenderAspect, { width: number; height: number }][]) {
    const diff = Math.abs(Math.log(d.width / d.height / want));
    if (diff < bestD) { best = k; bestD = diff; }
  }
  return best;
}

/** Greedy word wrap with explicit line breaks kept. `measure` returns a width in px. */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) { out.push(''); continue; }
    let line = words[0];
    for (const w of words.slice(1)) {
      const next = `${line} ${w}`;
      if (measure(next) <= maxWidth) line = next;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

/** Visual tracks, bottom to top, that draw anything at all. */
export const visualTracks = (doc: VideoDocument): Track[] => doc.tracks.filter((t) => t.kind !== 'audio' && !t.hidden);

// ── painting ────────────────────────────────────────────────────────────────

function isReady(el: MediaSource | null): el is MediaSource {
  if (!el) return false;
  if (el instanceof HTMLImageElement) return el.complete && el.naturalWidth > 0;
  return el.readyState >= 2 && el.videoWidth > 0;
}

function drawMedia(ctx: CanvasRenderingContext2D, el: MediaSource, box: { x: number; y: number; w: number; h: number }) {
  const sw = el instanceof HTMLImageElement ? el.naturalWidth : el.videoWidth;
  const sh = el instanceof HTMLImageElement ? el.naturalHeight : el.videoHeight;
  const r = coverRect(sw, sh, box.w, box.h);
  ctx.drawImage(el, r.sx, r.sy, r.sw, r.sh, box.x, box.y, box.w, box.h);
}

function drawText(ctx: CanvasRenderingContext2D, clip: TextClip, W: number, box: { x: number; y: number; w: number; h: number }) {
  const s = clip.style;
  const px = Math.max(4, s.size * W);
  ctx.font = `${s.weight} ${px}px ${fontStack(s.font as FontKey)}`;
  try { ctx.letterSpacing = `${s.letterSpacing}em`; } catch { /* older browsers ignore */ }
  ctx.fillStyle = s.color;
  ctx.textBaseline = 'top';
  ctx.textAlign = s.align;
  const lines = wrapLines(clip.text, box.w, (t) => ctx.measureText(t).width);
  const lh = px * s.lineHeight;
  const x = s.align === 'left' ? box.x : s.align === 'right' ? box.x + box.w : box.x + box.w / 2;
  lines.forEach((line, i) => ctx.fillText(line, x, box.y + i * lh));
}

function drawMotionScene(ctx: CanvasRenderingContext2D, doc: VideoDocument, track: Track, clip: MotionSceneClip, localMs: number) {
  const fps = doc.fps;
  const frames = Math.max(1, Math.round((clip.durationMs * fps) / 1000));
  const scenes: DirectorScene[] = [];
  scenes[clip.sceneIndex] = { ...clip.scene, seconds: clip.durationMs / 1000 };
  /* The painter crossfades into the NEXT scene; give it the real neighbour when one is butted up against this clip. */
  const next = track.clips.find((c) => c.startMs === clipEndMs(clip));
  if (next && next.type === 'motion-scene') scenes[clip.sceneIndex + 1] = next.scene;
  const timeline: RenderTimeline = {
    fps,
    totalFrames: frames,
    totalSeconds: frames / fps,
    scenes: [{ index: clip.sceneIndex, frames, seconds: frames / fps, startFrame: 0, endFrame: frames }],
  };
  const look = clip.look;
  const opts: SceneFrameOptions = {
    businessName: look.businessName,
    directionLabel: look.directionLabel,
    hook: look.hook,
    cta: look.cta,
    aspect: aspectFor(doc.width, doc.height),
    fps,
    logoEmoji: look.logoEmoji,
    palette: look.palette,
    treatment: look.treatment,
    scenesCount: clip.sceneCount,
    background: look.background?.color,
    backgroundStrength: look.background ? look.background.strength / 100 : undefined,
  };
  drawSceneFrame(ctx, doc.width, doc.height, opts, scenes, timeline, Math.min(frames - 1, Math.floor((localMs * fps) / 1000)));
}

/** Paint the frame at `ms`. The canvas must already be doc.width x doc.height. */
export function drawVideoFrame(ctx: CanvasRenderingContext2D, doc: VideoDocument, ms: number, res: FrameResources): void {
  const W = doc.width;
  const H = doc.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  for (const track of visualTracks(doc)) {
    const clip = clipAt(track, ms);
    if (!clip) continue;
    const local = ms - clip.startMs;
    const enter = transitionProgress(clip, local);
    ctx.save();
    if (clip.type === 'motion-scene') {
      ctx.globalAlpha = enter;
      drawMotionScene(ctx, doc, track, clip, local);
      ctx.restore();
      continue;
    }
    if (clip.type !== 'media' && clip.type !== 'text') { ctx.restore(); continue; }
    const t = transformAt(clip, local);
    const slide = clip.transitionIn?.type === 'slide' ? (1 - ease('easeOut', enter)) * W : 0;
    const box = { x: t.x * W + slide, y: t.y * H, w: t.w * W, h: t.h * H };
    ctx.globalAlpha = Math.max(0, Math.min(1, t.opacity * (clip.transitionIn?.type === 'fade' ? enter : 1)));
    if (t.rotation) {
      ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
      ctx.rotate((t.rotation * Math.PI) / 180);
      ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2));
    }
    if (clip.type === 'media') {
      const el = res.media(clip.assetId);
      if (isReady(el)) drawMedia(ctx, el, box);
    } else {
      drawText(ctx, clip, W, box);
    }
    ctx.restore();
  }
}

/** Where a media element should be, in seconds, for a clip at timeline time `ms`. */
export function sourceSecondsAt(clip: { startMs: number; inMs: number }, ms: number): number {
  return (clip.inMs + Math.max(0, ms - clip.startMs)) / 1000;
}

/** An audio clip's gain at a moment: its volume shaped by its fades. */
export function audioGainAt(clip: { startMs: number; durationMs: number; volume: number; fadeInMs: number; fadeOutMs: number }, ms: number): number {
  const local = ms - clip.startMs;
  if (local < 0 || local >= clip.durationMs) return 0;
  let g = clip.volume;
  if (clip.fadeInMs > 0 && local < clip.fadeInMs) g *= local / clip.fadeInMs;
  const left = clip.durationMs - local;
  if (clip.fadeOutMs > 0 && left < clip.fadeOutMs) g *= left / clip.fadeOutMs;
  return Math.max(0, g);
}
