/**
 * Reading and writing an advertiser's media plan.
 *
 * The decisions — what a plan costs, what is missing, whether it may be
 * sent — are in `campaignPlan.ts` and have no network in them. This module
 * is only the part that talks to the database, kept thin on purpose.
 */

import { supabase } from '../supabase';
import type { PlanLine, PriceBasis } from './campaignPlan';

export type CampaignStatus = 'draft' | 'enquiry_sent' | 'archived';

export interface AdCampaign {
  id: string;
  name: string;
  objective: string | null;
  audience: string | null;
  startsOn: string | null;
  endsOn: string | null;
  budget: number | null;
  currency: string;
  status: CampaignStatus;
  updatedAt: string;
}

export type CampaignsRead =
  | { state: 'ready'; campaigns: AdCampaign[] }
  /** The read failed. NEVER rendered as "you have no plans". */
  | { state: 'unavailable'; reason: string };

const MISSING_TABLE = new Set(['42P01', 'PGRST205']);

const CAMPAIGN_COLUMNS =
  'id,name,objective,audience,starts_on,ends_on,budget,currency,status,updated_at';

const toCampaign = (r: Record<string, unknown>): AdCampaign => ({
  id: String(r.id ?? ''),
  name: String(r.name ?? '').trim() || 'Untitled plan',
  objective: (r.objective as string) ?? null,
  audience: (r.audience as string) ?? null,
  startsOn: (r.starts_on as string) ?? null,
  endsOn: (r.ends_on as string) ?? null,
  budget: r.budget == null ? null : Number(r.budget),
  currency: String(r.currency ?? 'NGN'),
  status: (r.status as CampaignStatus) ?? 'draft',
  updatedAt: String(r.updated_at ?? ''),
});

/**
 * The signed-in advertiser's plans.
 *
 * Three outcomes, not two. A failed read shown as "you have no plans" is
 * how somebody rebuilds a plan they already had — and the second one is
 * worse than the first, because now there are two.
 */
export async function fetchCampaigns(): Promise<CampaignsRead> {
  const { data, error } = await supabase
    .from('ad_campaigns')
    .select(CAMPAIGN_COLUMNS)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    return {
      state: 'unavailable',
      reason: MISSING_TABLE.has(error.code ?? '')
        ? 'Media plans are not switched on yet.'
        : 'We could not load your plans just now.',
    };
  }
  return { state: 'ready', campaigns: (data ?? []).map((r) => toCampaign(r as Record<string, unknown>)) };
}

/**
 * The lines of one plan, with each placement's own details joined in.
 *
 * `advertisements!inner` so a line whose placement has been deleted does
 * not come back as a row of nulls that renders as a blank card nobody can
 * remove.
 */
export async function fetchPlanLines(campaignId: string): Promise<PlanLine[]> {
  const { data, error } = await supabase
    .from('ad_campaign_placements')
    .select(`
      id, advert_id, days, price_basis, rate_per_day, currency, artwork_url,
      advertisements!inner ( title, type, location, dimensions )
    `)
    .eq('campaign_id', campaignId)
    .order('created_at');

  if (error || !data) return [];

  return (data as unknown as RawLine[]).map((r) => ({
    id: String(r.id),
    advertId: r.advert_id == null ? null : String(r.advert_id),
    title: r.advertisements?.title ?? 'Placement',
    type: r.advertisements?.type ?? null,
    location: r.advertisements?.location ?? null,
    dimensions: r.advertisements?.dimensions ?? null,
    days: r.days == null ? null : Number(r.days),
    ratePerDay: r.rate_per_day == null ? null : Number(r.rate_per_day),
    priceBasis: (r.price_basis as PriceBasis) ?? 'indicative',
    currency: String(r.currency ?? 'NGN'),
    artworkUrl: r.artwork_url ?? null,
    kind: 'placement' as const,
    productId: null,
    priceMinor: null,
    artworkDesignId: null,
    artworkWidth: null,
    artworkHeight: null,
    offered: true,
  }));
}

interface RawLine {
  id: string;
  advert_id: string;
  days: number | null;
  price_basis: string;
  rate_per_day: number | null;
  currency: string;
  artwork_url: string | null;
  advertisements: { title: string; type: string | null; location: string | null; dimensions: string | null } | null;
}

const DUPLICATE_PLACEMENT = 'That placement is already in this plan.';

/** Start a plan. Returns its id, or null with the reason reported. */
/** What a signed-out visitor is told; planToast adds the way to sign in. */
export const SIGN_IN_TO_SAVE_PLAN = 'Sign in to save a plan.';

