/**
 * Remembering which handles cannot be read.
 *
 * The assertions that matter are the ones about NOT turning a temporary
 * answer into a permanent one. A cache that suppresses a retry after a rate
 * limit, or that never looks again at a business which switched to a Business
 * account, locks real businesses out of the directory for good — which is
 * worse than the forgetting it replaced.
 */

import { describe, it, expect } from 'vitest';

import {
  shouldSkipLookup, skipExplanation, checkRow, daysSince, RECHECK_AFTER_DAYS,
  type HandleCheck,
} from './instagramHandleChecks';

const NOW = new Date('2026-10-09T12:00:00Z');
const agoDays = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const check = (over: Partial<HandleCheck> = {}): HandleCheck => ({
  handle: 'adafabrics',
  outcome: 'not_business',
  last_checked_at: agoDays(1),
  check_count: 1,
  ...over,
});

describe('a handle nobody has looked at is always looked up', () => {
  it('does not skip when there is no previous check', () => {
    expect(shouldSkipLookup(undefined, NOW)).toBe(false);
    expect(shouldSkipLookup(null, NOW)).toBe(false);
  });
});

describe('only a settled answer suppresses a lookup', () => {
  it('skips a recent "not a Business account"', () => {
    expect(shouldSkipLookup(check({ last_checked_at: agoDays(3) }), NOW)).toBe(true);
  });

  it('never suppresses a transient failure', () => {
    /*
     * The damaging bug this guards against. A rate limit says nothing about
     * the account — caching it as a reason to skip would turn "Instagram was
     * busy on Tuesday" into "this business is unreachable", permanently.
     */
    for (const outcome of ['rate_limited', 'error'] as const) {
      expect(shouldSkipLookup(check({ outcome }), NOW), outcome).toBe(false);
    }
  });

  it('looks again at a profile that had no name, in case it gained one', () => {
    expect(shouldSkipLookup(check({ outcome: 'no_name' }), NOW)).toBe(false);
  });

  it('looks again at one already extracted, so a listing can be refreshed', () => {
    expect(shouldSkipLookup(check({ outcome: 'extracted' }), NOW)).toBe(false);
  });
});

describe('a skip expires', () => {
  it('re-checks once the window has passed, because accounts convert', () => {
    /*
     * Any personal account can become a Business account in a few taps. If
     * this never expired, a business that switched would be locked out of the
     * directory forever by a single old "no".
     */
    expect(shouldSkipLookup(check({ last_checked_at: agoDays(RECHECK_AFTER_DAYS) }), NOW)).toBe(false);
    expect(shouldSkipLookup(check({ last_checked_at: agoDays(RECHECK_AFTER_DAYS + 1) }), NOW)).toBe(false);
  });

  it('still skips on the last day inside the window', () => {
    expect(shouldSkipLookup(check({ last_checked_at: agoDays(RECHECK_AFTER_DAYS - 1) }), NOW)).toBe(true);
  });

  it('respects a caller-supplied window', () => {
    expect(shouldSkipLookup(check({ last_checked_at: agoDays(5) }), NOW, 3)).toBe(false);
    expect(shouldSkipLookup(check({ last_checked_at: agoDays(2) }), NOW, 3)).toBe(true);
  });

  it('looks up again rather than trusting a timestamp it cannot read', () => {
    // Unparseable is unknown, and unknown is not a reason to skip.
    expect(shouldSkipLookup(check({ last_checked_at: 'not a date' }), NOW)).toBe(false);
    expect(daysSince('not a date', NOW)).toBeNull();
    expect(daysSince(null, NOW)).toBeNull();
  });
});

describe('what the operator is told', () => {
  it('says when it was asked and when it will be asked again', () => {
    const msg = skipExplanation(check({ last_checked_at: agoDays(4), check_count: 2 }), NOW);
    expect(msg).toMatch(/4 days ago/);
    expect(msg).toMatch(new RegExp(`${RECHECK_AFTER_DAYS - 4} days`));
    expect(msg).toMatch(/Asked 2 times/);
  });

  it('reads naturally at the edges rather than "1 days"', () => {
    expect(skipExplanation(check({ last_checked_at: agoDays(0) }), NOW)).toMatch(/checked today/);
    expect(skipExplanation(check({ last_checked_at: agoDays(1) }), NOW)).toMatch(/yesterday/);
    expect(skipExplanation(check({ check_count: 1 }), NOW)).toMatch(/Asked 1 time\b/);
    const due = skipExplanation(check({ last_checked_at: agoDays(RECHECK_AFTER_DAYS - 1) }), NOW);
    expect(due).toMatch(/in 1 day\b/);
  });
});

describe('the row that gets written', () => {
  it('normalises the handle to the form the table accepts', () => {
    // The column has a CHECK constraint for exactly this; normalise, do not fail.
    expect(checkRow('@AdaFabrics', 'not_business', null, undefined).handle).toBe('adafabrics');
    expect(checkRow('  Ada_Fabrics ', 'not_business', null, undefined).handle).toBe('ada_fabrics');
  });

  it('counts a first sighting as one, and carries the count forward', () => {
    expect(checkRow('a', 'not_business', null, undefined).check_count).toBe(1);
    expect(checkRow('a', 'not_business', null, check({ check_count: 4 })).check_count).toBe(5);
  });

  it('records the provenance the batch already collects', () => {
    const row = checkRow('a', 'not_business', 'because', undefined, {
      listSource: 'Lagos trade directory', sourceFile: 'handles.csv',
    });
    expect(row.list_source).toBe('Lagos trade directory');
    expect(row.source_file).toBe('handles.csv');
    expect(row.reason).toBe('because');
  });

  it('stores nothing rather than an empty string for missing provenance', () => {
    const row = checkRow('a', 'error', null, undefined, { listSource: '   ' });
    expect(row.list_source).toBeNull();
    expect(row.source_file).toBeNull();
    expect(row.reason).toBeNull();
  });

  it('keeps the reason inside the column rather than overflowing it', () => {
    expect(checkRow('a', 'error', 'x'.repeat(900), undefined).reason).toHaveLength(500);
  });
});
