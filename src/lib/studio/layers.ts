import type { DesignObject, DesignPage } from './designDocument';
import { inPaintOrder } from './designDocument';

/**
 * Stacking, hiding and locking.
 *
 * ── WHY z IS RENUMBERED RATHER THAN NUDGED ───────────────────────────────
 *
 * The obvious implementation of "bring forward" is `z + 1`. It works until
 * two objects share a z — which they do, because templates convert whole
 * slots at once — and then the swap moves nothing, or moves two things at
 * once, depending on how the sort happens to break the tie that day.
 *
 * So every reorder renumbers the page: take the current paint order, swap two
 * neighbours in that list, and write z back as 1..n. The result is independent
 * of whatever the z values were before, and ties cannot survive it.
 *
 * ── WHY A NO-OP RETURNS THE SAME PAGE ────────────────────────────────────
 *
 * "Bring forward" on the topmost object changes nothing. Returning a new page
 * anyway would record an undo entry that restores an identical document — a
 * press of undo that visibly does nothing, which is the exact complaint this
 * editor already had once. Identity is how the caller knows not to record it.
 */

/** Objects top-first, which is how a layers list reads. */
export const layerList = (page: DesignPage): DesignObject[] => [...inPaintOrder(page)].reverse();

export type LayerMove = 'up' | 'down' | 'top' | 'bottom';

/**
 * Move one object through the stack.
 *
 * `up` means towards the viewer. Returns the SAME page when the object is
 * already as far as it goes, or is not on the page at all.
 */
export function moveLayer(page: DesignPage, id: string, move: LayerMove): DesignPage {
  const order = inPaintOrder(page);
  const from = order.findIndex((o) => o.id === id);
  if (from < 0) return page;

  const to = move === 'up' ? from + 1
    : move === 'down' ? from - 1
      : move === 'top' ? order.length - 1
        : 0;

  if (to === from || to < 0 || to >= order.length) return page;

  const next = [...order];
  next.splice(to, 0, ...next.splice(from, 1));

  /*
   * Renumbered from the new order, so the document never carries two objects
   * at the same depth and the next reorder cannot be ambiguous.
   */
  const depth = new Map(next.map((o, i) => [o.id, i + 1]));
  return { ...page, objects: page.objects.map((o) => ({ ...o, z: depth.get(o.id) ?? o.z })) };
}

/** True when the move would do nothing, so a button can say so. */
export function canMove(page: DesignPage, id: string, move: LayerMove): boolean {
  return moveLayer(page, id, move) !== page;
}

function setField<K extends 'visible' | 'locked'>(
  page: DesignPage, id: string, field: K, value: boolean,
): DesignPage {
  const current = page.objects.find((o) => o.id === id);
  if (!current || current[field] === value) return page;
  return { ...page, objects: page.objects.map((o) => (o.id === id ? { ...o, [field]: value } : o)) };
}

/**
 * Hide or show.
 *
 * A hidden object stays in the document and in this list — it is the only way
 * back, since nothing on the canvas can be clicked to reach it.
 */
export const setVisible = (page: DesignPage, id: string, visible: boolean): DesignPage =>
  setField(page, id, 'visible', visible);

/**
 * Lock or unlock.
 *
 * A locked object cannot be hit by a click or dragged, which is the point.
 * It must therefore remain selectable FROM THIS LIST, or locking something
 * would be irreversible.
 */
export const setLocked = (page: DesignPage, id: string, locked: boolean): DesignPage =>
  setField(page, id, 'locked', locked);

/** The longest name worth storing; the panel shows far less. */
export const MAX_LAYER_NAME = 60;

export function renameLayer(page: DesignPage, id: string, name: string): DesignPage {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_LAYER_NAME);
  const current = page.objects.find((o) => o.id === id);
  if (!current || !clean || clean === current.name) return page;
  return { ...page, objects: page.objects.map((o) => (o.id === id ? { ...o, name: clean } : o)) };
}

/**
 * What to call a layer that has no name worth showing.
 *
 * Falls back to the object's own words before its type, because "Opening
 * Saturday" identifies a layer and "Text" does not.
 */
export function layerLabel(object: DesignObject): string {
  if (object.name?.trim()) return object.name.trim();
  if (object.type === 'text') {
    const text = (object as { text?: string }).text?.replace(/\s+/g, ' ').trim();
    if (text) return text.slice(0, 40);
  }
  return object.type.charAt(0).toUpperCase() + object.type.slice(1);
}
