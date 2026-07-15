import { BadgeCheck } from 'lucide-react';

interface VerifiedBadgeProps {
  /** Compact icon-only badge (for cards); otherwise shows the "Verified" label */
  compact?: boolean;
  size?: number;
  className?: string;
}

/**
 * Blue verified checkmark shown on premium businesses.
 * Render only when the business's `verified` flag is true.
 */
export default function VerifiedBadge({ compact = false, size = 16, className = '' }: VerifiedBadgeProps) {
  if (compact) {
    return (
      <BadgeCheck
        size={size}
        className={`text-blue-500 fill-blue-100 flex-shrink-0 ${className}`}
        aria-label="Verified business"
      />
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 text-xs font-semibold rounded-full ${className}`}
      title="This business is verified by NowOpen Africa"
    >
      <BadgeCheck size={size} className="text-blue-500" />
      Verified
    </span>
  );
}
