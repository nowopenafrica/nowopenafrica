/**
 * Video Studio document — the editable timeline stored in
 * `design_projects.document` when `kind = 'video'`.
 *
 * Phase B of docs/superpowers/specs/2026-11-18-create-multi-studio-architecture.md.
 *
 * ── Rules this shape encodes ─────────────────────────────────────────────
 *
 * - **Time is integer milliseconds.** Float seconds drift on every split; an
 *   export renders frame N at N * 1000 / fps and asks which clip covers it.
 * - **Coordinates are normalised 0..1**, as in the design document, so a
 *   9:16 project resizes to 16:9 without rewriting every number.
 * - **Assets are references** (storage paths), never bytes. A timeline that
 *   embeds video would make autosave impossible.
 * - **Clips on one track never overlap.** Two clips claiming the same frame
 *   on one track have no defined answer for what is drawn; the reader
 *   refuses such a document rather than picking one.
 * - **A newer schemaVersion is refused**, never half-read: rendering it would
 *   drop what the newer build added and the next save would destroy it.
 *
 * The `motion-scene` clip is the bridge to the existing Motion Graphics
 * renderer (lib/renderVideo.ts). It carries a DirectorScene and the look the
 * painter needs, so every motion project converts with no visual loss and its
 * words stay editable through the scene's own per-element overrides.
 */

import type { DirectorScene, SceneTextElement } from '../creativeDirector';
import type { MotionStyle } from '../motionGraphics';
import type { MotionTreatment } from '../renderVideo';

export const VIDEO_SCHEMA_VERSION = 1;

export const VIDEO_FPS = [24, 25, 30, 60] as const;
export type VideoFps = (typeof VIDEO_FPS)[number];

/** Longest timeline the browser exporter is offered for (spec §2.3). */
export const MAX_DURATION_MS = 60_000 * 10;
export const MIN_CLIP_MS = 100;
export const MAX_PIXELS_PER_SIDE = 4096;
export const MIN_PIXELS_PER_SIDE = 16;

export type FrameSizeCheck = { ok: true; width: number; height: number } | { ok: false; reason: string };

/**
 * A custom frame size typed on the start screen, checked before a document
 * exists — the same bounds readVideoDocument enforces on load, so a size the
 * start screen accepts can always be saved and reopened.
 *
 * Even numbers only: H.264/MP4 (the Phase D export) encodes 4:2:0 chroma in
 * 2×2 blocks and refuses odd sides. Refusing now, with a reason, beats a
 * project that edits fine and cannot be exported later. Nothing is silently
 * rounded: the person gets the size they typed or is told why not.
 */
export function checkFrameSize(widthText: string, heightText: string): FrameSizeCheck {
  const parse = (s: string) => (/^\s*\d+\s*$/.test(s) ? Number(s) : NaN);
  const width = parse(widthText);
  const height = parse(heightText);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return { ok: false, reason: 'Enter the width and height as whole numbers of pixels.' };
  }
  const inRange = (n: number) => n >= MIN_PIXELS_PER_SIDE && n <= MAX_PIXELS_PER_SIDE;
  if (!inRange(width) || !inRange(height)) {
    return { ok: false, reason: `Each side must be between ${MIN_PIXELS_PER_SIDE} and ${MAX_PIXELS_PER_SIDE} px.` };
  }
  if (width % 2 !== 0 || height % 2 !== 0) {
    return { ok: false, reason: 'Use even numbers: video files cannot be made at an odd width or height.' };
  }
  return { ok: true, width, height };
}

export type AssetKind = 'video' | 'image' | 'audio';

export type LinkPlatform = 'youtube' | 'vimeo' | 'tiktok' | 'instagram' | 'facebook';
export const LINK_PLATFORMS: readonly LinkPlatform[] = ['youtube', 'vimeo', 'tiktok', 'instagram', 'facebook'];

/**
 * Media that plays from a pasted link rather than from NowOpen storage.
 *
 * - `platform` + `embedId`: a YouTube/Vimeo/TikTok/Instagram/Facebook video,
 *   shown through that platform's official player (never downloaded: their
 *   terms forbid it). The compositor leaves a transparent hole where it sits
 *   and the editor places the player under the canvas, so clips above it
 *   still draw over it. It cannot be in an exported file.
 * - `url` alone: a direct file link (.mp4, .jpg…), played from the link until
 *   a storage copy exists (`path`), which replaces it.
 */
export interface AssetLink {
  /** https only. */
  url: string;
  platform?: LinkPlatform;
  embedId?: string;
}

