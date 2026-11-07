import { describe, it, expect } from 'vitest';

import {
  expandSelection, groupObjects, groupOf, membersOf, syncGroups, topLevel, ungroup,
} from './groups';
import { moveSelection } from './selection';
import type { DesignObject, DesignPage, GroupObject } from './designDocument';

const at = (id: string, x: number, y: number): DesignObject => ({
  id, type: 'shape', shape: 'rect', name: id, x, y, w: 0.2, h: 0.1,
  rotation: 0, opacity: 1, visible: true, locked: false, z: 1,
} as DesignObject);

const page = (objects: DesignObject[]): DesignPage =>
  ({ id: 'p', name: 'Page 1', width: 1080, height: 1080, objects });

const base = () => page([at('a', 0.1, 0.1), at('b', 0.5, 0.4), at('c', 0.8, 0.8)]);
const groupIn = (p: DesignPage) => p.objects.find((o) => o.type === 'group') as GroupObject;

describe('making a group', () => {
  it('records its members and points them back at it', () => {
    const p = groupObjects(base(), ['a', 'b']);
    const g = groupIn(p);
    expect(g.childIds.sort()).toEqual(['a', 'b']);
    expect(p.objects.find((o) => o.id === 'a')?.parentId).toBe(g.id);
    expect(p.objects.find((o) => o.id === 'c')?.parentId).toBeUndefined();
  });

  it('covers its members', () => {
    const g = groupIn(groupObjects(base(), ['a', 'b']));
    expect(g.x).toBeCloseTo(0.1, 6);
    expect(g.y).toBeCloseTo(0.1, 6);
    expect(g.x + g.w).toBeCloseTo(0.7, 6);
    expect(g.y + g.h).toBeCloseTo(0.5, 6);
  });

  it('leaves the members exactly where they were', () => {
    const before = base();
    const after = groupObjects(before, ['a', 'b']);
    for (const id of ['a', 'b']) {
      const was = before.objects.find((o) => o.id === id)!;
      const now = after.objects.find((o) => o.id === id)!;
      expect({ x: now.x, y: now.y, w: now.w, h: now.h }).toEqual({ x: was.x, y: was.y, w: was.w, h: was.h });
    }
  });

  it('refuses fewer than two, which would just be an object with a label', () => {
    const p = base();
    expect(groupObjects(p, ['a'])).toBe(p);
    expect(groupObjects(p, [])).toBe(p);
  });

  /* Stealing children would break the group the user made first. */
  it('refuses to take objects out of a group they are already in', () => {
    const p = groupObjects(base(), ['a', 'b']);
    expect(groupObjects(p, ['a', 'c'])).toBe(p);
  });
});

describe('selecting a group', () => {
  it('clicking one member selects them all', () => {
    const p = groupObjects(base(), ['a', 'b']);
    expect(expandSelection(p, ['a']).sort()).toEqual(['a', 'b']);
  });

  it('leaves an ungrouped object alone', () => {
    const p = groupObjects(base(), ['a', 'b']);
    expect(expandSelection(p, ['c'])).toEqual(['c']);
  });

  it('does not repeat a member when two of them are clicked', () => {
    const p = groupObjects(base(), ['a', 'b']);
    expect(expandSelection(p, ['a', 'b']).sort()).toEqual(['a', 'b']);
  });

  it('reports the group an object belongs to', () => {
    const p = groupObjects(base(), ['a', 'b']);
    expect(groupOf(p, 'a')?.id).toBe(groupIn(p).id);
    expect(groupOf(p, 'c')).toBeNull();
    expect(membersOf(p, groupIn(p).id).map((o) => o.id).sort()).toEqual(['a', 'b']);
  });
});

describe('a group moves as one', () => {
  /* The point of the design: existing, tested selection code does the work. */
  it('moves every member by the same amount', () => {
    const p = groupObjects(base(), ['a', 'b']);
    const moved = syncGroups(moveSelection(p, expandSelection(p, ['a']), 0.1, 0.05));
    expect(moved.objects.find((o) => o.id === 'a')).toMatchObject({ x: 0.2 });
    expect(moved.objects.find((o) => o.id === 'b')).toMatchObject({ x: 0.6 });
    expect(moved.objects.find((o) => o.id === 'c')).toMatchObject({ x: 0.8 });
  });

  it('brings its bounds with it', () => {
    const p = groupObjects(base(), ['a', 'b']);
    const moved = syncGroups(moveSelection(p, expandSelection(p, ['a']), 0.1, 0));
    expect(groupIn(moved).x).toBeCloseTo(0.2, 6);
  });
});

describe('keeping groups honest', () => {
  /*
   * Bounds are stored only because the schema gives every object them. They
   * go stale as soon as a child moves, so nothing may read them without a
   * sync first.
   */
  it('recomputes bounds that a moved child invalidated', () => {
    const p = groupObjects(base(), ['a', 'b']);
    const nudged = {
      ...p,
      objects: p.objects.map((o) => (o.id === 'b' ? { ...o, x: 0.7 } : o)),
    };
    expect(groupIn(syncGroups(nudged)).x + groupIn(syncGroups(nudged)).w).toBeCloseTo(0.9, 6);
  });

  /* A group of one is an object wearing a label that stops normal selection. */
  it('drops a group left with one member, and frees that member', () => {
    const p = groupObjects(base(), ['a', 'b']);
    const deleted = { ...p, objects: p.objects.filter((o) => o.id !== 'b') };
    const synced = syncGroups(deleted);
    expect(synced.objects.some((o) => o.type === 'group')).toBe(false);
    expect(synced.objects.find((o) => o.id === 'a')?.parentId).toBeNull();
  });

  it('frees children whose group was removed outright', () => {
    const p = groupObjects(base(), ['a', 'b']);
    const g = groupIn(p);
    const orphaned = { ...p, objects: p.objects.filter((o) => o.id !== g.id) };
    const synced = syncGroups(orphaned);
    expect(synced.objects.find((o) => o.id === 'a')?.parentId).toBeNull();
    expect(synced.objects.find((o) => o.id === 'b')?.parentId).toBeNull();
  });

  it('is identity when everything already agrees', () => {
    const p = syncGroups(groupObjects(base(), ['a', 'b']));
    expect(syncGroups(p)).toBe(p);
  });
});

describe('ungrouping', () => {
  it('removes the group and leaves the objects untouched', () => {
    const p = groupObjects(base(), ['a', 'b']);
    const flat = ungroup(p, groupIn(p).id);
    expect(flat.objects.some((o) => o.type === 'group')).toBe(false);
    expect(flat.objects.find((o) => o.id === 'a')).toMatchObject({ x: 0.1, y: 0.1, parentId: null });
    expect(flat.objects).toHaveLength(3);
  });

  it('is identity for something that is not a group', () => {
    const p = groupObjects(base(), ['a', 'b']);
    expect(ungroup(p, 'a')).toBe(p);
    expect(ungroup(p, 'nope')).toBe(p);
  });
});

describe('what the layers list shows', () => {
  it('shows the group and not its members', () => {
    const p = groupObjects(base(), ['a', 'b']);
    const shown = topLevel(p).map((o) => o.id);
    expect(shown).toContain('c');
    expect(shown).toContain(groupIn(p).id);
    expect(shown).not.toContain('a');
    expect(shown).not.toContain('b');
  });
});
