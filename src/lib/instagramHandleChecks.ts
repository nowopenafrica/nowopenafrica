/**
 * What we already know about an Instagram handle, so we stop asking.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * A batch that met a personal account said, on screen:
 *
 *   skipped — @name is not a public Instagram Business or Creator account.
 *   Personal accounts cannot be read through the official API.
 *
 * ...and wrote nothing down. Close the page and the finding was gone. The
 * next run of the same list spent another API call to be told the same
 * thing, and nobody could answer "which of the handles we were sent are not
 * reachable?" — the question that decides whether to go and ask those
 * businesses to switch to a Business account.
 *
 * So the outcome is now filed against the handle and UPDATED on each later
 * attempt, instead of being announced and discarded.
 *
 * ── WHY A SKIP IS NEVER PERMANENT ────────────────────────────────────────
 *
 * Any personal account can be converted to a Business or Creator account in
 * a few taps, and a good number of the small businesses this directory is
 * for eventually will. Treating one "no" as settled forever would quietly
 * lock them out. So a skip expires: after RECHECK_AFTER_DAYS the handle is
 * attempted again and its row updated.
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────
 *
 * Not a workaround. Being told an account cannot be read through the
 * official API is respected — this records that answer so we ask LESS often,
 * never more. Nothing is read from, or stored about, an account we are not
 * permitted to read: the handle came from the operator's own list, and the
 * outcome came from Meta.
 */

/**
 * How long a "not a Business account" answer is trusted before we look again.
 *
 * 30 days is a compromise, not a measurement: short enough that a business
 * which switches is picked up within a month, long enough that a 1,000-handle
 * list does not re-spend its API budget on the same dead ends every week.
 */
export const RECHECK_AFTER_DAYS = 30;

export type CheckOutcome =
  /** Meta says this is not a public Business/Creator account. */
  | 'not_business'
  /** Reachable, but carried no business name to file. */
  | 'no_name'
  /** We were throttled. Says nothing about the account. */
  | 'rate_limited'
  /** The lookup itself failed. */
  | 'error'
  /** Read successfully and filed as a candidate. */
  | 'extracted';

export interface HandleCheck {
  handle: string;
  outcome: CheckOutcome;
  /** ISO timestamp of the last attempt. */
  last_checked_at: string;
  check_count: number;
  reason?: string | null;
}

const DAY_MS = 86_400_000;

/** Whole days since `iso`, or null when it is missing or unparseable. */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / DAY_MS);
}

/**
 * True when a previous answer still stands and the API call can be saved.
 *
 * Only `not_business` suppresses a lookup. Everything else is either
 * transient (a rate limit, an error) or liable to change in a way we want to
 * catch (a profile that gains a name, a listing worth refreshing) — and a
 * cache that suppresses those would turn a temporary failure into a permanent
 * one, which is the bug this module exists to avoid, not to introduce.
 */
export function shouldSkipLookup(
  prev: HandleCheck | undefined | null,
  now: Date = new Date(),
  recheckAfterDays: number = RECHECK_AFTER_DAYS,
): boolean {
  if (!prev || prev.outcome !== 'not_business') return false;
  const age = daysSince(prev.last_checked_at, now);
  if (age === null) return false;
  return age < recheckAfterDays;
}

/**
 * What to tell the operator about a handle we did not look up again.
 *
 * Says when we last asked and when we will ask again, because "skipped" on
 * its own is the thing that made this invisible in the first place.
 */
export function skipExplanation(
  prev: HandleCheck,
  now: Date = new Date(),
  recheckAfterDays: number = RECHECK_AFTER_DAYS,
): string {
  const age = daysSince(prev.last_checked_at, now) ?? 0;
  const due = Math.max(recheckAfterDays - age, 0);
  const when = age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`;
  const next = due === 0 ? 'due to be checked again' : `will be checked again in ${due} day${due === 1 ? '' : 's'}`;
  return `Not a Business or Creator account when checked ${when} — ${next}. Asked ${prev.check_count} time${prev.check_count === 1 ? '' : 's'}.`;
}

/**
 * The row to write after an attempt.
 *
 * `check_count` is carried forward from what was read rather than incremented
 * in the database, because the caller has already loaded the previous row to
 * decide whether to look at all — a second round trip to add one would buy
 * nothing. First sighting counts as 1.
 */
export function checkRow(
  handle: string,
  outcome: CheckOutcome,
  reason: string | null,
  prev: HandleCheck | undefined | null,
  context: { listSource?: string; sourceFile?: string } = {},
  now: Date = new Date(),
): {
  handle: string; outcome: CheckOutcome; reason: string | null;
  last_checked_at: string; check_count: number;
  list_source: string | null; source_file: string | null;
} {
  return {
    // The table's own constraint requires this form; normalise rather than fail.
    handle: handle.trim().replace(/^@/, '').toLowerCase(),
    outcome,
    reason: reason?.slice(0, 500) ?? null,
    last_checked_at: now.toISOString(),
    check_count: (prev?.check_count ?? 0) + 1,
    list_source: context.listSource?.trim() || null,
    source_file: context.sourceFile?.trim() || null,
  };
}
