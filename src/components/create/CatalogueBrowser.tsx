import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';

import {
  loadCategories, loadServices, type Service, type ServiceCategory,
} from '../../lib/create/services';
import { priceCaveat, serviceAsCatalogueItem } from '../../lib/create/serviceAdapter';
import { formatMinor } from '../../lib/create/money';
import type { CatalogueItem } from '../../lib/create/catalogue';

/**
 * The priced catalogue, read from the database.
 *
 * ── WHY THIS IS NOT A LIST IN A FILE ─────────────────────────────────────
 *
 * It was. ~50 SKUs in src/lib/create/catalogue.ts, which meant moving one
 * price needed an engineer, a build and a deploy — so in practice prices did
 * not get corrected, they got worked around. These rows are editable from the
 * admin console, and the page shows whatever is published right now.
 *
 * ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────
 *
 * It will not present a guess as a price. `is_orderable` is a generated
 * column in the database, so this component cannot get that judgement wrong
 * even by accident: a service is payable or it is an enquiry, and the caveat
 * under the figure says which.
 *
 * ── AND IT SAYS WHEN IT CANNOT LOAD ──────────────────────────────────────
 *
 * supabase-js resolves with { data, error } rather than rejecting, so a
 * failed read used to render as an empty section — a page quietly claiming
 * NowOpen offers nothing. The error is caught and shown.
 */

interface Props {
  onConfigure: (item: CatalogueItem) => void;
}

export default function CatalogueBrowser({ onConfigure }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [list, cats] = await Promise.all([loadServices(), loadCategories()]);
        if (!live) return;
        setServices(list);
        /* Only categories that actually hold something: an empty tab is a
           promise of work we do not have. */
        const used = new Set(list.map((s) => s.category_id));
        const shown = cats.filter((c) => used.has(c.id));
        setCategories(shown);
        setActive(shown[0]?.id ?? null);
      } catch (err) {
        if (live) setProblem(err instanceof Error ? err.message : 'The catalogue could not be loaded.');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const shown = useMemo(
    () => services.filter((s) => s.category_id === active),
    [services, active],
  );

  const payable = services.filter((s) => s.is_orderable).length;

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-gray-500">
        <Loader2 size={15} className="animate-spin" /> Loading the catalogue…
      </p>
    );
  }

  if (problem) {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>The service list could not be loaded just now. {problem}</span>
      </p>
    );
  }

  if (services.length === 0) return null;

  return (
    <section>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            aria-pressed={active === c.id}
            className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition ${
              active === c.id
                ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                : 'border-gray-300 text-gray-700 hover:border-green-400 dark:border-gray-600 dark:text-gray-300'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {categories.find((c) => c.id === active)?.summary}
      </p>

      {/*
        Said once, above the grid, rather than shouted on every card.

        Every figure in this catalogue is a launch price NowOpen has set and
        not yet confirmed against a supplier or a creator's quote. Saying so
        plainly here is the difference between a price list and a price list
        that is honest about what it is.
      */}
      {payable === 0 && (
        <div className="mt-4 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            <strong>These are guide prices, not final quotes.</strong> Send a request and you
            will get a real price for your brief, your quantity and your city before anything is
            charged.
          </p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {shown.map((service) => {
          const caveat = priceCaveat(service);
          return (
            <div
              key={service.sku}
              className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
            >
              <h4 className="text-sm font-bold text-gray-900 dark:text-white">{service.name}</h4>
              {service.short_description && (
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{service.short_description}</p>
              )}

              <div className="mt-2 text-lg font-extrabold text-gray-900 dark:text-white">
                {service.price_minor === null
                  ? 'Quoted'
                  : `${service.pricing_model === 'starting_at' || service.pricing_model === 'package' ? 'from ' : ''}${formatMinor(service.price_minor, service.currency)}`}
                {service.price_unit && (
                  <span className="ml-1 text-xs font-semibold text-gray-500">{service.price_unit}</span>
                )}
              </div>

              {caveat && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">{caveat}</p>
              )}

              {service.turnaround_max_days ? (
                <p className="mt-1 text-[11px] text-gray-500">
                  {service.turnaround_min_days === service.turnaround_max_days
                    ? `${service.turnaround_max_days} working days`
                    : `${service.turnaround_min_days}–${service.turnaround_max_days} working days`}
                </p>
              ) : null}

              <button
                onClick={() => onConfigure(serviceAsCatalogueItem(service))}
                className="mt-auto pt-3 inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-800 hover:border-green-400 dark:border-gray-600 dark:text-gray-200"
              >
                {/* The word matches what actually happens next. */}
                {service.is_orderable ? 'Order this' : 'Request a price'} <ArrowRight size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