export interface VideoAsset {
  kind: AssetKind;
  /**
   * Storage path in the `business-images` bucket, never a URL. Absent only
   * while the asset still plays from `link`.
   */
  path?: string;
  link?: AssetLink;
  durationMs?: number;
  width?: number;
  height?: number;
  /** Low-resolution copy used for editing playback, when one was made. */
  proxyPath?: string;
}

export interface Transform {
  x: number; y: number; w: number; h: number;
  /** Degrees. */
  rotation: number;
  opacity: number;
}

export type KeyframeProp = 'x' | 'y' | 'w' | 'h' | 'rotation' | 'opacity';
export type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export interface Keyframe {
  prop: KeyframeProp;
  /** Relative to the clip's own start. */
  tMs: number;
  value: number;
  ease: Ease;
}

/**
 * How a clip arrives (`transitionIn`) or leaves (`transitionOut`). `slide` is
 * the original slide-from-the-right; the rest were added with the effects
 * panel. The painter maths for every one is in lib/studio/videoEffects.ts.
 */
export const TRANSITION_TYPES = [
  'cut', 'fade', 'slide', 'slide-left', 'slide-up', 'slide-down', 'zoom-in', 'zoom-out', 'spin',
  'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down', 'circle', 'blur', 'dip-black', 'dip-white', 'flash',
] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];
export interface Transition { type: TransitionType; ms: number }

/** Colour and look adjustments, CapCut's "Adjust" and "Filters". Neutral values change nothing. */
export interface ClipEffects {
  /** A named look from FILTER_PRESETS, applied under the sliders. */
  preset?: string;
  /** Percent, 100 = unchanged. */
  brightness?: number;
  contrast?: number;
  saturation?: number;
  /** Degrees. */
  hue?: number;
  /** Percent 0..100. */
  grayscale?: number;
  sepia?: number;
  invert?: number;
  /** Fraction of the frame width, 0..0.05. */
  blur?: number;
  /** 0..1: darkened edges. */
  vignette?: number;
  /** 0..1: film grain. */
  grain?: number;
}

interface ClipBase {
  id: string;
  startMs: number;
  durationMs: number;
  transitionIn?: Transition;
  transitionOut?: Transition;
  keyframes?: Keyframe[];
}

/**
 * How a picture fills its box: crop to fill, fit whole, or fit whole over a
 * blurred, enlarged copy of itself (the "blurred background" every phone
 * editor offers for a landscape clip in a vertical frame).
 */
export type MediaFit = 'cover' | 'contain' | 'blur-fill';

/** A video or still image placed on the frame. */
export interface MediaClip extends ClipBase {
  type: 'media';
  assetId: string;
  /** Offset into the source where this clip begins. */
  inMs: number;
  transform: Transform;
  volume?: number;
  /** Playback speed, 0.25..4; 1 when absent. Source used = timeline length x speed. */
  speed?: number;
  fit?: MediaFit;
  flipX?: boolean;
  flipY?: boolean;
  effects?: ClipEffects;
}

export interface TextClipStyle {
  /** A FontKey from lib/design/typefaces. */
  font: string;
  /** Fraction of the frame WIDTH, as in the design document. */
  size: number;
  weight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  lineHeight: number;
  italic?: boolean;
  uppercase?: boolean;
  /** Outline: colour and width as a fraction of the type size. */
  stroke?: { color: string; width: number };
  /** Drop shadow: offset and blur as fractions of the type size. */
  shadow?: { color: string; x: number; y: number; blur: number };
  /** A box behind the words: padding as a fraction of the type size, opacity 0..1. */
  background?: { color: string; opacity: number; padding: number; radius: number };
}

export const TEXT_ANIMS_IN = ['none', 'fade', 'typewriter', 'pop', 'rise', 'drop', 'slide-left', 'slide-right', 'zoom', 'blur-in', 'letters-fade', 'letters-rise', 'bounce', 'wave', 'flip'] as const;
export const TEXT_ANIMS_OUT = ['none', 'fade', 'shrink', 'sink', 'lift', 'slide-left', 'slide-right', 'blur-out', 'letters-fade', 'typewriter-erase'] as const;
export const TEXT_ANIMS_LOOP = ['none', 'pulse', 'float', 'shake', 'flicker', 'wiggle', 'glow'] as const;
export type TextAnimIn = (typeof TEXT_ANIMS_IN)[number];
export type TextAnimOut = (typeof TEXT_ANIMS_OUT)[number];
export type TextAnimLoop = (typeof TEXT_ANIMS_LOOP)[number];

export interface TextAnimation {
  in?: { type: TextAnimIn; ms: number };
  out?: { type: TextAnimOut; ms: number };
  loop?: TextAnimLoop;
}

