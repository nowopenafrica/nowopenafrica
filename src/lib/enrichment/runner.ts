// The write path: turn suggestions into unpublished rows, and report honestly.
//
// Kept separate from `suggest.ts` so the decision of WHAT to propose stays pure
// and testable, and only this thin layer touches the database.
//
// WHY THIS IS SAFE TO RUN FROM AN ADMIN SCREEN
//
// Every protection is in the database, not here:
//
//   * RLS: only an owner, a member or staff may write these tables at all.
//   * `guard_generated_not_published`: a row carrying
//     `source_type = 'category_template'` is REFUSED if it arrives published,
//     or if it claims to be owner-confirmed. So this module cannot publish
//     anything even if it tried, and a future caller cannot either.
//   * The public read requires `published`, which only
//     `publish_suggested_content()` sets, and that is staff-gated.
//
// This file can therefore be wrong without being dangerous, which is the
// property worth designing for.

import { supabase } from '../supabase';
import { suggestForBusiness, describeRun, type EnrichableBusiness, type SuggestionResult } from './suggest';

export interface RunOutcome {
  businessId: string;
  businessName: string;
  servicesWritten: number;
  productsWritten: number;
  blocked: number;
  duplicates: number;
  skipped: string | null;
  error: string | null;
  summary: string;
}

/** The columns a suggestion write actually sets. Nothing else is touched. */
function toServiceRow(r: SuggestionResult['services'][number]) {
  return {
    business_id: r.business_id,
    name: r.name,
    description: r.description,
    content_status: r.content_status,
    source_type: r.source_type,
    source_name: r.source_name,
    requires_confirmation: r.requires_confirmation,
    published: r.published,
    generated_at: r.generated_at,
    enrichment_version: r.enrichment_version,
  };
}

/**
 * Load what the profile already holds, so suggestions can be suppressed rather
 * than duplicated.
 *
 * Reads EVERY row regardless of status — including ones a previous run left
 * unpublished. Without that, a second run would re-propose everything the first
 * run already proposed and the review queue would fill with copies.
 */
async function loadExisting(businessId: string): Promise<{
  services: Array<{ name?: string | null }>;
  products: Array<{ name?: string | null }>;
  error: string | null;
}> {
  const [s, p] = await Promise.all([
    supabase.from('business_services').select('name').eq('business_id', businessId),
    supabase.from('business_products').select('name').eq('business_id', businessId),
  ]);
  // supabase-js resolves with { error } rather than throwing. Treating a failed
  // read as "nothing exists" would duplicate the whole catalogue.
  const error = s.error?.message ?? p.error?.message ?? null;
  return {
    services: (s.data as Array<{ name: string }> | null) ?? [],
    products: (p.data as Array<{ name: string }> | null) ?? [],
    error,
  };
}

/**
 * Generate and write suggestions for one business.
 *
 * Returns an outcome rather than throwing, so a bulk run reports every result
 * instead of stopping at the first failure.
 */
export async function enrichOneBusiness(
  business: Omit<EnrichableBusiness, 'existingServices' | 'existingProducts'>,
  now: string = new Date().toISOString(),
): Promise<RunOutcome> {
  const base: RunOutcome = {
    businessId: business.id,
    businessName: business.name,
    servicesWritten: 0,
    productsWritten: 0,
    blocked: 0,
    duplicates: 0,
    skipped: null,
    error: null,
    summary: '',
  };

  const existing = await loadExisting(business.id);
  if (existing.error) {
    return { ...base, error: `Could not read existing content: ${existing.error}`, summary: 'Skipped — read failed.' };
  }

  const result = suggestForBusiness(
    { ...business, existingServices: existing.services, existingProducts: existing.products },
    now,
  );

  const outcome: RunOutcome = {
    ...base,
    blocked: result.blocked.length,
    duplicates: result.duplicates.length,
    skipped: result.skipped,
    summary: describeRun(result),
  };

  if (!result.services.length && !result.products.length) return outcome;

  if (result.services.length) {
    const { error } = await supabase.from('business_services').insert(result.services.map(toServiceRow));
    if (error) return { ...outcome, error: error.message, summary: `Write failed: ${error.message}` };
    outcome.servicesWritten = result.services.length;
  }

  if (result.products.length) {
    const { error } = await supabase.from('business_products').insert(result.products.map(toServiceRow));
    if (error) return { ...outcome, error: error.message, summary: `Write failed: ${error.message}` };
    outcome.productsWritten = result.products.length;
  }

  return outcome;
}

export interface BulkProgress {
  done: number;
  total: number;
  current: string;
}

/**
 * Run a batch, one business at a time.
 *
 * SEQUENTIAL on purpose. These are writes against a shared production database
 * from an admin's browser; firing fifty inserts at once buys a few seconds and
 * risks rate limits and half-finished batches. The progress callback is what
 * makes the wait acceptable instead.
 */
export async function enrichBusinesses(
  businesses: Array<Omit<EnrichableBusiness, 'existingServices' | 'existingProducts'>>,
  onProgress?: (p: BulkProgress) => void,
): Promise<RunOutcome[]> {
  const out: RunOutcome[] = [];
  const now = new Date().toISOString();
  for (let i = 0; i < businesses.length; i += 1) {
    const b = businesses[i];
    onProgress?.({ done: i, total: businesses.length, current: b.name });
    // eslint-disable-next-line no-await-in-loop
    out.push(await enrichOneBusiness(b, now));
  }
  onProgress?.({ done: businesses.length, total: businesses.length, current: '' });
  return out;
}

/** Totals for a finished batch, in the shape an admin needs to read it. */
export function summariseRun(outcomes: RunOutcome[]): {
  businesses: number; written: number; skipped: number; failed: number; blocked: number;
} {
  return {
    businesses: outcomes.length,
    written: outcomes.reduce((n, o) => n + o.servicesWritten + o.productsWritten, 0),
    skipped: outcomes.filter((o) => !o.error && !o.servicesWritten && !o.productsWritten).length,
    failed: outcomes.filter((o) => o.error).length,
    blocked: outcomes.reduce((n, o) => n + o.blocked, 0),
  };
}
