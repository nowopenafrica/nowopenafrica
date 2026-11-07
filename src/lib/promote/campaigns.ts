/**
 * Reading and writing an advertiser's media plan.
 *
 * The decisions — what a plan costs, what is missing, whether it may be
 * sent — are in `campaignPlan.ts` and have no network in them. This module
 * is only the part that talks to the database, kept thin on purpose.
 */

import { supabase } from '../supabase';
import { withListing, type PlanLine, type PriceBasis } from './campaignPlan';
import { fetchPlacementTrustResult } from './trust';
import type { RevenueProduct } from '../revenue/products';
import { classifyArtworkFile } from './artworkSource';
import { safeArtworkName } from '../create/artwork';
import {
  addLocalLines, clearLocalPlan, notifyPlanChanged, readLocalPlan, replaceLocalPlan,
  type LocalLine,
} from './localPlan';

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

const PLAN_LINE_COLUMNS = `
  id, advert_id, product_id, days, price_basis, rate_per_day, price_minor, currency,
  artwork_url, artwork_design_id, artwork_width, artwork_height,
  advertisements ( title, type, location, dimensions ),
  revenue_products ( name, slug, active, duration_days )
`;

export type PlanLinesRead =
  | { state: 'ready'; lines: PlanLine[] }
  /** The read failed. NEVER rendered as an empty plan, and never an empty tray. */
  | { state: 'unavailable'; reason: string };

const LINES_UNAVAILABLE = 'We could not load your plan just now.';

/**
 * The lines of one plan: placements and NowOpen products, each with its own
 * details joined in.
 *
 * Both joins are left joins. A deleted placement cascades its line away, so a
 * line never comes back as a row of nulls; a product that has been switched
 * off keeps its line but is `offered: false`. A placement's `offered` is
 * decided later from `placement_trust` on the page, so it starts true here.
 */
export async function fetchPlanLines(campaignId: string): Promise<PlanLinesRead> {
  const { data, error } = await supabase
    .from('ad_campaign_placements')
    .select(PLAN_LINE_COLUMNS)
    .eq('campaign_id', campaignId)
    .order('created_at');

  /* A failed read is not an empty plan: an empty answer here would let "add" skip nothing and the tray look fine. */
  if (error || !data) return { state: 'unavailable', reason: LINES_UNAVAILABLE };

  return { state: 'ready', lines: (data as unknown as RawLine[]).map((r) => {
    const isProduct = r.product_id != null;
    return {
      id: String(r.id),
      advertId: r.advert_id == null ? null : String(r.advert_id),
      title: isProduct ? (r.revenue_products?.name ?? 'NowOpen product') : (r.advertisements?.title ?? 'Placement'),
      type: r.advertisements?.type ?? null,
      location: r.advertisements?.location ?? null,
      dimensions: r.advertisements?.dimensions ?? null,
      days: r.days == null ? null : Number(r.days),
      ratePerDay: r.rate_per_day == null ? null : Number(r.rate_per_day),
      priceBasis: (r.price_basis as PriceBasis) ?? 'indicative',
      currency: String(r.currency ?? 'NGN'),
      artworkUrl: r.artwork_url ?? null,
      kind: isProduct ? ('product' as const) : ('placement' as const),
      productId: r.product_id == null ? null : String(r.product_id),
      priceMinor: r.price_minor == null ? null : Number(r.price_minor),
      artworkDesignId: r.artwork_design_id ?? null,
      artworkWidth: r.artwork_width == null ? null : Number(r.artwork_width),
      artworkHeight: r.artwork_height == null ? null : Number(r.artwork_height),
      offered: isProduct ? r.revenue_products?.active === true : true,
    };
  }) };
}

interface RawLine {
  id: string;
  advert_id: string | null;
  product_id: string | null;
  days: number | null;
  price_basis: string;
  rate_per_day: number | null;
  price_minor: number | string | null;
  currency: string;
  artwork_url: string | null;
  artwork_design_id: string | null;
  artwork_width: number | null;
  artwork_height: number | null;
  advertisements: { title: string; type: string | null; location: string | null; dimensions: string | null } | null;
  revenue_products: { name: string; slug: string; active: boolean; duration_days: number | null } | null;
}

const NOT_OFFERED_TITLE = 'No longer on offer';

