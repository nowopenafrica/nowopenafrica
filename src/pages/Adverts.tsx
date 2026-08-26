import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, MapPin, TrendingUp, DollarSign, Eye, X, Megaphone, Award, ArrowRight } from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';
import LocationAutocomplete from '../components/LocationAutocomplete';
import { normalize } from '../lib/search';
import { supabase } from '../lib/supabase';
import { generateAdverts } from '../data/populateData';
import { ADVERT_CATEGORY_GROUPS, groupForAdvertCategory } from '../data/advertCategories';
import { Advertisement } from '../types';
import { applySeo } from '../lib/seo';

// Static accent classes (Tailwind JIT can't see interpolated class names).
const ACCENT: Record<string, { grad: string; soft: string; text: string }> = {
  blue: { grad: 'from-blue-500 to-blue-600', soft: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' },
  amber: { grad: 'from-amber-500 to-amber-600', soft: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400' },
  violet: { grad: 'from-violet-500 to-violet-600', soft: 'bg-violet-50 dark:bg-violet-900/30', text: 'text-violet-600 dark:text-violet-400' },
  rose: { grad: 'from-rose-500 to-rose-600', soft: 'bg-rose-50 dark:bg-rose-900/30', text: 'text-rose-600 dark:text-rose-400' },
  emerald: { grad: 'from-emerald-500 to-emerald-600', soft: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400' },
  cyan: { grad: 'from-cyan-500 to-cyan-600', soft: 'bg-cyan-50 dark:bg-cyan-900/30', text: 'text-cyan-600 dark:text-cyan-400' },
};

function AdvertCard({ advert, format }: { advert: Advertisement; format: (n: number) => string }) {
  return (
    <Link
      to={`/adverts/${advert.id}`}
      className="group bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 transition"
    >
      <div className="relative h-28 overflow-hidden">
        {advert.image_url ? (
          <img src={advert.image_url} alt={advert.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition duration-300" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600" />
        )}
        {advert.awards ? (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-amber-300">
            <Award size={11} /> {advert.awards}
          </span>
        ) : null}
      </div>
      <div className="p-3.5">
        <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">{advert.category || 'Advertisement'}</p>
        <h3 className="font-bold text-gray-900 dark:text-white mb-1 line-clamp-2 text-sm">{advert.title}</h3>
        <div className="mt-2 space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
          {advert.location && (
            <div className="flex items-center gap-1.5"><MapPin size={13} className="text-gray-500 dark:text-gray-400" /><span className="line-clamp-1">{advert.location}</span></div>
          )}
          {advert.dimensions && (
            <div className="flex items-center gap-1.5"><Eye size={13} className="text-gray-500 dark:text-gray-400" /><span>{advert.dimensions}</span></div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between">
          {advert.pricing ? (
            <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              {/* The card price, struck, when this placement is genuinely
                  discounted. OOH is quoted off a published card and then
                  negotiated down, so the pair is the offer — the current price
                  alone is just a number with no history to compare it to.
                  Rendered only when a list price exists and beats the price,
                  which the database also enforces. */}
              {typeof advert.list_price_per_day === 'number'
                && advert.list_price_per_day > (advert.pricing ?? 0) ? (
                <span className="text-xs font-medium text-gray-400 line-through tabular-nums">
                  {format(advert.list_price_per_day)}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 text-sm font-bold text-gray-900 dark:text-white">
                <DollarSign size={14} className="text-green-600 dark:text-green-400" />
                {format(advert.pricing)}
                <span className="text-xs font-normal text-gray-500">/day</span>
              </span>
            </span>
          ) : <span />}
          {advert.traffic_density ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 capitalize"><TrendingUp size={13} />{advert.traffic_density}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export default function Adverts() {
  const { format } = useCurrency();
  const [searchParams] = useSearchParams();
  const [adverts, setAdverts] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') ?? '');
  const [locationFilter, setLocationFilter] = useState(searchParams.get('location') ?? '');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    return applySeo({
      title: 'Advertise in Africa — Book Billboards & Ad Placements',
      description:
        'Book real-world and digital advertising placements across 20+ African markets — billboards, transit, digital screens and managed campaigns.',
      path: '/adverts',
      image: '/og-image.png',
    });
  }, []);

  useEffect(() => {
    const fetchAdverts = async () => {
      try {
        const { data, error: supabaseError } = await supabase
          .from('advertisements').select('*').order('created_at', { ascending: false });
        if (supabaseError) throw new Error(supabaseError.message || 'Database query failed');
        // The sample set only exists in dev (see populateData SAMPLES_ENABLED),
        // so in production this deliberately leaves the list empty rather than
        // inventing placements that nobody can actually book.
        setAdverts(data && data.length > 0 ? data : (generateAdverts() as Advertisement[]));
        setError(null);
      } catch (err: any) {
        // Keep the error. Swallowing it here meant a failed query rendered as
        // "No placements match your filters" — indistinguishable from an empty
        // catalogue, which is how a live outage stayed invisible.
        console.error('Error fetching adverts:', err);
        setAdverts(generateAdverts() as Advertisement[]);
        setError(err?.message || 'Could not load placements.');
      } finally {
        setLoading(false);
      }
    };
    fetchAdverts();
  }, []);

  // Per-group counts for the browse gallery.
  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of adverts) {
      const g = groupForAdvertCategory(a.category);
      if (g) counts[g.key] = (counts[g.key] ?? 0) + 1;
    }
    return counts;
  }, [adverts]);

  const activeGroupObj = ADVERT_CATEGORY_GROUPS.find((g) => g.key === activeGroup) ?? null;
  const hasFilters = !!searchQuery.trim() || !!locationFilter.trim() || !!activeGroup || !!categoryFilter;

  let filteredAdverts = adverts;
  if (categoryFilter) filteredAdverts = filteredAdverts.filter((a) => a.category === categoryFilter);
  if (activeGroupObj) filteredAdverts = filteredAdverts.filter((a) => a.category && activeGroupObj.members.includes(a.category));
  if (searchQuery.trim()) {
    const q = normalize(searchQuery);
    filteredAdverts = filteredAdverts.filter((a) => normalize(a.title ?? '').includes(q) || normalize(a.description ?? '').includes(q) || normalize(a.category ?? '').includes(q));
  }
  if (locationFilter.trim()) {
    const q = normalize(locationFilter.split(',')[0]);
    filteredAdverts = filteredAdverts.filter((a) => normalize(a.location ?? '').includes(q));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading advertising placements…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Hero */}
      <section className="relative overflow-hidden text-white" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #4c1d95 55%, #831843 100%)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs font-semibold">
            <Megaphone size={14} className="text-amber-300" /> Advertise across Africa
          </span>
          <h1 className="mt-4 text-2xl sm:text-4xl font-bold max-w-2xl">Book premium ad placements from billboards to broadcast</h1>
          <p className="mt-3 text-white/85 max-w-xl text-sm sm:text-base">
            {adverts.length > 0 ? `${adverts.length}+ verified placements` : 'Verified placements'} across outdoor, transit, digital, broadcast and print. Filter by medium, location and budget.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Search criteria — Search · Location · Category, 3-in-1 full width */}
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text" placeholder="Search placements…" value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <LocationAutocomplete value={locationFilter} onChange={setLocationFilter} extraOptions={adverts.map((a) => a.location ?? '')} placeholder="Filter by location…" className="py-2.5" />
            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setActiveGroup(null); }}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="">All categories</option>
              {ADVERT_CATEGORY_GROUPS.map((g) => (
                <optgroup key={g.key} label={g.label}>
                  {g.members.map((c) => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          {hasFilters ? (
            <div className="mt-2 flex justify-end">
              <button onClick={() => { setSearchQuery(''); setLocationFilter(''); setActiveGroup(null); setCategoryFilter(''); }} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                <X size={15} /> Clear filters
              </button>
            </div>
          ) : null}
        </div>

        {/* Category browse gallery */}
        <div className="mb-10">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Browse by medium</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {ADVERT_CATEGORY_GROUPS.map((g) => {
              const a = ACCENT[g.accent];
              const active = activeGroup === g.key;
              const Icon = g.icon;
              return (
                <button
                  key={g.key}
                  onClick={() => { setActiveGroup(active ? null : g.key); setCategoryFilter(''); }}
                  className={`text-left rounded-2xl border p-4 transition ${active ? 'border-blue-500 ring-2 ring-blue-500/30 bg-white dark:bg-gray-800' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:-translate-y-0.5 hover:shadow-md'}`}
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${a.grad} flex items-center justify-center`}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <p className="mt-3 font-bold text-sm text-gray-900 dark:text-white leading-tight">{g.label}</p>
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">{g.description}</p>
                  <p className={`mt-2 text-[11px] font-semibold ${a.text}`}>{groupCounts[g.key] ?? 0} placements</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Results */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {categoryFilter || (activeGroupObj ? activeGroupObj.label : 'All placements')}
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">{filteredAdverts.length}</span>
          </h2>
          {(activeGroupObj || categoryFilter) && (
            <button onClick={() => { setActiveGroup(null); setCategoryFilter(''); }} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400">
              View all <ArrowRight size={15} />
            </button>
          )}
        </div>

        {error ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center"><X size={32} className="text-red-600 dark:text-red-400" /></div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Failed to load advertising placements</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
            <button onClick={() => window.location.reload()} className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition">Try Again</button>
          </div>
        ) : filteredAdverts.length === 0 ? (
          <div className="text-center py-16">
            <Megaphone size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            {/* Three different situations that used to share one message: the
                request failed, the catalogue is genuinely empty, or the
                visitor's own filters excluded everything. */}
            {error ? (
              <>
                <p className="text-gray-900 dark:text-white font-medium">We couldn&apos;t load the placements.</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Please check your connection and try again.</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
                >
                  Retry
                </button>
              </>
            ) : adverts.length === 0 ? (
              <>
                <p className="text-gray-900 dark:text-white font-medium">No placements are published yet.</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  New advertising inventory is added regularly — check back soon.
                </p>
              </>
            ) : (
              <p className="text-gray-600 dark:text-gray-400">No placements match your filters.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
            {filteredAdverts.map((advert) => <AdvertCard key={advert.id} advert={advert} format={format} />)}
          </div>
        )}
      </div>
    </div>
  );
}
