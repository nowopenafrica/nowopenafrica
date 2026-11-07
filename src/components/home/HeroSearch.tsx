import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock3, Navigation, Search, Tag } from 'lucide-react';

import UniversalSearch from '../UniversalSearch';
import LocationAutocomplete from '../LocationAutocomplete';
import { track } from '../../lib/telemetry';

/**
 * The answer to the headline.
 *
 * The hero asks "What are you looking for?" — this is where someone answers it,
 * without scrolling and without an account. A cold visitor who has never heard
 * of NowOpen should be able to search within seconds of arriving; that is the
 * whole job of this component.
 *
 * DELIBERATELY OUTSIDE THE HERO. The hero's copy and CTAs fade in and out with
 * the video slider, and the fade toggles `visibility` — so anything inside it
 * periodically leaves the tab order and stops taking clicks. A search field
 * that disappears while someone is typing into it would be worse than no search
 * field, so this sits below the hero and never fades.
 *
 * ── WHAT CHANGED, 2026-09-17 ───────────────────────────────────────
 *
 * This was two plain inputs that posted to /businesses. It could reach exactly
 * one thing — a business listing filtered by name, description or category —
 * and it suggested nothing, so a visitor had to already know the words the
 * directory uses. Somebody looking for "diagnostic tests", a place, an
 * industry, advertising space or the page that lists offers got nothing.
 *
 * It is now a universal search: businesses, the 22,085 services and 2,807
 * products they publish, 278 places, categories, adverts, media services and
 * the app's own pages, suggested as you type. See lib/universalSearch.ts.
 *
 * The place field stays. "Where" is a filter, not a thing to find, and folding
 * it into the same box would mean guessing which half of "barber lekki" is
 * which — a guess that is wrong often enough to be worse than two fields.
 */

const QUICK_ACTIONS = [
  { to: '/open-now', label: 'Open now', icon: Clock3, hint: 'Businesses serving customers right now' },
  { to: '/nearby', label: 'Near me', icon: Navigation, hint: 'Businesses close to you' },
  { to: '/offers', label: 'Offers', icon: Tag, hint: 'Live offers from businesses' },
  { to: '/discover', label: 'Discover', icon: Search, hint: 'Browse everything' },
] as const;

/**
 * `onFilterChange` lets the page below react AS SOMEBODY TYPES.
 *
 * The hero box and the cards under it were two separate searches on one page:
 * typing here did nothing to what was on screen, so the obvious search field
 * appeared not to work and a visitor had to find the second one. Submitting
 * still navigates; this only narrows what is already visible.
 */
export default function HeroSearch({
  onFilterChange,
}: { onFilterChange?: (f: { term: string; place: string }) => void } = {}) {
  const navigate = useNavigate();
  const [place, setPlace] = useState('');
  const [term, setTerm] = useState('');

  const emit = (next: { term?: string; place?: string }) => {
    onFilterChange?.({ term: next.term ?? term, place: next.place ?? place });
  };

  /*
   * Free text plus a place, when the visitor ignores the suggestions and just
   * presses Enter. An empty search is still a request to browse — send them to
   * the listings rather than doing nothing, which reads as a broken button.
   */
  const searchWithPlace = (q: string) => {
    const where = place.trim();
    const params = new URLSearchParams();
    if (q) params.set('search', q);
    if (where) params.set('location', where);
    const qs = params.toString();
    navigate(qs ? `/businesses?${qs}` : '/businesses');
  };

  // The place box on its own is a valid search: "show me everything in Yaba".
  const submitPlaceOnly = (e: FormEvent) => {
    e.preventDefault();
    track('search_performed', { term: '', hasLocation: Boolean(place.trim()), from: 'home-hero-place' });
    searchWithPlace('');
  };

  return (
    <div className="site-container relative z-20 -mt-10">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Its own form: Enter here runs the suggestion search, not the
              place-only one. */}
          <UniversalSearch
            className="flex-1"
            source="home-hero"
            placeholder="Restaurant, diagnostic tests, Lekki, hotels…"
            onSubmitTerm={searchWithPlace}
            onTermChange={(t) => { setTerm(t); emit({ term: t }); }}
          />

          <form onSubmit={submitPlaceOnly} className="flex gap-3 sm:contents" role="search">
            {/* Server-backed: place_suggest() answers in ~8ms with the place
                names AND how many businesses are in each, so nobody picks a
                filter that empties the directory. It also carries "use my
                location", which the plain input never had. */}
            <div className="relative flex-1 sm:flex-none sm:w-56">
              <LocationAutocomplete
                remote
                value={place}
                onChange={setPlace}
                ariaLabel="Where?"
                placeholder="Lagos, Lekki, Yaba…"
                className="min-h-[48px] rounded-xl"
              />
            </div>

            <button
              type="submit"
              className="min-h-[48px] px-6 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shrink-0"
            >
              Search
            </button>
          </form>
        </div>

        {/*
          One scrolling row on a phone, wrapped from sm up.

          MEASURED at 375px: four chips wrapped to two rows, so the search
          panel stood 232px tall and the first listing sat below the fold.
          Scrolling keeps every action reachable — the same answer the Studio
          toolbars reached when they wrapped to four lines.
        */}
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {QUICK_ACTIONS.map(({ to, label, icon: Icon, hint }) => (
            <Link
              key={to}
              to={to}
              title={hint}
              onClick={() => track('search_performed', { term: label.toLowerCase(), hasLocation: false, from: 'home-quick-action' })}
              className="inline-flex shrink-0 items-center gap-1.5 min-h-[40px] px-3.5 rounded-full border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-blue-400 transition"
            >
              <Icon size={15} className="text-blue-600 dark:text-blue-400" />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
