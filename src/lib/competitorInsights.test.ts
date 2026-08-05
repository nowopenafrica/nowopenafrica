import { describe, it, expect } from 'vitest';
import { Business } from '../types';
import { competitorInsights } from './competitorInsights';

const business: Business = {
  id: 'biz-1',
  name: 'Sunrise Grill',
  description: 'A fast food restaurant serving grilled specials in Lagos.',
  category: 'restaurant',
  location: 'Lagos, Nigeria',
  rating: 4.5,
};

const now = new Date('2026-08-04T10:30:00');

describe('competitorInsights', () => {
  it('returns 3 competitors plus a market average', () => {
    const insights = competitorInsights(business, now);
    expect(insights.competitors).toHaveLength(3);
    expect(insights.average.name).toBe('Market average');
  });

  it('ranks the business within the set', () => {
    const insights = competitorInsights(business, now);
    expect(insights.rank).toBeGreaterThanOrEqual(1);
    expect(insights.rank).toBeLessThanOrEqual(4);
  });

  it('sorts gaps by size and always explains the biggest one', () => {
    const insights = competitorInsights(business, now);
    expect(insights.gaps.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < insights.gaps.length; i++) {
      expect(insights.gaps[i - 1].gap).toBeGreaterThanOrEqual(insights.gaps[i].gap);
    }
    expect(insights.gaps[0].tip.length).toBeGreaterThan(0);
  });

  it('is deterministic per business', () => {
    const a = competitorInsights(business, now);
    const b = competitorInsights(business, now);
    expect(a.competitors.map((c) => c.name)).toEqual(b.competitors.map((c) => c.name));
    expect(a.competitors.map((c) => c.followers)).toEqual(b.competitors.map((c) => c.followers));
    expect(a.rank).toBe(b.rank);
  });

  it('flags the panel as premium data', () => {
    expect(competitorInsights(business, now).premium).toBe(false);
  });
});
