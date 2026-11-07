/**
 * A strip pinned to the bottom of the Promote pages showing what is in the plan.
 *
 * It is a region, not a dialog: no focus trap, and an in-flow spacer of the
 * same height keeps the page's last content reachable. Amounts are shown one
 * per price basis and never added together. It stays hidden while loading, on a
 * failed read and at 0 lines, so a read error never reads as an empty plan.
 *
 * Stacking (measured from the sources): Universal Create FAB z-40, bottom-left
 * (left 16px, bottom 16px, 56px tall); voice button z-40, bottom 96px,
 * right 20px; cookie banner z-60; modals z-50 and above. The tray is z-30, so
 * the cookie banner covers it until answered. On phones the content is right
 * aligned with 96px clear on the left for the FAB.
 *
 * From sm (640px) the "New" pill is `fixed left-6 bottom-6`, rem-sized: at the
 * 15px root that is left 22.5px + about 93px wide = right edge near 116px
 * (near 110px at the 14px root from 768px). It overlaps the 56px tray
 * vertically, so the row's left padding is an explicit 136px, not a rem
 * class (the root font is under 16px): 20px or more of clearance, and more
 * still once max-w-6xl centres the row.
 */

import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { BASIS_LABEL, BASIS_ORDER, type PriceBasis } from '../../lib/promote/campaignPlan';
import { usePlanSnapshot } from '../../lib/promote/usePlanSnapshot';

const CHIP_LABEL: Record<PriceBasis, string> = {
  fixed: BASIS_LABEL.fixed,
  indicative: 'indicative',
  quoted: 'quoted',
  unpriced: 'to be quoted',
};

/*
 * What a group with no total says. NowOpen's own products are not quoted by a
 * media owner, so a fixed-price group without a total is a price NowOpen has
 * to confirm; every other basis is quoted by the media owner.
 */
const noTotalLabel = (basis: PriceBasis) => (basis === 'fixed' ? 'price to confirm' : CHIP_LABEL.unpriced);

export default function PlanTray() {
  const { user } = useAuth();
  const { format } = useCurrency();
  const { summary, planId, loading, failed } = usePlanSnapshot();

  if (loading || failed || !summary || summary.lines === 0) return null;

  const href = user && planId ? `/advertise/plan/${planId}` : '/advertise/plan';
  const groups = BASIS_ORDER
    .map((b) => summary.totals.find((t) => t.basis === b))
    .filter((t): t is NonNullable<typeof t> => !!t);

  return (
    <>
      <div aria-hidden data-testid="plan-tray-spacer" className="h-[calc(48px+env(safe-area-inset-bottom))] sm:h-[calc(56px+env(safe-area-inset-bottom))]" />
      <div
        role="region"
        aria-label="Your plan"
        className="fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)] border-t border-gray-200 bg-white/95 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur dark:border-gray-700 dark:bg-gray-900/95"
      >
        <div className="mx-auto flex h-[48px] max-w-6xl items-center justify-end gap-3 pl-24 pr-4 sm:h-[56px] sm:justify-between sm:pl-[136px] sm:pr-6">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {summary.lines} in your plan
          </p>
          <ul className="hidden min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex">
            {groups.map((g) => (
              <li
                key={g.basis}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                {g.total == null || g.basis === 'unpriced'
                  ? noTotalLabel(g.basis)
                  : `${format(g.total)} ${CHIP_LABEL[g.basis]}`}
              </li>
            ))}
          </ul>
          <Link
            to={href}
            className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1 whitespace-nowrap px-2 text-sm font-semibold text-orange-700 hover:text-orange-800 dark:text-orange-300"
          >
            Open plan <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </div>
    </>
  );
}
