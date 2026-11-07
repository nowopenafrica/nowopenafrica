import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, Clapperboard, Compass, Loader2, MapPin, Megaphone, Package,
  Search, Store, Tag, Wrench,
} from 'lucide-react';

import { suggest, MIN_QUERY_LENGTH, type Suggestion, type SuggestionKind } from '../lib/universalSearch';
import { splitMatch } from '../lib/search';
import { track } from '../lib/telemetry';

/**
 * One search box for the whole platform.
 *
 * It answers with businesses, the services and products they offer, places,
 * categories, advertising space, media services and the app's own pages — in
 * one list, ordered by how well each answers what was typed.
 *
 * ── THE THREE WAYS A TYPEAHEAD LIES ──────────────────────────────────────
 *
 * Each of these is guarded below, because each one produces a search box that
 * looks like it is working:
 *
 *  1. OUT-OF-ORDER RESULTS. Type "lag", then "lagos". If "lag" resolves last,
 *     the list shows results for a query nobody is looking at any more. Guarded
 *     with a request sequence: an answer that is not the newest is discarded.
 *
 *  2. A FAILED READ SHOWN AS "NOTHING FOUND". supabase-js resolves with
 *     `{ data: null, error }`, so a failure looks exactly like an empty result
 *     unless somebody checks. `degraded` carries that distinction to the UI.
 *
 *  3. A STALE LIST UNDER A NEW QUERY. Clearing the box, or dropping under the
 *     two-character floor, clears the results too — otherwise the previous
 *     answer sits there looking like the answer to the new one.
 */

const KIND_META: Record<SuggestionKind, { icon: typeof Store; tint: string; note: string }> = {
  business: { icon: Store, tint: 'text-blue-600 dark:text-blue-400', note: '' },
  service: { icon: Wrench, tint: 'text-teal-600 dark:text-teal-400', note: 'Service' },
  product: { icon: Package, tint: 'text-amber-600 dark:text-amber-400', note: 'Product' },
  place: { icon: MapPin, tint: 'text-green-600 dark:text-green-400', note: 'Place' },
  category: { icon: Tag, tint: 'text-purple-600 dark:text-purple-400', note: 'Category' },
  advert: { icon: Megaphone, tint: 'text-rose-600 dark:text-rose-400', note: 'Advertising' },
  media: { icon: Clapperboard, tint: 'text-fuchsia-600 dark:text-fuchsia-400', note: 'Media' },
  page: { icon: Compass, tint: 'text-gray-500 dark:text-gray-400', note: 'On NowOpen' },
};

/**
 * How long to wait after the last keystroke.
 *
 * MEASURED: search_suggest runs in about 70ms on the live data. 160ms is
 * shorter than the gap between keystrokes for most typists, so the list keeps
 * up, while a fast typist still sends one request instead of eleven.
 */
const DEBOUNCE_MS = 160;

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

interface UniversalSearchProps {
  /** Where an unmatched free-text search goes. */
  onSubmitTerm?: (term: string) => void;
  /**
   * Every keystroke, for a page that filters something below the box.
   *
   * Separate from onSubmitTerm on purpose: submitting is "take me somewhere",
   * typing is "narrow what I am already looking at". A page that treated them
   * alike would navigate away mid-word.
   */
  onTermChange?: (term: string) => void;
  placeholder?: string;
  /** Telemetry label, so the funnel can tell the hero box from the header one. */
  source?: string;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
}

