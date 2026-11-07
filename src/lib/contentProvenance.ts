// ContentProvenance — where a piece of profile content came from, and what a
// visitor may be told about it.
//
// Mirrors the `content_provenance` enum and the public RLS policies added in
// 20260921010000. The database is the authority: these policies already refuse
// to return unpublished or rejected content, so nothing here is a security
// boundary. It exists so the UI can decide what LABEL to show without a round
// trip, and so the labelling rules are testable without a browser.
//
// THE RULE THIS ENCODES
//
// A profile may be rich. It may not be confidently wrong. Content nobody has
// confirmed is shown as unconfirmed — not hidden, not dressed up as fact.

export type ContentStatus =
  | 'owner_confirmed'
  | 'source_derived'
  | 'suggested'
  | 'illustrative'
  | 'pending_review'
  | 'rejected'
  | 'outdated';

export interface ProvenancedContent {
  content_status?: ContentStatus | null;
  source_name?: string | null;
  source_url?: string | null;
  requires_confirmation?: boolean | null;
  published?: boolean | null;
}

/**
 * Statuses the public may see, once published. Mirrors the RLS `using` clause.
 *
 * `suggested` IS here, and that is deliberate — corrected from an earlier,
 * stricter version of this file. An unclaimed profile is allowed to show
 * "clearly labelled category suggestions"; excluding them outright left an
 * unclaimed hospital with a name and a phone number, which is the problem the
 * enrichment engine exists to solve.
 *
 * The protection is not hiding the suggestion. It is that:
 *   - `published` defaults false and the engine is forbidden (by a database
 *     trigger) from inserting generated content already published;
 *   - approving it does NOT change the status, so it still reads as a
 *     suggestion and `needsConfirmationLabel` still labels it.
 *
 * `pending_review`, `rejected` and `outdated` stay out whatever the publish
 * flag says: those are states where the content is known to be unshowable.
 */
const PUBLIC_STATUSES: readonly ContentStatus[] = [
  'owner_confirmed',
  'source_derived',
  'suggested',
  'illustrative',
];

/** Rows that predate the provenance columns read as owner content, as they did. */
const DEFAULT_STATUS: ContentStatus = 'owner_confirmed';

export function statusOf(item: ProvenancedContent | null | undefined): ContentStatus {
  return item?.content_status ?? DEFAULT_STATUS;
}

/**
 * May this be shown to a visitor at all?
 *
 * Both halves matter. `published` is the switch a reviewer flips; the status is
 * what the content IS. Generated content lands unpublished, so a bad run is
 * invisible rather than embarrassing.
 */
export function isPubliclyVisible(item: ProvenancedContent | null | undefined): boolean {
  if (!item) return false;
  if (item.published === false) return false;
  return PUBLIC_STATUSES.includes(statusOf(item));
}

/**
 * Does a visitor need to be told this is unconfirmed?
 *
 * Only when nobody running the business has stood behind it. An owner's own
 * entry needs no caveat, and covering the page in warnings teaches people to
 * ignore all of them — including the one that matters.
 */
export function needsConfirmationLabel(item: ProvenancedContent | null | undefined): boolean {
  if (!isPubliclyVisible(item)) return false;
  const status = statusOf(item);
  if (status === 'owner_confirmed') return false;
  /*
   * `illustrative` ALWAYS carries a label, whatever the flags say.
   *
   * It is the one status where the content is knowingly not the business — a
   * stand-in photograph. An unlabelled stand-in is the failure that put a
   * stock photo under 1,176 real business names (NOA-001), so it is not left
   * to a caller remembering to set requires_confirmation.
   */
  if (status === 'illustrative') return true;
  return status === 'suggested' || status === 'source_derived'
    || Boolean(item?.requires_confirmation);
}

/**
 * The short label shown beside unconfirmed content.
 *
 * Phrased as an instruction rather than a disclaimer: "confirm with the
 * business" tells a customer what to do next, where "unverified" only tells
 * them to worry.
 */
export function confirmationLabel(item: ProvenancedContent | null | undefined): string | null {
  if (!needsConfirmationLabel(item)) return null;
  const status = statusOf(item);
  if (status === 'illustrative') return 'Illustrative — not this business';
  /*
   * A suggestion says what it is. "Typical for this kind of business" is true,
   * useful and makes no claim about THIS business — which is exactly the line
   * a category template sits on.
   */
  if (status === 'suggested') return 'Typical for this category — confirm with the business';
  return 'Not yet confirmed by this business';
}

/** Longer explanation, for a tooltip or an expandable note. */
export function provenanceExplanation(item: ProvenancedContent | null | undefined): string | null {
  const status = statusOf(item);
  if (!isPubliclyVisible(item)) return null;
  switch (status) {
    case 'owner_confirmed':
      return null;
    case 'source_derived':
      return item?.source_name
        ? `Taken from ${item.source_name}. Contact the business to confirm it is still accurate.`
        : 'Taken from a public source. Contact the business to confirm it is still accurate.';
    case 'suggested':
      return 'Commonly offered by businesses in this category. NowOpen has not confirmed that this business offers it — contact them to check.';
    case 'illustrative':
      return 'A stand-in image that shows the kind of business this is. It is not a photograph of this business.';
    default:
      return null;
  }
}

/**
 * The attribution line for source-derived content.
 *
 * Returns null rather than inventing a source name — content claiming a source
 * it cannot name is worse than content claiming none.
 */
export function attribution(item: ProvenancedContent | null | undefined): { label: string; href?: string } | null {
  if (statusOf(item) !== 'source_derived') return null;
  const name = (item?.source_name ?? '').trim();
  if (!name) return null;
  const href = (item?.source_url ?? '').trim();
  return href ? { label: name, href } : { label: name };
}

/**
 * Split a list for rendering: confirmed first, then unconfirmed.
 *
 * Order is the quietest honest signal available. A customer scanning a list
 * reads the top of it, and what the business has actually stood behind belongs
 * there — without a single warning badge being added.
 */
export function orderByConfidence<T extends ProvenancedContent>(items: T[]): T[] {
  const rank = (i: T): number => {
    const s = statusOf(i);
    if (s === 'owner_confirmed') return 0;
    if (s === 'source_derived') return 1;
    return 2;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/** Everything a visitor may see, in the order they should see it. */
export function publicContent<T extends ProvenancedContent>(items: T[] | null | undefined): T[] {
  return orderByConfidence((items ?? []).filter(isPubliclyVisible));
}
