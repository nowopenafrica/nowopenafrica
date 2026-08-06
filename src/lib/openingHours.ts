// Parse the free-text opening hours stored on a business row, so a visitor's
// "open now" is based on the business's ACTUAL hours.
//
// Why this exists — a real defect it fixes:
//
// The public profile derived open/closed via loadClockConfig(business), which
// reads the *viewer's* localStorage. A visitor has no clock config for someone
// else's business, so it fell through to defaultAutoHours(category) and the
// badge showed a status invented from the category — a restaurant read "Open"
// because restaurants are usually open at that hour, regardless of whether that
// restaurant was. Meanwhile the real hours sat in business.opening_hours,
// displayed as text further down the page.
//
// A confidently wrong "Open Now" is worse than no badge: someone can travel to a
// closed shop. So when the text can't be parsed this returns null and callers
// must say "hours not confirmed" rather than guess.
//
// Formats seen in real rows, all handled:
//   "Mon–Sat: 9AM–7PM"      en-dash day and time ranges
//   "Mon-Fri: 9AM-6PM"      plain hyphen
//   "Mon–Sun: 8AM–10PM"     full week
//   "Tue–Sun: 4PM–2AM"      OVERNIGHT — spans midnight
//   "Reception open 24/7"   always open, with surrounding words
//   "Daily: 7AM–9PM"        "daily" as a day range
//   "Services: Sun 8AM & 10AM · Midweek Wed 6PM"  NOT opening hours -> null

/** Minutes from midnight, or null when the business is closed that day. */
export interface DayHours {
  open: number | null;
  close: number | null;
}

