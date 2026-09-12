import { describe, it, expect } from 'vitest';

import {
  ORDER_REFERENCE_PATTERN, ORDER_REFERENCE_SQL, generateOrderReference,
  isOrderReference, normaliseOrderReference, orderTrackPath,
} from './reference';

describe('the reference is a credential, not a label', () => {
  it('is unguessable enough that references cannot be walked', () => {
    // 10 characters from a 32-character alphabet is 50 bits. What matters is
    // that this stays true: shortening it would turn the tracking page into a
    // way to read strangers' orders.
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i += 1) seen.add(generateOrderReference());
    expect(seen.size).toBe(2000);
  });

  it('always matches the shape the database enforces', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(generateOrderReference()).toMatch(ORDER_REFERENCE_PATTERN);
    }
  });

  it('uses no character that can be misread when it is spoken', () => {
    // I/1, L/1, O/0 and U/V are the pairs people get wrong reading a code down
    // a phone. A reference nobody can dictate is a reference nobody can use.
    const body = Array.from({ length: 300 }, generateOrderReference)
      .map((r) => r.slice(4).replace('-', ''))
      .join('');
    expect(body).not.toMatch(/[ILOU]/);
  });

  it('keeps the browser pattern and the Postgres pattern identical', () => {
    // They are enforced in two places; if they drift, the database starts
    // rejecting references the client has already shown somebody.
    expect(ORDER_REFERENCE_PATTERN.source).toBe(ORDER_REFERENCE_SQL);
  });
});

describe('what somebody types back is forgiven', () => {
  it('accepts lower case, spaces and missing dashes', () => {
    const ref = generateOrderReference();
    const mangled = ref.toLowerCase().replace(/-/g, ' ');
    expect(normaliseOrderReference(mangled)).toBe(ref);
  });

  it('maps the characters the alphabet deliberately excludes', () => {
    // Nobody typing O into a reference meant anything but zero, because O is
    // not in the alphabet at all.
    expect(normaliseOrderReference('noc-O1234-5678L')).toBe('NOC-01234-56781');
  });

  it('does not invent a reference out of something that is not one', () => {
    expect(isOrderReference(normaliseOrderReference('hello'))).toBe(false);
    expect(isOrderReference(normaliseOrderReference(''))).toBe(false);
    expect(isOrderReference(normaliseOrderReference('NOC-123'))).toBe(false);
  });

  it('is idempotent', () => {
    const once = normaliseOrderReference('noc 8h3km 2qw9t');
    expect(normaliseOrderReference(once)).toBe(once);
  });
});

describe('the link back', () => {
  it('points at the tracking route', () => {
    expect(orderTrackPath('NOC-8H3KM-2QW9T')).toBe('/order/NOC-8H3KM-2QW9T');
  });

  it('escapes anything that is not a reference', () => {
    expect(orderTrackPath('a/../b')).not.toContain('/../');
  });
});
