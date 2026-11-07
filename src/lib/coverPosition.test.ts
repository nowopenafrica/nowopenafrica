import { describe, it, expect } from 'vitest';

import {
  clampFocal, DEFAULT_FOCAL, focalFromPointer, focalToCss, isDefaultFocal, nudgeFocal,
} from './coverPosition';

describe('a focal point is always usable', () => {
  it('keeps a sensible value', () => {
    expect(clampFocal(30, 70)).toEqual({ x: 30, y: 70 });
  });

  it('pulls anything out of range back to an edge', () => {
    expect(clampFocal(-40, 160)).toEqual({ x: 0, y: 100 });
  });

  it('falls back to centre for nonsense', () => {
    expect(clampFocal(null, undefined)).toEqual(DEFAULT_FOCAL);
    expect(clampFocal('left', NaN)).toEqual(DEFAULT_FOCAL);
    expect(clampFocal(Infinity, 20)).toEqual({ x: 50, y: 20 });
  });

  it('rounds to whole percents', () => {
    expect(clampFocal(33.4, 66.6)).toEqual({ x: 33, y: 67 });
  });
});

describe('the CSS it produces', () => {
  it('is a plain percentage pair', () => {
    expect(focalToCss(25, 75)).toBe('25% 75%');
  });

  /*
   * This value lands in a style attribute. It is composed from clamped
   * numbers precisely so that a hostile or corrupted row cannot become CSS.
   */
  it('cannot carry anything but numbers', () => {
    expect(focalToCss('50%; background:url(javascript:alert(1))', 10)).toBe('50% 10%');
    expect(focalToCss('</style><script>', '0')).toBe('50% 0%');
  });
});

describe('what counts as untouched', () => {
  it('treats centre as not adjusted', () => {
    expect(isDefaultFocal(50, 50)).toBe(true);
    expect(isDefaultFocal(null, null)).toBe(true);
  });

  it('treats anything else as a deliberate choice', () => {
    expect(isDefaultFocal(50, 20)).toBe(false);
  });
});

describe('dragging inside the preview', () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };

  it('maps a click to the part of the picture under it', () => {
    expect(focalFromPointer(300, 150, rect)).toEqual({ x: 50, y: 50 });
    expect(focalFromPointer(100, 50, rect)).toEqual({ x: 0, y: 0 });
    expect(focalFromPointer(500, 250, rect)).toEqual({ x: 100, y: 100 });
  });

  it('holds a drag that leaves the frame at the edge', () => {
    expect(focalFromPointer(-999, 9999, rect)).toEqual({ x: 0, y: 100 });
  });

  /* Measured before layout, the frame has no size. Centre, not NaN. */
  it('survives a frame with no size', () => {
    expect(focalFromPointer(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual(DEFAULT_FOCAL);
  });
});

describe('keyboard nudging', () => {
  it('moves one percent, or five with shift', () => {
    expect(nudgeFocal({ x: 50, y: 50 }, 0, -1)).toEqual({ x: 50, y: 49 });
    expect(nudgeFocal({ x: 50, y: 50 }, 1, 0, true)).toEqual({ x: 55, y: 50 });
  });

  it('stops at the edge rather than wrapping', () => {
    expect(nudgeFocal({ x: 0, y: 0 }, -1, -1)).toEqual({ x: 0, y: 0 });
  });
});
