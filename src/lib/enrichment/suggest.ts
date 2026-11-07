// The suggestion engine: what a category template proposes for one business.
//
// PURE. No database, no network, no model. It takes a business, its category
// template and what the profile already holds, and returns rows to be written.
// Everything it decides is therefore testable without a browser or a token.
//
// THREE RULES IT ENFORCES, IN ORDER OF HOW BADLY THEY FAIL
//
// 1. It never overwrites the business. Existing content is passed in and used
//    only to SUPPRESS suggestions, never to replace them. A suggestion that
//    collides with something the owner wrote is dropped, not merged.
//
// 2. Everything it emits is `suggested` and unpublished. The public RLS policy
//    refuses that status outright, so a run that goes wrong is invisible rather
//    than embarrassing — and a human has to choose before anything is seen.
//
// 3. It drops anything that trips the category's forbidden-claim list, and
//    counts what it dropped. Silent filtering would hide a template that had
//    started producing claims.
//
// WHAT IT DELIBERATELY DOES NOT DO
//
// No prices, no availability, no hours, no turnaround times, no brands, no
// stock. Those are facts about a specific business, and this module knows
// nothing about any specific business beyond the fields it was handed.

import {
  templateFor, findForbiddenClaim, type CategoryTemplate,
} from '../../data/categoryTemplates';

/** The enrichment contract version, stamped on every row this produces. */
export const ENRICHMENT_VERSION = 1;

export interface EnrichableBusiness {
  id: string;
  name: string;
  category?: string | null;
  claim_status?: string | null;
  /** Rows already on the profile — used ONLY to suppress duplicates. */
  existingServices?: Array<{ name?: string | null }>;
  existingProducts?: Array<{ name?: string | null }>;
}

export interface SuggestedRow {
  business_id: string;
  name: string;
  description: string | null;
  content_status: 'suggested';
  source_type: 'category_template';
  source_name: string;
  requires_confirmation: true;
  /** Always false. A human publishes; the engine never does. */
  published: false;
  generated_at: string;
  enrichment_version: number;
}

export interface SuggestionResult {
  services: SuggestedRow[];
  products: SuggestedRow[];
  faqs: Array<{ question: string; answer: string }>;
  /** Why nothing was produced, when nothing was. */
  skipped: string | null;
  /** Suggestions dropped because they tripped a forbidden claim. */
  blocked: Array<{ text: string; claim: string }>;
  /** Suggestions dropped because the profile already had them. */
  duplicates: string[];
  industry: string | null;
}

const EMPTY = (skipped: string): SuggestionResult => ({
  services: [], products: [], faqs: [], skipped, blocked: [], duplicates: [], industry: null,
});

