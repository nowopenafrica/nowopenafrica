import { describe, it, expect } from 'vitest';

import {
  identityKey, buildCustomers, segmentsFor, inSegment, segmentCounts,
  searchCustomers, lastSeenLabel, messageOpener,
  NEW_WITHIN_DAYS, VIP_INTERACTIONS, LAPSED_AFTER_DAYS,
  type BookingRow, type EnquiryRow, type ReviewRow,
} from './crm';

const NOW = new Date('2026-08-28T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const booking = (over: Partial<BookingRow> = {}): BookingRow => ({
  id: Math.random().toString(36).slice(2),
  customer_name: 'Chidi Okafor',
  customer_email: 'chidi@example.com',
  customer_phone: '08031234567',
  item_name: 'Jollof platter',
  status: 'pending',
  created_at: daysAgo(5),
  ...over,
});

describe('identityKey', () => {
  it('keys on the email, normalised', () => {
    expect(identityKey('  Chidi@Example.COM ', null)).toBe('e:chidi@example.com');
  });

  it('falls back to the phone, ignoring how it was typed', () => {
    // The same person types all of these on different days.
    const forms = ['0803 123 4567', '08031234567', '+234 803 123 4567', '234-803-123-4567'];
    const keys = forms.map((p) => identityKey(null, p));
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^p:/);
  });

  it('prefers email over phone so one person keys consistently', () => {
    expect(identityKey('a@b.com', '08031234567')).toBe('e:a@b.com');
  });

  it('refuses to identify someone it cannot', () => {
    // No key means the record is skipped rather than merged into a bucket of
    // anonymous strangers.
    expect(identityKey(null, null)).toBeNull();
    expect(identityKey('not-an-email', '12345')).toBeNull();
    expect(identityKey('', '')).toBeNull();
  });

  it('never keys on a name', () => {
    // Two different Chidis in Lagos are two customers. Merging them would put
    // one person's history in front of another.
    expect(identityKey(null, null)).toBeNull();
  });
});

