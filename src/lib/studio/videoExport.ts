/**
 * Video Studio export: MP4 (H.264 + AAC), WebM, animated GIF, a PNG of one
 * frame, or every frame as PNGs in a ZIP.
 *
 * Every format is drawn by the SAME painter as the preview
 * (videoCompositor.drawVideoFrame), frame by frame, with each video element
 * seeked to the exact source time first. What was seen is what is saved.
 *
 *   * MP4: WebCodecs VideoEncoder (H.264) + AudioEncoder (AAC) into mp4-muxer.
 *     Frame-exact and faster than real time. The sound is a mix of every
 *     audio clip and the sound of every video clip, made offline with an
 *     OfflineAudioContext: volumes, fades and speed included.
 *   * WebM: the browser's own recorder, for browsers without WebCodecs. It
 *     records in real time, so a 30-second video takes 30 seconds.
 *   * GIF: lib/studio/gifEncoder.ts, no sound.
 *   * PNG / PNG ZIP: lossless stills.
 *
 * WHAT CANNOT BE EXPORTED, and the dialog says so before starting:
 *   * YouTube/Vimeo/TikTok… clips show only in their own player; they are
 *     left out (that part of the frame is black).
 *   * A file still playing from another site's link (not yet copied into
 *     NowOpen) cannot be read back by the browser, so export waits for it.
 */

import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { zipSync } from 'fflate';

import { drawVideoFrame, type MediaSource } from './videoCompositor';
import { clipAt, isEmbedAsset, speedOf, videoDurationMs, type VideoAsset, type VideoDocument } from './videoDocument';
import { GifEncoder } from './gifEncoder';

export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'png' | 'png-zip';
export type ExportQuality = 'small' | 'standard' | 'high';

export interface ExportOptions {
  format: ExportFormat;
  /** Target height of the SHORTER side in px, or 0 for the project's own size. */
  shortSide: number;
  fps: number;
  quality: ExportQuality;
  includeAudio: boolean;
  /** Timeline range; whole video when absent. PNG uses `startMs` as the frame. */
  startMs?: number;
  endMs?: number;
}

export const FORMAT_INFO: Record<ExportFormat, { label: string; ext: string; mime: string; note: string }> = {
  mp4: { label: 'MP4 video', ext: 'mp4', mime: 'video/mp4', note: 'Plays everywhere: Instagram, TikTok, WhatsApp, YouTube.' },
  webm: { label: 'WebM video', ext: 'webm', mime: 'video/webm', note: 'For the web. Records in real time.' },
  gif: { label: 'GIF animation', ext: 'gif', mime: 'image/gif', note: 'Loops, no sound. Best short and small.' },
  png: { label: 'PNG image', ext: 'png', mime: 'image/png', note: 'The frame under the playhead.' },
  'png-zip': { label: 'PNG frames (ZIP)', ext: 'zip', mime: 'application/zip', note: 'Every frame as a lossless image.' },
};

/** Bits per pixel per frame for H.264 / VP9 at each quality. */
const BPP: Record<ExportQuality, number> = { small: 0.05, standard: 0.09, high: 0.16 };

/** Output size: the project's shape at the chosen shorter side, even numbers (H.264 needs them). */
export function outputSize(doc: Pick<VideoDocument, 'width' | 'height'>, shortSide: number, maxSide = 3840): { width: number; height: number } {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const short = Math.min(doc.width, doc.height);
  let scale = shortSide > 0 ? shortSide / short : 1;
  if (Math.max(doc.width, doc.height) * scale > maxSide) scale = maxSide / Math.max(doc.width, doc.height);
  return { width: even(doc.width * scale), height: even(doc.height * scale) };
}

export function bitrateFor(width: number, height: number, fps: number, quality: ExportQuality): number {
  return Math.round(Math.min(40_000_000, Math.max(500_000, width * height * fps * BPP[quality])));
}

/** Rough file size in bytes, for the dialog. */
export function estimateBytes(opts: ExportOptions, size: { width: number; height: number }, durationMs: number): number {
  const s = durationMs / 1000;
  switch (opts.format) {
    case 'mp4':
    case 'webm': return (bitrateFor(size.width, size.height, opts.fps, opts.quality) * s) / 8 + (opts.includeAudio ? (128_000 * s) / 8 : 0);
    case 'gif': return size.width * size.height * opts.fps * s * 0.35;
    case 'png': return size.width * size.height * 1.5;
    case 'png-zip': return size.width * size.height * 1.5 * opts.fps * s;
  }
}

