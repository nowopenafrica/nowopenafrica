// The customers a business already has.
//
// WHY THERE IS NO customers TABLE
//
// Every booking and every enquiry already carries a name, an email and usually
// a phone number. The people are in the database; nothing had ever gathered
// them up. Adding a `customers` table would mean a migration to apply, a
// synchronisation problem between it and the bookings it duplicates, and an
// empty screen on day one while it filled.
//
// Deriving them instead means a business that has taken two bookings has two
// customers the moment this ships, and there is exactly one source of truth for
// who they are: what they actually did.
//
// The cost is that this cannot store anything a business types about a
// customer — no notes, no tags, no consent record. When that is wanted it needs
// a real table, and it should reference these records rather than replace them.
//
// Everything here is pure, so the identity resolution and the segment rules —
// the parts with the edge cases — are testable without a database.

import { localDateISO } from './dates';

export interface BookingRow {
  id: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  item_name?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface EnquiryRow {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  context?: string | null;
  created_at?: string | null;
}

export interface ReviewRow {
  id: string;
  author_name?: string | null;
  rating?: number | null;
  created_at?: string | null;
}

export interface Customer {
  /** Stable within one business: the normalised email, else the phone. */
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  bookings: number;
  enquiries: number;
  reviews: number;
  /** Everything they ever did here, newest first. */
  interactions: number;
  firstSeen: string | null;
  lastSeen: string | null;
  /** Item names from their bookings, newest first, de-duplicated. */
  bought: string[];
  /** True when at least one booking was confirmed rather than just requested. */
  converted: boolean;
}

// --- Identity -----------------------------------------------------------------

/**
 * The key two records must share to be the same person.
 *
 * Email first, lower-cased and trimmed, because it is the field both bookings
 * and enquiries require. Phone is the fallback and is reduced to digits, since
 * the same person types "0803 123 4567", "08031234567" and "+234 803 123 4567"
 * on different days and all three are one customer.
 *
 * Names are deliberately NOT used. Two different Chidis in Lagos are two
 * customers, and merging them would put one person's history in front of
 * another — worse than showing them separately.
 */
export function identityKey(email?: string | null, phone?: string | null): string | null {
  const e = (email || '').trim().toLowerCase();
  if (e && e.includes('@')) return `e:${e}`;
  const digits = (phone || '').replace(/\D/g, '');
  // Local and international forms of one Nigerian number differ only in the
  // leading 0 vs 234; comparing the last nine digits makes them equal without
  // assuming a country.
  if (digits.length >= 9) return `p:${digits.slice(-9)}`;
  return null;
}

const newer = (a: string | null, b: string | null): string | null => {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
};

const older = (a: string | null, b: string | null): string | null => {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) < new Date(b) ? a : b;
};

/**
 * Gather every interaction into one record per person.
 *
 * Reviews are counted but cannot be identified: business_reviews stores a
 * user_id and an author_name, with no email or phone, so a review can only be
 * attached to a customer already known by name from a booking. That is a real
 * limit rather than a bug — matching on name alone would merge strangers.
 */
export function buildCustomers(
  bookings: BookingRow[] = [],
  enquiries: EnquiryRow[] = [],
  reviews: ReviewRow[] = [],
): Customer[] {
  const map = new Map<string, Customer>();

  const touch = (
    key: string, name: string, email: string | null, phone: string | null, at: string | null,
  ): Customer => {
    const existing = map.get(key);
    if (existing) {
      // Keep the fullest contact details seen — a later booking may add the
      // phone number an earlier enquiry lacked.
      existing.email = existing.email || email;
      existing.phone = existing.phone || phone;
      if (name && name.length > existing.name.length) existing.name = name;
      existing.firstSeen = older(existing.firstSeen, at);
      existing.lastSeen = newer(existing.lastSeen, at);
      return existing;
    }
    const created: Customer = {
      key, name: name || 'Customer', email, phone,
      bookings: 0, enquiries: 0, reviews: 0, interactions: 0,
      firstSeen: at, lastSeen: at, bought: [], converted: false,
    };
    map.set(key, created);
    return created;
  };

  for (const b of bookings) {
    const key = identityKey(b.customer_email, b.customer_phone);
    if (!key) continue;
    const c = touch(key, (b.customer_name || '').trim(), (b.customer_email || '').trim() || null, (b.customer_phone || '').trim() || null, b.created_at ?? null);
    c.bookings += 1;
    c.interactions += 1;
    if (b.status === 'confirmed') c.converted = true;
    const item = (b.item_name || '').trim();
    if (item && !c.bought.includes(item)) c.bought.push(item);
  }

  for (const e of enquiries) {
    const key = identityKey(e.email, e.phone);
    if (!key) continue;
    const c = touch(key, (e.name || '').trim(), (e.email || '').trim() || null, (e.phone || '').trim() || null, e.created_at ?? null);
    c.enquiries += 1;
    c.interactions += 1;
  }

  // Reviews attach only where the name already matches a known customer. See
  // the note above buildCustomers.
  const byName = new Map<string, Customer>();
  for (const c of map.values()) {
    const n = c.name.trim().toLowerCase();
    if (n && !byName.has(n)) byName.set(n, c);
  }
  for (const r of reviews) {
    const c = byName.get((r.author_name || '').trim().toLowerCase());
    if (!c) continue;
    c.reviews += 1;
    c.interactions += 1;
    c.lastSeen = newer(c.lastSeen, r.created_at ?? null);
  }

  return [...map.values()].sort((a, b) => {
    const at = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
    const bt = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
    return bt - at;
  });
}

