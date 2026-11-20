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
  clipAt, clipEndMs, isEmbedAsset, MAX_SPEED, MIN_SPEED,
  type Clip, type Ease, type KeyframeProp, type MediaFit, type MotionSceneClip, type TextClip, type Track, type Transform, type VideoDocument,
} from './videoDocument';
import { clipTransitionLook, cssFilter, effectiveEffects, textAnimAt, type TransitionLook } from './videoEffects';

export type MediaSource = HTMLImageElement | HTMLVideoElement;

export interface FrameResources {
  /** The loaded element for an asset id, or null while it loads. */
  media: (assetId: string) => MediaSource | null;
  /**
   * True for a platform video (YouTube…) that the editor shows through the
   * platform's own player UNDER the canvas: the painter clears its box to
   * transparent so that player shows through, and clips on higher tracks
   * still paint over it. Omitted (export), such a clip draws nothing.
   */
  hole?: (assetId: string) => boolean;
}

export interface EmbedPlacement {
  clipId: string;
  assetId: string;
  /** Normalised 0..1, like a transform. */
  box: { x: number; y: number; w: number; h: number };
  opacity: number;
  /** Where in the source video this moment is. */
  sourceSeconds: number;
}

/** Platform videos showing at `ms`, bottom track first, for the editor's player layer. */
export function embedPlacementsAt(doc: VideoDocument, ms: number): EmbedPlacement[] {
  const out: EmbedPlacement[] = [];
  for (const track of visualTracks(doc)) {
    const clip = clipAt(track, ms);
    if (!clip || clip.type !== 'media' || !isEmbedAsset(doc.assets[clip.assetId])) continue;
    const local = ms - clip.startMs;
    const t = transformAt(clip, local);
    out.push({
      clipId: clip.id,
      assetId: clip.assetId,
      box: { x: t.x, y: t.y, w: t.w, h: t.h },
      opacity: Math.max(0, Math.min(1, t.opacity)),
      sourceSeconds: sourceSecondsAt(clip, ms),
    });
  }
  return out;
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

type Box = { x: number; y: number; w: number; h: number };

/** Fit a whole source inside a box (CSS object-fit: contain). */
export function containRect(srcW: number, srcH: number, box: Box): Box {
  if (srcW <= 0 || srcH <= 0) return box;
  const s = Math.min(box.w / srcW, box.h / srcH);
  const w = srcW * s;
  const h = srcH * s;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

function drawMedia(ctx: CanvasRenderingContext2D, el: MediaSource, box: Box, fit: MediaFit, filter: string, frameW: number) {
  const sw = el instanceof HTMLImageElement ? el.naturalWidth : el.videoWidth;
  const sh = el instanceof HTMLImageElement ? el.naturalHeight : el.videoHeight;
  if (fit === 'cover') {
    const r = coverRect(sw, sh, box.w, box.h);
    ctx.filter = filter;
    ctx.drawImage(el, r.sx, r.sy, r.sw, r.sh, box.x, box.y, box.w, box.h);
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  if (fit === 'blur-fill') {
    /* The same picture, enlarged to fill and blurred, behind the whole picture. */
    const r = coverRect(sw, sh, box.w, box.h);
    const blur = Math.max(8, Math.round(frameW * 0.03));
    ctx.filter = `${filter === 'none' ? '' : `${filter} `}blur(${blur}px) brightness(85%)`;
    ctx.drawImage(el, r.sx, r.sy, r.sw, r.sh, box.x - blur, box.y - blur, box.w + blur * 2, box.h + blur * 2);
  }
  const c = containRect(sw, sh, box);
  ctx.filter = filter;
  ctx.drawImage(el, 0, 0, sw, sh, c.x, c.y, c.w, c.h);
  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, box: Box, strength: number) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const r = Math.hypot(box.w, box.h) / 2;
  const g = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, strength)})`);
  ctx.filter = 'none';
  ctx.fillStyle = g;
  ctx.fillRect(box.x, box.y, box.w, box.h);
}

/** Deterministic grain: the same frame always gets the same speckle, so exports are repeatable. */
function drawGrain(ctx: CanvasRenderingContext2D, box: Box, strength: number, seed: number) {
  let s = (seed * 9301 + 49297) % 233280;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const dots = Math.round((box.w * box.h) / 900 * strength);
  ctx.filter = 'none';
  for (let i = 0; i < dots; i++) {
    const v = rnd() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.08 + rnd() * 0.12})`;
    ctx.fillRect(box.x + rnd() * box.w, box.y + rnd() * box.h, 1.5, 1.5);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawText(ctx: CanvasRenderingContext2D, clip: TextClip, W: number, box: Box, localMs: number) {
  const s = clip.style;
  const px = Math.max(4, s.size * W);
  const text = s.uppercase ? clip.text.toUpperCase() : clip.text;
  ctx.font = `${s.italic ? 'italic ' : ''}${s.weight} ${px}px ${fontStack(s.font as FontKey)}`;
  try { ctx.letterSpacing = `${s.letterSpacing}em`; } catch { /* older browsers ignore */ }
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const lines = wrapLines(text, box.w, (t) => ctx.measureText(t).width);
  const lh = px * s.lineHeight;
  const total = lines.reduce((n, l) => n + [...l].length, 0);
  const anim = textAnimAt(clip.animation, clip.durationMs, localMs, total);
  const b = anim.block;

  /* Animate the block around its own centre. */
  const cx = box.x + box.w / 2;
  const cy = box.y + Math.min(box.h, lines.length * lh) / 2;
  ctx.translate(cx + b.dx * px, cy + b.dy * px);
  if (b.rotation) ctx.rotate((b.rotation * Math.PI) / 180);
  ctx.scale(b.scale * b.scaleX, b.scale);
  ctx.translate(-cx, -cy);
  ctx.globalAlpha *= Math.max(0, Math.min(1, b.alpha));
  if (b.blur > 0.01) ctx.filter = `blur(${(b.blur * px).toFixed(1)}px)`;

  const widths = lines.map((l) => ctx.measureText(l).width);
  const lineX = (i: number) => (s.align === 'left' ? box.x : s.align === 'right' ? box.x + box.w - widths[i] : box.x + (box.w - widths[i]) / 2);

  if (s.background && s.background.opacity > 0 && lines.some((l) => l)) {
    const pad = s.background.padding * px;
    const minX = Math.min(...lines.map((_, i) => lineX(i)));
    const maxW = Math.max(...widths);
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * s.background.opacity;
    ctx.fillStyle = s.background.color;
    roundRect(ctx, minX - pad, box.y - pad, maxW + pad * 2, lines.length * lh + pad * 2 - (lh - px), s.background.radius * px);
    ctx.fill();
    ctx.globalAlpha = prevAlpha;
  }

  if (s.shadow || b.glow > 0) {
    ctx.shadowColor = b.glow > 0 ? s.color : s.shadow!.color;
    ctx.shadowBlur = b.glow > 0 ? px * (0.2 + 0.4 * b.glow) : s.shadow!.blur * px;
    ctx.shadowOffsetX = b.glow > 0 ? 0 : s.shadow!.x * px;
    ctx.shadowOffsetY = b.glow > 0 ? 0 : s.shadow!.y * px;
  }
  if (s.stroke && s.stroke.width > 0) {
    ctx.strokeStyle = s.stroke.color;
    ctx.lineWidth = s.stroke.width * px;
    ctx.lineJoin = 'round';
  }
  ctx.fillStyle = s.color;

  let shown = 0;
  lines.forEach((line, li) => {
    const y = box.y + li * lh;
    const chars = [...line];
    const allVisible = shown + chars.length <= anim.visibleChars;
    if (!anim.perChar && allVisible) {
      if (s.stroke && s.stroke.width > 0) ctx.strokeText(line, lineX(li), y);
      ctx.fillText(line, lineX(li), y);
      shown += chars.length;
      return;
    }
    /* Letter by letter: typewriter, staggered fades, waves. */
    let x = lineX(li);
    for (const ch of chars) {
      if (shown >= anim.visibleChars) return;
      const w = ctx.measureText(ch).width;
      const look = anim.perChar ? anim.perChar(shown, total) : { alpha: 1, dy: 0, scale: 1 };
      if (look.alpha > 0.001) {
        const a = ctx.globalAlpha;
        ctx.globalAlpha = a * look.alpha;
        const yy = y + look.dy * px;
        if (s.stroke && s.stroke.width > 0) ctx.strokeText(ch, x, yy);
        ctx.fillText(ch, x, yy);
        ctx.globalAlpha = a;
      }
      x += w;
      shown++;
    }
  });
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

/** Clip the drawing to the part of the box a wipe or circle has revealed so far. */
function applyReveal(ctx: CanvasRenderingContext2D, look: TransitionLook, box: Box) {
  const r = look.reveal;
  if (!r) return;
  ctx.beginPath();
  if (r.kind === 'rect') ctx.rect(box.x + r.x * box.w, box.y + r.y * box.h, r.w * box.w, r.h * box.h);
  else ctx.arc(box.x + box.w / 2, box.y + box.h / 2, (r.r * Math.hypot(box.w, box.h)) / 2, 0, Math.PI * 2);
  ctx.clip();
}

/** Paint the frame at `ms`. The canvas must already be doc.width x doc.height. */
export function drawVideoFrame(ctx: CanvasRenderingContext2D, doc: VideoDocument, ms: number, res: FrameResources): void {
  const W = doc.width;
  const H = doc.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  for (const track of visualTracks(doc)) {
    const clip = clipAt(track, ms);
    if (!clip) continue;
    const local = ms - clip.startMs;
    const look = clipTransitionLook(clip, local);
    ctx.save();
    ctx.filter = 'none';
    if (clip.type === 'motion-scene') {
      ctx.globalAlpha = look.alpha;
      ctx.translate(look.dx * W, look.dy * H);
      drawMotionScene(ctx, doc, track, clip, local);
      if (look.overlay) { ctx.globalAlpha = look.overlay.alpha; ctx.fillStyle = look.overlay.color; ctx.fillRect(0, 0, W, H); }
      ctx.restore();
      continue;
    }
    if (clip.type !== 'media' && clip.type !== 'text') { ctx.restore(); continue; }
    const t = transformAt(clip, local);
    const box = { x: t.x * W + look.dx * W, y: t.y * H + look.dy * H, w: t.w * W, h: t.h * H };
    ctx.globalAlpha = Math.max(0, Math.min(1, t.opacity * look.alpha));
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const rotation = t.rotation + look.rotation;
    if (rotation || look.scale !== 1) {
      ctx.translate(cx, cy);
      if (rotation) ctx.rotate((rotation * Math.PI) / 180);
      if (look.scale !== 1) ctx.scale(look.scale, look.scale);
      ctx.translate(-cx, -cy);
    }
    applyReveal(ctx, look, box);
    if (clip.type === 'media') {
      if (res.hole?.(clip.assetId)) {
        ctx.clearRect(box.x, box.y, box.w, box.h);
      } else {
        const el = res.media(clip.assetId);
        if (isReady(el)) {
          if (clip.flipX || clip.flipY) {
            ctx.translate(cx, cy);
            ctx.scale(clip.flipX ? -1 : 1, clip.flipY ? -1 : 1);
            ctx.translate(-cx, -cy);
          }
          drawMedia(ctx, el, box, clip.fit ?? 'cover', cssFilter(clip.effects, W, look.blur * W), W);
          const fx = effectiveEffects(clip.effects);
          if (fx.vignette) drawVignette(ctx, box, fx.vignette);
          if (fx.grain) drawGrain(ctx, box, fx.grain, Math.floor((ms * doc.fps) / 1000));
        }
      }
    } else {
      if (look.blur > 0) ctx.filter = `blur(${(look.blur * W).toFixed(1)}px)`;
      drawText(ctx, clip, W, box, local);
    }
    if (look.overlay) {
      ctx.filter = 'none';
      ctx.shadowColor = 'transparent';
      ctx.globalAlpha = look.overlay.alpha;
      ctx.fillStyle = look.overlay.color;
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    ctx.restore();
  }
}

/** Where a media element should be, in seconds, for a clip at timeline time `ms`. */
export function sourceSecondsAt(clip: { startMs: number; inMs: number; speed?: number; type?: Clip['type'] }, ms: number): number {
  const speed = clip.speed && Number.isFinite(clip.speed) ? Math.min(MAX_SPEED, Math.max(MIN_SPEED, clip.speed)) : 1;
  return (clip.inMs + Math.max(0, ms - clip.startMs) * speed) / 1000;
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
