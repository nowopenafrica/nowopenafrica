import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal, ChevronRight, ChevronLeft, MapPin, X } from 'lucide-react';
import { InfiniteSlider } from '../InfiniteSlider';
import type { Advertisement, Business, MediaService } from '../../types';
import { track } from '../../lib/telemetry';

// The homepage browse section, laid out the way a creative marketplace does it:
//
//   row 1   filter · search · type toggle · sort
//   row 2   category chips, scrolling sideways
//   row 3+  a dense card grid
//
// The card design is deliberately untouched — this renders through
// InfiniteSlider's existing renderer in grid mode, so cards here are the same
// cards as everywhere else. Only the chrome around them is new.
//
// WHY THE SEARCH FILTERS IN PLACE. The three datasets are already loaded for the
// grid, so filtering them client-side is instant and costs no request. Typing
// that navigates away to a results page would throw away work already done and
// make browsing feel heavier than it is. Enter still goes to the full search,
// for anyone who wants the whole index rather than what is on screen.

type ListingType = 'businesses' | 'adverts' | 'media';
type SortKey = 'recommended' | 'newest' | 'rating';

const TYPES: { key: ListingType; label: string; viewAll: string }[] = [
  { key: 'businesses', label: 'Businesses', viewAll: '/businesses' },
  { key: 'adverts', label: 'Ad Placements', viewAll: '/adverts' },
  { key: 'media', label: 'Creative Services', viewAll: '/media' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'newest', label: 'Newest' },
  { key: 'rating', label: 'Top rated' },
];

/** A row shaped for the card renderer, whatever it started as. */
interface Row {
  id: string;
  href?: string;
  title: string;
  /** Required by the card renderer, so it is defaulted rather than optional. */
  description: string;
  image_url: string;
  category?: string;
  rating?: number;
  price?: number;
  location?: string;
  status?: 'open' | 'closed' | 'active';
  verified?: boolean;
  reach?: number;
  created_at?: string;
  type: 'business' | 'advert' | 'media';
}

const FALLBACK_IMG = {
  business: 'https://images.pexels.com/photos/196644/pexels-photo-196644.jpeg?auto=compress&cs=tinysrgb&w=400',
  advert: 'https://images.pexels.com/photos/257904/pexels-photo-257904.jpeg?auto=compress&cs=tinysrgb&w=400',
  media: 'https://images.pexels.com/photos/3182765/pexels-photo-3182765.jpeg?auto=compress&cs=tinysrgb&w=400',
};

