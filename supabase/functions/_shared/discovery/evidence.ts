/**
 * Turning a candidate's per-field evidence into radar_candidate_evidence rows.
 *
 * The adapters (wikidata.ts, osm.ts) already record how a field was obtained
 * at the moment of extraction. This module lifts that map into the row shape
 * `stage_discovery_candidate` accepts, so the worker sends provenance it never
 * re-derives. A field with evidence but no concrete value contributes nothing
 * (that is a source lying about what it said, and honours the refusal-to-guess
 * rule: no value, no row).
 */

import type { CandidateEvidenceRow, RawCandidate } from './types.ts';

/**
 * Rows for every populated, evidenced field on a candidate.
 *
 * `candidate` is the raw fold shape (evidence map + scalar fields). `sourceKey`
 * is the registry key of the run — the provenance anchor on each row.
 *
 * `can_auto_update` is false for inference methods: something an AI guessed
 * should update a profile only with a person's say-so, never by another run
 * silently. `owner_confirmed` starts false — the business owner has not signed
 * off on this fact yet.
 */
export function evidenceFor(
  candidate: RawCandidate & Record<string, unknown>,
  sourceKey: string,
): CandidateEvidenceRow[] {
  const rows: CandidateEvidenceRow[] = [];
  for (const [field, point] of Object.entries(candidate.evidence ?? {})) {
    const value = candidate[field];
    if (typeof value !== 'string' || value.trim() === '') continue;
    rows.push({
      evidence_field: field,
      field_value: value,
      source_key: sourceKey,
      method: point.method,
      source_url: point.sourceUrl || candidate.sourceUrl || null,
      confidence: Math.max(0, Math.min(100, point.confidence)),
      owner_confirmed: false,
      can_auto_update: point.method !== 'ai_inferred' && point.method !== 'ai_extracted',
    });
  }
  return rows;
}