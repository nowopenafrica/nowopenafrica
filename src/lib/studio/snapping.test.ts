import { describe, it, expect } from 'vitest';

import { SNAP_PX, boundsOf, snapMove, snapTargets, type Box } from './snapping';
import type { DesignObject } from './designDocument';

const object = (over: Partial<DesignObject> & { id: string }): DesignObject => ({
  type: 'shape', shape: 'rect', name: 'Box',
  x: 0, y: 0, w: 0.2, h: 0.2,
  rotation: 0, opacity: 1, visible: true, locked: false, z: 1,
  ...over,
} as DesignObject);

/* A square page keeps the two axes comparable while testing the rest. */
const SQUARE = { pageW: 1000, pageH: 1000 };

describe('what it will align to', () => {
  it('ignores the objects being dragged', () => {
    const objects = [object({ id: 'a' }), object({ id: 'b' })];
    expect(snapTargets(objects, ['a'])).toHaveLength(1);
    expect(snapTargets(objects, ['a', 'b'])).toHaveLength(0);
  });

  /*
   * An invisible or locked object pulling your design around is
   * indistinguishable from a bug — you cannot see what grabbed it.
   */
  it('ignores what cannot be seen or touched', () => {
    const objects = [
      object({ id: 'hidden', visible: false }),
      object({ id: 'locked', locked: true }),
      object({ id: 'group', type: 'group' } as Partial<DesignObject> & { id: string }),
      object({ id: 'real' }),
    ];
    expect(snapTargets(objects, [])).toHaveLength(1);
  });
});

describe('the unit, which is the thing that has to be right', () => {
  /*
   * ── NORMALISED SPACE IS NOT ISOTROPIC ────────────────────────────────
   *
   * A tolerance of 0.01 is 10.8px across a 1080-wide story and 19.2px down
   * its 1920 height. Snapping would feel loose one way and tight the other,
   * for no reason a user could work out. The threshold is in SCREEN pixels
   * and converted per axis.
   */
  it('uses the same pixel distance on both axes of a tall page', () => {
    const target: Box = { x: 0.5, y: 0.5, w: 0.1, h: 0.1 };
    const page = { pageW: 1080, pageH: 1920 };

    /* Five pixels away on each axis — inside a six-pixel threshold, both. */
    const offX = 5 / 1080;
    const offY = 5 / 1920;
    const near = { x: 0.5 + offX, y: 0.5 + offY, w: 0.1, h: 0.1 };
    const hit = snapMove(near, [target], page);
    expect(hit.dx).toBeCloseTo(-offX, 6);
    expect(hit.dy).toBeCloseTo(-offY, 6);

    /* And ten pixels away on each axis — outside it, both. */
    const far = { x: 0.5 + 10 / 1080, y: 0.5 + 10 / 1920, w: 0.1, h: 0.1 };
    const miss = snapMove(far, [target], page);
    expect(miss.dx).toBe(0);
    expect(miss.dy).toBe(0);
  });

  it('is stricter when zoomed out, because the pixels are', () => {
    const target: Box = { x: 0.5, y: 0, w: 0.1, h: 0.1 };
    const box = { x: 0.5 + 0.01, y: 0.5, w: 0.1, h: 0.1 };
    /* 0.01 of a 1000px page is 10px — too far. Of a 100px page it is 1px. */
    expect(snapMove(box, [target], { pageW: 1000, pageH: 1000 }).dx).toBe(0);
    expect(snapMove(box, [target], { pageW: 100, pageH: 100 }).dx).not.toBe(0);
  });
});

