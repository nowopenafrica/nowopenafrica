import { BadgeCheck, CircleUser, Clock, HelpCircle, XCircle } from 'lucide-react';

import { listingBadge, type ListingRecord, type ListingBadge } from '../../lib/listingStatus';

/**
 * Unclaimed, claimed, verified — shown as three visibly different things.
 *
 * The incumbent directory's failure is instructive here: 131,149 listings under
 * a "verified directory" masthead, where the ones I read had no hours, no
 * photos and no reviews. Once every listing looks endorsed, the endorsement
 * stops carrying information. So an unclaimed page says so, in a muted tone
 * that does not pretend to be an achievement, and only a completed check earns
 * the blue.
 */
const ICONS: Record<ListingBadge, typeof BadgeCheck> = {
  verified: BadgeCheck,
  claimed: CircleUser,
  pending: Clock,
  unclaimed: HelpCircle,
  'temporarily-closed': Clock,
  closed: XCircle,
};

const TONE = {
  good: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  neutral: 'bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600',
  warn: 'bg-amber-50 dark:bg-amber-900/25 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800',
} as const;

export default function ListingStatusBadge({
  business,
  size = 'md',
}: {
  business: ListingRecord | null | undefined;
  size?: 'sm' | 'md';
}) {
  const spec = listingBadge(business);
  const Icon = ICONS[spec.kind];
  return (
    <span
      title={spec.detail}
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold shrink-0 ${TONE[spec.tone]} ${
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
      }`}
    >
      <Icon size={size === 'sm' ? 10 : 12} /> {spec.label}
    </span>
  );
}
