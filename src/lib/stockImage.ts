/**
 * Telling a visitor when a photograph is a placeholder rather than the business.
 *
 * WHAT WAS MEASURED, LIVE, ON 2026-09-14
 *
 * 1,176 of 3,059 business profiles carry a cover image from images.pexels.com.
 * They arrive through the enrichment engine, which is careful about it in
 * every place except the one that matters: the asset is registered in
 * `business_media_assets` as `rights_decision: licensed, licence: Pexels
 * License`, and the change proposal's own reason reads "Licensed stock
 * placeholder … replace it with the real image when you claim or upload".
 *
 * None of that reaches the page. The profile rendered the photo full-bleed
 * with `alt={business.name}` — an assertion, to a reader and to a screen
 * reader, that this photograph shows this hospital. It does not. It shows
 * some hospital.
 *
 * The licence is not the problem: Pexels permits the use. The claim is the
 * problem. A directory that lets a stock photo stand in for a real shopfront
 * is a directory whose photographs mean nothing, and the first person to
 * notice is the business owner who finds a stranger's building on their page.
 *
 * WHY A HOST LIST AND NOT A DATABASE LOOKUP
 *
 * The authoritative record is `business_media_assets`, but the profile page
 * does not read that table and adding a query per profile to answer a
 * presentational question is the wrong trade. The host is decisive on its
 * own: no business hosts its own shopfront photograph on a stock library.
 *
 * The failure mode is deliberately one-sided. A mislabelled placeholder shows
 * a caveat that was not needed; an unlabelled one makes a false claim. Only
 * the second does damage, so the check errs towards disclosure.
 */

/**
 * Hosts that serve stock photography.
 *
 * Kept as exact host suffixes rather than a substring search: a business
 * legitimately called `pexels-interiors.ng` must not be caught by its name.
 */
const STOCK_HOSTS: readonly string[] = [
  'images.pexels.com',
  'pexels.com',
  'images.unsplash.com',
  'unsplash.com',
  'cdn.pixabay.com',
  'pixabay.com',
  'picsum.photos',
  'placehold.co',
  'via.placeholder.com',
];

/** Is this image a stock photograph standing in for the real thing? */
export function isStockPlaceholder(url: string | null | undefined): boolean {
  const s = String(url ?? '').trim();
  if (!s) return false;

  let host: string;
  try {
    host = new URL(s, 'https://placeholder.invalid').hostname.toLowerCase();
  } catch {
    return false;
  }
  // A relative URL resolves to the sentinel origin — that is our own asset.
  if (host === 'placeholder.invalid') return false;

  return STOCK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * The caption shown over a placeholder cover.
 *
 * Says what it is and what fixes it, because the person most likely to read
 * it is the owner of the business — and the fix is the action NowOpen wants
 * from them anyway.
 */
export const STOCK_COVER_NOTICE = 'Stock photo — not this business';

/**
 * The same caption for an advertising placement. All 97 placement photos
 * were stock (images.pexels.com) when this was written: a billboard shown
 * with a stock photo is not a photo of that billboard, and a buyer deciding
 * on a site deserves to know which pictures are the site.
 */
export const STOCK_SITE_NOTICE = 'Stock photo — not this site';

/** The longer form of the placement caption, for a tooltip. */
export const STOCK_SITE_EXPLANATION =
  'This is a licensed stock image standing in for a photo of this advertising site. '
  + 'Ask for site photos when you enquire.';

/** The longer form, for a tooltip or a caption with room. */
export const STOCK_COVER_EXPLANATION =
  'This is a licensed stock image standing in for a photo of the business. '
  + 'The owner can replace it by claiming this profile.';

/**
 * Alt text that does not make a claim the picture cannot support.
 *
 * `alt={business.name}` tells a screen-reader user "this is a photograph of
 * Duchess International Hospital". For a placeholder that is simply untrue,
 * and it is the one audience that cannot see the caption and judge for
 * itself.
 */
export function coverAltText(businessName: string, url: string | null | undefined): string {
  const name = String(businessName ?? '').trim() || 'this business';
  return isStockPlaceholder(url)
    ? `Stock photograph used as a placeholder cover for ${name}`
    : name;
}
