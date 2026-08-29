import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { generateMediaServices } from '../data/populateData';
import { MediaService } from '../types';
import { Star, DollarSign, Palette, X, ArrowRight } from 'lucide-react';
import { buildSuggestions } from '../lib/suggest';
import SuggestInput from '../components/SuggestInput';
import { useCurrency } from '../contexts/CurrencyContext';
import { normalize } from '../lib/search';
import { MEDIA_CATEGORY_GROUPS, groupForMediaType, DEFAULT_MEDIA_ICON } from '../data/mediaCategories';
import { applySeo } from '../lib/seo';

const ACCENT: Record<string, { grad: string; text: string }> = {
  pink: { grad: 'from-pink-500 to-pink-600', text: 'text-pink-600 dark:text-pink-400' },
  violet: { grad: 'from-violet-500 to-violet-600', text: 'text-violet-600 dark:text-violet-400' },
  amber: { grad: 'from-amber-500 to-amber-600', text: 'text-amber-600 dark:text-amber-400' },
  blue: { grad: 'from-blue-500 to-blue-600', text: 'text-blue-600 dark:text-blue-400' },
  emerald: { grad: 'from-emerald-500 to-emerald-600', text: 'text-emerald-600 dark:text-emerald-400' },
  rose: { grad: 'from-rose-500 to-rose-600', text: 'text-rose-600 dark:text-rose-400' },
};

