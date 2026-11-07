/**
 * A placement's size, as an owner enters it, and its price in the one unit
 * the rest of Promote reads.
 *
 * WHY STRUCTURED, AND WHY THE TEXT AS WELL
 *
 * `advertisements.dimensions` is free text used for five different things
 * (see adDimensions.ts). An owner filling in the placement form gives a
 * structured answer instead, stored as `size_spec` (the database checks the
 * kind against the same five names). The legacy `dimensions` text is written
 * alongside it from sizeSummary, so every existing reader keeps working: an
 * area reads "12m × 6m", which readAdDimensions parses as a size.
 *
 * WHY toUsdPerDay LIVES HERE
 *
 * The owner states a rate in their own currency per day, week or month
 * (`rate_amount`, `currency`, `rate_period`). Promote compares and costs
 * placements in `pricing`, USD per day, so that is derived at save time from
 * the live rates loadRates returns (currency per 1 USD). A month is 30 days,
 * the same as the Promote mix costs a month. No rate for the currency means
 * no derived price: null, never a guess.
 */

export type SizeSpec =
  | { kind: 'area'; widthM: number; heightM: number }
  | { kind: 'screen'; resolution: string; orientation: 'landscape' | 'portrait' }
  | { kind: 'airtime'; seconds: number; spotsPerDay: number }
  | { kind: 'vehicle'; extent: 'one_flank' | 'both_flanks' | 'full_wrap' }
  | { kind: 'other'; text: string };

export type SizeKind = SizeSpec['kind'];
export type VehicleExtent = Extract<SizeSpec, { kind: 'vehicle' }>['extent'];
export type RatePeriod = 'day' | 'week' | 'month';

export const SIZE_KIND_LABELS: Record<SizeKind, string> = {
  area: 'Width and height',
  screen: 'Screen',
  airtime: 'Airtime',
  vehicle: 'Vehicle',
  other: 'Something else',
};

export const VEHICLE_EXTENT_LABELS: Record<VehicleExtent, string> = {
  one_flank: 'One flank',
  both_flanks: 'Both flanks',
  full_wrap: 'Full wrap',
};

export const RATE_PERIOD_DAYS: Record<RatePeriod, number> = { day: 1, week: 7, month: 30 };

/** 12 → "12", 4.5 → "4.5": no trailing zeros, no rounding of what was typed. */
const num = (n: number): string => String(Number(n));

/** The readable size, written to the legacy `dimensions` column. */
export function sizeSummary(s: SizeSpec): string {
  switch (s.kind) {
    case 'area':
      return `${num(s.widthM)}m × ${num(s.heightM)}m`;
    case 'screen':
      return `${s.resolution.trim()} screen · ${s.orientation}`;
    case 'airtime':
      return `${num(s.seconds)}s spot · ${num(s.spotsPerDay)} a day`;
    case 'vehicle':
      return VEHICLE_EXTENT_LABELS[s.extent];
    case 'other':
      return s.text.trim();
  }
}

/**
 * The owner's rate as USD per day, rounded to cents. `ratesUsdPer` is the
 * loadRates map: how many units of each currency one US dollar buys.
 */
export function toUsdPerDay(
  amount: number,
  currency: string,
  period: RatePeriod,
  ratesUsdPer: Record<string, number>,
): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  const rate = ratesUsdPer[currency.trim().toUpperCase()];
  if (!rate || !Number.isFinite(rate) || rate <= 0) return null;
  const usdPerDay = amount / rate / RATE_PERIOD_DAYS[period];
  return Math.round(usdPerDay * 100) / 100;
}
