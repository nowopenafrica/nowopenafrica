import { describe, expect, it } from 'vitest';

import { DESIGN_TEMPLATES, type DesignTemplate } from '../designTemplates';
import { DIRECTIONS } from '../design/directions';
import { isListed } from './needs';
import { subcategoryFor } from './catalogueTaxonomy';
import {
  FILTER_GROUPS, applyFilters, facetsOf, filterOptions,
} from './catalogueFilters';

const LISTED = DESIGN_TEMPLATES.filter(isListed);
const inSub = (key: string) => LISTED.filter((t) => subcategoryFor(t)?.key === key);

/** Synthetic directed templates: the real rule, with a direction written on (Task 18 adds real ones). */
const directed = (tpls: DesignTemplate[], n: number): DesignTemplate[] =>
  tpls.map((t, i) => ({ ...t, direction: DIRECTIONS[i % n].key }));

describe('filter groups', () => {
  it('are the spec §10 groups, minus "recent" (no template carries a date yet)', () => {
    expect(FILTER_GROUPS.map((g) => g.key)).toEqual([
      'category', 'industry', 'format', 'dimensions', 'direction', 'colour', 'orientation', 'editable',
    ]);
  });

  it('have no "free or paid", "trending" or "popularity" filter', () => {
    const text = FILTER_GROUPS.map((g) => `${g.key} ${g.label}`).join(' ');
    expect(text).not.toMatch(/free|paid|price|trending|popular/i);
  });
});

describe('facetsOf', () => {
  it('reads the values from the template itself', () => {
    const card = LISTED.find((t) => t.key === 'card-minimal')!;
    const f = facetsOf(card);
    expect(f.category).toEqual(['brand']);
    expect(f.format).toEqual(['business-card']);
    expect(f.dimensions).toEqual(['1011x638']);
    expect(f.orientation).toEqual(['landscape']);
    expect(f.colour).toEqual(['cool']);
    expect(f.industry).toEqual(['Professional Services']);
    expect(f.editable).toEqual(['editable']);
    expect(f.direction).toEqual([]);
    expect(facetsOf({ ...card, direction: 'luxury' }).direction).toEqual(['luxury']);
  });

  it('caches per template object: a second call returns the same record, a new object is read afresh', () => {
    const card = LISTED.find((t) => t.key === 'card-minimal')!;
    const first = facetsOf(card);
    expect(facetsOf(card)).toBe(first);
    const changed = { ...card, direction: 'bold' as const };
    expect(facetsOf(changed)).not.toBe(first);
    expect(facetsOf(changed).direction).toEqual(['bold']);
  });

  it('gives a template with no format of its own no format or dimensions, and the square it renders at', () => {
    const noFormat = LISTED.find((t) => t.key === 'quiet-luxe')!;
    const f = facetsOf(noFormat);
    expect(f.format).toEqual([]);
    expect(f.dimensions).toEqual([]);
    expect(f.orientation).toEqual(['square']);
  });
});

describe('filterOptions', () => {
  it('hides every value that matches nothing, and every group left empty', () => {
    const pool = inSub('business-card');
    for (const group of filterOptions(pool, {})) {
      expect(group.values.length, group.key).toBeGreaterThan(0);
      for (const v of group.values) expect(v.count, `${group.key}=${v.value}`).toBeGreaterThan(0);
    }
    const keys = filterOptions(pool, {}).map((g) => g.key);
    // The eight pilot cards are directed, one per direction, so the group offers all eight.
    const dir = filterOptions(pool, {}).find((g) => g.key === 'direction')!;
    expect(dir.values.map((v) => v.value).sort()).toEqual(DIRECTIONS.map((d) => d.key).sort());
    expect(keys).toContain('direction');
    // Every listed design passes C7, so "Preview only" is never offered.
    const editable = filterOptions(pool, {}).find((g) => g.key === 'editable');
    expect(editable?.values.map((v) => v.value)).toEqual(['editable']);
  });

  it('offers a direction group once directions exist, with only the directions used', () => {
    const pool = directed(inSub('business-card'), 4);
    const dir = filterOptions(pool, {}).find((g) => g.key === 'direction')!;
    expect(dir.values.map((v) => v.value).sort()).toEqual(DIRECTIONS.slice(0, 4).map((d) => d.key).sort());
    expect(dir.values.find((v) => v.value === 'luxury')?.label).toBe('Luxury');
  });

  it('counts each group against the other groups\' choices, so no value leads to nothing', () => {
    const pool = LISTED;
    const sel = { category: 'brand' } as const;
    const narrowed = applyFilters(pool, sel);
    for (const group of filterOptions(pool, sel)) {
      if (group.key === 'category') continue;
      for (const v of group.values) {
        expect(applyFilters(pool, { ...sel, [group.key]: v.value }).length, `${group.key}=${v.value}`).toBe(v.count);
        expect(v.count).toBeLessThanOrEqual(narrowed.length);
      }
    }
  });

  it('keeps a chosen value on show so it can be cleared', () => {
    const pool = LISTED;
    const opts = filterOptions(pool, { colour: 'pastel', category: 'brand' });
    const colour = opts.find((g) => g.key === 'colour')!;
    expect(colour.values.some((v) => v.value === 'pastel')).toBe(true);
  });
});

describe('applyFilters', () => {
  it('narrows by every chosen group at once', () => {
    const out = applyFilters(LISTED, { category: 'brand', orientation: 'landscape', format: 'business-card' });
    expect(out.length).toBeGreaterThan(0);
    for (const t of out) {
      expect(subcategoryFor(t)?.category).toBe('brand');
      expect(facetsOf(t).format).toEqual(['business-card']);
    }
  });

  it('matches an industry the template names among several', () => {
    const out = applyFilters(LISTED, { industry: 'Fashion & Beauty' });
    expect(out.length).toBeGreaterThan(0);
    for (const t of out) expect(t.industries).toContain('Fashion & Beauty');
  });

  it('returns the pool unchanged with nothing chosen', () => {
    expect(applyFilters(LISTED, {})).toEqual(LISTED);
  });
});
