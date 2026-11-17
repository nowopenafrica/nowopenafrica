/**
 * NowOpen Credits (NOC) — the client side of the wallet, checkout and admin.
 *
 * Same rule as catalogue.ts and wallet.ts: NO credit logic here. Prices,
 * balances, classes, launch modes and every decision about money live in the
 * database (migrations 20261116010000…040000). This module calls those
 * functions and formats what they return. The pure helpers below only shape
 * numbers the database already decided, for display.
 *
 * NOC is closed-loop: not transferable, not withdrawable, no crypto. Nothing
 * here offers any of those, and the schema refuses them.
 */

import { supabase } from '../supabase';
import { formatMinor } from '../create/money';

export type NocClass = 'purchased' | 'included' | 'promotional' | 'reward' | 'sandbox';
export type PurchaseMode = 'off' | 'sandbox' | 'live';

/** Display names, in the order a wallet shows them. */
export const NOC_CLASS_LABELS: Record<NocClass, string> = {
  purchased: 'Bought',
  included: 'Included with your plan',
  promotional: 'Promotional',
  reward: 'Rewards',
  sandbox: 'Test top-ups',
};

export const NOC_CLASS_ORDER: NocClass[] = ['purchased', 'included', 'promotional', 'reward', 'sandbox'];

export interface NocMarket {
  code: string;
  currency: string;
  minorPerNoc: number;
  purchaseMode: PurchaseMode;
}

export interface NocWalletSummary {
  balance: number;
  held: number;
  available: number;
  classes: Record<NocClass, number>;
  spendOrder: NocClass[];
  market: NocMarket;
  canTopUp: boolean;
}

export interface NocPack {
  slug: string;
  name: string;
  credits: number;
  priceMinor: number;
  currency: string;
}

export interface NocQuote {
  ok: boolean;
  reason?: 'unknown_action' | 'not_available';
  action?: string;
  name?: string;
  pillar?: string | null;
  noc?: number;
  currency?: string;
  minorPerNoc?: number;
  valueMinor?: number;
  signedIn?: boolean;
  available?: number;
  shortfall?: number;
  packs?: NocPack[];
  suggestedPack?: NocPack | null;
  purchaseMode?: PurchaseMode;
  canTopUp?: boolean;
}

export interface NocOrderStart {
  reference: string;
  amountMinor: number;
  currency: string;
  email: string;
  mode: PurchaseMode;
  credits: number;
}

// ── shaping (pure) ──────────────────────────────────────────────────────

/* bigint columns arrive from PostgREST as strings; see catalogue.ts. */
function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

function toPack(r: Record<string, unknown>): NocPack {
  return {
    slug: String(r.slug),
    name: String(r.name),
    credits: num(r.credits),
    priceMinor: num(r.price_minor),
    currency: String(r.currency ?? 'NGN'),
  };
}

export function parseWalletSummary(raw: Record<string, unknown>): NocWalletSummary {
  const classes = (raw.classes ?? {}) as Record<string, unknown>;
  const market = (raw.market ?? {}) as Record<string, unknown>;
  return {
    balance: num(raw.balance),
    held: num(raw.held),
    available: num(raw.available),
    classes: Object.fromEntries(NOC_CLASS_ORDER.map((c) => [c, num(classes[c])])) as Record<NocClass, number>,
    spendOrder: ((raw.spend_order as NocClass[] | undefined) ?? NOC_CLASS_ORDER),
    market: {
      code: String(market.code ?? ''),
      currency: String(market.currency ?? 'NGN'),
      minorPerNoc: num(market.minor_per_noc),
      purchaseMode: (market.purchase_mode as PurchaseMode) ?? 'off',
    },
    canTopUp: raw.can_top_up === true,
  };
}

export function parseQuote(raw: Record<string, unknown>): NocQuote {
  if (raw.ok !== true) {
    return { ok: false, reason: raw.reason as NocQuote['reason'], action: raw.action as string, name: raw.name as string };
  }
  const packs = Array.isArray(raw.packs) ? (raw.packs as Record<string, unknown>[]).map(toPack) : [];
  return {
    ok: true,
    action: String(raw.action),
    name: String(raw.name),
    pillar: (raw.pillar as string | null) ?? null,
    noc: num(raw.noc),
    currency: String(raw.currency ?? 'NGN'),
    minorPerNoc: num(raw.minor_per_noc),
    valueMinor: num(raw.value_minor),
    signedIn: raw.signed_in === true,
    available: num(raw.available),
    shortfall: num(raw.shortfall),
    packs,
    suggestedPack: raw.suggested_pack ? toPack(raw.suggested_pack as Record<string, unknown>) : null,
    purchaseMode: (raw.purchase_mode as PurchaseMode) ?? 'off',
    canTopUp: raw.can_top_up === true,
  };
}

/** "1 NOC", "1,500 NOC". */
export function formatNoc(n: number): string {
  return `${Math.round(n).toLocaleString('en-NG')} NOC`;
}

/** The face value of a number of NOC in the market currency. */
export function nocValue(noc: number, minorPerNoc: number, currency: string): string {
  return formatMinor(noc * minorPerNoc, currency);
}

/**
 * The pack price per NOC, for "₦40 per NOC" beside a pack. Rounded to a
 * whole minor unit for display only.
 */
export function perNocMinor(pack: NocPack): number | null {
  if (!pack.credits) return null;
  return Math.round(pack.priceMinor / pack.credits);
}

/**
 * Smallest pack covering a shortfall, else the largest. Mirrors the choice
 * noc_quote makes, for a checkout that lets the customer pick another pack.
 */
