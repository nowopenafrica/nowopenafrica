import { describe, expect, it } from 'vitest';

import { DESIGN_TEMPLATES, templateByKey } from '../../designTemplates';
import { SUBCATEGORIES, subcategoryFor } from '../../create/catalogueTaxonomy';
import { contentHash } from './hash';
import { HUMAN_MAX, type Review } from './ledger';
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
      expect(r.listedDirections).toBe(0);
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

describe('buildReport with synthetic reviews', () => {
  const keys = ['card-front', 'card-minimal', 'card-centred', 'card-luxe-dark', 'card-type-led'];
  const dirs = ['a', 'b', 'c', 'd', 'e'] as const;
  const tpls = keys.map((k, i) => ({ ...templateByKey(k), direction: dirs[i] as never }));
  const human = { ...HUMAN_MAX };
  const notes = { visual: '', typography: '', composition: '', relevance: '', industry: '', access: '', mobile: '' };
  const review = (t: (typeof tpls)[number], over: Partial<Review> = {}): Review => ({
    key: t.key, hash: contentHash(t), reviewer: 't', date: '2026-11-01', human, notes,
    decision: 'approve', c10: false, auto: 49, criticals: [], ...over,
  });
  const row = (reviews: Review[]) => buildReport(tpls, MANIFEST, TODAY, reviews).find((r) => r.subcategory === 'business-card')!;

  it('shows a subcategory with four listed directions', () => {
    const r = row(tpls.slice(0, 4).map((t) => review(t)));
    expect(r.listedDirections).toBe(4);
    expect(r.shown).toBe(true);
  });

  it('separates listed from total directions', () => {
    const r = row(tpls.slice(0, 2).map((t) => review(t)));
    expect(r.directions).toBe(5);
    expect(r.listedDirections).toBe(2);
    expect(r.shown).toBe(false);
  });

  it('flags a stale review and does not list it', () => {
    const r = row([review(tpls[0], { hash: 'wrong' })]);
    const t = r.templates.find((x) => x.key === tpls[0].key)!;
    expect(t.stale).toBe(true);
    expect(t.listed).toBe(false);
  });

  it('reports the combined score from gate when a passing review exists', () => {
    const r = row([review(tpls[0])]);
    const t = r.templates.find((x) => x.key === tpls[0].key)!;
    expect(t.listed).toBe(true);
    expect(t.score).toBe(49 + 41);
    expect(t.automatedScore).not.toBe(t.score);
  });
});
