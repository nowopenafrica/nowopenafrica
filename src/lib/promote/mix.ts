/**
 * The budget mix: real promotion items for a goal at four budget levels.
 *
 * Pure on purpose. The hub page renders it and the plan page costs the same
 * lines, so nothing here formats money or invents a figure. Everything
 * returned is a whole naira amount; the page formats it.
 *
 * Unpriced rows never enter a level. A null price means nobody has quoted it,
 * and treating it as 0 would make a level look cheaper the more unknowns it
 * has, so those go to `onRequest` instead.
 */
import type { Goal, ChannelKind } from './goals';
import type { RevenueProduct } from '../revenue/products';
import type { Advertisement } from '../../types';
import { freeTool, type FreeTool } from './freeTools';
import { IMPORTED_FALLBACK, isListedPlacement, trustRank, type PlacementTrust } from './trust';

export type LevelKey = 'free' | 'starter' | 'growth' | 'campaign';

export const LEVELS: { key: LevelKey; label: string; ceilingNgn: number | null }[] = [
  { key: 'free', label: 'Free', ceilingNgn: 0 },
  { key: 'starter', label: 'Starter', ceilingNgn: 50000 },
  { key: 'growth', label: 'Growth', ceilingNgn: 250000 },
  { key: 'campaign', label: 'Campaign', ceilingNgn: null },
];

export type MixItem =
  | { kind: 'free'; tool: FreeTool; label: string; to: string }
  | { kind: 'product'; product: RevenueProduct; costNgn: number }
  | { kind: 'placement'; advert: Advertisement; costNgn: number; days: 30 };

export interface Mix {
  levels: { key: LevelKey; label: string; items: MixItem[]; totalNgn: number }[];
  onRequest: Advertisement[];
  cityHasPlacements: boolean;
}

const CAMPAIGN_CAP = 8;
const PLACEMENT_DAYS = 30 as const;

/** A missing status counts as live: rows without one are treated as active. */
const isActive = (a: Advertisement) => (a.status ?? 'active') === 'active';
/** The medium lives in `category`; some older rows carry it in `type`. */
const mediumOf = (a: Advertisement) => (a.category ?? a.type ?? '').trim();
/** The first comma segment is the city ("Lagos, Nigeria"), so a road or region that merely contains the name does not match. */
const inCity = (a: Advertisement, city: string | null) =>
  !city || (a.location ?? '').split(',')[0].trim().toLowerCase() === city.toLowerCase();
/** Zero is unpriced too: AdvertForm saves a blank price as 0, and 0 must never be costed. */
const isPriced = (a: Advertisement) => a.pricing != null && Number.isFinite(a.pricing) && a.pricing > 0;

export function buildMix(
  goal: Goal,
  input: {
    products: RevenueProduct[];
    adverts: Advertisement[];
    city: string | null;
    ngnPerUsd: number;
    /** placement_trust by advert id. Missing (or no Map) reads as the imported default. */
    trust?: Map<string, PlacementTrust>;
  },
): Mix {
  const city = input.city?.trim() || null;
  const { ngnPerUsd } = input;
  /*
   * Trust only breaks ties. At equal cost the better-evidenced placement
   * (verified, then confirmed available) comes first; it never makes a
   * dearer one win over a cheaper one, so every ceiling is exactly as before.
   * Without a trust Map every advert ranks the same and the id decides, as it
   * always did.
   */
  const rankOf = (a: Advertisement) => trustRank(input.trust?.get(String(a.id)) ?? IMPORTED_FALLBACK(String(a.id)));

  const goalCategories = new Set(
    goal.channels.flatMap((c) => (c.kind === 'placement' ? c.categories : [])),
  );
  // A rejected or archived placement is never recommended, priced or on request.
  const live = input.adverts.filter((a) => isActive(a) && isListedPlacement(a) && goalCategories.has(mediumOf(a)));
  const local = live.filter((a) => inCity(a, city));

  const onRequest = local.filter((a) => !isPriced(a));
  const cityHasPlacements = local.some(isPriced);

  const placementCost = (a: Advertisement) => Math.round((a.pricing as number) * PLACEMENT_DAYS * ngnPerUsd);
  /*
   * A product's own price in whole naira, by its currency. NGN is kobo; USD
   * minor units go through the same rate the page displays with. Any other
   * currency has no rate here, so the product is treated as unpriced and
   * left out rather than costed against a naira ceiling as if it were naira.
   */
  const productCost = (p: RevenueProduct): number | null => {
    if (p.priceMinor == null || p.priceMinor <= 0) return null;
    if (p.currency === 'NGN') return Math.round(p.priceMinor / 100);
    if (p.currency === 'USD') return Math.round((p.priceMinor / 100) * ngnPerUsd);
    return null;
  };
  const productFor = (slug: string) =>
    input.products.find((p) => p.slug === slug && p.active && productCost(p) != null);

  const freeItems = (): MixItem[] =>
    goal.channels.flatMap((c) =>
      c.kind === 'free'
        ? [{ kind: 'free' as const, tool: c.tool, label: freeTool(c.tool).label, to: freeTool(c.tool).to }]
        : [],
    );

  /** Priced local adverts for a channel: cheapest first, then most trusted, then id. */
  const candidates = (c: Extract<ChannelKind, { kind: 'placement' }>) =>
    local
      .filter((a) => isPriced(a) && c.categories.includes(mediumOf(a)))
      .sort((a, b) =>
        (a.pricing as number) - (b.pricing as number) || rankOf(a) - rankOf(b) || a.id.localeCompare(b.id));

  /** Each level starts again from its own free tools; levels never inherit. */
  const fill = (ceiling: number | null): { items: MixItem[]; totalNgn: number } => {
    const items = freeItems();
    const used = new Set<string>();
    let total = 0;

    for (const c of goal.channels) {
      if (c.kind === 'free') continue;
      if (ceiling == null && items.length >= CAMPAIGN_CAP) break;

      let item: Exclude<MixItem, { kind: 'free' }> | null = null;
      if (c.kind === 'product') {
        const p = productFor(c.slug);
        if (p && !used.has(`p:${p.id}`)) item = { kind: 'product', product: p, costNgn: productCost(p) as number };
      } else {
        const list = candidates(c).filter((a) => !used.has(`a:${a.id}`));
        // Campaign has no ceiling, so it takes the best (dearest) one: among
        // equally dear, the most trusted; among those, the last id, as before.
        const pick = ceiling == null
          ? list.reduce<Advertisement | undefined>((best, a) => (
            !best
            || (a.pricing as number) > (best.pricing as number)
            || ((a.pricing as number) === (best.pricing as number) && rankOf(a) <= rankOf(best))
              ? a : best), undefined)
          : list.find((a) => total + placementCost(a) <= ceiling);
        if (pick) item = { kind: 'placement', advert: pick, costNgn: placementCost(pick), days: PLACEMENT_DAYS };
      }
      if (!item) continue;
      if (ceiling != null && total + item.costNgn > ceiling) continue;

      used.add(item.kind === 'product' ? `p:${item.product.id}` : `a:${item.advert.id}`);
      items.push(item);
      total += item.costNgn;
    }
    return { items, totalNgn: total };
  };

  return {
    levels: LEVELS.map((l) => ({
      key: l.key,
      label: l.label,
      ...(l.ceilingNgn === 0 ? { items: freeItems(), totalNgn: 0 } : fill(l.ceilingNgn)),
    })),
    onRequest,
    cityHasPlacements,
  };
}
