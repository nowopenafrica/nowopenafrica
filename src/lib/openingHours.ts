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

// --- Writing hours back out --------------------------------------------------
//
// The inverse of parseOpeningHours, for the owner-facing editor. Everything the
// editor saves goes through here, so a business can no longer end up with hours
// this module can't read back — which is what left profiles showing "hours not
// confirmed" and the directory unable to filter them.

/** Week in reading order, paired with the Date#getDay index each label means. */
const WEEK_ORDER: readonly { index: number; label: string }[] = [
  { index: 1, label: 'Mon' }, { index: 2, label: 'Tue' }, { index: 3, label: 'Wed' },
  { index: 4, label: 'Thu' }, { index: 5, label: 'Fri' }, { index: 6, label: 'Sat' },
  { index: 0, label: 'Sun' },
];

/** Minutes from midnight -> "9AM" / "9:30AM" / "12PM", the style already stored. */
export function minutesToLabel(mins: number): string {
  const total = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

/**
 * Render a week back to the stored text, collapsing consecutive days that share
 * hours ("Mon–Fri: 9AM–6PM · Sat: 10AM–4PM"). Closed days are simply left out.
 * Returns '' when nothing is open, which callers store as "not set" rather than
 * as "closed all week".
 */
export function formatOpeningHours(days: DayHours[], alwaysOpen = false): string {
  if (alwaysOpen) return 'Open 24/7';

  type Run = { from: string; to: string; open: number; close: number; endPos: number };
  const runs: Run[] = [];
  WEEK_ORDER.forEach(({ index, label }, pos) => {
    const d = days[index];
    if (!d || d.open === null || d.close === null) return;
    const last = runs[runs.length - 1];
    // Merge only into an unbroken run — a closed day in between must split it.
    if (last && last.open === d.open && last.close === d.close && last.endPos === pos - 1) {
      last.to = label;
      last.endPos = pos;
      return;
    }
    runs.push({ from: label, to: label, open: d.open, close: d.close, endPos: pos });
  });

  return runs
    .map((r) => {
      const dayPart = r.from === r.to ? r.from : `${r.from}–${r.to}`;
      return `${dayPart}: ${minutesToLabel(r.open)}–${minutesToLabel(r.close)}`;
    })
    .join(' · ');
}

/** "HH:MM" (what <input type="time"> gives) -> minutes from midnight. */
export function timeInputToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes from midnight -> "HH:MM" for <input type="time">. */
export function minutesToTimeInput(mins: number): string {
  const total = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** A blank week, for an owner who hasn't set hours yet. */
export const emptyWeek = (): DayHours[] => closedWeek();

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

// --- Timezone-aware evaluation ---------------------------------------------------
//
// A business in Lagos and one in Nairobi share the same instant but not the same
// local clock. `isOpenAt`/`nextChange` above read the *viewer's* wall clock,
// which is right for an owner's own dashboard but wrong on the public profile
// and directory. These functions resolve the business's IANA timezone (e.g.
// "Africa/Lagos") so "open now" means the local time where the business stands.
//
// The platform is Africa-first, so when a business hasn't recorded a timezone we
// fall back to Lagos — the stated home — rather than the viewer's location.
export const DEFAULT_BUSINESS_TIMEZONE = 'Africa/Lagos';

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = zoneFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    zoneFormatters.set(timeZone, fmt);
  }
  return fmt;
}

export interface ZoneTime {
  /** 0 = Sunday … 6 = Saturday, in the business's own timezone. */
  day: number;
  /** Minutes from midnight, in the business's own timezone. */
  minutes: number;
}

/** Local day + minutes for `now`, evaluated in `timeZone` (IANA name). */
export function dayAndMinutesInZone(now: Date, timeZone: string): ZoneTime {
  let day = 0;
  let hour = 0;
  let minute = 0;
  for (const part of zoneFormatter(timeZone).formatToParts(now)) {
    if (part.type === 'weekday') day = dayIndex(part.value) ?? 0;
    else if (part.type === 'hour') hour = Number(part.value);
    else if (part.type === 'minute') minute = Number(part.value);
  }
  return { day, minutes: hour * 60 + minute };
}

/** Same contract as `isOpenAt`, but the day/minute come from the business's timezone. */
export function isOpenAtInZone(h: OpeningHours, now: Date, timeZone: string): boolean {
  if (h.alwaysOpen) return true;
  const { day, minutes } = dayAndMinutesInZone(now, timeZone);
  const today = h.days[day];
  if (today.open !== null && today.close !== null) {
    if (isOvernight(today)) {
      if (minutes >= today.open) return true;
    } else if (minutes >= today.open && minutes < today.close) {
      return true;
    }
  }
  // Yesterday's overnight shift may still be running in the business's zone.
  const yesterday = h.days[(day + 6) % 7];
  if (isOvernight(yesterday) && yesterday.close !== null && minutes < yesterday.close) return true;
  return false;
}

