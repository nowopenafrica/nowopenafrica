// NowOpen OS — snapshot history (pure, no React / Supabase I/O).
//
// Every time an OS view loads it derives a health snapshot and appends it to
// the history, so the founder can see whether the operating system is getting
// healthier over time. Each entry is derived from the ledgers at that moment —
// history is recorded, never seeded. The components read os_snapshots from
// Supabase and fall back to localStorage (clearly labelled) until the
// migration is applied, the same honest-fallback pattern as the rest of the
// OS.

import type { OsHealthSnapshot } from './commandOs';
import { dateKey } from './businessStatus';

export const OS_SNAPSHOTS_KEY = 'nowopen_os_snapshots';
export const OS_HISTORY_MAX = 90;

/** The local day a snapshot was derived on, stable across reads. */
export function snapshotDate(s: OsHealthSnapshot, fallback = new Date()): string {
  const d = new Date(s.derivedAt);
  return Number.isNaN(d.getTime()) ? dateKey(fallback) : dateKey(d);
}

/** Append today's snapshot to the history: one entry per day (today replaces
 *  any earlier same-day entry), sorted oldest-first, capped to OS_HISTORY_MAX. */
export function appendOsSnapshot(
  history: readonly OsHealthSnapshot[],
  snapshot: OsHealthSnapshot,
  now = new Date(),
): OsHealthSnapshot[] {
  const day = snapshotDate(snapshot, now);
  return [...history.filter((h) => snapshotDate(h, now) !== day), snapshot]
    .sort((a, b) => a.derivedAt.localeCompare(b.derivedAt))
    .slice(-OS_HISTORY_MAX);
}

export interface OsHistoryPoint {
  date: string;
  health: number;
}

export function osHistoryPoints(history: readonly OsHealthSnapshot[]): OsHistoryPoint[] {
  return history.map((h) => ({ date: snapshotDate(h), health: h.health }));
}

export interface OsHistoryTrend {
  points: OsHistoryPoint[];
  /** Today's health minus the first visible point — is the OS improving? */
  delta: number;
  average: number;
  min: number;
  max: number;
}

export function osHistoryTrend(
  history: readonly OsHealthSnapshot[],
  _now = new Date(),
): OsHistoryTrend {
  const points = osHistoryPoints(history);
  if (points.length === 0) return { points: [], delta: 0, average: 0, min: 0, max: 0 };
  const values = points.map((p) => p.health);
  return {
    points,
    delta: values[values.length - 1] - values[0],
    average: Math.round(values.reduce((sum, v) => sum + v, 0) / values.length),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export function loadOsSnapshots(): OsHealthSnapshot[] {
  try {
    const raw = localStorage.getItem(OS_SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is OsHealthSnapshot =>
        !!x
        && typeof x === 'object'
        && typeof (x as { health?: unknown }).health === 'number'
        && typeof (x as { derivedAt?: unknown }).derivedAt === 'string'
        && typeof (x as { ledgers?: unknown }).ledgers === 'object'
        && (x as { ledgers?: unknown }).ledgers !== null,
    );
  } catch {
    return [];
  }
}

export function saveOsSnapshots(list: readonly OsHealthSnapshot[]): void {
  try {
    localStorage.setItem(OS_SNAPSHOTS_KEY, JSON.stringify(list.slice(-OS_HISTORY_MAX)));
  } catch {
    // Storage unavailable — the trend just stays in memory for this session.
  }
}
