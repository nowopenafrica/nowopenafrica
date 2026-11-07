/**
 * What a media plan adds up to — and what it refuses to add up to.
 *
 * ── THE RULE THIS MODULE EXISTS TO ENFORCE ───────────────────────────────
 *
 * MEASURED on production: all 97 rows of `advertisements` carry
 * `provenance = 'unverified_import'` and zero rights verifications. Their
 * rates come from published Nigerian OOH rate cards — not from a quote a
 * board's owner has given NowOpen, for anybody, for any dates.
 *
 * So a plan built from them has no confirmed cost. Printing one big number
 * under a list of billboards would say otherwise, and a business that takes
 * that number to its board would be wrong by whatever the market has done
 * since the rate card was published.
 *
 * Everything here therefore returns totals SPLIT by where the number came
 * from, and the interface shows them apart. The day a media owner gives a
 * real quote, that line moves to `quoted` and the split shows it — which is
 * only meaningful because the two were never mixed.
 *
 * ── WHY NOTHING HERE TOUCHES THE DATABASE ────────────────────────────────
 *
 * These are the decisions — what a plan costs, what is missing, whether it
 * is ready to send. They are the part worth testing, and they test better
 * without a network.
 */

import { ngnToUsd } from './hubMoney';

export type PriceBasis = 'indicative' | 'quoted' | 'unpriced' | 'fixed';

export interface PlanLine {
  id: string;
  /** Null for a NowOpen product line. */
  advertId: string | null;
  title: string;
  type: string | null;
  location: string | null;
  /** Free text, as stored. Read with `readAdDimensions` before display. */
  dimensions: string | null;
  days: number | null;
  ratePerDay: number | null;
  priceBasis: PriceBasis;
  currency: string;
  artworkUrl: string | null;
  /** A media placement, or a NowOpen product. A `fixed` line is always a product with a price. */
  kind: 'placement' | 'product';
  productId: string | null;
  /** NGN kobo. Products only. */
  priceMinor: number | null;
  artworkDesignId: string | null;
  artworkWidth: number | null;
  artworkHeight: number | null;
  /** False when the placement is delisted or the product is inactive. */
  offered: boolean;
}

export interface BasisTotal {
  basis: PriceBasis;
  lines: number;
  /** Null when any line in this group has no rate or no duration. */
  total: number | null;
  /** Lines in this group that could not be costed, and why. */
  incomplete: { title: string; why: string }[];
}

export interface PlanSummary {
  lines: number;
  /** Totals, kept apart by where the number came from. Never summed across. */
  totals: BasisTotal[];
  /** How many placements of each medium. */
  byMedium: { medium: string; count: number }[];
  /** Placement lines with artwork attached, out of `artworkNeeded`. */
  creativeReady: number;
  /** Placement lines that need artwork. Products never do. */
  artworkNeeded: number;
  /** Things to do before this is worth sending. Each is actionable. */
  missing: string[];
  /**
   * Whether a single confident figure may be shown.
   *
   * False whenever any line is indicative — which, today, is always. It is
   * computed rather than hardcoded so the answer changes by itself when the
   * inventory does.
   */
  hasConfirmedTotal: boolean;
}

export const BASIS_ORDER: PriceBasis[] = ['fixed', 'quoted', 'indicative', 'unpriced'];

export const BASIS_LABEL: Record<PriceBasis, string> = {
  fixed: 'NowOpen price',
  quoted: 'Quoted by the media owner',
  indicative: 'Indicative, from published rate cards',
  unpriced: 'No rate published',
};

/**
 * What one line costs, or null when it cannot be known.
 *
 * Null rather than zero. A line with no duration costs an unknown amount,
 * and zero would quietly make a plan look cheaper the more unknowns it has.
 */
export function lineCost(line: PlanLine, ngnPerUsd: number): number | null {
  if (line.kind === 'product') {
    /* priceMinor is NGN kobo; any other currency is uncosted, never mis-converted. */
    if (line.currency !== 'NGN') return null;
    return line.priceMinor == null ? null : ngnToUsd(line.priceMinor / 100, ngnPerUsd);
  }
  return line.ratePerDay != null && line.days != null ? line.ratePerDay * line.days : null;
}

/**
 * Add a plan up, keeping the bases apart.
 *
 * A group's total is null if ANY line in it is uncosted, because a partial
 * sum presented as a total is the same lie in smaller type.
 */