function ServiceCard({ service, format }: { service: MediaService; format: (n: number) => string }) {
  const group = groupForMediaType(service.service_type);
  const Icon = group?.icon ?? DEFAULT_MEDIA_ICON;
  return (
    <Link
      to={`/media/${service.id}`}
      className="group bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg hover:border-pink-300 dark:hover:border-pink-700 transition"
    >
      <div className="h-28 overflow-hidden">
        {service.thumbnail_url || service.image_url ? (
          <img src={service.thumbnail_url || service.image_url} alt={service.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition duration-300" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-pink-400 to-pink-600 flex items-center justify-center"><Icon size={22} className="text-white" /></div>
        )}
      </div>
      <div className="p-3.5">
        <p className="text-xs text-pink-600 dark:text-pink-400 font-medium mb-1 flex items-center gap-1"><Icon size={13} /><span className="truncate">{service.service_type}</span></p>
        <h3 className="font-bold text-gray-900 dark:text-white mb-1 line-clamp-2 text-sm">{service.title}</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">{service.description}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1"><Star size={13} className="fill-yellow-400 text-yellow-400" /><span className="text-xs font-medium text-gray-900 dark:text-white">{(service.rating || 0).toFixed(1)}</span></div>
          <div className="flex items-center gap-1 text-pink-600 dark:text-pink-400 font-bold"><DollarSign size={13} /><span className="text-sm">{format(service.pricing || 0)}</span></div>
        </div>
      </div>
    </Link>
  );
}

export default function Media() {
  const { format } = useCurrency();
  const [searchParams] = useSearchParams();
  const [services, setServices] = useState<MediaService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    return applySeo({
      title: 'Creative Services in Africa — Photographers, Designers & Studios',
      description:
        'Hire vetted photographers, videographers, designers and creative studios across Africa. Browse portfolios and book projects directly.',
      path: '/media',
      image: '/og-image.png',
    });
  }, []);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const { data, error } = await supabase.from('media_services').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        setServices(data && data.length > 0 ? data : generateMediaServices(30));
      } catch (err) {
        console.error('Error fetching media services, showing sample data:', err);
        setServices(generateMediaServices(30));
      } finally {
        setLoading(false);
      }
    };
    fetchServices();
  }, []);

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of services) {
      const g = groupForMediaType(s.service_type);
      if (g) counts[g.key] = (counts[g.key] ?? 0) + 1;
    }
    return counts;
  }, [services]);

  const activeGroupObj = MEDIA_CATEGORY_GROUPS.find((g) => g.key === activeGroup) ?? null;
  const suggestions = useMemo(() => buildSuggestions({
    items: services,
    name: (m: MediaService) => m.title ?? '',
    detail: (m: MediaService) => m.service_type ?? undefined,
    categories: [...new Set(services.map((m) => m.service_type).filter(Boolean) as string[])].sort(),
  }, search), [services, search]);

  const hasFilters = !!search.trim() || !!activeGroup || !!categoryFilter;

  let filteredServices = services;
  if (categoryFilter) filteredServices = filteredServices.filter((s) => s.service_type === categoryFilter);
  if (activeGroupObj) filteredServices = filteredServices.filter((s) => s.service_type && activeGroupObj.members.includes(s.service_type));
  if (search.trim()) {
    const q = normalize(search);
    filteredServices = filteredServices.filter((s) => normalize(s.title ?? '').includes(q) || normalize(s.description ?? '').includes(q) || normalize(s.service_type ?? '').includes(q));
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Hero */}
      <section className="relative overflow-hidden text-white" style={{ background: 'linear-gradient(135deg, #831843 0%, #9d174d 45%, #be185d 100%)' }}>
        <div className="site-container py-12 sm:py-16">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs font-semibold">
            <Palette size={14} className="text-yellow-300" /> Hire African creatives
          </span>
          <h1 className="mt-4 text-2xl sm:text-4xl font-bold max-w-2xl">Photographers, designers, editors & studios booked in one place</h1>
          <p className="mt-3 text-white/85 max-w-xl text-sm sm:text-base">
            {services.length}+ vetted creative services across photo & video, design, motion, content, audio and live streaming.
          </p>
        </div>
      </section>

      <div className="site-container py-10">
        {/* Search criteria — Search · Category, full width */}
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Same box as Discover and Promote. No place suggestions here:
                media_services has no location column, so a place would be a
                suggestion that could not filter anything. */}
            <SuggestInput
              value={search}
              onChange={setSearch}
              suggestions={suggestions}
              onPick={(s) => {
                if (s.kind === 'category') { setSearch(''); setActiveGroup(null); setCategoryFilter(s.value); return; }
                setSearch(s.value);
              }}
              placeholder="Search services…"
              ariaLabel="Search services"
              itemNoun="Service"
              listId="media-suggestions"
            />
            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setActiveGroup(null); }}
              /* gray-900 to match the search box: a global rule paints dark
                 inputs gray-900 and outranks the utility class, while the same
                 rule loses to it on a <select>. */
              className="w-full px-3 min-h-[44px] border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
            >
              <option value="">All categories</option>
              {MEDIA_CATEGORY_GROUPS.map((g) => (
                <optgroup key={g.key} label={g.label}>
                  {g.members.map((c) => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          {hasFilters ? (
            <div className="mt-2 flex justify-end">
              <button onClick={() => { setSearch(''); setActiveGroup(null); setCategoryFilter(''); }} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                <X size={15} /> Clear filters
              </button>
            </div>
          ) : null}
        </div>

        {/* Category browse gallery */}
        <div className="mb-10">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Browse by discipline</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {MEDIA_CATEGORY_GROUPS.map((g) => {
              const a = ACCENT[g.accent];
              const active = activeGroup === g.key;
              const Icon = g.icon;
              return (
                <button
                  key={g.key}
                  onClick={() => { setActiveGroup(active ? null : g.key); setCategoryFilter(''); }}
                  className={`text-left rounded-2xl border p-4 transition ${active ? 'border-pink-500 ring-2 ring-pink-500/30 bg-white dark:bg-gray-800' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:-translate-y-0.5 hover:shadow-md'}`}
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${a.grad} flex items-center justify-center`}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <p className="mt-3 font-bold text-sm text-gray-900 dark:text-white leading-tight">{g.label}</p>
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">{g.description}</p>
                  <p className={`mt-2 text-[11px] font-semibold ${a.text}`}>{groupCounts[g.key] ?? 0} services</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Results */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {categoryFilter || (activeGroupObj ? activeGroupObj.label : 'All services')}
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">{filteredServices.length}</span>
          </h2>
          {(activeGroupObj || categoryFilter) && (
            <button onClick={() => { setActiveGroup(null); setCategoryFilter(''); }} className="inline-flex items-center gap-1 text-sm font-medium text-pink-600 dark:text-pink-400">
              View all <ArrowRight size={15} />
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12"><p className="text-gray-600 dark:text-gray-400">Loading services…</p></div>
        ) : filteredServices.length === 0 ? (
          <div className="text-center py-16">
            <Palette size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-600 dark:text-gray-400">No services match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
            {filteredServices.map((s) => <ServiceCard key={s.id} service={s} format={format} />)}
          </div>
        )}
      </div>
    </div>
  );
}
