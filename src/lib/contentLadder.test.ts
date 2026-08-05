import { describe, it, expect } from 'vitest';
import { Business } from '../types';
import { buildMonthPlan, saveMonthToPlanner, WEEK_THEMES, LADDER_PLATFORMS } from './contentLadder';
import { loadPlannerItems } from './planner';

const business: Business = {
  id: 'biz-1',
  name: 'Sunrise Grill',
  description: 'A fast food restaurant serving grilled specials in Lagos.',
  category: 'restaurant',
  location: 'Lagos, Nigeria',
  rating: 4.5,
};

const now = new Date('2026-08-04T10:30:00');

describe('contentLadder', () => {
  it('generates every day of the requested month', () => {
    const plan = buildMonthPlan(business, { year: 2026, month: 7, now }); // August 2026
    expect(plan).toHaveLength(31);
    expect(plan[0].date).toBe('2026-08-01');
    expect(plan[30].date).toBe('2026-08-31');
  });

  it('follows the Sun–Sat theme ladder', () => {
    const plan = buildMonthPlan(business, { year: 2026, month: 7, now });
    // Aug 2 2026 is a Sunday → community theme
    const sunday = plan.find((d) => d.date === '2026-08-02')!;
    expect(sunday.theme.key).toBe('community');
    const monday = plan.find((d) => d.date === '2026-08-03')!;
    expect(monday.theme.key).toBe('educational');
  });

  it('gives every day a caption, platform and format', () => {
    const plan = buildMonthPlan(business, { year: 2026, month: 7, now });
    for (const day of plan) {
      expect(day.title.length).toBeGreaterThan(0);
      expect(day.caption.length).toBeGreaterThan(0);
      expect(LADDER_PLATFORMS).toContain(day.platform);
      expect(day.status).toBe('planned');
    }
  });

  it('is deterministic for the same inputs', () => {
    const a = buildMonthPlan(business, { year: 2026, month: 7, now });
    const b = buildMonthPlan(business, { year: 2026, month: 7, now });
    expect(a.map((d) => d.title)).toEqual(b.map((d) => d.title));
    expect(a.map((d) => d.caption)).toEqual(b.map((d) => d.caption));
  });

  it('exports the theme ladder', () => {
    expect(WEEK_THEMES).toHaveLength(7);
    expect(WEEK_THEMES[0].key).toBe('educational');
  });

  it('saves the month into the planner and skips duplicates', () => {
    localStorage.removeItem(`nowopen_planner_${business.id}`);
    const plan = buildMonthPlan(business, { year: 2026, month: 7, now });
    const added = saveMonthToPlanner(business.id, plan);
    expect(added).toBe(plan.length);
    expect(loadPlannerItems(business.id)).toHaveLength(plan.length);
    const second = saveMonthToPlanner(business.id, plan);
    expect(second).toBe(0);
    localStorage.removeItem(`nowopen_planner_${business.id}`);
  });
});
