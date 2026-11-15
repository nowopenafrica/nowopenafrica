/**
 * What an owner is told about bringing their Instagram posts into the gallery.
 *
 * The work happens in the database and refresh-instagram-gallery: saving a
 * changed handle on a claimed business queues an `instagram_sync_requests`
 * row (trigger `queue_instagram_owner_sync`, migration 20261118010000). This
 * file only decides the words shown in the story editor, so every claim they
 * make is one the system actually keeps:
 *
 *  - posts are brought in, not copied (Instagram's own embed);
 *  - the account must be a public Business or Creator account, because
 *    business_discovery cannot read any other kind;
 *  - new posts are checked in turn, so "every few hours", never "instantly".
 *
 * Nothing here mentions live video. Meta offers no way to show an Instagram
 * live on another site (spec section 2), and a live badge needs the owner to
 * connect their account, which phase 1 does not do.
 */

import { readHandle } from './instagramBatch';
import { formatLocalDate } from './dates';

export const INSTAGRAM_SYNC_NOTE =
  'When you save, we bring your latest Instagram posts into your gallery, shown through Instagram’s own embed. '
  + 'Your account must be a public Business or Creator account. New posts are checked every few hours.';

export type SyncRequestStatus = 'pending' | 'working' | 'done' | 'not_business' | 'error';

export interface SyncRequestRow {
  status: SyncRequestStatus | string;
  handle: string;
  requested_at: string;
  processed_at: string | null;
  posts_added: number | null;
  note: string | null;
}

export interface OwnerSyncMessage {
  tone: 'info' | 'ok' | 'warn';
  text: string;
}

/** Whether the owner gets the sync at all: a claimed business. */
export function ownerSyncApplies(business: { claim_status?: string | null; user_id?: string | null }): boolean {
  return business.claim_status === 'claimed' && !!business.user_id;
}

/**
 * Whether this save will queue a sync, using the same normalisation as the
 * server, so "instagram.com/x/" changed to "@x" is correctly no change.
 */
export function instagramHandleChanged(before: string | null | undefined, after: string | null | undefined): boolean {
  const next = readHandle(after);
  return !!next && next !== readHandle(before);
}

/** The line under the Instagram field about the latest request, if any. */
export function ownerSyncMessage(row: SyncRequestRow | null | undefined): OwnerSyncMessage | null {
  if (!row) return null;
  const at = row.processed_at ?? row.requested_at;
  const when = at ? formatLocalDate(at) : '';
  switch (row.status) {
    case 'pending':
    case 'working':
      return { tone: 'info', text: `Bringing in your posts from @${row.handle}…` };
    case 'done': {
      const n = row.posts_added ?? 0;
      return n > 0
        ? { tone: 'ok', text: `${n} post${n === 1 ? '' : 's'} from @${row.handle} added to your gallery on ${when}.` }
        : { tone: 'ok', text: `@${row.handle} checked on ${when}: your gallery already had your latest posts.` };
    }
    case 'not_business':
      return {
        tone: 'warn',
        text: `Instagram says @${row.handle} is not a public Business or Creator account, so we cannot read its posts. `
          /*
           * True because a claimed business stays in the rotation whatever the
           * ledger says (instagram_gallery_refresh_pool), so a switched account
           * is picked up on a later check without the owner doing anything.
           */
          + 'You can switch it in the Instagram app (Settings → Account type); we will pick it up on a later check.',
      };
    case 'error':
      return { tone: 'warn', text: `We could not bring in posts from @${row.handle} on ${when}. We will keep trying.` };
    default:
      return null;
  }
}
