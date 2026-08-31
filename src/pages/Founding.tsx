import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Check, Loader2, ArrowRight } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { applySeo } from '../lib/seo';
import { businessHref } from '../lib/discover';
import {
  FOUNDING_CAP,
  FOUNDING_INNER_CIRCLE,
  foundingProgress,
  progressLabel,
  foundingNumberLabel,
  tierOf,
} from '../lib/founding';

/**
 * The Founding 1,000.
 *
 * A public page rather than a dashboard panel, because the badge is only worth
 * having if customers know what it means — a business showing "Founding #47"
 * needs somewhere to send the people who click it.
 *
 * Everything numeric here is read from the database: the counter, the roll, the
 * remaining spots. A hard-coded "347 claimed" would be a fabricated scarcity
 * claim aimed at the exact people being asked to trust the platform, and it is
 * the kind of thing that gets noticed once and remembered permanently.
 */
interface Row {
  number: number;
  qualified_at: string | null;
  businesses: {
    id: string; name: string; username: string | null;
    category: string | null; location: string | null; logo_url: string | null;
  } | null;
}

export default function Founding() {
  const [rows, setRows] = useState<Row[]>([]);
  const [taken, setTaken] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => applySeo({
    title: 'The Founding 1,000 — NowOpen Africa',
    description:
      'The first 1,000 verified, completed businesses on NowOpen Africa carry a permanent founding number. See who is in.',
    path: '/founding',
  }), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [roll, count] = await Promise.all([
        supabase
          .from('founding_members')
          .select('number,qualified_at,businesses(id,name,username,category,location,logo_url)')
          .order('number', { ascending: true })
          .limit(120),
        supabase.from('founding_members').select('business_id', { count: 'exact', head: true }),
      ]);
      if (cancelled) return;
      setRows(((roll.data as unknown as Row[]) || []).filter((r) => r.businesses));
      setTaken(count.count ?? 0);
      setLoading(false);
    })().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const progress = foundingProgress(taken);

  return (
    <div className="site-container py-10">
      <header className="max-w-3xl">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-950 text-[11px] font-extrabold">
          <Award size={13} /> Founding programme
        </span>
        <h1 className="mt-3 text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
          The Founding {FOUNDING_CAP.toLocaleString()}
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-300">
          The first {FOUNDING_CAP.toLocaleString()} verified, completed businesses on NowOpen Africa
          carry a permanent founding number on their page. The first {FOUNDING_INNER_CIRCLE} are the
          Founding 100.
        </p>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {/* Stated up front, because it is the difference between a badge that
              means something and one anyone can mint by registering. */}
          It is not awarded for signing up. It is awarded for a business that is
          claimed, verified and finished — so the badge tells a customer something
          true about the page they are looking at.
        </p>
      </header>

      {/* The counter. Honest at every value, including zero. */}
      <section className="mt-7 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/15 p-5 max-w-3xl">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <p className="text-3xl font-extrabold text-gray-900 dark:text-white tabular-nums">
              {progress.remaining.toLocaleString()}
            </p>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              founding spots remaining
            </p>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-300">{progressLabel(progress)}</p>
        </div>
        <div className="mt-3 h-2 rounded-full bg-amber-200/70 dark:bg-amber-900/40 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 transition-all"
            style={{ width: progress.taken > 0 ? `${Math.max(progress.percent, 1)}%` : '0%' }}
            role="progressbar"
            aria-valuenow={progress.taken}
            aria-valuemin={0}
            aria-valuemax={FOUNDING_CAP}
            aria-label="Founding spots claimed"
          />
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-3 max-w-4xl">
        {[
          ['Claim your page', 'Find your business and claim it, or add it if it is not listed yet.'],
          ['Finish it properly', 'Name, category, location, about, opening hours, contact and a logo.'],
          ['Get verified', 'We confirm you are the business. Then your founding number is issued.'],
        ].map(([title, body], i) => (
          <div key={title} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <span className="w-6 h-6 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <p className="mt-2 text-sm font-bold text-gray-900 dark:text-white">{title}</p>
            <p className="text-[12px] text-gray-600 dark:text-gray-300 mt-0.5">{body}</p>
          </div>
        ))}
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link to="/dashboard" className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold hover:opacity-90">
          Claim your spot <ArrowRight size={15} />
        </Link>
        <Link to="/discover" className="inline-flex items-center px-5 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200">
          Browse businesses
        </Link>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">The roll</h2>
        {loading ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 size={15} className="animate-spin" /> Loading…
          </p>
        ) : rows.length === 0 ? (
          // The honest empty state. An un-started campaign is a reason to move
          // now, not something to paper over with invented entries.
          <div className="mt-3 rounded-2xl border border-dashed border-amber-300 dark:border-amber-700 p-8 text-center max-w-2xl">
            <Award size={22} className="mx-auto mb-2 text-amber-500" />
            <p className="text-sm font-bold text-gray-900 dark:text-white">No founding numbers issued yet.</p>
            <p className="text-[12px] text-gray-600 dark:text-gray-300 mt-1">
              Every spot is still open, including number one.
            </p>
          </div>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => {
              const b = r.businesses!;
              const gold = tierOf(r.number) === 'founding-100';
              return (
                <li key={r.number}>
                  <Link
                    to={businessHref(b)}
                    className="flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2.5 hover:border-amber-300 dark:hover:border-amber-600 transition"
                  >
                    <span className={`w-11 shrink-0 text-center rounded-lg py-1 text-[11px] font-extrabold font-mono ${
                      gold
                        ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-amber-950'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                    }`}>
                      #{r.number}
                    </span>
                    {b.logo_url ? (
                      <img src={b.logo_url} alt="" loading="lazy" className="w-8 h-8 rounded-md object-cover shrink-0" />
                    ) : (
                      <span className="w-8 h-8 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0">
                        {b.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block text-[12px] font-bold text-gray-900 dark:text-white truncate">{b.name}</span>
                      <span className="block text-[10px] text-gray-500 dark:text-gray-400 truncate">
                        {[b.category, b.location].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {taken > rows.length && (
          <p className="mt-3 text-[11px] text-gray-500">
            Showing the first {rows.length} of {taken.toLocaleString()}.
          </p>
        )}
      </section>

      <section className="mt-10 max-w-3xl text-[12px] text-gray-600 dark:text-gray-300 space-y-1.5 border-t border-gray-200 dark:border-gray-700 pt-5">
        <p className="font-bold text-gray-900 dark:text-white text-sm">The terms, plainly</p>
        <p>
          Numbers are issued in the order businesses qualify, by the platform, and cannot be bought or
          transferred. Once issued, a founding number is permanent — it records when you arrived, so it
          is not withdrawn if your listing changes later.
        </p>
        <p>
          {/* Deliberately not a prize draw. A random-draw promotion in Nigeria
              engages promotional-competition rules and a regulator; a badge
              earned by meeting published criteria does not. */}
          <Check size={12} className="inline" /> There is no draw, no entry fee and no purchase
          involved — every business meeting the criteria above gets a number while spots remain.{' '}
          {FOUNDING_CAP.toLocaleString()} exist in total; when they are gone the programme closes.
          Example: <span className="font-mono">{foundingNumberLabel(1)}</span>.
        </p>
      </section>
    </div>
  );
}
