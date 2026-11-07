import type { DesignObject, DesignPage } from './designDocument';

/**
 * Working on more than one object at a time.
 *
 * ── THE RULE THAT SHAPES ALL OF THIS ─────────────────────────────────────
 *
 * A multi-selection moves as ONE thing. Clamping each object to the page
 * separately is the obvious implementation and it silently deforms the
 * selection: drag three aligned captions towards the edge and the first one
 * stops while the others keep coming, so the user's careful spacing is
 * destroyed by a drag they will simply undo — if they notice. The group's
 * own bounds are clamped, and every object moves by the same amount or none
 * of them do.
 *
 * Alignment uses each object's stored box, not its rotated outline. That is a
 * deliberate simplification: it is predictable, it matches what the X/Y/W/H
 * fields show, and aligning by rotated extents would make the same button do
 * different things to two objects that look identical.
 */

/** Add or remove an id, the way a shift-click is expected to behave. */
export function toggleSelection(ids: readonly string[], id: string, additive: boolean): string[] {
  if (!additive) return [id];
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** The box containing every selected object, or null when nothing is selected. */
export function selectionBounds(
  page: DesignPage,
  ids: readonly string[],
): { x: number; y: number; w: number; h: number } | null {
  const chosen = page.objects.filter((o) => ids.includes(o.id));
  if (chosen.length === 0) return null;
  const left = Math.min(...chosen.map((o) => o.x));
  const top = Math.min(...chosen.map((o) => o.y));
  const right = Math.max(...chosen.map((o) => o.x + o.w));
  const bottom = Math.max(...chosen.map((o) => o.y + o.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Move everything selected by the same amount.
 *
 * The delta is trimmed so the GROUP stays on the page. See the note above:
 * clamping the objects individually is what pulls a tidy row apart.
 */
export function moveSelection(
  page: DesignPage,
  ids: readonly string[],
  dx: number,
  dy: number,
): DesignPage {
  const bounds = selectionBounds(page, ids);
  if (!bounds || ids.length === 0) return page;

  const limitedX = Math.min(Math.max(dx, -bounds.x), Math.max(0, 1 - bounds.w - bounds.x));
  const limitedY = Math.min(Math.max(dy, -bounds.y), Math.max(0, 1 - bounds.h - bounds.y));
  if (limitedX === 0 && limitedY === 0) return page;

  return {
    ...page,
    objects: page.objects.map((o) => (ids.includes(o.id) ? { ...o, x: o.x + limitedX, y: o.y + limitedY } : o)),
  };
}

export type Align = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';

/** Where one object goes when aligned within a box. */
function alignedPosition(o: DesignObject, box: { x: number; y: number; w: number; h: number }, how: Align) {
  switch (how) {
    case 'left': return { x: box.x, y: o.y };
    case 'centre': return { x: box.x + (box.w - o.w) / 2, y: o.y };
    case 'right': return { x: box.x + box.w - o.w, y: o.y };
    case 'top': return { x: o.x, y: box.y };
    case 'middle': return { x: o.x, y: box.y + (box.h - o.h) / 2 };
    default: return { x: o.x, y: box.y + box.h - o.h };
  }
}

/**
 * Align the selection within its own bounds.
 *
 * Within the SELECTION, not the page: aligning two objects left should bring
 * them to the leftmost of the two, not fling them both against the edge of
 * the canvas. With one object selected there is nothing to align it to, so
 * the page is returned unchanged rather than moving it somewhere surprising.
 */
export function alignObjects(page: DesignPage, ids: readonly string[], how: Align): DesignPage {
  if (ids.length < 2) return page;
  const box = selectionBounds(page, ids);
  if (!box) return page;

  let changed = false;
  const objects = page.objects.map((o) => {
    if (!ids.includes(o.id)) return o;
    const at = alignedPosition(o, box, how);
    if (Math.abs(at.x - o.x) < 1e-9 && Math.abs(at.y - o.y) < 1e-9) return o;
    changed = true;
    return { ...o, x: at.x, y: at.y };
  });
  return changed ? { ...page, objects } : page;
}

/**
 * Even gaps between three or more objects.
 *
 * Fewer than three cannot be distributed — with two, the ends are already the
 * ends — so the page comes back untouched instead of the button appearing to
 * do nothing for a reason the user cannot see.
 */
export function distributeObjects(page: DesignPage, ids: readonly string[], axis: 'h' | 'v'): DesignPage {
  if (ids.length < 3) return page;
  const chosen = page.objects.filter((o) => ids.includes(o.id));
  if (chosen.length < 3) return page;

  const key = axis === 'h' ? 'x' : 'y';
  const size = axis === 'h' ? 'w' : 'h';
  const sorted = [...chosen].sort((a, b) => a[key] - b[key]);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = (last[key] + last[size]) - first[key];
  const used = sorted.reduce((total, o) => total + o[size], 0);
  /* Negative when the objects overlap more than the span allows. */
  const gap = (span - used) / (sorted.length - 1);

  const placed = new Map<string, number>();
  let cursor = first[key];
  for (const o of sorted) {
    placed.set(o.id, cursor);
    cursor += o[size] + gap;
  }

  let changed = false;
  const objects = page.objects.map((o) => {
    const to = placed.get(o.id);
    if (to === undefined || Math.abs(to - o[key]) < 1e-9) return o;
    changed = true;
    return { ...o, [key]: to };
  });
  return changed ? { ...page, objects } : page;
}
