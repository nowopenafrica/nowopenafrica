// FieldConflicts — pure reading of the `business_field_conflicts` view.
//
// A conflict is two or more live evidence rows naming one field with values
// that differ. It is NOT two rival proposals: `business_change_proposals` has a
// partial unique index on (business_id, field_name) WHERE status = 'pending',
// so a second proposal for a contested field cannot exist. Evidence is the only
// place a disagreement can be represented, which is why the view reads it.
//
// No React, no supabase calls — the database owns every write. Choosing a
// winner runs `resolve_field_conflict(evidence_id)`, which applies it through
// the same applier a staff approval uses, so the claimed-profile guard and the
// writable-field allowlist still hold. This module only decides what to SHOW
// and what to recommend; it never decides what is true.

export interface ConflictCandidate {
  evidence_id: string;
  value: string | null;
  source: string | null;
  source_url: string | null;
  confidence: number | null;
  method: string | null;
  by_ai: boolean | null;
  /** Lower wins. 500 means nobody has ranked this source for this field. */
  authority: number | null;
  observed_at: string | null;
}

export interface FieldConflictRow {
  business_id: string;
  field_name: string;
  business_name: string | null;
  current_value: string | null;
  evidence_count: number;
  distinct_values: number;
  business_claimed: boolean;
  candidates: ConflictCandidate[];
  first_seen: string | null;
}

/** The rank the database hands back for a source nobody has ranked. */
export const UNRANKED_AUTHORITY = 500;

/**
 * The view already orders candidates by authority, then freshness, then
 * confidence — so the recommendation is simply the first one. Reading it
 * through a named function rather than `candidates[0]` at four call sites
 * keeps "what the engine suggests" in one place, and copes with an empty array
 * rather than handing back `undefined` for a caller to trip over.
 */
export function recommended(row: FieldConflictRow): ConflictCandidate | null {
  return row.candidates?.[0] ?? null;
}

/**
 * Why the recommendation is the recommendation, in words a human can check.
 *
 * This is deliberately explicit about authority beating confidence, because
 * that is the counter-intuitive part: Wikidata can say something with 99
 * confidence and still lose to a website that said it with 70, and an operator
 * who is not told that will assume the ranking is broken.
 */
export function recommendationReason(row: FieldConflictRow): string | null {
  const top = recommended(row);
  if (!top) return null;
  const rival = row.candidates[1];
  const src = sourceName(top.source);

  if (top.authority != null && top.authority >= UNRANKED_AUTHORITY) {
    return `No source here is ranked for ${row.field_name}. Order is by recency only — decide this one on the evidence.`;
  }
  if (!rival) return `${src} is the highest-ranked source for this field.`;

  const rivalSrc = sourceName(rival.source);
  if (rival.authority != null && top.authority != null && rival.authority === top.authority) {
    return `${src} and ${rivalSrc} rank equally for ${row.field_name}; the more recent observation is shown first.`;
  }
  if ((rival.confidence ?? 0) > (top.confidence ?? 0)) {
    return `${src} outranks ${rivalSrc} for ${row.field_name}, even though ${rivalSrc} reported a higher confidence. Authority beats confidence.`;
  }
  return `${src} outranks ${rivalSrc} for ${row.field_name}.`;
}

/** Short, gutter-safe label for a source key. */
export function sourceName(key: string | null | undefined): string {
  if (!key) return 'an unnamed source';
  return key.replace(/_/g, ' ');
}

/**
 * Is one of the competing values the one the business already holds?
 *
 * This matters because resolving to that value writes nothing — it only
 * supersedes the rivals — and the button should say so rather than implying an
 * edit is about to happen.
 */
export function isCurrentValue(row: FieldConflictRow, c: ConflictCandidate): boolean {
  return row.current_value != null && c.value === row.current_value;
}

/**
 * A conflict on a CLAIMED business cannot be resolved by staff: the database
 * trigger that guards claimed profiles refuses the write, and it is right to.
 * Saying so before the click is better than surfacing the trigger's error
 * afterwards.
 */
export function blockedReason(row: FieldConflictRow): string | null {
  if (row.business_claimed) {
    return 'This business is claimed. Its owner controls these fields, so the database will refuse the write — send them a correction request instead.';
  }
  return null;
}

/** One-line summary for the card header. */
export function conflictSummary(row: FieldConflictRow): string {
  const sources = row.candidates
    .map((c) => sourceName(c.source))
    .filter((v, i, a) => a.indexOf(v) === i);
  return `${row.distinct_values} different values from ${sources.length} source${sources.length === 1 ? '' : 's'}`;
}

/** Readable rendering of a stored value, matching the proposals panel. */
export function displayConflictValue(value: string | null): string {
  if (value == null || value === '') return '—';
  return value;
}
