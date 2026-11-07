/**
 * Dropping a picture onto a design.
 *
 * ── WHY THIS IS A MODULE AND NOT TEN LINES IN THE CANVAS ─────────────────
 *
 * Three decisions happen between "a file is over the canvas" and "the design
 * changed", and every one of them is the kind that is wrong in a way nobody
 * notices until a customer's photo is stretched or lost:
 *
 *   1. Is this even a picture? A browser will happily hand you a folder, a
 *      .heic, a dragged link, or a fragment of HTML from another tab.
 *   2. Is it landing ON something? Dropping onto an existing picture means
 *      REPLACE — the frame keeps its position, size and crop. Dropping onto
 *      empty canvas means ADD.
 *   3. Where exactly? An added picture should appear under the pointer, not
 *      in the middle of the page, and it must not hang off the edge.
 *
 * All three are pure, so all three are tested.
 */

import type { DesignPage, DesignObject } from './designDocument';
import { hitTest } from './editorGeometry';
import { ACCEPTED_IMAGE_TYPES } from './designAssets';

/** What a drop is allowed to carry, matching the file picker exactly. */
export const DROPPABLE_TYPES: readonly string[] = ACCEPTED_IMAGE_TYPES;

/**
 * Does this drag carry a picture we can actually use?
 *
 * Answered from the drag's ITEM LIST rather than its files, because during
 * `dragover` the browser does not expose file contents at all — only types.
 * Deciding the cursor from the files would mean every drag looked rejected
 * until the moment it was dropped.
 */
export function dragHasImage(types: readonly { kind: string; type: string }[]): boolean {
  return types.some((t) => t.kind === 'file' && DROPPABLE_TYPES.includes(t.type));
}

/**
 * The usable pictures out of a drop, in order.
 *
 * A folder arrives as an entry with an empty type, and a dragged image from
 * another web page arrives as a URL rather than a file. Both are filtered
 * here rather than failing later against a storage bucket.
 */
export function imageFilesFrom(files: readonly File[]): File[] {
  return files.filter((f) => DROPPABLE_TYPES.includes(f.type));
}

/**
 * The picture under this point, if any.
 *
 * Only an image counts as a replace target. Dropping onto a headline is not
 * a request to turn the headline into a photograph, and dropping onto a
 * background shape is not a request to fill that shape — both would destroy
 * something the person can see, in response to a gesture that did not say so.
 *
 * A locked or hidden image is not a target either: you cannot see where it
 * went, and replacing it silently is indistinguishable from the drop failing.
 */
export function replaceTargetId(page: DesignPage, nx: number, ny: number): string | null {
  const hit: DesignObject | null = hitTest(page, nx, ny);
  if (!hit || hit.type !== 'image' || hit.locked || hit.visible === false) return null;
  return hit.id;
}

/**
 * Where an added picture goes: centred on the pointer, kept on the page.
 *
 * It keeps its own proportions — a stretched photo of someone's shop is the
 * first thing they notice and the last thing they forgive — and it is
 * clamped so that a drop near an edge still lands something visible rather
 * than a sliver.
 */
export function placeDroppedImage(
  natural: { width: number; height: number },
  page: { width: number; height: number },
  at: { x: number; y: number },
  share = 0.5,
): { x: number; y: number; w: number; h: number } {
  const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 1);
  const imageRatio = safe(natural.width) / safe(natural.height);
  const pageRatio = safe(page.width) / safe(page.height);

  let w = share;
  let h = (share * pageRatio) / imageRatio;
  if (h > share) {
    h = share;
    w = (share * imageRatio) / pageRatio;
  }

  const clamp = (v: number, size: number) => Math.max(0, Math.min(1 - size, v));
  return {
    x: clamp((Number.isFinite(at.x) ? at.x : 0.5) - w / 2, w),
    y: clamp((Number.isFinite(at.y) ? at.y : 0.5) - h / 2, h),
    w,
    h,
  };
}

/** What the canvas should say while a drag is over it. */
export type DropHint =
  | { kind: 'none' }
  /** Over empty canvas — a new picture will be added here. */
  | { kind: 'add' }
  /** Over an existing picture — it will be replaced, frame and all. */
  | { kind: 'replace'; id: string }
  /** Carrying something we cannot use. */
  | { kind: 'reject' };

export function dropHint(
  page: DesignPage,
  at: { x: number; y: number } | null,
  hasImage: boolean,
): DropHint {
  if (!hasImage) return { kind: 'reject' };
  if (!at) return { kind: 'add' };
  const id = replaceTargetId(page, at.x, at.y);
  return id ? { kind: 'replace', id } : { kind: 'add' };
}
