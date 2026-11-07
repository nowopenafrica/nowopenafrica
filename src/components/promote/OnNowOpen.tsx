import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Loader2, Megaphone, Plus, ShieldCheck } from 'lucide-react';

import { useCurrency } from '../../contexts/CurrencyContext';
import { formatPrice, type RevenueProduct } from '../../lib/revenue/products';
import { addToPlan } from '../../lib/promote/campaigns';
import { productPriceUsd } from '../../lib/promote/hubMoney';
import { reportPlanAdd } from '../../lib/promote/planToast';
import SponsoredLabel, { type PlacementKind } from '../promotion/SponsoredLabel';

/**
 * The label each NowOpen product carries in front of customers.
 *
 * A sponsored search result is shown as "Sponsored"; every other product
 * surfaces the paying business itself (a spotlight, the homepage, a featured
 * offer, a takeover), which SponsoredLabel's wording calls "Featured". An
 * unknown slug gets "Sponsored" rather than nothing — an unlabelled paid
 * position is the one outcome the label exists to prevent.
 */
const LABEL_FOR: Record<string, Exclude<PlacementKind, 'organic'>> = {
  'sponsored-result': 'sponsored',
  'featured-business': 'featured',
  'category-spotlight': 'featured',
  'city-spotlight': 'featured',
  'homepage-feature': 'featured',
  'featured-offer': 'featured',
  'industry-takeover': 'featured',
};
const labelFor = (slug: string): Exclude<PlacementKind, 'organic'> => LABEL_FOR[slug] ?? 'sponsored';

/**
 * "On NowOpen": buying visibility on NowOpen itself.
 *
 * Moved here from the old /advertise page (now a redirect to the Promote hub,
 * see AdvertiseRedirect) so the cards live in one place.
 *
 * ── EMPTY UNTIL SOMEBODY SETS A PRICE, ON PURPOSE ───────────────────────
 *
 * The seven promotion products exist in the database with no price and
 * `active = false`, because inventing a price would be inventing a commercial
 * term. So this shows what is genuinely on sale — which may be nothing — and
 * the empty state says that plainly. A pricing block that quietly renders
 * nothing reads as broken; one that says "not open yet" is just true.
 *
 * ── WHAT IT DOES NOT DO YET ──────────────────────────────────────────────
 *
 * It does not take payment. A product joins the media plan ("Add to plan",
 * at its fixed price), but paying for it is step 3: the database refuses to
 * activate a promotion without a webhook-verified payment, and that path has
 * never completed on this project. A product with no price set is not
 * sellable, so it gets no button and keeps the enquiry link.
 */
export default function OnNowOpen({
  products, loading, failed,
}: { products: RevenueProduct[]; loading: boolean; failed: boolean }) {
  /* One formatter for the hub: prices are converted to USD and shown in the visitor's currency. */
  const { format, ngnPerUsd } = useCurrency();
  /* The product whose write is in flight; its button is disabled so a double tap adds once. */
  const [adding, setAdding] = useState<string | null>(null);
  const addProduct = async (p: RevenueProduct) => {
    if (adding || p.priceMinor == null) return;
    setAdding(p.id);
    try {
      reportPlanAdd(await addToPlan([{ kind: 'product', id: p.id, priceMinor: p.priceMinor, days: p.durationDays }]));
    } finally {
      setAdding(null);
    }
  };
  const priceOf = (p: RevenueProduct) => {
    const usd = productPriceUsd(p, ngnPerUsd);
    return usd != null ? format(usd) : formatPrice(p.priceMinor, p.currency);
  };
  return (
    <section id="on-nowopen" aria-labelledby="on-nowopen-title" data-promote-section="on-nowopen" className="scroll-mt-24">
      <h2 id="on-nowopen-title" className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white sm:text-xl">
        <Megaphone size={18} className="text-orange-600 dark:text-orange-400" aria-hidden />
        On NowOpen
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        Be in front of people at the moment they are choosing a business on NowOpen.
      </p>

      {/*
        The disclosure promise, made before anything is sold rather than in
        terms nobody reads. SponsoredLabel is required on every paid placement
        and a test fails if a card renders one without it.
      */}
      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-orange-600 dark:text-orange-400" size={20} aria-hidden />
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Paid placement is always labelled</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Everything you buy here is shown to customers as advertising. We never present a paid
              position as an organic result or a recommendation.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <SponsoredLabel kind="sponsored" />
          <SponsoredLabel kind="featured" />
        </div>
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 py-6 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Loading what is available…
        </div>
      )}

      {!loading && failed && (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
          We could not load advertising options just now. Please try again shortly, or{' '}
          <Link to="/contact" className="font-semibold underline">get in touch</Link>.
        </p>
      )}

      {!loading && !failed && products.length === 0 && (
        /*
         * The honest empty state. Nothing is priced yet, so nothing is for
         * sale — said out loud rather than rendered as a blank grid.
         */
        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-800 sm:p-8">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Advertising is not open for self-serve yet
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-sm text-gray-600 dark:text-gray-400">
            We are finishing the last of the payment setup before putting promotion on sale. If you
            want to advertise now, tell us what you are trying to reach and we will arrange it
            directly.
          </p>
          <Link
            to="/contact"
            className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gray-900 px-5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900"
          >
            Talk to us about advertising <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      )}

      {!loading && products.length > 0 && (
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
          {products.map((p) => (
            <li key={p.id} className="min-w-0">
              <article
                data-testid="product-card"
                data-product={p.slug}
                className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-5"
              >
                <h3 className="text-base font-bold text-gray-900 dark:text-white">{p.name}</h3>
                {p.description && (
                  <p className="mt-1.5 flex-1 text-sm text-gray-600 dark:text-gray-400">{p.description}</p>
                )}
                {/* The exact label a customer sees on this placement. */}
                <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  Customers see <SponsoredLabel kind={labelFor(p.slug)} />
                </p>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                  <span className="text-xl font-bold text-gray-900 dark:text-white">{priceOf(p)}</span>
                  {p.durationDays ? <> · {p.durationDays} days</> : null}
                </p>
                {p.priceMinor != null ? (
                  <button
                    type="button"
                    onClick={() => addProduct(p)}
                    disabled={adding !== null}
                    aria-label={`Add ${p.name} to plan`}
                    className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 text-sm font-semibold text-white transition hover:bg-orange-800 disabled:opacity-60"
                  >
                    {adding === p.id ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Plus size={15} aria-hidden />}
                    Add to plan
                  </button>
                ) : (
                  /* No price set, so nothing to put in a plan: it stays an enquiry. */
                  <Link
                    to={`/contact?product=${encodeURIComponent(p.slug)}`}
                    aria-label={`Get started with ${p.name}`}
                    className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 text-sm font-semibold text-white transition hover:bg-orange-800"
                  >
                    Get started <ArrowRight size={15} aria-hidden />
                  </Link>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