export interface OpeningHours {
  /** Index 0 = Sunday … 6 = Saturday, matching Date#getDay. */
  days: DayHours[];
  alwaysOpen: boolean;
  /** The original text, so the UI can show what was parsed. */
  source: string;
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const closedWeek = (): DayHours[] => DAY_NAMES.map(() => ({ open: null, close: null }));

function dayIndex(token: string): number | null {
  const t = token.trim().toLowerCase().slice(0, 3);
  const i = DAY_NAMES.indexOf(t);
  return i >= 0 ? i : null;
}

/** "9AM" | "10:30PM" | "17:00" -> minutes from midnight. */
function parseTime(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(t);
  if (!m) return null;
  let hour = Number(m[1]);
  const mins = m[2] ? Number(m[2]) : 0;
  const suffix = m[3];
  if (hour > 23 || mins > 59) return null;
  if (suffix === 'pm' && hour < 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  // Without am/pm we take the number as 24-hour, which is what "17:00" means.
  return hour * 60 + mins;
}

/** Inclusive day span, wrapping across the week ("Fri–Mon"). */
function daySpan(from: number, to: number): number[] {
  const out: number[] = [];
  let i = from;
  for (let guard = 0; guard < 7; guard++) {
    out.push(i);
    if (i === to) break;
    i = (i + 1) % 7;
  }
  return out;
}

/**
 * Parse the stored text. Returns null when nothing time-like can be found —
 * callers must then present the hours as unknown, never as open or closed.
 */
export function parseOpeningHours(text: string | null | undefined): OpeningHours | null {
  const src = (text ?? '').trim();
  if (!src) return null;

  const lower = src.toLowerCase();

  // 24/7 — often wrapped in words ("Reception open 24/7").
  if (/24\s*\/\s*7|24hrs|24 hours|always open/.test(lower)) {
    return { days: DAY_NAMES.map(() => ({ open: 0, close: 24 * 60 })), alwaysOpen: true, source: src };
  }

  const days = closedWeek();
  let matched = 0;

  // Each clause looks like "<days>: <start>-<end>", separated by , ; or ·
  for (const clause of src.split(/[,;·|]/)) {
    const c = clause.trim();
    if (!c) continue;

    // Times first — a clause without a time range isn't opening hours.
    const timeMatch = /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[–—-]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i.exec(c);
    if (!timeMatch) continue;
    const open = parseTime(timeMatch[1]);
    const close = parseTime(timeMatch[2]);
    if (open === null || close === null) continue;

    // Days: the part before the times. "Daily"/"Everyday" means the whole week.
    const dayPart = c.slice(0, timeMatch.index);
    let targets: number[];
    if (/daily|every\s*day|all week/i.test(dayPart)) {
      targets = [0, 1, 2, 3, 4, 5, 6];
    } else {
      const range = /([a-z]{3,9})\s*[–—-]\s*([a-z]{3,9})/i.exec(dayPart);
      if (range) {
        const a = dayIndex(range[1]);
        const b = dayIndex(range[2]);
        targets = a !== null && b !== null ? daySpan(a, b) : [];
      } else {
        // One or more single days ("Sat 10AM-4PM", "Mon & Wed ...")
        targets = (dayPart.match(/[a-z]{3,9}/gi) ?? [])
          .map(dayIndex)
          .filter((d): d is number => d !== null);
      }
      // A bare time range with no day names applies to every day.
      if (!targets.length && !dayPart.replace(/[^a-z]/gi, '')) targets = [0, 1, 2, 3, 4, 5, 6];
    }
    if (!targets.length) continue;

    for (const d of targets) days[d] = { open, close };
    matched++;
  }

  if (!matched) return null;
  return { days, alwaysOpen: false, source: src };
}

/** True when `close` is at or before `open`, i.e. the shift crosses midnight. */
const isOvernight = (d: DayHours): boolean =>
  d.open !== null && d.close !== null && d.close <= d.open;

/**
 * Is the business open at `now`?
 *
 * Handles overnight shifts in both directions: at 1AM a "4PM–2AM" entry for
 * YESTERDAY still counts as open, which a same-day-only check gets wrong.
 */
export function isOpenAt(h: OpeningHours, now: Date): boolean {
  if (h.alwaysOpen) return true;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const today = h.days[now.getDay()];
  if (today.open !== null && today.close !== null) {
    if (isOvernight(today)) {
      if (minutes >= today.open) return true;
    } else if (minutes >= today.open && minutes < today.close) {
      return true;
    }
  }
  // Yesterday's overnight shift may still be running.
  const yesterday = h.days[(now.getDay() + 6) % 7];
  if (isOvernight(yesterday) && yesterday.close !== null && minutes < yesterday.close) return true;
  return false;
}

export interface NextChange {
  kind: 'opens' | 'closes';
  /** Minutes from midnight of the day it happens. */
  minutes: number;
  /** 0 = today, 1 = tomorrow, … */
  dayOffset: number;
}

/**
 * When does the state next flip? Powers "Closes 8:00 PM" / "Opens Mon 9:00 AM".
 * Returns null for always-open, or when no day has hours.
 */
export function nextChange(h: OpeningHours, now: Date): NextChange | null {
  if (h.alwaysOpen) return null;
  const minutes = now.getHours() * 60 + now.getMinutes();

  if (isOpenAt(h, now)) {
    const today = h.days[now.getDay()];
    if (today.close !== null && today.open !== null) {
      if (isOvernight(today) && minutes >= today.open) {
        return { kind: 'closes', minutes: today.close, dayOffset: 1 };
      }
      if (!isOvernight(today) && minutes < today.close) {
        return { kind: 'closes', minutes: today.close, dayOffset: 0 };
      }
    }
    // Being open on yesterday's overnight shift.
    const yesterday = h.days[(now.getDay() + 6) % 7];
    if (isOvernight(yesterday) && yesterday.close !== null) {
      return { kind: 'closes', minutes: yesterday.close, dayOffset: 0 };
    }
    return null;
  }

  // Closed: find the next opening within a week.
  for (let offset = 0; offset < 8; offset++) {
    const d = h.days[(now.getDay() + offset) % 7];
    if (d.open === null) continue;
    if (offset === 0 && d.open <= minutes) continue;
    return { kind: 'opens', minutes: d.open, dayOffset: offset };
  }
  return null;
}

/** "9:00 AM" from minutes-from-midnight. */
export function formatClock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

export const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