/**
 * A signed-out visitor's local plan, read back as plan lines.
 *
 * Only public columns are read. Ids are `local:<itemId>` so they can never be
 * mistaken for a database line. A row that no longer exists, or a product that
 * is inactive or has no price, is `offered: false`. Placement listing rules
 * and trust are NOT applied here; the page does that.
 *
 * THROWS if a read fails, rather than calling every line "No longer on offer"
 * on the back of a network blip.
 */
export async function fetchLocalPlanLines(lines: LocalLine[]): Promise<PlanLine[]> {
  const advertIds = [...new Set(lines.flatMap((l) => (l.kind === 'placement' ? [l.advertId] : [])))];
  const productIds = [...new Set(lines.flatMap((l) => (l.kind === 'product' ? [l.productId] : [])))];

  const [ads, prods] = await Promise.all([
    advertIds.length === 0
      ? Promise.resolve({ data: [] as unknown[], error: null })
      : supabase.from('advertisements').select('id,title,type,location,dimensions,pricing').in('id', advertIds),
    productIds.length === 0
      ? Promise.resolve({ data: [] as unknown[], error: null })
      : supabase.from('revenue_products').select('id,name,slug,active,duration_days,price_minor,currency').in('id', productIds),
  ]);
  if (ads.error || prods.error) throw new Error('The local plan could not be read.');

  const adById = new Map<string, Record<string, unknown>>();
  for (const r of (ads.data ?? []) as Record<string, unknown>[]) adById.set(String(r.id), r);
  const prodById = new Map<string, Record<string, unknown>>();
  for (const r of (prods.data ?? []) as Record<string, unknown>[]) prodById.set(String(r.id), r);

  const blank = (id: string, kind: 'placement' | 'product'): PlanLine => ({
    id: `local:${id}`,
    advertId: kind === 'placement' ? id : null,
    title: NOT_OFFERED_TITLE,
    type: null,
    location: null,
    dimensions: null,
    days: null,
    ratePerDay: null,
    priceBasis: 'unpriced',
    currency: 'NGN',
    artworkUrl: null,
    kind,
    productId: kind === 'product' ? id : null,
    priceMinor: null,
    artworkDesignId: null,
    artworkWidth: null,
    artworkHeight: null,
    offered: false,
  });

  return lines.map((l): PlanLine => {
    if (l.kind === 'placement') {
      const r = adById.get(l.advertId);
      if (!r) return blank(l.advertId, 'placement');
      const pricing = r.pricing == null ? null : Number(r.pricing);
      return {
        ...blank(l.advertId, 'placement'),
        title: String(r.title ?? '').trim() || 'Placement',
        type: (r.type as string) ?? null,
        location: (r.location as string) ?? null,
        dimensions: (r.dimensions as string) ?? null,
        days: l.days,
        ratePerDay: pricing,
        priceBasis: pricing == null ? 'unpriced' : 'indicative',
        offered: true,
      };
    }
    const r = prodById.get(l.productId);
    const price = r?.price_minor == null ? null : Number(r.price_minor);
    if (!r || r.active !== true || price == null || !Number.isFinite(price)) return blank(l.productId, 'product');
    return {
      ...blank(l.productId, 'product'),
      title: String(r.name ?? '').trim() || 'NowOpen product',
      days: r.duration_days == null ? null : Number(r.duration_days),
      priceBasis: 'fixed',
      priceMinor: price,
      currency: String(r.currency ?? 'NGN'),
      offered: true,
    };
  });
}

const DUPLICATE_PLACEMENT = 'That placement is already in this plan.';

/** What a signed-out visitor is told by `createCampaign`; planToast adds the way to sign in. */
export const SIGN_IN_TO_SAVE_PLAN = 'Sign in to save a plan.';

/** The outcome of adding placements and products to the plan. */
export type PlanAddResult =
  /** `local` means it went into this browser's plan because nobody is signed in. */
  | { ok: true; added: number; skipped: number; local?: boolean }
  /** `skipped` is how many were already in the plan before the failure. */
  | { ok: false; error: string; added: number; skipped?: number };

/** Start a plan. Returns its id, or null with the reason reported. */
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
  notifyPlanChanged();
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
  notifyPlanChanged();
  return { ok: true };
}

/**
 * One thing to put in the plan. A placement's rate is copied in as it stands;
 * a product carries its fixed minor-unit price, its currency and its duration
 * (`days`, from `RevenueProduct.durationDays`).
 */
