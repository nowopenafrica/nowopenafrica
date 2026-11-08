/**
 * The listing gate (spec §9.3). Browser-safe: see ledger.ts.
 */
import type { DesignTemplate } from '../../designTemplates';
import { contentHash } from './hash';
import { humanTotal, REVIEWS, type Review } from './ledger';

export const PASS_SCORE = 85;

export interface GateResult { listed: boolean; score: number | null; reasons: string[] }

/**
 * Listed only when the review is current, approved, free of C10 and automated
 * criticals, scores at least 85 combined, and any legacy grace has not lapsed.
 * `all` is accepted for symmetry with the scorer; distinctness (C13) is
 * already folded into the stored `criticals`.
 */
export function gate(
  tpl: DesignTemplate,
  _all: DesignTemplate[],
  today: string,
  reviews: readonly Review[] = REVIEWS,
): GateResult {
  const review = reviews.find((r) => r.key === tpl.key);
  if (!review) return { listed: false, score: null, reasons: ['no review'] };

  const reasons: string[] = [];
  const score = review.auto + humanTotal(review.human);
  if (contentHash(tpl) !== review.hash) reasons.push('stale review');
  if (review.decision !== 'approve') reasons.push(`decision is ${review.decision}`);
  if (review.c10) reasons.push('critical C10');
  if (review.criticals.length > 0) reasons.push(`critical ${review.criticals.join(', ')}`);
  if (score < PASS_SCORE) reasons.push(`score ${score} is below ${PASS_SCORE}`);
  if (review.legacyUntil !== undefined && review.legacyUntil < today) reasons.push('legacy listing expired');

  return { listed: reasons.length === 0, score, reasons };
}
