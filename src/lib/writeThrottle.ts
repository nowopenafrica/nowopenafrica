/**
 * Recognising the database's own "you are going too fast".
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * Nine public tables carry an in-database rate limit that raises SQLSTATE
 * 53400 (`configuration_limit_exceeded`) with the message
 *
 *   "Too many submissions from this connection. Please wait a little and try
 *    again, or contact us if you need to add several at once."
 *
 * MEASURED 2026-10-09: an operator running the Instagram batch hit the
 * `radar_candidate` ceiling (40/hour) twice in one afternoon. The batch did
 * not notice. It marked that row failed and carried on down the list — and
 * because every later filing hits the same ceiling, each remaining handle
 * spent an Instagram API call to fetch a profile that could not then be
 * filed. A 1,000-handle run would have burned 960 calls to produce 960
 * identical failures.
 *
 * Stopping is strictly better: the work already filed is kept, the quota is
 * not spent, and the operator is told the real reason rather than reading it
 * 960 times.
 */

/** SQLSTATE raised by `public.check_rate_limit`. */
export const THROTTLE_SQLSTATE = '53400';

export interface MaybePostgrestError {
  code?: string | null;
  message?: string | null;
}

/**
 * True when a write failed because it met a rate limit.
 *
 * Checks the SQLSTATE first, because that is the contract. The message is a
 * fallback for paths that lose the code (an edge function relaying an error
 * as text, say) — but it is deliberately a narrow match on the exact sentence
 * the database raises, not a loose search for "limit", which would catch
 * unrelated failures and stop a run that should continue.
 */
export function isWriteThrottled(err: MaybePostgrestError | null | undefined): boolean {
  if (!err) return false;
  if (err.code === THROTTLE_SQLSTATE) return true;
  return /too many submissions from this connection/i.test(err.message ?? '');
}

/**
 * What to tell an operator whose run was stopped by the limit.
 *
 * The database's own sentence is written for a stranger pasting into a public
 * form — "contact us if you need to add several at once" is addressed to
 * someone outside the company. An operator running the admin tooling IS the
 * company, so saying it to them is worse than useless. This says what
 * actually happened and what will work.
 */
export function throttleExplanation(filed: number, remaining: number): string {
  const kept = filed === 1 ? '1 listing is filed' : `${filed} listings are filed`;
  return `The database's hourly limit for new candidates was reached. ${kept} and ${remaining} `
    + `${remaining === 1 ? 'handle was' : 'handles were'} not attempted, so no lookups were wasted on them. `
    + 'Run the remainder in the next hour.';
}
