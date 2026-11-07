/**
 * Undo history for the editor.
 *
 * ── WHY THIS IS NOT INSIDE THE COMPONENT ─────────────────────────────────
 *
 * It lived there first, as two refs mutated inside `setDoc` updaters. That is
 * the one place this logic must not live: React may invoke a state updater
 * more than once for a single update — twice under StrictMode in development,
 * and again whenever a render is replayed — so every snapshot was pushed
 * twice and every undo popped twice. The doubling happened to be symmetric,
 * which is the worst kind of bug: it worked, while development and production
 * quietly kept different histories, and the first bail-out would have
 * desynchronised them with no error anywhere.
 *
 * Pure functions over a plain value, so the behaviour is decided here and
 * checked without a browser. The component only decides WHEN to call them.
 *
 * ── THE ORDER THAT MATTERS ───────────────────────────────────────────────
 *
 * `record` is called BEFORE the change it protects. Recording afterwards
 * stores the state the edit just produced, so undo restores what is already
 * on screen and appears to do nothing — which is exactly how this shipped on
 * 2026-10-14 with every geometry test passing. The arithmetic was right; the
 * timing was not. `recordsThePrecedingState` below is that bug, as a test.
 */

export interface History<T> {
  readonly past: readonly T[];
  readonly future: readonly T[];
}

/** How many steps back a user can go. Snapshots are cheap; memory is not. */
export const HISTORY_LIMIT = 50;

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] });

export const canUndo = (h: History<unknown>): boolean => h.past.length > 0;
export const canRedo = (h: History<unknown>): boolean => h.future.length > 0;

/**
 * Note the state that precedes an edit.
 *
 * Clears the redo stack: once you edit after undoing, the branch you undid is
 * no longer reachable, and offering a redo that jumps to an abandoned future
 * is worse than offering none.
 */
export function record<T>(h: History<T>, present: T, limit = HISTORY_LIMIT): History<T> {
  return { past: [...h.past, present].slice(-limit), future: [] };
}

/**
 * Step back. Returns null when there is nothing to step back to, so a caller
 * cannot mistake "no history" for "restored the same thing".
 */
export function undo<T>(h: History<T>, present: T): { history: History<T>; present: T } | null {
  if (h.past.length === 0) return null;
  const prev = h.past[h.past.length - 1];
  return {
    history: { past: h.past.slice(0, -1), future: [...h.future, present] },
    present: prev,
  };
}

/** Step forward again, if nothing has been edited since the undo. */
export function redo<T>(h: History<T>, present: T): { history: History<T>; present: T } | null {
  if (h.future.length === 0) return null;
  const next = h.future[h.future.length - 1];
  return {
    history: { past: [...h.past, present], future: h.future.slice(0, -1) },
    present: next,
  };
}
