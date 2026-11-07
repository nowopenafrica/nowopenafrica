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
import LoadFailure from '../components/LoadFailure';

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
  /*
   * Whether the fetch FAILED, as distinct from returning nothing.
   *
   * The catch below used to swallow the error and just stop the spinner, so a
   * dropped connection rendered the empty state — telling a visitor there is
   * nothing here when the truth was that we could not ask. On the mobile
   * connections this audience uses, and on a directory that genuinely is
   * nearly empty, that is the worst possible confusion to create.
   */
  const [loadError, setLoadError] = useState(false);
  /** Every listable business, counted in the DATABASE — not in the page that loaded. */
  const [totalListed, setTotalListed] = useState<number | null>(null);
  /** Bumped by the retry button to re-run the effect. */
  const [reloadKey, setReloadKey] = useState(0);
  const [place, setPlace] = useState('');
  const [typed, setTyped] = useState('');

  useEffect(() => applySeo({
    title: 'Open right now — NowOpen Africa',
    description: 'Businesses with their doors open at this moment.',
    path: '/open-now',
  }), []);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    setLoading(true);
    (async () => {
      /*
       * ONLY ROWS THAT COULD EVER QUALIFY, AND ALL OF THEM.
       *
       * This was `.select(DISCOVER_SELECT).limit(400)` with no filters and no
       * order, which was wrong three separate ways:
       *
       *   1. NO VISIBILITY FILTER. Discover and Businesses both apply
       *      is_listable + profile_state explicitly, and say why: RLS also lets
       *      an admin or an owner see their own unlisted rows, so the public
       *      page showed a different directory depending on who was looking.
       *      This page applied neither.
       *   2. UNORDERED limit(400). PostgREST returned an arbitrary 400 of
       *      3,118, so a business with genuinely confirmed hours did not appear
       *      if it fell outside that slice — on the one page the product is
       *      named after.
       *   3. It read 400 rows in order to display two. Only a business with
       *      stated hours can ever be shown here, so that belongs in the query.
       *
       * MEASURED: `hours` is NULL on all 3,118 rows and `opening_hours` on
       * 3,115, so this `or` returns three rows rather than a page of them.
       * publicOpenState still makes the real decision — this only avoids
       * reading the whole table to find the handful that can qualify.
       */
      const [biz, reviews, total] = await Promise.all([
        supabase.from('businesses').select(DISCOVER_SELECT)
          .eq('is_listable', true)
          .eq('profile_state', 'published')
          .or('opening_hours.not.is.null,hours.not.is.null,is_24_hours_confirmed.is.true')
          .order('listing_score', { ascending: false })
          .order('id', { ascending: true })
          .limit(1000),
        supabase.from('business_reviews').select('business_id').limit(1000),
        /*
         * The honest denominator, counted with head:true so it costs no rows.
         * The previous "N more listed" was computed over the 400 rows that
         * happened to arrive, so it told a reader the directory held 399
         * businesses when it holds 3,118.
         */
        supabase.from('businesses').select('id', { count: 'exact', head: true })
          .eq('is_listable', true)
          .eq('profile_state', 'published'),
      ]);
      if (!cancelled) {
        // supabase-js RESOLVES with { data: null, error } on a network failure
        // rather than throwing, so the catch below never sees it. Read the
        // error off the primary response, or the page tells somebody whose
        // connection dropped that there is nothing here.
        // The reviews call is only a tally — its failure costs a count, not
        // the page, so it does not set this.
        if (biz.error) setLoadError(true);
        if (typeof total.count === 'number') setTotalListed(total.count);
        setAll(withReviewCounts(
          (biz.data as DiscoverBusiness[]) || [],
          tallyReviews((reviews.data as { business_id: string }[]) || []),
        ));
        setLoading(false);
      }
    })().catch(() => {
      if (cancelled) return;
      setLoadError(true);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Recomputed each minute, because a page that says "open" is making a claim
  // about right now and goes stale while somebody reads it.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  /**
   * How many businesses in scope have not confirmed their hours.
   *
   * The distinction the empty state depends on. "Nothing is open right now" and
   * "nobody has told us when they open" are completely different statements,
   * and only one of them is true here: 3,115 of 3,118 listings carry no hours,
   * so this page is empty for want of data, not for want of open shops.
   */
  const unconfirmed = useMemo(() => {
    if (totalListed === null) return 0;
    /*
     * Everything listed, minus everything that published hours at all.
     *
     * `all` now holds only rows carrying an hours signal, so this is the true
     * size of the gap rather than the size of one page — which is what the
     * previous version measured, and why it reported 397.
     *
     * Not narrowed by `place`: a place-filtered total would need its own query,
     * and an approximate number presented as exact is the fault being fixed.
     */
    return Math.max(0, totalListed - all.length);
  }, [totalListed, all]);

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
    <div className="site-container py-8">
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

      {/* A failed load is shown as a failed load, never as an empty result. */}
      {loadError ? (
        <LoadFailure what={'what is open now'} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-10">
          <Loader2 size={16} className="animate-spin" /> Checking who is open…
        </div>
      ) : results.length === 0 ? (
        /*
         * WHY THIS SAYS WHAT IT SAYS
         *
         * It used to read "Nothing is open right now." That was false, and
         * confidently so: shops across Nigeria were open, NowOpen just did not
         * know which. The page was previously never empty at all, because an
         * unconfirmed `default_24_7` counted as open and returned all 3,115
         * listings at any hour — so this page went from meaning nothing to
         * showing nothing the moment that default was removed, and the
         * honest sentence is the one that explains which.
         *
         * A directory that admits a gap and asks the reader to help close it is
         * doing the only useful thing available to it. Guessing is not the
         * alternative; it is the thing that was wrong.
         */
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          {unconfirmed > 0 ? (
            <>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Nothing with confirmed hours{place ? ` in ${place}` : ''} right now.
              </p>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 max-w-md mx-auto">
                {unconfirmed.toLocaleString()} businesses are listed on NowOpen that have not
                published their opening hours. We will not guess — a wrong
                &ldquo;open&rdquo; sends someone to a closed door.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Link
                  to="/add-business"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 min-h-[44px] text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Add your hours
                </Link>
                <Link
                  to="/businesses"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-4 min-h-[44px] text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Browse all businesses
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {place ? `Nothing open in ${place} right now.` : 'Nothing is open right now.'}
              </p>
              <Link to="/discover" className="inline-block mt-3 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                Discover businesses &rarr;
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            {results.length} open{place ? ` in ${place}` : ''}
            {/*
              * Naming what is NOT counted, so a short list does not read as a
              * short directory. Without it "4 open in Lagos" implies Lagos has
              * four businesses.
              */}
            {unconfirmed > 0 && (
              <> · {unconfirmed.toLocaleString()} listed without published hours</>
            )}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 gap-3">
            {results.map((b) => <BusinessCard key={b.id} business={b} now={now} />)}
          </div>
        </>
      )}
    </div>
  );
}
