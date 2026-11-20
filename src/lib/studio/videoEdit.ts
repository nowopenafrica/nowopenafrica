/**
 * Timeline editing operations for Video Studio. Pure: each takes a document
 * and returns a new one, or the SAME object when the edit is refused or
 * changes nothing — the editor compares identity to decide whether an undo
 * step exists (the design editor's rule, for the same reason).
 *
 * Refusals are silent here and explained by the UI: a locked track, a track
 * that does not accept the clip type, or a move that would overlap another
 * clip. An overlapping move is refused rather than "resolved" by shoving the
 * neighbour along, which would move work the user did not touch.
 */

import {
  clipEndMs, MAX_DURATION_MS, MAX_SPEED, MIN_CLIP_MS, MIN_SPEED, speedOf, TRACK_ACCEPTS, videoId,
  type Clip, type Keyframe, type Track, type TrackKind, type VideoDocument,
} from './videoDocument';

export interface ClipRef { trackIndex: number; clipIndex: number; track: Track; clip: Clip }

export function findClip(doc: VideoDocument, clipId: string): ClipRef | null {
  for (let t = 0; t < doc.tracks.length; t++) {
    const c = doc.tracks[t].clips.findIndex((x) => x.id === clipId);
    if (c >= 0) return { trackIndex: t, clipIndex: c, track: doc.tracks[t], clip: doc.tracks[t].clips[c] };
  }
  return null;
}

const byStart = (a: Clip, b: Clip) => a.startMs - b.startMs;
const whole = (n: number) => Math.max(0, Math.round(n));

/** Whether [startMs, startMs + durationMs) is free on a track, ignoring one clip. */
export function isFree(track: Track, startMs: number, durationMs: number, ignoreId?: string): boolean {
  const end = startMs + durationMs;
  return track.clips.every((c) => c.id === ignoreId || end <= c.startMs || startMs >= clipEndMs(c));
}

export const trackEnd = (track: Track): number => track.clips.reduce((m, c) => Math.max(m, clipEndMs(c)), 0);

function withTrack(doc: VideoDocument, index: number, track: Track): VideoDocument {
  const tracks = doc.tracks.slice();
  tracks[index] = { ...track, clips: track.clips.slice().sort(byStart) };
  return { ...doc, tracks };
}

/**
 * TIMELINE time the asset can still fill after `inMs`, or Infinity for stills
 * and text. At 2x speed a clip uses its source twice as fast, so the same
 * source covers half the timeline.
 */
function sourceRemaining(doc: VideoDocument, clip: Clip, inMs: number): number {
  if (clip.type !== 'media' && clip.type !== 'audio') return Infinity;
  const asset = doc.assets[clip.assetId];
  if (!asset || asset.kind === 'image' || !asset.durationMs) return Infinity;
  return Math.max(0, Math.floor((asset.durationMs - inMs) / speedOf(clip)));
}

// ── snapping ────────────────────────────────────────────────────────────────

/** Every edge worth snapping to: zero, the playhead, and every other clip's start and end. */
export function snapPoints(doc: VideoDocument, excludeId: string | null, playheadMs: number): number[] {
  const pts = new Set<number>([0, whole(playheadMs)]);
  for (const t of doc.tracks) for (const c of t.clips) {
    if (c.id === excludeId) continue;
    pts.add(c.startMs);
    pts.add(clipEndMs(c));
  }
  return [...pts];
}

/** The nearest point within `thresholdMs`, else the value unchanged. */
export function snapMs(ms: number, points: number[], thresholdMs: number): number {
  let best = ms;
  let bestD = thresholdMs + 1;
  for (const p of points) {
    const d = Math.abs(p - ms);
    if (d <= thresholdMs && d < bestD) { best = p; bestD = d; }
  }
  return best;
}

// ── clip operations ─────────────────────────────────────────────────────────

/** Put a clip on a track at its own startMs, or at the track's end when that spot is taken. */
export function insertClip(doc: VideoDocument, trackId: string, clip: Clip): VideoDocument {
  const ti = doc.tracks.findIndex((t) => t.id === trackId);
  if (ti < 0) return doc;
  const track = doc.tracks[ti];
  if (track.locked || !TRACK_ACCEPTS[track.kind].includes(clip.type)) return doc;
  const start = isFree(track, whole(clip.startMs), clip.durationMs) ? whole(clip.startMs) : trackEnd(track);
  return withTrack(doc, ti, { ...track, clips: [...track.clips, { ...clip, startMs: start }] });
}

/** Move a clip in time and, optionally, to another track of a kind that accepts it. */
export function moveClip(doc: VideoDocument, clipId: string, startMs: number, toTrackId?: string): VideoDocument {
  const ref = findClip(doc, clipId);
  if (!ref || ref.track.locked) return doc;
  const start = whole(startMs);
  const ti = toTrackId ? doc.tracks.findIndex((t) => t.id === toTrackId) : ref.trackIndex;
  if (ti < 0) return doc;
  const target = doc.tracks[ti];
  if (target.locked || !TRACK_ACCEPTS[target.kind].includes(ref.clip.type)) return doc;
  if (ti === ref.trackIndex && start === ref.clip.startMs) return doc;
  if (!isFree(target, start, ref.clip.durationMs, clipId)) return doc;
  const moved = { ...ref.clip, startMs: start };
  if (ti === ref.trackIndex) {
    return withTrack(doc, ti, { ...target, clips: target.clips.map((c) => (c.id === clipId ? moved : c)) });
  }
  const left = withTrack(doc, ref.trackIndex, { ...ref.track, clips: ref.track.clips.filter((c) => c.id !== clipId) });
  return withTrack(left, ti, { ...target, clips: [...target.clips, moved] });
}

