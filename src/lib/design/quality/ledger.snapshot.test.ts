/**
 * NODE ONLY. Ruling P: the browser gate trusts the `auto` and `criticals`
 * snapshots on each review, so this test recomputes them with the real scorer
 * and fails if any review has drifted.
 */
import { describe, expect, it } from 'vitest';

import { DESIGN_TEMPLATES, templateByKey } from '../../designTemplates';
import { automatedCriticals } from './critical';
import { automatedScore } from './score';
import { REVIEWS, type Review } from './ledger';

const MANIFEST = { assets: [] };

const codesOf = (key: string): string[] =>
  [...new Set(automatedCriticals(templateByKey(key), DESIGN_TEMPLATES, MANIFEST).map((c) => c.code))].sort();

/** Problems with the snapshots stored on these reviews; empty when they are all current. */
function snapshotProblems(reviews: readonly Review[]): string[] {
  const out: string[] = [];
  for (const r of reviews) {
    const auto = automatedScore(templateByKey(r.key), DESIGN_TEMPLATES, MANIFEST).total;
    if (auto !== r.auto) out.push(`${r.key}: stored auto ${r.auto}, recomputed ${auto}`);
    const codes = codesOf(r.key);
    if (JSON.stringify(codes) !== JSON.stringify([...r.criticals].sort())) {
      out.push(`${r.key}: stored criticals [${r.criticals}], recomputed [${codes}]`);
    }
  }
  return out;
}

const fixture = (over: Partial<Review>): Review => {
  const key = 'tiered-sale';
  return {
    key, hash: 'x', reviewer: 'test', date: '2026-11-01',
    human: { visual: 0, typography: 0, composition: 0, relevance: 0, industry: 0, access: 0, mobile: 0 },
    notes: { visual: '', typography: '', composition: '', relevance: '', industry: '', access: '', mobile: '' },
    decision: 'approve', c10: false,
    auto: automatedScore(templateByKey(key), DESIGN_TEMPLATES, MANIFEST).total,
    criticals: codesOf(key),
    ...over,
  };
};

describe('review snapshots', () => {
  it('every stored review matches a fresh recomputation', () => {
    expect(snapshotProblems(REVIEWS)).toEqual([]);
  });

  it('a correct fixture passes', () => {
    expect(snapshotProblems([fixture({})])).toEqual([]);
  });

  it('would fail for a wrong auto', () => {
    const good = fixture({});
    expect(snapshotProblems([{ ...good, auto: good.auto + 1 }])).toHaveLength(1);
  });

  it('would fail for wrong criticals', () => {
    expect(snapshotProblems([fixture({ criticals: ['C99'] })])).toHaveLength(1);
  });
});
