/**
 * The quality report (spec §9): per category and subcategory, how many
 * directions exist, whether the subcategory is shown, and each template's
 * score, critical failures and stale-review status.
 *
 * NODE ONLY: it calls the scorer and critical checks, which read font files.
 * Never import it from browser code.
 */
import type { DesignTemplate } from '../../designTemplates';
import {
  CATEGORIES, SUBCATEGORIES, shownSubcategories, subcategoryFor, type CategoryKey,
} from '../../create/catalogueTaxonomy';
import { FORMATS, needsReverify, type Format } from '../formats';
import type { AssetManifest } from '../assetManifestTypes';
import { automatedCriticals, NOT_CHECKED } from './critical';
import { gate } from './gate';
import { contentHash } from './hash';
import { REVIEWS, type Review } from './ledger';
import { automatedScore } from './score';

export const NOT_CHECKED_TEXT = (code: string): string => `${code}: not checked`;
export const CHECKED_IN_TESTS = (code: string): string => `${code}: checked in tests`;

export interface TemplateRow {
  key: string;
  /** Automated score out of 59, or the combined score once a review exists. */
  score: number;
  automatedScore: number;
  /** Distinct automated critical codes. */
  criticals: string[];
  /** Review exists but the template changed since it was written. */
  stale: boolean;
  listed: boolean;
  evidence: Record<string, string>;
  /** Checks this report did not run, with why. */
  notChecked: string[];
}

export interface ReportRow {
  category: CategoryKey;
  categoryName: string;
  subcategory: string;
  subcategoryName: string;
  /** Distinct directions among LISTED templates: the figure compared with MIN_DIRECTIONS. */
  listedDirections: number;
  /** Distinct directions across all the subcategory's templates, listed or not. */
  directions: number;
  shown: boolean;
  templates: TemplateRow[];
}

/**
 * `reviews` is the ledger seam (defaults to the real REVIEWS) so tests can pass
 * synthetic reviews. Scope: every figure for a template is computed against its
 * subcategory siblings. `gate` takes the full catalogue as `_all` but ignores
 * it today (it reads the review's stored snapshot), so passing `siblings` is
 * consistent with the scorer.
 */
export function buildReport(
  ts: DesignTemplate[], manifest: AssetManifest, today: string, reviews: readonly Review[] = REVIEWS,
): ReportRow[] {
  const listed = ts.filter((t) => gate(t, ts, today, reviews).listed);
  const shown = new Set(shownSubcategories(listed).map((s) => s.key));
  const notChecked = [...NOT_CHECKED.map(NOT_CHECKED_TEXT), CHECKED_IN_TESTS('C6')];

  return SUBCATEGORIES.map((sub) => {
    const siblings = ts.filter((t) => subcategoryFor(t)?.key === sub.key);
    const category = CATEGORIES.find((c) => c.key === sub.category);
    return {
      category: sub.category,
      categoryName: category?.name ?? sub.category,
      subcategory: sub.key,
      subcategoryName: sub.name,
      listedDirections: new Set(siblings.filter((t) => listed.includes(t)).map((t) => t.direction).filter(Boolean)).size,
      directions: new Set(siblings.map((t) => t.direction).filter(Boolean)).size,
      shown: shown.has(sub.key),
      templates: siblings.map((t): TemplateRow => {
        const auto = automatedScore(t, siblings, manifest);
        const review = reviews.find((r) => r.key === t.key);
        const g = gate(t, siblings, today, reviews);
        return {
          key: t.key,
          score: g.score ?? auto.total,
          automatedScore: auto.total,
          criticals: [...new Set(automatedCriticals(t, siblings, manifest).map((c) => c.code))],
          stale: !!review && contentHash(t) !== review.hash,
          listed: g.listed,
          evidence: auto.evidence,
          notChecked,
        };
      }),
    };
  });
}

/** Formats never verified or last verified over 180 days before `today`. */
export function formatsDue(today: string): Format[] {
  return Object.values(FORMATS).filter((f) => needsReverify(f, today));
}
