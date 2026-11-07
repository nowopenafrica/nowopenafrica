import type { DesignObject, DesignPage } from './designDocument';

/**
 * The arithmetic behind dragging things around.
 *
 * Kept out of the canvas component on purpose: selection, moving and resizing
 * are where an editor is right or wrong, and none of it needs a DOM to be
 * checked. A component test that renders a canvas to assert that a box moved
 * four pixels is slow and tells you less than this does.
 *
 * Everything here works in the document's normalised 0..1 space, so the same
 * drag behaves identically whether the page is a 1080px square on a phone or
 * an A3 poster on a desktop.
 */

export type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

/** The eight handles, in the order a keyboard user would tab through them. */
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/**
 * Nothing may be dragged so small it cannot be grabbed again.
 *
 * An object resized to zero width is still in the document and still in the
 * layers list, but there is no longer anything on the canvas to click — the
 * only way back is undo, and a user who does not realise what happened will
 * not reach for it.
 */
export const MIN_SIZE = 0.01;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Pixels within the rendered page to the document's 0..1 space. */
export const pxToNorm = (px: number, extent: number): number => (extent > 0 ? px / extent : 0);

/** The document's 0..1 space back to pixels for rendering. */
export const normToPx = (n: number, extent: number): number => n * extent;

/**
 * Move an object by a delta, keeping it reachable.
 *
 * The object is held INSIDE the page rather than allowed to wander off the
 * edge. Bleed work needs objects to cross the trim, so this is a deliberate
 * first-release limit rather than a law: an object dragged off-canvas is
 * invisible, unselectable and indistinguishable from one that was deleted.
 */
export function moveBy(object: DesignObject, dx: number, dy: number): DesignObject {
  return {
    ...object,
    x: clamp01(Math.min(object.x + dx, 1 - object.w)),
    y: clamp01(Math.min(object.y + dy, 1 - object.h)),
  };
}

/**
 * Resize from one handle, keeping the opposite edge pinned.
 *
 * That pinning is the whole feel of a resize: drag the south-east corner and
 * the north-west corner must not drift. Doing it by recomputing both edges
 * from the drag rather than adding a delta to width is what keeps it steady
 * when the pointer crosses over the opposite edge.
 */
export function resizeFrom(
  object: DesignObject,
  handle: Handle,
  dx: number,
  dy: number,
): DesignObject {
  let { x, y, w, h } = object;
  const right = x + w;
  const bottom = y + h;

  if (handle.includes('w')) {
    const nextX = Math.min(clamp01(x + dx), right - MIN_SIZE);
    w = right - nextX;
    x = nextX;
  }
  if (handle.includes('e')) {
    w = Math.max(MIN_SIZE, Math.min(clamp01(right + dx), 1) - x);
  }
  if (handle.includes('n')) {
    const nextY = Math.min(clamp01(y + dy), bottom - MIN_SIZE);
    h = bottom - nextY;
    y = nextY;
  }
  if (handle.includes('s')) {
    h = Math.max(MIN_SIZE, Math.min(clamp01(bottom + dy), 1) - y);
  }

  return { ...object, x, y, w, h };
}

/*
 * ── ROTATION AND THE SHAPE OF THE PAGE ───────────────────────────────────
 *
 * The document's space is normalised 0..1 on BOTH axes, so on a 1080x1920
 * page one unit across is not one unit down. A rotation computed directly in
 * that space is not a rotation at all — it is a rotation composed with a
 * stretch, and a square dragged to 45 degrees comes out as a skewed diamond
 * that does not match what the browser drew.
 *
 * The browser rotates in PIXELS. So every rotation here converts to an
 * isotropic space first (y multiplied by the page's aspect, giving units of
 * page width), rotates, and converts back. Every function that touches
 * rotation therefore needs the page, not just the object.
 */

/** How many page-widths tall the page is; the y scale of the isotropic space. */
export const pageAspect = (page: Pick<DesignPage, 'width' | 'height'>): number =>
  (page.width > 0 ? page.height / page.width : 1);

const TO_RAD = Math.PI / 180;

