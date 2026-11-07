/**
 * Finding a business's own listing from its Instagram handle.
 *
 * ── WHY THIS IS THE MISSING PIECE ────────────────────────────────────────
 *
 * MEASURED 2026-10-10: 4,108 listable businesses, 2 claimed, and ZERO claims
 * ever submitted. The claim funnel itself is sound — RLS lets an authenticated
 * user insert, a logged-out visitor is sent to /login?next=<listing>, and the
 * admin panel renders what arrives. Nobody has ever reached it.
 *
 * That is not a broken funnel, it is a missing door. A business on Instagram
 * has no way to discover that NowOpen already holds its listing; it would have
 * to know the platform exists, search for itself, and recognise the right row
 * among four thousand. So the listing sits unclaimed and the owner never knows.
 *
 * This module is the matching behind "type your handle, find your listing".
 *
 * ── IT SPENDS NO INSTAGRAM QUOTA, DELIBERATELY ───────────────────────────
 *
 * Nothing here calls Meta. `extract-instagram` is staff-gated precisely
 * because it spends the app's hourly budget — MEASURED at 86% of the hour from
 * a single run — and a public field that anyone can type into would empty that
 * budget in minutes, taking the admin tooling down with it.
 *
 * It does not need to: NowOpen already holds the handles. Searching our own
 * directory is free, instant, and answers the only question the visitor is
 * asking, which is "am I already on here?"
 */

export interface ListingRow {
  id: string;
  name: string | null;
  username: string | null;
  location: string | null;
  category: string | null;
  image_url: string | null;
  claim_status: string | null;
  social_links: Record<string, string> | null;
}

export interface Match {
  listing: ListingRow;
  /**
   * How it was matched. Shown to the visitor, because "we matched your handle"
   * and "we matched a similar name" deserve different levels of confidence
   * from somebody about to claim a business.
   */
  via: 'handle' | 'name';
}

export type LookupOutcome =
  /** Not a usable Instagram handle. */
  | { kind: 'invalid' }
  /** One or more listings that may be theirs, best first. */
  | { kind: 'found'; matches: Match[] }
  /** Nothing on NowOpen. The honest answer, and an invitation to add it. */
  | { kind: 'none'; handle: string };

/** Lowercase, punctuation-free, for comparing a handle against a name. */
export function nameKey(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    // Strip anything that is not a letter or digit: "Ada's Fabrics" and
    // "adasfabrics" are the same business written two ways.
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Rank listings against a handle.
 *
 * A handle match is exact and trustworthy. A name match is a SUGGESTION — a
 * handle is a compressed business name, so `bodylush_hairs` and "Bodylush
 * Hairs" are almost certainly the same shop, but "lagoshotel" matching a hotel
 * called Lagos Hotel is a coincidence waiting to happen. Both are offered;
 * only the first is presented as certain.
 *
 * @param handle normalised by readHandle (lowercase, no @, no URL)
 */
export function rankMatches(handle: string, rows: ListingRow[]): Match[] {
  const h = handle.trim().toLowerCase();
  if (!h) return [];
  const hKey = nameKey(h);

  const byHandle: Match[] = [];
  const byName: Match[] = [];
  const seen = new Set<string>();

  for (const listing of rows) {
    if (seen.has(listing.id)) continue;

    const stored = listing.social_links?.instagram ?? '';
    /*
     * The stored value is a bare handle OR a full URL, sometimes with a
     * /profilecard/ suffix — so compare on the handle inside it rather than on
     * the string. Done with nameKey rather than a URL parse because the caller
     * has already normalised what it could.
     */
    const storedHandle = stored.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').split(/[/?#]/)[0];

    if (storedHandle && storedHandle.toLowerCase() === h) {
      byHandle.push({ listing, via: 'handle' });
      seen.add(listing.id);
      continue;
    }

    /*
     * Name match only when the whole key is equal. A `includes()` would match
     * "ada" against every business with "ada" anywhere in its name and offer a
     * stranger's listing to claim, which is the one outcome worth avoiding
     * completely.
     */
    if (hKey && nameKey(listing.name) === hKey) {
      byName.push({ listing, via: 'name' });
      seen.add(listing.id);
    }
  }

  return [...byHandle, ...byName];
}

/** True when this listing is already owned, so it cannot be claimed. */
export function isOwned(listing: ListingRow): boolean {
  return (listing.claim_status ?? '').toLowerCase() === 'claimed';
}

/** The path to a listing, matching the rest of the app. */
export function listingPath(listing: ListingRow): string {
  return `/business/${listing.username ?? listing.id}`;
}
