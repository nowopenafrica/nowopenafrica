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

  it('every dimension is actionable, and scores 0-100 when measured', () => {
    const health = marketingHealth(business);
    for (const d of health.dimensions) {
      if (d.score !== null) {
        expect(d.score).toBeGreaterThanOrEqual(0);
        expect(d.score).toBeLessThanOrEqual(100);
      }
      // An unmeasured dimension still has to explain itself and offer a way in.
      expect(d.detail.length).toBeGreaterThan(0);
      expect(d.tip.length).toBeGreaterThan(0);
      expect(typeof d.module).toBe('string');
    }
    if (health.score !== null) {
      expect(health.score).toBeGreaterThanOrEqual(0);
      expect(health.score).toBeLessThanOrEqual(100);
    }
  });

  it('reports nothing for dimensions with no data source', () => {
    const health = marketingHealth(business);
    // There is no analytics layer, so none of these can be measured. They were
    // seeded random numbers that looked like real, stable metrics.
    for (const key of ['engagement', 'reach', 'bookings', 'followers', 'advertising']) {
      expect(health.dimensions.find((d) => d.key === key)!.score).toBeNull();
    }
  });

  it('averages only the measured dimensions', () => {
    const health = marketingHealth(business);
    const measured = health.dimensions.filter((d) => d.score !== null);
    expect(health.measuredCount).toBe(measured.length);
    if (measured.length >= 2) {
      const expected = Math.round(measured.reduce((s, d) => s + (d.score as number), 0) / measured.length);
      expect(health.score).toBe(expected);
    } else {
      expect(health.score).toBeNull();
    }
  });

  it('picks the biggest opportunity from measured dimensions only', () => {
    const health = marketingHealth(business);
    const scores = health.dimensions
      .map((d) => d.score)
      .filter((v): v is number => v !== null);
    if (scores.length === 0) {
      expect(health.weakest).toBeNull();
      expect(health.strongest).toBeNull();
      return;
    }
    // weakest drives both the panel's headline advice and what the assistant
    // tells the owner to fix, so it must never name an unmeasured dimension.
    expect(health.weakest!.score).not.toBeNull();
    expect(health.weakest!.score).toBe(Math.min(...scores));
    expect(health.strongest!.score).toBe(Math.max(...scores));
    expect(health.weakest!.score!).toBeLessThanOrEqual(health.strongest!.score!);
  });

  it('is deterministic per business', () => {
    const a = marketingHealth(business);
    const b = marketingHealth(business);
    expect(a.dimensions.map((d) => d.score)).toEqual(b.dimensions.map((d) => d.score));
  });

  it('profile dimension reflects real profile completeness', () => {
    const complete = marketingHealth(business);
    const sparse = marketingHealth({ ...business, phone: undefined, location: '', rating: undefined, status: undefined, website: undefined });
    expect(sparse.dimensions.find((d) => d.key === 'profile')!.score!).toBeLessThanOrEqual(
      complete.dimensions.find((d) => d.key === 'profile')!.score!,
    );
  });
});
