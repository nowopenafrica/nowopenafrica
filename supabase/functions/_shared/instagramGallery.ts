/**
 * Keeping a listing's Instagram gallery current.
 *
 * ── WHAT "REALTIME" CAN AND CANNOT MEAN HERE ─────────────────────────────
 *
 * Meta publishes fifteen Instagram webhook fields — comments, mentions,
 * messages, story_insights and the messaging family — and NOT ONE of them
 * fires when an account publishes a post or a reel. Verified against
 * developers.facebook.com/docs/instagram-platform/webhooks on 2026-10-09.
 *
 * So there is no push from Instagram to subscribe to, and anything claiming
 * otherwise would either be fiction or be scraping, which the platform terms
 * forbid and this codebase does not do. The only sanctioned way to learn
 * about a new post is to ask, on a schedule, through the official API.
 *
 * What IS genuinely realtime is the second half: once a new permalink lands
 * in `business_gallery`, Postgres replication pushes it to every open listing
 * page, which updates with no refresh. So a visitor sees a new post appear by
 * itself — within the polling interval, not within a second of it going up.
 * That distinction is worth keeping honest in the UI copy.
 *
 * ── LINKS, NOT COPIES ────────────────────────────────────────────────────
 *
 * Same rule the publish trigger already follows: store the PERMALINK, never
 * Meta's `media_url`. That URL is a signed CDN address that expires within
 * days, Meta's terms do not permit re-hosting the media, and the photographs
 * belong to a business that in most cases has not claimed its listing. The
 * gallery renders an instagram.com link through Meta's own embed iframe, so
 * it is always current and always attributed.
 */

/**
 * A real post, reel or IGTV permalink.
 *
 * Deliberately the same expression the `apply_candidate_instagram_gallery`
 * trigger uses. A profile URL or a story link would render as an empty iframe
 * on a real business's listing.
 */
export const PERMALINK_RE = /^https?:\/\/(?:www\.)?instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i;

/**
 * The identity of a post, independent of how its URL was written.
 *
 * THIS IS THE WHOLE CORRECTNESS OF THE SYNC. The same post comes back as
 * `/p/ABC/`, `/p/ABC`, `/reel/ABC/?igsh=...` and with or without `www.`
 * depending on where the link came from. Comparing raw strings would insert a
 * duplicate of every post on every single poll — a gallery that grows without
 * end and shows the same photograph a dozen times.
 *
 * Returns null for anything that is not a post link.
 */
export function permalinkKey(url: string | null | undefined): string | null {
  const m = (url ?? '').trim().match(PERMALINK_RE);
  if (!m) return null;
  /*
   * The shortcode alone, lowercased for comparison only. `/p/` and `/reel/`
   * are two routes to one piece of media — Instagram itself serves a reel
   * under both — so the kind is deliberately NOT part of the identity.
   */
  return m[2].toLowerCase();
}

/**
 * Permalinks present on Instagram that the gallery does not already hold.
 *
 * Order is preserved as Meta returned it (newest first), and duplicates
 * within the fetched list are collapsed.
 */
export function newPermalinks(
  fetched: Array<string | null | undefined>,
  existing: Array<string | null | undefined>,
): string[] {
  const have = new Set<string>();
  for (const url of existing) {
    const key = permalinkKey(url);
    if (key) have.add(key);
  }

  const out: string[] = [];
  for (const url of fetched) {
    const key = permalinkKey(url);
    if (!key || have.has(key)) continue;
    have.add(key);          // also collapses repeats inside `fetched`
    out.push((url as string).trim());
  }
  return out;
}

/**
 * A gallery row for one permalink.
 *
 * Every field matches what `apply_candidate_instagram_gallery` writes at
 * publication, so a post added by this sync is indistinguishable from one
 * carried over by the trigger — same provenance, same confirmation flag, same
 * absence of a copied caption.
 */
export function galleryRow(businessId: string, permalink: string): {
  business_id: string;
  image_url: string;
  caption: null;
  content_status: 'source_derived';
  source_type: 'instagram';
  source_name: 'Instagram';
  source_url: string;
  requires_confirmation: true;
  published: true;
} {
  const url = permalink.trim();
  return {
    business_id: businessId,
    /*
     * The permalink goes in image_url because that is the column the gallery
     * reads for every kind of item, and mediaKindOf() decides FROM THE URL
     * that this one is an embed. No <img> is ever pointed at it.
     */
    image_url: url,
    /*
     * No caption. The embed renders the account's own words from Instagram,
     * live; copying them here would duplicate somebody's writing into our
     * database and age badly the moment they edit the post.
     */
    caption: null,
    content_status: 'source_derived',
    source_type: 'instagram',
    source_name: 'Instagram',
    source_url: url,
    requires_confirmation: true,
    published: true,
  };
}