export default function ListingExplorer({
  businesses,
  adverts,
  mediaServices,
}: {
  businesses: Business[];
  adverts: Advertisement[];
  mediaServices: MediaService[];
}) {
  const navigate = useNavigate();
  const [type, setType] = useState<ListingType>('businesses');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<SortKey>('recommended');
  const [showFilters, setShowFilters] = useState(false);
  const [location, setLocation] = useState('');
  const chipRail = useRef<HTMLDivElement>(null);

  const active = TYPES.find(t => t.key === type)!;

  // One shape for all three, so filtering and sorting are written once instead
  // of three times with three sets of field names.
  const rows: Row[] = useMemo(() => {
    if (type === 'adverts') {
      return adverts.map(a => ({
        id: a.id,
        title: a.title,
        description: a.description ?? '',
        image_url: a.image_url || FALLBACK_IMG.advert,
        category: a.type || a.category,
        status: a.status as Row['status'],
        price: a.pricing ?? a.price_per_day,
        location: a.location,
        created_at: (a as { created_at?: string }).created_at,
        type: 'advert' as const,
      }));
    }
    if (type === 'media') {
      return mediaServices.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description ?? '',
        image_url: m.image_url || FALLBACK_IMG.media,
        category: m.service_type,
        rating: m.rating,
        price: m.pricing,
        reach: m.reach,
        created_at: (m as { created_at?: string }).created_at,
        type: 'media' as const,
      }));
    }
    return businesses.map(b => ({
      id: b.id,
      href: b.username ? `/${b.username}` : `/businesses/${b.id}`,
      verified: b.verified,
      title: b.name,
      description: b.description ?? '',
      image_url: b.image_url || FALLBACK_IMG.business,
      category: b.category,
      rating: b.rating,
      status: b.status as Row['status'],
      location: b.location,
      created_at: (b as { created_at?: string }).created_at,
      type: 'business' as const,
    }));
  }, [type, businesses, adverts, mediaServices]);

  /**
   * Chips come from the data, not a fixed list.
   *
   * A hardcoded category list would show chips that match nothing — the worst
   * kind of dead end, because the visitor blames themselves for the empty
   * result. These are the categories actually present, commonest first.
   */
  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const c = (r.category || '').trim();
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, n]) => ({ label, n }));
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const loc = location.trim().toLowerCase();
    let out = rows;

    if (category !== 'all') out = out.filter(r => (r.category || '') === category);
    if (loc) out = out.filter(r => (r.location || '').toLowerCase().includes(loc));
    if (q) {
      out = out.filter(r =>
        r.title.toLowerCase().includes(q)
        || (r.description || '').toLowerCase().includes(q)
        || (r.category || '').toLowerCase().includes(q));
    }

    if (sort === 'rating') {
      out = [...out].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (sort === 'newest') {
      out = [...out].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
    }
    return out;
  }, [rows, query, category, location, sort]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    // Enter means "search everything", not just what is loaded here.
    track('search_performed', { type, term: q, hasLocation: Boolean(location.trim()), from: 'home-explorer' });
    navigate(`/search?q=${encodeURIComponent(q)}&type=${type}${location.trim() ? `&location=${encodeURIComponent(location.trim())}` : ''}`);
  };

  const scrollChips = (dir: 1 | -1) => {
    chipRail.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  const filtersOn = Boolean(location.trim()) || category !== 'all';

  return (
    <section aria-labelledby="explorer-heading" className="py-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <h2 id="explorer-heading" className="sr-only">Browse businesses, ad placements and creative services</h2>

        {/* Row 1 — filter, search, type, sort */}
        <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters(v => !v)}
            aria-expanded={showFilters}
            className={`inline-flex items-center gap-2 px-3 min-h-[44px] rounded-xl border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              filtersOn
                ? 'border-blue-500 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30'
                : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <SlidersHorizontal size={15} />
            Filter
            {filtersOn && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" aria-hidden="true" />}
          </button>

          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <label htmlFor="explorer-search" className="sr-only">Search {active.label.toLowerCase()}</label>
            <input
              id="explorer-search"
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${active.label.toLowerCase()}…`}
              className="w-full pl-9 pr-9 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Type toggle. Real tabs: the grid below is its panel. */}
          <div role="tablist" aria-label="Listing type" className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            {TYPES.map((t, i) => {
              const on = type === t.key;
              return (
                <button
                  key={t.key}
                  id={`explorer-tab-${t.key}`}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  aria-controls="explorer-grid"
                  tabIndex={on ? 0 : -1}
                  onClick={() => { setType(t.key); setCategory('all'); }}
                  onKeyDown={e => {
                    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                    e.preventDefault();
                    const next = TYPES[(i + (e.key === 'ArrowRight' ? 1 : TYPES.length - 1)) % TYPES.length];
                    setType(next.key);
                    setCategory('all');
                    document.getElementById(`explorer-tab-${next.key}`)?.focus();
                  }}
                  className={`px-3 min-h-[44px] rounded-[10px] text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    on
                      ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <label htmlFor="explorer-sort" className="sr-only">Sort</label>
          <select
            id="explorer-sort"
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="min-h-[44px] px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </form>

        {showFilters && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <label htmlFor="explorer-location" className="sr-only">Location</label>
              <input
                id="explorer-location"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Filter by city or country…"
                className="w-full pl-9 pr-3 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {filtersOn && (
              <button
                type="button"
                onClick={() => { setLocation(''); setCategory('all'); }}
                className="inline-flex items-center min-h-[44px] px-3 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Row 2 — category chips */}
        {chips.length > 0 && (
          <div className="relative mt-3">
            <button
              type="button"
              onClick={() => scrollChips(-1)}
              aria-label="Scroll categories left"
              className="hidden sm:inline-flex absolute left-0 top-1/2 -translate-y-1/2 z-10 items-center justify-center w-[44px] h-[44px] rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-gray-500 hover:text-gray-900 dark:hover:text-white"
            >
              <ChevronLeft size={16} />
            </button>

            {/* overflow-x-auto with no scrollbar: the arrows and swipe are the
                affordance, and a visible bar under a chip row reads as clutter. */}
            <div
              ref={chipRail}
              className="flex gap-2 overflow-x-auto sm:px-10 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              <Chip label="All" count={rows.length} on={category === 'all'} onClick={() => setCategory('all')} />
              {chips.map(c => (
                <Chip key={c.label} label={c.label} count={c.n} on={category === c.label} onClick={() => setCategory(c.label)} />
              ))}
            </div>

            <button
              type="button"
              onClick={() => scrollChips(1)}
              aria-label="Scroll categories right"
              className="hidden sm:inline-flex absolute right-0 top-1/2 -translate-y-1/2 z-10 items-center justify-center w-[44px] h-[44px] rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-gray-500 hover:text-gray-900 dark:hover:text-white"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Row 3 — the grid. Same cards as everywhere else. */}
        <div id="explorer-grid" role="tabpanel" aria-labelledby={`explorer-tab-${type}`} className="mt-5">
          {visible.length > 0 ? (
            <InfiniteSlider cards={visible} linkBase={type === 'businesses' ? 'businesses' : type} layout="grid" />
          ) : (
            // Say which filter emptied it, and offer the way back. A bare "no
            // results" leaves the visitor guessing which of four controls to undo.
            <div className="py-12 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Nothing here{query.trim() && <> for “{query.trim()}”</>}
                {category !== 'all' && <> in {category}</>}
                {location.trim() && <> near {location.trim()}</>}.
              </p>
              <button
                type="button"
                onClick={() => { setQuery(''); setCategory('all'); setLocation(''); }}
                className="mt-2 inline-flex items-center min-h-[44px] px-4 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold"
              >
                Reset
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
            Showing {visible.length} of {rows.length}
          </p>
          <a
            href={active.viewAll}
            className="inline-flex items-center min-h-[44px] gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700"
          >
            View all {active.label.toLowerCase()} <ChevronRight size={16} />
          </a>
        </div>
      </div>
    </section>
  );
}

function Chip({ label, count, on, onClick }: { label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-full border text-xs font-semibold whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        on
          ? 'border-transparent bg-gray-900 dark:bg-white text-white dark:text-gray-900'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      {label}
      <span className={`tabular-nums ${on ? 'opacity-70' : 'text-gray-400'}`}>{count}</span>
    </button>
  );
}
