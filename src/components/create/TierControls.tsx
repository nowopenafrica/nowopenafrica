import { Crown, Gem } from 'lucide-react';

import {
  TIER_BLURBS, TIER_NAMES, TIERS, badgeText, priceText,
  type TierFilter, type TierInfo, type TierTable,
} from '../../lib/create/tiers';

/*
 * The tier badge and the Free / Premium / Signature filter on Create.
 * All figures come from lib/create/tiers.ts (credit_actions + noc_markets).
 */

const BADGE: Record<TierInfo['tier'], string> = {
  free: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300',
  premium: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
  signature: 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900',
};

export function TierBadge({ info, table, className = '' }: { info: TierInfo | undefined; table: TierTable | null; className?: string }) {
  if (!info || !table) return null;
  const naira = info.tier === 'free' ? 'No credits needed' : priceText(info, table.minorPerNoc, table.currency);
  return (
    <span
      data-testid="tier-badge"
      data-tier={info.tier}
      title={`${TIER_BLURBS[info.tier]} ${naira}.`}
      className={`inline-flex min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4 ${BADGE[info.tier]} ${className}`}
    >
      {info.tier === 'premium' && <Gem size={11} aria-hidden="true" />}
      {info.tier === 'signature' && <Crown size={11} aria-hidden="true" />}
      <span className="truncate">{badgeText(info)}</span>
    </span>
  );
}

/** One line under a premium design: the price, and that it is not on sale yet. */
export function TierPriceLine({ info, table }: { info: TierInfo | undefined; table: TierTable | null }) {
  if (!info || !table || info.tier === 'free') return null;
  return (
    <p data-testid="tier-price" className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
      {TIER_NAMES[info.tier]} price {priceText(info, table.minorPerNoc, table.currency)}
      {info.onSale ? '' : ' · free to edit until it passes review'}
    </p>
  );
}

export function TierFilterBar({ value, onChange, counts, id }: {
  value: TierFilter;
  onChange: (v: TierFilter) => void;
  /** How many items fall under each tier; a tier with none is not offered. */
  counts: Partial<Record<TierFilter, number>>;
  id: string;
}) {
  const options: TierFilter[] = ['all', ...TIERS.filter((t) => (counts[t] ?? 0) > 0)];
  if (options.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tier" id={id} data-testid="tier-filter">
      {options.map((t) => {
        const on = t === value;
        const label = t === 'all' ? 'All' : TIER_NAMES[t];
        return (
          <button
            key={t}
            type="button"
            aria-pressed={on}
            data-tier={t}
            onClick={() => onChange(t)}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold ${on ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900' : 'border-gray-300 text-gray-700 hover:border-gray-500 dark:border-gray-600 dark:text-gray-300'}`}
          >
            {t === 'premium' && <Gem size={13} aria-hidden="true" />}
            {t === 'signature' && <Crown size={13} aria-hidden="true" />}
            {label}
            {counts[t] !== undefined && <span className={on ? 'opacity-80' : 'text-gray-500 dark:text-gray-400'}>{counts[t]}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** The note that goes with any view showing paid tiers. */
export function TierNote() {
  return (
    <p data-testid="tier-note" className="max-w-[70ch] text-[12px] text-gray-600 dark:text-gray-400">
      Premium and Signature prices are set in NowOpen Credits (NOC). Buying opens once a design passes NowOpen&rsquo;s review
      (a score of 90 for Premium, 95 for Signature). Until then every design here is free to edit.
    </p>
  );
}
