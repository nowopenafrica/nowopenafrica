import { describe, it, expect } from 'vitest';
import { Business } from '../types';
import {
  buildDailyBrief,
  dailyMetrics,
  dailyFollowers,
  todayGoalFor,
  completeTodayGoal,
  DAILY_METRIC_KEYS,
  loadGoalRecord,
} from './dailyBrief';

const business: Business = {
  id: 'biz-1',
  name: 'Sunrise Grill',
  description: 'A fast food restaurant serving grilled specials in Lagos.',
  category: 'restaurant',
  location: 'Lagos, Nigeria',
  phone: '+2348000000000',
  rating: 4.5,
};

const now = new Date('2026-08-04T10:30:00');

describe('dailyBrief', () => {
  it('builds a full brief with every metric present', () => {
    const brief = buildDailyBrief(business, now);
    expect(brief.date).toBe('2026-08-04');
    expect(brief.greeting).toMatch(/morning|afternoon|evening/);
    expect(brief.metrics).toHaveLength(DAILY_METRIC_KEYS.length);
    for (const m of brief.metrics) {
      expect(m.value).toBeGreaterThanOrEqual(0);
      expect(['up', 'down', 'flat']).toContain(m.trend);
    }
    expect(brief.goal.title.length).toBeGreaterThan(0);
    expect(brief.goal.points).toBeGreaterThan(0);
  });

  it('is deterministic for the same business + date', () => {
    const a = buildDailyBrief(business, now);
    const b = buildDailyBrief(business, now);
    expect(a.metrics.map((m) => m.value)).toEqual(b.metrics.map((m) => m.value));
    expect(a.followers).toBe(b.followers);
    expect(a.goal.key).toBe(b.goal.key);
  });

  it('changes metrics day to day', () => {
    const a = dailyMetrics(business, now);
    const b = dailyMetrics(business, new Date('2026-08-05T10:30:00'));
    expect(a.map((m) => m.value)).not.toEqual(b.map((m) => m.value));
  });

  it('persists goal completion', () => {
    const before = todayGoalFor(business, now);
    expect(before.done).toBe(false);
    const record = completeTodayGoal(business.id, now);
    expect(record.done).toBe(true);
    expect(loadGoalRecord(business.id)?.date).toBe('2026-08-04');
    expect(buildDailyBrief(business, now).goal.done).toBe(true);
    localStorage.removeItem(`nowopen_dailyGoal_${business.id}`);
  });

  it('dailyFollowers scales with business', () => {
    expect(dailyFollowers(business, now)).toBeGreaterThan(0);
  });
});
