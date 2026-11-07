import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Printer, X } from 'lucide-react';

import TemplateGallery from './TemplateGallery';
import { CATALOGUE, type CatalogueItem } from '../../lib/create/catalogue';
import { deliverableSlugFor, listedIn, type Need, type NeedSlug } from '../../lib/create/needs';
import type { DesignTemplate } from '../../lib/designTemplates';

/**
 * The print item each deliverable is printed as.
 *
 * Only the deliverables that are genuinely printed objects. An Instagram
 * post or an email signature has no print run, so its need view offers
 * "Have it made for you" and no "Order prints" — a print button there would
 * open a configurator for something unrelated.
 */
const PRINT_SKU: Record<string, string> = {
  'business-card': 'pr-cards',
  letterhead: 'pr-letterhead',
  flyer: 'pr-flyer-a5',
  'offer-flyer': 'pr-flyer-a5',
  poster: 'pr-poster-a3',
  notice: 'pr-flyer-a4',
  'event-poster': 'pr-poster-a3',
  'product-label': 'pr-stickers',
  'hang-tag': 'pr-stickers',
  merch: 'pr-tshirt',
  'roll-up': 'pr-rollup',
  banner: 'pr-flex-5x3',
  'shopfront-sign': 'pr-flex-7x3',
};

const printItemFor = (need: Need, deliverable: string): CatalogueItem | null => {
  /* The chosen item first; with none chosen, the need's first printable one. */
  const slugs = deliverable ? [deliverable] : need.deliverables.map((d) => d.slug);
  for (const slug of slugs) {
    const sku = PRINT_SKU[slug];
    const item = sku ? CATALOGUE.find((c) => c.sku === sku) : undefined;
    if (item) return item;
  }
  return null;
};

/**
 * What opens when a tile, a popular chip or a request resolves to a need.
 *
 * Three things, in this order and nothing else: the things inside the need,
 * the designs for the one chosen, and a slim lane for somebody who would
 * rather not make it themselves. The page above it stays exactly as it was,
 * so changing your mind is one tap on another tile.
 */
export default function NeedView({
  need, deliverable, missing, n, listed, onDeliverable, onClose, onOrderPrints,
}: {
  need: Need;
  deliverable: string;
  /** A thing that was asked for and has no finished design yet. */
  missing?: string;
  n: number;
  /** The finished designs on offer (the listing rule already applied). */
  listed: DesignTemplate[];
  onDeliverable: (slug: string) => void;
  onClose: () => void;
  onOrderPrints: (item: CatalogueItem) => void;
}) {
  const inNeed = useMemo(() => listedIn(need.slug, listed), [need.slug, listed]);

  /* Only things with at least one finished design get a chip. */
  const chips = useMemo(
    () => need.deliverables
      .map((d) => ({ ...d, count: inNeed.filter((t) => deliverableSlugFor(t) === d.slug).length }))
      .filter((d) => d.count > 0),
    [need, inNeed],
  );

  const focus = useMemo<{ need: NeedSlug | ''; deliverable: string; n: number }>(
    () => ({ need: need.slug, deliverable, n }),
    [need.slug, deliverable, n],
  );

  const printItem = printItemFor(need, deliverable);

  /* "packaging", "deck cover" - but a name like "YouTube thumbnail" keeps its capitals. */
  const missingRaw = missing ? need.deliverables.find((d) => d.slug === missing)?.name : undefined;
  const missingName = missingRaw && !/[A-Z]/.test(missingRaw.slice(1))
    ? missingRaw.charAt(0).toLowerCase() + missingRaw.slice(1)
    : missingRaw;

  return (
    <section
      id="create-need"
      data-create-section="need"
      data-need={need.slug}
      aria-labelledby="need-view-title"
      className="scroll-mt-24 rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/60 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="need-view-title" tabIndex={-1} className="focus:outline-none text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">{need.title}</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{need.blurb}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-700 dark:hover:text-white"
        >
          <X size={18} />
        </button>
      </div>

      {chips.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2" aria-label={`Things in ${need.title}`}>
          <button
            type="button"
            onClick={() => onDeliverable('')}
            aria-pressed={deliverable === ''}
            className={`inline-flex items-center gap-1.5 min-h-[44px] rounded-full border px-4 text-sm font-semibold transition ${
              deliverable === ''
                ? 'border-transparent bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'border-gray-300 text-gray-700 hover:border-green-400 dark:border-gray-600 dark:text-gray-300'
            }`}
          >
            All <span className={deliverable === '' ? 'text-white/60 dark:text-gray-500' : 'text-gray-400'}>{inNeed.length}</span>
          </button>
          {chips.map((d) => {
            const on = deliverable === d.slug;
            return (
              <button
                key={d.slug}
                type="button"
                onClick={() => onDeliverable(on ? '' : d.slug)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 min-h-[44px] rounded-full border px-4 text-sm font-semibold transition ${
                  on
                    ? 'border-transparent bg-green-700 text-white'
                    : 'border-gray-300 text-gray-700 hover:border-green-400 dark:border-gray-600 dark:text-gray-300'
                }`}
              >
                {d.name} <span className={on ? 'text-white/70' : 'text-gray-400'}>{d.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {missingName && (
        /*
         * Asked for, and nothing finished yet. Said once, plainly, with the
         * whole need below as the nearest honest answer.
         */
        <p data-testid="need-missing" className="mt-5 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
          No {missingName} designs yet — here is everything in {need.title}. Or{' '}
          <Link to="/media/services#made-for-you" className="font-semibold text-green-700 underline underline-offset-2 dark:text-green-300">
            have it made for you
          </Link>.
        </p>
      )}

      <div className="mt-6">
        {inNeed.length === 0 ? (
          /*
           * Reached only by a request or an old link — a tile is never shown
           * for an empty need. Said plainly, with the lane below as the way on.
           */
          <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
            There are no finished designs for {need.title.toLowerCase()} yet. A creator can make it for you.
          </p>
        ) : (
          <TemplateGallery focus={focus} embedded />
        )}
      </div>

      {/* The slim lane: the same thing, made by somebody else or printed. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-gray-200 pt-5 dark:border-gray-700">
        <p className="mr-auto text-sm text-gray-600 dark:text-gray-400">Rather not do it yourself?</p>
        <Link
          to="/media/services#made-for-you"
          className="inline-flex items-center gap-1.5 min-h-[44px] rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-800 hover:border-green-400 dark:border-gray-600 dark:text-gray-200"
        >
          Have it made for you <ArrowRight size={15} />
        </Link>
        {printItem && (
          <button
            type="button"
            onClick={() => onOrderPrints(printItem)}
            className="inline-flex items-center gap-1.5 min-h-[44px] rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-800 hover:border-green-400 dark:border-gray-600 dark:text-gray-200"
          >
            <Printer size={15} /> Order prints
          </button>
        )}
      </div>
    </section>
  );
}
