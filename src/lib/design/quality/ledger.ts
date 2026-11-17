/**
 * The review ledger (spec §9.3): one human review per template, pinned to the
 * template's content hash so editing a template makes its review stale.
 *
 * BROWSER-SAFE. This module and gate.ts must never import the Node-only
 * scorer or critical checks (critical.ts reads font files with fs). The
 * automated numbers are therefore SNAPSHOTS stored on the review (`auto`,
 * `criticals`) and re-verified in Node by ledger.snapshot.test.ts, so a
 * stale snapshot fails CI instead of silently listing a template.
 */

export interface HumanScore {
  visual: number; typography: number; composition: number;
  relevance: number; industry: number; access: number; mobile: number;
}

/** Maxima: 10, 5, 10, 6, 5, 3, 2 = 41. */
export const HUMAN_MAX: Readonly<HumanScore> = {
  visual: 10, typography: 5, composition: 10, relevance: 6, industry: 5, access: 3, mobile: 2,
};

export const HUMAN_TOTAL = Object.values(HUMAN_MAX).reduce((a, b) => a + b, 0);

export interface Review {
  key: string;
  /** contentHash(template) when it was reviewed. */
  hash: string;
  reviewer: string;
  /** YYYY-MM-DD, Africa/Lagos. */
  date: string;
  human: HumanScore;
  notes: Record<keyof HumanScore, string>;
  decision: 'approve' | 'reject' | 'revise';
  /** Reviewer found an invented claim (critical C10). */
  c10: boolean;
  /** Grandfathered listing, valid through this date (inclusive). */
  legacyUntil?: string;
  /** automatedScore(...).total at review time. Verified in Node by ledger.snapshot.test.ts. */
  auto: number;
  /** Automated critical codes at review time. Must be empty to list. */
  criticals: string[];
}

/** Problems with a review's human scores; empty when they are all within range. */
export function humanScoreProblems(human: HumanScore): string[] {
  const out: string[] = [];
  for (const k of Object.keys(HUMAN_MAX) as (keyof HumanScore)[]) {
    const v = human[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) out.push(`${k} is not a number`);
    else if (v < 0 || v > HUMAN_MAX[k]) out.push(`${k} ${v} is outside 0 to ${HUMAN_MAX[k]}`);
  }
  return out;
}

export const humanTotal = (human: HumanScore): number =>
  (Object.keys(HUMAN_MAX) as (keyof HumanScore)[]).reduce((sum, k) => sum + human[k], 0);

/** No reviews yet. */
export const REVIEWS: Review[] = [];

/** Subcategory keys where listing needs a passing review. Empty until Task 18. */
export const GATED_SUBCATEGORIES: ReadonlySet<string> = new Set<string>();