export default function UniversalSearch({
  onSubmitTerm,
  onTermChange,
  placeholder = 'Search businesses, services, places…',
  source = 'universal',
  autoFocus = false,
  className = '',
  inputClassName = '',
}: UniversalSearchProps) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [degraded, setDegraded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  /*
   * A search has come back for what is currently typed.
   *
   * Without this the panel's open condition was "there is something to show",
   * so zero results closed it — and the "Nothing matched" message inside it
   * could never appear. It read as correct and rendered as nothing: the box
   * simply went quiet, which is indistinguishable from it being broken.
   */
  const [settled, setSettled] = useState(false);

  /*
   * The newest request wins. Compared on the way out rather than cancelled on
   * the way in, because the bug is not the extra request — it is an older
   * answer arriving last and painting over a newer one.
   */
  const seq = useRef(0);
  const debounceTimer = useRef<number | undefined>(undefined);
  const blurTimer = useRef<number | undefined>(undefined);
  const boxRef = useRef<HTMLDivElement>(null);

  /*
   * Both timers cancelled on unmount. The close-on-blur delay exists so a click
   * on a suggestion lands before the list closes; uncancelled, it fires into a
   * component that has gone. This box is mounted on pages people navigate away
   * from mid-search, so it is not a rare path.
   */
  useEffect(() => () => {
    window.clearTimeout(debounceTimer.current);
    window.clearTimeout(blurTimer.current);
  }, []);

  const run = useCallback((value: string) => {
    const mine = ++seq.current;
    setLoading(true);
    suggest(value, { limit: 12 })
      .then(({ suggestions, degraded: failed }) => {
        if (mine !== seq.current) return;   // superseded
        setRows(suggestions);
        setDegraded(failed);
        setLoading(false);
        setSettled(true);
        setActive(-1);
      })
      .catch(() => {
        if (mine !== seq.current) return;
        setRows([]);
        setDegraded(true);
        setLoading(false);
        setSettled(true);
      });
  }, []);

  const onType = (value: string) => {
    setTerm(value);
    // Let the page narrow what it is showing, while the suggestions load.
    onTermChange?.(value);
    setOpen(true);
    setSettled(false);
    window.clearTimeout(debounceTimer.current);

    if (value.trim().length < MIN_QUERY_LENGTH) {
      // Discard in-flight answers too, or one lands after this and repopulates
      // a list the visitor has just emptied.
      seq.current += 1;
      setRows([]);
      setDegraded(false);
      setLoading(false);
      return;
    }
    debounceTimer.current = window.setTimeout(() => run(value), DEBOUNCE_MS);
  };

  const go = (row: Suggestion) => {
    setOpen(false);
    setActive(-1);
    track('search_performed', { term: row.label.slice(0, 80), hasLocation: row.kind === 'place', from: `${source}-suggestion-${row.kind}` });
    navigate(row.href);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // A highlighted row is what they chose; Enter takes it.
    if (active >= 0 && rows[active]) { go(rows[active]); return; }

    const q = term.trim();
    setOpen(false);
    track('search_performed', { term: q.slice(0, 80), hasLocation: false, from: `${source}-submit` });
    if (onSubmitTerm) { onSubmitTerm(q); return; }
    navigate(q ? `/businesses?search=${encodeURIComponent(q)}` : '/businesses');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); setActive(-1); return; }
    if (!open || rows.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % rows.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? rows.length - 1 : a - 1));
    }
  };

  const showList = open
    && term.trim().length >= MIN_QUERY_LENGTH
    && (rows.length > 0 || degraded || loading || settled);
  const listId = useMemo(() => `search-suggestions-${source}`, [source]);

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <form onSubmit={submit} role="search">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label="Search NowOpen"
            autoComplete="off"
            autoFocus={autoFocus}
            value={term}
            placeholder={placeholder}
            onChange={(e) => onType(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.clearTimeout(blurTimer.current);
              blurTimer.current = window.setTimeout(() => setOpen(false), 140);
            }}
            onKeyDown={onKeyDown}
            className={`w-full min-h-[48px] pl-10 pr-10 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputClassName}`}
          />
          {loading && (
            <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" aria-hidden />
          )}
        </div>
      </form>

      {showList && (
        <div
          className="absolute z-40 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden"
          onMouseDown={(e) => e.preventDefault()}
        >
          {degraded && (
            /*
             * Said out loud. Without this the visitor reads a connection
             * failure as "this business is not on NowOpen" — a confident wrong
             * answer, which is worse than an obvious error.
             */
            <p className="px-3 py-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-900">
              Search is not reachable right now, so this list is incomplete. Press Enter to browse instead.
            </p>
          )}

          <ul id={listId} role="listbox" aria-label="Search suggestions">
            {rows.map((row, i) => {
              const meta = KIND_META[row.kind] ?? KIND_META.page;
              const Icon = meta.icon;
              return (
                <li key={`${row.kind}-${row.href}-${row.label}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onClick={() => go(row)}
                    onMouseEnter={() => setActive(i)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition ${
                      i === active ? 'bg-gray-100 dark:bg-gray-700' : ''
                    }`}
                  >
                    <Icon size={16} className={`${meta.tint} flex-shrink-0`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-gray-800 dark:text-gray-200 truncate">
                        <Highlight label={row.label} query={term} />
                      </span>
                      {row.sublabel && (
                        <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{row.sublabel}</span>
                      )}
                    </span>
                    {meta.note && (
                      <span className="text-[10px] uppercase tracking-wide text-gray-400 flex-shrink-0">{meta.note}</span>
                    )}
                    <ArrowUpRight size={14} className="text-gray-400 flex-shrink-0" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>

          {!loading && !degraded && rows.length === 0 && term.trim().length >= MIN_QUERY_LENGTH && (
            <p className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
              Nothing matched “{term.trim()}”. Press Enter to search the directory anyway.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
