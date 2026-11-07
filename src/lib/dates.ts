// Calendar-day helpers (pure).
//
// "Today" on a dashboard means the viewer's own day, not UTC's. Comparing UTC
// calendar days makes a payment taken at 00:30 in Lagos (UTC+1) read as
// yesterday's revenue, and a sign-off made minutes ago read as an older
// decision. Every "today" in the product goes through here so the whole app
// agrees on where the day starts.

/** True when `iso` falls on the same local calendar day as `now`. */
export const isSameLocalDay = (iso: string | null | undefined, now: Date = new Date()): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime())
    && d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
};

/**
 * `YYYY-MM-DD` for the local calendar day — the value a date input expects.
 * `toISOString().slice(0, 10)` is the UTC day and is off by one either side of
 * midnight depending on the offset.
 */
export const localDateISO = (date: Date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * `YYYY-MM-DDTHH:MM` for now, local — the value `<input type="datetime-local">`
 * expects. Same reason as `localDateISO`: `toISOString()` is UTC and would offer
 * a "minimum" in the past or future depending on the offset.
 */
export const localDateTimeNow = (date: Date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${localDateISO(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "3 Nov 2026" on the viewer's local calendar, for a date-only string
 * (`2026-11-03`) or a timestamp (`2026-11-03T09:00:00+00:00`).
 *
 * A date-only string is read as that calendar day, not handed to `new Date`,
 * which parses it as UTC midnight and so prints the day before anywhere west
 * of Greenwich. Month names are spelled here rather than left to the locale so
 * the same claim reads the same on every device. An unparseable value comes
 * back as given rather than as "Invalid Date".
 */
export const formatLocalDate = (iso: string): string => {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
