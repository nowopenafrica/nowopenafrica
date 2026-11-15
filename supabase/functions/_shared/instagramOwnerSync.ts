/**
 * Rules for the sync an owner triggers by adding their Instagram handle.
 *
 * Spec: docs/instagram/INSTAGRAM_LIVE_AND_GALLERY_SPEC_2026-11-15.md, phase 1.
 *
 * The trigger `queue_instagram_owner_sync` writes an `instagram_sync_requests`
 * row; refresh-instagram-gallery works those rows before its rotation. What
 * is decided here:
 *
 *  - whether to spend a Meta call at all (the handle ledger);
 *  - what a lookup's result means for the request;
 *  - how many requests one run may take from the shared budget.
 *
 * Pure: no network, no database. Tested in instagramOwnerSync.test.ts.
 */

/** Requests worked per run, out of the run's overall budget. */
export const MAX_REQUESTS_PER_RUN = 3;

/**
 * A 'working' claim older than this is treated as abandoned (a run that died
 * mid-way) and may be taken again.
 */
export const STALE_WORKING_MINUTES = 10;

/**
 * The owner's override of the handle ledger (founder decision, 15 Nov).
 *
 * The ledger normally suppresses a `not_business` handle for 30 days. An owner
 * who has just been told to switch to a Business account and has done it
 * should not wait a month, so an owner's request may re-ask once this many
 * hours after the last answer. Anything sooner gets the recorded answer.
 */
export const OWNER_RECHECK_HOURS = 24;

export interface LedgerEntry {
  outcome: string | null;
  last_checked_at: string | null;
}

export type RequestDecision =
  | { ask: true }
  | { ask: false; status: 'not_business'; note: string };

export function decideRequest(ledger: LedgerEntry | null | undefined, now: Date = new Date()): RequestDecision {
  if (!ledger || ledger.outcome !== 'not_business') return { ask: true };
  const at = Date.parse(String(ledger.last_checked_at ?? ''));
  if (Number.isNaN(at)) return { ask: true };
  const hours = (now.getTime() - at) / 3_600_000;
  if (hours >= OWNER_RECHECK_HOURS) return { ask: true };
  return {
    ask: false,
    status: 'not_business',
    note: 'Instagram said within the last day that this is not a public Business or Creator account.',
  };
}

/** The lookup reasons refresh-instagram-gallery can see. */
export type LookupReason = 'not_configured' | 'not_found' | 'rate_limited' | 'auth' | 'permission' | 'error';

export type RequestOutcome =
  | { status: 'done'; postsAdded: number; note: null }
  | { status: 'pending'; note: string }          // rate limited: try again next tick
  | { status: 'not_business'; note: string }
  | { status: 'error'; note: string };

/**
 * What a lookup means for the owner's request.
 *
 * A rate limit says nothing about the account, so the request goes back to
 * waiting rather than being closed: the owner asked once and should not have
 * to ask again because Instagram was busy.
 */
export function requestOutcome(
  result: { ok: true; postsAdded: number; insertFailed?: boolean } | { ok: false; reason: LookupReason; message?: string },
): RequestOutcome {
  if (result.ok) {
    if (result.insertFailed) return { status: 'error', note: 'The posts were found but could not be saved.' };
    return { status: 'done', postsAdded: result.postsAdded, note: null };
  }
  switch (result.reason) {
    case 'rate_limited':
      return { status: 'pending', note: 'Instagram asked us to slow down; this will be retried shortly.' };
    case 'not_found':
      return { status: 'not_business', note: 'Instagram says this is not a public Business or Creator account.' };
    default:
      return { status: 'error', note: result.message ? result.message.slice(0, 300) : `Lookup failed (${result.reason}).` };
  }
}

/** Whether a row in 'working' was abandoned and may be claimed again. */
export function isStaleWorking(requestedOrClaimedAt: string | null | undefined, now: Date = new Date()): boolean {
  const at = Date.parse(String(requestedOrClaimedAt ?? ''));
  if (Number.isNaN(at)) return true;
  return now.getTime() - at >= STALE_WORKING_MINUTES * 60_000;
}
