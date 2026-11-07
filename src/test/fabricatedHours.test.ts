import { describe, it, expect } from 'vitest';

import {
  buildBusinessTimeline, defaultClockConfig, defaultAutoHours, hasStatedHours,
} from '../lib/businessStatus';
import type { Business } from '../types';

/**
 * A business's opening hours may never be invented and shown as fact.
 *
 * THE DEFECT, MEASURED ON PRODUCTION 2026-09-14
 *
 * /salem-university-lokoja — a real Nigerian university, unclaimed, no opening
 * hours on file anywhere — showed every visitor:
 *
 *     Today's Activity
 *       8:00 AM  🟢  Opened for the day
 *       6:00 PM  🔚  Closed for the day
 *
 * Nobody had ever stated those times. They came from
 * defaultAutoHours('Schools & Training'), which returns Mon–Fri 08:00–18:00 for
 * any category it does not recognise. The panel beside it simultaneously read
 * "Open 24/7 — assumed", so the page contradicted itself.
 *
 * Scope at the time: 3,115 of 3,118 businesses had no stated hours.
 *
 * This is the same fault src/lib/openingHours.ts was written to fix for the
 * status badge, reappearing in the one component that change did not touch —
 * which is why it is pinned here rather than left to a comment.
 */

const base = (over: Partial<Business> = {}): Business => ({
  id: 'b1',
  name: 'Salem University, Lokoja',
  category: 'Schools & Training',
  location: 'Lokoja, Nigeria',
  claim_status: 'unclaimed',
  availability_mode: 'default_24_7',
  is_24_hours: true,
  is_24_hours_confirmed: false,
  opening_hours: null,
  hours: null,
  ...over,
} as unknown as Business);

// A Wednesday at 2pm — inside the invented 08:00–18:00 window, so the bug
// would produce its "Opened for the day" entry.
const wednesdayAfternoon = new Date('2026-09-16T14:00:00');

describe('hasStatedHours', () => {
  it('is false for a business nobody has given hours for', () => {
    expect(hasStatedHours(base())).toBe(false);
  });

  it('is false for the unconfirmed 24/7 default', () => {
    // 3,115 rows in production look exactly like this. The default is the
    // platform's assumption, not the business's statement.
    expect(hasStatedHours(base({ is_24_hours: true, is_24_hours_confirmed: false }))).toBe(false);
  });

  it('is true once somebody confirms 24/7', () => {
    expect(hasStatedHours(base({ is_24_hours: true, is_24_hours_confirmed: true }))).toBe(true);
  });

  it('is true when there is hours text', () => {
    expect(hasStatedHours(base({ opening_hours: 'Mon–Fri: 9AM–5PM' }))).toBe(true);
    expect(hasStatedHours(base({ hours: 'Daily 8AM–8PM' }))).toBe(true);
  });

  it('treats whitespace as nothing', () => {
    expect(hasStatedHours(base({ opening_hours: '   ' }))).toBe(false);
  });
});

describe("Today's Activity never invents a business's day", () => {
  it('shows nothing for a university with no stated hours', () => {
    const b = base();
    const cfg = defaultClockConfig(b);
    expect(cfg.hoursAreAssumed).toBe(true);
    expect(buildBusinessTimeline(b, cfg, wednesdayAfternoon)).toEqual([]);
  });

  it('would have produced the exact fabricated entry without the gate', () => {
    /*
     * Proves the invented times are real and still there — the fix is the gate,
     * not the removal of defaultAutoHours, which an owner's own editor still
     * legitimately starts from.
     */
    const week = defaultAutoHours('Schools & Training');
    expect(week[3]).toEqual({ open: '08:00', close: '18:00' });
  });

  it('invents a day for every category, so no category is safe to trust', () => {
    for (const cat of ['Schools & Training', 'Fashion', 'Hospital & Clinic', 'Restaurant', 'Bakery']) {
      const b = base({ category: cat });
      expect(buildBusinessTimeline(b, defaultClockConfig(b), wednesdayAfternoon), cat).toEqual([]);
    }
  });

  it('still shows the day when the business actually stated its hours', () => {
    const b = base({ opening_hours: 'Mon–Fri: 9AM–5PM' });
    const cfg = defaultClockConfig(b);
    expect(cfg.hoursAreAssumed).toBe(false);
    // The gate must not become a blanket "never show a timeline".
    expect(buildBusinessTimeline(b, cfg, wednesdayAfternoon).length).toBeGreaterThan(0);
  });

  it('still shows the day for an owner who set their own clock', () => {
    const b = base();
    const owner = {
      ...defaultClockConfig(b),
      autoHours: defaultAutoHours('Fashion'),
      hoursAreAssumed: false,
    };
    expect(buildBusinessTimeline(b, owner, wednesdayAfternoon).length).toBeGreaterThan(0);
  });

  it('fails CLOSED when a caller forgets the flag entirely', () => {
    /*
     * A config built by hand with no `hoursAreAssumed` is the likeliest way to
     * reintroduce this, so the gate must not read `undefined` as "these hours
     * are real". It falls back to the business itself, which is the safe answer
     * and needs no new caller to remember anything.
     */
    const b = base();
    const naive = { autoHours: defaultAutoHours(b.category), manualOverride: null };
    expect(naive).not.toHaveProperty('hoursAreAssumed');
    expect(buildBusinessTimeline(b, naive, wednesdayAfternoon)).toEqual([]);
  });

  it('a forgotten flag still shows the day when hours ARE stated', () => {
    // Failing closed must not mean failing blank for a business with real hours.
    const b = base({ opening_hours: 'Mon-Fri: 9AM-5PM' });
    const naive = { autoHours: defaultAutoHours(b.category), manualOverride: null };
    expect(buildBusinessTimeline(b, naive, wednesdayAfternoon).length).toBeGreaterThan(0);
  });
});
