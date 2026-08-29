import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Loader2, Crosshair, DoorOpen } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { applySeo } from '../lib/seo';
import BusinessCard from '../components/discover/BusinessCard';
import { detectLocation, isGeolocationSupported } from '../lib/geolocation';
import {
  near, openNow, DISCOVER_SELECT, tallyReviews, withReviewCounts,
  type DiscoverBusiness,
} from '../lib/discover';

/**
 * Businesses where you are.
 *
 * Matched on place NAME, not distance. `businesses` stores `location` as free
 * text and carries no coordinates — only branch rows in `business_locations`
 * have lat/lng — so this can honestly say "in Yaba" and cannot honestly say
 * "1.2km away". Sorting by a distance the data does not contain would look
 * better and be fiction.
 */
export default function Nearby() {
  const [all, setAll] = useState<DiscoverBusiness[]>([]);
  const [place, setPlace] = useState('');
  const [typed, setTyped] = useState('');
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(false);

  useEffect(() => applySeo({
    title: 'Businesses near you — NowOpen Africa',
    description: 'Find businesses in your area, and see which are open right now.',
    path: '/nearby',
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

  const locate = useCallback(async () => {
    setLocating(true);
    setError(null);
    try {
      const found = await detectLocation();
      // The city is the useful part; the full label is "City, Country" and
      // matching a whole country would return everything.
      const name = found.city || found.region || found.label;
      setPlace(name);
      setTyped(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  }, []);

  const now = useMemo(() => new Date(), []);
  const results = useMemo(() => {
    if (!place) return [];
    const inPlace = near(all, place);
    return openOnly ? openNow(inPlace, now) : inPlace;
  }, [all, place, openOnly, now]);

  return (
    <div className="site-container py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <MapPin size={26} className="text-blue-600 dark:text-blue-400" /> Nearby
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Businesses in your area.
        </p>
      </header>

      <form
        className="flex flex-wrap gap-2 mb-4"
        onSubmit={(e) => { e.preventDefault(); setPlace(typed.trim()); }}
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Town or city, e.g. Yaba"
          aria-label="Your area"
          className="flex-1 min-w-[180px] px-3 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
        />
        <button
          type="submit"
          className="px-4 min-h-[44px] rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
        >
          Show
        </button>
        {isGeolocationSupported() && (
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            {locating ? <Loader2 size={15} className="animate-spin" /> : <Crosshair size={15} />}
            Use my location
          </button>
        )}
      </form>

      {place && (
        <button
          type="button"
          onClick={() => setOpenOnly((v) => !v)}
          aria-pressed={openOnly}
          className={`inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-full text-xs font-semibold mb-6 transition ${
            openOnly
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          <DoorOpen size={13} /> Open now only
        </button>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 mb-4" role="alert">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-10">
          <Loader2 size={16} className="animate-spin" /> Loading businesses…
        </div>
      ) : !place ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <MapPin size={22} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Tell us where you are and we will show you what is around.
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {openOnly
              ? `Nothing open in ${place} right now.`
              : `Nothing listed in ${place} yet.`}
          </p>
          <Link to="/discover" className="inline-block mt-3 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            Discover somewhere else →
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            {results.length} {results.length === 1 ? 'business' : 'businesses'} in {place}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 gap-3">
            {results.map((b) => <BusinessCard key={b.id} business={b} now={now} />)}
          </div>
        </>
      )}
    </div>
  );
}
