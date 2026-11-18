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

export type AssetKind = 'video' | 'image' | 'audio';

export interface VideoAsset {
  kind: AssetKind;
  /** Storage path in the `business-images` bucket, never a URL. */
  path: string;
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

export type TransitionType = 'cut' | 'fade' | 'slide';

interface ClipBase {
  id: string;
  startMs: number;
  durationMs: number;
  transitionIn?: { type: TransitionType; ms: number };
  keyframes?: Keyframe[];
}

/** A video or still image placed on the frame. */
export interface MediaClip extends ClipBase {
  type: 'media';
  assetId: string;
  /** Offset into the source where this clip begins. */
  inMs: number;
  transform: Transform;
  volume?: number;
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
}

export interface TextClip extends ClipBase {
  type: 'text';
  text: string;
  transform: Transform;
  style: TextClipStyle;
}

export interface AudioClip extends ClipBase {
  type: 'audio';
  assetId: string;
  inMs: number;
  volume: number;
  fadeInMs: number;
  fadeOutMs: number;
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
    if (!isObj(a) || !['video', 'image', 'audio'].includes(a.kind as string) || !isStr(a.path) || !a.path) {
      return { ok: false, reason: `Asset ${id} is damaged.` };
    }
    if (/^(https?:|data:|blob:)/i.test(a.path)) return { ok: false, reason: `Asset ${id} is a URL; projects store storage paths only.` };
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
