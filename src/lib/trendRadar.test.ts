import { describe, it, expect } from 'vitest';
import { Business } from '../types';
import { trendRadarFor, marketForLocation } from './trendRadar';
import { TRENDS, TREND_MARKETS } from './videoCreator';

const business: Business = {
  id: 'biz-1',
  name: 'Sunrise Grill',
  description: 'A fast food restaurant serving grilled specials in Lagos.',
  category: 'restaurant',
  location: 'Lagos, Nigeria',
};

const now = new Date('2026-08-04T10:30:00');

describe('trendRadar', () => {
  it('resolves markets from location strings', () => {
    expect(marketForLocation('Lagos, Nigeria')).toBe('nigeria');
    expect(marketForLocation('Nairobi, Kenya')).toBe('kenya');
    expect(marketForLocation('Accra, Ghana')).toBe('ghana');
    expect(marketForLocation('Cape Town, South Africa')).toBe('south-africa');
    expect(marketForLocation('')).toBe('nigeria');
  });

  it('builds a ranked radar for the business industry', () => {
    const radar = trendRadarFor(business, { now });
    expect(radar.industryKey).toBe('restaurant');
    expect(radar.trends.length).toBe(3);
    expect(radar.best.score).toBeGreaterThanOrEqual(radar.trends[1].score);
    for (const t of radar.trends) {
      expect(t.score).toBeGreaterThanOrEqual(55);
      expect(t.suggestedPost.length).toBeGreaterThan(0);
      expect(t.suggestedReel).toContain('CTA');
    }
  });

  it('is deterministic for the same inputs', () => {
    const a = trendRadarFor(business, { market: 'nigeria', now });
    const b = trendRadarFor(business, { market: 'nigeria', now });
    expect(a.trends.map((t) => t.score)).toEqual(b.trends.map((t) => t.score));
    expect(a.best.topic).toBe(b.best.topic);
  });

  it('supports every market pool', () => {
    for (const m of TREND_MARKETS) {
      const radar = trendRadarFor(business, { market: m.key, now });
      expect(radar.trends.length).toBeGreaterThan(0);
      expect(radar.marketLabel).toBe(m.label);
    }
  });

  it('honours a custom count and reuses TRENDS pools', () => {
    const radar = trendRadarFor(business, { market: 'nigeria', count: 1, now });
    expect(radar.trends).toHaveLength(1);
    const topics = radar.trends.map((t) => t.topic);
    const pool = TRENDS.nigeria.map((t) => t.topic);
    expect(topics.every((tp) => pool.includes(tp))).toBe(true);
  });
});
