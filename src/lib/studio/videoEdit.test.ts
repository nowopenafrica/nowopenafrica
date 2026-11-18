import { describe, expect, it } from 'vitest';
import { blankVideoDocument, readVideoDocument, type MediaClip, type TextClip, type VideoDocument } from './videoDocument';
import {
  addTrack, deleteClip, duplicateClip, findClip, insertClip, moveClip, removeTrack,
  setTrackFlag, snapMs, snapPoints, splitClip, trimClip,
} from './videoEdit';

const tf = { x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1 };
const text = (id: string, startMs: number, durationMs: number): TextClip => ({
  id, type: 'text', startMs, durationMs, text: id, transform: tf,
  style: { font: 'sans', size: 0.05, weight: 700, color: '#fff', align: 'center', letterSpacing: 0, lineHeight: 1.1 },
});
const media = (id: string, startMs: number, durationMs: number, inMs = 0): MediaClip => ({
  id, type: 'media', startMs, durationMs, assetId: 'vid', inMs, transform: tf,
});

function doc(): VideoDocument {
  const d = blankVideoDocument();
  d.tracks = d.tracks.map((t, i) => ({ ...t, id: ['video-1', 'text-1', 'audio-1'][i] }));
  d.assets.vid = { kind: 'video', path: 'u/studio/v.mp4', durationMs: 10_000 };
  d.assets.pic = { kind: 'image', path: 'u/studio/p.png' };
  return d;
}
const VIDEO = 0, TEXT = 1;
const ids = (d: VideoDocument, t: number) => d.tracks[t].clips.map((c) => `${c.id}@${c.startMs}+${c.durationMs}`);
const valid = (d: VideoDocument) => expect(readVideoDocument(JSON.parse(JSON.stringify(d))).ok).toBe(true);

describe('insert / move', () => {
  it('inserts at the requested time, or at the track end when taken', () => {
    let d = insertClip(doc(), 'text-1', text('a', 0, 1000));
    d = insertClip(d, d.tracks[TEXT].id, text('b', 500, 1000));
    expect(ids(d, TEXT)).toEqual(['a@0+1000', 'b@1000+1000']);
    valid(d);
  });

  it('refuses a clip type the track does not accept', () => {
    const d = doc();
    expect(insertClip(d, d.tracks[2].id, text('a', 0, 1000))).toBe(d);
  });

  it('refuses a move that would overlap, and returns the same object', () => {
    let d = insertClip(doc(), 'text-1', text('a', 0, 1000));
    d = insertClip(d, d.tracks[TEXT].id, text('b', 2000, 1000));
    expect(moveClip(d, 'b', 500)).toBe(d);
    expect(moveClip(d, 'b', 2000)).toBe(d);
    const moved = moveClip(d, 'b', 1000);
    expect(ids(moved, TEXT)).toEqual(['a@0+1000', 'b@1000+1000']);
  });

  it('moves across tracks only to a kind that accepts the clip', () => {
    let d = addTrack(doc(), 'text', 'text-2');
    d = insertClip(d, d.tracks[TEXT].id, text('a', 0, 1000));
    expect(moveClip(d, 'a', 0, d.tracks[VIDEO].id)).toBe(d);
    const m = moveClip(d, 'a', 300, 'text-2');
    expect(findClip(m, 'a')?.track.id).toBe('text-2');
    expect(m.tracks[TEXT].clips).toHaveLength(0);
    valid(m);
  });

  it('does nothing on a locked track', () => {
    let d = insertClip(doc(), 'text-1', text('a', 0, 1000));
    d = setTrackFlag(d, d.tracks[TEXT].id, 'locked', true);
    expect(moveClip(d, 'a', 400)).toBe(d);
    expect(deleteClip(d, 'a')).toBe(d);
    expect(splitClip(d, 'a', 500)).toBe(d);
  });
});

