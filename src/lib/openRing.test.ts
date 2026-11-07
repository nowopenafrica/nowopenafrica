/**
 * When the NowOpen ring may glow.
 *
 * The assertion that matters is that UNKNOWN never glows. 4,006 of the 4,050
 * listings on this platform have unconfirmed hours, so a ring that treats "we
 * do not know" as "open" would assert something unchecked about almost every
 * business on the site — and the handful that genuinely are open would look
 * exactly the same as the rest.
 */

import { describe, it, expect } from 'vitest';

import { ringState, ringIsOn, ringLabel } from './openRing';
import type { Business } from '../types';

/** Monday 10:00, inside any ordinary trading window. */
const MONDAY_10AM = new Date('2026-10-12T10:00:00');
/** Monday 03:00, outside one. */
const MONDAY_3AM = new Date('2026-10-12T03:00:00');

/*
 * `publicOpenState` reads opening hours as TEXT, the way a business writes
 * them, and parses that. Passing a structured week here would be testing a
 * shape the engine never receives.
 */
const WEEK = 'Mon–Sun: 9AM–5PM';

const business = (over: Partial<Business> = {}): Business => ({
  id: 'b1',
  name: 'Ada Fabrics',
  opening_hours: WEEK,
  ...over,
} as unknown as Business);

describe('unknown never glows', () => {
  it('stays off for a business with no hours at all', () => {
    /*
     * THE ONE THAT MATTERS. This is the overwhelming majority of the
     * directory, and a ring here would be a claim nobody made.
     */
    expect(ringState(business({ opening_hours: null } as Partial<Business>), MONDAY_10AM)).toBe('off');
    expect(ringState(business({ opening_hours: '' } as Partial<Business>), MONDAY_10AM)).toBe('off');
  });

  it('stays off for no business at all, rather than throwing', () => {
    expect(ringState(null, MONDAY_10AM)).toBe('off');
    expect(ringState(undefined, MONDAY_10AM)).toBe('off');
  });

  it('treats unknown exactly like closed', () => {
    // A customer walking to a shop on the strength of a glow does not care
    // which of the two we meant.
    const unknown = ringState(business({ opening_hours: null } as Partial<Business>), MONDAY_10AM);
    const closed = ringState(business(), MONDAY_3AM);
    expect(unknown).toBe(closed);
  });
});

describe('it glows only while actually open', () => {
  it('turns on inside trading hours', () => {
    expect(ringState(business(), MONDAY_10AM)).toBe('on');
    expect(ringIsOn(business(), MONDAY_10AM)).toBe(true);
  });

  it('turns off outside them', () => {
    expect(ringState(business(), MONDAY_3AM)).toBe('off');
    expect(ringIsOn(business(), MONDAY_3AM)).toBe(false);
  });

  it('turns off when the business says it is closed today', () => {
    /*
     * A same-day override. It speaks only for the day it was set, which is
     * why `open_status_set_at` goes with it.
     */
    expect(ringState(business({
      open_status: 'closed', open_status_set_at: MONDAY_10AM.toISOString(),
    } as Partial<Business>), MONDAY_10AM)).toBe('off');
  });
});

describe('it does not invent its own opinion', () => {
  it('follows the one open/closed engine', () => {
    /*
     * There used to be two engines, and on Christmas morning one said
     * "Closed for Christmas Day" while the other said "open" — whichever a
     * surface imported decided what the customer was told. The ring reads
     * the same answer as the status pill beside it, or it is worse than
     * useless.
     */
    const open = business();
    const closed = business({
      open_status: 'closed', open_status_set_at: MONDAY_10AM.toISOString(),
    } as Partial<Business>);
    expect(ringState(open, MONDAY_10AM)).toBe('on');
    expect(ringState(closed, MONDAY_10AM)).toBe('off');
  });
});

describe('it is not colour alone', () => {
  it('names the state for a screen reader when it is on', () => {
    /*
     * The ring is colour and motion, which is no information to somebody who
     * cannot see it — and "open now" is exactly the kind of fact that must
     * not ride on decoration.
     */
    expect(ringLabel('on')).toBe('Open now');
  });

  it('says nothing when it is off, rather than announcing an absence', () => {
    expect(ringLabel('off')).toBeNull();
  });
});