export interface ExportProblems {
  /** Stops the export. */
  blocking: string[];
  /** Told, then the export goes ahead. */
  warnings: string[];
}

/** What would go wrong, before anything starts. */
export function checkExport(doc: VideoDocument, opts: ExportOptions, support: { webCodecs: boolean; mediaRecorder: boolean }): ExportProblems {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const used = new Set<string>();
  for (const t of doc.tracks) for (const c of t.clips) if (c.type === 'media' || c.type === 'audio') used.add(c.assetId);
  const assets = [...used].map((id) => doc.assets[id]).filter(Boolean) as VideoAsset[];
  if (assets.some(isEmbedAsset)) warnings.push('YouTube, Vimeo and other platform videos only play in their own player, so they are left out of the file (black where they were).');
  if (assets.some((a) => !a.path && !isEmbedAsset(a))) blocking.push('A clip is still playing from another site’s link. Upload that file (or wait until it has been copied into your files), then export.');
  if (videoDurationMs(doc) === 0 && opts.format !== 'png') blocking.push('The timeline is empty.');
  if (opts.format === 'mp4' && !support.webCodecs) blocking.push('This browser cannot make MP4 files. Use Chrome or Edge, or choose WebM.');
  if (opts.format === 'webm' && !support.mediaRecorder) blocking.push('This browser cannot record WebM. Choose MP4 or GIF.');
  if (opts.format === 'gif') {
    const len = (opts.endMs ?? videoDurationMs(doc)) - (opts.startMs ?? 0);
    if (len > 30_000) warnings.push('GIFs over 30 seconds get very large. MP4 is usually better for long clips.');
  }
  return { blocking, warnings };
}

export interface ExportContext {
  /** Public URL of a stored asset. */
  urlFor: (path: string) => string;
  onProgress?: (fraction: number, stage: string) => void;
  signal?: AbortSignal;
}

export class ExportCancelled extends Error { constructor() { super('Export cancelled.'); } }

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

// ── media for export (separate from the preview's, so the preview is not disturbed) ──

async function loadMedia(doc: VideoDocument, ctx: ExportContext): Promise<Map<string, HTMLImageElement | HTMLVideoElement>> {
  const map = new Map<string, HTMLImageElement | HTMLVideoElement>();
  const used = new Set<string>();
  for (const t of doc.tracks) if (t.kind !== 'audio') for (const c of t.clips) if (c.type === 'media') used.add(c.assetId);
  await Promise.all([...used].map(async (id) => {
    const a = doc.assets[id];
    if (!a || !a.path || a.kind === 'audio') return;
    /* The original, never the editing proxy: the file gets full quality. */
    const url = ctx.urlFor(a.path);
    if (a.kind === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('An image could not be loaded for export.')); img.src = url; });
      map.set(id, img);
    } else {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.muted = true;
      v.preload = 'auto';
      v.playsInline = true;
      await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('A video could not be loaded for export.')); v.src = url; });
      map.set(id, v);
    }
  }));
  return map;
}

function seek(v: HTMLVideoElement, seconds: number): Promise<void> {
  const t = Math.max(0, Math.min(seconds, (v.duration || seconds) - 0.001));
  if (Math.abs(v.currentTime - t) < 0.0005 && v.readyState >= 2) return Promise.resolve();
  return new Promise((res) => {
    const done = () => { v.removeEventListener('seeked', done); clearTimeout(timer); res(); };
    const timer = setTimeout(done, 4000);
    v.addEventListener('seeked', done);
    v.currentTime = t;
  });
}

/** Seek every video showing at `ms` to its exact source time. */
async function prepareFrame(doc: VideoDocument, ms: number, media: Map<string, HTMLImageElement | HTMLVideoElement>): Promise<void> {
  const waits: Promise<void>[] = [];
  for (const t of doc.tracks) {
    if (t.kind === 'audio' || t.hidden) continue;
    const c = clipAt(t, ms);
    if (!c || c.type !== 'media') continue;
    const el = media.get(c.assetId);
    if (el instanceof HTMLVideoElement) waits.push(seek(el, (c.inMs + (ms - c.startMs) * speedOf(c)) / 1000));
  }
  await Promise.all(waits);
}

function renderer(doc: VideoDocument, size: { width: number; height: number }, media: Map<string, HTMLImageElement | HTMLVideoElement>) {
  const full = document.createElement('canvas');
  full.width = doc.width;
  full.height = doc.height;
  const fctx = full.getContext('2d')!;
  const out = document.createElement('canvas');
  out.width = size.width;
  out.height = size.height;
  const octx = out.getContext('2d', { willReadFrequently: true })!;
  octx.imageSmoothingQuality = 'high';
  const draw = async (ms: number) => {
    await prepareFrame(doc, ms, media);
    drawVideoFrame(fctx, doc, ms, { media: (id) => (media.get(id) as MediaSource | undefined) ?? null });
    octx.drawImage(full, 0, 0, size.width, size.height);
  };
  return { canvas: out, ctx: octx, draw };
}

