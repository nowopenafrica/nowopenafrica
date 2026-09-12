import { describe, it, expect } from 'vitest';

import {
  easterSunday, holidaysForYear, holidayOn, localDateInZone,
} from './holidays';
import { publicOpenState, overrideStillApplies } from './openingHours';

/**
 * The "Open now" promise on the days it used to get wrong.
 *
 * `openingHours.test.ts` covered overnight trading, midnight crossover,
 * timezones and 24-hour businesses — and had zero coverage of public holidays
 * or of the manual override. So on Christmas morning the platform said "Open
 * now", and an owner who marked themselves closed once was closed forever.
 */

const LAGOS = 'Africa/Lagos';
const NINE_TO_FIVE = 'Mon-Sat 9:00-17:00';

/** Noon in Lagos on a given date. Lagos is UTC+1 with no DST. */
const noonLagos = (dateISO: string) => new Date(`${dateISO}T11:00:00Z`);

describe('Easter is computed, not tabulated', () => {
  it('matches known Gregorian Easter dates', () => {
    // Independently verifiable dates, chosen to span the algorithm's branches.
    expect(easterSunday(2024)).toEqual({ month: 3, day: 31 });
    expect(easterSunday(2025)).toEqual({ month: 4, day: 20 });
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
    expect(easterSunday(2027)).toEqual({ month: 3, day: 28 });
    expect(easterSunday(2030)).toEqual({ month: 4, day: 21 });
  });

  it('derives Good Friday and Easter Monday around it', () => {
    const y = holidaysForYear(2026);
    expect(y.find((h) => h.name === 'Good Friday')?.date).toBe('2026-04-03');
    expect(y.find((h) => h.name === 'Easter Monday')?.date).toBe('2026-04-06');
  });
});

describe('the Nigerian calendar', () => {
  it('has the six statutory fixed dates', () => {
    const dates = holidaysForYear(2026).map((h) => `${h.date} ${h.name}`);
    for (const expected of [
      "2026-01-01 New Year's Day",
      '2026-05-01 Workers’ Day',
      '2026-06-12 Democracy Day',
      '2026-10-01 Independence Day',
      '2026-12-25 Christmas Day',
      '2026-12-26 Boxing Day',
    ]) {
      expect(dates, expected).toContain(expected);
    }
  });

  it('does NOT invent Eid dates', () => {
    /*
     * The most important assertion in this file. Eid al-Fitr and Eid al-Adha
     * follow lunar observation and are announced, not calculated. A guessed
     * date would be fabricated data of exactly the kind this platform has
     * spent effort removing — and closing every Muslim-owned business on the
     * wrong day is worse than not knowing.
     */
    const names = holidaysForYear(2026).map((h) => h.name.toLowerCase()).join(' | ');
    expect(names).not.toMatch(/eid|ramadan|fitr|adha|maulud/);
  });

  it('accepts an announced date once somebody supplies it', () => {
    const supplied = [{ date: '2026-03-20', name: 'Eid al-Fitr', country: 'NG' }];
    const y = holidaysForYear(2026, 'NG', supplied);
    expect(y.find((h) => h.name === 'Eid al-Fitr')?.date).toBe('2026-03-20');
  });

  it('claims nothing about countries whose calendar was never sourced', () => {
    // The platform lists 54 African countries. Pretending to know Kenya's
    // calendar would be the same fabrication as guessing at Eid.
    expect(holidaysForYear(2026, 'KE')).toEqual([]);
  });
});

describe('holidayOn resolves in the business timezone', () => {
  it('finds a holiday on the business local day', () => {
    expect(holidayOn(noonLagos('2026-12-25'), LAGOS)?.name).toBe('Christmas Day');
  });

  it('is not a holiday the day before', () => {
    expect(holidayOn(noonLagos('2026-12-24'), LAGOS)).toBeNull();
  });

  it('uses the local day, not UTC', () => {
    /*
     * 23:30 UTC on 24 December is already 00:30 on Christmas Day in Lagos.
     * The whole reason `src/lib/dates.ts` exists is that UTC day maths was
     * wrong for this entire audience.
     */
    const lateOnChristmasEveUtc = new Date('2026-12-24T23:30:00Z');
    expect(holidayOn(lateOnChristmasEveUtc, LAGOS)?.name).toBe('Christmas Day');
    expect(holidayOn(lateOnChristmasEveUtc, 'UTC')).toBeNull();
  });

  it('formats the local date as YYYY-MM-DD', () => {
    expect(localDateInZone(noonLagos('2026-06-12'), LAGOS)).toBe('2026-06-12');
  });
});