/**
 * Drag one edge of a clip. Bounded by the neighbours, by MIN_CLIP_MS and, for
 * footage and sound, by how much source there is — a trim cannot invent frames.
 */
export function trimClip(doc: VideoDocument, clipId: string, edge: 'start' | 'end', toMs: number): VideoDocument {
  const ref = findClip(doc, clipId);
  if (!ref || ref.track.locked) return doc;
  const { clip, track } = ref;
  const prevEnd = track.clips.filter((c) => c.id !== clipId && clipEndMs(c) <= clip.startMs).reduce((m, c) => Math.max(m, clipEndMs(c)), 0);
  const nextStart = track.clips.filter((c) => c.id !== clipId && c.startMs >= clipEndMs(clip)).reduce((m, c) => Math.min(m, c.startMs), Infinity);
  const inMs = clip.type === 'media' || clip.type === 'audio' ? clip.inMs : 0;
  const end = clipEndMs(clip);
  let next: Clip;

  const finiteSource = sourceRemaining(doc, clip, inMs) !== Infinity;
  if (edge === 'end') {
    const max = Math.min(nextStart, clip.startMs + sourceRemaining(doc, clip, inMs));
    const newEnd = Math.min(max, Math.max(clip.startMs + MIN_CLIP_MS, whole(toMs)));
    if (newEnd === end) return doc;
    next = { ...clip, durationMs: newEnd - clip.startMs };
  } else {
    /* Pulling the start earlier needs source before inMs; stills and text have no limit. */
    const speed = speedOf(clip);
    const earliest = Math.max(prevEnd, finiteSource ? clip.startMs - Math.floor(inMs / speed) : 0);
    const newStart = Math.max(earliest, Math.min(end - MIN_CLIP_MS, whole(toMs)));
    if (newStart === clip.startMs) return doc;
    const shift = newStart - clip.startMs;
    next = { ...clip, startMs: newStart, durationMs: end - newStart } as Clip;
    if (next.type === 'media' || next.type === 'audio') next.inMs = Math.max(0, Math.round(inMs + shift * speed));
    if (next.keyframes) next.keyframes = shiftKeyframes(next.keyframes, -shift, next.durationMs);
  }
  if (next.keyframes) next.keyframes = next.keyframes.filter((k) => k.tMs <= next.durationMs);
  return withTrack(doc, ref.trackIndex, { ...track, clips: track.clips.map((c) => (c.id === clipId ? next : c)) });
}

function shiftKeyframes(kfs: Keyframe[], by: number, durationMs: number): Keyframe[] {
  return kfs.map((k) => ({ ...k, tMs: k.tMs + by })).filter((k) => k.tMs >= 0 && k.tMs <= durationMs);
}

/** Cut a clip in two at a timeline moment. Refused unless both halves meet MIN_CLIP_MS. */
export function splitClip(doc: VideoDocument, clipId: string, atMs: number, newId: string = videoId('c')): VideoDocument {
  const ref = findClip(doc, clipId);
  if (!ref || ref.track.locked) return doc;
  const { clip } = ref;
  const at = whole(atMs);
  const leftMs = at - clip.startMs;
  const rightMs = clipEndMs(clip) - at;
  if (leftMs < MIN_CLIP_MS || rightMs < MIN_CLIP_MS) return doc;
  /* The cut is a hard cut on both sides: the exit belongs to the right half's end, the entrance to the left's start. */
  const left = { ...clip, durationMs: leftMs, transitionOut: undefined } as Clip;
  const right = { ...clip, id: newId, startMs: at, durationMs: rightMs, transitionIn: undefined } as Clip;
  if (right.type === 'media' || right.type === 'audio') right.inMs = Math.round((clip as { inMs: number }).inMs + leftMs * speedOf(clip));
  if (clip.keyframes) {
    left.keyframes = clip.keyframes.filter((k) => k.tMs <= leftMs);
    right.keyframes = shiftKeyframes(clip.keyframes, -leftMs, rightMs);
  }
  if (left.type === 'audio' && right.type === 'audio') { left.fadeOutMs = 0; right.fadeInMs = 0; }
  const clips = ref.track.clips.filter((c) => c.id !== clipId).concat(left, right);
  return withTrack(doc, ref.trackIndex, { ...ref.track, clips });
}

