/**
 * Claiming an unowned business page.
 *
 * The cheapest acquisition this platform has. A page already exists, already
 * ranks, already describes a real business — and the owner finds it themselves
 * through search rather than through advertising. One button turns that visit
 * into a business account.
 *
 * A claim is a REQUEST, never an action. Approving one hands over control of
 * the business, so the decision belongs to an admin; nothing here grants
 * anything.
 */

export type ClaimStatus = 'pending' | 'approved' | 'rejected';

export interface BusinessClaim {
  id: string;
  business_id: string;
  user_id: string;
  evidence?: string | null;
  contact?: string | null;
  status: ClaimStatus;
  note?: string | null;
  created_at?: string | null;
}

/**
 * Is this page claimable?
 *
 * Only when nobody owns it. A page with an owner is somebody's business, and
 * offering a claim button on it invites exactly the takeover attempt the
 * approval step exists to stop — better not to ask the question at all.
 */
export function isClaimable(business: { user_id?: string | null }): boolean {
  return !business?.user_id;
}

/** What the visitor should be shown, given their own claim history here. */
export type ClaimState = 'claimable' | 'pending' | 'owned' | 'rejected';

export function claimState(
  business: { user_id?: string | null },
  myClaim: { status?: ClaimStatus } | null | undefined,
): ClaimState {
  if (!isClaimable(business)) return 'owned';
  if (myClaim?.status === 'pending') return 'pending';
  if (myClaim?.status === 'rejected') return 'rejected';
  return 'claimable';
}

/**
 * Enough to review?
 *
 * Deliberately gentle: a phone number or a work email is plenty for a human to
 * check, and a long form here would lose the owner who came in from a search
 * result and has thirty seconds of patience. The gate is the admin, not this.
 */
export function evidenceIsUsable(evidence: string, contact: string): boolean {
  return evidence.trim().length >= 8 || contact.trim().length >= 6;
}

/** Plain-language status, for the person who submitted it. */
export function claimStatusLabel(status: ClaimStatus): string {
  switch (status) {
    case 'pending': return 'Waiting for review';
    case 'approved': return 'Approved — the business is yours';
    case 'rejected': return 'Not approved';
  }
}

/**
 * How many unclaimed pages there are, for the admin view.
 *
 * Worth surfacing because it is the size of the acquisition opportunity sitting
 * in the catalogue: every one is a business that could become an account
 * without a shilling of advertising.
 */
export function unclaimedCount(list: { user_id?: string | null }[]): number {
  return list.filter(isClaimable).length;
}
