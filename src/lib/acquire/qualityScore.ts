/**
 * AutoAcquire §13 — a deterministic quality score.
 *
 * DETERMINISTIC, and that is the requirement rather than a nicety. Two
 * operators reading the same candidate must reach the same number, and the
 * number must be explainable when a business asks why its profile was
 * published or held back. Nothing here is a model output, a probability, or a
 * heuristic that drifts.
 *
 * NOT `listing_score`, and the difference matters
 *
 * `businesses.listing_score` is a generated column measuring COMPLETENESS —
 * does this row have a phone, hours, an address. It answers "is this profile
 * worth showing". This score answers a different question: "do we believe
 * this candidate enough to publish it", which additionally weighs where the
 * information came from and how confident the source is.
 *
 * A candidate can be complete and untrustworthy (every field filled in by a
 * model), or sparse and trustworthy (three fields, all confirmed by the
 * business's own website). Collapsing the two into one number would hide
 * exactly the distinction the publishing gate needs.
 */

import type { RawCandidate } from './adapter';

/**
 * The weights, from §13, as data so they are configurable and inspectable.
 *
 * They sum to 100 and a test asserts it — a scoring function whose weights
 * silently sum to 95 reports a maximum of 95 and nobody notices for months.
 */
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
   * 0-1 from the source registry's own accuracy record.
   *
   * Undefined means the source has no track record, which scores 0 rather
   * than an assumed average: a source we know nothing about has earned
   * nothing.
   */
  sourceAccuracy?: number;
  /**
   * 0-1, where 1 means "certainly not a duplicate".
   *
   * Undefined scores 0. An unchecked duplicate is not a confirmed original,
   * and treating it as one is how the same business gets published twice.
   */
  duplicateConfidence?: number;
  weights?: Partial<Weights>;
}

export interface ScoreBreakdown {
  score: number;
  band: Band;
  /** Per-component, so an operator can see which part is weak. */
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
      /*
       * A model reading a real page. Discounted rather than refused: it read
       * something, but nothing checked that it read it correctly.
       */
      return 0.5;
    case 'ai_inferred':
      /*
       * ZERO. §10: a model producing a field WITHOUT page support is not
       * evidence, and giving it any weight would let a confident guess raise
       * a candidate over a sparse but sourced one.
       */
      return 0;
    default:
      return 0;
  }
}

/** Evidence-weighted presence of a field: present AND sourced. */
function sourced(c: RawCandidate, field: keyof RawCandidate): number {
  if (!has(c[field] as unknown)) return 0;
  const ev = c.evidence?.[field as string];
  if (!ev) return 0.3;   // present but unexplained — worth something, not much
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
 * Score a candidate.
 *
 * Every component returns 0 for missing input rather than skipping — a
 * candidate with no location must score lower than one with a location, not
 * be graded out of a smaller total. Grading out of what happens to be present
 * is how an empty record reaches 100%.
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

  // Identity: a name, and whether anything stands behind it.
  const nameScore = sourced(c, 'name');
  push('identity', nameScore, nameScore === 0
    ? 'No name, or a name with no evidence.'
    : `Name present, evidence ${c.evidence?.name?.method ?? 'none recorded'}.`);

  // Location: a city is the minimum; an address is the useful form.
  const city = sourced(c, 'city');
  const addr = sourced(c, 'address');
  push('location', Math.max(city, addr) * (addr > 0 ? 1 : 0.6), addr > 0
    ? 'Address present.'
    : city > 0 ? 'City only, no street address.' : 'No location at all.');

  const cat = sourced(c, 'category');
  push('category', cat, cat > 0 ? 'Category present.' : 'No category — cannot be placed in the directory.');

  /*
   * Contact: ANY reachable channel earns most of it. A business nobody can
   * reach is the failure this platform exists to prevent, so having one route
   * matters far more than having three.
   */
  const contact = Math.max(sourced(c, 'phone'), sourced(c, 'email'));
  push('contact', contact, contact > 0 ? 'At least one reachable contact.' : 'No phone and no email — unreachable.');

  const digital = Math.max(sourced(c, 'website'), 0);
  push('digital', digital, digital > 0 ? 'Website present.' : 'No website.');

  const acc = input.sourceAccuracy;
  push('sourceConfidence', acc ?? 0, acc === undefined
    ? 'Source has no accuracy record yet, so it has earned nothing here.'
    : `Source accuracy ${Math.round(acc * 100)}%.`);

  /*
   * Completeness is the ONLY component that grades breadth, and it is
   * deliberately the smallest alongside duplicate confidence. Weighting
   * breadth heavily is what lets a model fill every field and score well.
   */
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

/** The weakest components first, for a review queue. */
export function weakestParts(b: ScoreBreakdown, n = 3): ScoreBreakdown['parts'] {
  return [...b.parts]
    .filter((p) => p.possible > 0)
    .sort((a, z) => a.earned / a.possible - z.earned / z.possible)
    .slice(0, n);
}
