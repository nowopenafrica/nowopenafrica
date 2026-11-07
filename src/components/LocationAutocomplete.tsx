import { useEffect, useMemo, useRef, useState, KeyboardEvent } from 'react';
import { MapPin, Navigation, LocateFixed, Loader2 } from 'lucide-react';
import { AFRICAN_PLACES, placeLabel } from '../data/locations';
import { normalize, rankMatches, splitMatch } from '../lib/search';
import { detectLocation } from '../lib/geolocation';
import { suggestPlaces, MIN_QUERY_LENGTH, type PlaceHit } from '../lib/universalSearch';

interface Suggestion {
  label: string;
  sub?: string;
  /**
   * This place has no listings.
   *
   * Only ever true for the curated city list. It is carried so the row can SAY
   * so: a suggestion that silently filters the directory to nothing reads as a
   * broken directory rather than as an honest gap in coverage.
   */
  empty?: boolean;
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  /** Locations found in live data, merged above the curated city list */
  extraOptions?: string[];
  /**
   * Ask the database for places instead of relying on `extraOptions`.
   *
   * /businesses can pass `extraOptions` because it has already fetched every
   * listing. The home page has not, and must not fetch 3,141 rows to populate a
   * dropdown — so it sets this, and place_suggest() answers in about 8ms with
   * the place names AND how many businesses are in each.
   */
  remote?: boolean;
  placeholder?: string;
  /*
   * The accessible name.
   *
   * This input declares `role="combobox"` with `aria-expanded` and
   * `aria-autocomplete`, and had NO name at all — which is worse than a plain
   * input would be, because the role promises one. A screen reader announced
   * "combobox" and nothing about what it filters.
   *
   * A placeholder is not a substitute: it is not reliably exposed as a name,
   * and it disappears the moment anyone types.
   */
  ariaLabel?: string;
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
  remote = false,
  placeholder = 'e.g., Lagos, Ikeja...',
  ariaLabel = 'Filter by location',
  className = '',
  accent = 'blue',
}: LocationAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [detecting, setDetecting] = useState(false);
  const blurTimer = useRef<number>();

  /* ── Remote places ──────────────────────────────────────────────── */
  const [live, setLive] = useState<PlaceHit[]>([]);
  const [degraded, setDegraded] = useState(false);
  /*
   * An answer has come back for what is currently typed.
   *
   * "No listings yet" is a claim about the database, so it may not be made
   * before the database has been asked. Without this the label appeared on the
   * first render — while the request was still in flight — and then vanished
   * when the answer arrived, which is both a flicker and, for that moment, a
   * statement made on no evidence at all.
   */
  const [settled, setSettled] = useState(false);
  /*
   * The newest request wins. Type "lag" then "lagos": if the first answer lands
   * last it paints results for a query nobody is looking at any more, and
   * nothing on screen says so. Compared on the way out rather than cancelled on
   * the way in, because the extra request is not the bug — the ordering is.
   */
  const seq = useRef(0);
  const debounceTimer = useRef<number>();

  useEffect(() => {
    if (!remote) return;
    const term = value.trim();
    window.clearTimeout(debounceTimer.current);

    setSettled(false);
    if (term.length < MIN_QUERY_LENGTH) {
      // Discard anything in flight too, or it lands afterwards and repopulates
      // a list the visitor has just emptied.
      seq.current += 1;
      setLive([]);
      setDegraded(false);
      return;
    }

    debounceTimer.current = window.setTimeout(() => {
      const mine = ++seq.current;
      suggestPlaces(term, 6).then(({ places, degraded: failed }) => {
        if (mine !== seq.current) return;
        setLive(places);
        setDegraded(failed);
        setSettled(true);
      });
    }, 160);
  }, [value, remote]);

  /*
   * Both timers cancelled on unmount.
   *
   * The close-on-blur delay exists so a click on a suggestion lands before the
   * list closes. Nothing cancelled it, so it could fire into a component that
   * had already gone — and this box is on pages people navigate away from
   * mid-typing, which is exactly when it is pending.
   */
  useEffect(() => () => {
    window.clearTimeout(blurTimer.current);
    window.clearTimeout(debounceTimer.current);
  }, []);

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

    /*
     * Places that HAVE listings, first, each saying how many.
     *
     * The count is the point. 278 places hold 3,141 listings and the
     * distribution is steep — Lagos 325, Lekki 5, most of them one. "Lekki · 5
     * businesses" tells somebody what they are about to get before they commit
     * to it.
     *
     * In `remote` mode these come from place_suggest(); otherwise from the
     * caller's already-fetched listings, which is what /businesses has.
     */
    const fromData: Suggestion[] = remote
      ? live.map((p) => ({
        label: p.label,
        sub: `${p.hits} ${p.hits === 1 ? 'business' : 'businesses'}`,
      }))
      : rankMatches(
        [...new Set(extraOptions.filter(Boolean))],
        value,
        (loc) => [loc],
        3,
      ).map((label) => ({ label, sub: 'On NowOpen' }));

    /*
     * Then the 87 curated African cities, for places the directory does not
     * cover yet.
     *
     * ── WHEN "NO LISTINGS YET" IS ACTUALLY TRUE ──────────────────────────
     *
     * Only when the CITY NAME ITSELF matched what was typed — and the first
     * version of this got it wrong in a way worth recording.
     *
     * OBSERVED IN THE BROWSER, 2026-09-17. Typing "lag" listed
     * "Ikeja, Lagos, Nigeria — No listings yet". Ikeja has TEN listings. It
     * appeared because "lag" matches *Lagos* further along the label, and
     * place_suggest was never asked about Ikeja: it matches on the stored
     * location string, and "Ikeja" does not contain "lag".
     *
     * So the absence of a place from place_suggest only means "no listings"
     * when the query would have FOUND it. place_suggest matches
     * `location ilike '%term%'`, so if the head of the curated label contains
     * the term, any business stored under that head would have come back. When
     * it does not, we know nothing — and the row says nothing.
     */
    const q = normalize(value);
    const known = (label: string) => normalize(label.split(',')[0]).includes(q);

    const fromPlaces = rankMatches(
      AFRICAN_PLACES,
      value,
      (p) => [p.name, placeLabel(p)],
      8,
    )
      .map((p): Suggestion => {
        const label = placeLabel(p);
        const provablyEmpty = remote && settled && !degraded && known(label);
        return {
          label,
          sub: provablyEmpty ? 'No listings yet' : undefined,
          empty: provablyEmpty,
        };
      })
      .filter((s) => !fromData.some((d) => d.label.toLowerCase().includes(s.label.split(',')[0].toLowerCase())));

    return [...fromData, ...fromPlaces].slice(0, 7);
  }, [value, extraOptions, remote, live, degraded, settled]);

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
        aria-label={ariaLabel}
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

      {open && (suggestions.length > 0 || degraded) && (
        <div
          className="absolute z-30 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden"
          // Keep focus on the input so onBlur doesn't fire before the click lands
          onMouseDown={(e) => e.preventDefault()}
        >
        {degraded && (
          /*
           * Said out loud. A failed read and an empty directory are the same
           * shape coming back from supabase-js, so without this the box tells
           * somebody NowOpen covers nowhere near them when their connection
           * dropped — a confident wrong answer, worse than a visible error.
           */
          <p className="px-3 py-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-900">
            Places could not be loaded just now. You can still type a place and search.
          </p>
        )}
        <ul role="listbox" aria-label="Place suggestions">
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
                <span className={`truncate ${s.empty ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  <Highlight label={s.label} query={value} />
                </span>
                {s.sub && (
                  /* Grey, not green, when there is nothing there. The badge is
                     read as a count of what you will get, so a place with none
                     must not wear the same colour as a place with 325. */
                  <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    s.empty
                      ? 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700'
                      : 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30'
                  }`}>
                    {s.sub}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        </div>
      )}
    </div>
  );
}
