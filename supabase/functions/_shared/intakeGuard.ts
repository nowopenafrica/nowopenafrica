/**
 * What a stranger is allowed to spend of our Instagram hour.
 *
 * ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────
 *
 * `extract-instagram` is staff-gated for one reason: it spends the app's Meta
 * budget, MEASURED at 86% of the hour from a single admin run. Opening the
 * same capability to anybody who can type a handle hands that budget to the
 * internet — and when it is gone, the gallery refresh stops, the admin batch
 * stops, and the only visible symptom is "Instagram is not working".
 *
 * So public intake gets a SLICE, not the hour. Two independent limits:
 *
 *   1. A global ceiling. Public lookups stop at PUBLIC_CEILING percent of the
 *      window, leaving the rest for the scheduled jobs and the admin tools
 *      that keep the directory current. A visitor is told to come back; an
 *      operator is never locked out by strangers.
 *
 *   2. A per-caller limit. One business owner checks one handle. Somebody
 *      enumerating accounts does not, and PER_CALLER_MAX is the difference.
 *
 * Neither is a substitute for the other: the ceiling alone lets one script
 * spend 60% of every hour forever, and the per-caller limit alone lets a
 * thousand callers spend all of it at once.
 */

import { type QuotaUsage } from './quota.ts';

/**
 * How much of Meta's hour public intake may spend.
 *
 * Not a measurement — a reservation. The scheduled gallery refresh runs every
 * twenty minutes on this same budget and an operator may run a batch at any
 * time; both matter more than an anonymous lookup, because both keep listings
 * that already exist correct.
 */
export const PUBLIC_CEILING = 60;

/**
 * Lookups one ADDRESS may make per window.
 *
 * Ten, not three. Three was set thinking of one owner checking one shop, and
 * it ignored how this audience reaches the internet: Nigerian mobile networks
 * NAT heavily, so a single address can be hundreds of real people. Three
 * would lock out a carrier's whole subscriber base after one curious visitor
 * and two typos.
 *
 * Ten still stops enumeration — anyone wanting thousands of accounts needs
 * thousands of addresses — and the budget ceiling above is what actually
 * bounds the damage if they have them.
 */
export const PER_CALLER_MAX = 10;

/** The window both limits are counted over, matching Meta's rolling hour. */
export const WINDOW_SECONDS = 3600;

export type IntakeDecision =
  | { allow: true }
  /** Refused, with something true to say about why and when. */
  | { allow: false; reason: 'budget' | 'caller'; retryAfterMinutes: number; message: string };

/** The fixed window this instant falls in, matching the SQL implementation. */
export function windowStart(now: Date = new Date(), seconds = WINDOW_SECONDS): Date {
  return new Date(Math.floor(now.getTime() / (seconds * 1000)) * seconds * 1000);
}

/** Whole minutes left in the current window, never zero. */
export function minutesLeftInWindow(now: Date = new Date(), seconds = WINDOW_SECONDS): number {
  const end = windowStart(now, seconds).getTime() + seconds * 1000;
  return Math.max(1, Math.ceil((end - now.getTime()) / 60_000));
}

/**
 * The highest of Meta's reported percentages, or null when it reported none.
 *
 * null is NOT zero. Meta omits the usage headers until an endpoint has seen
 * traffic, so an unreported quota is unknown — and treating unknown as empty
 * is how a budget guard lets everything through on the first request of
 * every window.
 */
export function spentPercent(u: QuotaUsage | null | undefined): number | null {
  if (!u) return null;
  const known = [u.callCount, u.totalTime, u.totalCpuTime].filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  return known.length ? Math.max(...known) : null;
}

/**
 * May this caller spend a lookup?
 *
 * @param usage    what Meta last told us about the hour, or null if unknown
 * @param callerHits lookups this caller has already made in this window
 */
export function decideIntake(
  usage: QuotaUsage | null,
  callerHits: number,
  now: Date = new Date(),
  { ceiling = PUBLIC_CEILING, perCaller = PER_CALLER_MAX } = {},
): IntakeDecision {
  /*
   * The caller limit is checked FIRST and deliberately so. It is the one a
   * person can do something about — and refusing on it does not leak how much
   * of the platform's budget is left, which is not a stranger's business.
   */
  if (callerHits >= perCaller) {
    const mins = minutesLeftInWindow(now);
    return {
      allow: false,
      reason: 'caller',
      retryAfterMinutes: mins,
      message: `You have checked ${callerHits} accounts in the last hour. Please try again in about ${mins} minute${mins === 1 ? '' : 's'}.`,
    };
  }

  const spent = spentPercent(usage);
  /*
   * Unknown spend proceeds. Meta reports nothing until an endpoint has seen
   * traffic, so refusing on silence would refuse the first request of every
   * window — and the per-caller limit still bounds what silence can cost.
   */
  if (spent !== null && spent >= ceiling) {
    const mins = minutesLeftInWindow(now);
    return {
      allow: false,
      reason: 'budget',
      retryAfterMinutes: mins,
      message: `Instagram look-ups are busy just now. Please try again in about ${mins} minute${mins === 1 ? '' : 's'} — or add your business directly, which works straight away.`,
    };
  }

  return { allow: true };
}
