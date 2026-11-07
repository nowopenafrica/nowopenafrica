import { describe, it, expect } from 'vitest';

import {
  angleTo, hitTest, localDelta, pageAspect, resizeFrom, rotateAround, snapAngle,
} from './editorGeometry';
import type { DesignObject, DesignPage } from './designDocument';

const box = (over: Partial<DesignObject> = {}): DesignObject => ({
  id: 'a', type: 'shape', shape: 'rect', name: 'Box',
  x: 0.4, y: 0.4, w: 0.2, h: 0.2,
  rotation: 0, opacity: 1, visible: true, locked: false, z: 1,
  ...over,
} as DesignObject);

const page = (objects: DesignObject[], width = 1080, height = 1080): DesignPage =>
  ({ id: 'p', name: 'Page 1', width, height, objects });

describe('the shape of the page', () => {
  /*
   * The whole reason rotation needs the page. On a story-sized canvas one
   * unit across is not one unit down, so rotating in normalised space is a
   * rotation composed with a stretch — a square comes out a skewed diamond.
   */
  it('reports how many page-widths tall the page is', () => {
    expect(pageAspect({ width: 1080, height: 1080 })).toBe(1);
    expect(pageAspect({ width: 1080, height: 1920 })).toBeCloseTo(1.7778, 3);
    expect(pageAspect({ width: 0, height: 100 })).toBe(1); // never divide by zero
  });
});

describe('rotating a point', () => {
  it('turns a quarter circle about the origin', () => {
    const r = rotateAround(1, 0, 0, 0, 90);
    expect(r.x).toBeCloseTo(0, 10);
    expect(r.y).toBeCloseTo(1, 10);
  });

  it('leaves the centre alone', () => {
    const r = rotateAround(0.5, 0.5, 0.5, 0.5, 137);
    expect(r.x).toBeCloseTo(0.5, 10);
    expect(r.y).toBeCloseTo(0.5, 10);
  });

  it('comes back where it started after a full turn', () => {
    const r = rotateAround(0.2, 0.9, 0.5, 0.5, 360);
    expect(r.x).toBeCloseTo(0.2, 10);
    expect(r.y).toBeCloseTo(0.9, 10);
  });

  it('is reversed exactly by the opposite angle', () => {
    const there = rotateAround(0.1, 0.8, 0.4, 0.4, 37);
    const back = rotateAround(there.x, there.y, 0.4, 0.4, -37);
    expect(back.x).toBeCloseTo(0.1, 10);
    expect(back.y).toBeCloseTo(0.8, 10);
  });
});

describe('clicking a rotated object', () => {
  /*
   * A tilted object must be selectable WHERE IT IS DRAWN. Testing the upright
   * box instead makes it clickable in empty space and dead over its own
   * corners, which reads as an editor that ignores the mouse.
   */
  it('is still hit at its centre', () => {
    const p = page([box({ rotation: 45 })]);
    expect(hitTest(p, 0.5, 0.5)?.id).toBe('a');
  });

  it('is hit where the rotation put it, not where the upright box was', () => {
    /* A long thin bar turned on its side: a point above the centre is inside. */
    const bar = box({ x: 0.1, y: 0.47, w: 0.8, h: 0.06, rotation: 90 });
    const p = page([bar]);
    expect(hitTest(p, 0.5, 0.2)?.id, 'above centre, inside the turned bar').toBe('a');
    expect(hitTest(p, 0.2, 0.5), 'left of centre, now outside').toBeNull();
    /* The same points against the same bar upright give the opposite answers. */
    const upright = page([box({ x: 0.1, y: 0.47, w: 0.8, h: 0.06, rotation: 0 })]);
    expect(hitTest(upright, 0.5, 0.2)).toBeNull();
    expect(hitTest(upright, 0.2, 0.5)?.id).toBe('a');
  });

  it('misses a corner that the rotation moved away', () => {
    const p = page([box({ rotation: 45 })]);
    /* The upright box's own corner is outside the diamond. */
    expect(hitTest(p, 0.401, 0.401)).toBeNull();
    expect(hitTest(page([box()]), 0.401, 0.401)?.id).toBe('a');
  });

  /* The aspect trap: the same test on a page that is not square. */
  it('is correct on a portrait page', () => {
    const story = page([box({ x: 0.3, y: 0.45, w: 0.4, h: 0.04, rotation: 90 })], 1080, 1920);
    const centreHit = hitTest(story, 0.5, 0.47);
    expect(centreHit?.id).toBe('a');
    /* Turned upright, the bar is now tall and thin: far left must miss. */
    expect(hitTest(story, 0.32, 0.47)).toBeNull();
  });

  it('behaves exactly as before when nothing is rotated', () => {
    const p = page([box()]);
    expect(hitTest(p, 0.5, 0.5)?.id).toBe('a');
    expect(hitTest(p, 0.9, 0.9)).toBeNull();
  });
});

