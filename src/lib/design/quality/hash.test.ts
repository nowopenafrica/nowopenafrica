import { describe, expect, it } from 'vitest';

import { DESIGN_TEMPLATES, templateByKey } from '../../designTemplates';
import { contentHash, fnv1a64 } from './hash';

describe('contentHash', () => {
  it('is FNV-1a 64-bit over UTF-8, as 16 hex characters', () => {
    // Published FNV-1a 64 test vectors.
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });

  it('does not depend on key order', () => {
    const t = templateByKey('tiered-sale');
    const reordered = Object.fromEntries(Object.entries(t).reverse()) as typeof t;
    expect(contentHash(reordered)).toBe(contentHash(t));
  });

  it('changes when the template changes', () => {
    const t = templateByKey('tiered-sale');
    expect(contentHash({ ...t, slots: t.slots.map((s, i) => (i === 0 ? { ...s, x: s.x + 0.01 } : s)) }))
      .not.toBe(contentHash(t));
  });

  it('gives every code template its own hash', () => {
    const hashes = DESIGN_TEMPLATES.map(contentHash);
    for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(new Set(hashes).size).toBe(DESIGN_TEMPLATES.length);
  });
});