export interface TextClip extends ClipBase {
  type: 'text';
  text: string;
  transform: Transform;
  style: TextClipStyle;
  animation?: TextAnimation;
}

export interface AudioClip extends ClipBase {
  type: 'audio';
  assetId: string;
  inMs: number;
  volume: number;
  fadeInMs: number;
  fadeOutMs: number;
  speed?: number;
}

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;
/** A clip's playback speed: 1 unless set, clamped to what the editor offers. */
export function speedOf(clip: Pick<Clip, 'type'> & { speed?: number }): number {
  if (clip.type !== 'media' && clip.type !== 'audio') return 1;
  const s = clip.speed;
  return typeof s === 'number' && Number.isFinite(s) ? Math.min(MAX_SPEED, Math.max(MIN_SPEED, s)) : 1;
}

/** Everything lib/renderVideo's scene painter needs besides the scene itself. */
export interface MotionLook {
  style: MotionStyle;
  treatment: MotionTreatment;
  palette: [string, string, string];
  businessName: string;
  directionLabel: string;
  hook: string;
  cta: string;
  logoEmoji: string;
  background?: { color: string; strength: number };
  templateKey?: string;
}

export interface MotionSceneClip extends ClipBase {
  type: 'motion-scene';
  /**
   * The storyboard scene. Its `seconds` is a stale copy from conversion: the
   * clip's `durationMs` is the only length that counts once on the timeline.
   */
  scene: DirectorScene;
  /** Position within the original storyboard: the painter varies motion by it. */
  sceneIndex: number;
  /** How many scenes the storyboard had: the last one draws the CTA. */
  sceneCount: number;
  look: MotionLook;
}

export type Clip = MediaClip | TextClip | AudioClip | MotionSceneClip;
export type ClipType = Clip['type'];

export type TrackKind = 'video' | 'overlay' | 'text' | 'audio';

/** Which clip types each track accepts. One place, so the reader and the editor agree. */
export const TRACK_ACCEPTS: Record<TrackKind, readonly ClipType[]> = {
  video: ['media', 'motion-scene'],
  overlay: ['media', 'text'],
  text: ['text'],
  audio: ['audio'],
};

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  locked: boolean;
  hidden: boolean;
  clips: Clip[];
}

export interface VideoDocument {
  schemaVersion: number;
  title: string;
  width: number;
  height: number;
  fps: VideoFps;
  /** Visual tracks paint bottom (index 0) to top. Audio tracks only mix. */
  tracks: Track[];
  assets: Record<string, VideoAsset>;
  /** Where this project came from. Provenance, not a live link. */
  source?: { kind: 'motion'; motionProjectId: string; templateKey?: string } | { kind: 'design'; projectId: string };
}

// ── construction ───────────────────────────────────────────────────────────

