import type { RevenueProduct } from '../revenue/products';

/**
 * Money on the Promote hub goes through ONE formatter: useCurrency().format,
 * which takes USD. The mix costs in whole naira and products are priced in
 * kobo, so both are turned into USD here with the same ngnPerUsd the
 * currency provider loaded — a visitor reading dollars never sees a naira
 * figure beside them, and one reading naira gets the original amount back.
 */
export const ngnToUsd = (ngn: number, ngnPerUsd: number): number => ngn / ngnPerUsd;

/** A product's price in USD, or null when it has none (or an unknown currency). */
export function productPriceUsd(p: RevenueProduct, ngnPerUsd: number): number | null {
  if (p.priceMinor == null) return null;
  const major = p.priceMinor / 100;
  if (p.currency === 'NGN') return ngnToUsd(major, ngnPerUsd);
  if (p.currency === 'USD') return major;
  return null;
}
