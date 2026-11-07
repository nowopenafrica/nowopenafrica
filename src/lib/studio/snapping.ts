/**
 * Alignment guides — the lines that appear while you drag.
 *
 * ── WHY THIS IS NOT A NICETY ─────────────────────────────────────────────
 *
 * Without them, lining two things up means dragging, letting go, looking,
 * nudging with the arrow keys, looking again. Every design tool worth using
 * does this, and its absence is most of what makes an editor feel homemade.
 *
 * ── THE THING THAT HAS TO BE RIGHT: THE UNIT ─────────────────────────────
 *
 * The document is normalised 0..1 on BOTH axes, so a tolerance of 0.01 is a
 * different distance horizontally and vertically on any page that is not
 * square — on a 1080x1920 story it is 10.8px across and 19.2px down. Snapping
 * would feel loose in one direction and tight in the other, for no reason the
 * user could ever work out.
 *
 * So the threshold is given in SCREEN pixels and converted per axis. That also
 * makes it behave the same at any zoom, which is the other half of feeling
 * right: at 25% zoom a fixed normalised tolerance would snap things that are
 * visibly far apart.
 *
 * ── AND WHAT IT WILL NOT DO ──────────────────────────────────────────────
 *
 * It never snaps to an object that is hidden or locked — an invisible thing
 * pulling your design around is indistinguishable from a bug — and it offers
 * an escape: holding Alt suppresses it entirely, because sometimes 3px off
 * the centre is exactly where a thing belongs.
 */

import type { DesignObject } from './designDocument';

export interface Box { x: number; y: number; w: number; h: number }

export type GuideAxis = 'x' | 'y';

export interface Guide {
  axis: GuideAxis;
  /** Normalised position of the line, 0..1 on its own axis. */
  at: number;
  /**
   * How far the line extends, normalised on the OTHER axis — from the
   * nearest edge of the moving box to the furthest edge of what it matched.
   * A guide that spans the whole page tells you nothing about WHAT you lined
   * up with; one that reaches between the two things does.
   */
  from: number;
  to: number;
  /** True for the page's own edges and centre, which are drawn differently. */
  page?: boolean;
}

export interface SnapResult {
  /** The adjusted offsets, to use instead of the raw drag delta. */
  dx: number;
  dy: number;
  guides: Guide[];
}

/** How close, in SCREEN pixels, before it grabs. */
export const SNAP_PX = 6;

/** The page's own guides: edges, centre, thirds and quarters. */
export const PAGE_LINES = [0, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1];

const edgesX = (b: Box): number[] => [b.x, b.x + b.w / 2, b.x + b.w];
const edgesY = (b: Box): number[] => [b.y, b.y + b.h / 2, b.y + b.h];

/** Objects worth aligning to: visible, unlocked, not the ones being moved. */
export function snapTargets(objects: DesignObject[], movingIds: string[]): Box[] {
  const moving = new Set(movingIds);
  return objects
    .filter((o) => !moving.has(o.id) && o.visible !== false && !o.locked && o.type !== 'group')
    .map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
}

interface Candidate { delta: number; line: number; other: Box | null }

/**
 * The best match on one axis.
 *
 * "Best" is the smallest movement, not the first found: dragging a box
 * between two others, the one it is nearer should win, and iteration order
 * must not decide that.
 */
function nearest(
  moving: number[],
  targets: number[][],
  boxes: (Box | null)[],
  tolerance: number,
): Candidate | null {
  let best: Candidate | null = null;

  for (let t = 0; t < targets.length; t += 1) {
    for (const line of targets[t]) {
      for (const edge of moving) {
        const delta = line - edge;
        if (Math.abs(delta) > tolerance) continue;
        if (!best || Math.abs(delta) < Math.abs(best.delta)) {
          best = { delta, line, other: boxes[t] };
        }
      }
    }
  }
  return best;
}

/**
 * Snap a proposed move, and say what it lined up with.
 *
 * `box` is where the object would land WITHOUT snapping. The returned dx/dy
 * are corrections to add to that, so a caller that ignores the guides still
 * behaves correctly.
 */
export function snapMove(
  box: Box,
  targets: Box[],
  opts: {
    /** Page size in screen pixels, for converting the tolerance. */
    pageW: number;
    pageH: number;
    /** Held Alt: move freely. */
    disabled?: boolean;
    thresholdPx?: number;
  },
): SnapResult {
  if (opts.disabled || opts.pageW <= 0 || opts.pageH <= 0) return { dx: 0, dy: 0, guides: [] };

  const px = opts.thresholdPx ?? SNAP_PX;
  const tolX = px / opts.pageW;
  const tolY = px / opts.pageH;

  /*
   * The page's own lines, offered alongside the other objects.
   *
   * These are the set the editor snapped to before object alignment existed
   * (editorGeometry.SNAP_LINES): edges, centre, thirds and quarters. Keeping
   * them means adding object alignment takes nothing away — a layout built
   * on the page's thirds still finds them.
   */
  const allBoxes: (Box | null)[] = [...targets, null];
  const xLines = [...targets.map(edgesX), PAGE_LINES];
  const yLines = [...targets.map(edgesY), PAGE_LINES];

  const hitX = nearest(edgesX(box), xLines, allBoxes, tolX);
  const hitY = nearest(edgesY(box), yLines, allBoxes, tolY);

  const guides: Guide[] = [];
  if (hitX) {
    const other = hitX.other;
    guides.push({
      axis: 'x',
      at: hitX.line,
      from: other ? Math.min(box.y, other.y) : 0,
      to: other ? Math.max(box.y + box.h, other.y + other.h) : 1,
      page: !other,
    });
  }
  if (hitY) {
    const other = hitY.other;
    guides.push({
      axis: 'y',
      at: hitY.line,
      from: other ? Math.min(box.x, other.x) : 0,
      to: other ? Math.max(box.x + box.w, other.x + other.w) : 1,
      page: !other,
    });
  }

  return { dx: hitX?.delta ?? 0, dy: hitY?.delta ?? 0, guides };
}

/**
 * The bounding box of several objects.
 *
 * A multi-selection snaps on its OUTER edges, as one thing. Snapping each
 * member separately would pull the selection apart — which is the same
 * reasoning that makes a multi-move clamp on the group bounds.
 */
export function boundsOf(objects: DesignObject[]): Box | null {
  if (objects.length === 0) return null;
  const x = Math.min(...objects.map((o) => o.x));
  const y = Math.min(...objects.map((o) => o.y));
  const r = Math.max(...objects.map((o) => o.x + o.w));
  const b = Math.max(...objects.map((o) => o.y + o.h));
  return { x, y, w: r - x, h: b - y };
}
