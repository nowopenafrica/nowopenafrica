/**
 * What a CSV of handles contains, before a single lookup is spent.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────
 *
 * A batch used to find out that an account was already on NowOpen only after
 * looking it up — one Instagram call per handle, spent to learn something
 * the database already knew. On a 500-row list mostly made of businesses we
 * already hold, that is the whole hour's quota spent to add nothing, and the
 * run then stops before reaching the handles that ARE new.
 *
 * MEASURED 2026-10-09: Meta's own headers showed a single run at 86% of its
 * hourly time budget. Quota is the scarce thing here, so the cheapest
 * possible win is not asking about accounts we already have.
 *
 * ── WHERE "ALREADY KNOWN" LIVES ──────────────────────────────────────────
 *
 * Three places, in three different shapes, which is exactly why this is a
 * function and not an inline check:
 *
 *   businesses.social_links->>'instagram'   a bare handle OR a full URL,
 *                                           sometimes with /profilecard/
 *   radar_candidates.source_record_id       always a full profile URL
 *   instagram_handle_checks.handle          bare, lowercase
 *
 * All three go through `readHandle` so they compare as the same thing. A
 * normalisation miss here does not error — it silently reports a known
 * account as new and spends a call on it, which is the failure this module
 * exists to prevent.
 */

export type HandleState =
  /** Not on NowOpen in any form. The only kind worth a lookup. */
  | 'new'
  /** Already a published listing. */
  | 'listed'
  /** Already filed as a candidate, waiting for review. */
  | 'filed'
  /** Meta has told us this is not a readable Business account. */
  | 'unreadable';

export interface KnownHandles {
  /** Normalised handles already on a published listing. */
  listed: Set<string>;
  /** Normalised handles already in the review queue. */
  filed: Set<string>;
  /** Normalised handles the ledger says Meta cannot read. */
  unreadable: Set<string>;
}

export interface Preflight {
  /** Every handle in the file, in order, with what we already know. */
  rows: Array<{ handle: string; state: HandleState }>;
  counts: Record<HandleState, number>;
  /** The handles worth spending a lookup on. */
  newHandles: string[];
}

export const EMPTY_KNOWN: KnownHandles = {
  listed: new Set(), filed: new Set(), unreadable: new Set(),
};

/**
 * Classify each handle against what NowOpen already holds.
 *
 * Precedence is listed → filed → unreadable → new, and it is deliberate: a
 * handle that is BOTH a live listing and an old ledger entry should read as
 * "already listed", because that is the fact an operator acts on. Reporting
 * it as unreadable would suggest going and asking the business to switch to
 * a Business account, which it evidently already did.
 *
 * `handles` is expected already normalised by `readHandle`.
 */
export function classifyHandles(handles: string[], known: KnownHandles = EMPTY_KNOWN): Preflight {
  const counts: Record<HandleState, number> = { new: 0, listed: 0, filed: 0, unreadable: 0 };
  const rows: Preflight['rows'] = [];
  const newHandles: string[] = [];
  const seen = new Set<string>();

  for (const raw of handles) {
    const handle = (raw ?? '').trim().toLowerCase();
    if (!handle || seen.has(handle)) continue;   // one row per account
    seen.add(handle);

    const state: HandleState = known.listed.has(handle) ? 'listed'
      : known.filed.has(handle) ? 'filed'
        : known.unreadable.has(handle) ? 'unreadable'
          : 'new';

    counts[state] += 1;
    rows.push({ handle, state });
    if (state === 'new') newHandles.push(handle);
  }

  return { rows, counts, newHandles };
}

/**
 * One sentence an operator can act on, before anything is spent.
 *
 * Says what will be looked up and what will not, because "500 accounts" with
 * 460 of them already held is a number that misleads about both the cost and
 * the result.
 */
export function preflightSummary(p: Preflight): string {
  const { counts } = p;
  const known = counts.listed + counts.filed + counts.unreadable;
  if (known === 0) {
    return counts.new === 1
      ? '1 account, none of which NowOpen already holds.'
      : `${counts.new} accounts, none of which NowOpen already holds.`;
  }

  const parts: string[] = [];
  if (counts.listed) parts.push(`${counts.listed} already listed`);
  if (counts.filed) parts.push(`${counts.filed} already in the review queue`);
  if (counts.unreadable) parts.push(`${counts.unreadable} known not to be Business accounts`);

  const willLookUp = counts.new === 0
    ? 'Nothing left to look up'
    : `${counts.new} will be looked up`;

  return `${parts.join(', ')}. ${willLookUp} — ${known} ${known === 1 ? 'lookup' : 'lookups'} saved.`;
}
