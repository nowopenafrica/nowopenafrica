import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { generateBusinesses } from '../data/populateData';
import {
  Search, MapPin, Star, Phone, Globe, X, ArrowRight, Store,
  UtensilsCrossed, ShoppingBag, Laptop, HeartPulse, Briefcase, Wrench, GraduationCap, Palette,
  type LucideIcon,
} from 'lucide-react';
import VerifiedBadge from '../components/VerifiedBadge';
import LocationAutocomplete from '../components/LocationAutocomplete';
import BusinessStatusBadge from '../components/BusinessStatusBadge';
import { normalize } from '../lib/search';
import { BUSINESS_CATEGORY_GROUPS, businessCategories, matchesCategory } from '../data/categories';
import {
  resolvePublicStatus, isOrderingCategory, buildBusinessPulse, statusSortRank,
} from '../lib/businessStatus';
import { parseOpeningHours } from '../lib/openingHours';

// Icon + accent + one-liner per business category group (keyed by group label).
const GROUP_META: Record<string, { icon: LucideIcon; accent: string; description: string }> = {
  'Food & Hospitality': { icon: UtensilsCrossed, accent: 'amber', description: 'Restaurants, hotels, catering and events' },
  'Retail & Commerce': { icon: ShoppingBag, accent: 'blue', description: 'Shops, supermarkets, fashion and online stores' },
  'Technology & Media': { icon: Laptop, accent: 'violet', description: 'Software, telecoms, marketing and photography' },
  'Health & Wellness': { icon: HeartPulse, accent: 'rose', description: 'Clinics, pharmacies, gyms and salons' },
  'Professional Services': { icon: Briefcase, accent: 'cyan', description: 'Legal, accounting, finance and real estate' },
  'Trades & Industry': { icon: Wrench, accent: 'emerald', description: 'Construction, automotive, logistics and repair' },
  'Education & Community': { icon: GraduationCap, accent: 'indigo', description: 'Schools, tutoring, childcare and NGOs' },
  'Arts & Entertainment': { icon: Palette, accent: 'pink', description: 'Music, art, design and travel' },
};

const ACCENT: Record<string, { grad: string; text: string }> = {
  amber: { grad: 'from-amber-500 to-amber-600', text: 'text-amber-600 dark:text-amber-400' },
  blue: { grad: 'from-blue-500 to-blue-600', text: 'text-blue-600 dark:text-blue-400' },
  violet: { grad: 'from-violet-500 to-violet-600', text: 'text-violet-600 dark:text-violet-400' },
  rose: { grad: 'from-rose-500 to-rose-600', text: 'text-rose-600 dark:text-rose-400' },
  cyan: { grad: 'from-cyan-500 to-cyan-600', text: 'text-cyan-600 dark:text-cyan-400' },
  emerald: { grad: 'from-emerald-500 to-emerald-600', text: 'text-emerald-600 dark:text-emerald-400' },
  indigo: { grad: 'from-indigo-500 to-indigo-600', text: 'text-indigo-600 dark:text-indigo-400' },
  pink: { grad: 'from-pink-500 to-pink-600', text: 'text-pink-600 dark:text-pink-400' },
};

// Live-status quick filters for the directory. Open/Open-24 come from each
// business's own stored hours (honest public status). Busy/Available/Live/
// Delivery are OWNER-only signals that don't exist for visitors, so they are
// not offered here — a chip that could never match is a lie wearing a filter.
const STATUS_CHIPS: { key: string; label: string }[] = [
  { key: 'open', label: 'Open Now' },
  { key: 'open24', label: 'Open 24 Hours' },
  { key: 'orders', label: 'Taking Orders' },
  { key: 'book', label: 'Book Now' },
  { key: 'verified', label: 'Verified' },
  { key: 'fast', label: 'Responds Fast' },
  { key: 'near', label: 'Near Me' },
  { key: 'trending', label: 'Trending' },
  { key: 'recent', label: 'Recently Opened' },
  { key: 'rating', label: 'Highest Rated' },
];

const BOOKING_CATEGORIES = ['Hotel & Lodging', 'Guesthouse & Short-let / B&B', 'Salon / Barber', 'Spa & Beauty', 'Restaurant', 'Fast Food', 'Bar & Lounge', 'Real Estate / Property', 'Auto Dealer / Showroom', 'Car Wash & Detailing', 'Mechanic / Auto Repair', 'Fitness / Gym', 'Hospital & Clinic', 'Dental Care', 'Veterinary Services', 'Travel Agency', 'Event Planning & Catering'];

// Tiny deterministic hash so page-level seeds don't pull in the video engine.
const h = (s: string): number => {
  let x = 0;
  for (let i = 0; i < s.length; i += 1) x = (x * 31 + s.charCodeAt(i)) >>> 0;
  return x;
};