describe('trim', () => {
  it('is bounded by the neighbour and the minimum length', () => {
    let d = insertClip(doc(), 'text-1', text('a', 0, 1000));
    d = insertClip(d, d.tracks[TEXT].id, text('b', 1500, 1000));
    expect(ids(trimClip(d, 'a', 'end', 9000), TEXT)[0]).toBe('a@0+1500');
    expect(ids(trimClip(d, 'a', 'end', 0), TEXT)[0]).toBe('a@0+100');
    expect(ids(trimClip(d, 'b', 'start', 0), TEXT)[1]).toBe('b@1000+1500');
  });

  it('cannot invent footage past the end of the source', () => {
    let d = doc();
    d = insertClip(d, d.tracks[VIDEO].id, media('m', 0, 4000, 7000));
    const t = trimClip(d, 'm', 'end', 9000);
    expect(findClip(t, 'm')?.clip.durationMs).toBe(3000);
  });

  it('moves the source offset with a start trim, and cannot go before the source start', () => {
    let d = doc();
    d = insertClip(d, d.tracks[VIDEO].id, media('m', 2000, 3000, 500));
    const later = findClip(trimClip(d, 'm', 'start', 2600), 'm')!.clip as MediaClip;
    expect([later.startMs, later.durationMs, later.inMs]).toEqual([2600, 2400, 1100]);
    const earlier = findClip(trimClip(d, 'm', 'start', 0), 'm')!.clip as MediaClip;
    expect([earlier.startMs, earlier.inMs]).toEqual([1500, 0]);
  });
});

describe('split / duplicate / delete', () => {
  it('splits into two clips that together cover the original, source continuous', () => {
    let d = doc();
    d = insertClip(d, d.tracks[VIDEO].id, media('m', 1000, 4000, 200));
    const s = splitClip(d, 'm', 2500, 'm2');
    expect(ids(s, VIDEO)).toEqual(['m@1000+1500', 'm2@2500+2500']);
    expect((findClip(s, 'm2')!.clip as MediaClip).inMs).toBe(1700);
    valid(s);
  });

  it('refuses a split that would leave a sliver', () => {
    const d = insertClip(doc(), 'text-1', text('a', 0, 1000));
    expect(splitClip(d, 'a', 50)).toBe(d);
    expect(splitClip(d, 'a', 960)).toBe(d);
  });

  it('partitions keyframes between the halves', () => {
    const c = text('a', 0, 1000);
    c.keyframes = [{ prop: 'opacity', tMs: 200, value: 0, ease: 'linear' }, { prop: 'opacity', tMs: 800, value: 1, ease: 'linear' }];
    const s = splitClip(insertClip(doc(), 'text-1', c), 'a', 500, 'a2');
    expect(findClip(s, 'a')!.clip.keyframes!.map((k) => k.tMs)).toEqual([200]);
    expect(findClip(s, 'a2')!.clip.keyframes!.map((k) => k.tMs)).toEqual([300]);
  });

  it('duplicates straight after, or at the end when that is taken', () => {
    let d = insertClip(doc(), 'text-1', text('a', 0, 1000));
    d = duplicateClip(d, 'a', 'a2');
    expect(ids(d, TEXT)).toEqual(['a@0+1000', 'a2@1000+1000']);
    d = duplicateClip(d, 'a', 'a3');
    expect(ids(d, TEXT)).toEqual(['a@0+1000', 'a2@1000+1000', 'a3@2000+1000']);
    valid(d);
  });

  it('deletes', () => {
    const d = insertClip(doc(), 'text-1', text('a', 0, 1000));
    expect(deleteClip(d, 'a').tracks[TEXT].clips).toHaveLength(0);
  });
});

describe('tracks and snapping', () => {
  it('adds visual tracks above visual ones and audio last', () => {
    const d = addTrack(addTrack(doc(), 'overlay', 'ov'), 'audio', 'au');
    expect(d.tracks.map((t) => t.kind)).toEqual(['video', 'text', 'overlay', 'audio', 'audio']);
  });

  it('removes only empty tracks', () => {
    const d = insertClip(doc(), 'text-1', text('a', 0, 1000));
    expect(removeTrack(d, d.tracks[TEXT].id)).toBe(d);
    expect(removeTrack(d, d.tracks[2].id).tracks).toHaveLength(2);
  });

  it('snaps to the nearest edge within the threshold only', () => {
    const d = insertClip(doc(), 'text-1', text('a', 0, 1000));
    const pts = snapPoints(d, null, 2500);
    expect(snapMs(1040, pts, 60)).toBe(1000);
    expect(snapMs(2460, pts, 60)).toBe(2500);
    expect(snapMs(1800, pts, 60)).toBe(1800);
  });
});

