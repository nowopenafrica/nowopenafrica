// Text-field extraction helpers for the enrichment engine.
//
// The anti-hallucination boundary itself lives in ./schema (validateObservations).
// Here: the prompt we hand a model, social-link canonicalisation, and the
// "is this already superseded" guard that stops the engine re-recording the
// same fact with a weaker tier on every run.

import type { BusinessEvidence } from './types.ts';
import { OBSERVATION_FIELDS, validateObservations } from './schema.ts';

export { OBSERVATION_FIELDS, validateObservations };

export type { ExtractObservation } from './schema.ts';

/** The system prompt that turns page text into strict, validator-shaped JSON.
 *  The only output shape validateObservations accepts: an object whose
 *  `field` is one of OBSERVATION_FIELDS and whose `supported_by` is a verbatim
 *  quote — anything else is dropped, and an unquoted value is flagged
 *  probablyMadeUp (confidence 0, never auto-applied) by design. */
export const EXTRACTION_PROMPT = `
You are the structured-facts extractor for NowOpen Africa's business directory.

Read the PAGE TEXT below and return ONLY a strict JSON object, with no markdown fences, no prose and nothing else:

{"fields":[{"field":"...","value":"...","supported_by":"..."}]}

field MUST be one of these only: description, about, tagline, services, business_type, service_area, employees, payment_methods, languages, core_values, why_us, faqs.

value is the fact as stated on the page, in a few of your own words.

supported_by is the verbatim passage from the PAGE TEXT that states the fact — copy it character-for-character. If the page text does not state the fact, set "supported_by": null instead of inventing a quote (that entry is recorded at low confidence and is never applied automatically).

Rules:
- State only facts the page text actually contains; omit facts that are not on the page.
- One entry per field at most.
- Nothing outside the json-broken shape above.`;

/** Flatten a company's social links (from a website footer, a directory entry…)
 *  into the { instagram, facebook, x, tiktok, linkedin, youtube } shape the
 *  business row uses. Unknown platforms are dropped, not stored. */
export function normalizeSocialLinks(
  raw: Array<{ platform?: string; url?: string }> | Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const entries = Array.isArray(raw)
    ? raw
    : Object.entries(raw).map(([platform, url]) => ({ platform, url: String(url ?? '') }));

  for (const e of entries) {
    const platform = (e.platform ?? '').trim().toLowerCase();
    if (!['instagram', 'facebook', 'x', 'twitter', 'tiktok', 'linkedin', 'youtube'].includes(platform)) continue;
    if (platform === 'twitter') out.x = e.url ?? '';
    else out[platform] = e.url ?? '';
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => Boolean(v)));
}

/**
 * A value already present as evidence with a same-or-better tier means this
 * run has nothing to add. Used by the orchestrator to avoid noise.
 */
export function alreadySuperseded(
  field: string,
  value: string,
  evidence: BusinessEvidence[],
): boolean {
  const sameField = evidence.filter((e) => e.field_name === field);
  if (!sameField.length) return false;
  const normalized = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const asValue = normalized(value);
  return sameField.some((e) => normalized(e.field_value ?? '') === asValue && !e.superseded_at);
}