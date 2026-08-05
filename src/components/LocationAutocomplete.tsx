import { useMemo, useRef, useState, KeyboardEvent } from 'react';
import { MapPin, Navigation, LocateFixed, Loader2 } from 'lucide-react';
import { AFRICAN_PLACES, placeLabel } from '../data/locations';
import { rankMatches, splitMatch } from '../lib/search';
import { detectLocation } from '../lib/geolocation';

interface Suggestion {
  label: string;
  sub?: string;
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  /** Locations found in live data, merged above the curated city list */
  extraOptions?: string[];
  placeholder?: string;
  className?: string;
  /** Ring/focus accent, defaults to blue */
  accent?: 'blue' | 'pink';
}

/** Bold the part of the label that matches the query */
function Highlight({ label, query }: { label: string; query: string }) {
  const parts = splitMatch(label, query);
  if (!parts) return <>{label}</>;
  return (
    <>
      {parts[0]}
      <span className="font-semibold text-gray-900 dark:text-white">{parts[1]}</span>
      {parts[2]}
    </>
  );
}

export default function LocationAutocomplete({
  value,
  onChange,
  extraOptions = [],
  placeholder = 'e.g., Lagos, Ikeja...',
  className = '',
  accent = 'blue',
}: LocationAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [detecting, setDetecting] = useState(false);
  const blurTimer = useRef<number>();

  const useMyLocation = async () => {
    setDetecting(true);
    try {
      const loc = await detectLocation();
      onChange(loc.label);
      setOpen(false);
    } catch (err) {
      // Surface the reason inline via the native alert fallback — this
      // component has no toast context of its own.
      alert(err instanceof Error ? err.message : 'Could not detect your location.');
    } finally {
      setDetecting(false);
    }
  };

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!value.trim()) return [];

    // Live listing locations first (they're bookable right now)…
    const fromData = rankMatches(
      [...new Set(extraOptions.filter(Boolean))],
      value,
      (loc) => [loc],
      3
    ).map((label) => ({ label, sub: 'On NowOpen' }));

    // …then the curated place list, skipping near-duplicates
    const fromPlaces = rankMatches(
      AFRICAN_PLACES,
      value,
      (p) => [p.name, placeLabel(p)],
      8
    )
      .map((p) => ({ label: placeLabel(p), sub: undefined as string | undefined }))
      .filter((s) => !fromData.some((d) => d.label.toLowerCase().includes(s.label.split(',')[0].toLowerCase())));

    return [...fromData, ...fromPlaces].slice(0, 7);
  }, [value, extraOptions]);

  const pick = (s: Suggestion) => {
    onChange(s.label);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  const ring = accent === 'pink' ? 'focus:ring-pink-500' : 'focus:ring-blue-500';

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
      <input
        type="text"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-autocomplete="list"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 120); }}
        onKeyDown={onKeyDown}
        className={`w-full pl-10 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 ${ring} focus:border-transparent text-sm ${className}`}
      />
      <button
        type="button"
        onClick={useMyLocation}
        disabled={detecting}
        title="Use my current location"
        aria-label="Use my current location"
        onMouseDown={(e) => e.preventDefault()}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
      >
        {detecting ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
      </button>

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden"
          // Keep focus on the input so onBlur doesn't fire before the click lands
          onMouseDown={(e) => e.preventDefault()}
        >
          {suggestions.map((s, i) => (
            <li key={s.label}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onClick={() => pick(s)}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition ${
                  i === active ? 'bg-gray-100 dark:bg-gray-700' : ''
                }`}
              >
                <Navigation size={14} className="text-gray-400 flex-shrink-0" />
                <span className="text-gray-700 dark:text-gray-300 truncate">
                  <Highlight label={s.label} query={value} />
                </span>
                {s.sub && (
                  <span className="ml-auto text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    {s.sub}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
