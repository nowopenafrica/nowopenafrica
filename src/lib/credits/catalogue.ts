/**
 * The credit catalogue — what credits buy, and what they are sold in.
 *
 * ── WHAT THIS MODULE DELIBERATELY DOES NOT DO ────────────────────────────
 *
 * It contains no credit logic. No balance arithmetic, no cost decisions, no
 * entitlement checks. Those all live in the database, in SECURITY DEFINER
 * functions, because the browser talks to Postgres directly: anything decided
 * here could be skipped by anyone with the network tab open.
 *
 * This module reads the catalogue and calls those functions. If you find
 * yourself adding `if (balance >= cost)` to this file, the check belongs in
 * the database and the answer it gives here is advisory at best.
 *
 * ── UNPRICED IS NOT FREE ─────────────────────────────────────────────────
 *
 * `creditCost` and `priceMinor` are NULL until somebody sets them, and that
 * means REFUSED, not zero — the same rule src/lib/revenue/products.ts already
 * follows. Callers must render "not available yet", never a placeholder
 * number and never a free action.
 */

import { supabase } from '../supabase';

export interface CreditAction {
  slug: string;
  name: string;
  description: string | null;
  category: string;
  /** NULL means nobody has priced it, which refuses the action. Never 0. */
  creditCost: number | null;
  enabled: boolean;
  /** True when the action calls a paid external API and must reserve first. */
  requiresReservation: boolean;
  minPlan: string | null;
}

export interface CreditPackage {
  slug: string;
  name: string;
  description: string | null;
  credits: number;
  bonusCredits: number;
  /** Minor units (kobo). NULL means not for sale — never treat as 0. */
  priceMinor: number | null;
  currency: string;
  active: boolean;
  featured: boolean;
  sortOrder: number;
}

/*
 * bigint arrives from PostgREST as a STRING.
 *
 * `500000` comes back as "500000", and "500000" / 100 happens to work in JS
 * while "500000" + 0 gives "5000000". Money that is sometimes a string is a
 * bug waiting for the one place somebody adds instead of divides. The same
 * note exists in src/lib/revenue/products.ts, for the same reason.
 */
function minorUnits(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

interface ActionRow {
  slug: string; name: string; description: string | null; category: string;
  credit_cost: number | null; enabled: boolean;
  requires_reservation: boolean; min_plan: string | null;
}

interface PackageRow {
  slug: string; name: string; description: string | null;
  credits: number; bonus_credits: number;
  price_minor: number | string | null; currency: string;
  active: boolean; featured: boolean; sort_order: number;
}

/** Every action in the catalogue, including the ones not yet priced. */
export async function fetchCreditActions(): Promise<CreditAction[]> {
  const { data, error } = await supabase
    .from('credit_actions')
    .select('slug,name,description,category,credit_cost,enabled,requires_reservation,min_plan')
    .order('category')
    .order('slug');

  // supabase-js RESOLVES with {data,error} — a .catch() here would be dead
  // code and the failure would render as an empty catalogue.
  if (error) throw new Error(error.message);

  return ((data ?? []) as ActionRow[]).map((r) => ({
    slug: r.slug,
    name: r.name,
    description: r.description,
    category: r.category,
    creditCost: r.credit_cost,
    enabled: r.enabled,
    requiresReservation: r.requires_reservation,
    minPlan: r.min_plan,
  }));
}

/** Credit packs. Includes unpriced ones so an admin screen can show them. */
export async function fetchCreditPackages(): Promise<CreditPackage[]> {
  const { data, error } = await supabase
    .from('credit_packages')
    .select('slug,name,description,credits,bonus_credits,price_minor,currency,active,featured,sort_order')
    .order('sort_order');

  if (error) throw new Error(error.message);

  return ((data ?? []) as PackageRow[]).map((r) => ({
    slug: r.slug,
    name: r.name,
    description: r.description,
    credits: r.credits,
    bonusCredits: r.bonus_credits,
    priceMinor: minorUnits(r.price_minor),
    currency: r.currency,
    active: r.active,
    featured: r.featured,
    sortOrder: r.sort_order,
  }));
}

/** An action a customer can actually perform today. */
export function isActionLive(a: CreditAction): boolean {
  return a.enabled && a.creditCost !== null;
}

/** A pack a customer can actually buy today. */
export function isPackageForSale(p: CreditPackage): boolean {
  return p.active && p.priceMinor !== null;
}

/** What a pack actually delivers. Shown as "500 + 50 bonus = 550". */
export function totalCredits(p: CreditPackage): number {
  return p.credits + p.bonusCredits;
}

/**
 * Is the credit programme live enough to advertise?
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * MEASURED 2026-10-06: src/pages/Pricing.tsx told every visitor "Every plan
 * comes with AI credits each month — power your copy, images and business
 * assistant. Use them across Studio, or top up when you need more", above a
 * grid reading 50 / 500 / 2,000.
 *
 * None of it was true. There was no wallet, no ledger, no grant, no way to
 * spend a credit and no way to top up — the numbers came from a hardcoded
 * field in pricingPlans.ts and nothing in the platform could honour them.
 *
 * So the page now ASKS. The moment an operator prices and enables an action,
 * the claim becomes true and the page starts making it; until then it says so
 * plainly. A marketing claim should be a reading of the system, not a
 * constant that was true when somebody typed it.
 */
export function isCreditProgrammeLive(actions: CreditAction[]): boolean {
  return actions.some(isActionLive);
}
