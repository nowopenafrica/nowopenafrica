import { describe, expect, it } from 'vitest';

import { DESIGN_TEMPLATES, templateByKey, type DesignTemplate } from '../../designTemplates';
import { contentHash } from './hash';
import { gate } from './gate';
import {
  GATED_SUBCATEGORIES, HUMAN_MAX, HUMAN_TOTAL, REVIEWS, humanScoreProblems,
  type HumanScore, type Review,
} from './ledger';

const TODAY = '2026-11-08';
const tpl = templateByKey('tiered-sale');
const ALL = DESIGN_TEMPLATES;

const notes = { visual: '', typography: '', composition: '', relevance: '', industry: '', access: '', mobile: '' };
/** Human total 36 (9 + 4 + 9 + 5 + 4 + 3 + 2). With auto 49 that is exactly 85. */
const human: HumanScore = { visual: 9, typography: 4, composition: 9, relevance: 5, industry: 4, access: 3, mobile: 2 };

const review = (t: DesignTemplate, over: Partial<Review> = {}): Review => ({
  key: t.key, hash: contentHash(t), reviewer: 'test', date: '2026-11-01',
  human, notes, decision: 'approve', c10: false, auto: 49, criticals: [], ...over,
});
const run = (r: Review | null, t: DesignTemplate = tpl, today = TODAY) => gate(t, ALL, today, r ? [r] : []);

describe('the ledger today', () => {
  it('has no reviews and gates no subcategory', () => {
    expect(REVIEWS).toEqual([]);
    expect(GATED_SUBCATEGORIES.size).toBe(0);
  });

  it('human maxima are 10, 5, 10, 6, 5, 3, 2 = 41', () => {
    expect(Object.values(HUMAN_MAX)).toEqual([10, 5, 10, 6, 5, 3, 2]);
    expect(HUMAN_TOTAL).toBe(41);
  });

  it('every stored review has human scores within the maxima', () => {
    for (const r of REVIEWS) expect(humanScoreProblems(r.human), r.key).toEqual([]);
  });

  it('a fixture with an out-of-range score is caught', () => {
    expect(humanScoreProblems({ ...human, visual: 11 })).toHaveLength(1);
    expect(humanScoreProblems({ ...human, mobile: -1 })).toHaveLength(1);
    expect(humanScoreProblems({ ...human, access: Number.NaN })).toHaveLength(1);
    expect(humanScoreProblems(human)).toEqual([]);
  });
});

describe('gate', () => {
  it('no review: not listed, reason "no review"', () => {
    expect(run(null)).toEqual({ listed: false, score: null, reasons: ['no review'] });
  });

  it('a hash mismatch is a stale review', () => {
    const r = run(review(tpl, { hash: '0000000000000000' }));
    expect(r.listed).toBe(false);
    expect(r.reasons).toContain('stale review');
  });

  it('editing the template makes its review stale', () => {
    const r = review(tpl);
    const edited = { ...tpl, label: `${tpl.label} (edited)` };
    expect(run(r, tpl).listed).toBe(true);
    expect(run(r, edited).reasons).toContain('stale review');
  });

  it('84 is not listed; 85 is', () => {
    expect(run(review(tpl, { auto: 48 }))).toMatchObject({ listed: false, score: 84 });
    expect(run(review(tpl, { auto: 49 }))).toMatchObject({ listed: true, score: 85, reasons: [] });
  });

  it('revise and reject are not listed', () => {
    expect(run(review(tpl, { decision: 'revise' })).listed).toBe(false);
    expect(run(review(tpl, { decision: 'reject' })).listed).toBe(false);
  });

  it('c10 is not listed, whatever the score', () => {
    expect(run(review(tpl, { c10: true, auto: 59 })).listed).toBe(false);
  });

  it('an automated critical at review time is not listed', () => {
    const r = run(review(tpl, { criticals: ['C4'], auto: 59 }));
    expect(r.listed).toBe(false);
    expect(r.reasons.join()).toContain('C4');
  });

  it('legacyUntil: through today is fine, past is expired', () => {
    expect(run(review(tpl, { legacyUntil: TODAY })).listed).toBe(true);
    const r = run(review(tpl, { legacyUntil: '2026-11-07' }));
    expect(r.listed).toBe(false);
    expect(r.reasons).toContain('legacy listing expired');
  });
});

describe('the direction rule', () => {
  /** The brief: a template with a direction must pass the gate. */
  const failing = (all: DesignTemplate[], reviews: Review[]) =>
    all.filter((t) => t.direction && !gate(t, all, TODAY, reviews).listed).map((t) => t.key);

  it('holds for the catalogue (vacuously: no template has a direction yet)', () => {
    expect(DESIGN_TEMPLATES.some((t) => t.direction)).toBe(false);
    expect(failing(DESIGN_TEMPLATES, REVIEWS)).toEqual([]);
  });

  it('would fail for a directed template with no review', () => {
    const directed = { ...tpl, direction: 'editorial' } as unknown as DesignTemplate;
    expect(failing([directed], [])).toEqual([tpl.key]);
    expect(failing([directed], [review(directed)])).toEqual([]);
  });
});
