import { describe, expect, it } from 'vitest';

import { DESIGN_TEMPLATES, templateByKey } from '../../designTemplates';
import { SUBCATEGORIES, subcategoryFor } from '../../create/catalogueTaxonomy';
import { buildReport, CHECKED_IN_TESTS, NOT_CHECKED_TEXT } from './report';

const MANIFEST = { assets: [] };
const TODAY = '2026-11-08';

describe('buildReport', () => {
  const two = [templateByKey('tiered-sale'), templateByKey('editorial-split')];
  const rows = buildReport(two, MANIFEST, TODAY);

  it('has a row for every subcategory, pilots with 0 templates included', () => {
    expect(rows.map((r) => r.subcategory)).toEqual(SUBCATEGORIES.map((s) => s.key));
    expect(rows.some((r) => r.templates.length === 0)).toBe(true);
  });

  it('counts the templates in the right subcategory', () => {
    const total = rows.reduce((n, r) => n + r.templates.length, 0);
    const placed = two.filter((t) => subcategoryFor(t)).length;
    expect(total).toBe(placed);
    for (const r of rows) for (const t of r.templates) expect(subcategoryFor(templateByKey(t.key))?.key).toBe(r.subcategory);
  });

  it('reports directions, shown flag and per-template score and evidence', () => {
    for (const r of rows) {
      expect(r.directions).toBe(0);
      expect(r.shown).toBe(false);
      for (const t of r.templates) {
        expect(t.score).toBeGreaterThanOrEqual(0);
        expect(t.evidence).toBeTypeOf('object');
        expect(t.stale).toBe(false);
        expect(t.listed).toBe(false);
      }
    }
  });

  it('shows C8 as not checked and C6 as checked in tests', () => {
    const t = rows.flatMap((r) => r.templates)[0];
    expect(t.notChecked).toContain(NOT_CHECKED_TEXT('C8'));
    expect(t.notChecked).toContain(CHECKED_IN_TESTS('C6'));
  });

  it('works on the whole catalogue', () => {
    expect(() => buildReport(DESIGN_TEMPLATES, MANIFEST, TODAY)).not.toThrow();
  });
});