export function packForShortfall(packs: NocPack[], shortfall: number): NocPack | null {
  if (shortfall <= 0 || packs.length === 0) return null;
  const covering = packs.filter((p) => p.credits >= shortfall).sort((a, b) => a.credits - b.credits);
  if (covering.length) return covering[0];
  return [...packs].sort((a, b) => b.credits - a.credits)[0];
}

/** What to say when top-ups are closed. Never implies a date. */
export function topUpClosedMessage(mode: PurchaseMode | undefined, canTopUp: boolean | undefined): string | null {
  if (canTopUp) return null;
  if (mode === 'sandbox') return 'Top-ups are being tested and are not open yet.';
  return 'Top-ups are not open yet.';
}

// ── database calls ──────────────────────────────────────────────────────

export async function fetchWalletSummary(): Promise<NocWalletSummary> {
  const { data, error } = await supabase.rpc('noc_wallet_summary');
  if (error) throw new Error(error.message);
  return parseWalletSummary((data ?? {}) as Record<string, unknown>);
}

export async function fetchQuote(action: string): Promise<NocQuote> {
  const { data, error } = await supabase.rpc('noc_quote', { p_action: action });
  if (error) throw new Error(error.message);
  return parseQuote((data ?? {}) as Record<string, unknown>);
}

export async function startPurchase(pack: string): Promise<NocOrderStart> {
  const { data, error } = await supabase.rpc('noc_start_purchase', { p_pack: pack });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    reference: String(r.reference),
    amountMinor: num(r.amount_minor),
    currency: String(r.currency),
    email: String(r.email),
    mode: r.mode as PurchaseMode,
    credits: num(r.credits),
  };
}

export interface NocHistoryRow {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

export async function fetchHistory(limit = 30): Promise<NocHistoryRow[]> {
  // Filter to the caller explicitly: RLS lets ADMINS read every wallet's
  // entries, so without this an admin's own wallet page lists everyone's.
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(authError.message);
  const uid = auth.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('id,type,amount,balance_after,description,created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    type: String(r.type),
    amount: num(r.amount),
    balanceAfter: num(r.balance_after),
    description: (r.description as string | null) ?? null,
    createdAt: String(r.created_at),
  }));
}

/** Plain-language names for ledger entry types. */
export const NOC_TYPE_LABELS: Record<string, string> = {
  purchase: 'Top-up',
  subscription_grant: 'Monthly allowance',
  promotional_grant: 'Credit added',
  usage: 'Used',
  refund: 'Refunded',
  admin_adjustment: 'Adjustment',
  expiration: 'Expired',
  reversal: 'Reversed',
};

// ── admin ───────────────────────────────────────────────────────────────

async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const nocAdmin = {
  report: (from?: string | null, to?: string | null) =>
    rpc<Record<string, unknown>>('noc_admin_report', { p_from: from ?? null, p_to: to ?? null }),
  findUsers: (q: string) => rpc<Array<{ id: string; email: string; name: string | null; plan: string; balance: number }>>(
    'noc_admin_find_users', { p_query: q }),
  wallet: (user: string) => rpc<Record<string, unknown>>('noc_admin_wallet', { p_user: user }),
  requestAdjustment: (user: string, cls: NocClass, amount: number, reason: string, evidence?: string) =>
    rpc('noc_admin_request_adjustment', { p_user: user, p_class: cls, p_amount: amount, p_reason: reason, p_evidence: evidence ?? null }),
  decideAdjustment: (id: string, approve: boolean, note?: string) =>
    rpc('noc_admin_decide_adjustment', { p_request: id, p_approve: approve, p_note: note ?? null }),
  reverse: (txn: string, reason: string) => rpc('noc_admin_reverse', { p_txn: txn, p_reason: reason }),
  refundUsage: (txn: string, reason: string) => rpc('noc_refund_usage', { p_txn: txn, p_reason: reason }),
  refundPurchase: (reference: string, reason: string, credits?: number | null) =>
    rpc('noc_admin_refund_purchase', { p_reference: reference, p_reason: reason, p_credits: credits ?? null }),
  updateMarket: (code: string, patch: { minorPerNoc?: number; enabled?: boolean; rateNote?: string }) =>
    rpc('noc_admin_update_market', {
      p_code: code, p_minor_per_noc: patch.minorPerNoc ?? null, p_enabled: patch.enabled ?? null, p_rate_note: patch.rateNote ?? null,
    }),
  setPurchaseMode: (market: string, mode: PurchaseMode, approval?: string | null) =>
    rpc('noc_admin_set_purchase_mode', { p_market: market, p_mode: mode, p_approval: approval ?? null }),
  recordApproval: (a: { scope: 'live_purchases' | 'settlement'; market: string | null; approverName: string; approverRole: string; documentRef: string; notes?: string }) =>
    rpc('noc_admin_record_approval', {
      p_scope: a.scope, p_market: a.market, p_approver_name: a.approverName, p_approver_role: a.approverRole,
      p_document_ref: a.documentRef, p_notes: a.notes ?? null,
    }),
  revokeApproval: (id: string, reason: string) => rpc('noc_admin_revoke_approval', { p_id: id, p_reason: reason }),
  updateProgramme: (patch: { rewardsEnabled?: boolean; requireDistinctApprover?: boolean }) =>
    rpc('noc_admin_update_programme', {
      p_rewards_enabled: patch.rewardsEnabled ?? null, p_settlement_enabled: null,
      p_spend_order: null, p_require_distinct_approver: patch.requireDistinctApprover ?? null,
    }),
};
