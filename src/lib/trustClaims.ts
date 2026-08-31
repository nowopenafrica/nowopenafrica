/**
 * What NowOpen is allowed to assert about a business, in public.
 *
 * WHY THIS EXISTS. Four industry modules used to print fixed trust claims with
 * no condition attached — a pharmacy page stated "Genuine, verified medicines",
 * a finance page "Licensed & regulated", car and property pages "Inspected &
 * documented". They rendered for every business in those categories, including
 * the 24 seeded listings that nobody owns and that carry trust_score 0. The
 * platform was vouching for businesses it had never contacted, in the three
 * sectors where being wrong costs the reader the most.
 *
 * The rule this file enforces: a claim may only appear if a signal on the
 * record actually backs it, and it may only say what that signal proves.
 *
 * Note what the claims below deliberately no longer say. NowOpen does not
 * inspect vehicles, test medicines, or issue financial licences, so it cannot
 * assert those things at any verification level — a stronger tier does not turn
 * an unfounded claim into a founded one. What a completed check does prove is
 * something narrower: that this business is who it says it is. That is what a
 * verified business gets to display.
 */

import { deriveTier, TIERS, type TrustSignals } from './trust';

export interface TrustClaim {
  /** Stable key for tests and React keys. */
  key: string;
  label: string;
  /** What the reader is being promised — shown as a tooltip. */
  detail: string;
}

export type ClaimSector = 'pharmacy' | 'finance' | 'vehicles' | 'property' | 'general';

interface ClaimInput extends TrustSignals {
  /** Unowned listings are seeded records; nobody has stood behind them. */
  user_id?: string | null;
  /**
   * Accepted so callers can pass a whole business row, and deliberately never
   * read. This is the legacy seed flag: true on 24 unowned records with
   * trust_score 0. It is listed here so the omission is visibly intentional
   * rather than looking like a field somebody forgot.
   */
  verified?: boolean | null;
}

/** Has a human actually stood behind this record? */
export function isClaimed(b: ClaimInput | null | undefined): boolean {
  return !!b?.user_id;
}

/**
 * Verified in the sense that survives scrutiny.
 *
 * Not the legacy `verified` boolean, which is set on 24 unowned seed records
 * and proves nothing. The derived tier is computed from signals that each
 * required someone to complete a step.
 */
export function isTrustVerified(b: ClaimInput | null | undefined): boolean {
  if (!b || !isClaimed(b)) return false;
  return TIERS[deriveTier(b)].rank > 0;
}

const IDENTITY: Record<ClaimSector, TrustClaim> = {
  pharmacy: {
    key: 'identity-pharmacy',
    label: 'Verified pharmacy',
    detail: 'NowOpen confirmed this pharmacy’s contact details and ownership. Medicines are not tested by NowOpen.',
  },
  finance: {
    key: 'identity-finance',
    label: 'Verified provider',
    detail: 'NowOpen confirmed this provider’s contact details and ownership. NowOpen does not licence or regulate financial services.',
  },
  vehicles: {
    key: 'identity-vehicles',
    label: 'Verified dealer',
    detail: 'NowOpen confirmed this dealer’s contact details and ownership. Vehicles are not inspected by NowOpen.',
  },
  property: {
    key: 'identity-property',
    label: 'Verified agent',
    detail: 'NowOpen confirmed this agent’s contact details and ownership. Listings are not inspected by NowOpen.',
  },
  general: {
    key: 'identity-general',
    label: 'Verified business',
    detail: 'NowOpen confirmed this business’s contact details and ownership.',
  },
};

/**
 * The registration claim, and the only route to saying anything about licences.
 *
 * `registration_verified` means an admin looked at a registration document. It
 * still does not make NowOpen the regulator, so the wording reports who was
 * checked against what rather than pronouncing the business compliant.
 */
const REGISTERED: TrustClaim = {
  key: 'registered',
  label: 'Registration checked',
  detail: 'NowOpen reviewed this business’s registration documents.',
};

/**
 * Every claim this business has earned the right to display.
 *
 * Returns an empty list for anything unclaimed or unverified — and an empty
 * trust bar is the correct output there. Silence is accurate; the previous
 * behaviour was not.
 */
export function trustClaims(
  b: ClaimInput | null | undefined,
  sector: ClaimSector = 'general',
): TrustClaim[] {
  if (!isTrustVerified(b)) return [];
  const out = [IDENTITY[sector]];
  if (b?.registration_verified) out.push(REGISTERED);
  return out;
}

/**
 * What to tell a reader looking at a business with nothing to show.
 *
 * An unverified page should say so plainly rather than leaving a gap the reader
 * fills with an assumption. This is the same honesty the Founding counter uses
 * at zero: state the real position instead of implying a better one.
 */
export function unverifiedNotice(b: ClaimInput | null | undefined): string | null {
  if (isTrustVerified(b)) return null;
  return isClaimed(b)
    ? 'This business has not completed NowOpen verification.'
    : 'This listing has not been claimed by its owner or verified by NowOpen.';
}