/** Loose match: "Dine-in" and "dine in" are the same offer twice. */
function normalise(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * How many of each kind to propose.
 *
 * The brief asks for 8–10. The cap is the template's own length rather than a
 * fixed number: padding a six-item vocabulary up to ten means inventing four,
 * which is the thing this whole system exists not to do.
 */
const MAX_PER_KIND = 10;

/**
 * Is this business eligible for suggestions at all?
 *
 * A CLAIMED business is not. Once a real person is answering for the page,
 * proposing services they did not mention stops being helpful and starts being
 * words put in their mouth. Enrichment is for the gap before someone arrives.
 */
export function isEligible(b: EnrichableBusiness): { ok: boolean; reason: string | null } {
  if (!b?.id) return { ok: false, reason: 'No business id.' };
  if (!(b.name ?? '').trim()) return { ok: false, reason: 'No business name.' };
  if (b.claim_status === 'claimed') {
    return { ok: false, reason: 'Business is claimed — its owner writes its content.' };
  }
  if (!(b.category ?? '').trim()) {
    return { ok: false, reason: 'No category, so no vocabulary applies.' };
  }
  return { ok: true, reason: null };
}

function row(
  businessId: string,
  name: string,
  description: string | null,
  now: string,
): SuggestedRow {
  return {
    business_id: businessId,
    name,
    description,
    content_status: 'suggested',
    source_type: 'category_template',
    source_name: 'NowOpen category template',
    requires_confirmation: true,
    published: false,
    generated_at: now,
    enrichment_version: ENRICHMENT_VERSION,
  };
}

/**
 * Suggest content for one business.
 *
 * `now` is injected so a run is reproducible and a test does not depend on the
 * clock.
 */
export function suggestForBusiness(
  business: EnrichableBusiness,
  now: string = new Date().toISOString(),
): SuggestionResult {
  const eligible = isEligible(business);
  if (!eligible.ok) return EMPTY(eligible.reason ?? 'Not eligible.');

  const template: CategoryTemplate | null = templateFor(business.category);
  if (!template) {
    /*
     * The honest empty answer. A category with no vocabulary produces nothing —
     * falling back to a generic list would put "consultation, support,
     * enquiries" under a real business name, which is filler pretending to be
     * information.
     */
    return EMPTY(`No template for category "${business.category}".`);
  }

  const blocked: Array<{ text: string; claim: string }> = [];
  const duplicates: string[] = [];

  const existingServiceNames = new Set(
    (business.existingServices ?? []).map((s) => normalise(s.name)).filter(Boolean));
  const existingProductNames = new Set(
    (business.existingProducts ?? []).map((p) => normalise(p.name)).filter(Boolean));

  const take = (
    candidates: readonly string[],
    already: Set<string>,
  ): SuggestedRow[] => {
    const out: SuggestedRow[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (out.length >= MAX_PER_KIND) break;

      const claim = findForbiddenClaim(candidate, business.category);
      if (claim) { blocked.push({ text: candidate, claim }); continue; }

      const key = normalise(candidate);
      if (!key) continue;
      if (already.has(key)) { duplicates.push(candidate); continue; }
      if (seen.has(key)) continue;   // the template listed it twice
      seen.add(key);

      out.push(row(business.id, candidate, null, now));
    }
    return out;
  };

  const services = take(template.services, existingServiceNames);
  const products = take(template.products, existingProductNames);

  /*
   * FAQs are returned but NOT written as rows here: there is no FAQ table yet,
   * and inventing one as a side effect of a generation run is how a schema
   * grows by accident. The caller decides what to do with them.
   */
  const faqs = template.faqs
    .filter((f) => !findForbiddenClaim(`${f.question} ${f.answer}`, business.category))
    .map((f) => ({ question: f.question, answer: f.answer }));

  return {
    services,
    products,
    faqs,
    skipped: services.length || products.length ? null : 'Template produced nothing new.',
    blocked,
    duplicates,
    industry: template.industry,
  };
}

/**
 * A one-line, checkable summary of a run.
 *
 * Reported rather than logged-and-forgotten because the interesting number is
 * `blocked`: a template that starts producing forbidden claims should be
 * visible in the admin workspace, not buried in a server log nobody reads.
 */
export function describeRun(r: SuggestionResult): string {
  if (r.skipped) return r.skipped;
  const parts = [
    `${r.services.length} service${r.services.length === 1 ? '' : 's'}`,
    `${r.products.length} offering${r.products.length === 1 ? '' : 's'}`,
  ];
  if (r.duplicates.length) parts.push(`${r.duplicates.length} already present`);
  if (r.blocked.length) parts.push(`${r.blocked.length} blocked`);
  return `${parts.join(', ')} — all unpublished, awaiting review.`;
}

/**
 * The overview line for an unclaimed profile.
 *
 * Built ONLY from fields the business already has. It restates what is known in
 * a readable sentence; it adds nothing. Returns null when there is too little
 * to say, because a sentence assembled from one field is padding.
 */
export function buildOverview(b: EnrichableBusiness & { location?: string | null }): string | null {
  const name = (b.name ?? '').trim();
  const category = (b.category ?? '').trim();
  const location = (b.location ?? '').trim();
  if (!name || !category) return null;

  /*
   * No trailing "business" after the category. Categories are already nouns
   * ("Hospital & Clinic", "Restaurant"), so appending it produced "a hospital
   * & clinic business in Lagos" — the kind of phrase that tells a reader a
   * machine wrote the sentence.
   */
  const article = /^[aeiou]/i.test(category) ? 'an' : 'a';
  const where = location ? ` in ${location}` : '';
  return `${name} is ${article} ${category.toLowerCase()}${where}, listed on NowOpen Africa. `
    + 'Details on this profile have not yet been confirmed by the business — '
    + 'use the contact options to reach them directly.';
}
