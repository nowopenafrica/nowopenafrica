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

export type PriceBasis = 'indicative' | 'quoted' | 'unpriced';

export interface PlanLine {
  id: string;
  advertId: string;
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
  /** Lines with artwork attached, out of the total. */
  creativeReady: number;
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

const BASIS_ORDER: PriceBasis[] = ['quoted', 'indicative', 'unpriced'];

export const BASIS_LABEL: Record<PriceBasis, string> = {
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
export const lineCost = (line: PlanLine): number | null =>
  (line.ratePerDay != null && line.days != null ? line.ratePerDay * line.days : null);

/**
 * Add a plan up, keeping the bases apart.
 *
 * A group's total is null if ANY line in it is uncosted, because a partial
 * sum presented as a total is the same lie in smaller type.
 */
export function summarise(lines: readonly PlanLine[]): PlanSummary {
  const totals: BasisTotal[] = [];

  for (const basis of BASIS_ORDER) {
    const group = lines.filter((l) => l.priceBasis === basis);
    if (!group.length) continue;

    const incomplete: { title: string; why: string }[] = [];
    let running = 0;
    let complete = true;

    for (const line of group) {
      const cost = lineCost(line);
      if (cost == null) {
        complete = false;
        incomplete.push({
          title: line.title,
          why: line.ratePerDay == null ? 'no published rate' : 'no duration set',
        });
      } else {
        running += cost;
      }
    }

    totals.push({ basis, lines: group.length, total: complete ? running : null, incomplete });
  }

  const mediums = new Map<string, number>();
  for (const line of lines) {
    const medium = line.type?.trim() || 'Other';
    mediums.set(medium, (mediums.get(medium) ?? 0) + 1);
  }

  const creativeReady = lines.filter((l) => Boolean(l.artworkUrl)).length;

  const missing: string[] = [];
  const undated = lines.filter((l) => l.days == null);
  if (undated.length) {
    missing.push(`${undated.length} placement${undated.length === 1 ? '' : 's'} ${undated.length === 1 ? 'has' : 'have'} no duration — set how long each runs.`);
  }
  if (creativeReady < lines.length) {
    const n = lines.length - creativeReady;
    missing.push(`${n} placement${n === 1 ? '' : 's'} ${n === 1 ? 'has' : 'have'} no artwork attached yet.`);
  }
  const unpriced = lines.filter((l) => l.ratePerDay == null);
  if (unpriced.length) {
    missing.push(`${unpriced.length} placement${unpriced.length === 1 ? '' : 's'} ${unpriced.length === 1 ? 'has' : 'have'} no published rate — the media owner will quote.`);
  }

  return {
    lines: lines.length,
    totals,
    byMedium: [...mediums.entries()]
      .map(([medium, count]) => ({ medium, count }))
      .sort((a, b) => b.count - a.count || a.medium.localeCompare(b.medium)),
    creativeReady,
    missing,
    /* Confident only when every line is a real quote and every line is costed. */
    hasConfirmedTotal: lines.length > 0
      && lines.every((l) => l.priceBasis === 'quoted')
      && lines.every((l) => lineCost(l) != null),
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

  if (summary.hasConfirmedTotal) {
    return `${format(costed.reduce((sum, t) => sum + (t.total ?? 0), 0))}, quoted.`;
  }

  const parts = costed.map((t) => `${format(t.total as number)} ${t.basis}`);
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
