/**
 * When the editor saves by itself.
 *
 * ── WHY THIS IS A DECISION AND NOT A TIMER ───────────────────────────────
 *
 * Autosave is easy to write and easy to get dangerously wrong. The rules
 * below each exist because the alternative loses or corrupts someone's work:
 *
 *   - It never saves a document that has no project row yet. Opening a
 *     template and clicking about would otherwise insert a row for every
 *     design nobody meant to keep, and the first one would be created before
 *     the user had decided they wanted it at all.
 *   - It stops completely after a version conflict. Another tab or device has
 *     written something newer; retrying on a timer would either fail forever
 *     or, worse, eventually win and overwrite work the user cannot see.
 *   - It does not fire while a save is already in flight, so two writes
 *     cannot race with the same expected version.
 *   - It gives a REASON when it declines, because the editor shows that
 *     reason. "Not saved" with no explanation is what makes people paste
 *     their work into a notes app.
 */

export type SaveState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error' | 'conflict';

/**
 * How long the document must sit still before it is written.
 *
 * Long enough that a sentence being typed is one save rather than forty;
 * short enough that a closed laptop costs seconds of work, not minutes.
 */
export const AUTOSAVE_DELAY_MS = 2500;

export interface AutosaveInput {
  signedIn: boolean;
  /** Null until the design has been saved once, deliberately. */
  projectId: string | null;
  state: SaveState;
  online: boolean;
}

export interface AutosaveDecision {
  save: boolean;
  /** Shown to the user when it declines, so "not saved" is never unexplained. */
  reason: string;
}

export function autosaveDecision(input: AutosaveInput): AutosaveDecision {
  if (input.state === 'conflict') {
    return { save: false, reason: 'This design was changed somewhere else. Reload to get the newer version.' };
  }
  if (!input.signedIn) {
    return { save: false, reason: 'Sign in to save this design to your account.' };
  }
  if (!input.projectId) {
    return { save: false, reason: 'Save once, and changes after that are kept automatically.' };
  }
  if (!input.online) {
    return { save: false, reason: 'No connection. Your changes are still here and will be saved when you are back online.' };
  }
  if (input.state === 'saving') {
    return { save: false, reason: 'Saving…' };
  }
  if (input.state !== 'unsaved') {
    return { save: false, reason: 'Everything is saved.' };
  }
  return { save: true, reason: 'Saving your changes.' };
}

/**
 * What the status line says.
 *
 * "Saved" appears only for `saved`, which is set after the write comes back —
 * never on the way out. A save indicator that lies is worse than none, since
 * it is the thing people check before closing the tab.
 */
export const SAVE_LABEL: Record<SaveState, string> = {
  idle: '',
  unsaved: 'Not saved yet',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Could not save',
  conflict: 'Newer version elsewhere',
};
