import { useId } from 'react';
import { X } from 'lucide-react';

import type {
  FilterGroupKey, FilterGroupOptions, FilterSelection,
} from '../../lib/create/catalogueFilters';

/**
 * The catalogue filters (spec §10, Filters).
 *
 * Native, labelled selects: each one is reachable with Tab and changed with
 * the arrow keys, on every platform, with no custom key handling to get
 * wrong. Only groups and values that match something are passed in
 * (`filterOptions`), so nothing offered here leads to an empty grid.
 *
 * 44px in explicit px: the app's root font is under 16px, so a rem-based
 * minimum would undersize the touch target.
 */
export default function CatalogueFilters({
  options, selection, onChange, onClear,
}: {
  options: FilterGroupOptions[];
  selection: FilterSelection;
  onChange: (next: FilterSelection) => void;
  onClear: () => void;
}) {
  const id = useId();
  /*
   * Category is excluded: CategoryBrowse writes it as browse navigation and
   * its Clear keeps it, so counting it showed a Clear that did nothing.
   */
  const active = Object.entries(selection).some(([k, v]) => k !== 'category' && Boolean(v));

  const set = (key: FilterGroupKey, value: string) => {
    const next: FilterSelection = { ...selection };
    if (value) next[key] = value; else delete next[key];
    onChange(next);
  };

  if (options.length === 0 && !active) return null;

  return (
    <div role="group" aria-label="Filters" className="flex flex-wrap items-end gap-2">
      {options.map((g) => {
        const control = `${id}-${g.key}`;
        return (
          <div key={g.key} className="flex min-w-[9.5rem] flex-1 flex-col gap-1 sm:flex-none">
            <label htmlFor={control} className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {g.label}
            </label>
            <select
              id={control}
              value={selection[g.key] ?? ''}
              onChange={(e) => set(g.key, e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">Any</option>
              {g.values.map((v) => (
                <option key={v.value} value={v.value}>{`${v.label} (${v.count})`}</option>
              ))}
            </select>
          </div>
        );
      })}
      {active && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-800 hover:border-green-400 dark:border-gray-600 dark:text-gray-200"
        >
          <X size={14} aria-hidden="true" /> Clear filters
        </button>
      )}
    </div>
  );
}