export type PlanItem =
  /** `days` defaults to 30 when left out. */
  | { kind: 'placement'; id: string; pricing: number | null; days?: number | null }
  | { kind: 'product'; id: string; priceMinor: number; days: number | null; currency: string };

/**
 * A NowOpen product as a plan item, or null when it cannot join a plan.
 *
 * Only a priced NGN product: plan lines cost products as NGN kobo
 * (campaignPlan.lineCost), so any other currency would sit in the plan
 * uncosted. Those keep the enquiry link instead. Every active product is NGN
 * today; this is the guard for the day one is not.
 */
export function productPlanItem(p: RevenueProduct): Extract<PlanItem, { kind: 'product' }> | null {
  if (p.priceMinor == null || p.currency !== 'NGN') return null;
  return { kind: 'product', id: p.id, priceMinor: p.priceMinor, days: p.durationDays, currency: p.currency };
}

const localKey = (l: LocalLine) => (l.kind === 'placement' ? `placement:${l.advertId}` : `product:${l.productId}`);
const itemKey = (i: PlanItem) => `${i.kind}:${i.id}`;

async function addProduct(
  campaignId: string,
  item: Extract<PlanItem, { kind: 'product' }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('ad_campaign_placements').insert([{
    campaign_id: campaignId,
    product_id: item.id,
    days: item.days,
    price_basis: 'fixed',
    price_minor: item.priceMinor,
    currency: item.currency,
  }]);
  if (error) {
    if (error.code === '23505') return { ok: false, error: DUPLICATE_PLACEMENT };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Put placements and products into the plan.
 *
 * Signed in, they go into the advertiser's first plan (started if they have
 * none: the first thing somebody likes IS the moment they get a plan). Signed
 * out, they go into the browser-held plan and no campaign is created; the
 * result says `local: true` so the page can offer sign-in, and
 * `migrateLocalPlan` moves them into the account afterwards.
 *
 * Returns results rather than toasting: each page words its own feedback.
 * Stops at the first real failure and reports how many went in before it.
 * Items already in the plan are skipped and counted, not errors.
 */
export async function addToPlan(items: PlanItem[]): Promise<PlanAddResult> {
  /* Nothing to add is not a reason to read, or worse create, a plan. */
  if (items.length === 0) return { ok: true, added: 0, skipped: 0 };

  /*
   * Signed out means NO SESSION. getUser() is a network call, so a blip or a
   * token-refresh race must not send a signed-in user's adds to this browser.
   */
  const { data: sess, error: sessError } = await supabase.auth.getSession();
  /* An unreadable session is not "signed out": nothing goes to this browser. */
  if (sessError) return { ok: false, error: 'We could not reach your account just now.', added: 0 };
  if (!sess?.session) {
    const local: LocalLine[] = items.map((i) =>
      i.kind === 'placement'
        ? { kind: 'placement', advertId: i.id, days: i.days === undefined ? 30 : i.days }
        : { kind: 'product', productId: i.id },
    );
    return { ok: true, ...addLocalLines(local), local: true };
  }
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user?.id) {
    return { ok: false, error: 'We could not reach your account just now.', added: 0 };
  }

  const read = await fetchCampaigns();
  if (read.state === 'unavailable') return { ok: false, error: read.reason, added: 0 };

  let planId = read.campaigns[0]?.id;
  let inPlan = new Set<string>();
  if (!planId) {
    const made = await createCampaign('My advertising plan');
    if ('error' in made) return { ok: false, error: made.error, added: 0 };
    planId = made.id;
  } else {
    /* Unknown contents are not empty contents: skipping nothing would trip the unique key and misreport. */
    const there = await fetchPlanLines(planId);
    if (there.state === 'unavailable') return { ok: false, error: there.reason, added: 0 };
    inPlan = new Set(
      there.lines.flatMap((l) =>
        l.productId ? [`product:${l.productId}`] : l.advertId ? [`placement:${l.advertId}`] : [],
      ),
    );
  }

  /*
   * The table is UNIQUE per (campaign, advert) and (campaign, product), and
   * "add all" will often include something already there. Skip and count it.
   * The input is deduped too, so a list naming one item twice does not trip the
   * constraint on itself.
   */
  let added = 0;
  let skipped = 0;
  const finish = (r: PlanAddResult): PlanAddResult => {
    if (added > 0) notifyPlanChanged();
    return r;
  };
  const seen = new Set<string>();
  for (const item of items) {
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    if (inPlan.has(key)) { skipped += 1; continue; }
    const out = item.kind === 'placement'
      ? await addPlacement(planId, { id: item.id, pricing: item.pricing }, item.days === undefined ? 30 : item.days)
      : await addProduct(planId, item);
    if (!out.ok) {
      if (out.error === DUPLICATE_PLACEMENT) { skipped += 1; continue; }
      return finish({ ok: false, error: out.error, added, skipped });
    }
    added += 1;
  }
  return finish({ ok: true, added, skipped });
}

