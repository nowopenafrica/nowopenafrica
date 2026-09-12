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