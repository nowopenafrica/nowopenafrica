import { Clock } from 'lucide-react';
import { Business } from '../types';
import {
  BusinessClockConfig, TimelineEvent,
  buildBusinessTimeline, defaultClockConfig, formatMinutes, parseMinutes,
} from '../lib/businessStatus';

interface BusinessTimelineProps {
  business: Business;
  config?: BusinessClockConfig;
  now?: Date;
  limit?: number;
}

export default function BusinessTimeline({ business, config, now = new Date(), limit = 8 }: BusinessTimelineProps) {
  const cfg = config ?? defaultClockConfig(business);
  const events: TimelineEvent[] = buildBusinessTimeline(business, cfg, now).slice(-limit);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Clock size={16} className="text-purple-600 dark:text-purple-400" />
        <h3 className="font-bold text-gray-900 dark:text-white text-sm">Today&apos;s Activity</h3>
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">No activity recorded yet today.</p>
      ) : (
        <ol className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-1.5 space-y-3">
          {events.map((e, i) => {
            const mins = parseMinutes(e.time);
            return (
              <li key={`${e.time}-${i}`} className="relative pl-5">
                <span className={`absolute -left-[7px] top-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 ${
                  e.kind === 'now' ? 'bg-blue-500 animate-pulse' : e.kind === 'opened' ? 'bg-green-500' : e.kind === 'closed' ? 'bg-gray-400' : 'bg-purple-500'
                }`} />
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-gray-900 dark:text-white tabular-nums">
                    {mins !== null ? formatMinutes(mins) : e.time}
                  </span>
                  {e.emoji && <span className="text-xs">{e.emoji}</span>}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">{e.label}</p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
