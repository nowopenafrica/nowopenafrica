// NowOpen Africa — Live Business Status & Smart Business Clock.
//
// Turns every business on the network into a live, real-time presence:
//   • A status engine (Open / Closed / Busy / Available / Live / Delivery
//     Active / Appointment Only) that resolves the effective status from the
//     owner's manual override, their weekday opening hours and live flags.
//   • The Smart Business Clock: auto open/close from weekday hours, a Smart
//     Reminder when the scheduled opening time has passed, and one-tap open.
//   • Business Pulse rollups per city, a per-business Timeline of today's
//     activity, Open Streak / Opening Reliability / Business Health scores,
//     staff clock-in, follower notifications and an AI Opening Assistant that
//     generates today's opening campaign.
//
// Everything is deterministic (seeded by business id + date) and pure enough to
// unit-test, mirroring the other `src/lib/*` engines. Persistence uses the
// `nowopen_<entity>_<businessId>` localStorage key convention.

import { Business } from '../types';
import { hashString, mulberry32, pick } from './videoCreator';
import { parseOpeningHours, isOpenAtInZone, DEFAULT_BUSINESS_TIMEZONE } from './openingHours';

// --- Status model -------------------------------------------------------------

export type BusinessStatus = 'open' | 'closed' | 'busy' | 'available' | 'live' | 'delivery' | 'appointment';

export interface StatusMeta {
  label: string;
  sub: string;
  emoji: string;
  dot: string;
  text: string;
  chip: string;
  animate: boolean;
}