// --- Segments -----------------------------------------------------------------

export type SegmentKey = 'all' | 'new' | 'returning' | 'vip' | 'lapsed';

/**
 * The thresholds, named so they can be argued with.
 *
 * Deliberately plain counts and days rather than a score: an owner has to be
 * able to look at a customer and see why they are in a segment, otherwise the
 * segment is not something they will act on.
 */
export const NEW_WITHIN_DAYS = 30;
export const VIP_INTERACTIONS = 4;
export const LAPSED_AFTER_DAYS = 90;

export const SEGMENTS: { key: SegmentKey; label: string; blurb: string }[] = [
  { key: 'all', label: 'Everyone', blurb: 'Every person who has booked, enquired or reviewed.' },
  { key: 'new', label: 'New', blurb: `First came in the last ${NEW_WITHIN_DAYS} days.` },
  { key: 'returning', label: 'Returning', blurb: 'Have come back more than once.' },
  { key: 'vip', label: 'VIP', blurb: `${VIP_INTERACTIONS} or more interactions.` },
  { key: 'lapsed', label: 'Lapsed', blurb: `Nothing for ${LAPSED_AFTER_DAYS} days.` },
];

const daysSince = (iso: string | null, now: Date): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
};

/**
 * Which segments a customer belongs to.
 *
 * A person can be in several — a VIP who has not been seen for four months is
 * both VIP and lapsed, and that combination is exactly the one worth a message.
 * Forcing a single label would hide it.
 */
export function segmentsFor(c: Customer, now: Date = new Date()): SegmentKey[] {
  const out: SegmentKey[] = ['all'];
  const sinceFirst = daysSince(c.firstSeen, now);
  const sinceLast = daysSince(c.lastSeen, now);

  if (sinceFirst !== null && sinceFirst <= NEW_WITHIN_DAYS) out.push('new');
  if (c.interactions > 1) out.push('returning');
  if (c.interactions >= VIP_INTERACTIONS) out.push('vip');
  if (sinceLast !== null && sinceLast > LAPSED_AFTER_DAYS) out.push('lapsed');
  return out;
}

export const inSegment = (c: Customer, segment: SegmentKey, now?: Date): boolean =>
  segmentsFor(c, now).includes(segment);

export function segmentCounts(customers: Customer[], now: Date = new Date()): Record<SegmentKey, number> {
  const counts: Record<SegmentKey, number> = { all: 0, new: 0, returning: 0, vip: 0, lapsed: 0 };
  for (const c of customers) for (const s of segmentsFor(c, now)) counts[s] += 1;
  return counts;
}

// --- Finding and reaching them ------------------------------------------------

/** Name, email, phone or something they bought. */
export function searchCustomers(customers: Customer[], query: string): Customer[] {
  const q = query.trim().toLowerCase();
  if (!q) return customers;
  return customers.filter((c) =>
    c.name.toLowerCase().includes(q)
    || (c.email || '').toLowerCase().includes(q)
    || (c.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || ' ')
    || c.bought.some((b) => b.toLowerCase().includes(q)));
}

/** Rough "last seen" wording for a list row. */
export function lastSeenLabel(c: Customer, now: Date = new Date()): string {
  const d = daysSince(c.lastSeen, now);
  if (d === null) return 'Date unknown';
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.round(d / 30)} months ago`;
  return `${Math.round(d / 365)} years ago`;
}

/**
 * A message opener for one customer.
 *
 * Names them and refers to what they actually bought, because a message that
 * could have been sent to anyone reads as a broadcast and gets ignored. Nothing
 * here invents a discount — the owner writes the offer.
 */
export function messageOpener(businessName: string, c: Customer): string {
  const first = c.name.split(/\s+/)[0] || 'there';
  const item = c.bought[0];
  if (item) return `Hi ${first}, it's ${businessName}. You ordered ${item} with us before — `;
  return `Hi ${first}, it's ${businessName}. Thanks for getting in touch before — `;
}

/** Today, for stamping an export. */
export const crmToday = (): string => localDateISO();
