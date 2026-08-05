import { describe, it, expect } from 'vitest';
import { Business } from '../types';
import { marketingHealth, GROWTH_DIMENSIONS } from './marketingHealth';

const business: Business = {
  id: 'biz-1',
  name: 'Sunrise Grill',
  description: 'A fast food restaurant serving grilled specials in Lagos with delivery.',
  category: 'restaurant',
  location: 'Lagos, Nigeria',
  phone: '+2348000000000',
  rating: 4.5,
  status: 'open',
};

describe('marketingHealth', () => {
  it('returns exactly 11 dimensions', () => {
    const health = marketingHealth(business);
    expect(health.dimensions).toHaveLength(GROWTH_DIMENSIONS.length);
    expect(GROWTH_DIMENSIONS).toHaveLength(11);
  });

  it('every dimension scores 0-100 and is actionable', () => {
    const health = marketingHealth(business);
    for (const d of health.dimensions) {
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
      expect(d.detail.length).toBeGreaterThan(0);
      expect(d.tip.length).toBeGreaterThan(0);
      expect(typeof d.module).toBe('string');
    }
    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);
  });

  it('identifies the weakest dimension as the biggest opportunity', () => {
    const health = marketingHealth(business);
    expect(health.weakest.score).toBeLessThanOrEqual(health.strongest.score);
    const minScore = Math.min(...health.dimensions.map((d) => d.score));
    const maxScore = Math.max(...health.dimensions.map((d) => d.score));
    expect(health.weakest.score).toBe(minScore);
    expect(health.strongest.score).toBe(maxScore);
  });

  it('is deterministic per business', () => {
    const a = marketingHealth(business);
    const b = marketingHealth(business);
    expect(a.dimensions.map((d) => d.score)).toEqual(b.dimensions.map((d) => d.score));
  });

  it('profile dimension reflects real profile completeness', () => {
    const complete = marketingHealth(business);
    const sparse = marketingHealth({ ...business, phone: undefined, location: '', rating: undefined, status: undefined, website: undefined });
    expect(sparse.dimensions.find((d) => d.key === 'profile')!.score).toBeLessThanOrEqual(
      complete.dimensions.find((d) => d.key === 'profile')!.score,
    );
  });
});
