import { describe, it, expect } from 'vitest';
import { parseOsmHours } from './osmHours';
import { canonicalHoursText } from './hours';

describe('parseOsmHours', () => {
  it('reads 24/7', () => {
    const out = parseOsmHours('24/7');
    expect(out?.[0].alwaysOpen).toBe(true);
  });

  it('reads a plain weekday range', () => {
    const out = parseOsmHours('Mo-Fr 08:30-17:00');
    expect(out?.[0].days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    expect(out?.[0].open).toBe(8 * 60 + 30);
    expect(out?.[0].close).toBe(17 * 60);
  });

  it('reads multiple groups with different days', () => {
    const out = parseOsmHours('Mo-Fr 09:00-18:00; Sa 09:00-13:00');
    expect(out).toHaveLength(2);
    expect(out![1].days).toEqual(['sat']);
  });

  it('drops closed groups instead of inventing hours', () => {
    const out = parseOsmHours('Mo-Fr 09:00-18:00; Su off');
    expect(out).toHaveLength(1);
    expect(out![0].days).toHaveLength(5);
  });

  it('returns null for empty or non-hours text', () => {
    expect(parseOsmHours('')).toBeNull();
    expect(parseOsmHours('opening times vary')).toBeNull();
  });

  it('round-trips into the app-parsable canonical form', () => {
    const out = parseOsmHours('Mo-Fr 08:00-17:00; Sa 09:00-13:00')!;
    expect(canonicalHoursText(out)).toBe('Mon–Fri: 8AM–5PM · Sat: 9AM–1PM');
  });
});