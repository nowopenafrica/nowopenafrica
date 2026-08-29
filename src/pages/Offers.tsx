import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ticket, Loader2, Clock, Tag, MapPin } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { applySeo } from '../lib/seo';
import { businessHref } from '../lib/discover';
import { runningOffers, byUrgency, endsLabel, isEndingSoon, offerHeadline, type Offer } from '../lib/offers';

/**
 * What is on right now, across every business.
 *
 * This tab was removed from the people nav when Discover shipped, because
 * there was no offers table and it would have pointed at a page that could
 * never fill. It is back because there is now something to put in it.
 *
 * Ordered by deadline, soonest first: an offer ending tonight is worth more to
 * somebody reading this than one running all month, and sorting by recency
 * would bury it.
 */
interface OfferRow extends Offer {
  businesses: {
    id: string; name: string; username: string | null;
    category: string | null; location: string | null;
    image_url: string | null; logo_url: string | null;
  } | null;
}

export default function Offers() {
  const [rows, setRows] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [place, setPlace] = useState('');

  useEffect(() => applySeo({
    title: 'Offers and deals — NowOpen Africa',
    description: 'Discounts and special offers running right now at businesses across Africa.',
    path: '/offers',
  }), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // RLS already hides expired and inactive offers; the client filter below
      // is belt-and-braces for a cached response, not the security boundary.
      const { data } = await supabase
        .from('business_offers')
        .select('*, businesses(id,name,username,category,location,image_url,logo_url)')
        .order('ends_at', { ascending: true, nullsFirst: false })
        .limit(200);
      if (!cancelled) {
        setRows(((data as unknown as OfferRow[]) || []).filter((r) => r.businesses));
        setLoading(false);
      }
    })().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Recomputed each minute: "ends in 2 hours" is a claim about right now.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const visible = useMemo(() => {
    const live = byUrgency(runningOffers(rows, now)) as OfferRow[];
    const q = place.trim().toLowerCase();
    if (!q) return live;
    return live.filter((o) => (o.businesses?.location ?? '').toLowerCase().includes(q));
  }, [rows, now, place]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Ticket size={26} className="text-rose-600 dark:text-rose-400" /> Offers
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Running right now, soonest to end first.
        </p>
      </header>

      <div className="relative mb-6 max-w-sm">
        <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="Anywhere"
          aria-label="Filter offers by place"
          className="w-full pl-9 pr-3 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-10">
          <Loader2 size={16} className="animate-spin" /> Finding offers…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <Ticket size={22} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {place ? `Nothing running in ${place} right now.` : 'No offers running right now.'}
          </p>
          <Link to="/discover" className="inline-block mt-3 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            Discover businesses →
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            {visible.length} {visible.length === 1 ? 'offer' : 'offers'} running
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((o) => {
              const b = o.businesses!;
              const ends = endsLabel(o, now);
              const soon = isEndingSoon(o, now);
              return (
                <Link
                  key={o.id}
                  to={businessHref(b)}
                  className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden hover:shadow-lg hover:border-rose-300 dark:hover:border-rose-500/50 transition flex flex-col"
                >
                  <div className="relative h-28 overflow-hidden">
                    {(o.image_url || b.image_url) ? (
                      <img src={o.image_url || b.image_url || ''} alt="" loading="lazy" decoding="async"
                           className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-rose-500 to-orange-500" />
                    )}
                    <span className="absolute top-2 left-2 px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-600 text-white shadow">
                      {offerHeadline(o)}
                    </span>
                    {/* Only the ones ending inside a day get the louder badge —
                        urgency everywhere is urgency nowhere. */}
                    {soon && ends && (
                      <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                        <Clock size={10} /> {ends}
                      </span>
                    )}
                  </div>

                  <div className="p-3 flex flex-col flex-1">
                    <p className="text-sm font-bold text-gray-900 dark:text-white line-clamp-2">{o.title}</p>
                    {o.description && (
                      <p className="text-[11px] text-gray-600 dark:text-gray-400 line-clamp-2 mt-1">{o.description}</p>
                    )}

                    <div className="mt-auto pt-3 flex items-center gap-2 min-w-0">
                      {b.logo_url ? (
                        <img src={b.logo_url} alt="" loading="lazy" className="w-7 h-7 rounded-md object-cover shrink-0" />
                      ) : (
                        <span className="w-7 h-7 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 flex items-center justify-center text-[11px] font-bold shrink-0">
                          {b.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold text-gray-900 dark:text-white truncate">{b.name}</span>
                        <span className="block text-[10px] text-gray-500 dark:text-gray-400 truncate">
                          {[b.category, b.location].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </div>

                    {(o.code || (ends && !soon)) && (
                      <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                        {o.code ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-mono">
                            <Tag size={10} /> {o.code}
                          </span>
                        ) : <span />}
                        {ends && !soon && <span className="text-gray-400">{ends}</span>}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
