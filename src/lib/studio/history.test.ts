import { describe, it, expect } from 'vitest';

import {
  canRedo, canUndo, emptyHistory, HISTORY_LIMIT, record, redo, undo, type History,
} from './history';

/** A stand-in document. The history does not care what it holds. */
type Doc = { x: number };

/** One gesture: note what precedes the edit, then make the edit. */
function gesture(h: History<Doc>, present: Doc, change: (d: Doc) => Doc) {
  return { history: record(h, present), present: change(present) };
}

describe('a gesture can be taken back', () => {
  /*
   * ── THE REGRESSION ───────────────────────────────────────────────────
   *
   * Shipped on 2026-10-14: the snapshot was taken when the drag ENDED, so
   * the history held the state the drag had just produced and undo restored
   * what was already on screen. Every geometry test passed; the button did
   * nothing. This asserts the ORDER, which is the part that was wrong.
   */
  it('restores the state that preceded the edit, not the edit itself', () => {
    const before: Doc = { x: 0 };
    const g = gesture(emptyHistory<Doc>(), before, (d) => ({ x: d.x + 10 }));
    expect(g.present).toEqual({ x: 10 });

    const back = undo(g.history, g.present);
    expect(back?.present).toEqual(before);
    expect(back?.present).not.toEqual(g.present);
  });

  it('goes forward again after going back', () => {
    const g = gesture(emptyHistory<Doc>(), { x: 0 }, () => ({ x: 10 }));
    const back = undo(g.history, g.present)!;
    const forward = redo(back.history, back.present);
    expect(forward?.present).toEqual({ x: 10 });
  });

  it('walks back through several gestures in order', () => {
    let h = emptyHistory<Doc>();
    let doc: Doc = { x: 0 };
    for (const to of [1, 2, 3]) {
      const g = gesture(h, doc, () => ({ x: to }));
      h = g.history; doc = g.present;
    }
    const seen: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const back = undo(h, doc)!;
      h = back.history; doc = back.present;
      seen.push(doc.x);
    }
    expect(seen).toEqual([2, 1, 0]);
    expect(canUndo(h)).toBe(false);
  });
});

/*
 * ── WHY PURITY IS TESTED AT ALL ──────────────────────────────────────────
 *
 * The first version mutated refs inside a React state updater. React invokes
 * updaters more than once — twice under StrictMode, again on a replayed
 * render — so each snapshot was pushed twice and each undo popped twice.
 * These two tests are what make a repeated invocation harmless.
 */
describe('calling it twice is the same as calling it once', () => {
  it('does not change the history it was given', () => {
    const h = record(emptyHistory<Doc>(), { x: 0 });
    const snapshot = JSON.stringify(h);
    record(h, { x: 1 });
    undo(h, { x: 1 });
    redo(record(h, { x: 1 }), { x: 2 });
    expect(JSON.stringify(h)).toBe(snapshot);
  });

  it('produces the same result when a call is repeated', () => {
    const h = emptyHistory<Doc>();
    expect(record(h, { x: 0 })).toEqual(record(h, { x: 0 }));

    const one = record(h, { x: 0 });
    expect(undo(one, { x: 5 })).toEqual(undo(one, { x: 5 }));
  });
});

describe('the edges', () => {
  it('reports nothing to undo rather than returning the same state', () => {
    expect(undo(emptyHistory<Doc>(), { x: 1 })).toBeNull();
    expect(redo(emptyHistory<Doc>(), { x: 1 })).toBeNull();
    expect(canUndo(emptyHistory())).toBe(false);
    expect(canRedo(emptyHistory())).toBe(false);
  });

  /*
   * Editing after an undo abandons the branch that was undone. Keeping redo
   * alive would jump the user into a future that no longer follows from what
   * is on screen.
   */
  it('drops the redo stack once you edit again', () => {
    const g = gesture(emptyHistory<Doc>(), { x: 0 }, () => ({ x: 10 }));
    const back = undo(g.history, g.present)!;
    expect(canRedo(back.history)).toBe(true);

    const after = gesture(back.history, back.present, () => ({ x: 99 }));
    expect(canRedo(after.history)).toBe(false);
  });

  /* An unbounded history is a memory leak with a nice name. */
  it('keeps the most recent steps and forgets the oldest', () => {
    let h = emptyHistory<Doc>();
    for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) h = record(h, { x: i });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[h.past.length - 1]).toEqual({ x: HISTORY_LIMIT + 19 });
    expect(h.past[0]).toEqual({ x: 20 });
  });
});
