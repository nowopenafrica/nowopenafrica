/**
 * Turning an Instagram profile into a review-queue candidate.
 *
 * Kept out of the component and pure, because this mapping is exactly where
 * the expensive mistakes live. The website extractor shipped for weeks
 * dropping four fields it had successfully read and rendered — extraction,
 * display and persistence are three separate lists, and only one of them is
 * visible on screen.
 *
 * ── THE KEY NAMES ARE A CONTRACT, NOT LABELS ─────────────────────────────
 *
 * radar_candidates has columns for name, description, website, phone, email,
 * address, city and coordinates. Everything else rides in `profile`, and
 * radar_publish_candidate() projects that jsonb onto the business through a
 * WHITELIST: opening_hours, logo_url, cover_image_url, about, mission, vision,
 * tagline, services_json, and the six social networks (instagram, facebook,
 * twitter, tiktok, linkedin, youtube).
 *
 * A key outside that whitelist is staged, shown to a reviewer, and silently
 * dropped at publication. So `profile.instagram` reaches social_links;
 * `profile.instagram_url` would not.
 */

import { categoryFromSelfDescription } from './instagramCategory';

/** What extract-instagram returns for a successful lookup. */
export interface InstagramProfile {
  name: string | null;
  biography: string | null;
  website: string | null;
  followersCount: number | null;
  mediaCount: number | null;
  profilePictureUrl: string | null;
  retrievedAt: string;
}

export interface CandidateRow {
  source_key: string;
  source_record_id: string;
  name: string;
  /**
   * The NowOpen category, read from how the account describes itself, or null
   * when it named none or named two equally. A real column on
   * radar_candidates, and `radar_publish_candidate` projects it onto the
   * business -- so null here means the listing keeps whatever a reviewer sets.
   */
  category: string | null;
  description: string | null;
  website: string | null;
  /*
   * Real columns on radar_candidates, so anything reading the column sees
   * them. Staging a phone inside `profile` when the table has its own column
   * is a mistake this codebase has already made once — nothing that read the
   * column ever saw it.
   */
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  profile: Record<string, unknown>;
  source_url: string;
  decision_reason: string;
}

export interface BuildOptions {
  /**
   * The operator has confirmed there is a right to carry the owner's own
   * writing. Untick and the biography is read, shown, and not staged.
   */
  authoredConfirmed: boolean;
  /**
   * Service and product names the operator TICKED, taken from captions.
   *
   * Only confirmed items, never everything the reader found. A caption reader
   * proposes; a person decides. Publishing a service a business does not
   * offer is worse than publishing no services at all.
   */
  confirmedOfferings?: string[];
  /**
   * Product names the operator ticked as PRODUCTS rather than services.
   *
   * Kept apart because they publish to different tables and read differently
   * on a listing: a salon offers services, a shop sells products, and a
   * directory that files one as the other describes the business wrongly.
   */
  confirmedProducts?: string[];
  /** The phone the operator chose from those found in captions. */
  phone?: string | null;
  /** The email the operator chose. */
  email?: string | null;
  /** A WhatsApp link or number the operator chose. */
  whatsapp?: string | null;
  /** Recent post permalinks, for a reviewer to look at. Never images. */
  permalinks?: string[];
  /**
   * A logo the operator chose to carry, ALREADY COPIED into our own storage.
   *
   * Never Meta's own address: `profile_picture_url` is signed and expires
   * within days (measured four, 2026-10-08), so a stored link would be a
   * broken logo on a real listing inside a week. This is the stable URL that
   * `instagram-logo` returns after fetching the bytes server-side.
   */
  logoUrl?: string | null;
}

/**
 * Build the row. Returns null when there is nothing worth filing.
 *
 * @param handle normalised, without the @
 */
