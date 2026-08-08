import { describe, it, expect, beforeEach } from 'vitest';
import {
  appendOsSnapshot, osHistoryPoints, osHistoryTrend,
  loadOsSnapshots, saveOsSnapshots, OS_SNAPSHOTS_KEY,
} from './osHistory';
import type { OsHealthSnapshot } from './commandOs';

const snap = (health: number, iso: string): OsHealthSnapshot => ({
  health,
  derivedAt: iso,
  ledgers: {
    workforce: 1, work_items: 1, approvals: 1, knowledge: 1,
    launches: 1, partners: 1, press: 1, campaigns: 1,
  },
});

describe('os snapshot history', () => {
  beforeEach(() => localStorage.clear());

  it('appends one entry per day, replacing an earlier same-day snapshot', () => {
    const now = new Date('2026-08-08T09:00:00');
    let history = appendOsSnapshot([], snap(80, '2026-08-07T09:00:00Z'), now);
    history = appendOsSnapshot(history, snap(85, '2026-08-08T08:00:00Z'), now);
    history = appendOsSnapshot(history, snap(90, '2026-08-08T09:00:00Z'), now);
    expect(history).toHaveLength(2);
    expect(history[0].health).toBe(80);
    expect(history[1].health).toBe(90);
  });

  it('keeps history sorted oldest-first', () => {
    const now = new Date('2026-08-08T09:00:00');
    const history = appendOsSnapshot(
      appendOsSnapshot([], snap(70, '2026-08-08T09:00:00Z'), now),
      snap(60, '2026-08-07T09:00:00Z'),
      now,
    );
    expect(osHistoryPoints(history).map((p) => p.date)).toEqual(['2026-08-07', '2026-08-08']);
  });

  it('derives a trend: delta, average, min and max from the visible window', () => {
    const now = new Date('2026-08-08T09:00:00');
    let history: OsHealthSnapshot[] = [];
    for (const [health, iso] of [
      [60, '2026-08-05T09:00:00Z'],
      [70, '2026-08-06T09:00:00Z'],
      [65, '2026-08-07T09:00:00Z'],
      [75, '2026-08-08T09:00:00Z'],
    ] as const) {
      history = appendOsSnapshot(history, snap(health, iso), now);
    }
    const trend = osHistoryTrend(history);
    expect(trend.points).toHaveLength(4);
    expect(trend.delta).toBe(15);
    expect(trend.average).toBe(68);
    expect(trend.min).toBe(60);
    expect(trend.max).toBe(75);
  });

  it('returns an empty trend when there is no history', () => {
    expect(osHistoryTrend([])).toEqual({ points: [], delta: 0, average: 0, min: 0, max: 0 });
  });

  it('round-trips through localStorage and ignores malformed entries', () => {
    localStorage.setItem(OS_SNAPSHOTS_KEY, JSON.stringify([snap(80, '2026-08-07T09:00:00Z'), { nope: true }, 'x']));
    const loaded = loadOsSnapshots();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].health).toBe(80);
    saveOsSnapshots(loaded);
    expect(loadOsSnapshots()).toHaveLength(1);
  });

  it('caps the history at the maximum window', () => {
    const now = new Date('2026-08-08T09:00:00');
    let history: OsHealthSnapshot[] = [];
    for (let i = 0; i < 100; i += 1) {
      history = appendOsSnapshot(history, snap(50 + (i % 40), `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}T09:00:00Z`), now);
    }
    expect(history.length).toBeLessThanOrEqual(90);
  });
});
