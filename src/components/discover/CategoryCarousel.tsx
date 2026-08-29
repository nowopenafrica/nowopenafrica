import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { iconFor, shortLabel } from '../../lib/categoryIcons';

/**
 * Browse by category, simplified.
 *
 * Twelve tiles, not a hundred. The full category list has over a hundred
 * entries — right for the add-business form, useless as a browse surface,
 * because scanning it is harder than typing what you wanted. These are the
 * top-level groups the categories are already organised into, so nothing new
 * had to be invented and every tile maps to real categories.
 *
 * Groups with nothing in them are not rendered by the caller: a tile that
 * leads to an empty page is worse than one fewer tile.
 */
export default function CategoryCarousel({
  groups,
  active,
  onPick,
}: {
  groups: { group: string; n: number }[];
  active: string;
  onPick: (group: string) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);

  const nudge = (dir: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: dir * Math.max(200, rail.clientWidth * 0.8), behavior: 'smooth' });
  };

  if (groups.length === 0) return null;

  return (
    <div className="relative">
      {/* Arrows on pointer devices only. On a phone the rail is swiped, and
          buttons there would sit on top of the tiles they scroll. */}
      <button
        type="button"
        onClick={() => nudge(-1)}
        aria-label="Scroll categories left"
        className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        <ChevronLeft size={16} />
      </button>

      <div
        ref={railRef}
        // The rail scrolls; the page must not. Scrollbar hidden because the
        // arrows and the obvious overflow already say it moves.
        className="flex gap-2 overflow-x-auto md:px-10 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x"
        role="group"
        aria-label="Browse by category"
      >
        {groups.map(({ group, n }) => {
          const Icon = iconFor(group);
          const on = active === group;
          return (
            <button
              key={group}
              type="button"
              onClick={() => onPick(on ? '' : group)}
              aria-pressed={on}
              title={`${group} — ${n} ${n === 1 ? 'business' : 'businesses'}`}
              className={`snap-start shrink-0 w-[86px] flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl border transition ${
                on
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <span className={`flex items-center justify-center w-9 h-9 rounded-full ${
                on
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}>
                <Icon size={17} />
              </span>
              <span className={`text-[11px] font-medium leading-tight text-center ${
                on ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
              }`}>
                {shortLabel(group)}
              </span>
              {/* The count is what stops a tile being a guess. */}
              <span className="text-[10px] text-gray-400">{n}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => nudge(1)}
        aria-label="Scroll categories right"
        className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