export function buildInstagramCandidate(
  handle: string,
  p: InstagramProfile,
  {
    authoredConfirmed, confirmedOfferings = [], confirmedProducts = [], phone = null,
    email = null, whatsapp = null, permalinks = [], logoUrl = null,
  }: BuildOptions,
): CandidateRow | null {
  const url = `https://www.instagram.com/${handle}/`;
  const name = (p.name ?? '').trim();

  /*
   * A profile with no name is not a business record, it is a handle. Filing it
   * would put a row in the queue that a reviewer can do nothing with.
   */
  if (!name) return null;

  const staged: Record<string, unknown> = {
    /*
     * The whitelisted key, so approval writes social_links.instagram. This is
     * the one field that is unambiguously a fact: the account exists and this
     * is its address.
     */
    instagram: url,
  };

  /*
   * ACTIVITY, NOT ATTRIBUTES — and deliberately under keys the publish
   * whitelist does not know.
   *
   * A follower count describes the account on a given day, not the business.
   * It reaches a reviewer's eye as context for judging whether an account is
   * real and active, and goes no further. Staging it under a publishable name
   * would imply a path to the profile that does not exist and should not.
   */
  if (typeof p.followersCount === 'number') staged.instagram_followers_seen = p.followersCount;
  if (typeof p.mediaCount === 'number') staged.instagram_media_seen = p.mediaCount;
  staged.instagram_read_at = p.retrievedAt;

  /*
   * THE PROFILE PICTURE IS NEVER STAGED, under any key and whatever the
   * operator ticks.
   *
   * radar_sources records image_reuse_allowed = 'prohibited' for this source:
   * it is Meta Platform Data, the URL expires within days, and it is not ours
   * to put on a listing. A staged expiring URL would publish as a broken image
   * on somebody's business profile.
   */

  /*
   * Services the OPERATOR ticked, under the whitelisted key so approval
   * writes them onto the business.
   *
   * Names only — no price and no description. A caption's price is true the
   * week it was posted and misleading after, and its prose is somebody's
   * writing. The same rule the website extractor follows.
   */
  const offerings = [...new Set(confirmedOfferings.map((s) => s.trim()).filter(Boolean))];
  if (offerings.length) {
    staged.services_json = JSON.stringify(offerings.map((name) => ({ name })));
  }

  /*
   * Products, to `products_json`.
   *
   * That key had no projection at all until 20261020010000 — the extractor
   * staged product names under `products_seen` precisely because there was
   * nowhere for them to go, so a shop published with an empty product list.
   * Names only, for the same reason services are: a caption's price is true
   * the week it was posted and misleading after.
   */
  const products = [...new Set(confirmedProducts.map((s) => s.trim()).filter(Boolean))];
  if (products.length) {
    staged.products_json = JSON.stringify(products.map((name) => ({ name })));
  }

  /*
   * Recent posts as LINKS, under a key the publish whitelist does not know.
   *
   * Not a gallery, and deliberately not one. The media_url Meta returns is a
   * signed address that expires within days and may not be stored or
   * re-hosted under its Platform Terms — a gallery built from those would be
   * broken images on somebody's listing inside a week, and somebody else's
   * photographs republished without permission in the meantime. A permalink
   * points at the post where it lives, stays correct, and lets a reviewer see
   * what the business actually posts.
   */
  const links = permalinks.filter(Boolean).slice(0, 12);
  if (links.length) staged.instagram_recent_posts = links;

  /*
   * The logo, under the whitelisted key so approval writes it to the
   * business. Guarded twice: the operator ticks a box, and the value must be
   * one of ours — a Meta CDN address here would publish a logo that breaks.
   */
  if (logoUrl && !/fbcdn\.net|cdninstagram\.com/i.test(logoUrl)) {
    staged.logo_url = logoUrl;
  }

  const bio = (p.biography ?? '').trim();
  if (bio && authoredConfirmed) {
    /*
     * `about` is on the whitelist, so this reaches the profile on approval —
     * which is precisely why it is gated. A biography is the owner's writing.
     */
    staged.about = bio;
  }

  /*
   * The category the account gives itself, or null.
   *
   * MEASURED 2026-10-09: 108 businesses holding an Instagram handle sat in
   * "Other" — the largest single bucket on the platform — because this row
   * never carried a category at all. An uncategorised listing is missing from
   * every category filter and every category page, which is most of how
   * anybody browses a directory.
   *
   * `categoryFromSelfDescription` reads only phrases the business wrote about
   * itself and returns null whenever two trades are named equally. null is
   * left for a reviewer rather than filled with a guess: "Other" is visibly
   * unknown, and a confidently wrong category is not.
   */
  const selfCategory = categoryFromSelfDescription(
    p.biography,
    name,
    ...offerings,
  );

  return {
    source_key: 'manual_extraction',
    /*
     * The profile URL, so re-reading the same handle UPDATES the candidate
     * rather than filing the business twice. There is a unique index on
     * (source_key, source_record_id) and a plain insert fails the second time.
     */
    source_record_id: url,
    name: name.slice(0, 200),
    category: selfCategory?.category ?? null,
    /*
     * The bio doubles as the description, ungated — the same treatment the
     * website extractor gives a page's meta description. It is the summary a
     * business publishes about itself to everyone who visits, and a directory
     * recording it is the ordinary business of directories. `about` above is
     * the gated copy, because that one lands on the profile verbatim.
     */
    description: bio || null,
    website: (p.website ?? '').trim() || null,
    /*
     * Contact details the operator picked from captions. Facts a business
     * published about itself, and the single most useful thing a directory
     * can carry — but chosen rather than guessed, because a caption can also
     * contain a customer's number or a partner's.
     */
    phone: (phone ?? '').trim() || null,
    email: (email ?? '').trim() || null,
    whatsapp: (whatsapp ?? '').trim() || null,
    /*
     * `{}`, never null. The column is NOT NULL with a '{}'::jsonb default, and
     * an explicit null overrides a default rather than falling back to it.
     */
    profile: staged,
    source_url: url,
    decision_reason:
      `Read from Instagram (@${handle}) through Meta's official business_discovery API by an administrator. `
      + (authoredConfirmed
        ? 'Rights to the account holder\'s own description confirmed at import.'
        : 'Facts only; the account description was not carried.')
      + (offerings.length
        ? ` ${offerings.length} service name(s) confirmed by the administrator from the account's own captions.`
        : '')
      + (products.length
        ? ` ${products.length} product name(s) confirmed, names only — no prices carried.`
        : '')
      + (links.length ? ` ${links.length} recent post link(s) recorded for review.` : '')
      /*
       * Stated on every row, because it is the first question a reviewer asks
       * on seeing Instagram as a source and no pictures.
       */
      + ' Photographs not carried — Meta Platform Data, and the URLs expire.',
  };
}
