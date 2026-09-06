import { Link } from 'react-router-dom';
import { ArrowRight, Store } from 'lucide-react';

import { INDUSTRIES } from '../../data/industrySystems';

/**
 * What the directory shows when the directory is empty.
 *
 * The alternative was thirty invented businesses, and those have been deleted:
 * a visitor who calls a phone number that was never real learns something about
 * NowOpen that no amount of design recovers from.
 *
 * So this shows what is actually true — the industries the platform is built
 * for — instead of pretending there is inventory. It is the /platform page's
 * own taxonomy (data/industrySystems.ts), which means it cannot drift from what
 * the product ships, and the cards go to /platform, the same destination the
 * homepage's industry row already uses.
 *
 * Two occasions, one component:
 *
 *   'empty'  nothing is listed at all — this replaces the grid.
 *   'thin'   a handful of real businesses are listed — this sits UNDER the
 *            grid, because two lonely cards read as a broken page rather than
 *            an early one. The real listings still come first.
 *
 * IMPORTANT: neither variant appears when a FILTER emptied the results. That
 * keeps its own "nothing here, reset" message — telling somebody who typed
 * "barber" about 31 industries would be answering a question they did not ask.
 */

/**
 * Below this many listings, a grid looks broken rather than new.
 *
 * A judgement, not a measurement: one row of cards on a wide screen is roughly
 * six, and a partial row is what reads as "something failed to load".
 */
export const THIN_DIRECTORY = 6;

interface Props {
  /** What the visitor was looking for, e.g. "businesses". */
  label?: string;
  /** How many industries to show. The rest are on /platform. */
  limit?: number;
  /** 'empty' replaces the grid; 'thin' sits beneath it. */
  variant?: 'empty' | 'thin';
}

export default function IndustryDirectory({ label = 'businesses', limit = 12, variant = 'empty' }: Props) {
  const thin = variant === 'thin';
  return (
    <div className="py-8">
      <div className="text-center max-w-2xl mx-auto">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold">
          <Store size={14} /> The directory is being built
        </span>
        <h3 className="mt-3 text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
          {thin
            ? 'More on the way — here is what NowOpen is built for'
            : `No ${label} listed yet — here is what NowOpen is built for`}
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Every industry gets a purpose-built profile rather than one generic template.
          Real businesses are being added one at a time, and each one is claimed by its owner.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {INDUSTRIES.slice(0, limit).map((ind) => {
          const Icon = ind.icon;
          return (
            <Link
              key={ind.slug}
              to="/platform"
              className="group rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:-translate-y-0.5 hover:shadow-md transition"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${ind.accent} flex items-center justify-center`}>
                <Icon size={19} className="text-white" />
              </div>
              <h4 className="mt-3 font-bold text-sm text-gray-900 dark:text-white">{ind.name}</h4>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{ind.tagline}</p>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-6 text-center">
        <h4 className="font-bold text-gray-900 dark:text-white">Is this your industry?</h4>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Be one of the first businesses people find on NowOpen.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link
            to="/waitlist"
            className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition"
          >
            List your business <ArrowRight size={16} />
          </Link>
          <Link
            to="/platform"
            className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-white dark:hover:bg-gray-700 transition"
          >
            See all {INDUSTRIES.length} industries
          </Link>
        </div>
      </div>
    </div>
  );
}
