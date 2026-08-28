import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DoorOpen, Loader2, MapPin } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { applySeo } from '../lib/seo';
import BusinessCard from '../components/discover/BusinessCard';
import {
  openNow, near, DISCOVER_SELECT, tallyReviews, withReviewCounts,
  type DiscoverBusiness,
} from '../lib/discover';
import { publicOpenState } from '../lib/openingHours';

/**
 * The question the product is named after.
 *
 * "Closing soon" is included and labelled rather than filtered out — a shop
 * closing in forty minutes is open, and hiding it sends somebody away from a
 * place they could still get to. The badge tells them to hurry; the list does
 * not decide for them.
 */
export default function OpenNow() {
  const [all, setAll] = useState<DiscoverBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [place, setPlace] = useState('');
  const [typed, setTyped] = useState('');

  useEffect(() => applySeo({
    title: 'Open right now — NowOpen Africa',
    description: 'Businesses with their doors open at this moment.',
    path: '/open-now',
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

  // Recomputed each minute, because a page that says "open" is making a claim
  // about right now and goes stale while somebody reads it.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const results = useMemo(() => {
    const scope = place ? near(all, place) : all;
    // Fully open first, then the ones closing soon — same list, useful order.
    return openNow(scope, now).sort((a, b) => {
      const ka = publicOpenState(a, now).kind === 'open' ? 0 : 1;
      const kb = publicOpenState(b, now).kind === 'open' ? 0 : 1;
      return ka - kb;
    });
  }, [all, place, now]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <DoorOpen size={26} className="text-emerald-600 dark:text-emerald-400" /> Open right now
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Doors open as of this minute. Places closing soon are included and marked.
        </p>
      </header>

      <form
        className="flex gap-2 mb-6"
        onSubmit={(e) => { e.preventDefault(); setPlace(typed.trim()); }}
      >
        <div className="relative flex-1">
          <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Anywhere — or type a town"
            aria-label="Filter by place"
            className="w-full pl-9 pr-3 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
          />
        </div>
        <button
          type="submit"
          className="px-4 min-h-[44px] rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
        >
          Show
        </button>
      </form>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-10">
          <Loader2 size={16} className="animate-spin" /> Checking who is open…
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {place ? `Nothing open in ${place} right now.` : 'Nothing is open right now.'}
          </p>
          <Link to="/discover" className="inline-block mt-3 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            Discover businesses →
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            {results.length} open{place ? ` in ${place}` : ''}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {results.map((b) => <BusinessCard key={b.id} business={b} now={now} />)}
          </div>
        </>
      )}
    </div>
  );
}
