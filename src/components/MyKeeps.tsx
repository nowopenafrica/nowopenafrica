import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Loader2 } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { keepsSummary, normaliseTopics, topicLabel } from '../lib/keeps';
import { publicOpenState, type OpenStateInput } from '../lib/openingHours';
import OpenStateBadge from './OpenStateBadge';

/**
 * The businesses someone keeps.
 *
 * Sorted by who is OPEN, not by when they were kept. This is the page where the
 * loop pays off: someone opens it wanting somewhere to go now, and a list led
 * by a shop that closed an hour ago answers a question nobody asked.
 */
interface KeptRow {
  business_id: string;
  topics: unknown;
  businesses: {
    id: string;
    name: string;
    username: string | null;
    category: string | null;
    location: string | null;
    logo_url: string | null;
    image_url: string | null;
    opening_hours: string | null;
    hours: string | null;
    timezone: string | null;
    open_status: 'open' | 'closed' | null;
  } | null;
}

const rank = (b: OpenStateInput, now: Date): number => {
  const kind = publicOpenState(b, now).kind;
  if (kind === 'open') return 0;
  if (kind === 'closing-soon') return 1;
  if (kind === 'unknown') return 2;
  return 3;
};

export default function MyKeeps({ now }: { now?: Date }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<KeptRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('business_keeps')
      .select('business_id, topics, businesses(id,name,username,category,location,logo_url,image_url,opening_hours,hours,timezone,open_status)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setRows(((data as unknown as KeptRow[]) || []).filter((r) => r.businesses));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-6">
        <Loader2 size={15} className="animate-spin" /> Loading your Keeps…
      </div>
    );
  }

  const at = now ?? new Date();
  const ordered = [...rows].sort((a, b) => {
    const r = rank(a.businesses!, at) - rank(b.businesses!, at);
    return r !== 0 ? r : (a.businesses!.name || '').localeCompare(b.businesses!.name || '');
  });

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Heart size={20} className="fill-rose-500 text-rose-500" /> My Keeps
        </h2>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{keepsSummary(rows.length)}</p>

      {ordered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center">
          <Heart size={22} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Keep a business and you will hear when it has something new — offers, stock, events.
          </p>
          <Link to="/businesses" className="inline-block mt-3 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:underline">
            Find businesses to keep →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ordered.map((row) => {
            const b = row.businesses!;
            const topics = normaliseTopics(row.topics);
            const href = b.username ? `/${b.username}` : `/businesses/${b.id}`;
            return (
              <Link
                key={row.business_id}
                to={href}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:border-gray-300 dark:hover:border-gray-600 transition"
              >
                <div className="flex items-start gap-3">
                  {b.logo_url || b.image_url ? (
                    <img
                      src={b.logo_url || b.image_url || ''}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-11 h-11 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <span className="w-11 h-11 rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold flex-shrink-0">
                      {b.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{b.name}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {[b.category, b.location].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <OpenStateBadge business={b} now={at} compact />
                </div>

                {/* What they agreed to hear about, said plainly — this is a
                    consent record, and someone should be able to see theirs
                    without hunting for it. */}
                <p className="text-[10px] text-gray-400 mt-2 truncate">
                  {topics.length === 0
                    ? 'No updates'
                    : `Updates: ${topics.map(topicLabel).join(', ').toLowerCase()}`}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
