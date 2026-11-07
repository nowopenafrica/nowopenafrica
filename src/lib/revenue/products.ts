/**
 * What NowOpen sells, read from the database rather than the bundle.
 *
 * Every price on this platform still lives in src/data/pricingPlans.ts and
 * ships in the JavaScript. Changing one needs an engineer, a build and a
 * deploy — so prices do not change, and the person who owns the commercial
 * decision cannot make it. These products are the first that do not work that
 * way.
 *
 * MEASURED 2026-09-22: all seven promotion products exist and NONE is priced.
 * That is the designed starting state, not an outage: a product cannot be
 * activated without a price somebody chose, so until an operator sets one,
 * nothing is for sale. Callers must render that honestly rather than showing
 * a placeholder number.
 */

import { supabase } from '../supabase';

export type ProductKind = 'promotion' | 'placement' | 'subscription' | 'service';

export interface RevenueProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: ProductKind;
  /** Minor units (kobo). NULL means nobody has priced it — never treat as 0. */
  priceMinor: number | null;
  currency: string;
  durationDays: number | null;
  scopeCategory: string | null;
  scopeLocation: string | null;
  maxConcurrent: number | null;
  active: boolean;
  sortOrder: number;
}

interface Row {
  id: string; slug: string; name: string; description: string | null;
  kind: string; price_minor: number | string | null; currency: string;
  duration_days: number | null; scope_category: string | null;
  scope_location: string | null; max_concurrent: number | null;
  active: boolean; sort_order: number;
}

/*
 * bigint arrives from PostgREST as a STRING, not a number.
 *
 * `250000` comes back as "250000", and `"250000" / 100` happens to work in JS
 * while `"250000" + 0` gives "2500000". Money that is sometimes a string is
 * how a total silently gains a digit, so it is converted once, here.
 */
function toMinor(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

function fromRow(r: Row): RevenueProduct {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    kind: r.kind as ProductKind,
    priceMinor: toMinor(r.price_minor),
    currency: r.currency,
    durationDays: r.duration_days,
    scopeCategory: r.scope_category,
    scopeLocation: r.scope_location,
    maxConcurrent: r.max_concurrent,
    active: r.active,
    sortOrder: r.sort_order,
  };
}

/**
 * Products a customer may buy.
 *
 * RLS already limits anonymous callers to active rows; the explicit filter is
 * here so an ADMIN — whose policy lets them read drafts — does not see unlaunched
 * products on the public page and assume customers can too.
 */
export async function listSellableProducts(
  kind?: ProductKind,
): Promise<{ products: RevenueProduct[]; failed: boolean }> {
  let q = supabase
    .from('revenue_products')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (kind) q = q.eq('kind', kind);

  // `error`, not a rejection — supabase-js resolves with { data, error }.
  const { data, error } = await q;
  if (error) return { products: [], failed: true };
  return { products: ((data ?? []) as Row[]).map(fromRow), failed: false };
}

/** Every product including drafts. Admin surfaces only; RLS enforces it. */
export async function listAllProducts(): Promise<{ products: RevenueProduct[]; failed: boolean }> {
  const { data, error } = await supabase
    .from('revenue_products')
    .select('*')
    .order('kind', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) return { products: [], failed: true };
  return { products: ((data ?? []) as Row[]).map(fromRow), failed: false };
}

/**
 * Money, formatted for people.
 *
 * Returns null for an unpriced product rather than "₦0.00". A price of zero
 * and the absence of a price are different facts, and rendering them the same
 * way tells a customer something is free when nobody has decided what it costs.
 */
export function formatPrice(minor: number | null, currency: string): string | null {
  if (minor === null) return null;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(minor / 100);
  } catch {
    // An unknown currency code must not take the page down.
    return `${currency} ${(minor / 100).toLocaleString()}`;
  }
}

/** Parse what an operator typed into minor units. Rejects anything not money. */
export function parsePriceToMinor(input: string): number | null {
  const cleaned = input.replace(/[^\d.]/g, '');
  if (!cleaned) return null;
  const major = Number(cleaned);
  if (!Number.isFinite(major) || major < 0) return null;
  // Rounded, not truncated: 2500.999 is a typo, and silently charging
  // 2500.99 instead of 2501 is worse than either.
  return Math.round(major * 100);
}
