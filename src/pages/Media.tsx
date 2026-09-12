import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { generateMediaServices } from '../data/populateData';
import { MediaService } from '../types';
import { Star, DollarSign, Palette, X, ArrowRight } from 'lucide-react';
import { buildSuggestions } from '../lib/suggest';
import SuggestInput from '../components/SuggestInput';
import CreateMarketplace from '../components/create/CreateMarketplace';
import { useCurrency } from '../contexts/CurrencyContext';
import { normalize } from '../lib/search';
import { MEDIA_CATEGORY_GROUPS, groupForMediaType, DEFAULT_MEDIA_ICON } from '../data/mediaCategories';
import { applySeo } from '../lib/seo';
import LoadFailure from '../components/LoadFailure';
import SmartImg from '../components/SmartImg';

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
          <SmartImg src={service.thumbnail_url || service.image_url} alt={service.title} className="w-full h-full object-cover group-hover:scale-110 transition duration-300" />
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
  /** The fetch failed, as distinct from no creators being listed. */
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    return applySeo({
      title: 'NowOpen Create — Design, Print & Promote for African Business',
      description:
        // Was "Hire vetted photographers..." — nothing was vetted, and the page
        // is now the whole Create marketplace rather than a creatives directory.
        'Design, print and promote your business in one place. Free creation from your own brand, professional design by African creators, and printing delivered across Nigeria.',
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
        console.error('Error fetching media services:', err);
        // Recorded rather than swallowed. The creator marketplace is genuinely
        // empty in production, so a network failure here produced exactly the
        // honest empty state — "nobody is listed yet" — for somebody whose
        // connection had simply dropped.
        setLoadError(true);
        setServices(generateMediaServices(30));
      } finally {
        setLoading(false);
      }
    };
    setLoadError(false);
    fetchServices();
  }, [reloadKey]);

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

  /*
   * Nothing listed at all — as opposed to nothing matching a filter.
   *
   * When this is true the whole filter apparatus above the results is
   * controls for an empty set: a search box that can never match, a
   * 21-option discipline dropdown, six discipline chips each reading 0, and
   * a heading counting to zero. Every one of them works exactly as built and
   * still does nothing, which is the definition of UI that should not be
   * there. Better to go straight from the section title to the invitation.
   *
   * It reads empty in production on purpose: the sample creative services are
   * invented studios carrying invented ratings and client counts, so they are
   * gated to DEV. See generateMediaServices in data/populateData.ts.
   */
  const marketplaceEmpty = !loading && !loadError && services.length === 0;

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
            <Palette size={14} className="text-yellow-300" /> NowOpen Create
          </span>
          {/* The whole proposition, in the order a business actually does it.
              This page is the PUBLIC Create surface — the catalogue and the
              prices have to be visible before somebody signs up, because
              pricing is the first thing anybody looks for. */}
          <h1 className="mt-4 text-2xl sm:text-4xl font-bold max-w-3xl">
            Create it. Brand it. Print it. Promote it. Grow it.
          </h1>
          <p className="mt-3 text-white/85 max-w-xl text-sm sm:text-base">
            {/* Was "{n}+ vetted creative services". Nobody vetted them — the
                thirty that were here were invented, with invented ratings — and
                "0+" is what the "+" produces on an empty list. */}
            Make it free with your own logo and colours, have a NowOpen creator do it,
            or have it printed and delivered — then put it in front of customers.
          </p>
        </div>
      </section>

      <div className="site-container py-10 space-y-12">
        <CreateMarketplace />

        {/* Hire a creator — the marketplace half. Kept below the catalogue
            because "what can I make and what does it cost" is the question
            people arrive with; "who can make it for me" is the one after. */}
        <section>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Hire a creator</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {marketplaceEmpty
              ? 'Photographers, designers, editors and studios — this part of Create opens as creators join.'
              : 'Photographers, designers, editors and studios across Africa.'}
          </p>
        </section>

        {/* Search criteria — Search · Category, full width.
            Hidden entirely while nothing is listed: see marketplaceEmpty. */}
        {!marketplaceEmpty && (
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
        )}

        {/* Category browse gallery */}
        {!marketplaceEmpty && (
        <div className="mb-10">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Browse by discipline</h2>
          {/*
            A filter row, not a feature grid.

            Each of these was a card: a gradient tile, a bold label, two lines
            of description and a count. Six of them made a block of colour
            heavier than the results underneath, for a control whose only job
            is to narrow a list. The icon carries the accent now, the
            description is the tooltip, and the count sits beside the name.
          */}
          <div className="flex flex-wrap gap-2">
            {MEDIA_CATEGORY_GROUPS.map((g) => {
              const a = ACCENT[g.accent];
              const active = activeGroup === g.key;
              const Icon = g.icon;
              return (
                <button
                  key={g.key}
                  title={g.description}
                  onClick={() => { setActiveGroup(active ? null : g.key); setCategoryFilter(''); }}
                  className={`inline-flex items-center gap-2 min-h-[42px] px-3.5 rounded-full border text-sm font-semibold transition ${active
                    ? 'border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-pink-400'}`}
                >
                  <Icon size={16} className={active ? '' : a.text} />
                  {g.label}
                  <span className="text-[11px] font-normal text-gray-400 tabular-nums">
                    {groupCounts[g.key] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        )}

        {/* Results */}
        {!marketplaceEmpty && (
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
        )}

        {/* A failed read is not "nobody is listed yet". The creator marketplace
            is genuinely empty in production, which is exactly why a network
            failure here is so easy to mistake for the honest empty state. */}
        {loadError && services.length === 0 ? (
          <LoadFailure what="creative services" onRetry={() => setReloadKey((k) => k + 1)} />
        ) : loading ? (
          <div className="text-center py-12"><p className="text-gray-600 dark:text-gray-400">Loading services…</p></div>
        ) : services.length === 0 ? (
          /*
           * Nothing listed at all, which is not "no match for your filters".
           *
           * This used to render IndustryDirectory — the badge saying the
           * directory is being built, a grid of 42 industries and an "Is this
           * your industry?" call to action. All of it belongs to the DIRECTORY,
           * and this is the Create page: somebody here wants a design made, and
           * answering with a tour of industries is answering a question they did
           * not ask. The homepage and /businesses still carry it.
           *
           * What replaces it is the two things that are actually true and useful
           * on this page: you can make it yourself right here, or you can be one
           * of the first creators listed.
           */
          <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-8 sm:p-10 text-center">
            <Palette size={34} className="mx-auto text-gray-300 dark:text-gray-600" />
            <h3 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">
              No creative professionals listed yet
            </h3>
            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              Nobody is listed here until a real person has claimed their profile. In the meantime
              you can make what you need yourself, higher up this page.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <a
                href="#create-designs"
                className="inline-flex items-center gap-1.5 min-h-[46px] px-5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-700"
              >
                Browse the designs <ArrowRight size={15} />
              </a>
              <Link
                to="/waitlist"
                className="inline-flex items-center gap-1.5 min-h-[46px] px-5 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200"
              >
                List yourself as a creator
              </Link>
            </div>
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="text-center py-16">
            <Palette size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-600 dark:text-gray-400">No services match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
            {filteredServices.map((s) => <ServiceCard key={s.id} service={s} format={format} />)}
          </div>
        )}
      </div>
    </div>
  );
}
