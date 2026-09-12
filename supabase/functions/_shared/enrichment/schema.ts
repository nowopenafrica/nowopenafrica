// The strictly-validated boundary between "what a model said" and "what we
// record". §10 of the enrichment spec: a model may only assert an allowed
// field, backed by a verbatim quote from the source. This module is the one
// place that boundary is enforced.
//
// The executor side (edge function) is thin and dumb: it feeds the page to a
// model, hands the raw output to `validateObservations`, and only ever stores
// what survives. `probablyMadeUp` marks values a model emitted WITHOUT a quote
// — recorded as evidence at confidence 0, never proposed, flagged for a human
// because a value the model invented about a real business is still signal
// that the business has NOT said it.

/** Fields a model is allowed to assert (businesses columns or evidence names). */
export const OBSERVATION_FIELDS = [
  'description',
  'about',
  'tagline',
  'services',
  'business_type',
  'service_area',
  'employees',
  'payment_methods',
  'languages',
  'core_values',
  'why_us',
  'faqs',
] as const;

const FIELD_SET = new Set<string>(OBSERVATION_FIELDS);

/** A validated observation the engine may record. */
export interface ExtractObservation {
  field: string;
  value: string;
  method: 'ai_extracted' | 'ai_inferred';
  /** verbatim passage from the source that supports the value (may be empty
   *  when the model produced a value without support — that is the flag). */
  quote: string;
  /** The source URL the model read when it found this. */
  sourceUrl: string;
  /** ai_extracted earns a weak 30; unsupported values 0, and are never proposed. */
  confidence: number;
  /** True when the model produced a value the page did NOT support. */
  probablyMadeUp: boolean;
}

/** Shape the model's prompt demands. */
export interface LlmStructuredRow {
  field: string;
  value: string | null;
  supported_by?: string | null;
}

export function validateObservations(raw: unknown, sourceUrl: string): ExtractObservation[] {
  if (!raw || typeof raw !== 'object') return [];
  const rows = Array.isArray(raw) ? raw : (raw as { fields?: unknown }).fields;
  if (!Array.isArray(rows)) return [];

  const out: ExtractObservation[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as LlmStructuredRow;
    const field = r.field?.trim() ?? '';
    const value = r.value?.trim() ?? '';
    const quote = r.supported_by?.trim() ?? '';

    if (!FIELD_SET.has(field)) continue;
    if (!value) continue;

    const supported = quote.length >= 3;
    out.push({
      field,
      value,
      quote: supported ? quote : '',
      sourceUrl,
      method: supported ? 'ai_extracted' : 'ai_inferred',
      confidence: supported ? 30 : 0,
      probablyMadeUp: !supported,
    });
  }
  return out;
}