describe('a public holiday closes a business that has not said otherwise', () => {
  const shop = { opening_hours: NINE_TO_FIVE, timezone: LAGOS };

  it('says closed, and names the holiday', () => {
    const state = publicOpenState(shop, noonLagos('2026-12-25'));
    expect(state.kind).toBe('closed');
    expect(state.detail).toBe('Closed for Christmas Day');
  });

  it('is open on an ordinary trading day at the same hour', () => {
    // The control. Without this, "closed" could be a broken schedule rather
    // than the holiday rule working.
    expect(publicOpenState(shop, noonLagos('2026-12-23')).kind).toBe('open');
  });

  it('respects a business that trades through holidays', () => {
    const state = publicOpenState(
      { ...shop, opens_on_holidays: true },
      noonLagos('2026-12-25'),
    );
    expect(state.kind).toBe('open');
  });

  it('lets an explicit "we are open" override beat the calendar', () => {
    // An owner who says they are open today knows more than the calendar.
    const state = publicOpenState(
      { ...shop, open_status: 'open', open_status_set_at: '2026-12-25T08:00:00Z' },
      noonLagos('2026-12-25'),
    );
    expect(state.kind).toBe('open');
  });

  it('closes on Democracy Day and Independence Day too', () => {
    for (const [date, name] of [
      ['2026-06-12', 'Democracy Day'],
      ['2026-10-01', 'Independence Day'],
    ]) {
      const state = publicOpenState(shop, noonLagos(date));
      expect(state.detail, name).toBe(`Closed for ${name}`);
    }
  });
});

describe('a manual override expires instead of lasting forever', () => {
  /*
   * The bug: `open_status === 'closed'` short-circuited the schedule with no
   * expiry, so one tap could leave a listing permanently telling customers not
   * to come. The rule is "closed today", which is what an owner tapping the
   * button means, and it heals itself overnight with no scheduler.
   */
  it('applies on the day it was set', () => {
    expect(overrideStillApplies('2026-09-07T10:00:00Z', noonLagos('2026-09-07'), LAGOS)).toBe(true);
  });

  it('has lapsed by the next day', () => {
    expect(overrideStillApplies('2026-09-07T10:00:00Z', noonLagos('2026-09-08'), LAGOS)).toBe(false);
  });

  it('honours an override with no timestamp', () => {
    /*
     * Chosen against the tidier alternative for a measured reason: production
     * carries exactly one business with `open_status = 'closed'` and no
     * timestamp column yet. Treating that as expired would have silently
     * reopened a listing whose owner deliberately closed it — trading a latent
     * bug for an active one.
     */
    expect(overrideStillApplies(null, noonLagos('2026-09-07'), LAGOS)).toBe(true);
    expect(overrideStillApplies(undefined, noonLagos('2026-09-07'), LAGOS)).toBe(true);
  });

  it('ignores a timestamp it cannot parse', () => {
    expect(overrideStillApplies('not a date', noonLagos('2026-09-07'), LAGOS)).toBe(false);
  });

  it('stops a stale "closed" from hiding a shop that is really open', () => {
    const shop = {
      opening_hours: NINE_TO_FIVE,
      timezone: LAGOS,
      open_status: 'closed' as const,
      open_status_set_at: '2026-09-01T10:00:00Z',   // a week earlier
    };
    expect(publicOpenState(shop, noonLagos('2026-09-08')).kind).toBe('open');
  });

  it('still believes today’s "closed"', () => {
    const shop = {
      opening_hours: NINE_TO_FIVE,
      timezone: LAGOS,
      open_status: 'closed' as const,
      open_status_set_at: '2026-09-08T08:00:00Z',
    };
    expect(publicOpenState(shop, noonLagos('2026-09-08')).kind).toBe('closed');
  });
});

describe('there is only one status engine', () => {
  it('resolvePublicStatus agrees with publicOpenState on a holiday', async () => {
    /*
     * There were two independent implementations. `resolvePublicStatus` knew
     * nothing about holidays and never expired an override, so on Christmas
     * morning one engine said "Closed for Christmas Day" and the other said
     * "open" — and whichever a surface happened to import decided what the
     * customer was told.
     */
    const { resolvePublicStatus } = await import('./businessStatus');
    const shop = { opening_hours: NINE_TO_FIVE, timezone: LAGOS };
    const christmas = noonLagos('2026-12-25');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(resolvePublicStatus(shop as any, christmas)).toBe('closed');
    expect(publicOpenState(shop, christmas).kind).toBe('closed');
  });

  it('still returns null when hours cannot be confirmed', async () => {
    const { resolvePublicStatus } = await import('./businessStatus');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(resolvePublicStatus({ opening_hours: 'Call ahead' } as any, noonLagos('2026-09-07')))
      .toBeNull();
  });
});