export const STATUS_META: Record<BusinessStatus, StatusMeta> = {
  open: { label: 'Open', sub: 'Open now', emoji: '🟢', dot: 'bg-green-500', text: 'text-green-600 dark:text-green-400', chip: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800', animate: false },
  closed: { label: 'Closed', sub: 'Closed for the day', emoji: '⚫', dot: 'bg-gray-400', text: 'text-gray-600 dark:text-gray-400', chip: 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700', animate: false },
  busy: { label: 'Busy', sub: 'Short wait', emoji: '🟡', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', chip: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800', animate: true },
  available: { label: 'Available', sub: 'Available now', emoji: '🔵', dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400', chip: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800', animate: false },
  live: { label: 'Live', sub: 'Live now', emoji: '🔴', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', chip: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800', animate: true },
  delivery: { label: 'Delivery Active', sub: 'Taking orders now', emoji: '🟣', dot: 'bg-purple-500', text: 'text-purple-600 dark:text-purple-400', chip: 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800', animate: false },
  appointment: { label: 'Appointment Only', sub: 'By appointment', emoji: '🟠', dot: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', chip: 'bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800', animate: false },
};

export const STATUS_LIST: BusinessStatus[] = ['open', 'closed', 'busy', 'available', 'live', 'delivery', 'appointment'];

// Maps the legacy two/three-state card statuses to the live status model.
export function legacyStatusToLive(status?: string): BusinessStatus | null {
  if (status === 'open') return 'open';
  if (status === 'closed') return 'closed';
  if (status === 'active') return 'live';
  return null;
}

export function isBusinessOpen(status: BusinessStatus): boolean {
  return status !== 'closed';
}

// Lower rank = surfaced first when sorting search results live-first.
export function statusSortRank(status: BusinessStatus): number {
  const rank: Record<BusinessStatus, number> = { live: 0, open: 1, busy: 2, available: 3, delivery: 4, appointment: 5, closed: 6 };
  return rank[status];
}

// --- Honest public status -------------------------------------------------------
//
// resolveBusinessStatus() above is the OWNER's view: it reads the owner's clock
// config (localStorage) and reports Busy/Available/Live/etc. That must never run
// for a visitor — a visitor has no clock config for someone else's business, so
// it would fall through to defaultAutoHours(category) and INVENT a status from
// the category ("a restaurant reads Open because restaurants usually are").
//
// resolvePublicStatus() is the VISITOR's view: it reads the business's OWN
// stored opening_hours and evaluates them in the business's OWN timezone. When
// the text can't be parsed it returns null and callers must say "hours not
// confirmed" rather than guess — a confidently wrong "Open Now" sends someone to
// a closed shop.

/** IANA timezone the business operates in; falls back to the platform home. */
export function businessTimezone(business: Business): string {
  return business.timezone || DEFAULT_BUSINESS_TIMEZONE;
}

/** Honest public open/closed, or null when it can't be confirmed. */
export function resolvePublicStatus(business: Business, now: Date): 'open' | 'closed' | null {
  // The owner's DB override (if any) is the strongest truth on the public side.
  if (business.open_status === 'open' || business.open_status === 'closed') return business.open_status;
  const parsed = parseOpeningHours(business.opening_hours ?? business.hours);
  if (!parsed) return null;
  return isOpenAtInZone(parsed, now, businessTimezone(business)) ? 'open' : 'closed';
}

// --- Time helpers -------------------------------------------------------------

export function parseMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time || '').trim());
  if (!m) return null;
  const hours = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  if (hours > 24 || mins > 59 || (hours === 24 && mins !== 0)) return null;
  return hours * 60 + mins;
}

export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

export function currentMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

// 24h 'HH:MM' — used for machine-readable timeline event times (parseable).
export function toTimeString(mins: number): string {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function dateKey(now: Date): string {
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_LABELS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// --- Opening hours ------------------------------------------------------------

export interface WeekdayHours {
  open: string;
  close: string;
  closed?: boolean;
}

export function defaultAutoHours(category?: string): WeekdayHours[] {
  const cat = (category || '').toLowerCase();
  const includesAny = (...keys: string[]) => keys.some((k) => cat.includes(k));

  if (includesAny('hospital', 'clinic', 'dental', 'veterinary', 'pharmacy', 'hotel', 'lodging', 'guesthouse', 'security', 'convenience')) {
    return WEEKDAY_LABELS.map(() => ({ open: '00:00', close: '24:00' }));
  }
  if (includesAny('restaurant', 'fast food', 'food vendor', 'suya', 'shawarma', 'bar & lounge', 'bar /', 'food truck')) {
    return WEEKDAY_LABELS.map(() => ({ open: '07:00', close: '23:00' }));
  }
  if (includesAny('café', 'bakery', 'pastry')) {
    return WEEKDAY_LABELS.map(() => ({ open: '06:00', close: '20:00' }));
  }
  return WEEKDAY_LABELS.map((_, i) => {
    if (i === 0) return { open: '', close: '', closed: true };
    if (i === 6) return { open: '09:00', close: '17:00' };
    return { open: '08:00', close: '18:00' };
  });
}

export function autoStatusForTime(hours: WeekdayHours[], now: Date): 'open' | 'closed' {
  const day = now.getDay();
  const slot = hours[day] || { open: '', close: '', closed: true };
  if (slot.closed) return 'closed';
  const openAt = parseMinutes(slot.open);
  const closeAt = parseMinutes(slot.close);
  if (openAt === null || closeAt === null) return 'closed';
  const mins = currentMinutes(now);
  return mins >= openAt && mins < closeAt ? 'open' : 'closed';
}

// --- Effective status resolution ----------------------------------------------

export interface BusinessClockConfig {
  manualOverride?: 'open' | 'closed' | null;
  autoHours: WeekdayHours[];
  liveNow?: boolean;
  deliveryActive?: boolean;
  appointmentOnly?: boolean;
  staffClockedIn?: number | null;
  /** Roster size. Without it there is no honest "x of y on duty" to show. */
  staffTotal?: number | null;
  lastOpenedAt?: string | null;
  streakDays?: number | null;
  openedDays?: number | null;
  reliabilityScore?: number | null;
  dismissedReminderDate?: string | null;
  laterReminderAt?: string | null;
}

export function defaultClockConfig(business: Business): BusinessClockConfig {
  return {
    manualOverride: null,
    autoHours: defaultAutoHours(business.category),
    liveNow: false,
    deliveryActive: false,
    appointmentOnly: false,
    staffClockedIn: null,
    staffTotal: null,
    lastOpenedAt: null,
    streakDays: null,
    openedDays: null,
    reliabilityScore: null,
    dismissedReminderDate: null,
    laterReminderAt: null,
  };
}

export function clockStorageKey(id: string): string {
  return `nowopen_businessClock_${id}`;
}

export function loadClockConfig(business: Business): BusinessClockConfig {
  const base = defaultClockConfig(business);
  try {
    const raw = localStorage.getItem(clockStorageKey(business.id));
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<BusinessClockConfig>;
    return { ...base, ...saved, autoHours: saved.autoHours || base.autoHours };
  } catch {
    return base;
  }
}

export function saveClockConfig(id: string, config: BusinessClockConfig): void {
  try {
    localStorage.setItem(clockStorageKey(id), JSON.stringify(config));
  } catch {
    // storage unavailable — status simply stays non-persisted
  }
}

function statusHint(business: Business, now: Date): 'busy' | 'available' | null {
  const rng = mulberry32(hashString(`${business.id}:${dateKey(now)}:hint`));
  const r = rng();
  if (r > 0.92) return 'available';
  if (r > 0.72) return 'busy';
  return null;
}

export function resolveBusinessStatus(business: Business, config: BusinessClockConfig, now: Date): BusinessStatus {
  if (config.liveNow) return 'live';
  if (config.manualOverride === 'closed') return 'closed';
  const auto = autoStatusForTime(config.autoHours, now);
  if (auto === 'closed' && config.manualOverride !== 'open') return 'closed';
  if (config.manualOverride === 'open') return 'open';
  if (config.appointmentOnly) return 'appointment';
  if (config.deliveryActive) return 'delivery';
  const hint = statusHint(business, now);
  if (hint) return hint;
  return 'open';
}

export function getStatusMeta(status: BusinessStatus, category?: string): StatusMeta {
  const meta = { ...STATUS_META[status] };
  if (status !== 'closed') {
    const queue = queueCopyFor(category, status);
    if (queue) meta.sub = queue;
  }
  return meta;
}

// --- Category queue / capacity copy --------------------------------------------

export function queueCopyFor(category?: string, status?: BusinessStatus): string | null {
  const cat = (category || '').toLowerCase();
  if (!cat) return null;
  if (cat.includes('restaurant') || cat.includes('fast food') || cat.includes('food vendor') || cat.includes('suya') || cat.includes('shawarma') || cat.includes('food truck')) {
    if (status === 'busy') return 'Estimated wait 18 mins';
    if (status === 'delivery') return '4 orders ahead';
    if (status === 'appointment') return 'Tables booked 6:00 PM';
    return 'Tables available';
  }
  if (cat.includes('salon') || cat.includes('barber') || cat.includes('spa') || cat.includes('beauty')) {
    if (status === 'busy') return '3 clients waiting';
    if (status === 'appointment') return 'Next slot 2:30 PM';
    return 'Walk-ins welcome';
  }
  if (cat.includes('car wash') || cat.includes('detailing')) {
    if (status === 'busy') return '5 cars ahead';
    return 'Bay available now';
  }
  if (cat.includes('mechanic') || cat.includes('auto repair') || cat.includes('workshop')) {
    if (status === 'busy') return 'Next available 2 PM';
    return 'Drop-off welcome';
  }
  if (cat.includes('laundry') || cat.includes('dry cleaning')) {
    if (status === 'delivery') return 'Pickup window 4–6 PM';
    return 'Ready today by 5 PM';
  }
  if (cat.includes('tailor') || cat.includes('fashion')) {
    if (status === 'busy') return 'Production full this week';
    if (status === 'appointment') return 'Delivery tomorrow 3 PM';
    return 'Accepting orders';
  }
  if (cat.includes('hotel') || cat.includes('lodging') || cat.includes('guesthouse') || cat.includes('inn')) {
    if (status === 'busy') return 'Fully booked tonight';
    if (status === 'appointment') return 'Check-in 2 PM';
    return 'Rooms available';
  }
  if (cat.includes('hospital') || cat.includes('clinic') || cat.includes('dental') || cat.includes('vet')) {
    if (status === 'busy') return 'Doctor on duty';
    return 'Walk-in welcome';
  }
  if (cat.includes('real estate') || cat.includes('property') || cat.includes('estate agent')) {
    if (status === 'available') return 'Agent available now';
    if (status === 'busy') return 'Viewing today 3 PM';
    return 'Showings today';
  }
  if (status === 'busy') return 'Short wait — serving customers';
  if (status === 'available') return 'Available now';
  if (status === 'delivery') return 'Taking orders now';
  if (status === 'appointment') return 'By appointment';
  return null;
}

// --- Business Timeline ---------------------------------------------------------

export type TimelineKind = 'opened' | 'closed' | 'offer' | 'product' | 'live' | 'menu' | 'flash' | 'orders' | 'now';

export interface TimelineEvent {
  time: string;
  label: string;
  emoji: string;
  kind: TimelineKind;
}


export function buildBusinessTimeline(business: Business, config: BusinessClockConfig, now: Date): TimelineEvent[] {
  const day = now.getDay();
  const slot = config.autoHours[day] || { open: '', close: '', closed: true };
  const openAt = parseMinutes(slot.open);
  const closeAt = parseMinutes(slot.close);
  const mins = currentMinutes(now);
  const events: TimelineEvent[] = [];

  if (openAt !== null && !slot.closed && openAt >= 0) {
    events.push({ time: toTimeString(openAt), label: 'Opened for the day', emoji: '🟢', kind: 'opened' });
    // Two to four entries were drawn from TIMELINE_POOL here — "Received new
    // orders", "Posted an offer — Buy 2 Get 1 Free", "Started a live session".
    // A wrong number is bad; a fabricated activity LOG is worse, because it
    // tells an owner they did something they did not, and they go looking for
    // the orders. Real events come from loadTimelineEvents(); the only entries
    // built here are the ones derivable from the configured hours and the
    // current status.
    if (closeAt !== null && closeAt <= 1440) {
      events.push({ time: toTimeString(closeAt), label: 'Closed for the day', emoji: '🔚', kind: 'closed' });
    }
  }

  const filtered = events
    .filter((e) => parseMinutes(e.time) !== null && (parseMinutes(e.time) as number) <= mins)
    .sort((a, b) => (parseMinutes(a.time) as number) - (parseMinutes(b.time) as number));

  const status = resolveBusinessStatus(business, config, now);
  if (isBusinessOpen(status) && openAt !== null && !slot.closed && mins >= openAt) {
    filtered.push({ time: toTimeString(mins), label: 'Now — serving customers', emoji: '🔵', kind: 'now' });
  }
  return filtered;
}

export function timelineStorageKey(id: string): string {
  return `nowopen_businessTimeline_${id}`;
}

export function loadTimelineEvents(id: string): TimelineEvent[] {
  try {
    const raw = localStorage.getItem(timelineStorageKey(id));
    return raw ? (JSON.parse(raw) as TimelineEvent[]) : [];
  } catch {
    return [];
  }
}

export function saveTimelineEvents(id: string, events: TimelineEvent[]): void {
  try {
    localStorage.setItem(timelineStorageKey(id), JSON.stringify(events));
  } catch {
    // ignore storage failures
  }
}

export function toggleBusinessStatus(business: Business, now: Date): BusinessClockConfig {
  const config = loadClockConfig(business);
  const status = resolveBusinessStatus(business, config, now);
  const opening = !isBusinessOpen(status);
  const next: BusinessClockConfig = {
    ...config,
    manualOverride: opening ? 'open' : 'closed',
    lastOpenedAt: opening ? now.toISOString() : config.lastOpenedAt,
    laterReminderAt: opening ? null : config.laterReminderAt,
  };
  if (opening) {
    next.streakDays = (config.streakDays ?? 0) + 1;
    next.openedDays = (config.openedDays ?? 0) + 1;
  }
  const events = loadTimelineEvents(business.id);
  const stamp = toTimeString(currentMinutes(now));
  const existing = events.filter((e) => !((e.kind === 'opened' || e.kind === 'closed') && e.time === stamp));
  existing.push({
    time: stamp,
    label: opening ? 'Opened — you toggled the Business Clock ON' : 'Closed — you toggled the Business Clock OFF',
    emoji: opening ? '🟢' : '⚫',
    kind: opening ? 'opened' : 'closed',
  });
  saveTimelineEvents(business.id, existing);
  saveClockConfig(business.id, next);
  return next;
}

// --- Business Pulse ------------------------------------------------------------

export interface BusinessPulse {
  total: number;
  open: number;
  closed: number;
  /** Stored hours unparseable — we can't claim open or closed. */
  unconfirmed: number;
}

export function isOrderingCategory(category?: string): boolean {
  const cat = (category || '').toLowerCase();
  return ['restaurant', 'fast food', 'food vendor', 'suya', 'shawarma', 'food truck', 'bakery', 'café', 'retail', 'supermarket', 'grocery', 'electronics', 'pharmacy', 'boutique', 'clothing', 'jewelry'].some((k) => cat.includes(k));
}

/**
 * Directory-level rollup for VISITORS: open/closed come from each business's own
 * stored hours in its own timezone (resolvePublicStatus), never from a category
 * guess or the viewer's localStorage. Busy/Available/Live are owner signals and
 * don't exist on the public side, so they're not fabricated here.
 */
export function buildBusinessPulse(businesses: Business[], now: Date): BusinessPulse {
  const pulse: BusinessPulse = { total: 0, open: 0, closed: 0, unconfirmed: 0 };
  for (const b of businesses) {
    pulse.total += 1;
    const status = resolvePublicStatus(b, now);
    if (status === 'open') pulse.open += 1;
    else if (status === 'closed') pulse.closed += 1;
    else pulse.unconfirmed += 1;
  }
  return pulse;
}

// --- Scores ---------------------------------------------------------------------

/** Days opened on the trot, or null when nothing has counted them yet. */
export function getOpenStreak(_business: Business, config: BusinessClockConfig): number | null {
  if (config.openedDays === 0) return 0;
  if (typeof config.streakDays === 'number') return config.streakDays;
  // Was `1 + rng() * 47`, so a brand-new listing could greet its owner with a
  // 35-day opening streak it had never earned.
  return null;
}

/** Scheduled vs actual opening, or null when it has not been measured. */
export function getOpeningReliability(_business: Business, config: BusinessClockConfig): number | null {
  if (typeof config.reliabilityScore === 'number') return Math.max(0, Math.min(100, config.reliabilityScore));
  // Was `62 + rng() * 38`, i.e. never below 62% and never earned.
  return null;
}

export interface HealthPart {
  label: string;
  /** null = nothing measures this yet. Not the same as zero. */
  score: number | null;
}

export interface BusinessHealth {
  /** null when too little is measured to average honestly. */
  score: number | null;
  parts: HealthPart[];
}

/**
 * The profile fields the score is built from, each with the label an owner
 * would recognise.
 *
 * Named rather than counted so the dashboard can say WHICH fields are missing.
 * "Profile completeness 78%" tells an owner they have work to do without
 * telling them what it is; "add a website and a longer description" is the
 * same fact they can actually act on.
 */
const PROFILE_CHECKS: { label: string; has: (b: Business) => boolean }[] = [
  { label: 'Business name', has: (b) => Boolean(b.name) },
  { label: 'A description over 20 characters', has: (b) => Boolean(b.description && b.description.length > 20) },
  { label: 'A logo or cover image', has: (b) => Boolean(b.image_url || b.logo_url) },
  { label: 'Phone number', has: (b) => Boolean(b.phone) },
  { label: 'Location', has: (b) => Boolean(b.location) },
  { label: 'Website', has: (b) => Boolean(b.website) },
  { label: 'Category', has: (b) => Boolean(b.category) },
  { label: 'At least one review', has: (b) => Boolean(b.rating) },
  { label: 'Opening status', has: (b) => Boolean(b.status) },
];

/** Which profile fields are still empty, in the order an owner should fill them. */
export function profileGaps(business: Business): string[] {
  return PROFILE_CHECKS.filter((c) => !c.has(business)).map((c) => c.label);
}

function profileCompleteness(business: Business): number {
  const done = PROFILE_CHECKS.filter((c) => c.has(business)).length;
  return Math.round((done / PROFILE_CHECKS.length) * 100);
}

/**
 * The owner-facing health breakdown.
 *
 * Five of these eight rows used to be `Math.floor(rng() * n)` — response time,
 * promotions, live sessions, activity, and orders & bookings were invented, and
 * the headline percentage was their average with the three real ones. Because
 * the generator was seeded from the business id the numbers were STABLE, which
 * is worse than visibly random: they read as a tracked measurement that simply
 * was not moving. An owner would have read "Response time 68%" on an account
 * with no enquiries at all and gone looking for what to fix.
 *
 * A row with no data source now returns null and the UI says so. The headline
 * averages only what is actually measured, and reports nothing at all if fewer
 * than two rows are known — an "average" of one number is not a health score.
 * This is the rule the public Trust Panel already follows; the dashboard an
 * owner makes decisions from should not be held to a lower standard.
 */
export function getBusinessHealth(business: Business, config: BusinessClockConfig): BusinessHealth {
  const reviews = typeof business.rating === 'number' && business.rating > 0
    ? Math.round((business.rating / 5) * 100)
    : null;
  const parts: HealthPart[] = [
    { label: 'Profile completeness', score: profileCompleteness(business) },
    { label: 'Opening consistency', score: getOpeningReliability(business, config) },
    { label: 'Reviews', score: reviews },
    // No data source yet. Listed rather than dropped so the owner can see what
    // the platform intends to measure, and that it is not measuring it yet.
    { label: 'Response time', score: null },
    { label: 'Promotions', score: null },
    { label: 'Live sessions', score: null },
    { label: 'Activity', score: null },
    { label: 'Orders & bookings', score: null },
  ];
  const known = parts.filter((p): p is HealthPart & { score: number } => p.score !== null);
  const score = known.length >= 2
    ? Math.round(known.reduce((sum, p) => sum + p.score, 0) / known.length)
    : null;
  return { score, parts };
}

export function healthLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Needs attention';
  return 'Critical';
}

// --- Smart Reminder & Coach ------------------------------------------------------

export interface SmartReminder {
  prompt: string;
  note: string;
  options: { label: string; value: 'open' | 'later' | 'closed' }[];
}

export function getSmartReminder(business: Business, config: BusinessClockConfig, now: Date): SmartReminder | null {
  const day = now.getDay();
  const slot = config.autoHours[day] || { open: '', close: '', closed: true };
  const openAt = parseMinutes(slot.open);
  if (openAt === null || slot.closed) return null;
  if (currentMinutes(now) <= openAt + 15) return null;
  const status = resolveBusinessStatus(business, config, now);
  if (isBusinessOpen(status)) return null;
  if (config.dismissedReminderDate === dateKey(now)) return null;
  if (config.laterReminderAt && new Date(config.laterReminderAt).getTime() > now.getTime()) return null;
  return {
    prompt: 'Are you open today?',
    note: `You were scheduled to open at ${formatMinutes(openAt)}.`,
    options: [
      { label: 'YES', value: 'open' },
      { label: 'Open 30 mins later', value: 'later' },
      { label: 'Closed today', value: 'closed' },
    ],
  };
}

export function pendingScheduledOpen(config: BusinessClockConfig, now: Date): { at: Date; minsFromNow: number } | null {
  if (!config.laterReminderAt) return null;
  const at = new Date(config.laterReminderAt);
  const diff = at.getTime() - now.getTime();
  if (diff <= 0) return null;
  return { at, minsFromNow: Math.ceil(diff / 60000) };
}

export function applyReminderOption(business: Business, config: BusinessClockConfig, value: 'open' | 'later' | 'closed', now: Date): BusinessClockConfig {
  const next: BusinessClockConfig = { ...config, laterReminderAt: null, dismissedReminderDate: dateKey(now) };
  const stamp = toTimeString(currentMinutes(now));
  const events = loadTimelineEvents(business.id).filter((e) => e.kind !== 'opened' && e.kind !== 'closed' && e.time !== stamp);
  if (value === 'open') {
    next.manualOverride = 'open';
    next.lastOpenedAt = now.toISOString();
    next.streakDays = (config.streakDays ?? 0) + 1;
    next.openedDays = (config.openedDays ?? 0) + 1;
    events.push({ time: stamp, label: 'Opened — Smart Reminder', emoji: '🟢', kind: 'opened' });
  } else if (value === 'later') {
    next.laterReminderAt = new Date(now.getTime() + 30 * 60000).toISOString();
    events.push({ time: stamp, label: 'Opening scheduled 30 mins from now', emoji: '⏰', kind: 'orders' });
  } else {
    next.manualOverride = 'closed';
    events.push({ time: stamp, label: 'Closed today — you told us you are closed', emoji: '⚫', kind: 'closed' });
  }
  saveTimelineEvents(business.id, events);
  saveClockConfig(business.id, next);
  return next;
}

export function getCoachReminder(business: Business, config: BusinessClockConfig, now: Date): { message: string; cta: string } | null {
  const status = resolveBusinessStatus(business, config, now);
  if (isBusinessOpen(status)) return null;
  const hour = now.getHours();
  if (hour < 8 || hour > 19) return null;
  const streak = getOpenStreak(business, config);
  if (streak !== null && streak >= 7) return null;
  // "3.8x more profile views" was asserted here as fact. There is no analytics
  // layer to have measured it, and a made-up multiplier is exactly the kind of
  // claim an owner would repeat to someone else. The nudge works without it.
  const tail = streak && streak > 0
    ? ` Open now to keep your ${streak}-day streak alive.`
    : ' Customers searching right now will see you as closed.';
  return {
    message: `You haven't opened today.${tail}`,
    cta: 'Open Now',
  };
}

// --- Staff clock-in --------------------------------------------------------------

export interface StaffState {
  available: number;
  total: number;
}

/**
 * Who is clocked in, or null when there is no roster.
 *
 * The headcount itself used to be invented (`2 + rng() * 13`), so the card
 * could tell a sole trader that 7 of their 12 staff were on duty.
 */
export function getStaffState(_business: Business, config: BusinessClockConfig): StaffState | null {
  const total = config.staffTotal;
  if (typeof total !== 'number' || total <= 0) return null;
  const available = typeof config.staffClockedIn === 'number'
    ? Math.max(0, Math.min(total, config.staffClockedIn))
    : 0;
  return { available, total };
}

// --- AI Opening Assistant & notifications ---------------------------------------

const OFFER_POOL = ['Buy 1 Get 1 Free', '20% off everything today', 'Free delivery on orders over ₦10,000', 'Complimentary item with any purchase', 'Flash sale — 30% off until 12 PM', '2-for-1 on selected items', 'Free consultation today'];

export interface AIOpeningPack {
  greeting: string;
  offer: string;
  instagramCaption: string;
  whatsappStatus: string;
  facebookPost: string;
  xPost: string;
  story: string;
  reel: string;
  email: string;
  sms: string;
  hashtags: string[];
}

export function getAIOpeningAssistant(business: Business, now: Date): AIOpeningPack {
  const rng = mulberry32(hashString(`${business.id}:${dateKey(now)}:opening`));
  const offer = pick(rng, OFFER_POOL);
  const name = business.name;
  const tagline = business.description ? business.description.split('.')[0].slice(0, 60) : 'quality you can trust';
  const greeting = `Good morning from ${name} ☀️ We're OPEN and ready for you today.`;
  const greeting2 = `Rise and shine! ${name} is officially open — ${tagline}.`;
  const greeting3 = `👋 ${name} is now open for the day. Come say hi!`;
  const stories = [greeting, greeting2, greeting3];
  const hashtags = [`#${name.replace(/[^a-zA-Z0-9]/g, '')}`, '#NowOpenAfrica', '#OpenNow', '#LocalBusiness'];
  return {
    greeting: stories[Math.floor(rng() * stories.length)],
    offer,
    instagramCaption: `${stories[Math.floor(rng() * stories.length)]}\n\nToday's offer: ${offer}.\n\n${hashtags.join(' ')}`,
    whatsappStatus: `🟢 ${name} is OPEN — ${offer}.`,
    facebookPost: `We're open! ${name} is serving customers today. ${offer}. Visit us or order now.`,
    xPost: `🟢 ${name} is OPEN now — ${offer}. ${hashtags.slice(0, 2).join(' ')}`,
    story: `${offer} — today only at ${name}! Tap to order.`,
    reel: `60s reel: morning rush at ${name}, ${offer} on screen, CTA "Order Now".`,
    email: `Subject: ${name} is open today\n\nHi friend,\n\n${stories[Math.floor(rng() * stories.length)]}\n\nToday's offer: ${offer}.\n\nSee you soon,\nThe ${name} team`,
    sms: `${name}: We're open today! ${offer}. Reply OPEN for today's menu.`,
    hashtags,
  };
}

export interface OpeningCampaign {
  title: string;
  flyerHeadline: string;
  posterHeadline: string;
  storyIdea: string;
  reelIdea: string;
  caption: string;
  hashtags: string[];
}

export function getOpeningCampaign(business: Business): OpeningCampaign {
  const rng = mulberry32(hashString(`${business.id}:campaign`));
  const offer = pick(rng, OFFER_POOL);
  const name = business.name;
  return {
    title: `Today's Opening Campaign — ${name}`,
    flyerHeadline: `${name} is OPEN 🟢`,
    posterHeadline: `OPEN NOW — ${offer}`,
    storyIdea: `Behind-the-scenes morning prep → doors open → first happy customer`,
    reelIdea: `POV: the first customer of the day walks in at ${name}`,
    caption: `We're live at ${name}! ${offer} today only. Tag a friend to join you.`,
    hashtags: ['#NowOpenAfrica', '#OpenNow', '#SupportLocal', `#${name.replace(/[^a-zA-Z0-9]/g, '')}`],
  };
}

export type NotificationKind = 'open' | 'live' | 'delivery' | 'product' | 'menu' | 'flash';

export function getNotificationCopy(kind: NotificationKind, business: Business): string {
  const name = business.name;
  const rng = mulberry32(hashString(`${business.id}:notif`));
  switch (kind) {
    case 'open':
      return `🟢 ${name} is now OPEN — ${pick(rng, OFFER_POOL)}`;
    case 'live':
      return `🔴 ${name} went LIVE — join the stream now`;
    case 'delivery':
      return `🟣 ${name} is taking orders — delivery active now`;
    case 'product':
      return `📦 ${name} just added a new product`;
    case 'menu':
      return `🍽️ ${name} updated their menu`;
    case 'flash':
      return `⚡ ${name} posted a FLASH deal — ${pick(rng, OFFER_POOL)}`;
    default:
      return `${name} has an update for you`;
  }
}
