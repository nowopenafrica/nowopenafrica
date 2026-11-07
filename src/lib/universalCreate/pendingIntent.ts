/**
 * Remembering where somebody was going when we interrupted them to sign in.
 *
 * ── WHY THIS IS NOT A REDIRECT PARAMETER ─────────────────────────────────
 *
 * `?redirect=/dashboard?tab=offers` would mostly work, and it breaks in the
 * two places that matter: an OAuth round trip through Google drops it, and a
 * nested query string needs escaping that something always gets wrong.
 *
 * sessionStorage survives both, including the full page load that OAuth
 * performs on the way back, and dies with the tab — which is the right
 * lifetime for "what I was doing a moment ago".
 *
 * ── IT CAN ALWAYS FAIL ───────────────────────────────────────────────────
 *
 * sessionStorage throws in a private window, with site data blocked, and in
 * some embedded browsers. Every access here is wrapped, and losing the intent
 * degrades to landing on the dashboard rather than throwing on the way back
 * from a successful sign-in. Being unable to remember a destination must never
 * be worse than not having tried.
 */

import type { CreateIntent } from './intents';

const KEY = 'nowopen.create.pending';

/** How long a remembered intent is worth honouring. */
const MAX_AGE_MS = 30 * 60 * 1000;

interface Stored {
  intent: CreateIntent;
  /** Where to land. Resolved when stored, so the reader needs no catalogue. */
  destination: string;
  at: number;
}

/** Remember an intent across a sign-in. Silent on failure, by design. */
export function rememberIntent(intent: CreateIntent, destination: string): void {
  try {
    const payload: Stored = { intent, destination, at: Date.now() };
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* Private window or blocked storage. They land on the dashboard instead. */
  }
}

/**
 * Take back the remembered intent, removing it.
 *
 * Read-and-clear in one call: an intent left behind would fire again the next
 * time somebody signed in, sending them somewhere they did not ask to go.
 */
export function takePendingIntent(): Stored | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);

    const parsed = JSON.parse(raw) as Stored;
    if (!parsed?.destination || typeof parsed.destination !== 'string') return null;

    // Stale: they left and came back much later, and almost certainly meant
    // to do something else.
    if (!Number.isFinite(parsed.at) || Date.now() - parsed.at > MAX_AGE_MS) return null;

    /*
     * Only ever an internal path. A stored value that could name an external
     * URL would be an open redirect the moment anything else could write it —
     * and sessionStorage is writable by any script on the origin.
     */
    if (!parsed.destination.startsWith('/') || parsed.destination.startsWith('//')) return null;

    return parsed;
  } catch {
    return null;
  }
}

/** Is something waiting? Used to decide whether to show "continue where you left off". */
export function hasPendingIntent(): boolean {
  try {
    return sessionStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/** Forget it — e.g. the person explicitly chose to do something else. */
export function clearPendingIntent(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
