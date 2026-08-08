import { Clock, AlertCircle } from 'lucide-react';
import {
  parseOpeningHours, isOpenAt, nextChange, formatClock, WEEKDAY_FULL,
  isOpenAtInZone, nextChangeInZone, dayAndMinutesInZone,
} from '../lib/openingHours';

// The week's opening hours, with today highlighted and the next open/close time.
//
// Reads the business's OWN stored hours. When the text can't be parsed we say so
// rather than showing a guess — a confident "Open Now" that's wrong sends
// someone to a closed shop, which costs more trust than an honest blank.
//
// When `timeZone` (IANA, e.g. "Africa/Lagos") is supplied, "Open now", today
// and the next change are all evaluated against the business's local clock
// instead of the viewer's.

export default function OpeningHoursPanel({
  hours,
  timeZone,
  className = '',
}: {
  hours?: string | null;
  /** IANA timezone of the business — makes "Open now" mean their local clock. */
  timeZone?: string | null;
  className?: string;
}) {
  const parsed = parseOpeningHours(hours);
  const now = new Date();
  const today = timeZone ? dayAndMinutesInZone(now, timeZone).day : now.getDay();

  if (!parsed) {
    return (
      <div className={`rounded-xl border border-gray-200 dark:border-gray-700 p-3 ${className}`}>
        <p className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-200">
          <Clock size={13} className="text-gray-400" /> Opening hours
        </p>
        {hours?.trim() ? (
          <>
            <p className="mt-1.5 text-sm text-gray-800 dark:text-gray-100">{hours}</p>
            <p className="mt-1 inline-flex items-start gap-1 text-[10px] text-gray-400">
              <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
              As written by the business — we can’t confirm whether they’re open right now.
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-[11px] text-gray-400">
            This business hasn’t published its hours yet.
          </p>
        )}
      </div>
    );
  }

  const open = timeZone ? isOpenAtInZone(parsed, now, timeZone) : isOpenAt(parsed, now);
  const change = timeZone ? nextChangeInZone(parsed, now, timeZone) : nextChange(parsed, now);

  const changeLabel = (() => {
    if (parsed.alwaysOpen) return 'Open 24 hours';
    if (!change) return null;
    const when = formatClock(change.minutes);
    if (change.dayOffset === 0) return `${change.kind === 'closes' ? 'Closes' : 'Opens'} ${when}`;
    const dayName = WEEKDAY_FULL[(today + change.dayOffset) % 7];
    const prefix = change.dayOffset === 1 ? 'tomorrow' : dayName;
    return `${change.kind === 'closes' ? 'Closes' : 'Opens'} ${prefix} ${when}`;
  })();

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-700 p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-200">
          <Clock size={13} className="text-gray-400" /> Opening hours
        </p>
        <span className="inline-flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${open ? 'bg-green-500' : 'bg-gray-400'}`} aria-hidden="true" />
          <span className={`text-[11px] font-bold ${open ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {open ? 'Open now' : 'Closed'}
          </span>
          {changeLabel && <span className="text-[11px] text-gray-400">· {changeLabel}</span>}
        </span>
      </div>

      <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-700">
        {/* Monday-first, which is how most of Africa reads a week. */}
        {[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const day = parsed.days[d];
          const isToday = d === today;
          return (
            <li
              key={d}
              className={`flex items-center justify-between gap-3 py-1.5 text-[12px] ${
                isToday ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
              }`}
            >
              <span>
                {WEEKDAY_FULL[d]}
                {isToday && <span className="ml-1.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400">Today</span>}
              </span>
              <span className={day.open === null ? 'text-gray-400' : 'tabular-nums'}>
                {parsed.alwaysOpen
                  ? '24 hours'
                  : day.open === null || day.close === null
                    ? 'Closed'
                    : `${formatClock(day.open)} – ${formatClock(day.close)}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
