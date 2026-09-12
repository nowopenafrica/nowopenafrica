import { BusinessStatus, getStatusMeta } from '../lib/businessStatus';

interface BusinessStatusBadgeProps {
  /** null = the stored hours couldn't be parsed — render "Hours not confirmed" rather than guess. */
  status: BusinessStatus | null;
  category?: string;
  compact?: boolean;
  showSub?: boolean;
  className?: string;
  /** Renders the safe 24/7 default explicitly as an unconfirmed assumption. */
  availabilityDefault?: boolean;
}

export default function BusinessStatusBadge({ status, category, compact, showSub, className = '', availabilityDefault = false }: BusinessStatusBadgeProps) {
  if (status === null) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'} rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 ${className}`}>
        <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
        <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold text-gray-500 dark:text-gray-400`}>
          {availabilityDefault ? '24/7 default · Hours unconfirmed' : 'Hours not confirmed'}
        </span>
      </div>
    );
  }
  const meta = getStatusMeta(status, category);
  return (
    <div className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'} rounded-full border ${meta.chip} ${className}`}>
      <span className={`w-2 h-2 rounded-full ${meta.dot} ${meta.animate ? 'animate-pulse' : ''}`} />
      <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold ${meta.text}`}>
        {meta.emoji} {meta.label}
      </span>
      {showSub && !compact && (
        <span className="text-[11px] text-gray-500 dark:text-gray-400 hidden sm:inline">— {meta.sub}</span>
      )}
    </div>
  );
}