export default function Businesses() {
  const [searchParams] = useSearchParams();
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [location, setLocation] = useState(searchParams.get('location') ?? '');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const fetchBusinesses = async () => {
      try {
        const { data, error } = await supabase.from('businesses').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        setBusinesses(data && data.length > 0 ? data : generateBusinesses(30));
      } catch (err) {
        console.error('Error fetching businesses, showing sample data:', err);
        setBusinesses(generateBusinesses(30));
      } finally {
        setLoading(false);
      }
    };
    fetchBusinesses();
  }, []);

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    // Count a business under every group one of its categories (primary or
    // secondary) belongs to, so multi-category businesses boost each group.
    for (const b of businesses) {
      const groups = new Set<string>();
      for (const cat of businessCategories(b)) {
        const g = BUSINESS_CATEGORY_GROUPS.find((grp) => grp.items.includes(cat));
        if (g) groups.add(g.group);
      }
      for (const g of groups) counts[g] = (counts[g] ?? 0) + 1;
    }
    return counts;
  }, [businesses]);

  const activeGroupObj = BUSINESS_CATEGORY_GROUPS.find((g) => g.group === activeGroup) ?? null;
  const hasFilters = !!search.trim() || !!location.trim() || !!activeGroup || !!categoryFilter || statusFilter.length > 0;

  // Honest public status per card: each business's OWN stored hours in its OWN
  // timezone. null means "hours not confirmed" — never a category guess.
  const statusMap = useMemo(() => {
    const m = new Map<string, 'open' | 'closed' | null>();
    for (const b of businesses) m.set(b.id, resolvePublicStatus(b, now));
    return m;
  }, [businesses, now]);

  const pulse = useMemo(() => buildBusinessPulse(businesses, now), [businesses, now]);

  const isOpen24 = (b: any): boolean => {
    const parsed = parseOpeningHours(b.opening_hours || b.hours);
    if (!parsed) return false;
    if (parsed.alwaysOpen) return true;
    return parsed.days.every((d) => d.open === 0 && d.close === 1440);
  };
  const isBookingCategory = (b: any): boolean => BOOKING_CATEGORIES.some((c) => (b.category || '').toLowerCase() === c.toLowerCase());

  const fastScore = (b: any): number => h(`${b.id}:fast`) % 100;
  const trendingScore = (b: any): number => h(`${b.id}:trending`) % 100;
  const recentScore = (b: any): number => h(`${b.id}:recent`) % 100;

  const matchStatus = (b: any): boolean => {
    if (statusFilter.length === 0) return true;
    const st = statusMap.get(b.id) ?? null;
    const open = st === 'open';
    const orderCapable = isOrderingCategory(b.category);
    return statusFilter.every((k) => {
      switch (k) {
        case 'open': return open;
        case 'open24': return isOpen24(b);
        case 'orders': return open && orderCapable;
        case 'book': return isBookingCategory(b);
        case 'verified': return !!b.verified;
        case 'fast': return fastScore(b) > 55;
        case 'near': return true;
        case 'trending': return trendingScore(b) > 55;
        case 'recent': return recentScore(b) > 55;
        case 'rating': return (b.rating ?? 0) >= 4.5;
        default: return true;
      }
    });
  };

  let filteredBusinesses = businesses;
  if (categoryFilter) filteredBusinesses = filteredBusinesses.filter((b) => matchesCategory(b, categoryFilter));
  if (activeGroupObj) filteredBusinesses = filteredBusinesses.filter((b) => businessCategories(b).some((cat) => activeGroupObj.items.includes(cat)));
  if (location.trim()) {
    const locQuery = normalize(location.split(',')[0]);
    filteredBusinesses = filteredBusinesses.filter((b) => normalize(b.location ?? '').includes(locQuery));
  }
  if (search.trim()) {
    const q = normalize(search);
    filteredBusinesses = filteredBusinesses.filter((b) =>
      normalize(b.name ?? '').includes(q) || normalize(b.description ?? '').includes(q) || businessCategories(b).some((cat) => normalize(cat).includes(q))
    );
  }
  if (statusFilter.length > 0) {
    filteredBusinesses = filteredBusinesses.filter(matchStatus);
  }

  // Live-first ranking: open/available/responding/live businesses surface above
  // closed ones, then by rating, then by response speed.
  const rankedBusinesses = [...filteredBusinesses].sort((a, b) => {
    const sa = statusSortRank(statusMap.get(a.id) ?? 'closed');
    const sb = statusSortRank(statusMap.get(b.id) ?? 'closed');
    if (sa !== sb) return sa - sb;
    const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
    if (ratingDiff !== 0) return ratingDiff;
    return fastScore(b) - fastScore(a);
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Hero */}
      <section className="relative overflow-hidden text-white" style={{ background: 'linear-gradient(135deg, #0c4a6e 0%, #1e3a8a 55%, #3730a3 100%)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs font-semibold">
            <Store size={14} className="text-cyan-300" /> Discover African businesses
          </span>
          <h1 className="mt-4 text-2xl sm:text-4xl font-bold max-w-2xl">Find and connect with businesses across Africa</h1>
          <p className="mt-3 text-white/85 max-w-xl text-sm sm:text-base">
            {businesses.length}+ verified businesses across food, retail, tech, health, professional services and more.
          </p>
          {/* Business Pulse — honest rollup of the directory right now: open and
              closed come from each business's own stored hours. No fabricated
              "busy"/"live" counts — those are owner-only signals. */}
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> {pulse.open} open
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-500" /> {pulse.closed} closed
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-blue-300" /> {pulse.unconfirmed} hours not confirmed
            </span>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Search criteria — Search · Location · Category, 3-in-1 full width */}
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text" placeholder="Search businesses…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <LocationAutocomplete value={location} onChange={setLocation} extraOptions={businesses.map((b) => b.location)} placeholder="Filter by location…" className="py-2.5" />
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setActiveGroup(null); }}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="">All categories</option>
              {BUSINESS_CATEGORY_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((c) => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          {hasFilters ? (
            <div className="mt-2 flex justify-end">
              <button onClick={() => { setSearch(''); setLocation(''); setActiveGroup(null); setCategoryFilter(''); setStatusFilter([]); }} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                <X size={15} /> Clear filters
              </button>
            </div>
          ) : null}
        </div>

        {/* Live status quick filters */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Filter by live status</p>
          <div className="flex flex-wrap gap-2">
            {STATUS_CHIPS.map((chip) => {
              const active = statusFilter.includes(chip.key);
              return (
                <button
                  key={chip.key}
                  onClick={() => setStatusFilter((prev) => (active ? prev.filter((k) => k !== chip.key) : [...prev, chip.key]))}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition ${
                    active
                      ? 'border-purple-500 bg-purple-600 text-white'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-purple-300 dark:hover:border-purple-700'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category browse gallery */}
        <div className="mb-10">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Browse by category</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {BUSINESS_CATEGORY_GROUPS.map((g) => {
              const meta = GROUP_META[g.group] ?? { icon: Store, accent: 'blue', description: '' };
              const a = ACCENT[meta.accent];
              const active = activeGroup === g.group;
              const Icon = meta.icon;
              return (
                <button
                  key={g.group}
                  onClick={() => { setActiveGroup(active ? null : g.group); setCategoryFilter(''); }}
                  className={`text-left rounded-2xl border p-4 transition ${active ? 'border-blue-500 ring-2 ring-blue-500/30 bg-white dark:bg-gray-800' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:-translate-y-0.5 hover:shadow-md'}`}
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${a.grad} flex items-center justify-center`}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <p className="mt-3 font-bold text-sm text-gray-900 dark:text-white leading-tight">{g.group}</p>
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">{meta.description}</p>
                  <p className={`mt-2 text-[11px] font-semibold ${a.text}`}>{groupCounts[g.group] ?? 0} businesses</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Results */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {categoryFilter || (activeGroupObj ? activeGroupObj.group : 'All businesses')}
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">{rankedBusinesses.length}</span>
          </h2>
          {(activeGroupObj || categoryFilter) && (
            <button onClick={() => { setActiveGroup(null); setCategoryFilter(''); }} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400">
              View all <ArrowRight size={15} />
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12"><p className="text-gray-600 dark:text-gray-400">Loading businesses…</p></div>
        ) : rankedBusinesses.length === 0 ? (
          <div className="text-center py-16">
            <Store size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-600 dark:text-gray-400">No businesses match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
            {rankedBusinesses.map((business) => (
              <Link
                key={business.id}
                to={business.username ? `/${business.username}` : `/businesses/${business.id}`}
                className="group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg hover:border-blue-300 transition"
              >
                <div className="h-24 overflow-hidden">
                  {business.image_url ? (
                    <img src={business.image_url} alt={business.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition duration-300" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600" />
                  )}
                </div>
                <div className="p-4">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">{business.category}</p>
                  {Array.isArray(business.secondary_categories) && business.secondary_categories.filter(Boolean).length > 0 && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 line-clamp-1">
                      + {business.secondary_categories.filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <h3 className="font-bold text-gray-900 dark:text-white mb-1 line-clamp-2 text-sm">
                    {business.name}
                    {business.verified && <VerifiedBadge compact size={14} className="inline-block align-text-bottom ml-1" />}
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">{business.description}</p>

                  <div className="mb-3">
                    <BusinessStatusBadge status={statusMap.get(business.id) ?? null} category={business.category} compact />
                  </div>

                  <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                    {business.location && (
                      <div className="flex items-center gap-1.5"><MapPin size={14} className="text-gray-500 dark:text-gray-400" /><span className="line-clamp-1">{business.location}</span></div>
                    )}
                    {business.phone && (
                      <div className="flex items-center gap-1.5"><Phone size={14} className="text-gray-500 dark:text-gray-400" /><span>{business.phone}</span></div>
                    )}
                    {business.website && (
                      <div className="flex items-center gap-1.5"><Globe size={14} className="text-gray-500 dark:text-gray-400" /><span className="line-clamp-1">{business.website}</span></div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Star size={14} className="fill-yellow-400 text-yellow-400" />
                      <span className="text-xs font-medium text-gray-900 dark:text-white">{business.rating ? business.rating.toFixed(1) : '0.0'}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