describe('which line wins', () => {
  it('aligns left edges', () => {
    const target: Box = { x: 0.3, y: 0.1, w: 0.2, h: 0.2 };
    const box = { x: 0.3 + 0.004, y: 0.6, w: 0.1, h: 0.1 };
    expect(snapMove(box, [target], SQUARE).dx).toBeCloseTo(-0.004, 6);
  });

  it('aligns centres', () => {
    const target: Box = { x: 0.3, y: 0.1, w: 0.2, h: 0.2 }; /* centre 0.4 */
    /* Moving box centre at 0.4035 — its CENTRE is what matches. */
    const box = { x: 0.3535, y: 0.6, w: 0.1, h: 0.1 };
    const hit = snapMove(box, [target], SQUARE);
    expect(hit.dx).toBeCloseTo(-0.0035, 5);
  });

  /*
   * Smallest movement wins, not whichever was found first — dragging between
   * two objects, the nearer one should grab, and iteration order must not be
   * what decides it.
   */
  it('takes the nearest line, not the first one', () => {
    /*
     * Deliberately away from 0, 0.5 and 1.
     *
     * The first version of this test put the box at x = 0.5, where its left
     * edge sat exactly on the page centre — so a zero-distance line won and
     * dx was 0. The code was right; the fixture was measuring the page, not
     * the two targets.
     */
    const near: Box = { x: 0.122, y: 0, w: 0.1, h: 0.1 };
    const far: Box = { x: 0.117, y: 0, w: 0.1, h: 0.1 };
    /* Edges 0.12 / 0.17 / 0.22 — clear of 0, 0.25, ⅓, 0.5, ⅔, 0.75 and 1. */
    const box = { x: 0.12, y: 0.6, w: 0.1, h: 0.1 };
    /* Both within tolerance; +0.002 is nearer than -0.003. */
    expect(snapMove(box, [far, near], SQUARE).dx).toBeCloseTo(0.002, 6);
    /* And the answer does not change when the list is reversed. */
    expect(snapMove(box, [near, far], SQUARE).dx).toBeCloseTo(0.002, 6);
  });
});

describe('the page itself', () => {
  it('offers its own centre', () => {
    const box = { x: 0.45 - 0.003, y: 0.8, w: 0.1, h: 0.1 };
    const hit = snapMove(box, [], SQUARE);
    /* Box centre lands on 0.5. */
    expect(hit.dx).toBeCloseTo(0.003, 6);
    expect(hit.guides.some((g) => g.axis === 'x' && g.page)).toBe(true);
  });

  it('offers its edges', () => {
    const hit = snapMove({ x: 0.004, y: 0.5, w: 0.1, h: 0.1 }, [], SQUARE);
    expect(hit.dx).toBeCloseTo(-0.004, 6);
  });
});

describe('the guides it reports', () => {
  /*
   * A line spanning the whole page says WHERE you snapped but not to WHAT.
   * Reaching between the two things says both.
   */
  it('spans from the moving box to the thing it matched', () => {
    const target: Box = { x: 0.3, y: 0.05, w: 0.2, h: 0.1 };
    const box = { x: 0.3 + 0.002, y: 0.7, w: 0.1, h: 0.1 };
    const guide = snapMove(box, [target], SQUARE).guides.find((g) => g.axis === 'x')!;
    expect(guide.at).toBeCloseTo(0.3, 6);
    expect(guide.from).toBeCloseTo(0.05, 6);
    expect(guide.to).toBeCloseTo(0.8, 6);
    expect(guide.page).toBeFalsy();
  });

  it('reports nothing when nothing is near', () => {
    const hit = snapMove({ x: 0.123, y: 0.456, w: 0.1, h: 0.1 }, [{ x: 0.8, y: 0.8, w: 0.1, h: 0.1 }], SQUARE);
    expect(hit.guides).toEqual([]);
    expect(hit.dx).toBe(0);
    expect(hit.dy).toBe(0);
  });
});

describe('the escape hatch', () => {
  /* Sometimes 3px off the centre is exactly where a thing belongs. */
  it('does nothing at all when suppressed', () => {
    const hit = snapMove({ x: 0.4501, y: 0.4501, w: 0.1, h: 0.1 }, [], { ...SQUARE, disabled: true });
    expect(hit).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('survives a page with no size rather than dividing by zero', () => {
    const hit = snapMove({ x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, [], { pageW: 0, pageH: 0 });
    expect(hit.dx).toBe(0);
    expect(Number.isFinite(hit.dy)).toBe(true);
  });
});

describe('a multi-selection moves as one', () => {
  /*
   * Snapping each member separately pulls the selection apart — the same
   * reasoning that makes a multi-move clamp on the group bounds.
   */
  it('bounds several objects into one box', () => {
    const b = boundsOf([
      object({ id: 'a', x: 0.1, y: 0.2, w: 0.2, h: 0.1 }),
      object({ id: 'b', x: 0.5, y: 0.1, w: 0.1, h: 0.4 }),
    ])!;
    expect(b).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.4 });
  });

  it('has no bounds for nothing', () => {
    expect(boundsOf([])).toBeNull();
  });
});

describe('the threshold itself', () => {
  it('is a handful of pixels, not a magic number nobody can find', () => {
    expect(SNAP_PX).toBeGreaterThan(2);
    expect(SNAP_PX).toBeLessThan(16);
  });
});
