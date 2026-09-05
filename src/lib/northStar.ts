/**
 * The one number, and the funnel underneath it.
 *
 * NORTH STAR: Weekly Meaningful Business Connections — the count of things a
 * visitor did that a business owner would recognise as a customer arriving.
 *
 * The point of writing it down here, in one tested module, is that the
 * definition cannot quietly drift into something flattering. Registrations,
 * page views and account totals are all excluded on purpose: 1,000 signups with
 * 20 connections is a weak week, and any metric that cannot say so is worse
 * than no metric.
 *
 * WHAT COUNTS AS A CONNECTION
 *   a call, a WhatsApp, an email or a website click
 *   directions opened
 *   an enquiry sent
 *   a booking started
 *   a Keep
 *
 * NOT AN OFFER CLAIM, because there is no such action: offers render on the
 * Offers page and on profiles with no button, link or handler anywhere. A
 * metric that can never move reads as failure rather than as absence, so it is
 * left out until a visitor can actually act on an offer.
 *
 * WHAT DOES NOT
 *   business_viewed — attention, not contact. A listing can be looked at all
 *     day and earn nothing, and that difference is the entire question.
 *   search_performed — intent, and useful, but it is the top of the funnel.
 *   signup / signin — an account is not a customer.
 *   anything the platform does to itself (imports, workforce runs, admin edits).
 */

export type ConnectionKind =
  | 'call' | 'whatsapp' | 'email' | 'website'
  | 'directions' | 'enquiry' | 'booking' | 'keep';

/** The raw shape read from analytics_events. Loose on purpose — it is data. */
export interface RawEvent {
  name: string;
  props?: Record<string, unknown> | null;
  business_id?: string | null;
  user_id?: string | null;
  session_id?: string | null;
  created_at: string;
}

/**
 * Which connection, if any, an event represents.
 *
 * Returns null for everything else rather than throwing. The events table
 * outlives any one build and will contain names this code has never heard of.
 */
export function connectionKind(e: RawEvent): ConnectionKind | null {
  switch (e.name) {
    case 'business_contact_clicked': {
      const channel = e.props?.channel;
      if (channel === 'phone') return 'call';
      if (channel === 'whatsapp') return 'whatsapp';
      if (channel === 'email') return 'email';
      if (channel === 'website') return 'website';
      // A contact click with no channel is still a contact click. Dropping it
      // would undercount a real connection because of a missing prop.
      return 'call';
    }
    case 'directions_opened': return 'directions';
    case 'enquiry_sent': return 'enquiry';
    case 'booking_started': return 'booking';
    case 'business_kept': return 'keep';
    default: return null;
  }
}

export const isConnection = (e: RawEvent): boolean => connectionKind(e) !== null;

