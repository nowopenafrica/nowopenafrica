import { describe, expect, it } from 'vitest';

import { DESIGN_TEMPLATES } from '../designTemplates';
import { isListed } from './needs';
import { COLLECTIONS, MAX_COLLECTIONS, resolveCollections } from './collections';

const LISTED = DESIGN_TEMPLATES.filter(isListed);

describe('featured collections', () => {
  it('seeds at most two, with unique keys', () => {
    expect(COLLECTIONS.length).toBeGreaterThan(0);
    expect(COLLECTIONS.length).toBeLessThanOrEqual(MAX_COLLECTIONS);
    expect(MAX_COLLECTIONS).toBe(2);
    const keys = COLLECTIONS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('names every template by a key that resolves to a listed template', () => {
    for (const c of COLLECTIONS) {
      expect(c.templateKeys.length, c.key).toBeGreaterThan(0);
      expect(new Set(c.templateKeys).size, c.key).toBe(c.templateKeys.length);
      for (const key of c.templateKeys) {
        expect(LISTED.some((t) => t.key === key), `${c.key} -> ${key}`).toBe(true);
      }
    }
  });

  it('uses no invented popularity titles', () => {
    for (const c of COLLECTIONS) {
      expect(`${c.title} ${c.blurb}`).not.toMatch(/best.?sell|trending|popular|top rated|most loved|hot/i);
    }
  });

  it('drops a key that is not listed, and a collection left empty', () => {
    const first = COLLECTIONS[0];
    const resolved = resolveCollections(LISTED, [
      { ...first, templateKeys: [...first.templateKeys, 'not-a-template'] },
      { key: 'empty', title: 'Empty', blurb: 'Nothing listed', templateKeys: ['not-a-template'] },
    ]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].templates.map((t) => t.key)).toEqual(first.templateKeys);
  });

  it('drops a key whose template is held back from the listing', () => {
    const first = COLLECTIONS[0];
    const held = first.templateKeys[0];
    const resolved = resolveCollections(LISTED.filter((t) => t.key !== held), [first]);
    expect(resolved[0].templates.map((t) => t.key)).not.toContain(held);
  });

  it('keeps the committed order', () => {
    const resolved = resolveCollections(LISTED);
    expect(resolved.map((r) => r.collection.key)).toEqual(COLLECTIONS.map((c) => c.key));
    for (const r of resolved) expect(r.templates.map((t) => t.key)).toEqual(r.collection.templateKeys);
  });
});