// ── sound ───────────────────────────────────────────────────────────────────

/**
 * Mix every audible clip in [startMs, endMs) into one stereo buffer.
 * Video clips contribute their own sound; a source with no sound (or one the
 * browser cannot decode) is skipped and reported.
 */
export async function mixAudio(doc: VideoDocument, ctx: ExportContext, startMs: number, endMs: number, sampleRate = 48_000): Promise<{ buffer: AudioBuffer | null; skipped: number }> {
  const length = Math.max(1, Math.ceil(((endMs - startMs) / 1000) * sampleRate));
  type Item = { assetId: string; startMs: number; durationMs: number; inMs: number; speed: number; volume: number; fadeInMs: number; fadeOutMs: number };
  const items: Item[] = [];
  for (const t of doc.tracks) {
    if (t.muted || (t.kind !== 'audio' && t.hidden)) continue;
    for (const c of t.clips) {
      if (c.type === 'audio') items.push({ assetId: c.assetId, startMs: c.startMs, durationMs: c.durationMs, inMs: c.inMs, speed: speedOf(c), volume: c.volume, fadeInMs: c.fadeInMs, fadeOutMs: c.fadeOutMs });
      else if (c.type === 'media' && doc.assets[c.assetId]?.kind === 'video' && (c.volume ?? 1) > 0) {
        items.push({ assetId: c.assetId, startMs: c.startMs, durationMs: c.durationMs, inMs: c.inMs, speed: speedOf(c), volume: c.volume ?? 1, fadeInMs: 0, fadeOutMs: 0 });
      }
    }
  }
  const audible = items.filter((i) => i.startMs < endMs && i.startMs + i.durationMs > startMs && doc.assets[i.assetId]?.path);
  if (audible.length === 0) return { buffer: null, skipped: 0 };

  const off = new OfflineAudioContext(2, length, sampleRate);
  const decoded = new Map<string, AudioBuffer | null>();
  let skipped = 0;
  for (const id of new Set(audible.map((i) => i.assetId))) {
    if (ctx.signal?.aborted) throw new ExportCancelled();
    try {
      const res = await fetch(ctx.urlFor(doc.assets[id].path!), { signal: ctx.signal });
      decoded.set(id, await off.decodeAudioData(await res.arrayBuffer()));
    } catch {
      if (ctx.signal?.aborted) throw new ExportCancelled();
      decoded.set(id, null);
      skipped++;
    }
  }
  for (const i of audible) {
    const buf = decoded.get(i.assetId);
    if (!buf) continue;
    const src = off.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = i.speed;
    const gain = off.createGain();
    const at = (i.startMs - startMs) / 1000;
    const begin = Math.max(0, at);
    const skipIn = Math.max(0, -at);
    const playFor = Math.min(i.durationMs / 1000 - skipIn, (endMs - Math.max(i.startMs, startMs)) / 1000);
    if (playFor <= 0) continue;
    gain.gain.setValueAtTime(i.fadeInMs > 0 && skipIn === 0 ? 0 : i.volume, begin);
    if (i.fadeInMs > 0 && skipIn === 0) gain.gain.linearRampToValueAtTime(i.volume, begin + i.fadeInMs / 1000);
    if (i.fadeOutMs > 0) {
      const endAt = at + i.durationMs / 1000;
      gain.gain.setValueAtTime(i.volume, Math.max(begin, endAt - i.fadeOutMs / 1000));
      gain.gain.linearRampToValueAtTime(0, endAt);
    }
    src.connect(gain).connect(off.destination);
    src.start(begin, (i.inMs / 1000) + skipIn * i.speed, playFor * i.speed);
  }
  return { buffer: await off.startRendering(), skipped };
}

// ── formats ─────────────────────────────────────────────────────────────────

async function pickAvc(width: number, height: number, fps: number, bitrate: number): Promise<VideoEncoderConfig | null> {
  for (const codec of ['avc1.640034', 'avc1.640028', 'avc1.4d4028', 'avc1.42E01F']) {
    const config: VideoEncoderConfig = { codec, width, height, bitrate, framerate: fps, avc: { format: 'avc' } };
    try { if ((await VideoEncoder.isConfigSupported(config)).supported) return config; } catch { /* try the next */ }
  }
  return null;
}

