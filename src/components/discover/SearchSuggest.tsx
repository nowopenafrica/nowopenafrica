import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Store, Tag } from 'lucide-react';

import { AFRICAN_PLACES } from '../../data/locations';
import { searchSuggestions, type Suggestion, type DiscoverBusiness } from '../../lib/discover';
import { splitMatch } from '../../lib/search';

/**
 * The search box, with suggestions.
 *
 * Businesses, places and categories in one list rather than separate tabs:
 * somebody typing "la" has not yet decided whether they want Lagos, a laundry,
 * or a shop called Lagoon, and asking them to pick a tab first is asking them
 * to answer the question they came here to ask.
 *
 * Choosing a suggestion does the obvious thing for its kind — a business opens,
 * a place fills the place filter, a category selects the category — because a
 * suggestion that merely pastes text back into the box makes the reader do the
 * work twice.
 */
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

const ICON: Record<Suggestion['kind'], typeof Search> = {
  business: Store,
  place: MapPin,
  category: Tag,
};

export default function SearchSuggest({
  value,
  onChange,
  onPickPlace,
  onPickCategory,
  businesses,
  placeholder = 'Search businesses, services or products',
}: {
  value: string;
  onChange: (v: string) => void;
  onPickPlace: (place: string) => void;
  onPickCategory: (category: string) => void;
  businesses: DiscoverBusiness[];
  placeholder?: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>();

  const suggestions = useMemo(
    () => searchSuggestions(businesses, AFRICAN_PLACES, value),
    [businesses, value],
  );

  // A stale highlight on a list that has changed underneath would apply the
  // keyboard selection to the wrong row.
  useEffect(() => { setActive(-1); }, [value]);
  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);

  const choose = (s: Suggestion) => {
    setOpen(false);
    setActive(-1);
    if (s.kind === 'business' && s.href) { navigate(s.href); return; }
    // The parent clears the box as part of the same URL update — doing it here
    // as well would be a second write racing the first.
    if (s.kind === 'place') { onPickPlace(s.value); return; }
    onPickCategory(s.value);
  };

  const visible = open && suggestions.length > 0;

  return (
    <div className="relative flex-1">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        // Blur fires before a click on the list registers, so the close is
        // deferred; otherwise picking a suggestion closes the list first and
        // the click lands on nothing.
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
        onKeyDown={(e) => {
          if (!visible) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => (i + 1) % suggestions.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            choose(suggestions[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        aria-label="Search businesses"
        role="combobox"
        aria-expanded={visible}
        aria-controls="discover-suggestions"
        aria-autocomplete="list"
        autoComplete="off"
        className="w-full pl-9 pr-3 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
      />

      {visible && (
        <ul
          id="discover-suggestions"
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-80 overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl py-1"
        >
          {suggestions.map((s, i) => {
            const Icon = ICON[s.kind];
            return (
              <li key={`${s.kind}-${s.label}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  // mousedown, not click: the input's blur would otherwise win.
                  onMouseDown={(e) => { e.preventDefault(); choose(s); }}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full text-left flex items-center gap-2.5 px-3 py-2 ${
                    i === active ? 'bg-gray-100 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700/60'
                  }`}
                >
                  <Icon size={15} className="shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-gray-700 dark:text-gray-200 truncate">
                      <Highlight label={s.label} query={value} />
                    </span>
                    {s.detail && (
                      <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate">{s.detail}</span>
                    )}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-gray-400 shrink-0">
                    {s.kind === 'business' ? 'Business' : s.kind === 'place' ? 'Place' : 'Category'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
