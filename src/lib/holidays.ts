/**
 * Public holidays, for the "Open now" engine.
 *
 * WHY THIS EXISTS. `openingHours.test.ts` covered overnight trading, midnight
 * crossover, timezones and 24-hour businesses — and had zero coverage of
 * public holidays. Nigeria has six fixed public holidays plus Easter and two
 * lunar Eids. On every one of those days the platform's headline promise was
 * confidently wrong: a directory that says "Open now" on Christmas morning is
 * not a directory anyone trusts twice, and those are the days a customer most
 * needs to know before setting off.
 *
 * WHAT IS AND IS NOT ASSERTED HERE. This file states only dates that are
 * determinable without guessing:
 *
 *  - **Fixed-date holidays** are law and never move.
 *  - **Easter** is computed with the anonymous Gregorian algorithm, which is
 *    exact for any year, giving Good Friday and Easter Monday.
 *  - **Eid al-Fitr and Eid al-Adha are deliberately absent.** They follow
 *    lunar observation and are announced, not calculated. Publishing a guessed
 *    Eid date would be exactly the fabricated-data problem this platform has
 *    spent effort removing — and being wrong about Eid is worse than saying
 *    nothing. They belong in an admin-maintained table; `extraHolidays`
 *    accepts them once somebody who knows supplies them.
 *
 * A holiday makes a business CLOSED unless it has said otherwise. That is the
 * safer default in both directions: a customer told "closed" who finds it open
 * is mildly annoyed, while a customer told "open" who travels to a locked door
 * blames the platform.
 */

export interface Holiday {
  /** ISO date, `YYYY-MM-DD`, in the country's own calendar. */
  date: string;
  name: string;
  /** ISO-3166 alpha-2. Only 'NG' is populated today. */
  country: string;
}

/** Fixed-date public holidays. These are statutory and do not move. */
const FIXED: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: "New Year's Day" },
  { month: 5, day: 1, name: 'Workers’ Day' },
  { month: 6, day: 12, name: 'Democracy Day' },
  { month: 10, day: 1, name: 'Independence Day' },
  { month: 12, day: 25, name: 'Christmas Day' },
  { month: 12, day: 26, name: 'Boxing Day' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/**
 * Easter Sunday for a given year, Gregorian calendar.
 *
 * The anonymous Gregorian algorithm — exact, no table, no approximation. Used
 * only to derive Good Friday (−2 days) and Easter Monday (+1), both of which
 * are public holidays in Nigeria.
 */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Shift an ISO date by whole days, calendar-correctly. */
function shiftDays(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Every determinable public holiday for a year.
 *
 * `extraHolidays` is where announced lunar dates (Eid al-Fitr, Eid al-Adha)
 * and any one-off national holiday are supplied. Nothing is invented for them.
 */
export function holidaysForYear(
  year: number,
  country = 'NG',
  extraHolidays: Holiday[] = [],
): Holiday[] {
  if (country !== 'NG') {
    // Other African markets are in scope for the platform but their calendars
    // have not been sourced. Returning only what was supplied is honest;
    // guessing would not be.
    return extraHolidays.filter((h) => h.country === country && h.date.startsWith(`${year}-`));
  }

  const easter = easterSunday(year);
  const easterISO = iso(year, easter.month, easter.day);

  return [
    ...FIXED.map((f) => ({ date: iso(year, f.month, f.day), name: f.name, country: 'NG' })),
    { date: shiftDays(easterISO, -2), name: 'Good Friday', country: 'NG' },
    { date: shiftDays(easterISO, 1), name: 'Easter Monday', country: 'NG' },
    ...extraHolidays.filter((h) => h.country === country && h.date.startsWith(`${year}-`)),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The local calendar date in a timezone, as `YYYY-MM-DD`.
 *
 * Via `Intl` rather than date arithmetic, because the whole point is the
 * business's own day boundary — the same reason `src/lib/dates.ts` exists.
 */
export function localDateInZone(now: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    // en-CA formats as YYYY-MM-DD.
    return parts.replace(/\//g, '-');
  } catch {
    return iso(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  }
}

/** Is `now` a public holiday where this business trades? */
export function holidayOn(
  now: Date,
  timeZone: string,
  country = 'NG',
  extraHolidays: Holiday[] = [],
): Holiday | null {
  const today = localDateInZone(now, timeZone);
  const year = Number(today.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return holidaysForYear(year, country, extraHolidays).find((h) => h.date === today) ?? null;
}