export function videoId(prefix = 'v'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function blankTrack(kind: TrackKind, name: string, id = videoId('t')): Track {
  return { id, kind, name, muted: false, locked: false, hidden: false, clips: [] };
}

export function blankVideoDocument(width = 1080, height = 1920, fps: VideoFps = 30, title = 'Untitled video'): VideoDocument {
  return {
    schemaVersion: VIDEO_SCHEMA_VERSION,
    title,
    width,
    height,
    fps,
    tracks: [blankTrack('video', 'Video 1'), blankTrack('text', 'Text 1'), blankTrack('audio', 'Audio 1')],
    assets: {},
  };
}

/** m:ss.s for the timeline and the transport. */
export function formatTime(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

export const clipEndMs = (c: Pick<Clip, 'startMs' | 'durationMs'>): number => c.startMs + c.durationMs;

/** The timeline ends where its last clip on any track ends. */
export function videoDurationMs(doc: Pick<VideoDocument, 'tracks'>): number {
  let end = 0;
  for (const t of doc.tracks) for (const c of t.clips) end = Math.max(end, clipEndMs(c));
  return end;
}

export function frameCount(doc: Pick<VideoDocument, 'tracks' | 'fps'>): number {
  return Math.ceil((videoDurationMs(doc) * doc.fps) / 1000);
}

/** The clip a track shows at a moment, or null. Ends are exclusive, so a cut has one owner. */
export function clipAt(track: Track, ms: number): Clip | null {
  for (const c of track.clips) if (ms >= c.startMs && ms < clipEndMs(c)) return c;
  return null;
}

// ── reading (validation) ───────────────────────────────────────────────────

type Read = { ok: true; doc: VideoDocument } | { ok: false; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

const CLIP_TYPES: readonly ClipType[] = ['media', 'text', 'audio', 'motion-scene'];
const TRACK_KINDS = Object.keys(TRACK_ACCEPTS) as TrackKind[];
const SCENE_ELEMENTS: readonly SceneTextElement[] = ['brand', 'title', 'subline', 'cta'];

function transformProblem(t: unknown): string | null {
  if (!isObj(t)) return 'has no transform';
  for (const k of ['x', 'y', 'w', 'h', 'rotation', 'opacity'] as const) if (!isNum(t[k])) return `has a transform without a numeric ${k}`;
  if ((t.w as number) <= 0 || (t.h as number) <= 0) return 'has a zero-sized transform';
  if ((t.opacity as number) < 0 || (t.opacity as number) > 1) return 'has an opacity outside 0..1';
  return null;
}

function clipProblem(c: unknown, assets: Record<string, VideoAsset>): string | null {
  if (!isObj(c)) return 'is not an object';
  if (!isStr(c.id) || !c.id) return 'has no id';
  if (!CLIP_TYPES.includes(c.type as ClipType)) return `has an unknown type "${String(c.type)}"`;
  if (!isInt(c.startMs)) return 'has a start that is not whole milliseconds';
  if (!isInt(c.durationMs, MIN_CLIP_MS)) return `is shorter than ${MIN_CLIP_MS} ms or not whole milliseconds`;
  if (c.keyframes !== undefined) {
    if (!Array.isArray(c.keyframes)) return 'has keyframes that are not a list';
    for (const k of c.keyframes) {
      if (!isObj(k) || !isNum(k.value) || !isInt(k.tMs) || (k.tMs as number) > (c.durationMs as number)) return 'has a keyframe outside the clip';
    }
  }
  for (const key of ['transitionIn', 'transitionOut'] as const) {
    const tr = c[key];
    if (tr === undefined) continue;
    if (!isObj(tr) || !(TRANSITION_TYPES as readonly string[]).includes(tr.type as string) || !isInt(tr.ms)) return `has a damaged ${key === 'transitionIn' ? 'entrance' : 'exit'}`;
  }
  if (c.speed !== undefined && (!isNum(c.speed) || (c.speed as number) < MIN_SPEED || (c.speed as number) > MAX_SPEED)) return `has a speed outside ${MIN_SPEED}..${MAX_SPEED}`;
  const needsAsset = c.type === 'media' || c.type === 'audio';
  if (needsAsset) {
    if (!isStr(c.assetId) || !assets[c.assetId]) return 'points at an asset the document does not list';
    if (!isInt(c.inMs)) return 'has a source offset that is not whole milliseconds';
    const asset = assets[c.assetId];
    if (c.type === 'audio' && asset.kind !== 'audio') return 'is an audio clip on a non-audio asset';
    if (c.type === 'media' && asset.kind === 'audio') return 'is a picture clip on an audio asset';
  }
  if (c.type === 'media' || c.type === 'text') {
    const p = transformProblem(c.transform);
    if (p) return p;
  }
  if (c.type === 'text') {
    if (!isStr(c.text)) return 'has no text';
    if (!isObj(c.style) || !isNum(c.style.size) || (c.style.size as number) <= 0) return 'has no text size';
  }
  if (c.type === 'audio') {
    if (!isNum(c.volume) || (c.volume as number) < 0 || (c.volume as number) > 2) return 'has a volume outside 0..2';
    if (!isInt(c.fadeInMs) || !isInt(c.fadeOutMs)) return 'has fades that are not whole milliseconds';
  }
  if (c.type === 'motion-scene') {
    if (!isObj(c.scene) || !isStr(c.scene.id) || !isStr(c.scene.text)) return 'has no scene';
    if (isObj(c.scene.elements) && Object.keys(c.scene.elements).some((k) => !SCENE_ELEMENTS.includes(k as SceneTextElement))) {
      return 'overrides a scene element that does not exist';
    }
    if (!isInt(c.sceneIndex) || !isInt(c.sceneCount, 1) || (c.sceneIndex as number) >= (c.sceneCount as number)) return 'has a scene position outside its storyboard';
    if (!isObj(c.look) || !Array.isArray(c.look.palette) || c.look.palette.length !== 3) return 'has no look';
  }
  return null;
}

function assetLinkProblem(l: unknown): string | null {
  if (!isObj(l) || !isStr(l.url)) return 'has a damaged link';
  let u: URL;
  try { u = new URL(l.url); } catch { return 'has a link that is not a URL'; }
  if (u.protocol !== 'https:') return 'has a link that is not https';
  if (l.platform !== undefined) {
    if (!LINK_PLATFORMS.includes(l.platform as LinkPlatform)) return 'has a link to an unknown platform';
    if (!isStr(l.embedId) || !/^[A-Za-z0-9_-]{1,64}$/.test(l.embedId)) return 'has a platform link without a video id';
  }
  return null;
}

/** A platform video (YouTube…) shown through its own player, never drawn by the compositor. */
export const isEmbedAsset = (a: VideoAsset | undefined): boolean => !!a?.link?.platform && !a.path;

export function readVideoDocument(raw: unknown): Read {
  if (!isObj(raw)) return { ok: false, reason: 'This video project is empty or damaged.' };
  if (!isInt(raw.schemaVersion, 1)) return { ok: false, reason: 'This video project has no schema version.' };
  if ((raw.schemaVersion as number) > VIDEO_SCHEMA_VERSION) {
    return { ok: false, reason: 'This video was saved by a newer version of Video Studio. Reload the page to update.' };
  }
  if (!isInt(raw.width, 16) || !isInt(raw.height, 16) || (raw.width as number) > MAX_PIXELS_PER_SIDE || (raw.height as number) > MAX_PIXELS_PER_SIDE) {
    return { ok: false, reason: `This video's frame size is outside 16..${MAX_PIXELS_PER_SIDE} px.` };
  }
  if (!(VIDEO_FPS as readonly number[]).includes(raw.fps as number)) return { ok: false, reason: `This video's frame rate must be one of ${VIDEO_FPS.join(', ')}.` };
  if (!Array.isArray(raw.tracks) || raw.tracks.length === 0) return { ok: false, reason: 'This video has no tracks.' };
  if (!isObj(raw.assets)) return { ok: false, reason: 'This video has no asset list.' };

  const assets = raw.assets as Record<string, VideoAsset>;
  for (const [id, a] of Object.entries(assets)) {
    if (!isObj(a) || !['video', 'image', 'audio'].includes(a.kind as string)) return { ok: false, reason: `Asset ${id} is damaged.` };
    const hasPath = isStr(a.path) && a.path.length > 0;
    if (a.path !== undefined && !hasPath) return { ok: false, reason: `Asset ${id} is damaged.` };
    if (hasPath && /^(https?:|data:|blob:)/i.test(a.path as string)) return { ok: false, reason: `Asset ${id} is a URL; projects store storage paths only.` };
    const linkProblem = a.link === undefined ? null : assetLinkProblem(a.link);
    if (linkProblem) return { ok: false, reason: `Asset ${id} ${linkProblem}.` };
    if (!hasPath && a.link === undefined) return { ok: false, reason: `Asset ${id} has no file and no link.` };
  }

  const clipIds = new Set<string>();
  const trackIds = new Set<string>();
  for (const [ti, t] of (raw.tracks as unknown[]).entries()) {
    if (!isObj(t) || !isStr(t.id) || !t.id) return { ok: false, reason: `Track ${ti + 1} has no id.` };
    if (trackIds.has(t.id)) return { ok: false, reason: `Two tracks share the id ${t.id}.` };
    trackIds.add(t.id);
    if (!TRACK_KINDS.includes(t.kind as TrackKind)) return { ok: false, reason: `Track ${ti + 1} has an unknown kind.` };
    if (!Array.isArray(t.clips)) return { ok: false, reason: `Track ${ti + 1} has no clip list.` };
    const accepts = TRACK_ACCEPTS[t.kind as TrackKind];
    let lastEnd = -1;
    for (const [ci, c] of (t.clips as unknown[]).entries()) {
      const p = clipProblem(c, assets);
      if (p) return { ok: false, reason: `Clip ${ci + 1} on track ${ti + 1} ${p}.` };
      const clip = c as Clip;
      if (!accepts.includes(clip.type)) return { ok: false, reason: `A ${clip.type} clip cannot sit on a ${String(t.kind)} track.` };
      if (clipIds.has(clip.id)) return { ok: false, reason: `Two clips share the id ${clip.id}.` };
      clipIds.add(clip.id);
      if (clip.startMs < lastEnd) return { ok: false, reason: `Clips on track ${ti + 1} overlap or are out of order.` };
      lastEnd = clipEndMs(clip);
    }
  }

  const doc = raw as unknown as VideoDocument;
  if (videoDurationMs(doc) > MAX_DURATION_MS) return { ok: false, reason: 'This video is longer than Video Studio supports.' };
  return { ok: true, doc: { ...doc, title: isStr(raw.title) && raw.title.trim() ? raw.title : 'Untitled video' } };
}
