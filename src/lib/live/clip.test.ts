import { describe, expect, it } from 'vitest';

import {
  CLIP_LENGTHS,
  MAX_CLIP_SECONDS,
  availableLengths,
  clipFileName,
  selectClip,
  trimClipBuffer,
  type ClipChunk,
} from './clip';

const blob = (tag: string) => new Blob([tag], { type: 'video/webm' });

/** A broadcast that has been running for `seconds`, one chunk a second. */
function recorded(seconds: number, start = 1_000_000): ClipChunk[] {
  const out: ClipChunk[] = [{ blob: blob('init'), atMs: start }];
  for (let i = 1; i <= seconds; i += 1) {
    out.push({ blob: blob(`c${i}`), atMs: start + i * 1000 });
  }
  return out;
}

const textOf = async (parts: Blob[]) => new Blob(parts).text();

describe('the lengths on offer', () => {
  it('is 15, 30, 60 and 90 seconds', () => {
    expect([...CLIP_LENGTHS]).toEqual([15, 30, 60, 90]);
    expect(MAX_CLIP_SECONDS).toBe(90);
  });

  it('offers nothing in the first seconds, then everything', () => {
    expect(availableLengths(0)).toEqual([]);
    expect(availableLengths(2.9)).toEqual([]);
    /*
     * Offered as soon as there is something to put in it. Somebody thirty
     * seconds in can still take a 90s clip; it simply comes out short, and
     * selectClip says so rather than the button being dead.
     */
    expect(availableLengths(5)).toEqual([15, 30, 60, 90]);
  });
});

describe('a clip is the init segment plus a window', () => {
  /*
   * The first chunk is the header — codec, resolution, track layout. Every
   * later chunk is meaningless without it, so a clip that omits it is
   * exactly the right size and completely unplayable.
   */
  it('always puts the init chunk first', async () => {
    const clip = selectClip(recorded(120), 15, 1_000_000 + 120_000)!;
    expect(clip).not.toBeNull();
    const text = await textOf(clip.parts);
    expect(text.startsWith('init')).toBe(true);
    /* The window is the last fifteen: c106 through c120, and nothing older. */
    expect(text).toBe(`init${Array.from({ length: 15 }, (_, i) => `c${106 + i}`).join('')}`);
  });

  it('takes only the seconds asked for', async () => {
    const chunks = recorded(120);
    for (const seconds of CLIP_LENGTHS) {
      const clip = selectClip(chunks, seconds, 1_000_000 + 120_000)!;
      /* init + one chunk per second in the window. */
      expect(clip.parts.length, `${seconds}s`).toBe(seconds + 1);
      expect(clip.seconds, `${seconds}s`).toBeCloseTo(seconds, 1);
      expect(clip.short, `${seconds}s`).toBe(false);
    }
  });

  it('says so when the broadcast is younger than the clip asked for', () => {
    const clip = selectClip(recorded(20), 90, 1_000_000 + 20_000)!;
    expect(clip.short).toBe(true);
    expect(clip.seconds).toBeCloseTo(20, 0);
    /* Still a real clip, not a refusal. */
    expect(clip.parts.length).toBe(21);
  });

  it('refuses when there is nothing but a header', () => {
    expect(selectClip([{ blob: blob('init'), atMs: 1 }], 15, 2)).toBeNull();
    expect(selectClip([], 15, 2)).toBeNull();
  });

  /*
   * A backgrounded tab is throttled and its chunks stop arriving every
   * second. Counting chunks would hand back "30 seconds" holding two
   * minutes of video, so the window is measured in time, never in chunks.
   */
  it('measures time, not chunks, when the recorder is throttled', () => {
    const start = 1_000_000;
    const chunks: ClipChunk[] = [
      { blob: blob('init'), atMs: start },
      { blob: blob('a'), atMs: start + 1000 },
      /* Tab backgrounded: one chunk covering twenty seconds. */
      { blob: blob('b'), atMs: start + 21_000 },
      { blob: blob('c'), atMs: start + 22_000 },
    ];
    const clip = selectClip(chunks, 15, start + 22_000)!;
    expect(clip.parts.length).toBe(3);
    expect(clip.seconds).toBeCloseTo(21, 0);
  });
});

describe('the buffer does not grow forever', () => {
  it('keeps the init chunk and the last 90 seconds', () => {
    const now = 1_000_000 + 600_000;
    const kept = trimClipBuffer(recorded(600), now);
    /* init, plus 90s of window and the slack second or two. */
    expect(kept[0].blob.size).toBe(blob('init').size);
    expect(kept.length).toBeLessThanOrEqual(MAX_CLIP_SECONDS + 4);
    expect(kept.length).toBeGreaterThanOrEqual(MAX_CLIP_SECONDS);
    for (const c of kept.slice(1)) {
      expect(c.atMs).toBeGreaterThanOrEqual(now - (MAX_CLIP_SECONDS + 2) * 1000);
    }
  });

  it('keeps a full-length clip available after trimming', () => {
    const now = 1_000_000 + 600_000;
    const kept = trimClipBuffer(recorded(600), now);
    const clip = selectClip(kept, 90, now)!;
    expect(clip.short).toBe(false);
    expect(clip.seconds).toBeCloseTo(90, 0);
  });

  it('leaves a young broadcast alone', () => {
    const chunks = recorded(5);
    expect(trimClipBuffer(chunks, 1_000_000 + 5000)).toHaveLength(chunks.length);
    expect(trimClipBuffer([], 0)).toEqual([]);
  });
});

describe('the file it saves', () => {
  const at = new Date(2026, 9, 20, 14, 5);

  it('names itself after the business and the length', () => {
    expect(clipFileName('Mama Chi Kitchen', 30, 'webm', at))
      .toBe('mama-chi-kitchen-clip-30s-202610201405.webm');
  });

  it('survives a business with no usable name', () => {
    expect(clipFileName(null, 15, '.mp4', at)).toBe('nowopen-live-clip-15s-202610201405.mp4');
    expect(clipFileName('!!!', 15, 'mp4', at)).toBe('nowopen-live-clip-15s-202610201405.mp4');
  });
});
