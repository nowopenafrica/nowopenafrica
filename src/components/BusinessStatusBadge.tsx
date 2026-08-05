import { BusinessStatus, getStatusMeta } from '../lib/businessStatus';

interface BusinessStatusBadgeProps {
  status: BusinessStatus;
  category?: string;
  compact?: boolean;
  showSub?: boolean;
  className?: string;
}

export default function BusinessStatusBadge({ status, category, compact, showSub, className = '' }: BusinessStatusBadgeProps) {
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
