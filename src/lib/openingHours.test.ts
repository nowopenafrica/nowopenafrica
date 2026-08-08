import { describe, it, expect } from 'vitest';
import { parseOpeningHours, isOpenAt, nextChange, formatClock, dayAndMinutesInZone, isOpenAtInZone, nextChangeInZone } from './openingHours';

// Sunday = 0. These are real local times; the parser has no timezone concept.
const at = (day: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  // 2026-08-02 is a Sunday, so +day lands on the weekday we want.
  return new Date(2026, 7, 2 + day, h, m ?? 0);
};

const parse = (s: string) => {
  const r = parseOpeningHours(s);
  if (!r) throw new Error(`expected "${s}" to parse`);
  return r;
};

describe('parsing the formats real rows actually use', () => {
  it('handles an en-dash day and time range', () => {
    const h = parse('Mon–Sat: 9AM–7PM');
    expect(h.days[1]).toEqual({ open: 540, close: 1140 });   // Mon 9:00–19:00
    expect(h.days[6]).toEqual({ open: 540, close: 1140 });   // Sat
    expect(h.days[0]).toEqual({ open: null, close: null });  // Sun closed
  });

  it('handles a plain hyphen', () => {
    expect(parse('Mon-Fri: 9AM-6PM').days[3]).toEqual({ open: 540, close: 1080 });
  });

  it('handles multiple clauses', () => {
    const h = parse('Mon-Fri: 9AM-6PM, Sat: 10AM-4PM');
    expect(h.days[5]).toEqual({ open: 540, close: 1080 });
    expect(h.days[6]).toEqual({ open: 600, close: 960 });
    expect(h.days[0].open).toBeNull();
  });

  it('handles the full week', () => {
    const h = parse('Mon–Sun: 8AM–10PM');
    expect(h.days.every((d) => d.open === 480 && d.close === 1320)).toBe(true);
  });

  it('handles "Daily"', () => {
    expect(parse('Daily: 7AM–9PM').days.every((d) => d.open === 420)).toBe(true);
  });

  it('recognises 24/7 even with surrounding words', () => {
    for (const s of ['Reception open 24/7', 'Terminal open 24/7', 'Open 24 hours']) {
      expect(parseOpeningHours(s)?.alwaysOpen, s).toBe(true);
    }
  });

  it('handles 24-hour times without am/pm', () => {
    expect(parse('Mon-Fri: 08:30-17:00').days[1]).toEqual({ open: 510, close: 1020 });
  });

  it('handles midnight and noon correctly', () => {
    expect(parse('Daily: 12AM-12PM').days[0]).toEqual({ open: 0, close: 720 });
  });
});

describe('refusing to guess', () => {
  it('returns null for text that is not opening hours', () => {
    // A church's service times are not opening hours — guessing here would put
    // a wrong "Open Now" on the profile.
    expect(parseOpeningHours('Services: Sun 8AM & 10AM · Midweek Wed 6PM')).toBeNull();
  });

  it('returns null for empty or missing input', () => {
    expect(parseOpeningHours('')).toBeNull();
    expect(parseOpeningHours(null)).toBeNull();
    expect(parseOpeningHours(undefined)).toBeNull();
    expect(parseOpeningHours('   ')).toBeNull();
  });

  it('returns null for prose with no time range', () => {
    expect(parseOpeningHours('Call ahead for an appointment')).toBeNull();
  });

  it('ignores an out-of-range time rather than accepting nonsense', () => {
    expect(parseOpeningHours('Mon-Fri: 45AM-99PM')).toBeNull();
  });
});

describe('isOpenAt', () => {
  const week = parse('Mon–Sat: 9AM–7PM');

  it('is open inside the window and closed outside it', () => {
    expect(isOpenAt(week, at(1, '12:00'))).toBe(true);
    expect(isOpenAt(week, at(1, '08:59'))).toBe(false);
    expect(isOpenAt(week, at(1, '19:00'))).toBe(false); // closing time is exclusive
  });

  it('is closed on a day with no hours', () => {
    expect(isOpenAt(week, at(0, '12:00'))).toBe(false);
  });

  it('is always open for 24/7', () => {
    const always = parse('Reception open 24/7');
    expect(isOpenAt(always, at(0, '03:00'))).toBe(true);
  });

  describe('overnight shifts', () => {
    // "Tue–Sun: 4PM–2AM" is a real row. A same-day-only check reports closed at
    // 1AM, which is exactly wrong for a bar.
    const bar = parse('Tue–Sun: 4PM–2AM');

    it('is open late on the same evening', () => {
      expect(isOpenAt(bar, at(2, '23:00'))).toBe(true);
    });

    it('is still open after midnight, on the following calendar day', () => {
      expect(isOpenAt(bar, at(3, '01:00'))).toBe(true);
    });

    it('closes at the end of the overnight shift', () => {
      expect(isOpenAt(bar, at(3, '02:00'))).toBe(false);
      expect(isOpenAt(bar, at(3, '10:00'))).toBe(false);
    });

    it('is closed after midnight when the previous day had no shift', () => {
      // Monday has no hours, so early Tuesday is closed.
      expect(isOpenAt(bar, at(2, '01:00'))).toBe(false);
    });
  });
});