/** Same contract as `nextChange`, but for the business's timezone. */
export function nextChangeInZone(h: OpeningHours, now: Date, timeZone: string): NextChange | null {
  if (h.alwaysOpen) return null;
  const { day, minutes } = dayAndMinutesInZone(now, timeZone);

  if (isOpenAtInZone(h, now, timeZone)) {
    const today = h.days[day];
    if (today.close !== null && today.open !== null) {
      if (isOvernight(today) && minutes >= today.open) {
        return { kind: 'closes', minutes: today.close, dayOffset: 1 };
      }
      if (!isOvernight(today) && minutes < today.close) {
        return { kind: 'closes', minutes: today.close, dayOffset: 0 };
      }
    }
    // Being open on yesterday's overnight shift, in the business's zone.
    const yesterday = h.days[(day + 6) % 7];
    if (isOvernight(yesterday) && yesterday.close !== null) {
      return { kind: 'closes', minutes: yesterday.close, dayOffset: 0 };
    }
    return null;
  }

  // Closed: find the next opening within a week, in the business's zone.
  for (let offset = 0; offset < 8; offset++) {
    const d = h.days[(day + offset) % 7];
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

// --- Public open / closed ------------------------------------------------------
//
// One implementation, shared by the app and by the server-rendered profile.
// It deliberately takes a minimal shape rather than the Business type: this
// module has no dependencies, and a Vercel function must be able to import it
// without dragging in the app.

/** The only fields the state depends on. */
export interface OpenStateInput {
  opening_hours?: string | null;
  hours?: string | null;
  timezone?: string | null;
  open_status?: 'open' | 'closed' | null;
}

export interface OpenState {
  /** 'open' | 'closing-soon' | 'closed' | 'unknown' */
  kind: 'open' | 'closing-soon' | 'closed' | 'unknown';
  label: string;
  /** The second line: "Open until 8:00 PM", "Opens Monday 9:00 AM". */
  detail: string;
}

/** Under this many minutes to closing counts as closing soon. */
export const CLOSING_SOON_MINUTES = 60;

/**
 * The state to print, in the business's OWN timezone.
 *
 * "Closing soon" is a distinct state rather than a shade of open because it is
 * the one that changes a customer's behaviour — it is the difference between
 * setting off now and going tomorrow.
 *
 * An owner's manual override wins over the schedule, since a business that has
 * shut early knows something the timetable does not. But it cannot invent a
 * time, so the detail line falls back to the schedule's wording.
 */
export function publicOpenState(b: OpenStateInput, now: Date = new Date()): OpenState {
  const text = b.opening_hours || b.hours || '';
  const hours: OpeningHours | null = parseOpeningHours(text);
  const zone = b.timezone || DEFAULT_BUSINESS_TIMEZONE;

  if (b.open_status === 'closed') {
    return { kind: 'closed', label: 'Closed', detail: nextOpenDetail(hours, zone, now) };
  }

  if (!hours) {
    if (b.open_status === 'open') return { kind: 'open', label: 'Open now', detail: '' };
    return { kind: 'unknown', label: 'Hours not confirmed', detail: '' };
  }

  if (hours.alwaysOpen) return { kind: 'open', label: 'Open now', detail: 'Open 24 hours' };

  const open = b.open_status === 'open' || isOpenAtInZone(hours, now, zone);
  if (!open) return { kind: 'closed', label: 'Closed', detail: nextOpenDetail(hours, zone, now) };

  const change = nextChangeInZone(hours, now, zone);
  if (change?.kind === 'closes' && change.dayOffset === 0) {
    const mins = minutesUntil(change.minutes, now, zone);
    if (mins !== null && mins <= CLOSING_SOON_MINUTES) {
      return {
        kind: 'closing-soon',
        label: 'Closing soon',
        detail: `Closes in ${mins} minute${mins === 1 ? '' : 's'}`,
      };
    }
    return { kind: 'open', label: 'Open now', detail: `Open until ${formatClock(change.minutes)}` };
  }
  return { kind: 'open', label: 'Open now', detail: '' };
}

function nextOpenDetail(hours: OpeningHours | null, zone: string, now: Date): string {
  if (!hours) return '';
  const change = nextChangeInZone(hours, now, zone);
  if (!change || change.kind !== 'opens') return '';
  if (change.dayOffset === 0) return `Opens at ${formatClock(change.minutes)}`;
  if (change.dayOffset === 1) return `Opens tomorrow at ${formatClock(change.minutes)}`;
  const day = WEEKDAY_FULL[(nowDayInZone(now, zone) + change.dayOffset) % 7];
  return `Opens ${day} at ${formatClock(change.minutes)}`;
}

function nowDayInZone(now: Date, zone: string): number {
  try {
    const label = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: zone }).format(now);
    const i = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label);
    return i >= 0 ? i : now.getDay();
  } catch {
    return now.getDay();
  }
}

/** Minutes from now until a time-of-day, in the business's zone. */
function minutesUntil(targetMinutes: number, now: Date, zone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const m = Number(parts.find((p) => p.type === 'minute')?.value);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    const diff = targetMinutes - (h * 60 + m);
    return diff >= 0 ? diff : null;
  } catch {
    return null;
  }
}

