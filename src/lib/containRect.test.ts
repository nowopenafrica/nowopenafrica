import { describe, it, expect } from 'vitest';

import { containRect, coverCropRect } from './openReel';

describe('containRect', () => {
  it('is the identity when the frame already fits the box exactly', () => {
    expect(containRect(1280, 720, 1280, 720)).toEqual({ dx: 0, dy: 0, dw: 1280, dh: 720 });
  });

  it('letterboxes a portrait frame in a landscape box without losing any of it', () => {
    // This is the case that matters: a phone held upright, broadcasting. Cover
    // would keep the middle strip and throw away the owner's head and hands.
    const r = containRect(720, 1280, 1280, 720);
    expect(r.dh).toBe(720);
    expect(r.dw).toBe(Math.round(720 * (720 / 1280)));
    expect(r.dx).toBeGreaterThan(0);
    expect(r.dy).toBe(0);
  });

  it('pillarboxes a landscape frame in a portrait box', () => {
    const r = containRect(1280, 720, 720, 1280);
    expect(r.dw).toBe(720);
    expect(r.dh).toBeLessThan(1280);
    expect(r.dy).toBeGreaterThan(0);
  });

  it('centres what it draws', () => {
    // Within a pixel: the rect is rounded to whole pixels, so an odd leftover
    // puts the centre half a pixel off, which is the correct answer.
    const r = containRect(720, 1280, 1280, 720);
    expect(Math.abs(r.dx + r.dw / 2 - 640)).toBeLessThanOrEqual(1);
  });

  it('keeps the whole frame, unlike cover, which is the point', () => {
    const contained = containRect(720, 1280, 1280, 720);
    const covered = coverCropRect(720, 1280, 1280, 720, 1);
    // Cover reads only part of the source; contain reads all of it.
    expect(covered.sh).toBeLessThan(1280);
    expect(contained.dw * (1280 / 720)).toBeCloseTo(contained.dh, 0);
  });

  it('returns an empty rect rather than dividing by zero', () => {
    expect(containRect(0, 0, 1280, 720)).toEqual({ dx: 0, dy: 0, dw: 0, dh: 0 });
    expect(containRect(1280, 720, 0, 0)).toEqual({ dx: 0, dy: 0, dw: 0, dh: 0 });
  });
});
