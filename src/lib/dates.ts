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
