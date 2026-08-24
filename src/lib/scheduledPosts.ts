// The Studio's publish queue, stored on the server.
//
// The queue used to live only in localStorage, which made "scheduled" a
// promise the product could not keep: the post existed in one browser on one
// device, and the only thing that ever published it was a 30-second timer
// running inside an open Studio tab. Close the laptop and the 7am post went
// out at lunchtime, or never.
//
// Mirroring each job into `social_scheduled_posts` is what lets the
// `publish-due-posts` cron post on the owner's behalf while nobody is watching.
// localStorage stays as the offline/optimistic copy so the UI keeps working
// when the network or the table is unavailable — the server is the source of
// truth for *status*, the client for what is being drafted.

import { supabase } from './supabase';
import type { PublishJob, PublishStatus } from './publisher';

/** A row as stored server-side. */
export interface ScheduledPostRow {
  id: string;
  business_id: string;
  title: string | null;
  caption: string | null;
  hashtags: string | null;
  channels: string[];
  media: { name: string; url: string; type: 'image' | 'video' } | null;
  scheduled_at: string;
  status: 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
  attempts: number;
  last_error: string | null;
  results: { channel: string; ok: boolean; simulated?: boolean; error?: string }[] | null;
  published_at: string | null;
}

/** Server status → the status the queue UI already understands. */
function toClientStatus(row: ScheduledPostRow): PublishStatus {
  switch (row.status) {
    case 'published': return 'published';
    case 'failed': return 'failed';
    case 'publishing': return 'publishing';
    default: return 'scheduled';
  }
}

export function rowToJob(row: ScheduledPostRow): PublishJob {
  return {
    id: row.id,
    title: row.title ?? '',
    caption: row.caption ?? '',
    hashtags: row.hashtags ?? '',
    scheduledAt: row.scheduled_at,
    channels: Array.isArray(row.channels) ? row.channels : [],
    status: toClientStatus(row),
    createdAt: row.scheduled_at,
    publishedAt: row.published_at ?? undefined,
    media: row.media ?? undefined,
    simulated: Array.isArray(row.results) ? row.results.some((r) => r.simulated) : undefined,
  };
}

/**
 * Every job the server holds for this business.
 *
 * Returns null — not an empty list — when the queue cannot be reached, so the
 * caller can tell "nothing scheduled" apart from "we could not ask", and keep
 * showing the on-device copy instead of appearing to have lost the owner's
 * work.
 */
export async function fetchScheduledPosts(businessId: string): Promise<PublishJob[] | null> {
  try {
    const { data, error } = await supabase
      .from('social_scheduled_posts')
      .select('id, business_id, title, caption, hashtags, channels, media, scheduled_at, status, attempts, last_error, results, published_at')
      .eq('business_id', businessId)
      .neq('status', 'cancelled')
      .order('scheduled_at', { ascending: false })
      .limit(200);
    if (error) return null;
    return (data ?? []).map((r) => rowToJob(r as ScheduledPostRow));
  } catch {
    return null;
  }
}

/**
 * Put a job on the server queue.
 *
 * No `.select()` after the insert: on a table whose policies are written for
 * the owner, asking to read the row back makes RLS evaluate the SELECT policy
 * too, and a failure there is reported as if the INSERT itself was rejected.
 * We already know the id, so there is nothing to read back.
 */
export async function enqueueScheduledPost(businessId: string, job: PublishJob): Promise<boolean> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('social_scheduled_posts').insert([{
      id: job.id,
      business_id: businessId,
      created_by: auth?.user?.id ?? null,
      title: job.title || null,
      caption: job.caption || null,
      hashtags: job.hashtags || null,
      channels: job.channels,
      media: job.media ?? null,
      scheduled_at: job.scheduledAt,
      status: 'scheduled',
    }]);
    if (error) {
      console.warn('Could not queue the post on the server:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Take a job off the queue. Best-effort: the local copy is removed either way. */
export async function cancelScheduledPost(id: string): Promise<void> {
  try {
    await supabase.from('social_scheduled_posts').delete().eq('id', id);
  } catch {
    /* offline — the local queue has already dropped it */
  }
}

/**
 * Mark a job published after a manual "publish now".
 *
 * The trigger on the table refuses a client-set 'published', so this only
 * records the human intent; the row is left for the publisher to finish. What
 * it does guarantee is that the cron will not pick the job up again while the
 * browser is mid-publish.
 */
export async function markScheduledPostHandled(id: string): Promise<void> {
  try {
    await supabase.from('social_scheduled_posts').update({ status: 'cancelled' }).eq('id', id);
  } catch {
    /* best effort */
  }
}
