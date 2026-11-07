import { describe, it, expect } from 'vitest';

import {
  alignObjects, distributeObjects, moveSelection, selectionBounds, toggleSelection,
} from './selection';
import type { DesignObject, DesignPage } from './designDocument';

const at = (id: string, x: number, y: number, w = 0.2, h = 0.1): DesignObject => ({
  id, type: 'shape', shape: 'rect', name: id, x, y, w, h,
  rotation: 0, opacity: 1, visible: true, locked: false, z: 1,
} as DesignObject);

const page = (objects: DesignObject[]): DesignPage =>
  ({ id: 'p', name: 'Page 1', width: 1080, height: 1080, objects });

const posOf = (p: DesignPage, id: string) => {
  const o = p.objects.find((x) => x.id === id)!;
  return { x: Number(o.x.toFixed(6)), y: Number(o.y.toFixed(6)) };
};

describe('choosing what is selected', () => {
  it('replaces the selection on a plain click', () => {
    expect(toggleSelection(['a', 'b'], 'c', false)).toEqual(['c']);
  });

  it('adds and removes with a shift-click', () => {
    expect(toggleSelection(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleSelection(['a', 'b'], 'a', true)).toEqual(['b']);
  });

  it('does not mutate the list it was given', () => {
    const ids = ['a', 'b'];
    toggleSelection(ids, 'c', true);
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('the box around a selection', () => {
  const p = page([at('a', 0.1, 0.1), at('b', 0.5, 0.4)]);

  it('covers every selected object', () => {
    expect(selectionBounds(p, ['a', 'b'])).toMatchObject({ x: 0.1, y: 0.1 });
    const b = selectionBounds(p, ['a', 'b'])!;
    expect(b.x + b.w).toBeCloseTo(0.7, 6);
    expect(b.y + b.h).toBeCloseTo(0.5, 6);
  });

  it('is null when nothing is selected', () => {
    expect(selectionBounds(p, [])).toBeNull();
    expect(selectionBounds(p, ['missing'])).toBeNull();
  });
});

describe('moving several objects at once', () => {
  it('moves them all by the same amount', () => {
    const p = page([at('a', 0.1, 0.1), at('b', 0.4, 0.3)]);
    const moved = moveSelection(p, ['a', 'b'], 0.1, 0.05);
    expect(posOf(moved, 'a')).toEqual({ x: 0.2, y: 0.15 });
    expect(posOf(moved, 'b')).toEqual({ x: 0.5, y: 0.35 });
  });

  it('leaves unselected objects alone', () => {
    const p = page([at('a', 0.1, 0.1), at('b', 0.4, 0.3)]);
    const moved = moveSelection(p, ['a'], 0.1, 0);
    expect(posOf(moved, 'b')).toEqual({ x: 0.4, y: 0.3 });
  });

  /*
   * ── THE ONE THAT MATTERS ─────────────────────────────────────────────
   *
   * Clamping each object separately lets the leading one stop at the edge
   * while the rest keep coming, so a carefully spaced row is pulled apart by
   * a drag. The GROUP is clamped; the spacing inside it never changes.
   */
  it('keeps the spacing when the group hits the edge', () => {
    const p = page([at('a', 0.1, 0.1), at('b', 0.4, 0.1), at('c', 0.7, 0.1)]);
    const gapsBefore = [0.4 - 0.1, 0.7 - 0.4];
    const shoved = moveSelection(p, ['a', 'b', 'c'], 5, 0);
    const xs = ['a', 'b', 'c'].map((id) => posOf(shoved, id).x);
    expect([xs[1] - xs[0], xs[2] - xs[1]].map((g) => Number(g.toFixed(6))))
      .toEqual(gapsBefore.map((g) => Number(g.toFixed(6))));
    /* and the group came to rest exactly against the edge */
    expect(xs[2] + 0.2).toBeCloseTo(1, 6);
  });

  it('stops at the near edge too, without inverting', () => {
    const p = page([at('a', 0.1, 0.1), at('b', 0.4, 0.1)]);
    const shoved = moveSelection(p, ['a', 'b'], -5, -5);
    expect(posOf(shoved, 'a')).toEqual({ x: 0, y: 0 });
    expect(posOf(shoved, 'b')).toEqual({ x: 0.3, y: 0 });
  });

  it('is identity when the move changes nothing', () => {
    const p = page([at('a', 0, 0)]);
    expect(moveSelection(p, ['a'], -1, -1)).toBe(p);
    expect(moveSelection(p, [], 0.1, 0.1)).toBe(p);
  });
});

describe('aligning', () => {
  const p = page([at('a', 0.1, 0.1), at('b', 0.5, 0.4), at('c', 0.3, 0.7)]);

  it('aligns to the selection, not to the page', () => {
    const left = alignObjects(p, ['a', 'b'], 'left');
    expect(posOf(left, 'a').x).toBe(0.1);
    expect(posOf(left, 'b').x).toBe(0.1);
    /* nothing was flung against the canvas edge */
    expect(posOf(left, 'a').x).not.toBe(0);
  });

  it('handles every direction', () => {
    expect(posOf(alignObjects(p, ['a', 'b'], 'right'), 'a').x).toBeCloseTo(0.5, 6);
    expect(posOf(alignObjects(p, ['a', 'b'], 'top'), 'b').y).toBeCloseTo(0.1, 6);
    expect(posOf(alignObjects(p, ['a', 'b'], 'bottom'), 'a').y).toBeCloseTo(0.4, 6);
    const centred = alignObjects(p, ['a', 'b'], 'centre');
    expect(posOf(centred, 'a').x).toBeCloseTo(posOf(centred, 'b').x, 6);
    const middled = alignObjects(p, ['a', 'b'], 'middle');
    expect(posOf(middled, 'a').y).toBeCloseTo(posOf(middled, 'b').y, 6);
  });

  it('does nothing with fewer than two objects, instead of moving one somewhere odd', () => {
    expect(alignObjects(p, ['a'], 'left')).toBe(p);
    expect(alignObjects(p, [], 'left')).toBe(p);
  });

  it('is identity when they are already aligned', () => {
    const rowed = page([at('a', 0.2, 0.1), at('b', 0.2, 0.5)]);
    expect(alignObjects(rowed, ['a', 'b'], 'left')).toBe(rowed);
  });

  it('leaves the other axis alone', () => {
    const left = alignObjects(p, ['a', 'b'], 'left');
    expect(posOf(left, 'b').y).toBe(0.4);
  });
});

describe('distributing', () => {
  it('makes the gaps equal', () => {
    const p = page([at('a', 0, 0.1), at('b', 0.1, 0.1), at('c', 0.8, 0.1)]);
    const spread = distributeObjects(p, ['a', 'b', 'c'], 'h');
    const xs = ['a', 'b', 'c'].map((id) => posOf(spread, id).x);
    const gaps = [xs[1] - (xs[0] + 0.2), xs[2] - (xs[1] + 0.2)];
    expect(gaps[0]).toBeCloseTo(gaps[1], 6);
  });

  it('does not move the two on the ends', () => {
    const p = page([at('a', 0, 0.1), at('b', 0.1, 0.1), at('c', 0.8, 0.1)]);
    const spread = distributeObjects(p, ['a', 'b', 'c'], 'h');
    expect(posOf(spread, 'a').x).toBeCloseTo(0, 6);
    expect(posOf(spread, 'c').x).toBeCloseTo(0.8, 6);
  });

  it('works vertically too', () => {
    const p = page([at('a', 0.1, 0), at('b', 0.1, 0.1), at('c', 0.1, 0.8)]);
    const spread = distributeObjects(p, ['a', 'b', 'c'], 'v');
    const ys = ['a', 'b', 'c'].map((id) => posOf(spread, id).y);
    expect(ys[1] - ys[0]).toBeCloseTo(ys[2] - ys[1], 6);
  });

  /* With two objects the ends are already the ends; there is nothing between. */
  it('refuses fewer than three rather than appearing to do nothing', () => {
    const p = page([at('a', 0, 0.1), at('b', 0.5, 0.1)]);
    expect(distributeObjects(p, ['a', 'b'], 'h')).toBe(p);
  });

  it('is identity when they are already evenly spaced', () => {
    const p = page([at('a', 0, 0.1), at('b', 0.3, 0.1), at('c', 0.6, 0.1)]);
    expect(distributeObjects(p, ['a', 'b', 'c'], 'h')).toBe(p);
  });
});
