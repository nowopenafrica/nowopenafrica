import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { supplyGaps, type RawEvent } from './northStar';

/**
 * Demand with no supply behind it.
 *
 * The platform's real constraint is supply, and the one signal that names
 * which businesses to go and recruit was not being collected:
 * `search_performed` carried the term but never the outcome, and the
 * directory — where a search actually resolves — emitted nothing at all.
 *
 * These tests exist mostly to protect one property: this must never invent a
 * gap. A fabricated recruitment list would send someone chasing demand that
 * was never expressed.
 */

const ev = (props: Record<string, unknown>, over: Partial<RawEvent> = {}): RawEvent => ({
  name: 'search_performed',
  props,
  created_at: '2026-09-07T10:00:00Z',
  session_id: 's1',
  ...over,
});

describe('it only counts searches that actually found nothing', () => {
  it('records a zero-result search', () => {
    const gaps = supplyGaps([ev({ term: '24 hour pharmacy', place: 'lekki', results: 0 })]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ term: '24 hour pharmacy', place: 'lekki', searches: 1, people: 1 });
  });

  it('ignores a search that found something', () => {
    expect(supplyGaps([ev({ term: 'barber', place: 'ikeja', results: 3 })])).toEqual([]);
  });

  it('ignores an event with no outcome recorded', () => {
    /*
     * The most important negative in this file. The home-hero events predate
     * outcome tracking and carry no `results` at all. Treating a missing count
     * as zero would manufacture demand gaps out of searches that may well have
     * succeeded — inventing a recruitment list, which is exactly the kind of
     * fabricated data this platform has spent effort removing.
     */
    expect(supplyGaps([ev({ term: 'restaurant', place: 'lagos' })])).toEqual([]);
    expect(supplyGaps([ev({ term: 'restaurant', results: null })])).toEqual([]);
    expect(supplyGaps([ev({ term: 'restaurant', results: 'none' })])).toEqual([]);
    expect(supplyGaps([ev({ term: 'restaurant', results: NaN })])).toEqual([]);
  });

  it('ignores other events entirely', () => {
    expect(supplyGaps([ev({ term: 'x', results: 0 }, { name: 'business_viewed' })])).toEqual([]);
  });

  it('ignores an empty search, which is browsing not unmet demand', () => {
    expect(supplyGaps([ev({ term: '', place: '', results: 0 })])).toEqual([]);
    expect(supplyGaps([ev({ results: 0 })])).toEqual([]);
  });

  it('keeps a place-only search — "anything in Yaba" is real demand', () => {
    const gaps = supplyGaps([ev({ term: '', place: 'yaba', results: 0 })]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].place).toBe('yaba');
  });
});

describe('it groups so repeated demand rises', () => {
  it('counts distinct people separately from total searches', () => {
    // Three people wanting the same thing is a far stronger signal than one
    // person trying three times.
    const gaps = supplyGaps([
      ev({ term: 'dentist', place: 'yaba', results: 0 }, { session_id: 'a' }),
      ev({ term: 'dentist', place: 'yaba', results: 0 }, { session_id: 'b' }),
      ev({ term: 'dentist', place: 'yaba', results: 0 }, { session_id: 'b' }),
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ searches: 3, people: 2 });
  });

  it('ranks by distinct people first', () => {
    const gaps = supplyGaps([
      // One determined person, five attempts.
      ...Array.from({ length: 5 }, () => ev({ term: 'sushi', results: 0 }, { session_id: 'solo' })),
      // Two different people.
      ev({ term: 'plumber', results: 0 }, { session_id: 'p1' }),
      ev({ term: 'plumber', results: 0 }, { session_id: 'p2' }),
    ]);
    expect(gaps[0].term).toBe('plumber');
    expect(gaps[1].term).toBe('sushi');
  });

  it('treats the same term in different places as different gaps', () => {
    // "barber in Lekki" and "barber in Kano" are two businesses to recruit.
    const gaps = supplyGaps([
      ev({ term: 'barber', place: 'lekki', results: 0 }),
      ev({ term: 'barber', place: 'kano', results: 0 }),
    ]);
    expect(gaps).toHaveLength(2);
  });

  it('groups case-insensitively', () => {
    const gaps = supplyGaps([
      ev({ term: 'Barber', place: 'Lekki', results: 0 }, { session_id: 'a' }),
      ev({ term: 'barber', place: 'lekki', results: 0 }, { session_id: 'b' }),
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].people).toBe(2);
  });

  it('keeps the most recent sighting', () => {
    const gaps = supplyGaps([
      ev({ term: 'vet', results: 0 }, { created_at: '2026-09-01T10:00:00Z' }),
      ev({ term: 'vet', results: 0 }, { created_at: '2026-09-06T10:00:00Z' }),
    ]);
    expect(gaps[0].lastSeen).toBe('2026-09-06T10:00:00Z');
  });

  it('caps the list', () => {
    const many = Array.from({ length: 60 }, (_, i) => ev({ term: `thing-${i}`, results: 0 }));
    expect(supplyGaps(many).length).toBeLessThanOrEqual(25);
    expect(supplyGaps(many, 5)).toHaveLength(5);
  });

  it('handles no events without complaint', () => {
    expect(supplyGaps([])).toEqual([]);
  });
});

describe('the directory records the outcome, debounced', () => {
  const src = readFileSync('src/pages/Businesses.tsx', 'utf8');

  it('sends the result count, which is the whole point', () => {
    expect(src).toMatch(/results: resultCount,/);
    expect(src).toMatch(/from: 'directory',/);
  });

  it('only fires once the visitor has asked for something', () => {
    // Plain browsing is not a search, and logging it would drown the signal.
    expect(src).toMatch(/const asked = search\.trim\(\) \|\| location\.trim\(\)/);
    expect(src).toMatch(/if \(!asked\) return;/);
  });

  it('is debounced and de-duplicated', () => {
    /*
     * An event per keystroke is how the 42,910-row `signin` problem happened.
     * Not repeating that in a new place.
     */
    expect(src).toMatch(/setTimeout\(/);
    expect(src).toMatch(/lastLoggedSearch/);
    expect(src).toMatch(/clearTimeout/);
  });

  it('does not log while the listings are still loading', () => {
    // Otherwise every search briefly reports zero results and every term
    // becomes a false supply gap.
    expect(src).toMatch(/if \(loading\) return;/);
  });

  it('caps the term length before sending it', () => {
    expect(src).toMatch(/slice\(0, 80\)/);
  });
});

describe('the admin panel surfaces it honestly', () => {
  const panel = readFileSync('src/components/admin/ActivationPanel.tsx', 'utf8');

  it('shows the gaps', () => {
    expect(panel).toContain('Searched for, not found');
    expect(panel).toMatch(/data\.gaps\.map/);
    expect(panel).toMatch(/supplyGaps\(events\)/);
  });

  it('does not pretend an empty list means every search succeeded', () => {
    // With 114 sessions in a fortnight, "no gaps" almost certainly means "not
    // enough searches yet" — and saying so is the difference between a useful
    // panel and a misleading one.
    expect(panel).toMatch(/or too few people have searched to tell/);
  });
});