/** A copy straight after the original, or at the track's end when that spot is taken. */
export function duplicateClip(doc: VideoDocument, clipId: string, newId: string = videoId('c')): VideoDocument {
  const ref = findClip(doc, clipId);
  if (!ref || ref.track.locked) return doc;
  const copy = { ...JSON.parse(JSON.stringify(ref.clip)), id: newId, startMs: clipEndMs(ref.clip) } as Clip;
  return insertClip(doc, ref.track.id, copy);
}

export function deleteClip(doc: VideoDocument, clipId: string): VideoDocument {
  const ref = findClip(doc, clipId);
  if (!ref || ref.track.locked) return doc;
  return withTrack(doc, ref.trackIndex, { ...ref.track, clips: ref.track.clips.filter((c) => c.id !== clipId) });
}

/** Merge fields into a clip. Time fields go through move/trim, never here. */
export function updateClip<C extends Clip>(doc: VideoDocument, clipId: string, patch: Partial<Omit<C, 'id' | 'type' | 'startMs' | 'durationMs'>>): VideoDocument {
  const ref = findClip(doc, clipId);
  if (!ref || ref.track.locked) return doc;
  const next = { ...ref.clip, ...patch } as Clip;
  return withTrack(doc, ref.trackIndex, { ...ref.track, clips: ref.track.clips.map((c) => (c.id === clipId ? next : c)) });
}

/** Set a clip's length directly (the inspector's duration field), with the same bounds as a trim. */
export function setClipDuration(doc: VideoDocument, clipId: string, durationMs: number): VideoDocument {
  const ref = findClip(doc, clipId);
  if (!ref) return doc;
  return trimClip(doc, clipId, 'end', ref.clip.startMs + durationMs);
}

/**
 * Change a clip's speed the way phone editors do: the same stretch of source
 * plays faster or slower, so the clip gets shorter or longer on the timeline.
 * It never runs into the next clip: when it would, it ends where that clip
 * starts (a little less source is used).
 */
export function setClipSpeed(doc: VideoDocument, clipId: string, speed: number): VideoDocument {
  const ref = findClip(doc, clipId);
  if (!ref || ref.track.locked) return doc;
  const { clip, track } = ref;
  if (clip.type !== 'media' && clip.type !== 'audio') return doc;
  const next = Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(speed * 100) / 100));
  const old = speedOf(clip);
  if (next === old) return doc;
  const sourceSpan = clip.durationMs * old;
  const nextStart = track.clips.filter((c) => c.id !== clipId && c.startMs >= clipEndMs(clip)).reduce((m, c) => Math.min(m, c.startMs), Infinity);
  const wanted = Math.max(MIN_CLIP_MS, Math.round(sourceSpan / next));
  const durationMs = Math.max(MIN_CLIP_MS, Math.min(wanted, nextStart - clip.startMs, MAX_DURATION_MS));
  const updated = { ...clip, speed: next === 1 ? undefined : next, durationMs } as Clip;
  if (updated.keyframes) updated.keyframes = updated.keyframes.map((k) => ({ ...k, tMs: Math.min(durationMs, Math.round(k.tMs * (durationMs / clip.durationMs))) }));
  return withTrack(doc, ref.trackIndex, { ...track, clips: track.clips.map((c) => (c.id === clipId ? updated : c)) });
}

// ── tracks ──────────────────────────────────────────────────────────────────

const TRACK_NAMES: Record<TrackKind, string> = { video: 'Video', overlay: 'Overlay', text: 'Text', audio: 'Audio' };

export function addTrack(doc: VideoDocument, kind: TrackKind, id: string = videoId('t')): VideoDocument {
  const n = doc.tracks.filter((t) => t.kind === kind).length + 1;
  const track: Track = { id, kind, name: `${TRACK_NAMES[kind]} ${n}`, muted: false, locked: false, hidden: false, clips: [] };
  /* Visual tracks go above the other visual tracks; audio goes last. */
  const lastVisual = doc.tracks.map((t) => t.kind !== 'audio').lastIndexOf(true);
  const tracks = doc.tracks.slice();
  tracks.splice(kind === 'audio' ? tracks.length : lastVisual + 1, 0, track);
  return { ...doc, tracks };
}

/** Only an empty track can be removed: removing one with clips would delete work as a side effect. */
export function removeTrack(doc: VideoDocument, trackId: string): VideoDocument {
  const t = doc.tracks.find((x) => x.id === trackId);
  if (!t || t.clips.length > 0 || doc.tracks.length <= 1) return doc;
  return { ...doc, tracks: doc.tracks.filter((x) => x.id !== trackId) };
}

export function setTrackFlag(doc: VideoDocument, trackId: string, flag: 'muted' | 'locked' | 'hidden', value: boolean): VideoDocument {
  const ti = doc.tracks.findIndex((t) => t.id === trackId);
  if (ti < 0 || doc.tracks[ti][flag] === value) return doc;
  const tracks = doc.tracks.slice();
  tracks[ti] = { ...tracks[ti], [flag]: value };
  return { ...doc, tracks };
}

/** The first track that accepts a clip type and is not locked. */
export function firstTrackFor(doc: VideoDocument, type: Clip['type']): Track | null {
  return doc.tracks.find((t) => !t.locked && TRACK_ACCEPTS[t.kind].includes(type)) ?? null;
}
