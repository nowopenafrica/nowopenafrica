import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock3, MapPin, Navigation, Search, Tag } from 'lucide-react';

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
 * It does not duplicate the browse experience further down the page. This is an
 * entry point: it hands off to /businesses, which already owns filtering,
 * sorting and the result grid.
 */

const QUICK_ACTIONS = [
  { to: '/open-now', label: 'Open now', icon: Clock3, hint: 'Businesses serving customers right now' },
  { to: '/nearby', label: 'Near me', icon: Navigation, hint: 'Businesses close to you' },
  { to: '/offers', label: 'Offers', icon: Tag, hint: 'Live offers from businesses' },
  { to: '/discover', label: 'Discover', icon: Search, hint: 'Browse everything' },
] as const;

export default function HeroSearch() {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [place, setPlace] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = term.trim();
    const where = place.trim();
    // An empty search is still a request to browse — send them to the listings
    // rather than doing nothing, which reads as a broken button.
    track('search_performed', { term: q, hasLocation: Boolean(where), from: 'home-hero' });
    const params = new URLSearchParams();
    if (q) params.set('search', q);
    if (where) params.set('location', where);
    const qs = params.toString();
    navigate(qs ? `/businesses?${qs}` : '/businesses');
  };

  return (
    <div className="site-container relative z-20 -mt-10">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-4 sm:p-5">
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              aria-label="What are you looking for?"
              placeholder="Restaurant, barber, pharmacy, tailor…"
              className="w-full min-h-[48px] pl-10 pr-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="relative sm:w-56">
            <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              aria-label="Where?"
              placeholder="Lagos, Lekki, Yaba…"
              className="w-full min-h-[48px] pl-10 pr-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="min-h-[48px] px-6 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shrink-0"
          >
            Search
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_ACTIONS.map(({ to, label, icon: Icon, hint }) => (
            <Link
              key={to}
              to={to}
              title={hint}
              onClick={() => track('search_performed', { term: label.toLowerCase(), hasLocation: false, from: 'home-quick-action' })}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-blue-400 transition"
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