/** Placements only; kept so existing callers compile. See `addToPlan`. */
export async function addAdvertsToPlan(
  adverts: { id: string; pricing: number | null }[],
): Promise<PlanAddResult> {
  return addToPlan(adverts.map((a) => ({ kind: 'placement' as const, id: a.id, pricing: a.pricing })));
}

/**
 * Move the browser-held plan into the account, at sign-in.
 *
 * Null when there is nothing local (or nobody is signed in, or the local rows
 * or their listing status could not be read), and then nothing is touched. A
 * placement placement_trust no longer lists is not on offer: it stays local
 * and is never moved. Otherwise returns how many
 * lines are now in the account (`moved`, including ones that were already
 * there) and how many stay on this device (`kept`: lines that failed to move,
 * and lines no longer on offer). Local storage is cleared only when `kept` is
 * 0; otherwise it holds exactly what did not move, so a second run finishes
 * the job without duplicating anything.
 */
export async function migrateLocalPlan(): Promise<{ moved: number; kept: number } | null> {
  const local = readLocalPlan();
  if (local.length === 0) return null;

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user?.id) return null;

  let resolved: PlanLine[];
  try {
    resolved = await fetchLocalPlanLines(local);
  } catch {
    return null;
  }

  /* Listing status, the same rule the plan page applies. A failed read moves nothing. */
  const advertIds = [...new Set(resolved.flatMap((l) => (l.kind === 'placement' && l.advertId ? [l.advertId] : [])))];
  if (advertIds.length > 0) {
    const trust = await fetchPlacementTrustResult(advertIds);
    if (trust.failed) return null;
    resolved = withListing(resolved, trust);
  }

  const items: PlanItem[] = [];
  /** Index in `local` of each entry of `items`. */
  const itemAt: number[] = [];
  local.forEach((l, i) => {
    const pl = resolved[i];
    if (!pl || !pl.offered) return;
    itemAt.push(i);
    items.push(
      l.kind === 'placement'
        ? { kind: 'placement', id: l.advertId, pricing: pl.ratePerDay, days: l.days }
        : { kind: 'product', id: l.productId, priceMinor: pl.priceMinor ?? 0, days: pl.days, currency: pl.currency },
    );
  });

  let processed = items.length;
  if (items.length > 0) {
    const out = await addToPlan(items);
    if (!out.ok) processed = out.added + (out.skipped ?? 0);
    else if (out.local) processed = 0; // signed out mid-flight: nothing reached the account
  }

  const moving = new Set(itemAt.slice(0, processed));
  const remaining = local.filter((_, i) => !moving.has(i));
  /* Re-read so a line added while this ran survives; drop only what moved. */
  const movedKeys = new Set(local.filter((_, i) => moving.has(i)).map(localKey));
  const now = readLocalPlan().filter((l) => !movedKeys.has(localKey(l)));
  if (now.length === 0) clearLocalPlan();
  else replaceLocalPlan(now);
  return { moved: moving.size, kept: remaining.length };
}

/*
 * Writes below read back the ids they touched. RLS hides a row it will not
 * let you change by matching nothing, which supabase-js reports as success;
 * 0 rows is a failure. The owner SELECT policy covers the read-back, and these
 * are not anonymous inserts, so .select() cannot lose the write.
 */
const touchedOne = (r: { data: unknown; error: unknown }) =>
  !r.error && Array.isArray(r.data) && r.data.length > 0;

export async function removePlacement(lineId: string): Promise<boolean> {
  const out = await supabase.from('ad_campaign_placements').delete().eq('id', lineId).select('id');
  const ok = touchedOne(out);
  if (ok) notifyPlanChanged();
  return ok;
}

export async function setLineDays(lineId: string, days: number | null): Promise<boolean> {
  const out = await supabase.from('ad_campaign_placements').update({ days }).eq('id', lineId).select('id');
  const ok = touchedOne(out);
  if (ok) notifyPlanChanged();
  return ok;
}