/** Monday-based week key, e.g. "2026-08-31". Local time, per the platform rule. */
export function weekStart(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${monday.getFullYear()}-${p(monday.getMonth() + 1)}-${p(monday.getDate())}`;
}

export interface WeekConnections {
  week: string;
  total: number;
  /** How many distinct businesses earned at least one. Breadth, not just volume. */
  businesses: number;
  byKind: Record<ConnectionKind, number>;
}

const emptyKinds = (): Record<ConnectionKind, number> => ({
  call: 0, whatsapp: 0, email: 0, website: 0,
  directions: 0, enquiry: 0, booking: 0, keep: 0,
});

/**
 * Connections per week, newest last.
 *
 * `businesses` matters as much as `total`: 400 connections spread across 80
 * listings is a network, and 400 against three listings is three lucky
 * businesses. A single total cannot tell those apart.
 */
export function weeklyConnections(events: RawEvent[], weeks = 8): WeekConnections[] {
  const buckets = new Map<string, { total: number; ids: Set<string>; byKind: Record<ConnectionKind, number> }>();

  for (const e of events) {
    const kind = connectionKind(e);
    if (!kind) continue;
    const wk = weekStart(e.created_at);
    if (!wk) continue;
    let b = buckets.get(wk);
    if (!b) { b = { total: 0, ids: new Set(), byKind: emptyKinds() }; buckets.set(wk, b); }
    b.total += 1;
    b.byKind[kind] += 1;
    if (e.business_id) b.ids.add(e.business_id);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-weeks)
    .map(([week, b]) => ({ week, total: b.total, businesses: b.ids.size, byKind: b.byKind }));
}

/** Change against the previous week. null when there is nothing to compare to. */
export function weekOnWeek(series: WeekConnections[]): number | null {
  if (series.length < 2) return null;
  const prev = series[series.length - 2].total;
  const now = series[series.length - 1].total;
  if (prev === 0) return now === 0 ? 0 : null;
  return Math.round(((now - prev) / prev) * 100);
}

/* -------------------------------------------------------------------------- */

/** What a business looks like to the funnel. Mapped by the caller from a row. */
export interface FunnelBusiness {
  id: string;
  claim_status?: string | null;
  description?: string | null;
  logo_url?: string | null;
  image_url?: string | null;
  category?: string | null;
  location?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  /** Free-text opening hours. Either column counts — both are in use. */
  opening_hours?: string | null;
  hours?: string | null;
  about?: string | null;
  story?: string | null;
  email_verified?: boolean | null;
  phone_verified?: boolean | null;
  /** Offers published by this business. Counted by the caller. */
  offers?: number;
}

export interface FunnelStage {
  key: string;
  label: string;
  /** How many businesses have reached this stage. */
  count: number;
  /** Share of the cohort, 0-100. */
  percent: number;
  /** What to do about it when the number is low. */
  action: string;
}

const has = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim().length > 0 : !!v;

/**
 * The activation funnel — the eleven questions that actually say whether the
 * platform works, in the order a business passes through them.
 *
 * Deliberately a funnel over BUSINESSES, not over accounts. An account that
 * never became a listing anyone can find is not a step towards anything.
 */
export function activationFunnel(
  businesses: FunnelBusiness[],
  events: RawEvent[],
  keepsByBusiness: Record<string, number> = {},
): FunnelStage[] {
  const total = businesses.length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  // Index the events once; a per-stage scan would be quadratic on real volume.
  const viewed = new Set<string>();
  const contacted = new Set<string>();
  const enquired = new Set<string>();
  const booked = new Set<string>();
  for (const e of events) {
    const id = e.business_id;
    if (!id) continue;
    if (e.name === 'business_viewed') viewed.add(id);
    const kind = connectionKind(e);
    if (kind === 'enquiry') enquired.add(id);
    else if (kind === 'booking') booked.add(id);
    else if (kind) contacted.add(id);
  }

  const count = (fn: (b: FunnelBusiness) => boolean) => businesses.filter(fn).length;

  const stages: Array<[string, string, number, string]> = [
    ['listed', 'Listed', total,
      'Every business on the platform, claimed or not.'],
    ['claimed', 'Claimed by its owner', count((b) => b.claim_status === 'claimed'),
      'Unclaimed listings cannot be kept accurate. Claiming is the whole funnel.'],
    ['described', 'Has a description and category', count((b) => has(b.description) && has(b.category)),
      'Without these a listing cannot be found by what it does.'],
    ['contactable', 'Has a phone and a location', count((b) => has(b.phone) && has(b.location)),
      'A listing nobody can reach or reach for cannot produce a connection.'],
    ['hours', 'Has opening hours', count((b) => has(b.opening_hours) || has(b.hours)),
      'No hours means no Open Now — the thing the name promises.'],
    ['photos', 'Has a logo or photo', count((b) => has(b.logo_url) || has(b.image_url)),
      'A page with no images is skipped, however good the information is.'],
    ['whatsapp', 'Reachable on WhatsApp', count((b) => has(b.whatsapp)),
      'The channel most customers here actually use. A missing number is a lost connection, not a cosmetic gap.'],
    ['depth', 'Has an about or story', count((b) => has(b.about) || has(b.story)),
      'The difference between a listing and a business worth choosing.'],
    ['verified', 'Verified', count((b) => !!b.email_verified && !!b.phone_verified),
      'Trust claims are earned here and nowhere else.'],
    ['viewed', 'Received a visitor', businesses.filter((b) => viewed.has(b.id)).length,
      'If this is low the problem is discovery, not the listing.'],
    ['kept', 'Received a Keep', businesses.filter((b) => (keepsByBusiness[b.id] ?? 0) > 0).length,
      'A Keep is the return mechanism. Without it every visit starts from zero.'],
    ['connected', 'Received a call, WhatsApp or directions',
      businesses.filter((b) => contacted.has(b.id)).length,
      'This is the North Star at the level of one business.'],
    ['enquired', 'Received an enquiry or booking',
      businesses.filter((b) => enquired.has(b.id) || booked.has(b.id)).length,
      'The deepest signal available before money changes hands.'],
    ['offering', 'Published an offer', count((b) => (b.offers ?? 0) > 0),
      'An offer is a business choosing to use the platform, not just sit on it.'],
  ];

  return stages.map(([key, label, n, action]) => ({
    key, label, count: n, percent: pct(n), action,
  }));
}

/**
 * The honest one-line reading of where the platform is.
 *
 * Exists so nobody has to interpret a chart to know whether the loop is
 * working, and so a zero is stated as a zero.
 */
export function verdict(series: WeekConnections[], funnel: FunnelStage[]): string {
  const latest = series[series.length - 1];
  const claimed = funnel.find((s) => s.key === 'claimed')?.count ?? 0;
  if (!latest || latest.total === 0) {
    return claimed === 0
      ? 'No connections, and no business has claimed its listing. Nothing is being measured yet because nothing is happening yet.'
      : `No connections this week across ${claimed} claimed business(es). The loop is not running.`;
  }
  return `${latest.total} connection(s) this week across ${latest.businesses} business(es).`;
}
