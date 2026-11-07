import { describe, it, expect } from 'vitest';

import {
  autosaveDecision, AUTOSAVE_DELAY_MS, SAVE_LABEL, type AutosaveInput, type SaveState,
} from './autosave';

const input = (over: Partial<AutosaveInput> = {}): AutosaveInput => ({
  signedIn: true, projectId: 'p1', state: 'unsaved', online: true, ...over,
});

describe('when it saves', () => {
  it('saves a signed-in project with unsaved changes', () => {
    expect(autosaveDecision(input())).toMatchObject({ save: true });
  });

  it('does nothing when there is nothing to save', () => {
    for (const state of ['idle', 'saved'] as SaveState[]) {
      expect(autosaveDecision(input({ state })).save, state).toBe(false);
    }
  });
});

describe('when it refuses, and why', () => {
  /*
   * Autosaving a document with no row would insert one for every template
   * anybody opened and clicked about in — a table full of designs nobody
   * meant to keep, created before the user decided they wanted them.
   */
  it('will not create a project that the user never saved', () => {
    const d = autosaveDecision(input({ projectId: null }));
    expect(d.save).toBe(false);
    expect(d.reason).toMatch(/save once/i);
  });

  it('will not save for a signed-out visitor', () => {
    const d = autosaveDecision(input({ signedIn: false }));
    expect(d.save).toBe(false);
    expect(d.reason).toMatch(/sign in/i);
  });

  /*
   * ── THE DANGEROUS ONE ────────────────────────────────────────────────
   *
   * After a version conflict another tab or device holds something newer.
   * Retrying on a timer either fails forever or eventually wins and
   * overwrites work the user cannot see from here.
   */
  it('stops completely after a version conflict', () => {
    const d = autosaveDecision(input({ state: 'conflict' }));
    expect(d.save).toBe(false);
    expect(d.reason).toMatch(/changed somewhere else/i);
  });

  it('stays stopped on conflict even when everything else looks fine', () => {
    expect(autosaveDecision({ signedIn: true, projectId: 'p1', state: 'conflict', online: true }).save).toBe(false);
  });

  /* Two writes with the same expected version is how one of them is lost. */
  it('does not start a second save while one is in flight', () => {
    const d = autosaveDecision(input({ state: 'saving' }));
    expect(d.save).toBe(false);
    expect(d.reason).toMatch(/saving/i);
  });

  it('waits for a connection, and says the work is still there', () => {
    const d = autosaveDecision(input({ online: false }));
    expect(d.save).toBe(false);
    expect(d.reason).toMatch(/still here/i);
  });

  it('always gives a reason, whatever the combination', () => {
    for (const signedIn of [true, false]) {
      for (const projectId of ['p1', null]) {
        for (const online of [true, false]) {
          for (const state of ['idle', 'unsaved', 'saving', 'saved', 'error', 'conflict'] as SaveState[]) {
            const d = autosaveDecision({ signedIn, projectId, state, online });
            expect(d.reason.length, `${signedIn}/${projectId}/${online}/${state}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  /* An error is worth retrying; a conflict is not. */
  it('retries after an ordinary failure once the document changes again', () => {
    expect(autosaveDecision(input({ state: 'error' })).save).toBe(false);
    expect(autosaveDecision(input({ state: 'unsaved' })).save).toBe(true);
  });
});

describe('what the user is told', () => {
  /*
   * "Saved" is the word people check before closing the tab. It must mean
   * the write came back, not that one was attempted.
   */
  it('only says Saved for the state set after a confirmed write', () => {
    expect(SAVE_LABEL.saved).toBe('Saved');
    expect(SAVE_LABEL.saving).not.toBe('Saved');
    expect(SAVE_LABEL.unsaved).not.toMatch(/^Saved$/);
    expect(SAVE_LABEL.error).toMatch(/could not/i);
  });

  it('has a label for every state', () => {
    for (const state of ['idle', 'unsaved', 'saving', 'saved', 'error', 'conflict'] as SaveState[]) {
      expect(typeof SAVE_LABEL[state], state).toBe('string');
    }
  });
});

describe('the delay', () => {
  /* One save per sentence, not forty; seconds of loss, not minutes. */
  it('is long enough to batch typing and short enough to matter', () => {
    expect(AUTOSAVE_DELAY_MS).toBeGreaterThanOrEqual(1000);
    expect(AUTOSAVE_DELAY_MS).toBeLessThanOrEqual(10000);
  });
});