/** The outcome of adding placements to the plan. */
export type PlanAddResult =
  | { ok: true; added: number; skipped: number }
  | { ok: false; error: string; added: number };

export async function createCampaign(name: string): Promise<{ id: string } | { error: string }> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user?.id) return { error: SIGN_IN_TO_SAVE_PLAN };

  /*
   * `.select()` after an insert is normally the trap that makes RLS kill
   * the write — but the id is genuinely needed to open the plan, and the
   * SELECT policy here matches the INSERT policy exactly (owner or staff),
   * so the read cannot fail where the write succeeded.
   */
  const { data, error } = await supabase
    .from('ad_campaigns')
    .insert([{ owner_id: auth.user.id, name: name.trim().slice(0, 120) || 'Untitled plan' }])
    .select('id')
    .single();

  if (error || !data) return { error: error?.message ?? 'That plan could not be created.' };
  return { id: String((data as { id: string }).id) };
}

/**
 * Put a placement in a plan.
 *
 * The rate is copied in as it stands, with its basis. A plan that re-read
 * the live rate every time would change under the advertiser between
 * looking and sending, which is the opposite of what a plan is for.
 */
export async function addPlacement(
  campaignId: string,
  advert: { id: string; pricing: number | null; currency?: string | null },
  days: number | null = 30,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('ad_campaign_placements').insert([{
    campaign_id: campaignId,
    advert_id: advert.id,
    days,
    rate_per_day: advert.pricing,
    /* Everything in this inventory is a rate card today. See campaignPlan.ts. */
    price_basis: advert.pricing == null ? 'unpriced' : 'indicative',
    currency: advert.currency ?? 'NGN',
  }]);

  if (error) {
    /* A duplicate is a mis-click, not a failure worth alarming anybody. */
    if (error.code === '23505') return { ok: false, error: DUPLICATE_PLACEMENT };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Put adverts into the advertiser's plan, starting one if they have none.
 *
 * The hub and the placement page both save into a plan, and used to be two
 * copies of the same four steps. Creating on first use means the first
 * placement somebody likes IS the moment they get a plan, rather than
 * making them set one up before they know they want it.
 *
 * Returns results rather than toasting: each page words its own feedback.
 * Stops at the first real failure and reports how many went in before it.
 */
export async function addAdvertsToPlan(
  adverts: { id: string; pricing: number | null }[],
): Promise<PlanAddResult> {
  /* Nothing to add is not a reason to read, or worse create, a plan. */
  if (adverts.length === 0) return { ok: true, added: 0, skipped: 0 };

  const read = await fetchCampaigns();
  if (read.state === 'unavailable') return { ok: false, error: read.reason, added: 0 };

  let planId = read.campaigns[0]?.id;
  let inPlan = new Set<string>();
  if (!planId) {
    const made = await createCampaign('My advertising plan');
    if ('error' in made) return { ok: false, error: made.error, added: 0 };
    planId = made.id;
  } else {
    inPlan = new Set((await fetchPlanLines(planId)).flatMap((l) => (l.advertId ? [l.advertId] : [])));
  }

  /*
   * The table is UNIQUE(campaign_id, advert_id), and "add all" will often
   * include something already there. That is not a failure: skip it, and
   * count it so the page can say so. The input is deduped too, so a list
   * naming one advert twice does not trip the constraint on itself.
   */
  let added = 0;
  let skipped = 0;
  const seen = new Set<string>();
  for (const advert of adverts) {
    if (seen.has(advert.id)) continue;
    seen.add(advert.id);
    if (inPlan.has(advert.id)) { skipped += 1; continue; }
    const out = await addPlacement(planId, advert, 30);
    if (!out.ok) {
      if (out.error === DUPLICATE_PLACEMENT) { skipped += 1; continue; }
      return { ok: false, error: out.error, added };
    }
    added += 1;
  }
  return { ok: true, added, skipped };
}

export async function removePlacement(lineId: string): Promise<boolean> {
  const { error } = await supabase.from('ad_campaign_placements').delete().eq('id', lineId);
  return !error;
}

export async function setLineDays(lineId: string, days: number | null): Promise<boolean> {
  const { error } = await supabase.from('ad_campaign_placements').update({ days }).eq('id', lineId);
  return !error;
}

/**
 * Mark that the advertiser has taken this plan to the media owners.
 *
 * `enquiry_sent` and no further. A booking is the existing payment flow and
 * lives where it already lives; writing "confirmed" here would be a claim
 * nothing has verified.
 */
export async function markEnquirySent(campaignId: string): Promise<boolean> {
  const { error } = await supabase
    .from('ad_campaigns')
    .update({ status: 'enquiry_sent', enquiry_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', campaignId);
  return !error;
}
