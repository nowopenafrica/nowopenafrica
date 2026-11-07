import { useState } from 'react';
import { Sparkles, Rocket } from 'lucide-react';
import { QUICK_CREATE_ITEMS, QUICK_CREATE_GROUPS, QuickCreateItem, QuickCreateGroup } from '../../data/quickCreate';

type Filter = QuickCreateGroup | 'All';

const FILTER_HINT: Record<Filter, string> = {
  All: 'Every goal we can design for',
  Trading: 'Sales, offers and stock — the everyday money-makers',
  Seasonal: 'Calendar moments, from Ramadan to Black Friday',
  Business: 'Milestones, hiring and events',
  Proof: 'Reviews, results and loyalty — trust that converts',
};

// A "Quick Create" entry point above the editor that turns a business goal into
// a finished design in one tap. Each card selects the right occasion template +
// default format inside DesignStudio.
//
// There are ~29 goals, which is too many to dump in one grid without burying the
// editor below it — so they're filtered by group and only one group shows at a
// time. "Trading" leads because it's what a business reaches for most days.
//
// ── ONE ROW, NOT A WALL ───────────────────────────────────────────────────
//
// MEASURED: as three-line tiles in a five-column grid this band ran ~280px
// across the top of the editor, so the live preview — the thing the whole
// screen is for — started below the fold on a laptop. Each goal is now a
// single chip in a row that scrolls, which is the same 29 goals in a third
// of the height. The description moved to the tooltip: it was never read
// while scanning, only while hesitating.
export default function QuickCreatePanel({
  onPick,
  disabled,
}: {
  onPick: (item: QuickCreateItem) => void;
  disabled?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>('Trading');
  const shown = filter === 'All'
    ? QUICK_CREATE_ITEMS
    : QUICK_CREATE_ITEMS.filter((i) => i.group === filter);

  const tabs: Filter[] = [...QUICK_CREATE_GROUPS, 'All'];

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-4">
        <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-purple-700 dark:text-purple-300">
          <Sparkles size={15} /> Quick Create
        </span>
        <span className="text-[11px] text-gray-400">{FILTER_HINT[filter]}</span>
      </div>

      {/* Group filter — keeps the grid short so the editor stays reachable. */}
      <div
        role="group"
        aria-label="Filter Quick Create goals"
        className="flex gap-1.5 overflow-x-auto px-5 pt-3 pb-1"
      >
        {tabs.map((t) => {
          const active = filter === t;
          const count = t === 'All'
            ? QUICK_CREATE_ITEMS.length
            : QUICK_CREATE_ITEMS.filter((i) => i.group === t).length;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              aria-pressed={active}
              // px min-height, not rem: index.css scales the root font to 14px
              // on phones, so a rem minimum lands ~12% under the 44px target.
              className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg text-xs font-bold whitespace-nowrap border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                active
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {t}
              <span className={active ? 'text-white/70' : 'text-gray-400'}>{count}</span>
            </button>
          );
        })}
      </div>

      <div
        className="flex gap-2 overflow-x-auto px-5 pb-4 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {shown.map((item) => (
          <button
            key={item.key}
            onClick={() => onPick(item)}
            disabled={disabled}
            /* The description lives here now: it was never read while
               scanning the row, only while hesitating over one chip. */
            title={item.desc}
            className="shrink-0 inline-flex items-center gap-2 min-h-[44px] px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-bold text-gray-800 dark:text-gray-100 whitespace-nowrap hover:border-purple-400 dark:hover:border-purple-500 hover:shadow transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <span className="text-base leading-none">{item.emoji}</span>
            {item.label}
            {item.fullCampaign && (
              <span
                title="Produces every size at once"
                className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/50 px-1.5 py-0.5 rounded"
              >
                <Rocket size={10} /> All sizes
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