async function exportMp4(doc: VideoDocument, opts: ExportOptions, ctx: ExportContext, size: { width: number; height: number }, startMs: number, endMs: number): Promise<{ blob: Blob; notes: string[] }> {
  const notes: string[] = [];
  const bitrate = bitrateFor(size.width, size.height, opts.fps, opts.quality);
  const vconf = await pickAvc(size.width, size.height, opts.fps, bitrate);
  if (!vconf) throw new Error(`This browser cannot encode H.264 at ${size.width}×${size.height}. Try a smaller size, or WebM.`);

  let audio: AudioBuffer | null = null;
  if (opts.includeAudio) {
    ctx.onProgress?.(0, 'Mixing sound');
    const mixed = await mixAudio(doc, ctx, startMs, endMs);
    audio = mixed.buffer;
    if (mixed.skipped) notes.push(`${mixed.skipped} clip${mixed.skipped === 1 ? '' : 's'} had no sound the browser could read and are silent.`);
  }
  let aconf: AudioEncoderConfig | null = null;
  if (audio && typeof AudioEncoder !== 'undefined') {
    const c: AudioEncoderConfig = { codec: 'mp4a.40.2', sampleRate: audio.sampleRate, numberOfChannels: 2, bitrate: 128_000 };
    try { if ((await AudioEncoder.isConfigSupported(c)).supported) aconf = c; } catch { /* no AAC */ }
    if (!aconf) notes.push('This browser cannot encode AAC sound, so the MP4 is silent.');
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: size.width, height: size.height, frameRate: opts.fps },
    ...(aconf ? { audio: { codec: 'aac' as const, numberOfChannels: 2, sampleRate: aconf.sampleRate } } : {}),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let failure: Error | null = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e; } });
  venc.configure(vconf);

  const media = await loadMedia(doc, ctx);
  const r = renderer(doc, size, media);
  const frames = Math.max(1, Math.round(((endMs - startMs) * opts.fps) / 1000));
  const frameUs = 1_000_000 / opts.fps;
  for (let i = 0; i < frames; i++) {
    if (ctx.signal?.aborted) { venc.close(); throw new ExportCancelled(); }
    if (failure) throw failure;
    await r.draw(startMs + (i * 1000) / opts.fps);
    const frame = new VideoFrame(r.canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
    venc.encode(frame, { keyFrame: i % (opts.fps * 2) === 0 });
    frame.close();
    while (venc.encodeQueueSize > 6) await tick();
    ctx.onProgress?.((i + 1) / frames * (aconf ? 0.92 : 0.98), 'Drawing frames');
  }
  await venc.flush();
  venc.close();

  if (audio && aconf) {
    ctx.onProgress?.(0.94, 'Encoding sound');
    const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { failure = e; } });
    aenc.configure(aconf);
    const L = audio.getChannelData(0);
    const R = audio.numberOfChannels > 1 ? audio.getChannelData(1) : L;
    const step = 4096;
    for (let at = 0; at < audio.length; at += step) {
      const n = Math.min(step, audio.length - at);
      const planar = new Float32Array(n * 2);
      planar.set(L.subarray(at, at + n), 0);
      planar.set(R.subarray(at, at + n), n);
      const data = new AudioData({ format: 'f32-planar', sampleRate: audio.sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((at / audio.sampleRate) * 1_000_000), data: planar });
      aenc.encode(data);
      data.close();
    }
    await aenc.flush();
    aenc.close();
  }
  if (failure) throw failure;
  muxer.finalize();
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), notes };
}

async function exportWebm(doc: VideoDocument, opts: ExportOptions, ctx: ExportContext, size: { width: number; height: number }, startMs: number, endMs: number): Promise<{ blob: Blob; notes: string[] }> {
  const notes: string[] = [];
  const media = await loadMedia(doc, ctx);
  const r = renderer(doc, size, media);
  const stream = r.canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;

  let audioCtx: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  if (opts.includeAudio) {
    ctx.onProgress?.(0, 'Mixing sound');
    const mixed = await mixAudio(doc, ctx, startMs, endMs);
    if (mixed.skipped) notes.push(`${mixed.skipped} clip${mixed.skipped === 1 ? '' : 's'} had no sound the browser could read and are silent.`);
    if (mixed.buffer) {
      audioCtx = new AudioContext({ sampleRate: mixed.buffer.sampleRate });
      const dest = audioCtx.createMediaStreamDestination();
      source = audioCtx.createBufferSource();
      source.buffer = mixed.buffer;
      source.connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }
  }
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrateFor(size.width, size.height, opts.fps, opts.quality) });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });

  /* Real time: each frame is held for its own duration, so the recorder's clock matches the video's. */
  await r.draw(startMs);
  rec.start(1000);
  source?.start();
  const t0 = performance.now();
  const frames = Math.max(1, Math.round(((endMs - startMs) * opts.fps) / 1000));
  for (let i = 0; i < frames; i++) {
    if (ctx.signal?.aborted) { rec.stop(); source?.stop(); await audioCtx?.close(); throw new ExportCancelled(); }
    await r.draw(startMs + (i * 1000) / opts.fps);
    track.requestFrame();
    ctx.onProgress?.((i + 1) / frames, 'Recording (real time)');
    const due = t0 + ((i + 1) * 1000) / opts.fps;
    const wait = due - performance.now();
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));
  }
  rec.stop();
  source?.stop();
  await stopped;
  await audioCtx?.close();
  return { blob: new Blob(chunks, { type: 'video/webm' }), notes };
}

