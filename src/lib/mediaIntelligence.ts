// MediaIntelligence — pure decisions for the §16 asset registry
// (business_media_assets). Shared by the admin moderation panel and the public
// profile page so both make the same calls about what may render and what a
// review action means. No React, no supabase calls — unit-testable.

export interface MediaAssetRow {
  id: string;
  business_id: string | number;
  asset_type: string;             // logo | cover | gallery | video | document
  caption: string | null;
  source_id: string | null;
  source_url: string | null;
  source_uri: string | null;
  match_confidence: number;
  rights_decision: string | null; // licensed | permission_obtained | conservative_default | no_rights | unchecked
  licence: string | null;
  rights_owner: string | null;
  criticality: string;            // critical | non_critical | mandatory
  moderation_status: string;      // pending | approved | rejected
  moderation_reason: string | null;
  status: string;                 // discovered | match_confirmed | approved | published | rejected | removed
  takedown_requested_at: string | null;
  takedown_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

/** Why the registry keeps whatever blob came in from the front of the page. */
export type MediaReviewAction = 'approve' | 'publish' | 'reject' | 'takedown';

/** The §16 lifecycle in the order it is meant to move. */
export const MEDIA_STATUS_FLOW = ['discovered', 'match_confirmed', 'approved', 'published'] as const;

/** Terminal states: nothing re-enters the queue from these. `removed` is a
 *  takedown honour and always final, keeping the row for the record. */
export const MEDIA_STATUS_TERMINAL = ['rejected', 'removed'] as const;

export const ALLOWED_ASSET_TYPES = ['logo', 'cover', 'gallery', 'video', 'document'] as const;

export const MEDIA_STATUS_LABEL: Record<string, string> = {
  discovered: 'Discovered',
  match_confirmed: 'Match confirmed',
  approved: 'Approved',
  published: 'Published',
  rejected: 'Rejected',
  removed: 'Removed',
};

export const MEDIA_RIGHTS_LABEL: Record<string, string> = {
  licensed: 'Licensed',
  permission_obtained: 'Permission obtained',
  conservative_default: 'Conservative default',
  no_rights: 'No rights',
  unchecked: 'Unchecked',
};

export const MEDIA_REVIEW_LABEL: Record<MediaReviewAction, string> = {
  approve: 'Approve',
  publish: 'Publish',
  reject: 'Reject',
  takedown: 'Takedown',
};

/** One honest gate for everything: a taken-down asset stays taken down. A
 *  rejected asset may still be re-reviewed if new rights arrive, but `removed`
 *  is the point of no return. */
export function canReview(action: MediaReviewAction, status: string): boolean {
  if (action === 'takedown') return status !== 'removed';
  return status !== 'removed';
}

/** What the DB row becomes for a given review action. Pure so the office
 *  cannot drift from the registry semantics, and a unit test can pin every
 *  transition. Returns null for actions that must not happen. */
export function mediaReviewPatch(
  action: MediaReviewAction,
  status: string,
  nowIso: string,
  reviewerId: string | null,
  reason: string | null,
): Record<string, unknown> | null {
  if (!canReview(action, status)) return null;
  const stamp = { reviewed_by: reviewerId, reviewed_at: nowIso, status_changed_at: nowIso };
  switch (action) {
    case 'approve':
      return { status: 'approved', moderation_status: 'approved', moderation_reason: null, ...stamp };
    case 'publish':
      return { status: 'published', moderation_status: 'approved', moderation_reason: null, ...stamp };
    case 'reject':
      return { status: 'rejected', moderation_status: 'rejected', moderation_reason: reason?.trim() || 'Rejected in media review', ...stamp };
    case 'takedown':
      return { status: 'removed', takedown_requested_at: nowIso, takedown_reason: reason?.trim() || null, ...stamp };
  }
}

/** The only fields the public profile page needs from the registry — RLS lets
 *  it read published rows, and this is exactly the shape its query asks for. */
export type MediaAssetLite = Pick<MediaAssetRow, 'asset_type' | 'caption' | 'source_uri' | 'status'>;

/** First published URL for a type, owner content still wins where it exists.
 *  Callers decide how the URL renders; e.g. only treat it as a cover/logo when
 *  it is actually a photo. */
export function firstPublishedUrl(assets: readonly MediaAssetLite[], assetType: string): string | null {
  const found = assets.find((a) => a.status === 'published' && a.asset_type === assetType && a.source_uri);
  return found?.source_uri ?? null;
}

/** The public gallery stays owner-managed: published registry assets APPEND
 *  after it, deduped by URL so an owner re-adding a suggested image never
 *  doubles it. `makeItem` lets the caller keep its own row shape. */
export function mergePublishedGallery<I extends { url: string }>(
  ownerItems: readonly I[],
  assets: readonly MediaAssetLite[],
  makeItem: (asset: MediaAssetLite) => I,
): I[] {
  const seen = new Set(ownerItems.map((i) => i.url));
  const extras: I[] = [];
  for (const asset of assets) {
    if (
      asset.status === 'published'
      && asset.asset_type === 'gallery'
      && asset.source_uri
      && !seen.has(asset.source_uri)
    ) {
      seen.add(asset.source_uri);
      extras.push(makeItem(asset));
    }
  }
  return [...ownerItems, ...extras];
}