const PLAN_ARTWORK_BUCKET = 'plan-artwork';
const VIDEO_MESSAGE = 'Attach an image of the artwork; video adverts are sent with the quote request.';
const BUCKET_IMAGE = /^image\/(png|jpeg|webp)$/;

/** The MIME type to upload as: the file's own, or from the extension when it is empty or generic. */
function artworkMime(file: { name: string; type: string }): string {
  const type = (file.type || '').toLowerCase();
  if (type && type !== 'application/octet-stream') return type;
  const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'jfif') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return type;
}

/** Record an uploaded or designed artwork on a plan line. `path` is a storage path in `plan-artwork`. */
export async function setLineArtwork(
  lineId: string,
  art: { path: string; width: number; height: number; designId?: string | null },
): Promise<boolean> {
  const out = await supabase
    .from('ad_campaign_placements')
    .update({
      artwork_url: art.path,
      artwork_width: art.width,
      artwork_height: art.height,
      artwork_design_id: art.designId ?? null,
    })
    .eq('id', lineId)
    .select('id');
  if (!touchedOne(out)) return false;
  notifyPlanChanged();
  return true;
}

/**
 * Upload an image to the private `plan-artwork` bucket under the owner's own
 * folder (the bucket policy needs the first path folder to be the user id).
 * Images only: PNG, JPEG or WebP, which is what the bucket accepts.
 */
export async function uploadLineArtwork(
  campaignId: string,
  lineId: string,
  file: File,
): Promise<{ path: string } | { error: string }> {
  const verdict = classifyArtworkFile(file);
  if (!verdict.ok) return { error: verdict.problem };
  if (verdict.kind === 'video') return { error: VIDEO_MESSAGE };
  return uploadLineArtworkBlob(campaignId, lineId, file, file.name);
}

/**
 * The same upload for an image made in the app (a Studio export), which has no
 * File. The storage path rule and the MIME handling live here once.
 */
export async function uploadLineArtworkBlob(
  campaignId: string,
  lineId: string,
  blob: Blob,
  name: string,
): Promise<{ path: string } | { error: string }> {
  const mime = artworkMime({ name, type: blob.type });
  if (!BUCKET_IMAGE.test(mime)) {
    return { error: 'Attach the artwork as a PNG, JPG or WebP image.' };
  }

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user?.id) return { error: 'Sign in to attach artwork.' };

  const path = `${auth.user.id}/${campaignId}/${lineId}-${safeArtworkName(name)}`;
  const { error } = await supabase.storage
    .from(PLAN_ARTWORK_BUCKET)
    .upload(path, blob, { upsert: true, contentType: mime });
  if (error) return { error: error.message || 'That artwork could not be uploaded.' };
  return { path };
}

/** A short-lived link to private artwork, or null when it cannot be signed. */
export async function artworkUrlFor(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(PLAN_ARTWORK_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export type OwnDesignsRead =
  | { state: 'ready'; designs: { id: string; title: string; width: number; height: number }[] }
  /** The read failed. NEVER rendered as "you have no designs". */
  | { state: 'unavailable'; reason: string };

const isSize = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** The signed-in user's newest 30 Create designs, sized from their first page. */
export async function fetchOwnDesigns(): Promise<OwnDesignsRead> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user?.id) return { state: 'unavailable', reason: 'Sign in to use your designs.' };

  const { data, error } = await supabase
    .from('design_projects')
    .select('id,title,pages:document->pages')
    .eq('user_id', auth.user.id)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(30);
  if (error) return { state: 'unavailable', reason: 'We could not load your designs just now.' };

  const designs: { id: string; title: string; width: number; height: number }[] = [];
  for (const r of (data ?? []) as unknown as { id: string; title: string | null; pages: unknown }[]) {
    const page = Array.isArray(r.pages) ? (r.pages[0] as { width?: unknown; height?: unknown } | undefined) : undefined;
    /* A size is never guessed: a design without one is left out. */
    if (!page || !isSize(page.width) || !isSize(page.height)) continue;
    designs.push({ id: String(r.id), title: String(r.title ?? '').trim() || 'Untitled design', width: page.width, height: page.height });
  }
  return { state: 'ready', designs };
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
  if (!error) notifyPlanChanged();
  return !error;
}