describe('buildCustomers', () => {
  it('turns bookings into people', () => {
    const list = buildCustomers([booking()]);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Chidi Okafor');
    expect(list[0].bookings).toBe(1);
    expect(list[0].bought).toEqual(['Jollof platter']);
  });

  it('merges a repeat customer into one record', () => {
    const list = buildCustomers([
      booking({ created_at: daysAgo(40), item_name: 'Jollof platter' }),
      booking({ created_at: daysAgo(3), item_name: 'Egusi' }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].bookings).toBe(2);
    expect(list[0].bought).toEqual(['Jollof platter', 'Egusi']);
    expect(list[0].firstSeen).toBe(daysAgo(40));
    expect(list[0].lastSeen).toBe(daysAgo(3));
  });

  it('merges a booking and an enquiry from the same person', () => {
    const enquiry: EnquiryRow = {
      id: 'e1', name: 'Chidi Okafor', email: 'CHIDI@example.com', phone: null,
      context: 'Catering', created_at: daysAgo(1),
    };
    const list = buildCustomers([booking()], [enquiry]);
    expect(list).toHaveLength(1);
    expect(list[0].bookings).toBe(1);
    expect(list[0].enquiries).toBe(1);
    expect(list[0].interactions).toBe(2);
  });

  it('fills in contact details a later record adds', () => {
    const list = buildCustomers([
      booking({ customer_phone: null, created_at: daysAgo(10) }),
      booking({ customer_phone: '08031234567', created_at: daysAgo(2) }),
    ]);
    expect(list[0].phone).toBe('08031234567');
  });

  it('does not duplicate an item they ordered twice', () => {
    const list = buildCustomers([booking(), booking()]);
    expect(list[0].bought).toEqual(['Jollof platter']);
  });

  it('marks a customer converted once a booking is confirmed', () => {
    expect(buildCustomers([booking()])[0].converted).toBe(false);
    expect(buildCustomers([booking({ status: 'confirmed' })])[0].converted).toBe(true);
  });

  it('skips records it cannot identify rather than inventing a customer', () => {
    const list = buildCustomers([booking({ customer_email: null, customer_phone: null })]);
    expect(list).toEqual([]);
  });

  it('attaches a review only when the name already matches a known customer', () => {
    // business_reviews carries no email or phone, so this is as far as honest
    // matching goes.
    const reviews: ReviewRow[] = [
      { id: 'r1', author_name: 'Chidi Okafor', rating: 5, created_at: daysAgo(1) },
      { id: 'r2', author_name: 'A Stranger', rating: 1, created_at: daysAgo(1) },
    ];
    const list = buildCustomers([booking()], [], reviews);
    expect(list).toHaveLength(1);
    expect(list[0].reviews).toBe(1);
  });

  it('sorts the most recently seen first', () => {
    const list = buildCustomers([
      booking({ customer_email: 'old@x.com', created_at: daysAgo(100) }),
      booking({ customer_email: 'new@x.com', created_at: daysAgo(1) }),
    ]);
    expect(list.map((c) => c.email)).toEqual(['new@x.com', 'old@x.com']);
  });

  it('copes with empty inputs', () => {
    expect(buildCustomers()).toEqual([]);
    expect(buildCustomers([], [], [])).toEqual([]);
  });
});

describe('segments', () => {
  const one = (over: Partial<BookingRow>[]) => buildCustomers(over.map((o) => booking(o)))[0];

  it('calls a first-timer new', () => {
    const c = one([{ created_at: daysAgo(3) }]);
    expect(segmentsFor(c, NOW)).toContain('new');
    expect(segmentsFor(c, NOW)).not.toContain('returning');
  });

  it('stops calling them new after the window', () => {
    const c = one([{ created_at: daysAgo(NEW_WITHIN_DAYS + 1) }]);
    expect(segmentsFor(c, NOW)).not.toContain('new');
  });

  it('calls anyone who came back returning', () => {
    const c = one([{ created_at: daysAgo(40) }, { created_at: daysAgo(2) }]);
    expect(segmentsFor(c, NOW)).toContain('returning');
  });

  it('calls a frequent customer VIP', () => {
    const c = one(Array.from({ length: VIP_INTERACTIONS }, () => ({ created_at: daysAgo(2) })));
    expect(segmentsFor(c, NOW)).toContain('vip');
  });

  it('calls someone lapsed once they have been away long enough', () => {
    const c = one([{ created_at: daysAgo(LAPSED_AFTER_DAYS + 5) }]);
    expect(segmentsFor(c, NOW)).toContain('lapsed');
  });

  it('lets a customer be in several at once', () => {
    // A VIP who has not been seen for four months is both, and that
    // combination is exactly the one worth a message. A single label
    // would hide it.
    const c = one(Array.from({ length: VIP_INTERACTIONS }, () => ({ created_at: daysAgo(LAPSED_AFTER_DAYS + 10) })));
    const segs = segmentsFor(c, NOW);
    expect(segs).toContain('vip');
    expect(segs).toContain('lapsed');
  });

  it('puts everyone in "all"', () => {
    expect(segmentsFor(one([{}]), NOW)).toContain('all');
  });

  it('counts each segment', () => {
    const customers = buildCustomers([
      booking({ customer_email: 'a@x.com', created_at: daysAgo(2) }),
      booking({ customer_email: 'b@x.com', created_at: daysAgo(200) }),
    ]);
    const counts = segmentCounts(customers, NOW);
    expect(counts.all).toBe(2);
    expect(counts.new).toBe(1);
    expect(counts.lapsed).toBe(1);
  });

  it('inSegment agrees with segmentsFor', () => {
    const c = one([{ created_at: daysAgo(2) }]);
    expect(inSegment(c, 'new', NOW)).toBe(true);
    expect(inSegment(c, 'lapsed', NOW)).toBe(false);
  });
});

describe('searchCustomers', () => {
  const customers = buildCustomers([
    booking({ customer_name: 'Chidi Okafor', customer_email: 'chidi@example.com', item_name: 'Jollof platter' }),
    booking({ customer_name: 'Amaka Eze', customer_email: 'amaka@example.com', customer_phone: '08099887766', item_name: 'Egusi' }),
  ]);

  it('finds by name, email and item', () => {
    expect(searchCustomers(customers, 'amaka')).toHaveLength(1);
    expect(searchCustomers(customers, 'chidi@')).toHaveLength(1);
    expect(searchCustomers(customers, 'jollof')).toHaveLength(1);
  });

  it('finds by phone however it is typed', () => {
    expect(searchCustomers(customers, '0809 988 7766')).toHaveLength(1);
  });

  it('returns everyone for an empty query', () => {
    expect(searchCustomers(customers, '   ')).toHaveLength(2);
  });
});

describe('lastSeenLabel', () => {
  const at = (iso: string | null) => ({ lastSeen: iso } as Parameters<typeof lastSeenLabel>[0]);

  it('reads the way a person would say it', () => {
    expect(lastSeenLabel(at(daysAgo(0)), NOW)).toBe('Today');
    expect(lastSeenLabel(at(daysAgo(1)), NOW)).toBe('Yesterday');
    expect(lastSeenLabel(at(daysAgo(5)), NOW)).toBe('5 days ago');
    expect(lastSeenLabel(at(daysAgo(60)), NOW)).toBe('2 months ago');
    expect(lastSeenLabel(at(daysAgo(400)), NOW)).toBe('1 years ago');
  });

  it('says so rather than guessing when there is no date', () => {
    expect(lastSeenLabel(at(null), NOW)).toBe('Date unknown');
  });
});

describe('messageOpener', () => {
  it('names them and what they bought, so it does not read as a broadcast', () => {
    const c = buildCustomers([booking()])[0];
    const text = messageOpener('Mama Put Kitchen', c);
    expect(text).toContain('Chidi');
    expect(text).toContain('Mama Put Kitchen');
    expect(text).toContain('Jollof platter');
  });

  it('does not invent an offer — the owner writes that', () => {
    const c = buildCustomers([booking()])[0];
    expect(messageOpener('X', c)).not.toMatch(/\d+%|discount|free/i);
  });

  it('copes with an enquiry-only contact who bought nothing', () => {
    const c = buildCustomers([], [{ id: 'e', name: 'Amaka Eze', email: 'a@x.com', created_at: daysAgo(1) }])[0];
    expect(messageOpener('X', c)).toContain('Amaka');
  });
});
