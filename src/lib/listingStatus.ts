/**
 * The three states a listing can be in, kept strictly apart.
 *
 * Unclaimed, claimed and verified are different facts about a business and a
 * directory that blurs them ends up with badges that mean nothing. The
 * incumbent Nigerian directory shows the failure clearly: 131,149 listings, and
 * the ones I read had no hours, no photos and no reviews behind a "verified
 * directory" masthead.
 *
 * Everything here is presentation over columns the database owns. The database
 * decides listability and the claim trigger moves the state machine; this file
 * decides what a reader is told.
 */

export type DataStatus =
  | 'synthetic_unverified'
  | 'imported_authorized'
  | 'submitted'
  | 'user_created'
  | 'admin_curated';

export type ClaimStatus = 'unclaimed' | 'claim_pending' | 'claimed';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type LifecycleStatus = 'active' | 'temporarily_closed' | 'permanently_closed' | 'suspended';

export interface ListingRecord {
  data_status?: DataStatus | null;
  claim_status?: ClaimStatus | null;
  verification_status?: VerificationStatus | null;
  lifecycle_status?: LifecycleStatus | null;
  user_id?: string | null;
}

/** What the badge on a card or profile says. */
export type ListingBadge = 'verified' | 'claimed' | 'unclaimed' | 'pending' | 'closed' | 'temporarily-closed';

export interface BadgeSpec {
  kind: ListingBadge;
  label: string;
  /** One line explaining what the badge actually means. */
  detail: string;
  /** 'good' | 'neutral' | 'warn' — the visual weight, never more than earned. */
  tone: 'good' | 'neutral' | 'warn';
}

const BADGES: Record<ListingBadge, BadgeSpec> = {
  verified: {
    kind: 'verified', tone: 'good', label: 'Verified',
    detail: 'NowOpen confirmed this business’s contact details and ownership.',
  },
  claimed: {
    kind: 'claimed', tone: 'neutral', label: 'Claimed',
    detail: 'The owner manages this page. NowOpen has not completed verification.',
  },
  pending: {
    kind: 'pending', tone: 'neutral', label: 'Claim under review',
    detail: 'Someone has asked to claim this page and we are checking it.',
  },
  unclaimed: {
    kind: 'unclaimed', tone: 'warn', label: 'Unclaimed',
    detail: 'Nobody has claimed this page, so the details here are not owner-managed.',
  },
  'temporarily-closed': {
    kind: 'temporarily-closed', tone: 'warn', label: 'Temporarily closed',
    detail: 'This business is not trading at the moment.',
  },
  closed: {
    kind: 'closed', tone: 'warn', label: 'Permanently closed',
    detail: 'This business has shut down. The page is kept so the record stays correct.',
  },
};

/**
 * The single badge to show.
 *
 * Lifecycle wins over claim state: whether the doors have shut is more useful
 * than who administers the page, and a "Verified" badge above a closed shop is
 * the wrong emphasis. Below that, verified beats claimed beats pending beats
 * unclaimed — strongest true statement first.
 */
export function listingBadge(b: ListingRecord | null | undefined): BadgeSpec {
  if (b?.lifecycle_status === 'permanently_closed') return BADGES.closed;
  if (b?.lifecycle_status === 'temporarily_closed') return BADGES['temporarily-closed'];
  if (b?.verification_status === 'verified') return BADGES.verified;
  // Fall back to ownership when the status columns have not been backfilled.
  if (b?.claim_status === 'claimed' || b?.user_id) return BADGES.claimed;
  if (b?.claim_status === 'claim_pending') return BADGES.pending;
  return BADGES.unclaimed;
}

/** Can somebody still claim this? */
export function isClaimable(b: ListingRecord | null | undefined): boolean {
  if (!b) return false;
  if (b.user_id || b.claim_status === 'claimed') return false;
  if (b.claim_status === 'claim_pending') return false;
  return b.lifecycle_status !== 'suspended' && b.lifecycle_status !== 'permanently_closed';
}

/** A fabricated seed record that nobody has claimed yet. */
export function isProspect(b: ListingRecord | null | undefined): boolean {
  return b?.data_status === 'synthetic_unverified' && b?.claim_status !== 'claimed';
}

/**
 * Mirrors the generated `is_listable` column.
 *
 * The database is the authority — this exists so the client can filter and
 * assert without a round trip, and so the rule is testable. Drift here shows up
 * as a listing that renders in a grid and then 404s.
 */
export function isListable(b: ListingRecord | null | undefined): boolean {
  if (!b) return false;
  if (b.lifecycle_status === 'suspended') return false;
  // A prospect becomes listable the moment a real owner claims it: at that
  // point somebody has stood behind the record and it stops being fabricated.
  return b.data_status !== 'synthetic_unverified' || b.claim_status === 'claimed';
}

/**
 * Should a crawler index this page?
 *
 * Prospects are hidden from the public entirely, so this is belt-and-braces
 * rather than the boundary — the RLS policy is what actually keeps them out of
 * the sitemap and out of a crawler's reach.
 *
 * Worth keeping separate from isListable all the same: listing and indexing are
 * different decisions, and if prospects are ever revealed again this is the one
 * switch that keeps them out of search. It is not currently called from
 * anywhere; wiring it would mean src/lib/seo.ts (emit `noindex, follow`) and
 * api/sitemap.xml.ts (skip those rows).
 */
export function isIndexable(b: ListingRecord | null | undefined): boolean {
  return isListable(b) && !isProspect(b);
}

/** The reasons a person can give when reporting a listing. */
export const REPORT_REASONS = [
  { value: 'closed', label: 'It has closed down' },
  { value: 'moved', label: 'It has moved' },
  { value: 'wrong_phone', label: 'The phone number is wrong' },
  { value: 'wrong_address', label: 'The address is wrong' },
  { value: 'wrong_hours', label: 'The opening hours are wrong' },
  { value: 'wrong_category', label: 'It is in the wrong category' },
  { value: 'duplicate', label: 'This is a duplicate listing' },
  { value: 'not_real', label: 'This business does not exist' },
  { value: 'impersonation', label: 'It is pretending to be another business' },
  { value: 'offensive', label: 'The content is offensive' },
  { value: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

/**
 * Is this report worth a reviewer's time?
 *
 * "Other" with no explanation is not actionable, and letting it through fills
 * the queue with rows nobody can act on. Every other reason states the problem
 * by itself.
 */
export function reportIsUsable(reason: string, detail: string): boolean {
  if (!REPORT_REASONS.some((r) => r.value === reason)) return false;
  if (reason === 'other') return detail.trim().length >= 10;
  return true;
}
