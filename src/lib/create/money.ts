/**
 * Money, in one place.
 *
 * ── TWO UNITS EXIST IN THIS CODEBASE AND BOTH ARE CORRECT ────────────────
 *
 *   public.services.price_minor        MINOR units (kobo). New catalogue.
 *   public.create_orders.estimate_total WHOLE NAIRA. Predates it, and its
 *                                       rows are historical records of what
 *                                       a customer was shown — rewriting
 *                                       them to change units would falsify
 *                                       them.
 *
 * So a conversion exists, and it lives here alone. Scattered `* 100` is how
 * a figure gets multiplied twice, and a price that is a hundred times wrong
 * looks obviously wrong on a flyer and perfectly plausible on a brand film.
 *
 * ── WHY MINOR UNITS AT ALL ───────────────────────────────────────────────
 *
 * Paystack charges in kobo, so the catalogue figure must convert to the
 * charge amount without a remainder. And the brief asks this to be ready for
 * other African markets, where the minor unit is not always decorative.
 *
 * Never a float. 0.1 + 0.2 is not 0.3, and that error compounds through a
 * basket into an invoice nobody can reconcile.
 */

/** 100 kobo to the naira; the same factor for every two-decimal currency. */
const MINOR_PER_MAJOR: Record<string, number> = {
  NGN: 100, GHS: 100, KES: 100, ZAR: 100, USD: 100, EUR: 100, GBP: 100,
  /* Zero-decimal currencies: the minor unit IS the major unit. */
  RWF: 1, UGX: 1, XOF: 1, XAF: 1, DJF: 1,
};

export const minorPerMajor = (currency: string): number =>
  MINOR_PER_MAJOR[currency?.toUpperCase()] ?? 100;

/** Whole naira (as create_orders stores it) → kobo. Exact for integers. */
export const majorToMinor = (major: number, currency = 'NGN'): number =>
  Math.round(major * minorPerMajor(currency));

/**
 * Kobo → whole naira, for writing into create_orders.
 *
 * Rounds rather than truncates: the catalogue only ever produces whole major
 * units (the pricing function truncates to them), so a remainder here means
 * something upstream is wrong and losing it silently would hide that.
 */
export const minorToMajor = (minor: number, currency = 'NGN'): number =>
  Math.round(minor / minorPerMajor(currency));

const SYMBOL: Record<string, string> = { NGN: '₦', GHS: '₵', KES: 'KSh', ZAR: 'R', USD: '$', GBP: '£', EUR: '€' };

/**
 * A price, written the way a customer reads it.
 *
 * Grouped, no decimals for whole amounts — ₦7,500 rather than ₦7,500.00,
 * because the decimals are noise on a catalogue and nobody pays kobo.
 */
export function formatMinor(minor: number, currency = 'NGN'): string {
  const per = minorPerMajor(currency);
  const major = minor / per;
  const symbol = SYMBOL[currency?.toUpperCase()] ?? `${currency} `;
  const whole = Number.isInteger(major);
  return `${symbol}${major.toLocaleString('en-NG', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

/**
 * What a figure means, said out loud.
 *
 * A number on a catalogue page is a promise unless it says otherwise, and
 * two of these three are not promises. This is the sentence that keeps the
 * difference in front of the customer rather than in the database.
 */
export const BASIS_NOTE: Record<string, string> = {
  quoted: 'A confirmed price.',
  indicative: 'An estimate benchmarked against published printers — we confirm before anything is produced.',
  proposed: 'A guide price. We confirm it against your brief before any work or payment.',
};

/** The label a price carries: "from ₦7,500" when more scope changes it. */
export function priceLabel(
  service: { price_minor: number | null; currency: string; pricing_model: string; price_unit: string | null },
): string {
  if (service.pricing_model === 'free') return 'Free';
  if (service.price_minor === null || service.pricing_model === 'custom_quote') return 'Quoted';
  const amount = formatMinor(service.price_minor, service.currency);
  const unit = service.price_unit ? ` ${service.price_unit}` : '';
  /*
   * "from" only where the figure really is a floor. On a fixed or per-unit
   * price it would understate a number that is exactly right, and a customer
   * who reads "from ₦25,000 per screen" cannot tell what four screens cost.
   */
  const open = service.pricing_model === 'starting_at' || service.pricing_model === 'package';
  return `${open ? 'from ' : ''}${amount}${unit}`;
}