describe('nextChange', () => {
  const week = parse('Mon-Fri: 9AM-6PM, Sat: 10AM-4PM');

  it('reports today closing while open', () => {
    expect(nextChange(week, at(1, '12:00'))).toEqual({ kind: 'closes', minutes: 1080, dayOffset: 0 });
  });

  it('reports today opening when still before opening time', () => {
    expect(nextChange(week, at(1, '07:00'))).toEqual({ kind: 'opens', minutes: 540, dayOffset: 0 });
  });

  it('rolls to the next open day after closing', () => {
    // Saturday 5PM -> closed; Sunday closed; so Monday.
    expect(nextChange(week, at(6, '17:00'))).toEqual({ kind: 'opens', minutes: 540, dayOffset: 2 });
  });

  it('skips a closed day', () => {
    expect(nextChange(week, at(0, '12:00'))).toEqual({ kind: 'opens', minutes: 540, dayOffset: 1 });
  });

  it('reports the overnight close correctly after midnight', () => {
    const bar = parse('Tue–Sun: 4PM–2AM');
    expect(nextChange(bar, at(3, '01:00'))).toEqual({ kind: 'closes', minutes: 120, dayOffset: 0 });
    expect(nextChange(bar, at(2, '23:00'))).toEqual({ kind: 'closes', minutes: 120, dayOffset: 1 });
  });

  it('returns null for always-open', () => {
    expect(nextChange(parse('Open 24/7'), at(1, '12:00'))).toBeNull();
  });
});

describe('formatClock', () => {
  it('formats 12-hour times with meridiem', () => {
    expect(formatClock(0)).toBe('12:00 AM');
    expect(formatClock(540)).toBe('9:00 AM');
    expect(formatClock(720)).toBe('12:00 PM');
    expect(formatClock(1140)).toBe('7:00 PM');
    expect(formatClock(1290)).toBe('9:30 PM');
  });

  it('wraps values at or beyond a day', () => {
    expect(formatClock(1440)).toBe('12:00 AM');
    expect(formatClock(-60)).toBe('11:00 PM');
  });
});

describe('timezone-aware evaluation', () => {
  // One instant, different walls: 23:30 UTC on Sunday 9 Aug 2026.
  // Lagos (UTC+1) is already Monday 00:30; Honolulu (UTC-10) is still Sunday 13:30.
  const instant = new Date('2026-08-09T23:30:00Z');

  it('resolves the local day and minute for a business timezone', () => {
    expect(dayAndMinutesInZone(instant, 'Africa/Lagos')).toEqual({ day: 1, minutes: 30 });      // Mon 00:30
    expect(dayAndMinutesInZone(instant, 'Pacific/Honolulu')).toEqual({ day: 0, minutes: 810 }); // Sun 13:30
    expect(dayAndMinutesInZone(instant, 'Asia/Tokyo')).toEqual({ day: 1, minutes: 510 });       // Mon 08:30
  });

  it('is open according to the business wall clock, not the viewer location', () => {
    // Mon–Sat 9AM–7PM. Lagos says Monday 00:30 -> closed (not open yet).
    const h = parse('Mon–Sat: 9AM–7PM');
    expect(isOpenAtInZone(h, instant, 'Africa/Lagos')).toBe(false);
    // Honolulu says Sunday 13:30 -> closed (Sunday has no hours).
    expect(isOpenAtInZone(h, instant, 'Pacific/Honolulu')).toBe(false);
    // At 09:00 UTC Monday, Lagos says Monday 10:00 -> open, while Honolulu is
    // still Sunday 23:00 -> closed (Sunday has no hours).
    const openInstant = new Date('2026-08-10T09:00:00Z');
    expect(isOpenAtInZone(h, openInstant, 'Africa/Lagos')).toBe(true);
    expect(isOpenAtInZone(h, openInstant, 'Pacific/Honolulu')).toBe(false);
  });

  it('reports the next change in the business timezone', () => {
    // Mon–Fri 9AM–6PM. At 08:00 UTC on Monday: Lagos says Monday 09:00 (just
    // opened, closes 6PM); Honolulu says Sunday 22:00 (opens Monday 9AM).
    const h = parse('Mon-Fri: 9AM-6PM');
    const monday = new Date('2026-08-10T08:00:00Z');
    expect(nextChangeInZone(h, monday, 'Africa/Lagos')).toEqual({ kind: 'closes', minutes: 1080, dayOffset: 0 });
    expect(nextChangeInZone(h, monday, 'Pacific/Honolulu')).toEqual({ kind: 'opens', minutes: 540, dayOffset: 1 });
  });

  it('stays timezone-aware for overnight shifts', () => {
    const bar = parse('Tue–Sun: 4PM–2AM');
    // Lagos Monday 04:00 (03:00 UTC) — Monday has no shift and Sunday's 4PM–2AM
    // shift closed at 2AM. Closed.
    expect(isOpenAtInZone(bar, new Date('2026-08-10T03:00:00Z'), 'Africa/Lagos')).toBe(false);
    // Lagos Monday 01:00 (00:00 UTC) — still inside Sunday's 4PM–2AM shift. Open.
    expect(isOpenAtInZone(bar, new Date('2026-08-10T00:00:00Z'), 'Africa/Lagos')).toBe(true);
    // Honolulu Sunday 13:00 (23:00 UTC Saturday) — before Sunday's 4PM opening. Closed.
    expect(isOpenAtInZone(bar, new Date('2026-08-09T23:00:00Z'), 'Pacific/Honolulu')).toBe(false);
  });
});