describe('dragging a handle on a rotated object', () => {
  /*
   * Without turning the drag into the object's own frame, pulling the right
   * edge of an object rotated 90 degrees makes it TALLER — the handle goes
   * one way and the object grows another.
   */
  it('turns a screen drag into the object frame', () => {
    const d = localDelta(0.1, 0, 90, 1);
    expect(d.dx).toBeCloseTo(0, 10);
    expect(d.dy).toBeCloseTo(-0.1, 10);
  });

  it('leaves an unrotated drag untouched', () => {
    expect(localDelta(0.1, -0.2, 0, 1.78)).toEqual({ dx: 0.1, dy: -0.2 });
  });

  it('makes a rotated object grow the way the pointer moved', () => {
    const o = box({ rotation: 90 });
    /* Pointer pulled DOWN the screen; on a 90-degree object that is its width. */
    const d = localDelta(0, 0.1, 90, 1);
    const resized = resizeFrom(o, 'e', d.dx, d.dy);
    expect(resized.w).toBeCloseTo(0.3, 6);
    expect(resized.h).toBeCloseTo(0.2, 6);
  });

  it('accounts for the page shape', () => {
    const d = localDelta(0, 0.1, 90, 2);
    expect(d.dx).toBeCloseTo(0.2, 10);
    expect(d.dy).toBeCloseTo(0, 10);
  });
});

describe('the angle a rotate handle reports', () => {
  const o = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };

  it('reads zero straight above the centre', () => {
    expect(angleTo({ width: 1080, height: 1080 }, o, 0.5, 0.1)).toBeCloseTo(0, 6);
  });

  it('reads a right angle to the right, and three quarters to the left', () => {
    expect(angleTo({ width: 1080, height: 1080 }, o, 0.9, 0.5)).toBeCloseTo(90, 6);
    expect(angleTo({ width: 1080, height: 1080 }, o, 0.1, 0.5)).toBeCloseTo(270, 6);
  });

  it('is always between 0 and 360', () => {
    for (const [x, y] of [[0, 0], [1, 1], [0, 1], [1, 0], [0.5, 0.9]]) {
      const deg = angleTo({ width: 1080, height: 1920 }, o, x, y);
      expect(deg).toBeGreaterThanOrEqual(0);
      expect(deg).toBeLessThan(360);
    }
  });
});

describe('snapping an angle', () => {
  it('lands on the obvious angles when close', () => {
    expect(snapAngle(2)).toBe(0);
    expect(snapAngle(44)).toBe(45);
    expect(snapAngle(91)).toBe(90);
    expect(snapAngle(358)).toBe(0);
  });

  it('leaves a deliberate angle alone', () => {
    expect(snapAngle(37)).toBe(37);
    expect(snapAngle(52)).toBe(52);
  });

  it('always returns an angle inside one turn', () => {
    for (const deg of [-10, 400, 720, -365]) {
      const r = snapAngle(deg);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(360);
    }
  });
});
