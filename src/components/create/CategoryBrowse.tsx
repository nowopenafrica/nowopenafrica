import { useMemo, useState } from 'react';
import { Shuffle } from 'lucide-react';

import CatalogueFilters from './CatalogueFilters';
import TemplateCard, { TemplateCardSkeleton } from './TemplateCard';
import type { DesignTemplate } from '../../lib/designTemplates';
import {
  CATEGORIES, shownSubcategories, subcategoryFor, type CategoryKey,
} from '../../lib/create/catalogueTaxonomy';
import {
  applyFilters, filterOptions, type FilterSelection,
} from '../../lib/create/catalogueFilters';

/**
 * Browse by category (spec §10): the founder's categories A to H, the
 * products inside them, the filters, and the cards.
 *
 * ONLY WHAT `shownSubcategories` ALLOWS. A subcategory appears once its
 * listed work spans four directions. No template carries a direction yet, so
 * today this renders nothing at all, and the page keeps its need tiles and
 * need view as they are. Task 18's pilot adds the first directed work.
 *
 * The category buttons are the Category filter, written as navigation: they
 * always offer every category that has a shown subcategory. The other groups
 * are CatalogueFilters, offering only values that match something.
 */

const PAGE = 12;

const chip = (on: boolean) => `inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition ${
  on
    ? 'border-transparent bg-gray-900 text-white dark:bg-white dark:text-gray-900'
    : 'border-gray-300 text-gray-700 hover:border-green-400 dark:border-gray-600 dark:text-gray-300'
}`;

export default function CategoryBrowse({
  listed, onEdit, loading = false, error = null,
}: {
  /** The finished designs on offer (the listing rule already applied). */
  listed: DesignTemplate[];
  onEdit: (tpl: DesignTemplate) => void;
  /** The uploaded half of the catalogue has not been attempted yet. */
  loading?: boolean;
  /** Why the uploaded half could not be read, said plainly. */
  error?: string | null;
}) {
  const shown = useMemo(() => shownSubcategories(listed), [listed]);
  const shownKeys = useMemo(() => new Set(shown.map((s) => s.key)), [shown]);
  const categories = useMemo(
    () => CATEGORIES.filter((c) => shown.some((s) => s.category === c.key)),
    [shown],
  );

  /* Only designs in a shown subcategory are browsed here. */
  const pool = useMemo(
    () => listed.filter((t) => shownKeys.has(subcategoryFor(t)?.key ?? '')),
    [listed, shownKeys],
  );

  const [selection, setSelection] = useState<FilterSelection>({});
  const [picked, setSub] = useState('');
  const [pages, setPages] = useState(1);
  /* Set by the visitor's first change, so arrival is not announced. */
  const [changed, setChanged] = useState(false);

  const category = selection.category as CategoryKey | undefined;
  /*
   * The product chip in force: a stale one (no longer shown, or outside the
   * chosen category) is let go here, so it can never hold the grid empty
   * with no chip on screen to release it.
   */
  const sub = picked && shownKeys.has(picked)
    && (!category || shown.some((s) => s.key === picked && s.category === category))
    ? picked : '';
  const subs = category ? shown.filter((s) => s.category === category) : shown;
  const inSub = useMemo(
    () => (sub ? pool.filter((t) => subcategoryFor(t)?.key === sub) : pool),
    [pool, sub],
  );
  const results = useMemo(() => applyFilters(inSub, selection), [inSub, selection]);
  const options = useMemo(
    () => filterOptions(inSub, selection).filter((g) => g.key !== 'category'),
    [inSub, selection],
  );

  if (shown.length === 0) return null;

  const update = (next: FilterSelection) => { setSelection(next); setPages(1); setChanged(true); };

  const pickCategory = (key: CategoryKey | '') => {
    const next: FilterSelection = { ...selection };
    if (key) next.category = key; else delete next.category;
    /* A product outside the new category is let go. */
    if (sub && key && !shown.some((s) => s.key === sub && s.category === key)) setSub('');
    update(next);
  };

  const pickSub = (key: string) => { setSub(sub === key ? '' : key); setPages(1); setChanged(true); };

  /* The filters' own Clear: the category is browse navigation and stays. */
  const clear = () => { update(category ? { category } : {}); };
  /* The empty state's Clear also lets the product go, so it always leads somewhere. */
  const clearAll = () => { setSub(''); clear(); };

  const visible = results.slice(0, pages * PAGE);

  return (
    <section
      data-create-section="browse"
      aria-labelledby="browse-title"
      className="rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/60 sm:p-6"
    >
      <h2 id="browse-title" className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">Browse by category</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Products with designs in at least four directions, so there is a real choice in each.
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Categories">
        <button type="button" onClick={() => pickCategory('')} aria-pressed={!category} className={chip(!category)}>
          All categories
        </button>
        {categories.map((c) => (
          <button
            key={c.key}
            type="button"
            data-testid="browse-category"
            data-category={c.key}
            onClick={() => pickCategory(category === c.key ? '' : c.key)}
            aria-pressed={category === c.key}
            title={c.blurb}
            className={chip(category === c.key)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Products">
        {subs.map((s) => {
          const on = sub === s.key;
          return (
            <button
              key={s.key}
              type="button"
              data-testid="browse-subcategory"
              data-subcategory={s.key}
              onClick={() => pickSub(s.key)}
              aria-pressed={on}
              className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-semibold transition ${
                on
                  ? 'border-transparent bg-green-700 text-white'
                  : 'border-gray-300 text-gray-700 hover:border-green-400 dark:border-gray-600 dark:text-gray-300'
              }`}
            >
              {s.name}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <CatalogueFilters options={options} selection={selection} onChange={update} onClear={clear} />
      </div>

      {error && (
        <p data-testid="browse-error" className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          {error} The designs below are the ones built into the app.
        </p>
      )}

      {/* Said once per change, short: the count, not the cards. */}
      <p data-testid="browse-count" aria-live="polite" className="sr-only">
        {changed ? `${results.length} ${results.length === 1 ? 'design' : 'designs'}` : ''}
      </p>

      <div data-testid="browse-results" aria-busy={loading && results.length === 0} className="mt-4">
        {results.length === 0 ? (
          loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => <TemplateCardSkeleton key={i} />)}
            </div>
          ) : (
            <div data-testid="browse-empty" className="rounded-2xl border border-dashed border-gray-300 p-6 text-center dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400">No designs match these filters.</p>
              <button
                type="button"
                onClick={clearAll}
                className="mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-800 hover:border-green-400 dark:border-gray-600 dark:text-gray-200"
              >
                Clear filters
              </button>
            </div>
          )
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {visible.map((t) => <TemplateCard key={t.key} template={t} onEdit={onEdit} />)}
            </div>
            {visible.length < results.length && (
              <button
                type="button"
                onClick={() => setPages((n) => n + 1)}
                className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-800 hover:border-green-400 dark:border-gray-600 dark:text-gray-200"
              >
                <Shuffle size={15} aria-hidden="true" /> Show {Math.min(PAGE, results.length - visible.length)} more
                <span className="text-gray-400">({results.length - visible.length} left)</span>
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
