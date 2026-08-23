import { describe, it, expect } from 'vitest';
import {
  clipDurationFor, clipOutputSize, extractBackgroundClip,
  BACKGROUND_CLIP_SECONDS, BACKGROUND_CLIP_MAX_EDGE,
} from './backgroundClip';

describe('clipDurationFor', () => {
  it('caps at 60 seconds', () => {
    expect(clipDurationFor(600)).toBe(BACKGROUND_CLIP_SECONDS);
    expect(clipDurationFor(61)).toBe(60);
  });

  it('uses the whole clip when it is shorter than the cap', () => {
    expect(clipDurationFor(12)).toBe(12);
  });

  it('falls back to the cap when the duration is unknown', () => {
    // Live streams and some hosts report Infinity or NaN.
    expect(clipDurationFor(Infinity)).toBe(60);
    expect(clipDurationFor(NaN)).toBe(60);
    expect(clipDurationFor(0)).toBe(60);
    expect(clipDurationFor(-5)).toBe(60);
  });

  it('honours a custom cap', () => {
    expect(clipDurationFor(600, 15)).toBe(15);
  });
});

describe('clipOutputSize', () => {
  it('caps the long edge while keeping the aspect', () => {
    const landscape = clipOutputSize(3840, 2160);
    expect(Math.max(landscape.width, landscape.height)).toBeLessThanOrEqual(BACKGROUND_CLIP_MAX_EDGE);
    expect(landscape.width / landscape.height).toBeCloseTo(16 / 9, 1);

    const portrait = clipOutputSize(1080, 1920);
    expect(Math.max(portrait.width, portrait.height)).toBeLessThanOrEqual(BACKGROUND_CLIP_MAX_EDGE);
    expect(portrait.width / portrait.height).toBeCloseTo(9 / 16, 1);
  });

  it('never upscales a small source', () => {
    expect(clipOutputSize(640, 360)).toEqual({ width: 640, height: 360 });
  });

  it('always returns even dimensions, which some encoders require', () => {
    for (const [w, h] of [[1081, 1921], [641, 361], [3, 7]]) {
      const out = clipOutputSize(w, h);
      expect(out.width % 2, `${w}x${h}`).toBe(0);
      expect(out.height % 2, `${w}x${h}`).toBe(0);
    }
  });

  it('never returns a zero dimension', () => {
    const out = clipOutputSize(0, 0);
    expect(out.width).toBeGreaterThan(0);
    expect(out.height).toBeGreaterThan(0);
  });
});

describe('extractBackgroundClip', () => {
  it('refuses clearly when the browser cannot re-encode', async () => {
    // jsdom has no MediaRecorder — the same path a very old browser takes.
    await expect(extractBackgroundClip('https://x.test/a.mp4'))
      .rejects.toThrow(/can't re-encode video/i);
  });
});
