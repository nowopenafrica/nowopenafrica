import { publicOpenState, type OpenStateInput, type OpenState } from '../lib/openingHours';

/**
 * The live open/closed state, in the business's own timezone.
 *
 * This is the badge the product is named after, so it says the thing a customer
 * actually needs rather than a bare word:
 *
 *   🟢 Open now · Open until 8:00 PM
 *   🟡 Closing soon · Closes in 25 minutes
 *   🔴 Closed · Opens tomorrow at 9:00 AM
 *
 * CLOSING SOON IS A SEPARATE STATE, not a shade of open, because it is the one
 * that changes what someone does — the difference between setting off now and
 * going tomorrow. A shop shown as plainly "Open" at 7:55 sends a customer on a
 * wasted journey, and that is the kind of thing a directory gets blamed for.
 *
 * "Hours not confirmed" is a real state too. Guessing open would be worse than
 * saying nothing: it is the same wasted journey, with our name on it.
 *
 * The same publicOpenState powers the server-rendered profile, so the badge a
 * customer sees and the line Google indexes cannot drift apart.
 */
interface OpenStateBadgeProps {
  business: OpenStateInput;
  /** Injected in tests; live callers let it default to now. */
  now?: Date;
  compact?: boolean;
  /** Hide the second line where space is tight, e.g. a dense card. */
  hideDetail?: boolean;
  className?: string;
}

const STYLES: Record<OpenState['kind'], { dot: string; text: string; chip: string; emoji: string; pulse: boolean }> = {
  open: {
    dot: 'bg-green-500', text: 'text-green-700 dark:text-green-400',
    chip: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800',
    emoji: '🟢', pulse: false,
  },
  // Amber and pulsing: it is the one state meant to create a little urgency.
  'closing-soon': {
    dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400',
    chip: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800',
    emoji: '🟡', pulse: true,
  },
  closed: {
    dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400',
    chip: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800',
    emoji: '🔴', pulse: false,
  },
  unknown: {
    dot: 'bg-gray-300 dark:bg-gray-600', text: 'text-gray-500 dark:text-gray-400',
    chip: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
    emoji: '', pulse: false,
  },
};

export default function OpenStateBadge({
  business, now, compact, hideDetail, className = '',
}: OpenStateBadgeProps) {
  const state = publicOpenState(business, now ?? new Date());
  const s = STYLES[state.kind];

  return (
    <span className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'} rounded-full border ${s.chip} ${className}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot} ${s.pulse ? 'animate-pulse' : ''}`} />
      <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold ${s.text}`}>
        {state.label}
      </span>
      {!hideDetail && state.detail && (
        <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-gray-500 dark:text-gray-400 truncate`}>
          · {state.detail}
        </span>
      )}
    </span>
  );
}
