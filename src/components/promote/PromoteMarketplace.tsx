import { Link } from 'react-router-dom';
import { BadgeInfo, Heart, LineChart, Megaphone, Tag, UserRound } from 'lucide-react';

/**
 * NowOpen Promote — the parts of /adverts that are not the placement grid.
 *
 * Built on the same principle as the Create page: say what a thing is, say
 * honestly where its price came from, and connect it to the step that follows.
 * The grid, the filters and "Browse by medium" already existed and are left
 * alone — adding a second set of division tabs beside them would be the
 * duplication this codebase has had to undo repeatedly.
 *
 * THREE THINGS WERE MISSING, and each is here:
 *
 *   1. Where the prices come from. Every rate on this page is derived from
 *      published Nigerian OOH rate cards, not from a quote the board's owner
 *      has given NowOpen for your dates. Saying so is the difference between a
 *      marketplace and a price list somebody made up.
 *
 *   2. Advertising ON NowOpen. An OOH broker can sell you a billboard. The
 *      thing NowOpen has that a broker does not is the surface where people are
 *      already searching for what you sell. Everything in that block is free
 *      and already built — there is deliberately no "sponsored listing" product
 *      here, because no such product exists and offering one would be selling
 *      air.
 *
 *   3. What happens after. A campaign nobody measures is an expense. NowOpen
 *      counts calls, WhatsApps, directions and enquiries against the business,
 *      so the money spent has something to be judged by.
 */

/** Free, already built, and the reason to be on NowOpen at all. */
const ON_NOWOPEN = [
  {
    icon: Tag,
    label: 'Publish an offer',
    to: '/offers',
    blurb: 'A reason to buy this week, shown to people already looking in your category.',
    cost: 'Free',
  },
  {
    icon: Heart,
    label: 'Update the people who kept you',
    to: '/keeps',
    blurb: 'Customers who chose to hear from you. The cheapest audience you will ever reach.',
    cost: 'Free',
  },
  {
    icon: UserRound,
    label: 'A profile that answers the question',
    to: '/waitlist',
    blurb: 'Hours, prices, photos and a way to call — the advert that runs every day.',
    cost: 'Free',
  },
];

export default function PromoteMarketplace() {
  return (
    <div className="space-y-10">
      {/* 1. Where the numbers come from. */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4 flex gap-3">
        <BadgeInfo size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-900 dark:text-blue-200">
          <strong>Rates are derived from published Nigerian OOH rate cards.</strong>{' '}
          Where a card price is struck through, the figure beside it is the discounted rate.
          Availability and the final price for your dates are confirmed when you enquire —
          outdoor is booked by the month and priced by site, season and duration.
        </p>
      </div>

      {/* 2. The thing a billboard broker cannot sell you. */}
      <section>
        <div className="flex items-center gap-2">
          <Megaphone size={18} className="text-blue-600 dark:text-blue-400" />
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
            Advertise on NowOpen itself
          </h2>
        </div>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
          A billboard reaches people passing a road. These reach people already searching for
          what you sell. All three are free and already part of your listing.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {ON_NOWOPEN.map(({ icon: Icon, label, to, blurb, cost }) => (
            <Link
              key={label}
              to={to}
              className="group rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:-translate-y-0.5 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-2">
                <Icon size={18} className="text-blue-600 dark:text-blue-400" />
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">
                  {cost}
                </span>
              </div>
              <h3 className="mt-2 font-bold text-sm text-gray-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300">
                {label}
              </h3>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 3. The step that makes any of it worth doing. */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-6">
        <div className="flex items-center gap-2">
          <LineChart size={18} className="text-blue-600 dark:text-blue-400" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Then see who came</h2>
        </div>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
          A campaign nobody measures is an expense. NowOpen counts the calls, WhatsApp taps,
          directions and enquiries your listing earns, so what you spend has something to be
          judged against — not impressions, but people who tried to reach you.
        </p>
      </section>
    </div>
  );
}
