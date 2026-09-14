/**
 * The deterministic quality score, ported from src/lib/acquire/qualityScore.ts
 * for the campaign worker.
 *
 * WHY PORT IT INSTEAD OF RE-COMPUTING IN SQL: this is the existing engine the
 * admin console already stages candidates with, and the single-policy rule for
 * the discovery engine says the worker must reuse it rather than adopt a
 * second idea of "how good is this candidate". The weights below are identical
 * to the browser/lib copy; a divergence would make the same candidate score
 * differently depending on which system wrote the row.
 *
 * The one deliberate input the worker always omits is duplicateConfidence:
 * duplicate detection happens in the review queue (publishGate), not at
 * discovery time. An unchecked candidate is not a confirmed original, so that
 * component scores 0 — which is the honest floor this engine was built with.
 */

import type { RawCandidate } from './types.ts';

export interface Weights {
  identity: number;
  location: number;
  category: number;
  contact: number;
  digital: number;
  sourceConfidence: number;
  completeness: number;
  duplicateConfidence: number;
}

/** The weights, as data so they are configurable and inspectable. */
export const DEFAULT_WEIGHTS: Weights = Object.freeze({
  identity: 20,
  location: 20,
  category: 15,
  contact: 10,
  digital: 10,
  sourceConfidence: 10,
  completeness: 10,
  duplicateConfidence: 5,
});

export type Band = 'LOW' | 'FAIR' | 'GOOD' | 'EXCELLENT' | 'EXCEPTIONAL';

export interface ScoreInput {
  candidate: RawCandidate;
  /**
   * 0-1 from the source registry's own accuracy record. Undefined scores 0 —
   * a source we know nothing about has earned nothing.
   */
  sourceAccuracy?: number;
  /**
   * 0-1 where 1 means "certainly not a duplicate". Undefined scores 0.
   */
  duplicateConfidence?: number;
  weights?: Partial<Weights>;
}

export interface ScoreBreakdown {
  score: number;
  band: Band;
  parts: { key: keyof Weights; earned: number; possible: number; why: string }[];
}

const has = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;

/** How much of a field's evidence we trust, by extraction method. */
function methodWeight(method: string | undefined): number {
  switch (method) {
    case 'api':
    case 'structured_data':
      return 1;
    case 'dom_extraction':
    case 'regex':
      return 0.8;
    case 'ai_extracted':
      return 0.5;
    case 'ai_inferred':
      return 0;
    default:
      return 0;
  }
}

/** Evidence-weighted presence of a field: present AND sourced. */
function sourced(c: RawCandidate, field: keyof RawCandidate): number {
  if (!has(c[field] as unknown)) return 0;
  const ev = c.evidence?.[field as string];
  if (!ev) return 0.3;
  const conf = Math.max(0, Math.min(100, ev.confidence)) / 100;
  return methodWeight(ev.method) * (0.5 + 0.5 * conf);
}

export function bandFor(score: number): Band {
  if (score >= 95) return 'EXCEPTIONAL';
  if (score >= 85) return 'EXCELLENT';
  if (score >= 70) return 'GOOD';
  if (score >= 50) return 'FAIR';
  return 'LOW';
}

/**
 * Score a candidate. Every component returns 0 for missing input rather than
 * skipping — grading out of what happens to be present is how an empty record
 * reaches 100%.
 */
export function scoreCandidate(input: ScoreInput): ScoreBreakdown {
  const w: Weights = { ...DEFAULT_WEIGHTS, ...(input.weights ?? {}) };
  const c = input.candidate;
  const parts: ScoreBreakdown['parts'] = [];

  const push = (key: keyof Weights, fraction: number, why: string) => {
    const possible = w[key];
    parts.push({
      key,
      earned: Math.round(possible * Math.max(0, Math.min(1, fraction)) * 100) / 100,
      possible,
      why,
    });
  };

  const nameScore = sourced(c, 'name');
  push('identity', nameScore, nameScore === 0
    ? 'No name, or a name with no evidence.'
    : `Name present, evidence ${c.evidence?.name?.method ?? 'none recorded'}.`);

  const city = sourced(c, 'city');
  const addr = sourced(c, 'address');
  push('location', Math.max(city, addr) * (addr > 0 ? 1 : 0.6), addr > 0
    ? 'Address present.'
    : city > 0 ? 'City only, no street address.' : 'No location at all.');

  const cat = sourced(c, 'category');
  push('category', cat, cat > 0 ? 'Category present.' : 'No category — cannot be placed in the directory.');

  const contact = Math.max(sourced(c, 'phone'), sourced(c, 'email'));
  push('contact', contact, contact > 0 ? 'At least one reachable contact.' : 'No phone and no email — unreachable.');

  const digital = Math.max(sourced(c, 'website'), 0);
  push('digital', digital, digital > 0 ? 'Website present.' : 'No website.');

  const acc = input.sourceAccuracy;
  push('sourceConfidence', acc ?? 0, acc === undefined
    ? 'Source has no accuracy record yet, so it has earned nothing here.'
    : `Source accuracy ${Math.round(acc * 100)}%.`);

  const optional = ['description', 'website', 'email', 'phone', 'address', 'category'] as const;
  const filled = optional.filter((f) => has(c[f] as unknown)).length;
  push('completeness', filled / optional.length, `${filled} of ${optional.length} optional fields present.`);

  const dup = input.duplicateConfidence;
  push('duplicateConfidence', dup ?? 0, dup === undefined
    ? 'Duplicate check not run — an unchecked candidate is not a confirmed original.'
    : `${Math.round(dup * 100)}% confident this is not a duplicate.`);

  const score = Math.round(parts.reduce((sum, p) => sum + p.earned, 0));
  return { score, band: bandFor(score), parts };
}