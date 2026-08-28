import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, LogIn } from 'lucide-react';

import MyKeeps from '../components/MyKeeps';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';

/**
 * Keeps as a destination.
 *
 * This already existed as a section buried inside /profile, below "Businesses"
 * and "Media Services" — the seller's account page. That put a person's own
 * list of places underneath two headings about running a company. It is the
 * most personal surface on the platform and the reason someone comes back on a
 * day they are not searching for anything, so it gets a tab.
 *
 * noindex: this is one person's private list, and there is nothing here for a
 * crawler to rank.
 */
export default function Keeps() {
  const { user } = useAuth();

  useEffect(() => applySeo({
    title: 'My Keeps — NowOpen Africa',
    description: 'The businesses you keep, and what they have been up to.',
    path: '/keeps',
    robots: 'noindex, nofollow',
  }), []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {user ? (
        <MyKeeps />
      ) : (
        <div className="max-w-md mx-auto text-center py-16">
          <Heart size={32} className="mx-auto mb-3 text-rose-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Keep the places you like</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Keep a business and you will hear when it opens, adds something new, or has an offer —
            without having to go looking.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 mt-5 px-5 min-h-[44px] rounded-lg bg-rose-600 text-white text-sm font-bold hover:bg-rose-700"
          >
            <LogIn size={16} /> Create a free account
          </Link>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Already have one? <Link to="/login" className="text-rose-600 dark:text-rose-400 font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      )}
    </div>
  );
}