export function summarise(allLines: readonly PlanLine[], ngnPerUsd: number): PlanSummary {
  /* A line that is no longer on offer is named in `missing`, never costed. */
  const lines = allLines.filter((l) => l.offered);
  const withdrawn = allLines.length - lines.length;
  const totals: BasisTotal[] = [];

  for (const basis of BASIS_ORDER) {
    const group = lines.filter((l) => l.priceBasis === basis);
    if (!group.length) continue;

    const incomplete: { title: string; why: string }[] = [];
    let running = 0;
    let complete = true;

    for (const line of group) {
      const cost = lineCost(line, ngnPerUsd);
      if (cost == null) {
        complete = false;
        incomplete.push({
          title: line.title,
          why: line.kind === 'product'
            ? 'no price set'
            : line.ratePerDay == null ? 'no published rate' : 'no duration set',
        });
      } else {
        running += cost;
      }
    }

    totals.push({ basis, lines: group.length, total: complete ? running : null, incomplete });
  }

  const mediums = new Map<string, number>();
  for (const line of lines) {
    const medium = line.kind === 'product' ? 'NowOpen' : line.type?.trim() || 'Other';
    mediums.set(medium, (mediums.get(medium) ?? 0) + 1);
  }

  const placements = lines.filter((l) => l.kind === 'placement');
  const products = lines.filter((l) => l.kind === 'product');
  const creativeReady = placements.filter((l) => Boolean(l.artworkUrl)).length;

  const missing: string[] = [];
  const undated = placements.filter((l) => l.days == null);
  if (undated.length) {
    missing.push(`${undated.length} placement${undated.length === 1 ? '' : 's'} ${undated.length === 1 ? 'has' : 'have'} no duration — set how long each runs.`);
  }
  if (creativeReady < placements.length) {
    const n = placements.length - creativeReady;
    missing.push(`${n} placement${n === 1 ? '' : 's'} ${n === 1 ? 'has' : 'have'} no artwork attached yet.`);
  }
  const unpriced = placements.filter((l) => l.ratePerDay == null);
  if (unpriced.length) {
    missing.push(`${unpriced.length} placement${unpriced.length === 1 ? '' : 's'} ${unpriced.length === 1 ? 'has' : 'have'} no published rate — the media owner will quote.`);
  }
  const unpricedProducts = products.filter((l) => l.priceMinor == null);
  if (unpricedProducts.length) {
    const n = unpricedProducts.length;
    missing.push(`${n} product${n === 1 ? '' : 's'} ${n === 1 ? 'has' : 'have'} no price set.`);
  }
  if (withdrawn) {
    missing.push(`${withdrawn} line${withdrawn === 1 ? ' is' : 's are'} no longer on offer — remove ${withdrawn === 1 ? 'it' : 'them'}.`);
  }

  return {
    lines: allLines.length,
    totals,
    byMedium: [...mediums.entries()]
      .map(([medium, count]) => ({ medium, count }))
      .sort((a, b) => b.count - a.count || a.medium.localeCompare(b.medium)),
    creativeReady,
    artworkNeeded: placements.length,
    missing,
    /* Confident only when every line is a real quote or NowOpen price and every line is costed. */
    hasConfirmedTotal: lines.length > 0
      && lines.every((l) => l.priceBasis === 'quoted' || l.priceBasis === 'fixed')
      && lines.every((l) => lineCost(l, ngnPerUsd) != null),
  };
}

/**
 * How the plan's cost should be described in one line.
 *
 * Deliberately not a number on its own. "₦4.2m" invites a decision;
 * "around ₦4.2m, indicative" invites a conversation, which is what an
 * unquoted plan actually is.
 */
export function describeCost(summary: PlanSummary, format: (n: number) => string): string {
  if (!summary.lines) return 'Nothing added yet.';

  const costed = summary.totals.filter((t) => t.total != null);
  if (!costed.length) return 'The media owners will quote for these placements.';

  if (summary.hasConfirmedTotal && costed.length === 1) {
    const only = costed[0];
    return `${format(only.total as number)}, ${only.basis === 'fixed' ? 'NowOpen price' : 'quoted'}.`;
  }

  const parts = costed.map((t) => `${format(t.total as number)} ${t.basis === 'fixed' ? 'NowOpen price' : t.basis}`);
  const pending = summary.totals.filter((t) => t.total == null).length;
  return `${parts.join(' · ')}${pending ? `, plus ${pending} group${pending === 1 ? '' : 's'} still to be quoted` : ''}.`;
}

/**
 * Is this worth sending to media owners?
 *
 * Deliberately permissive about the plan's gaps and strict about one thing:
 * there has to be something in it. An enquiry with no placements wastes a
 * media owner's time and the advertiser's credibility; an enquiry with no
 * artwork is completely normal, because artwork usually follows the rate.
 */
export function readyToSend(summary: PlanSummary): { ok: true } | { ok: false; why: string } {
  if (!summary.lines) return { ok: false, why: 'Add at least one placement before sending an enquiry.' };
  return { ok: true };
}

/** A placement_trust read as the plan uses it: which placements still have a row, and whether the read worked. */
export interface ListingRead {
  map: { has(advertId: string): boolean };
  failed: boolean;
}

/**
 * Is this placement no longer listed? placement_trust leaves out archived and
 * rejected placements, so after a read that WORKED, a missing row means
 * delisted. A failed or pending read (null) says nothing about any placement.
 */
export function isDelisted(advertId: string | null, trust: ListingRead | null): boolean {
  return advertId != null && trust != null && !trust.failed && !trust.map.has(advertId);
}

/**
 * The lines with every delisted placement marked `offered: false`, so it
 * leaves the totals and is never moved. A failed read changes nothing. The
 * one copy of this rule: the plan page, the tray and sign-in migration all
 * use it.
 */
export function withListing(lines: PlanLine[], trust: ListingRead | null): PlanLine[] {
  return lines.map((l) => (l.kind === 'placement' && l.offered && isDelisted(l.advertId, trust) ? { ...l, offered: false } : l));
}
