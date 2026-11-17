import { useEffect, useState } from 'react';

import { supabase } from '../supabase';
import { formatNoc, nocValue } from '../credits/noc';

/*
 * Create's three tiers (Free Library, Premium Studio, Signature), read from
 * the database.
 *
 * The tier and price of each engine item live in credit_actions
 * (category 'template', slug create.template.<item>), set by migration
 * 20261118020000 on the founder's approval. NOC's face value comes from
 * noc_markets. Nothing here is a typed price: change the row, and the page
 * follows.
 *
 * Every template row is switched off (enabled = false, held off by a CHECK
 * until entitlements exist), so a price here is a price that is SET, not one
 * anybody can pay yet. The page says so wherever it shows one.
 */

export type Tier = 'free' | 'premium' | 'signature';
export type TierFilter = 'all' | Tier;

export const TIERS: Tier[] = ['free', 'premium', 'signature'];

export const TIER_NAMES: Record<Tier, string> = {
  free: 'Free',
  premium: 'Premium',
  signature: 'Signature',
};

/** What each tier promises, in the words the review sheet approved. */
export const TIER_BLURBS: Record<Tier, string> = {
  free: 'Free Library: edit and export for your own business.',
  premium: 'Premium Studio: commercial use for one business, print-ready export, no NowOpen mark.',
  signature: 'Signature: everything in Premium, plus the editable source file and the full kit.',
};

export interface TierInfo {
  tier: Tier;
  noc: number;
  /** The review score a design must reach to be sold in this tier. */
  minScore: number;
  /** True once the row is switched on, which the database refuses today. */
  onSale: boolean;
}

export interface TierTable {
  byItem: Map<string, TierInfo>;
  minorPerNoc: number;
  currency: string;
}

const PREFIX = 'create.template.';
const isTier = (v: unknown): v is Tier => v === 'free' || v === 'premium' || v === 'signature';

interface ActionRow {
  slug: string;
  credit_cost: number | null;
  enabled: boolean;
  metadata: Record<string, unknown> | null;
}

/** credit_actions rows → item → tier. A row without a readable tier is left out, never guessed. */
export function parseTierRows(rows: ActionRow[]): Map<string, TierInfo> {
  const out = new Map<string, TierInfo>();
  for (const r of rows) {
    if (!r.slug.startsWith(PREFIX)) continue;
    const meta = r.metadata ?? {};
    const tier = meta.tier;
    if (!isTier(tier)) continue;
    const noc = r.credit_cost;
    if (noc === null || !Number.isFinite(noc) || noc < 0) continue;
    /* A paid tier priced at zero is a broken row, not a free design. */
    if (tier !== 'free' && noc === 0) continue;
    const item = (typeof meta.engine_item === 'string' && meta.engine_item) || r.slug.slice(PREFIX.length);
    const minScore = Number(meta.min_review_score);
    out.set(item, { tier, noc, minScore: Number.isFinite(minScore) ? minScore : 0, onSale: r.enabled === true });
  }
  return out;
}

/** "30 NOC (₦1,500)". */
export function priceText(info: TierInfo, minorPerNoc: number, currency: string): string {
  return `${formatNoc(info.noc)} (${nocValue(info.noc, minorPerNoc, currency)})`;
}

/** The short label on a badge: "Free", "Premium · 30 NOC". */
export function badgeText(info: TierInfo): string {
  return info.tier === 'free' ? TIER_NAMES.free : `${TIER_NAMES[info.tier]} · ${formatNoc(info.noc)}`;
}

/** Does an item belong under the chosen filter? An item with no known tier shows only under All. */
export function matchesTier(filter: TierFilter, info: TierInfo | undefined): boolean {
  return filter === 'all' || info?.tier === filter;
}

let loading: Promise<TierTable | null> | null = null;

/**
 * Read once per page load and shared. A failed read resolves to null: the
 * page then shows no tiers at all, rather than calling everything free.
 */
export function fetchTemplateTiers(): Promise<TierTable | null> {
  if (!loading) {
    loading = (async () => {
      try {
        const [actions, market] = await Promise.all([
          supabase.from('credit_actions').select('slug,credit_cost,enabled,metadata').eq('category', 'template'),
          supabase.from('noc_markets').select('minor_per_noc,currency').eq('code', 'NG').maybeSingle(),
        ]);
        if (actions.error || market.error || !market.data) return null;
        const byItem = parseTierRows((actions.data ?? []) as ActionRow[]);
        if (byItem.size === 0) return null;
        const m = market.data as { minor_per_noc: number; currency: string };
        return { byItem, minorPerNoc: Number(m.minor_per_noc), currency: m.currency };
      } catch {
        return null;
      }
    })();
  }
  return loading;
}

/** For tests. */
export function resetTemplateTiers(): void {
  loading = null;
}

export function useTemplateTiers(): TierTable | null {
  const [table, setTable] = useState<TierTable | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchTemplateTiers().then((t) => { if (alive) setTable(t); });
    return () => { alive = false; };
  }, []);
  return table;
}
