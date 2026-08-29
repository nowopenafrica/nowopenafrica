import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Compass, DoorOpen, Sparkles, Star, Gem, Search, Loader2, Heart, Tag, X } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';
import BusinessCard from '../components/discover/BusinessCard';
import SearchSuggest from '../components/discover/SearchSuggest';
import LocationAutocomplete from '../components/LocationAutocomplete';
import {
  openNow, newest, topRated, hiddenGems,
  affinityCategories, recommended,
  DISCOVER_SELECT, tallyReviews, withReviewCounts,
  searchBusinesses, availableCategories,
  type DiscoverBusiness,
} from '../lib/discover';

/**
 * The consumer home for discovery.
 *
 * Rails, not one ranked grid, because the questions people arrive with are
 * different from each other: what is open, what is new, what is good, what is
 * near me. A single sorted list answers none of them well.
 *
 * Every rail hides itself when empty. A column of headings above nothing is how
 * a young directory advertises how little it has.
 */
interface Rail {
  key: string;
  title: string;
  blurb: string;
  icon: typeof Compass;
  items: DiscoverBusiness[];
}

export default function Discover() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [all, setAll] = useState<DiscoverBusiness[]>([]);
  const [kept, setKept] = useState<{ business_id: string; category: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  // Filters live in the URL so a search can be shared, bookmarked and
  // returned to by the back button. They update as you type — with 32
  // businesses already in memory, filtering is instant and a Search button
  // would only add a step between the question and the answer.
  const query = params.get('q') ?? '';
  const place = params.get('place') ?? '';
  const category = params.get('category') ?? '';

  /**
   * Update filters in the URL.
   *
   * Takes a patch rather than one key, and applies it through the functional
   * form of setParams. Two separate calls in the same handler both read the
   * same `params` snapshot, so the second silently discards the first — which
   * is how picking a place suggestion left the typed query behind and produced
   * ?q=la&place=Lagos instead of just the place.
   */
  // The URL as of the last write, not as of the last render.
  //
  // setParams' functional form does NOT compose within a tick: React Router
  // hands it the committed search params, so two calls in the same handler both
  // start from the same value and the second silently discards the first.
  // Measured: setting the query and the category together produced
  // ?category=Restaurant with the query dropped. Threading the writes through a
  // ref makes them accumulate.
  const pendingRef = useRef(params);
  useEffect(() => { pendingRef.current = params; }, [params]);

  const setFilters = (patch: Record<string, string>) => {
    const next = new URLSearchParams(pendingRef.current);
    for (const [key, value] of Object.entries(patch)) {
      if (value.trim()) next.set(key, value);
      else next.delete(key);
    }
    pendingRef.current = next;
    setParams(next, { replace: true });
  };
  const setFilter = (key: string, value: string) => setFilters({ [key]: value });

  const filtering = Boolean(query || place || category);

  useEffect(() => applySeo({
    title: 'Discover businesses — NowOpen Africa',
    description: 'Find what is open now, what is new, and the places worth knowing about near you.',
    path: '/discover',
  }), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [biz, reviews] = await Promise.all([
        supabase.from('businesses').select(DISCOVER_SELECT).limit(400),
        supabase.from('business_reviews').select('business_id').limit(5000),
      ]);
      if (!cancelled) {
        setAll(withReviewCounts(
          (biz.data as DiscoverBusiness[]) || [],
          tallyReviews((reviews.data as { business_id: string }[]) || []),
        ));
        setLoading(false);
      }
    })().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // What this person already keeps — used only to avoid recommending back
  // something they already follow, and to name the categories they care about.
  useEffect(() => {
    let cancelled = false;
    if (!user) { setKept([]); return; }
    (async () => {
      const { data } = await supabase
        .from('business_keeps')
        .select('business_id, businesses(category)')
        .eq('user_id', user.id);
      if (cancelled) return;
      const rows = (data as unknown as { business_id: string; businesses: { category: string | null } | null }[]) || [];
      setKept(rows.map((r) => ({ business_id: r.business_id, category: r.businesses?.category ?? null })));
    })().catch(() => { /* recommendations are a bonus, not a requirement */ });
    return () => { cancelled = true; };
  }, [user]);

  const now = useMemo(() => new Date(), []);

  const categories = useMemo(() => availableCategories(all), [all]);
  // Locations that really exist in the data, merged on top of the curated list
  // so a town nobody curated is still offered once a business is there.
  const placeOptions = useMemo(
    () => [...new Set(all.map((b) => (b.location ?? '').trim()).filter(Boolean))].sort(),
    [all],
  );
  const matches = useMemo(
    () => searchBusinesses(all, { query, place, category }),
    [all, query, place, category],
  );

  const rails = useMemo<Rail[]>(() => {
    const keptIds = kept.map((k) => k.business_id);
    const cats = affinityCategories(kept);
    const scope = matches;
    const list: Rail[] = [];

    // While a filter is active the results themselves are the answer; the
    // themed rails below still apply, but this is what was asked for.
    if (filtering) {
      list.push({
        key: 'results',
        title: 'Matches',
        blurb: `${scope.length} ${scope.length === 1 ? 'business' : 'businesses'}`,
        icon: Search, items: scope.slice(0, 12),
      });
    }
    list.push({
      key: 'open', title: 'Open right now', blurb: 'Doors open as of this minute.',
      icon: DoorOpen, items: openNow(scope, now).slice(0, 8),
    });
    if (cats.length) {
      list.push({
        key: 'foryou',
        title: `Because you keep ${cats[0].toLowerCase()}`,
        blurb: 'Places like the ones you already follow.',
        icon: Heart, items: recommended(scope, cats, keptIds).slice(0, 8),
      });
    }
    list.push({
      key: 'new', title: 'New on NowOpen', blurb: 'Listed in the last month.',
      icon: Sparkles, items: newest(scope, now).slice(0, 8),
    });
    list.push({
      key: 'top', title: 'Top rated', blurb: 'Consistently well reviewed.',
      icon: Star, items: topRated(scope).slice(0, 8),
    });
    list.push({
      key: 'gems', title: 'Hidden gems', blurb: 'Well rated, not yet well known.',
      icon: Gem, items: hiddenGems(scope).slice(0, 8),
    });

    return list.filter((r) => r.items.length > 0);
  }, [matches, kept, filtering, now]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Compass size={26} className="text-blue-600 dark:text-blue-400" /> Discover
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          What is open, what is new, and what is worth knowing about.
        </p>
      </header>

      {/* Search, place and category. No submit button: the list narrows as
          you type, so the answer arrives while the question is being asked. */}
      <div className="mb-8 space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <SearchSuggest
            value={query}
            onChange={(v) => setFilter('q', v)}
            onPickPlace={(p) => setFilters({ q: '', place: p })}
            onPickCategory={(c) => setFilters({ q: '', category: c })}
            businesses={all}
          />

          {/* The same autocomplete the directory uses, so a place typed here
              behaves the way it does everywhere else on the site. */}
          {/* LocationAutocomplete brings no vertical padding, height or
              background of its own — its callers supply them. Without these the
              input rendered 21px tall inside a 44px row, two pixels low and on
              the wrong grey, which is what made this box look out of place next
              to the other two. */}
          <div className="sm:w-56">
            <LocationAutocomplete
              value={place}
              onChange={(v) => setFilter('place', v)}
              extraOptions={placeOptions}
              placeholder="Anywhere"
              className="min-h-[44px] bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          <div className="relative sm:w-56">
            <Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              value={category}
              onChange={(e) => setFilter('category', e.target.value)}
              aria-label="Filter by category"
              /* dark:bg-gray-900, not 800, so this matches the two inputs
                 beside it. A global rule paints dark inputs gray-900 and
                 outranks the utility class — its :not() arguments each add
                 specificity — while the same rule loses to the utility on a
                 <select>. Left at 800 the select was visibly a different
                 shade from its neighbours. */
              className="w-full pl-9 pr-3 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white appearance-none"
            >
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {filtering && (
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {matches.length} {matches.length === 1 ? 'match' : 'matches'}
            </p>
            <button
              type="button"
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              <X size={12} /> Clear filters
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-10">
          <Loader2 size={16} className="animate-spin" /> Finding businesses…
        </div>
      ) : rails.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {filtering
              ? 'Nothing matches that yet. Try a different word, or clear the filters.'
              : 'Nothing to show yet.'}
          </p>
          <Link to="/businesses" className="inline-block mt-3 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            Browse the full directory →
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          {rails.map((rail) => {
            const Icon = rail.icon;
            return (
              <section key={rail.key}>
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <Icon size={17} className="text-blue-600 dark:text-blue-400" /> {rail.title}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{rail.blurb}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {rail.items.map((b) => (
                    <BusinessCard key={`${rail.key}-${b.id}`} business={b} now={now} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
