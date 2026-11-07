/**
 * Which placements may appear on a public surface.
 *
 * "Public can view advertisements" is USING (true): the table hands every row
 * to anyone who asks, including the ones nobody should see. So every public
 * read filters, with one of these two:
 *
 * - isListedPlacement(row), on rows already fetched;
 * - `.not('lifecycle', 'in', UNLISTED_LIFECYCLES_IN)`, in the query. Use this
 *   when the result is a count (head: true has no rows to filter) or a limit
 *   (filtering after `.limit(30)` would show fewer than 30).
 *
 * The set: rejected and archived (an admin took them down), and
 * pending_review (an unverified owner's placement waiting for an admin,
 * Partner portal, 20261111010000). placement_trust and media_owners_public
 * leave out the same three.
 *
 * Kept free of imports so api/ (the sitemap) can use it too. The chatbot edge
 * function (Deno) cannot import src/; it writes the set out, and
 * src/test/publicPlacementListing.test.tsx checks the two agree.
 *
 * Exempt: admin views, the owner's own placements, and a member's own
 * dashboard (they must see their own rejected or waiting rows).
 */
export const UNLISTED_LIFECYCLES: readonly string[] = ['rejected', 'archived', 'pending_review'];

/** The PostgREST list for `.not('lifecycle', 'in', …)`. lifecycle is NOT NULL, so no row is lost to NULL. */
export const UNLISTED_LIFECYCLES_IN = `(${UNLISTED_LIFECYCLES.join(',')})`;

export function isListedPlacement(a: { lifecycle?: string | null }): boolean {
  return !UNLISTED_LIFECYCLES.includes(a.lifecycle ?? '');
}