/** Rotate (px,py) about (cx,cy) by `degrees`, in an isotropic space. */
export function rotateAround(
  px: number, py: number, cx: number, cy: number, degrees: number,
): { x: number; y: number } {
  const r = degrees * TO_RAD;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/**
 * A drag measured on screen, expressed in the object's own frame.
 *
 * Without this, dragging the right-hand handle of an object rotated 90
 * degrees makes it taller instead of wider — the handle moves one way and the
 * object grows another, which feels broken long before anyone works out why.
 */
export function localDelta(
  dx: number, dy: number, degrees: number, aspect: number,
): { dx: number; dy: number } {
  if (!degrees) return { dx, dy };
  const r = rotateAround(dx, dy * aspect, 0, 0, -degrees);
  return { dx: r.x, dy: r.y / aspect };
}

/** The angle from an object's centre to a point, 0 being straight up. */
export function angleTo(
  page: Pick<DesignPage, 'width' | 'height'>,
  object: Pick<DesignObject, 'x' | 'y' | 'w' | 'h'>,
  nx: number, ny: number,
): number {
  const a = pageAspect(page);
  const cx = object.x + object.w / 2;
  const cy = (object.y + object.h / 2) * a;
  const deg = Math.atan2(nx - cx, cy - ny * a) / TO_RAD;
  return (deg + 360) % 360;
}

/**
 * Pull a rotation onto a sensible angle when it is close to one.
 *
 * Upright, square and the diagonals are what people actually want; landing on
 * 44 degrees when you meant 45 is the difference between a design that looks
 * deliberate and one that looks like a mistake.
 */
export const ANGLE_SNAPS = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180,
  195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345, 360];

export function snapAngle(degrees: number, tolerance = 4): number {
  const d = ((degrees % 360) + 360) % 360;
  for (const line of ANGLE_SNAPS) {
    if (Math.abs(d - line) <= tolerance) return line % 360;
  }
  return d;
}

/**
 * Which object is under a point.
 *
 * Topmost first, so a click selects what the user can actually see rather
 * than whatever happens to be earliest in the array. Hidden and locked
 * objects are skipped: a locked object is one the user has asked not to
 * catch, and selecting an invisible one looks like a bug.
 */
export function hitTest(page: DesignPage, nx: number, ny: number): DesignObject | null {
  const candidates = page.objects
    /*
     * A group has no pixels of its own — it is a remembered selection whose
     * box spans its members. Leaving it in would put an invisible rectangle
     * over every child and swallow the clicks meant for them.
     */
    .filter((o) => o.visible && !o.locked && o.type !== 'group')
    .map((o, i) => ({ o, i }))
    .sort((a, b) => b.o.z - a.o.z || b.i - a.i);

  const a = pageAspect(page);
  for (const { o } of candidates) {
    /*
     * Rotated objects are tested in their OWN frame: the pointer is turned
     * back by the object's angle and compared with the upright box. Testing
     * the upright box directly would make a tilted object selectable where it
     * is not drawn, and dead where it is.
     */
    let px = nx;
    let py = ny;
    if (o.rotation) {
      const cx = o.x + o.w / 2;
      const cy = (o.y + o.h / 2) * a;
      const back = rotateAround(nx, ny * a, cx, cy, -o.rotation);
      px = back.x;
      py = back.y / a;
    }
    if (px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h) return o;
  }
  return null;
}

/**
 * Edges worth snapping to: the page's own thirds and centre.
 *
 * Deliberately not "every other object" in the first release. Snapping to
 * dozens of neighbours needs a tolerance that falls apart at low zoom, and a
 * guide that grabs when the user did not ask is worse than none.
 */
export const SNAP_LINES = [0, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1];

/** Within `tolerance`, pull a value onto a guide and report which one. */
export function snap(value: number, tolerance = 0.012): { value: number; line: number | null } {
  let best: number | null = null;
  let bestGap = tolerance;
  for (const line of SNAP_LINES) {
    const gap = Math.abs(value - line);
    if (gap <= bestGap) { bestGap = gap; best = line; }
  }
  return best === null ? { value, line: null } : { value: best, line: best };
}

/**
 * Apply a change to one object in a page, leaving the rest untouched.
 *
 * Returns a new page so React sees a change, and returns the SAME page when
 * the object is not found — a no-op must not look like an edit to the undo
 * history.
 */
export function withObject(
  page: DesignPage,
  id: string,
  change: (o: DesignObject) => DesignObject,
): DesignPage {
  let touched = false;
  const objects = page.objects.map((o) => {
    if (o.id !== id) return o;
    touched = true;
    return change(o);
  });
  return touched ? { ...page, objects } : page;
}

/** The next z that puts an object above everything currently on the page. */
export const topZ = (page: DesignPage): number =>
  page.objects.reduce((max, o) => Math.max(max, o.z), 0) + 1;
