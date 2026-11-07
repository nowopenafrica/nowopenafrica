import { POPULAR, type NeedSlug } from '../../lib/create/needs';

type Popular = (typeof POPULAR)[number];

/**
 * Popular now — the six things most people come for, one tap each.
 *
 * The caller passes only the entries whose deliverable has at least one
 * finished design: a chip that opens an empty grid is worse than no chip.
 * The order is the spec's and is never re-sorted.
 */
export default function PopularNow({
  items, active, onPick,
}: {
  items: Popular[];
  active: { need: NeedSlug | ''; deliverable: string };
  onPick: (item: Popular) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Popular now</h2>
      {/* One scrolling row on a phone, wrapped from sm: six chips never
          spend three rows of the fold. */}
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {items.map((p) => {
          const on = active.need === p.need && active.deliverable === p.deliverable;
          return (
            <button
              key={p.deliverable}
              type="button"
              data-testid="popular-chip"
              aria-pressed={on}
              onClick={() => onPick(p)}
              className={`inline-flex shrink-0 items-center min-h-[44px] rounded-full border px-4 text-sm font-semibold transition ${
                on
                  ? 'border-transparent bg-green-700 text-white'
                  : 'border-gray-300 bg-white text-gray-800 hover:border-green-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
