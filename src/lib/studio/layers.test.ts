import { describe, it, expect } from 'vitest';

import {
  canMove, layerLabel, layerList, MAX_LAYER_NAME, moveLayer, renameLayer, setLocked, setVisible,
} from './layers';
import type { DesignObject, DesignPage } from './designDocument';

const obj = (id: string, z: number, over: Partial<DesignObject> = {}): DesignObject => ({
  id, type: 'shape', shape: 'rect', name: id,
  x: 0, y: 0, w: 0.2, h: 0.2,
  rotation: 0, opacity: 1, visible: true, locked: false, z,
  ...over,
} as DesignObject);

const page = (objects: DesignObject[]): DesignPage => ({
  id: 'p', name: 'Page 1', width: 1080, height: 1080, objects,
});

const order = (p: DesignPage) => layerList(p).map((o) => o.id);

describe('the list itself', () => {
  /* A layers list reads top-down, the opposite of paint order. */
  it('shows the frontmost object first', () => {
    expect(order(page([obj('back', 1), obj('mid', 2), obj('front', 3)])))
      .toEqual(['front', 'mid', 'back']);
  });

  it('includes hidden and locked objects, because nothing else can reach them', () => {
    const p = page([obj('a', 1, { visible: false }), obj('b', 2, { locked: true })]);
    expect(order(p)).toEqual(['b', 'a']);
  });
});

describe('reordering', () => {
  const p = page([obj('a', 1), obj('b', 2), obj('c', 3)]);

  it('brings an object towards the viewer', () => {
    expect(order(moveLayer(p, 'a', 'up'))).toEqual(['c', 'a', 'b']);
  });

  it('sends one away from the viewer', () => {
    expect(order(moveLayer(p, 'c', 'down'))).toEqual(['b', 'c', 'a']);
  });

  it('jumps to the front and to the back', () => {
    expect(order(moveLayer(p, 'a', 'top'))).toEqual(['a', 'c', 'b']);
    expect(order(moveLayer(p, 'c', 'bottom'))).toEqual(['b', 'a', 'c']);
  });

  /*
   * ── THE TIE ──────────────────────────────────────────────────────────
   *
   * Templates convert whole slots at once, so equal z values are normal, not
   * exotic. With `z + 1` the swap either moves nothing or moves two things,
   * depending on how the sort breaks the tie.
   */
  it('reorders correctly when objects share a z', () => {
    const tied = page([obj('a', 1), obj('b', 1), obj('c', 1)]);
    expect(order(tied)).toEqual(['c', 'b', 'a']);
    const moved = moveLayer(tied, 'a', 'up');
    expect(order(moved)).toEqual(['c', 'a', 'b']);
    /* and the page no longer holds a tie at all */
    const zs = moved.objects.map((o) => o.z);
    expect(new Set(zs).size).toBe(zs.length);
  });

  it('leaves every other object where it was', () => {
    const moved = moveLayer(page([obj('a', 1), obj('b', 2), obj('c', 3), obj('d', 4)]), 'b', 'up');
    /* b rises above c; d stays on top and a stays at the bottom. */
    expect(order(moved)).toEqual(['d', 'b', 'c', 'a']);
  });

  /*
   * A no-op must be identity, or the editor records an undo step that
   * restores an identical document — a press of undo that does nothing.
   */
  it('returns the very same page when the move changes nothing', () => {
    expect(moveLayer(p, 'c', 'up')).toBe(p);
    expect(moveLayer(p, 'a', 'down')).toBe(p);
    expect(moveLayer(p, 'c', 'top')).toBe(p);
    expect(moveLayer(p, 'a', 'bottom')).toBe(p);
    expect(moveLayer(p, 'missing', 'up')).toBe(p);
  });

  it('reports what a button may do', () => {
    expect(canMove(p, 'a', 'up')).toBe(true);
    expect(canMove(p, 'c', 'up')).toBe(false);
    expect(canMove(p, 'a', 'down')).toBe(false);
    expect(canMove(p, 'missing', 'top')).toBe(false);
  });

  it('survives being moved repeatedly', () => {
    let q = p;
    for (let i = 0; i < 10; i += 1) q = moveLayer(q, 'a', 'up');
    expect(order(q)).toEqual(['a', 'c', 'b']);
    expect(q.objects).toHaveLength(3);
  });
});

describe('hiding and locking', () => {
  const p = page([obj('a', 1), obj('b', 2)]);

  it('hides and shows', () => {
    const hidden = setVisible(p, 'a', false);
    expect(hidden.objects.find((o) => o.id === 'a')?.visible).toBe(false);
    expect(setVisible(hidden, 'a', true).objects.find((o) => o.id === 'a')?.visible).toBe(true);
  });

  it('locks and unlocks', () => {
    const locked = setLocked(p, 'b', true);
    expect(locked.objects.find((o) => o.id === 'b')?.locked).toBe(true);
    expect(setLocked(locked, 'b', false).objects.find((o) => o.id === 'b')?.locked).toBe(false);
  });

  it('does not touch the other objects', () => {
    const hidden = setVisible(p, 'a', false);
    expect(hidden.objects[1]).toEqual(p.objects[1]);
  });

  it('is identity when the value already matches, or the object is gone', () => {
    expect(setVisible(p, 'a', true)).toBe(p);
    expect(setLocked(p, 'a', false)).toBe(p);
    expect(setVisible(p, 'missing', false)).toBe(p);
  });
});

describe('naming', () => {
  const p = page([obj('a', 1, { name: 'Headline' })]);

  it('renames', () => {
    expect(renameLayer(p, 'a', 'Price badge').objects[0].name).toBe('Price badge');
  });

  it('tidies whitespace and caps the length', () => {
    expect(renameLayer(p, 'a', '  two   words  ').objects[0].name).toBe('two words');
    expect(renameLayer(p, 'a', 'x'.repeat(200)).objects[0].name).toHaveLength(MAX_LAYER_NAME);
  });

  it('refuses to blank a name, and is identity when nothing changes', () => {
    expect(renameLayer(p, 'a', '   ')).toBe(p);
    expect(renameLayer(p, 'a', 'Headline')).toBe(p);
  });
});

describe('what a layer is called in the list', () => {
  it('uses the name when there is one', () => {
    expect(layerLabel(obj('a', 1, { name: 'Logo' }))).toBe('Logo');
  });

  /* "Opening Saturday" identifies a layer; "Text" does not. */
  it('falls back to the words the object actually contains', () => {
    const text = obj('t', 1, { type: 'text', name: '', text: '  Opening   Saturday  ' } as Partial<DesignObject>);
    expect(layerLabel(text)).toBe('Opening Saturday');
  });

  it('falls back to the type when there is nothing else', () => {
    expect(layerLabel(obj('s', 1, { name: '' }))).toBe('Shape');
    expect(layerLabel(obj('t', 1, { type: 'text', name: '', text: '' } as Partial<DesignObject>))).toBe('Text');
  });

  it('does not return an essay', () => {
    const long = obj('t', 1, { type: 'text', name: '', text: 'word '.repeat(100) } as Partial<DesignObject>);
    expect(layerLabel(long).length).toBeLessThanOrEqual(40);
  });
});
