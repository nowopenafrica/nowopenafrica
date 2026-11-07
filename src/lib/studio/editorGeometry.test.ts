import { describe, it, expect } from 'vitest';

import {
  hitTest, HANDLES, MIN_SIZE, moveBy, normToPx, pxToNorm, resizeFrom, snap, topZ, withObject,
} from './editorGeometry';
import type { DesignObject, DesignPage } from './designDocument';

const box = (over: Partial<DesignObject> = {}): DesignObject => ({
  id: 'a', type: 'shape', shape: 'rect', name: 'Box',
  x: 0.2, y: 0.2, w: 0.4, h: 0.4,
  rotation: 0, opacity: 1, visible: true, locked: false, z: 1,
  ...over,
} as DesignObject);

const page = (objects: DesignObject[]): DesignPage => ({
  id: 'p', name: 'Page 1', width: 1080, height: 1080, objects,
});

describe('moving', () => {
  it('moves by the delta given', () => {
    const moved = moveBy(box(), 0.1, -0.05);
    expect(moved.x).toBeCloseTo(0.3);
    expect(moved.y).toBeCloseTo(0.15);
  });

  /*
   * An object dragged off the page is invisible, unselectable and
   * indistinguishable from one that was deleted. Undo is the only way back
   * and a user who did not see it happen will not reach for undo.
   */
  it('keeps the object on the page', () => {
    expect(moveBy(box(), -5, -5)).toMatchObject({ x: 0, y: 0 });
    const far = moveBy(box(), 5, 5);
    expect(far.x).toBeCloseTo(0.6);
    expect(far.y).toBeCloseTo(0.6);
    expect(far.x + far.w).toBeLessThanOrEqual(1.0001);
  });
});

describe('resizing', () => {
  /*
   * The whole feel of a resize. Drag the south-east corner and the north-west
   * corner must not drift by a pixel.
   */
  it('pins the opposite corner', () => {
    const r = resizeFrom(box(), 'se', 0.1, 0.1);
    expect(r.x).toBeCloseTo(0.2);
    expect(r.y).toBeCloseTo(0.2);
    expect(r.w).toBeCloseTo(0.5);
    expect(r.h).toBeCloseTo(0.5);
  });

  it('moves the near edge when dragging from the north-west', () => {
    const r = resizeFrom(box(), 'nw', 0.1, 0.1);
    expect(r.x).toBeCloseTo(0.3);
    expect(r.y).toBeCloseTo(0.3);
    expect(r.w).toBeCloseTo(0.3);
    expect(r.h).toBeCloseTo(0.3);
    // The far edge stayed put.
    expect(r.x + r.w).toBeCloseTo(0.6);
  });

  it('resizes one axis from an edge handle', () => {
    const r = resizeFrom(box(), 'e', 0.1, 0.3);
    expect(r.w).toBeCloseTo(0.5);
    expect(r.h).toBeCloseTo(0.4);
    expect(r.y).toBeCloseTo(0.2);
  });

  /* Dragged past the opposite edge, it must stop rather than invert. */
  it('never collapses below a grabbable size', () => {
    for (const h of HANDLES) {
      const r = resizeFrom(box(), h, -9, -9);
      expect(r.w, h).toBeGreaterThanOrEqual(MIN_SIZE - 1e-9);
      expect(r.h, h).toBeGreaterThanOrEqual(MIN_SIZE - 1e-9);
    }
  });

  it('stays inside the page', () => {
    const r = resizeFrom(box(), 'se', 9, 9);
    expect(r.x + r.w).toBeLessThanOrEqual(1.0001);
    expect(r.y + r.h).toBeLessThanOrEqual(1.0001);
  });
});

describe('hit testing', () => {
  it('finds the object under the point', () => {
    expect(hitTest(page([box()]), 0.3, 0.3)?.id).toBe('a');
    expect(hitTest(page([box()]), 0.9, 0.9)).toBeNull();
  });

  /* A click should select what the user can see, not what sorts first. */
  it('picks the topmost of two overlapping objects', () => {
    const under = box({ id: 'under', z: 1 });
    const over = box({ id: 'over', z: 5 });
    expect(hitTest(page([under, over]), 0.3, 0.3)?.id).toBe('over');
    expect(hitTest(page([over, under]), 0.3, 0.3)?.id).toBe('over');
  });

  it('ignores hidden and locked objects', () => {
    expect(hitTest(page([box({ visible: false })]), 0.3, 0.3)).toBeNull();
    expect(hitTest(page([box({ locked: true })]), 0.3, 0.3)).toBeNull();
  });
});

describe('snapping', () => {
  it('pulls onto a guide when close', () => {
    expect(snap(0.503).value).toBeCloseTo(0.5);
    expect(snap(0.503).line).toBeCloseTo(0.5);
  });

  /* A guide that grabs when nobody asked is worse than no guide. */
  it('leaves a value alone when it is not near one', () => {
    const r = snap(0.42);
    expect(r.value).toBeCloseTo(0.42);
    expect(r.line).toBeNull();
  });
});

describe('page helpers', () => {
  it('converts between pixels and the document space', () => {
    expect(pxToNorm(540, 1080)).toBeCloseTo(0.5);
    expect(normToPx(0.5, 1080)).toBeCloseTo(540);
    // Measured before layout, the page has no size. Not NaN.
    expect(pxToNorm(10, 0)).toBe(0);
  });

  it('changes one object and leaves the others alone', () => {
    const p = page([box({ id: 'a' }), box({ id: 'b', x: 0.5 })]);
    const next = withObject(p, 'a', (o) => ({ ...o, x: 0.9 }));
    expect(next.objects[0].x).toBeCloseTo(0.9);
    expect(next.objects[1]).toBe(p.objects[1]);
  });

  /* A no-op must not look like an edit, or undo fills with nothing. */
  it('returns the same page when the object is not there', () => {
    const p = page([box()]);
    expect(withObject(p, 'missing', (o) => ({ ...o, x: 0 }))).toBe(p);
  });

  it('puts a new object above the rest', () => {
    expect(topZ(page([box({ z: 3 }), box({ id: 'b', z: 7 })]))).toBe(8);
    expect(topZ(page([]))).toBe(1);
  });
});
