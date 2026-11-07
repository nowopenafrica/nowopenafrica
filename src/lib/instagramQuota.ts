/**
 * Staying inside Instagram's rate limit instead of running into it.
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ─────────────────────────────────────
 *
 * It is NOT a way around the limit. There isn't one, and looking for one —
 * rotating tokens, spreading calls across accounts or addresses, going at an
 * unofficial endpoint — is the kind of thing that gets an app banned and is
 * outside what this project authorises.
 *
 * It is the opposite: Meta tells you how much of your hour you have spent,
 * on every single response, and nothing here was reading it. So a batch ran
 * flat out until Meta refused, reported "rate limit reached — run stopped",
 * and dropped the rest of the list on the floor.
 *
 * Two headers carry it (Graph API rate-limiting docs, read 2026-10-09):
 *
 *   X-App-Usage: {"call_count":28,"total_cputime":15,"total_time":20}
 *     — percentages of a rolling ONE HOUR window. At 100 the calls fail.
 *
 *   X-Business-Use-Case-Usage: {"<id>":[{..., "estimated_time_to_regain_access": 12}]}
 *     — MINUTES until throttling lifts, which is the one number that turns
 *       "stopped" into "continues at 14:35".
 *
 * Reading them makes the difference between a run that dies at handle 200
 * and a run that slows down, pauses, and finishes.
 */

/** Meta's percentages, as far as they could be read. */
export interface QuotaUsage {
  /** Share of the hour's calls spent, 0–100, or null when not reported. */
  callCount: number | null;
  totalTime: number | null;
  totalCpuTime: number | null;
  /** Minutes until throttling lifts, when Meta said. */
  regainAccessMinutes: number | null;
}

export const EMPTY_USAGE: QuotaUsage = {
  callCount: null, totalTime: null, totalCpuTime: null, regainAccessMinutes: null,
};

const pct = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Read both usage headers. Anything unparseable reads as "not reported".
 *
 * Meta omits these until an endpoint has seen enough traffic, so absence is
 * normal and must never be treated as 0% — that is the difference between
 * "plenty of room" and "we have no idea", and pacing on a guessed zero is
 * how you arrive at the wall at full speed.
 */
export function readUsage(headers: {
  get(name: string): string | null;
}): QuotaUsage {
  const out: QuotaUsage = { ...EMPTY_USAGE };

  try {
    const app = headers.get('x-app-usage');
    if (app) {
      const parsed = JSON.parse(app) as Record<string, unknown>;
      out.callCount = pct(parsed.call_count);
      out.totalTime = pct(parsed.total_time);
      out.totalCpuTime = pct(parsed.total_cputime);
    }
  } catch { /* unreported stays null */ }

  try {
    const buc = headers.get('x-business-use-case-usage');
    if (buc) {
      const parsed = JSON.parse(buc) as Record<string, Array<Record<string, unknown>>>;
      for (const entries of Object.values(parsed)) {
        for (const e of entries ?? []) {
          // The worst case across business objects is the one that binds.
          out.callCount = Math.max(out.callCount ?? 0, pct(e.call_count) ?? 0) || out.callCount;
          const mins = pct(e.estimated_time_to_regain_access);
          if (mins !== null && mins > 0) {
            out.regainAccessMinutes = Math.max(out.regainAccessMinutes ?? 0, mins);
          }
        }
      }
    }
  } catch { /* unreported stays null */ }

  return out;
}

/**
 * The share of the hour spent, as far as anything was reported.
 *
 * null means Meta reported nothing, which is NOT the same as zero.
 */
export function spentPercent(u: QuotaUsage): number | null {
  const known = [u.callCount, u.totalTime, u.totalCpuTime].filter((v): v is number => v !== null);
  return known.length ? Math.max(...known) : null;
}

/** Slow down here. Well before the wall, because the window is an hour long. */
export const SLOW_AT = 70;
/** Stop here, by choice, while calls still work. */
export const PAUSE_AT = 90;

export type Pace =
  /** Carry on at the normal delay. */
  | { action: 'go'; delayMs: number }
  /** Still working, but spend the rest of the hour more slowly. */
  | { action: 'slow'; delayMs: number; spent: number }
  /** Stop before Meta refuses, and say when to come back. */
  | { action: 'pause'; spent: number | null; resumeInMinutes: number };

/**
 * What to do before the next lookup.
 *
 * ── WHY IT PAUSES AT 90% RATHER THAN AT THE WALL ─────────────────────────
 *
 * Hitting the limit is not free. Meta counts the refused calls too, so a run
 * that keeps going spends its next hour as well, and the operator waits
 * longer than if it had simply stopped. Stopping at 90% leaves headroom for
 * whatever else uses the same app — the gallery refresh runs every twenty
 * minutes on the same quota.
 *
 * @param baseDelayMs the polite delay a run uses normally
 */
export function pace(u: QuotaUsage, baseDelayMs: number): Pace {
  const spent = spentPercent(u);

  /*
   * Already throttled: Meta said how long, so use its number. One minute
   * floor, because 0 would spin.
   */
  if (u.regainAccessMinutes !== null && u.regainAccessMinutes > 0) {
    return { action: 'pause', spent, resumeInMinutes: Math.max(1, Math.ceil(u.regainAccessMinutes)) };
  }

  if (spent === null) return { action: 'go', delayMs: baseDelayMs };

  if (spent >= PAUSE_AT) {
    /*
     * Meta did not say how long, so wait out the rest of the rolling hour.
     * The window is an hour, and the spend is spread across it; waiting a
     * proportion of it is a guess, so take the honest worst case.
     */
    return { action: 'pause', spent, resumeInMinutes: 60 };
  }

  if (spent >= SLOW_AT) {
    /*
     * Stretch the remaining calls over the rest of the window rather than
     * sprinting to 90 and stopping. Linear is enough: at 70% the delay
     * doubles, at 90% it is six times the base.
     */
    const over = (spent - SLOW_AT) / (PAUSE_AT - SLOW_AT);   // 0 → 1
    return { action: 'slow', delayMs: Math.round(baseDelayMs * (2 + over * 4)), spent };
  }

  return { action: 'go', delayMs: baseDelayMs };
}

/** When a paused run may continue, as a clock time the operator can read. */
export function resumeAt(minutes: number, now: Date = new Date()): string {
  const t = new Date(now.getTime() + minutes * 60_000);
  return t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * What to tell somebody whose run paused.
 *
 * Never "failed". The run did what it should: it stopped inside the limit,
 * kept everything already filed, and knows where to pick up. Calling that a
 * failure is what makes an operator go looking for a way around it.
 */
export function pauseExplanation(
  filed: number, remaining: number, resumeInMinutes: number, now: Date = new Date(),
): string {
  const kept = filed === 1 ? '1 account is filed' : `${filed} accounts are filed`;
  return `Paused inside Instagram's hourly limit — ${kept}, ${remaining} still to go. `
    + `Continue from where it stopped at about ${resumeAt(resumeInMinutes, now)}; nothing is lost and no lookups were wasted.`;
}
