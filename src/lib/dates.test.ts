import { describe, it, expect } from 'vitest';
import { isSameLocalDay, localDateISO } from './dates';

describe('localDateISO', () => {
  it('formats the local calendar day, not the UTC one', () => {
    // Local midnight is a different UTC day for every offset east of Greenwich.
    const localMidnight = new Date(2026, 7, 1, 0, 30, 0);
    expect(localDateISO(localMidnight)).toBe('2026-08-01');
  });

  it('pads single-digit months and days', () => {
    expect(localDateISO(new Date(2026, 0, 5, 13, 0, 0))).toBe('2026-01-05');
  });

  it('round-trips through the parser the app uses for date strings', () => {
    const d = new Date(2026, 11, 31, 23, 59, 0);
    const iso = localDateISO(d);
    const parsed = new Date(`${iso}T00:00:00`);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(11);
    expect(parsed.getDate()).toBe(31);
  });
});

describe('isSameLocalDay', () => {
  const now = new Date(2026, 7, 11, 1, 0, 0);

  it('counts a timestamp from minutes ago as today', () => {
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    expect(isSameLocalDay(fiveMinutesAgo, now)).toBe(true);
  });

  it('rejects yesterday, tomorrow and the same day a year apart', () => {
    expect(isSameLocalDay(new Date(2026, 7, 10, 23, 59).toISOString(), now)).toBe(false);
    expect(isSameLocalDay(new Date(2026, 7, 12, 0, 1).toISOString(), now)).toBe(false);
    expect(isSameLocalDay(new Date(2025, 7, 11, 1, 0).toISOString(), now)).toBe(false);
  });

  it('is false for missing and unparseable values', () => {
    expect(isSameLocalDay(null, now)).toBe(false);
    expect(isSameLocalDay(undefined, now)).toBe(false);
    expect(isSameLocalDay('', now)).toBe(false);
    expect(isSameLocalDay('not-a-date', now)).toBe(false);
  });
});
