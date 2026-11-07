import {
  BadgePercent, CalendarHeart, CreditCard, FileImage, Package, Presentation,
  Share2, Signpost, UtensilsCrossed, type LucideIcon,
} from 'lucide-react';

import type { Need, NeedSlug } from '../../lib/create/needs';

/** One quiet mark per need, so a row of nine reads at a glance. */
const ICON: Record<NeedSlug, LucideIcon> = {
  stationery: CreditCard,
  brand: Package,
  social: Share2,
  promotions: BadgePercent,
  flyers: FileImage,
  events: CalendarHeart,
  menus: UtensilsCrossed,
  outdoor: Signpost,
  documents: Presentation,
};

/**
 * The need tiles, under the request box.
 *
 * ── ONLY THE NEEDS THAT CAN ANSWER ───────────────────────────────────────
 *
 * The caller passes `shownNeeds` — needs holding at least six finished
 * designs. A tile that opens onto two layouts is a promise the shelf cannot
 * keep, so a thin need is not offered here at all; it is still reached by
 * typing, by an old link or by a popular chip, where the visitor asked for
 * that exact thing.
 *
 * The grid is two across on a phone and three from `sm`, so nine needs sit
 * as a clean 3 × 3 and a shorter list still reads as a deliberate row rather
 * than a broken one.
 */
export default function NeedTiles({
  needs, active, onPick,
}: { needs: Need[]; active: NeedSlug | ''; onPick: (need: NeedSlug) => void }) {
  if (needs.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3" aria-label="What do you need?">
      {needs.map((n) => {
        const Icon = ICON[n.slug];
        const on = active === n.slug;
        return (
          <li key={n.slug} className="min-w-0">
            <button
              type="button"
              data-testid="need-tile"
              data-need={n.slug}
              aria-pressed={on}
              onClick={() => onPick(n.slug)}
              className={`group flex h-full w-full min-h-[72px] items-start gap-3 rounded-2xl border p-3.5 text-left transition sm:p-4 ${
                on
                  ? 'border-green-500 bg-green-50 ring-1 ring-green-500 dark:bg-green-900/20'
                  : 'border-gray-200 bg-white hover:border-green-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-green-700'
              }`}
            >
              <span
                aria-hidden
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                  on ? 'bg-green-600 text-white' : 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300'
                }`}
              >
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold leading-snug text-gray-900 dark:text-white">{n.title}</span>
                <span className="mt-0.5 hidden text-xs leading-snug text-gray-500 dark:text-gray-400 sm:block">{n.blurb}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
