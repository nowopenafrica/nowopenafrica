import { useMemo, useState } from 'react';
import { AlertTriangle, Package, Printer, Sparkles, Video } from 'lucide-react';

import {
  CATALOGUE, PACKS, CREDIT_BUNDLES, awaitingQuote, byDivision, priceLabel, sellable,
  type CatalogueItem, type Division,
} from '../../lib/create/catalogue';

/**
 * NowOpen Create — what things cost.
 *
 * Browsable, quotable, and deliberately NOT buyable for anything printed.
 *
 * Every print price here is derived from a competitor's public retail price,
 * not from a quote NowOpen has been given. No printer has agreed to produce any
 * of it. So each one is labelled an estimate and the action is "Request a
 * quote" rather than a Buy button — because the first order taken at an
 * invented price is the first order sold at a loss, and the customer is owed
 * the truth either way.
 *
 * Digital creation is free and says so. Creator work has a real price, because
 * a creator's time is a known cost.
 *
 * The panel doubles as the to-do list: the banner counts exactly how many SKUs
 * are still waiting on a real supplier quote.
 */

const TABS: { key: Division; label: string; icon: typeof Printer }[] = [
  { key: 'create', label: 'Design', icon: Sparkles },
  { key: 'video', label: 'Video', icon: Video },
  { key: 'brand', label: 'Brand', icon: Package },
  { key: 'print', label: 'Print', icon: Printer },
];

export default function PrintPricing() {
  const [division, setDivision] = useState<Division>('create');
  const items = useMemo(() => byDivision(division), [division]);
  const pending = useMemo(() => awaitingQuote().length, []);

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create — what it costs</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Make it in Studio for free. Have a creator do it, or have it printed and delivered.
        </p>
      </header>

      {pending > 0 && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 flex gap-3">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 dark:text-amber-200">
            <strong>{pending} printed items are priced from market estimates.</strong>{' '}
            No production partner has quoted them yet, so they can be requested but not bought.
            Each one becomes orderable the moment a real quote replaces the estimate.
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setDivision(key)}
            className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full border text-sm font-semibold transition ${
              division === key
                ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => <ItemCard key={item.sku} item={item} />)}
      </div>

      {division === 'create' && (
        <section>
          <h3 className="font-bold text-gray-900 dark:text-white">Create credits</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            For AI generation, which costs real compute. Better value the more you buy.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {CREDIT_BUNDLES.map((b) => (
              <div key={b.naira} className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-center">
                <div className="font-bold text-gray-900 dark:text-white">₦{b.naira.toLocaleString('en-NG')}</div>
                <div className="text-xs text-gray-500">{b.credits} credits</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="font-bold text-gray-900 dark:text-white">Business packs</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Everything a business needs at one stage, rather than buying it piece by piece.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {PACKS.map((p) => (
            <div key={p.sku} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="font-bold text-gray-900 dark:text-white">{p.name}</h4>
                <span className="text-sm font-semibold text-gray-900 dark:text-white shrink-0">
                  ₦{p.price.toLocaleString('en-NG')}
                </span>
              </div>
              {/* A pack cannot be more certain than the least certain thing in it. */}
              {!sellable(p) && (
                <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                  Estimate — includes printed items not yet quoted
                </p>
              )}
              <ul className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                {p.includes.map((line) => <li key={line}>· {line}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ItemCard({ item }: { item: CatalogueItem }) {
  const estimate = item.basis === 'indicative';
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-bold text-sm text-gray-900 dark:text-white">{item.name}</h4>
        <span className={`text-xs font-semibold shrink-0 ${estimate ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-white'}`}>
          {priceLabel(item)}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{item.blurb}</p>

      {item.tiers && item.tiers.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.tiers.map((t) => (
            <span key={t.qty} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              {t.qty} · ₦{t.price.toLocaleString('en-NG')}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500">
          {item.turnaround && item.turnaround[1] > 0
            ? `${item.turnaround[0]}–${item.turnaround[1]} working days`
            : 'Instant'}
        </span>
        <button
          className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold ${
            sellable(item)
              ? 'bg-purple-600 text-white hover:bg-purple-700'
              : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
          }`}
        >
          {item.free ? 'Create it' : sellable(item) ? 'Order' : 'Request a quote'}
        </button>
      </div>
    </div>
  );
}

export const CATALOGUE_SIZE = CATALOGUE.length;
