import { describe, expect, it } from 'vitest';
import { aspectFor, audioGainAt, coverRect, ease, sourceSecondsAt, transitionProgress, valueAt, wrapLines } from './videoCompositor';

describe('videoCompositor maths', () => {
  it('eases within 0..1 and pins the ends', () => {
    for (const k of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
      expect(ease(k, 0)).toBe(0);
      expect(ease(k, 1)).toBe(1);
      expect(ease(k, -3)).toBe(0);
    }
    expect(ease('easeIn', 0.5)).toBeLessThan(0.5);
    expect(ease('easeOut', 0.5)).toBeGreaterThan(0.5);
  });

  it('interpolates keyframes and holds before the first and after the last', () => {
    const clip = { keyframes: [
      { prop: 'opacity' as const, tMs: 100, value: 0, ease: 'linear' as const },
      { prop: 'opacity' as const, tMs: 300, value: 1, ease: 'linear' as const },
      { prop: 'x' as const, tMs: 0, value: 0.9, ease: 'linear' as const },
    ] };
    expect(valueAt(clip, 'opacity', 0.5, 0)).toBe(0);
    expect(valueAt(clip, 'opacity', 0.5, 200)).toBeCloseTo(0.5);
    expect(valueAt(clip, 'opacity', 0.5, 900)).toBe(1);
    expect(valueAt(clip, 'y', 0.25, 200)).toBe(0.25);
  });

  it('runs a transition over its length; a cut is instant', () => {
    expect(transitionProgress({ transitionIn: { type: 'fade', ms: 400 } }, 100)).toBe(0.25);
    expect(transitionProgress({ transitionIn: { type: 'fade', ms: 400 } }, 900)).toBe(1);
    expect(transitionProgress({ transitionIn: { type: 'cut', ms: 400 } }, 0)).toBe(1);
    expect(transitionProgress({}, 0)).toBe(1);
  });

  it('covers a box, cropping the long side evenly', () => {
    expect(coverRect(1920, 1080, 1080, 1080)).toEqual({ sx: 420, sy: 0, sw: 1080, sh: 1080 });
    const r = coverRect(1080, 1920, 1920, 1080);
    expect(r.sw).toBeCloseTo(1080);
    expect(r.sh).toBeCloseTo(607.5);
  });

  it('picks the motion layout nearest the frame shape', () => {
    expect(aspectFor(1080, 1920)).toBe('Vertical');
    expect(aspectFor(1080, 1080)).toBe('Square');
    expect(aspectFor(1080, 1350)).toBe('Ratio4x5');
    expect(['Landscape', 'Ratio16x9']).toContain(aspectFor(1920, 1080));
  });

  it('wraps words and keeps typed line breaks', () => {
    const measure = (s: string) => s.length * 10;
    expect(wrapLines('one two three four', 90, measure)).toEqual(['one two', 'three', 'four']);
    expect(wrapLines('a\nb c', 1000, measure)).toEqual(['a', 'b c']);
  });

  it('maps timeline time to source time', () => {
    expect(sourceSecondsAt({ startMs: 2000, inMs: 500 }, 3000)).toBe(1.5);
  });

  it('shapes audio gain with fades and silences outside the clip', () => {
    const c = { startMs: 1000, durationMs: 4000, volume: 0.8, fadeInMs: 1000, fadeOutMs: 1000 };
    expect(audioGainAt(c, 500)).toBe(0);
    expect(audioGainAt(c, 1500)).toBeCloseTo(0.4);
    expect(audioGainAt(c, 3000)).toBeCloseTo(0.8);
    expect(audioGainAt(c, 4500)).toBeCloseTo(0.4);
    expect(audioGainAt(c, 5000)).toBe(0);
  });
});
