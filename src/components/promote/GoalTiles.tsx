import {
  BadgePercent, Briefcase, CalendarHeart, MapPin, Megaphone, Rocket, type LucideIcon,
} from 'lucide-react';

import type { Goal, GoalSlug } from '../../lib/promote/goals';

/** One quiet mark per goal, so a row of six reads at a glance. */
const ICON: Record<GoalSlug, LucideIcon> = {
  nearby: MapPin,
  launch: Rocket,
  sale: BadgePercent,
  event: CalendarHeart,
  awareness: Megaphone,
  hiring: Briefcase,
};

/**
 * The six goal tiles, under the Promote request bar.
 *
 * Built exactly like Create's NeedTiles — same card, same radius — so the two
 * pages read as one product. The accent is Promote's own orange, not Create's
 * green: the two hubs share a shape but not a colour, so a glance at the page
 * says which half of the business you are in. Two across on a phone and
 * three from `sm`, so six goals sit as a clean 3 × 2. The one-line `line`
 * is hidden on a phone, where the label alone has to carry the tile.
 */
export default function GoalTiles({
  goals, active, onPick,
}: { goals: Goal[]; active: GoalSlug | ''; onPick: (goal: GoalSlug) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3" aria-label="What do you want to achieve?">
      {goals.map((g) => {
        const Icon = ICON[g.slug];
        const on = active === g.slug;
        return (
          <li key={g.slug} className="min-w-0">
            <button
              type="button"
              data-testid="goal-tile"
              data-goal={g.slug}
              aria-pressed={on}
              onClick={() => onPick(g.slug)}
              className={`group flex h-full w-full min-h-[72px] items-start gap-3 rounded-2xl border p-3.5 text-left transition sm:p-4 ${
                on
                  ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500 dark:bg-orange-900/20'
                  : 'border-gray-200 bg-white hover:border-orange-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-orange-700'
              }`}
            >
              <span
                aria-hidden
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                  on ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300'
                }`}
              >
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold leading-snug text-gray-900 dark:text-white">{g.label}</span>
                <span className="mt-0.5 hidden text-xs leading-snug text-gray-500 dark:text-gray-400 sm:block">{g.line}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
