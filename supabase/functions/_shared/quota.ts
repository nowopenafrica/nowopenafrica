/**
 * Meta's reported quota, read server-side.
 *
 * The browser has its own copy of this in `src/lib/instagramQuota.ts`, which
 * also carries the PACING rules a batch uses. This one deliberately does not:
 * an edge function never paces, it only decides whether a request may spend a
 * lookup at all (see intakeGuard.ts). Duplicating a four-field parser is a
 * smaller cost than making a Deno function import from the Vite app, which
 * the two tsconfigs do not allow in that direction.
 *
 * MEASURED 2026-10-09 on a live `business_discovery` call:
 *
 *   x-app-usage: {"call_count":45,"total_cputime":0,"total_time":86}
 *
 * `total_time` binds long before `call_count`, so anything reading only the
 * call count believes it has half the hour left when it has 14%.
 */

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
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Parse the raw headers `lookupInstagramBusiness` forwards.
 *
 * Anything unparseable reads as "not reported" rather than throwing: a
 * malformed header must not take down a lookup that otherwise worked, and
 * null already means unknown everywhere downstream.
 */
export function usageFromHeaders(headers: Record<string, string> | undefined | null): QuotaUsage {
  const out: QuotaUsage = { ...EMPTY_USAGE };
  if (!headers) return out;

  try {
    const app = headers["x-app-usage"];
    if (app) {
      const parsed = JSON.parse(app) as Record<string, unknown>;
      out.callCount = pct(parsed.call_count);
      out.totalTime = pct(parsed.total_time);
      out.totalCpuTime = pct(parsed.total_cputime);
    }
  } catch { /* unreported stays null */ }

  try {
    const buc = headers["x-business-use-case-usage"];
    if (buc) {
      const parsed = JSON.parse(buc) as Record<string, Array<Record<string, unknown>>>;
      for (const entries of Object.values(parsed)) {
        for (const e of entries ?? []) {
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