async function exportGif(doc: VideoDocument, opts: ExportOptions, ctx: ExportContext, size: { width: number; height: number }, startMs: number, endMs: number): Promise<Blob> {
  const media = await loadMedia(doc, ctx);
  const r = renderer(doc, size, media);
  const gif = new GifEncoder(size.width, size.height);
  const frames = Math.max(1, Math.round(((endMs - startMs) * opts.fps) / 1000));
  for (let i = 0; i < frames; i++) {
    if (ctx.signal?.aborted) throw new ExportCancelled();
    await r.draw(startMs + (i * 1000) / opts.fps);
    gif.addFrame(r.ctx.getImageData(0, 0, size.width, size.height).data, 100 / opts.fps);
    ctx.onProgress?.((i + 1) / frames, 'Drawing frames');
    await tick();
  }
  return new Blob([gif.finish()], { type: 'image/gif' });
}

const canvasPng = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('The frame could not be saved.'))), 'image/png'));

async function exportPng(doc: VideoDocument, ctx: ExportContext, size: { width: number; height: number }, atMs: number): Promise<Blob> {
  const r = renderer(doc, size, await loadMedia(doc, ctx));
  await r.draw(atMs);
  return canvasPng(r.canvas);
}

async function exportPngZip(doc: VideoDocument, opts: ExportOptions, ctx: ExportContext, size: { width: number; height: number }, startMs: number, endMs: number): Promise<Blob> {
  const r = renderer(doc, size, await loadMedia(doc, ctx));
  const files: Record<string, Uint8Array> = {};
  const frames = Math.max(1, Math.round(((endMs - startMs) * opts.fps) / 1000));
  const pad = String(frames).length;
  for (let i = 0; i < frames; i++) {
    if (ctx.signal?.aborted) throw new ExportCancelled();
    await r.draw(startMs + (i * 1000) / opts.fps);
    files[`frame-${String(i + 1).padStart(Math.max(4, pad), '0')}.png`] = new Uint8Array(await (await canvasPng(r.canvas)).arrayBuffer());
    ctx.onProgress?.((i + 1) / frames * 0.95, 'Drawing frames');
  }
  ctx.onProgress?.(0.97, 'Packing ZIP');
  /* PNGs are already compressed: store, do not deflate again. */
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' });
}

export async function exportVideo(doc: VideoDocument, opts: ExportOptions, ctx: ExportContext): Promise<{ blob: Blob; filename: string; notes: string[] }> {
  const size = outputSize(doc, opts.shortSide, opts.format === 'gif' ? 1080 : 3840);
  const startMs = Math.max(0, opts.startMs ?? 0);
  const endMs = Math.min(videoDurationMs(doc), opts.endMs ?? videoDurationMs(doc));
  const base = doc.title.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'video';
  const name = `${base}-${size.width}x${size.height}.${FORMAT_INFO[opts.format].ext}`;
  let blob: Blob;
  let notes: string[] = [];
  switch (opts.format) {
    case 'mp4': ({ blob, notes } = await exportMp4(doc, opts, ctx, size, startMs, endMs)); break;
    case 'webm': ({ blob, notes } = await exportWebm(doc, opts, ctx, size, startMs, endMs)); break;
    case 'gif': blob = await exportGif(doc, opts, ctx, size, startMs, endMs); break;
    case 'png': blob = await exportPng(doc, ctx, size, startMs); break;
    case 'png-zip': blob = await exportPngZip(doc, opts, ctx, size, startMs, endMs); break;
  }
  ctx.onProgress?.(1, 'Done');
  return { blob, filename: name, notes };
}
