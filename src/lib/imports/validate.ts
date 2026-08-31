/**
 * Sorting uploaded rows into what can be imported, what needs a person, and
 * what cannot be used at all.
 *
 * Three outcomes, and the middle one carries the weight. A file of real
 * businesses in a town NowOpen has not listed yet is not a bad file — it is a
 * gap in the reference data. Rejecting those rows would quietly discard exactly
 * the businesses worth having, so an unrecognised category or location sends
 * the row to REVIEW, never to invalid. Only a row that cannot become a business
 * at all is refused.
 *
 * Nothing here invents. A blank column stays blank; it does not become "N/A",
 * a guessed category, or a phone number with a digit added to make it fit.
 */

import { normalizeBusiness, type NormalizedBusiness } from '../radar/normalize';
import { scoreConfidence } from '../radar/confidence';
import type { Dataset } from './mapping';

export type RowStatus = 'valid' | 'review' | 'invalid';

export interface RowIssue {
  field: string;
  /** 'blocking' makes the row invalid; 'review' asks for a person. */
  severity: 'blocking' | 'review' | 'note';
  message: string;
}

export interface ValidatedRow {
  lineNo: number;
  status: RowStatus;
  issues: RowIssue[];
  mapped: Record<string, string>;
  normalized: NormalizedBusiness | null;
  confidence: number;
}

export interface ReferenceData {
  /** Lowercased category names AND slugs that NowOpen recognises. */
  categories: Set<string>;
  /** Lowercased city names NowOpen recognises. */
  cities: Set<string>;
}

export function buildReference(
  categories: Array<{ category: string; slug: string }>,
  locations: Array<{ city: string }>,
): ReferenceData {
  const c = new Set<string>();
  for (const row of categories) {
    if (row.category) c.add(row.category.toLowerCase());
    if (row.slug) c.add(row.slug.toLowerCase());
  }
  return { categories: c, cities: new Set(locations.map((l) => l.city.toLowerCase()).filter(Boolean)) };
}

/** Required fields per dataset, from the import contract. */
const REQUIRED: Record<Dataset, string[]> = {
  businesses: ['name', 'category', 'city'],
  placements: ['name', 'placement_type', 'city'],
  media: ['name', 'media_type', 'service_category', 'city'],
};

/**
 * Check one mapped row.
 *
 * `dataset` decides which fields are compulsory; the normalisation and scoring
 * below run only for businesses, which is the dataset whose target schema is
 * proven. Placements and media are validated for shape and completeness and
 * staged, and say so.
 */
export function validateRow(
  mapped: Record<string, string>,
  lineNo: number,
  dataset: Dataset,
  ref: ReferenceData,
): ValidatedRow {
  const issues: RowIssue[] = [];
  const has = (k: string) => !!mapped[k]?.trim();

  for (const field of REQUIRED[dataset]) {
    if (!has(field)) {
      issues.push({ field, severity: 'blocking', message: `${field.replace(/_/g, ' ')} is required and this row has none.` });
    }
  }

  const normalized = dataset === 'businesses' ? normalizeBusiness(mapped) : null;

  if (dataset === 'businesses' && has('name')) {
    // Reference checks send a row to review, never to invalid.
    if (has('category') && !ref.categories.has(mapped.category.trim().toLowerCase())) {
      issues.push({
        field: 'category',
        severity: 'review',
        message: `"${mapped.category}" is not one of NowOpen's categories yet.`,
      });
    }
    if (has('city') && ref.cities.size > 0 && !ref.cities.has(mapped.city.trim().toLowerCase())) {
      issues.push({
        field: 'city',
        severity: 'review',
        message: `"${mapped.city}" is not in NowOpen's locations yet.`,
      });
    }

    /*
     * A supplied value that could not be normalised is worth flagging, because
     * the row will publish without it. Silently dropping a phone number is how
     * a directory ends up full of businesses nobody can ring.
     */
    if (has('phone') && !normalized?.phone) {
      issues.push({ field: 'phone', severity: 'review', message: `"${mapped.phone}" is not a usable phone number; it will be left blank.` });
    }
    if (has('website') && !normalized?.domain) {
      issues.push({ field: 'website', severity: 'review', message: `"${mapped.website}" is not a usable web address; it will be left blank.` });
    }
    if (has('email') && !normalized?.email) {
      issues.push({ field: 'email', severity: 'review', message: `"${mapped.email}" is not a usable email address; it will be left blank.` });
    }
    if ((has('latitude') || has('longitude')) && (normalized?.latitude === null || normalized?.longitude === null)) {
      issues.push({ field: 'latitude', severity: 'review', message: 'Coordinates are out of range and will be left blank.' });
    }
  }

  const confidence = normalized ? scoreConfidence({ normalized }).score : 0;

  const status: RowStatus =
    issues.some((i) => i.severity === 'blocking') ? 'invalid'
    : issues.some((i) => i.severity === 'review') ? 'review'
    : 'valid';

  return { lineNo, status, issues, mapped, normalized, confidence };
}

export interface BatchSummary {
  total: number;
  valid: number;
  review: number;
  invalid: number;
  duplicates: number;
  /** Mean confidence across rows that could be scored. */
  averageConfidence: number;
}

export function summarise(rows: ValidatedRow[], duplicates = 0): BatchSummary {
  const scored = rows.filter((r) => r.status !== 'invalid');
  return {
    total: rows.length,
    valid: rows.filter((r) => r.status === 'valid').length,
    review: rows.filter((r) => r.status === 'review').length,
    invalid: rows.filter((r) => r.status === 'invalid').length,
    duplicates,
    averageConfidence: scored.length
      ? Math.round(scored.reduce((s, r) => s + r.confidence, 0) / scored.length)
      : 0,
  };
}

/**
 * Duplicates inside the file itself.
 *
 * Checked before anything touches the database, because a spreadsheet that
 * lists the same shop on lines 12 and 4,096 will otherwise create it twice and
 * the second one will look like a legitimate new business.
 */
export function findInternalDuplicates(rows: ValidatedRow[]): Map<number, number> {
  const seen = new Map<string, number>();
  const dupes = new Map<number, number>();

  for (const row of rows) {
    if (!row.normalized) continue;
    // A phone is a stronger key than a name; fall back to name+city.
    const keys = [
      row.normalized.phone ? `p:${row.normalized.phone}` : null,
      row.normalized.domain ? `d:${row.normalized.domain}` : null,
      row.normalized.nameKey ? `n:${row.normalized.nameKey}|${row.normalized.cityKey}` : null,
    ].filter(Boolean) as string[];

    const hit = keys.map((k) => seen.get(k)).find((v) => v !== undefined);
    if (hit !== undefined) {
      dupes.set(row.lineNo, hit);
      continue;
    }
    for (const k of keys) if (!seen.has(k)) seen.set(k, row.lineNo);
  }
  return dupes;
}

/** A CSV of the rows that failed, so an admin can fix the file and re-upload. */
export function errorReportCsv(rows: ValidatedRow[]): string {
  const problems = rows.filter((r) => r.status !== 'valid');
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = ['line,status,field,severity,problem,value'];
  for (const r of problems) {
    for (const i of r.issues) {
      lines.push([r.lineNo, r.status, i.field, i.severity, esc(i.message), esc(r.mapped[i.field] ?? '')].join(','));
    }
  }
  return lines.join('\n');
}
