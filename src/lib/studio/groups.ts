import type { DesignObject, DesignPage, GroupObject } from './designDocument';
import { objectId } from './designDocument';
import { topZ } from './editorGeometry';
import { selectionBounds } from './selection';

/**
 * Groups.
 *
 * ── WHAT A GROUP IS HERE ─────────────────────────────────────────────────
 *
 * A remembered selection, not a container. The children stay where they are
 * in the page's object list and keep their own coordinates; the group holds
 * their ids, and each child points back through `parentId`.
 *
 * Nesting objects inside a parent transform is the other way to do it, and it
 * means every coordinate in the editor becomes relative to something — hit
 * testing, snapping, alignment, the properties panel and the exporter all
 * have to compose transforms, and each is a chance to be subtly wrong. This
 * way, clicking a child selects every member and the existing, tested
 * multi-selection code moves, aligns and deletes them. The group adds
 * persistence to a selection and nothing else.
 *
 * The honest limit: a group cannot be scaled or rotated as a unit, because
 * that WOULD need a parent transform. Nothing in the UI offers it, rather
 * than offering it and doing something approximate.
 *
 * ── BOUNDS ARE DERIVED, NEVER TRUSTED ────────────────────────────────────
 *
 * A group's own x/y/w/h exist because the schema gives every object them, and
 * they go stale the moment a child moves. `syncGroups` recomputes them after
 * every change, so nothing reads a remembered rectangle.
 */

/** The group an object belongs to, if any. */
export function groupOf(page: DesignPage, id: string): GroupObject | null {
  const object = page.objects.find((o) => o.id === id);
  if (!object?.parentId) return null;
  const parent = page.objects.find((o) => o.id === object.parentId);
  return parent && parent.type === 'group' ? (parent as GroupObject) : null;
}

/** The objects inside a group. */
export const membersOf = (page: DesignPage, groupId: string): DesignObject[] =>
  page.objects.filter((o) => o.parentId === groupId);

/**
 * Everything that must be selected when these ids are clicked.
 *
 * Clicking one member of a group selects the whole group; that is the entire
 * point of having made one.
 */
export function expandSelection(page: DesignPage, ids: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const group = groupOf(page, id);
    if (group) membersOf(page, group.id).forEach((m) => out.add(m.id));
    else out.add(id);
  }
  return [...out];
}

/** Objects that are not inside a group — what a layers list should show. */
export const topLevel = (page: DesignPage): DesignObject[] =>
  page.objects.filter((o) => !o.parentId);

/**
 * Make a group from a selection.
 *
 * Refuses fewer than two, and refuses to take objects out of a group they are
 * already in: re-grouping across an existing group is ambiguous, and silently
 * stealing children would break the group the user made first.
 */
export function groupObjects(page: DesignPage, ids: readonly string[]): DesignPage {
  const chosen = page.objects.filter((o) => ids.includes(o.id) && o.type !== 'group');
  if (chosen.length < 2) return page;
  if (chosen.some((o) => o.parentId)) return page;

  const bounds = selectionBounds(page, chosen.map((o) => o.id));
  if (!bounds) return page;

  const id = objectId('g');
  const group: GroupObject = {
    id, type: 'group', name: 'Group',
    ...bounds,
    rotation: 0, opacity: 1, visible: true, locked: false, z: topZ(page),
    childIds: chosen.map((o) => o.id),
  };

  return {
    ...page,
    objects: [
      ...page.objects.map((o) => (ids.includes(o.id) && o.type !== 'group' ? { ...o, parentId: id } : o)),
      group,
    ],
  };
}

/** Take a group apart, leaving its members exactly where they are. */
export function ungroup(page: DesignPage, groupId: string): DesignPage {
  const group = page.objects.find((o) => o.id === groupId);
  if (!group || group.type !== 'group') return page;
  return {
    ...page,
    objects: page.objects
      .filter((o) => o.id !== groupId)
      .map((o) => (o.parentId === groupId ? { ...o, parentId: null } : o)),
  };
}

/**
 * Put every group back in step with its children.
 *
 * Run after any change to a page. It does three jobs that each prevent a
 * group from outliving the truth:
 *
 *   - recomputes bounds, so nothing reads a rectangle that a moved child has
 *     already invalidated;
 *   - drops a group left with fewer than two members, because a "group" of
 *     one is just an object wearing a label that stops it being selected
 *     normally;
 *   - clears `parentId` on children whose group no longer exists, which would
 *     otherwise make them unselectable — pointing at a parent that cannot be
 *     found.
 */
export function syncGroups(page: DesignPage): DesignPage {
  const groups = page.objects.filter((o) => o.type === 'group') as GroupObject[];
  const alive = new Set(page.objects.map((o) => o.id));

  const doomed = new Set<string>();
  for (const group of groups) {
    const members = page.objects.filter((o) => o.parentId === group.id);
    if (members.length < 2) doomed.add(group.id);
  }

  let changed = false;
  const objects: DesignObject[] = [];
  for (const o of page.objects) {
    if (o.type === 'group') {
      if (doomed.has(o.id)) { changed = true; continue; }
      const members = page.objects.filter((m) => m.parentId === o.id);
      const bounds = selectionBounds(page, members.map((m) => m.id));
      const childIds = members.map((m) => m.id);
      const sameIds = childIds.length === (o as GroupObject).childIds.length
        && childIds.every((id, i) => (o as GroupObject).childIds[i] === id);
      if (bounds && (!sameIds || o.x !== bounds.x || o.y !== bounds.y || o.w !== bounds.w || o.h !== bounds.h)) {
        changed = true;
        objects.push({ ...o, ...bounds, childIds } as GroupObject);
        continue;
      }
      objects.push(o);
      continue;
    }

    /* A child whose parent is gone, or was never real, is set free. */
    if (o.parentId && (!alive.has(o.parentId) || doomed.has(o.parentId))) {
      changed = true;
      objects.push({ ...o, parentId: null });
      continue;
    }
    objects.push(o);
  }

  return changed ? { ...page, objects } : page;
}
