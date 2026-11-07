import { MapPin } from 'lucide-react';

import { useCurrency } from '../../contexts/CurrencyContext';
import { formatLocalDate } from '../../lib/dates';
import { ngnToUsd } from '../../lib/promote/hubMoney';
import {
  IMPORTED_FALLBACK, availabilityText, priceBasisParts, trustLabelText, type PlacementTrust,
} from '../../lib/promote/trust';
import type { Advertisement } from '../../types';

/**
 * The two lines every placement shows on the hub, wherever it appears — a
 * card in "Out in the world" or a row in a goal's budget level. One
 * component so the price basis and the word "indicative" can never drift
 * between the two.
 */

/**
 * The trust row for a placement, or the honest default. A page passes the Map
 * it read once; until that read answers (and if it fails) the Map is empty, so
 * every placement reads as the imported default (IMPORTED_FALLBACK) — never
 * "Available" on the strength of a request still in flight.
 */
export const trustFor = (trust: Map<string, PlacementTrust> | undefined, id: string | number): PlacementTrust =>
  trust?.get(String(id)) ?? IMPORTED_FALLBACK(String(id));

/** The trust label as a small chip, set beside the medium. Words from trust.ts only. */
export function TrustChip({ trust }: { trust: PlacementTrust }) {
  const strong = trust.trustLabel !== 'source_listed';
  return (
    <span
      data-testid="trust-chip"
      data-trust={trust.trustLabel}
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        strong
          ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
      }`}
    >
      {trustLabelText(trust.trustLabel)}
    </span>
  );
}

/** The availability line from trust.ts (confirmed and by whom, booked, or unconfirmed), as one quiet line. */
export function AvailabilityLine({ trust, className = '' }: { trust: PlacementTrust; className?: string }) {
  return (
    <span data-testid="placement-availability" className={`block text-xs text-gray-500 dark:text-gray-400 ${className}`}>
      {availabilityText(trust, formatLocalDate)}
    </span>
  );
}

/**
 * The price's basis after the rate: always led by one "indicative" (even a
 * partner price is not a quote for your dates), then whatever trust.ts knows
 * about where the price came from. Composed from priceBasisParts, so nothing
 * here searches the wording.
 */
export const priceBasisSuffix = (trust: PlacementTrust): string => {
  const { detail } = priceBasisParts(trust, formatLocalDate);
  return detail ? `indicative · ${detail}` : 'indicative';
};

/** Where it is: the city line, optionally led by the medium. */
export function PlacementWhere({ advert, withCategory = false }: { advert: Advertisement; withCategory?: boolean }) {
  const text = [withCategory ? advert.category : null, advert.location].filter(Boolean).join(' · ');
  if (!text) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <MapPin size={13} className="shrink-0 text-gray-400" aria-hidden />
      <span className="line-clamp-1">{text}</span>
    </p>
  );
}

/**
 * The rate, per day, always "indicative" — a listed rate is not a quote for
 * your dates — followed by its basis from trust.ts, if one is known. The struck
 * card price shows only when the database holds a list price that beats the
 * price (which it also enforces). With `costNgn`, the month the mix costed is
 * added underneath on the same basis. Unpriced rows say so instead of showing
 * a number. The availability line sits under the price either way.
 */
export function PlacementPrice({
  advert, trust, costNgn, days = 30, align = 'left',
}: { advert: Advertisement; trust: PlacementTrust; costNgn?: number; days?: number; align?: 'left' | 'right' }) {
  const { format, ngnPerUsd } = useCurrency();
  const priced = advert.pricing != null && advert.pricing > 0;
  if (!priced) {
    return (
      <span className={`block min-w-0 ${align === 'right' ? 'sm:text-right' : ''}`}>
        <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Price on request</span>
        <AvailabilityLine trust={trust} />
      </span>
    );
  }
  const struck = typeof advert.list_price_per_day === 'number' && advert.list_price_per_day > (advert.pricing ?? 0);
  return (
    <span className={`block min-w-0 ${align === 'right' ? 'sm:text-right' : ''}`}>
      <span data-testid="placement-price" className="block text-xs text-gray-500 dark:text-gray-400">
        {struck ? (
          <><span className="font-medium tabular-nums text-gray-400 line-through">{format(advert.list_price_per_day as number)}</span>{' '}</>
        ) : null}
        <span className="text-sm font-bold text-gray-900 dark:text-white">{format(advert.pricing as number)}</span>
        {' '}per day · {priceBasisSuffix(trust)}
      </span>
      {costNgn != null && (
        <span data-testid="placement-cost" className="block text-xs text-gray-500 dark:text-gray-400">
          about {format(ngnToUsd(costNgn, ngnPerUsd))} for {days} days · indicative
        </span>
      )}
      <AvailabilityLine trust={trust} />
    </span>
  );
}
