/**
 * Share links for a single product on a business page.
 *
 * A product is not its own page. Sharing one means sharing the business — the
 * person who opens the link lands on the shop that sells it, not on a bare
 * product sheet with no seller attached. So the link points at the profile's
 * products tab and carries the product id as a query param, which the profile
 * reads back to open that tab, scroll to the item and flash it.
 *
 * Kept dependency-free and free of any `import.meta` so the same helpers work
 * under the SPA and under the SSR profile renderer.
 */

/** The shape taken off a product row; only what a share message needs. */
export interface ShareableProduct {
  id?: string | number | null;
  name?: string | null;
  price?: string | null;
}

/**
 * The absolute public URL of a business profile, or null if the row has
 * neither a handle nor an id to address it by.
 */
export function businessProfileUrl(
  business: { username?: string | null; id?: string | number | null } | null | undefined,
  siteUrl: string,
): string | null {
  if (!business) return null;
  const path = business.username
    ? `/${String(business.username)}`
    : business.id
    ? `/businesses/${business.id}`
    : null;
  return path ? `${siteUrl}${path}` : null;
}

/** The deep link to one product on a business profile's products tab. */
export function productShareUrl(profileUrl: string, productId: string | number): string {
  const separator = profileUrl.includes('?') ? '&' : '?';
  return `${profileUrl}${separator}tab=products&product=${encodeURIComponent(String(productId))}`;
}

/** The one-line message that rides alongside the link. */
export function productShareText(businessName: string, product: ShareableProduct): string {
  const name = String(product.name ?? '').trim() || 'this item';
  const price = String(product.price ?? '').trim();
  return price
    ? `${name} - ${price} at ${businessName} on NowOpen Africa`
    : `${name} at ${businessName} on NowOpen Africa`;
}

/** The title/email subject for a shared product. */
export function productShareTitle(businessName: string, product: ShareableProduct): string {
  const name = String(product.name ?? '').trim() || 'Product';
  return `${name} - ${businessName} | NowOpen Africa`;
}
