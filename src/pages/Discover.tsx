import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Compass, DoorOpen, Sparkles, Star, Gem, MapPin, Search, Loader2, Heart } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';
import BusinessCard from '../components/discover/BusinessCard';
import {
  openNow, newest, topRated, hiddenGems, near,
  affinityCategories, recommended,
  DISCOVER_SELECT, tallyReviews, withReviewCounts,
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
  const place = params.get('place') ?? '';
  const [placeInput, setPlaceInput] = useState(place);

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

  const rails = useMemo<Rail[]>(() => {
    const keptIds = kept.map((k) => k.business_id);
    const cats = affinityCategories(kept);
    const scope = place ? near(all, place) : all;
    const list: Rail[] = [];

    if (place) {
      list.push({
        key: 'near', title: `In ${place}`, blurb: 'Businesses recorded in this area.',
        icon: MapPin, items: scope.slice(0, 8),
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
  }, [all, kept, place, now]);

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

      <form
        className="flex gap-2 mb-8"
        onSubmit={(e) => {
          e.preventDefault();
          const next = new URLSearchParams(params);
          if (placeInput.trim()) next.set('place', placeInput.trim());
          else next.delete('place');
          setParams(next, { replace: true });
        }}
      >
        <div className="relative flex-1">
          <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={placeInput}
            onChange={(e) => setPlaceInput(e.target.value)}
            placeholder="Where are you? e.g. Yaba, Lagos"
            aria-label="Filter by place"
            className="w-full pl-9 pr-3 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
        >
          <Search size={15} /> Show
        </button>
      </form>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-10">
          <Loader2 size={16} className="animate-spin" /> Finding businesses…
        </div>
      ) : rails.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {place ? `Nothing listed in ${place} yet.` : 'Nothing to show yet.'}
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
