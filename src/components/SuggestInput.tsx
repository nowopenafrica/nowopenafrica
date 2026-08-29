import { useEffect, useRef, useState } from 'react';
import { Search, MapPin, Store, Tag } from 'lucide-react';

import { splitMatch } from '../lib/search';
import type { Suggestion } from '../lib/suggest';

/**
 * A search box that suggests as you type.
 *
 * Shared by Discover, Promote and Create so all three behave identically —
 * same keyboard handling, same ranking, same blur timing. Duplicating this
 * would mean three boxes that drift apart, and the differences would only show
 * up on whichever page nobody tested.
 *
 * Items, places and categories go in one list rather than tabs: somebody two
 * letters in has not decided which of the three they want, and a tab strip asks
 * them to answer the question they came to ask.
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

export default function SuggestInput({
  value,
  onChange,
  suggestions,
  onPick,
  placeholder,
  ariaLabel = 'Search',
  itemNoun = 'Result',
  listId = 'suggestions',
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: Suggestion[];
  /** Called with the chosen suggestion; the caller decides what it means. */
  onPick: (s: Suggestion) => void;
  placeholder: string;
  ariaLabel?: string;
  /** What the item kind is called on this page — Business, Placement, Service. */
  itemNoun?: string;
  /** Unique per page, so two boxes never share an id. */
  listId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>();

  // A stale highlight on a list that changed underneath would apply the
  // keyboard selection to the wrong row.
  useEffect(() => { setActive(-1); }, [value]);
  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);

  const choose = (s: Suggestion) => {
    setOpen(false);
    setActive(-1);
    onPick(s);
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
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className="w-full pl-9 pr-3 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
      />

      {visible && (
        <ul
          id={listId}
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
                    {s.kind === 'business' ? itemNoun : s.kind === 'place' ? 'Place' : 'Category'}
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
