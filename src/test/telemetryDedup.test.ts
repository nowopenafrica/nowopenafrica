import { describe, it, expect, beforeEach } from 'vitest';

import { dedupKey, isDuplicate, resetDedupForTests } from '../lib/telemetry';

/**
 * §6 of the IQ mandate: nothing may learn from corrupted telemetry.
 *
 * The need is measured, not theoretical. On production, 2026-09-08:
 *
 *     signin : 43,354 events / 64 sessions = 677 each
 *              99.4% of the entire table
 *
 * One emitter firing on every token refresh. It was fixed at the source — 0
 * events since — but only for that one event. Nothing stopped the next
 * emitter making the same mistake, and the failure is silent by design:
 * telemetry swallows every error rather than risk breaking a page, so a
 * runaway emitter produces no complaint at all, only a table that quietly
 * stops meaning anything.
 *
 * These tests exercise the guard directly rather than asserting it exists.
 */

beforeEach(() => resetDedupForTests());

const key = (name: string, props = {}, bid: string | null = null, path = '/') =>
  dedupKey(name, props, bid, path);

describe('a burst of identical events counts once', () => {
  it('drops the second fire within the window', () => {
    const k = key('business_viewed', { source: 'list' }, 'b1');
    expect(isDuplicate('business_viewed', k, 1_000)).toBe(false);
    expect(isDuplicate('business_viewed', k, 1_500)).toBe(true);
  });

  it('lets the same event through once the window has passed', () => {
    /*
     * The guard must not turn into "count each event once, ever". Somebody
     * coming back to a profile ten minutes later is a real second view and
     * the owner is entitled to see it.
     */
    const k = key('business_viewed', {}, 'b1');
    expect(isDuplicate('business_viewed', k, 1_000)).toBe(false);
    expect(isDuplicate('business_viewed', k, 1_000 + 2_001)).toBe(false);
  });

  it('survives an effect that runs twice', () => {
    // React 18 StrictMode runs effects twice in development, and a
    // double-bound handler does the same in production.
    const k = key('plan_viewed');
    const fires = [0, 1, 2, 3].map((i) => isDuplicate('plan_viewed', k, 5_000 + i));
    expect(fires.filter((dropped) => !dropped)).toHaveLength(1);
  });
});

describe('different things stay different', () => {
  it('two businesses are two views', () => {
    expect(isDuplicate('business_viewed', key('business_viewed', {}, 'b1'), 1_000)).toBe(false);
    expect(isDuplicate('business_viewed', key('business_viewed', {}, 'b2'), 1_001)).toBe(false);
  });

  it('two search terms are two searches', () => {
    const a = key('search_performed', { q: 'jollof' });
    const b = key('search_performed', { q: 'suya' });
    expect(isDuplicate('search_performed', a, 1_000)).toBe(false);
    expect(isDuplicate('search_performed', b, 1_001)).toBe(false);
  });

  it('the same event on two pages is two events', () => {
    const a = key('business_contact_clicked', {}, 'b1', '/lagos-cafe');
    const b = key('business_contact_clicked', {}, 'b1', '/businesses');
    expect(isDuplicate('business_contact_clicked', a, 1_000)).toBe(false);
    expect(isDuplicate('business_contact_clicked', b, 1_001)).toBe(false);
  });

  it('prop order does not create a false difference', () => {
    // Keys are sorted before hashing, so {a,b} and {b,a} are one event.
    const a = key('search_performed', { q: 'jollof', place: 'lekki' });
    const b = key('search_performed', { place: 'lekki', q: 'jollof' });
    expect(a).toBe(b);
  });
});

describe('state events fire once per session, whatever the code does', () => {
  it('replays the actual incident and counts one sign-in', () => {
    /*
     * The real failure, reproduced: Supabase raises SIGNED_IN on every token
     * refresh, and the old emitter tracked each one. Roughly 677 per session
     * were recorded. A session has one sign-in.
     */
    const k = key('signin');
    let recorded = 0;
    for (let i = 0; i < 677; i += 1) {
      // Spread across the whole session, so the burst window cannot be what
      // saves us — this has to be the once-per-session rule doing the work.
      if (!isDuplicate('signin', k, i * 60_000)) recorded += 1;
    }
    expect(recorded).toBe(1);
  });

  it('covers signup too', () => {
    const k = key('signup', { role: 'business', method: 'email' });
    expect(isDuplicate('signup', k, 1_000)).toBe(false);
    expect(isDuplicate('signup', k, 900_000)).toBe(true);
  });

  it('a fresh session starts clean', () => {
    // Otherwise a returning visitor would never be counted again.
    const k = key('signin');
    expect(isDuplicate('signin', k, 1_000)).toBe(false);
    resetDedupForTests();
    expect(isDuplicate('signin', k, 2_000)).toBe(false);
  });

  it('does not silence ordinary action events', () => {
    /*
     * The rule applies only to events describing a state. A contact click is
     * an action, and a visitor who calls, comes back and calls again has done
     * the thing twice — which is precisely the number an owner is paying to
     * see.
     */
    const k = key('business_contact_clicked', {}, 'b1');
    expect(isDuplicate('business_contact_clicked', k, 1_000)).toBe(false);
    expect(isDuplicate('business_contact_clicked', k, 60_000)).toBe(false);
  });
});

describe('the guard cannot grow without bound', () => {
  it('prunes keys older than the window', () => {
    /*
     * A long session on a busy page would otherwise accumulate a key per
     * distinct event forever — a memory leak in the one module that must
     * never be the reason a page misbehaves.
     */
    for (let i = 0; i < 400; i += 1) {
      isDuplicate('business_viewed', key('business_viewed', {}, `b${i}`), 1_000 + i);
    }
    // Far past the window: everything above is stale and must be discarded
    // rather than retained.
    const fresh = key('business_viewed', {}, 'b0');
    expect(isDuplicate('business_viewed', fresh, 1_000_000)).toBe(false);
  });
});
