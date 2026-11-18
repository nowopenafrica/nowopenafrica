import { describe, expect, it } from 'vitest';
import {
  blankVideoDocument, clipAt, frameCount, readVideoDocument, videoDurationMs,
  VIDEO_SCHEMA_VERSION, type TextClip, type VideoDocument,
} from './videoDocument';

const text = (id: string, startMs: number, durationMs: number): TextClip => ({
  id, type: 'text', startMs, durationMs, text: 'Hello',
  transform: { x: 0.1, y: 0.1, w: 0.8, h: 0.1, rotation: 0, opacity: 1 },
  style: { font: 'sans', size: 0.05, weight: 700, color: '#fff', align: 'center', letterSpacing: 0, lineHeight: 1.1 },
});

function withText(...clips: TextClip[]): VideoDocument {
  const doc = blankVideoDocument();
  doc.tracks[1].clips = clips;
  return doc;
}

/** Round-trip through JSON, as a save and a load would. */
const stored = (d: unknown) => JSON.parse(JSON.stringify(d));

describe('readVideoDocument', () => {
  it('accepts a blank document', () => {
    const r = readVideoDocument(stored(blankVideoDocument()));
    expect(r.ok).toBe(true);
  });

  it('accepts sequential clips and measures the timeline from them', () => {
    const doc = withText(text('a', 0, 1000), text('b', 1000, 1500));
    expect(readVideoDocument(stored(doc)).ok).toBe(true);
    expect(videoDurationMs(doc)).toBe(2500);
    expect(frameCount(doc)).toBe(75);
  });

  it('gives a cut exactly one owner', () => {
    const doc = withText(text('a', 0, 1000), text('b', 1000, 1000));
    expect(clipAt(doc.tracks[1], 999)?.id).toBe('a');
    expect(clipAt(doc.tracks[1], 1000)?.id).toBe('b');
    expect(clipAt(doc.tracks[1], 2000)).toBeNull();
  });

  const refusals: [string, (d: VideoDocument) => unknown, RegExp][] = [
    ['a newer schema', (d) => ({ ...d, schemaVersion: VIDEO_SCHEMA_VERSION + 1 }), /newer version/],
    ['an unsupported frame rate', (d) => ({ ...d, fps: 29.97 }), /frame rate/],
    ['an oversized frame', (d) => ({ ...d, width: 8000 }), /frame size/],
    ['no tracks', (d) => ({ ...d, tracks: [] }), /no tracks/],
    ['overlapping clips', () => withText(text('a', 0, 1000), text('b', 500, 1000)), /overlap/],
    ['clips out of order', () => withText(text('b', 2000, 500), text('a', 0, 500)), /overlap or are out of order/],
    ['float milliseconds', () => withText(text('a', 0.5, 1000)), /whole milliseconds/],
    ['a duplicate clip id', () => withText(text('a', 0, 500), text('a', 500, 500)), /share the id/],
    ['a text clip on an audio track', (d) => { d.tracks[2].clips = [text('a', 0, 500)]; return d; }, /cannot sit on a audio track/],
    ['a clip pointing at a missing asset', (d) => {
      d.tracks[0].clips = [{ id: 'm', type: 'media', startMs: 0, durationMs: 500, assetId: 'nope', inMs: 0, transform: { x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1 } }];
      return d;
    }, /asset the document does not list/],
    ['an asset stored as a URL', (d) => ({ ...d, assets: { a: { kind: 'image', path: 'https://cdn.example/x.png' } } }), /storage paths only/],
    ['a keyframe past the clip end', () => {
      const c = text('a', 0, 500);
      c.keyframes = [{ prop: 'opacity', tMs: 900, value: 1, ease: 'linear' }];
      return withText(c);
    }, /keyframe outside/],
  ];

  for (const [what, make, reason] of refusals) {
    it(`refuses ${what}`, () => {
      const r = readVideoDocument(stored(make(blankVideoDocument())));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(reason);
    });
  }

  it('refuses non-objects', () => {
    for (const raw of [null, undefined, 'x', 3, []]) expect(readVideoDocument(raw).ok).toBe(false);
  });
});
