import { describe, it, expect } from 'vitest';
import { Business } from '../types';
import { buildMorningBrief, weatherFor, seasonFor } from './morningBrief';
import { dateKey, saveClockConfig, defaultClockConfig, clockStorageKey } from './businessStatus';

const business: Business = {
  id: 'biz-1',
  name: 'Sunrise Grill',
  description: 'A fast food restaurant serving grilled specials in Lagos.',
  category: 'restaurant',
  location: 'Lagos, Nigeria',
  rating: 4.5,
};

const now = new Date('2026-08-04T08:30:00'); // Tuesday, open-hours morning

describe('morningBrief', () => {
  it('builds a brief with greeting, weather and notices', () => {
    const brief = buildMorningBrief(business, now);
    expect(brief.date).toBe('2026-08-04');
    expect(brief.greeting).toContain('morning');
    expect(brief.weather.tempC).toBeGreaterThanOrEqual(22);
    expect(brief.weather.tempC).toBeLessThanOrEqual(34);
    expect(brief.weekend).toBe(false);
    expect(brief.notifications.length).toBeGreaterThanOrEqual(5);
    for (const n of brief.notifications) {
      expect(n.title.length).toBeGreaterThan(0);
      expect(n.body.length).toBeGreaterThan(0);
      expect(['good', 'warn', 'info', 'tip']).toContain(n.tone);
      expect(typeof n.module).toBe('string');
    }
  });

  it('flags weekends', () => {
    const sat = new Date('2026-08-08T10:00:00'); // Saturday
    const brief = buildMorningBrief(business, sat);
    expect(brief.weekend).toBe(true);
    expect(brief.notifications.some((n) => n.title.includes('Weekend'))).toBe(true);
  });

  it('is deterministic per business + date', () => {
    expect(weatherFor(business, now)).toEqual(weatherFor(business, now));
    const a = buildMorningBrief(business, now);
    const b = buildMorningBrief(business, now);
    expect(a.weather.condition).toBe(b.weather.condition);
    expect(a.notifications.map((n) => n.title)).toEqual(b.notifications.map((n) => n.title));
  });

  it('warns when the business is closed', () => {
    saveClockConfig(business.id, { ...defaultClockConfig(business), manualOverride: 'closed' });
    const closed = buildMorningBrief(business, now);
    const titles = closed.notifications.map((n) => n.title);
    expect(titles.some((t) => t.includes('closed') || t.includes('Closed'))).toBe(true);
    localStorage.removeItem(clockStorageKey(business.id));
  });

  it('season matches the month', () => {
    expect(seasonFor(new Date('2026-01-10'))).toBe('winter');
    expect(seasonFor(new Date('2026-08-10'))).toBe('summer');
    expect(dateKey(now)).toBe('2026-08-04');
  });
});
