import { Clock, Copy } from 'lucide-react';
import {
  formatOpeningHours, parseOpeningHours, minutesToTimeInput, timeInputToMinutes,
  emptyWeek, type DayHours,
} from '../../lib/openingHours';

// Owner-facing opening-hours editor.
//
// Hours are stored as free text (businesses.opening_hours) because that is what
// every reader already expects — the public profile, the "Open now" badge and
// the directory's open-now filter all run the text through parseOpeningHours.
// A plain text box let owners type things the parser can't read ("By
// appointment", "Services: Sun 8AM & 10AM"), and those businesses silently lost
// their badge and their filter placement.
//
// So this edits a structured week and serialises it with formatOpeningHours,
// the parser's inverse. Whatever an owner builds here is guaranteed to read
// back. Text typed before this existed is parsed on load when possible; when it
// isn't, the original is preserved and shown rather than being thrown away.

interface Props {
  /** The stored text. */
  value: string;
  onChange: (next: string) => void;
  /**
   * False when the loaded business row had no `opening_hours` column at all,
   * i.e. the migration hasn't been applied to this database. Hours then cannot
   * be saved, and saying so here beats letting someone set them repeatedly and
   * watch the profile keep reporting "hours not confirmed".
   */
  storageReady?: boolean;
}

/** Display order (Monday first) paired with the Date#getDay index it edits. */
const DAYS: readonly { index: number; label: string }[] = [
  { index: 1, label: 'Monday' }, { index: 2, label: 'Tuesday' }, { index: 3, label: 'Wednesday' },
  { index: 4, label: 'Thursday' }, { index: 5, label: 'Friday' }, { index: 6, label: 'Saturday' },
  { index: 0, label: 'Sunday' },
];

const DEFAULT_OPEN = 9 * 60;
const DEFAULT_CLOSE = 17 * 60;

export default function OpeningHoursEditor({ value, onChange, storageReady = true }: Props) {
  const parsed = parseOpeningHours(value);
  const alwaysOpen = parsed?.alwaysOpen ?? false;
  const days: DayHours[] = parsed && !parsed.alwaysOpen ? parsed.days : emptyWeek();

  // Text that predates this editor and can't be parsed. Keep showing it so the
  // owner can see what will be replaced instead of it vanishing silently.
  const unparsed = value.trim() && !parsed ? value.trim() : '';

  const commit = (next: DayHours[], always = false) => onChange(formatOpeningHours(next, always));

  const setDay = (index: number, patch: Partial<DayHours>) => {
    const next = days.map((d, i) => (i === index ? { ...d, ...patch } : d));
    commit(next);
  };

  const toggleDay = (index: number, open: boolean) => {
    setDay(index, open
      ? { open: DEFAULT_OPEN, close: DEFAULT_CLOSE }
      : { open: null, close: null });
  };

  const copyFirstOpenDayToAll = () => {
    const source = DAYS.map((d) => days[d.index]).find((d) => d.open !== null && d.close !== null);
    if (!source) return;
    commit(days.map(() => ({ ...source })));
  };

  const hasAnyDay = days.some((d) => d.open !== null);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
          <Clock size={16} className="text-gray-400" aria-hidden="true" />
          Opening hours
        </label>
        <div className="flex items-center gap-3">
          {!alwaysOpen && hasAnyDay && (
            <button
              type="button"
              onClick={copyFirstOpenDayToAll}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Copy size={13} aria-hidden="true" /> Apply to every day
            </button>
          )}
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={alwaysOpen}
              onChange={(e) => (e.target.checked ? onChange(formatOpeningHours([], true)) : commit(emptyWeek()))}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Open 24/7
          </label>
        </div>
      </div>

      {!storageReady && (
        <div className="mb-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 p-3">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
            Hours can&apos;t be saved on this database yet.
          </p>
          <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">
            The <code>businesses.opening_hours</code> column is missing, so anything set here is
            discarded on save and profiles keep showing “hours not confirmed”. Run{' '}
            <code>scripts/sql/apply_all_migrations.sql</code> in the Supabase SQL editor once, then
            set your hours again.
          </p>
        </div>
      )}

      {alwaysOpen ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          This business shows as open at all times.
        </p>
      ) : (
        <div className="space-y-1.5">
          {DAYS.map(({ index, label }) => {
            const day = days[index];
            const isOpen = day.open !== null && day.close !== null;
            const openId = `hours-${index}-open`;
            const closeId = `hours-${index}-close`;
            return (
              <div key={index} className="flex flex-wrap items-center gap-2 sm:gap-3">
                <label className="flex items-center gap-2 w-32 shrink-0 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={isOpen}
                    onChange={(e) => toggleDay(index, e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {label}
                </label>
                {isOpen ? (
                  <div className="flex items-center gap-2">
                    <label htmlFor={openId} className="sr-only">{label} opening time</label>
                    <input
                      id={openId}
                      type="time"
                      value={minutesToTimeInput(day.open as number)}
                      onChange={(e) => {
                        const mins = timeInputToMinutes(e.target.value);
                        if (mins !== null) setDay(index, { open: mins });
                      }}
                      className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-gray-400 text-sm" aria-hidden="true">–</span>
                    <label htmlFor={closeId} className="sr-only">{label} closing time</label>
                    <input
                      id={closeId}
                      type="time"
                      value={minutesToTimeInput(day.close as number)}
                      onChange={(e) => {
                        const mins = timeInputToMinutes(e.target.value);
                        if (mins !== null) setDay(index, { close: mins });
                      }}
                      className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {(day.close as number) <= (day.open as number) && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">closes next day</span>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-gray-400 dark:text-gray-500">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {unparsed && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
          Your saved hours read “{unparsed}”, which we can&apos;t show as an automatic
          open/closed badge. Setting the days above will replace it.
        </p>
      )}

      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        {value.trim()
          ? <>Customers will see: <span className="font-medium text-gray-700 dark:text-gray-300">{value}</span></>
          : 'Set your hours so customers see an accurate “Open now” badge on your profile.'}
      </p>
    </div>
  );
}
