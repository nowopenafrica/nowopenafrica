import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

import { FREE_TOOLS } from '../../lib/promote/freeTools';

/**
 * "Start free" on the Promote hub: the four free tools, and nothing else.
 *
 * This used to carry the rate-card note and the "Advertise on NowOpen
 * itself" framing as well. The rate note belongs to the placements it
 * describes, so it moved to "Out in the world" (MediumBrowser); paid
 * NowOpen placements have their own section now ("On NowOpen").
 *
 * The cards come from FREE_TOOLS, the same list the budget mix labels its
 * free items from, so a tool is called the same thing everywhere on the page.
 *
 * ── WHY FOUR, NOT THREE ──────────────────────────────────────────────────
 *
 * "Then see who came" used to be a separate full-width panel below these
 * cards, which made the measurement step read as an afterthought rather than
 * the last move in the same sequence. It is the same kind of thing as the
 * other three — something a business does on NowOpen, at no cost — so it
 * belongs in the same row.
 *
 * There is no orange "Free" pill on each card: the heading already says it,
 * and a badge repeated across every card distinguishes nothing.
 */
export default function PromoteMarketplace() {
  return (
    <section aria-labelledby="start-free" data-promote-section="free">
      <h2 id="start-free" className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white sm:text-xl">
        <Sparkles size={18} className="text-orange-600 dark:text-orange-400" aria-hidden />
        Start free
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        A billboard is seen by people passing a road. These are seen by people already searching
        for what you sell, and count who arrived. All four are free and already part of your listing.
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {FREE_TOOLS.map(({ icon: Icon, label, to, blurb }) => (
          <li key={label} className="min-w-0">
            <Link
              to={to}
              className="group flex h-full min-h-[72px] flex-col rounded-2xl border border-gray-200 bg-white p-3.5 transition hover:border-orange-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-orange-700 sm:p-4"
            >
              <span className="flex items-start gap-2 text-sm font-bold leading-snug text-gray-900 dark:text-white">
                <Icon size={16} className="mt-0.5 shrink-0 text-orange-600 dark:text-orange-300" aria-hidden />
                {label}
              </span>
              <span className="mt-1.5 text-xs leading-snug text-gray-600 dark:text-gray-400">{blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
