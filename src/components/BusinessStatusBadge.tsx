import { BusinessStatus, getStatusMeta } from '../lib/businessStatus';

interface BusinessStatusBadgeProps {
  /** null = the stored hours couldn't be parsed — render "Hours not confirmed" rather than guess. */
  status: BusinessStatus | null;
  category?: string;
  compact?: boolean;
  showSub?: boolean;
  className?: string;
}

export default function BusinessStatusBadge({ status, category, compact, showSub, className = '' }: BusinessStatusBadgeProps) {
  if (status === null) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'} rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 ${className}`}>
        <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
        <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold text-gray-500 dark:text-gray-400`}>
          {/*
            * One sentence, whatever the row says.
            *
            * There used to be a second spelling here, "24/7 default · Hours
            * unconfirmed", for rows carrying availability_mode = 'default_24_7'.
            * That mode stopped meaning anything to a reader when
            * publicOpenState stopped answering "open" for it, and repeating it
            * only invited the question of why this business is different. It is
            * not: nobody has confirmed its hours, same as the rest.
            */}
          Hours not confirmed
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
