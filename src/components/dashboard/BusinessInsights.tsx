import { useCallback, useEffect, useState } from 'react';
import { Eye, Phone, TrendingUp, TrendingDown, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  businessInsights, channelLabel, MIN_FOR_TREND,
  type BusinessInsights as Insights, type InsightEvent,
} from '../../lib/businessInsights';

/**
 * "Is NowOpen helping my business?" — the question the dashboard could not answer.
 *
 * Before this, an owner could complete a profile, publish it and pay for a
 * plan without ever learning whether one person had looked at it. The
 * dashboard reported profile completeness — a fact about their form — and
 * nothing about the outcome.
 *
 * No migration was needed. The `analytics_owner_read` RLS policy already lets
 * an owner select events for their own business; nothing had ever used it.
 *
 * The design constraint is honesty, because the numbers are small. The whole
 * platform saw 114 sessions in a fortnight, so this component will usually be
 * showing single digits or nothing at all. A panel that dresses that up with
 * trend arrows and percentages teaches the owner that the numbers are theatre,
 * and then the one metric that could justify a subscription is worthless. So:
 * no trend below MIN_FOR_TREND, no rate on a handful of viewers, and an empty
 * state that says plainly what it means.
 */
export default function BusinessInsights({ businessId }: { businessId: string }) {
  const { user } = useAuth();
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 60 days: the visible window is 30, and the preceding 30 is what makes
      // a trend possible.
      const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
      const { data: rows, error: err } = await supabase
        .from('analytics_events')
        .select('name,props,session_id,user_id,created_at')
        .eq('business_id', businessId)
        .in('name', ['business_viewed', 'business_contact_clicked'])
        .gte('created_at', since)
        .limit(5000);
      if (err) throw err;
      setData(businessInsights((rows ?? []) as InsightEvent[], {
        days: 30,
        ownerUserId: user?.id ?? null,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your numbers');
    } finally {
      setLoading(false);
    }
  }, [businessId, user?.id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 sm:p-6">
        <div className="h-4 w-40 rounded bg-gray-100 dark:bg-gray-700 animate-pulse" />
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 sm:p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Your last 30 days</h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {error ?? 'Could not load your numbers.'}
        </p>
        <button
          onClick={() => void load()}
          className="mt-3 inline-flex items-center min-h-[44px] px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Your last 30 days</h3>
        {/* Said out loud, because an owner checking their own page all day
            would otherwise be looking at their own traffic. */}
        <span className="text-xs text-gray-500 dark:text-gray-400">Your own visits are not counted</span>
      </div>

      {data.empty ? (
        /*
         * The honest empty state. "0 views" beside a chart implies the
         * measurement is working and the answer is bad; this says which of the
         * two things is actually true, and gives the owner something to do.
         */
        <div className="mt-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-5">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Nobody has opened your profile yet in the last 30 days.
          </p>
          <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
            That is expected while the directory is still filling up — most people
            arrive from search, and that takes time to build. Sharing your profile
            link directly is the fastest thing that works today.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat
              icon={<Users size={16} className="text-blue-600 dark:text-blue-400" />}
              label="People who looked"
              value={data.viewers}
              note={data.views > data.viewers ? `${data.views} opens in total` : undefined}
              trend={data.trend}
            />
            <Stat
              icon={<Eye size={16} className="text-blue-600 dark:text-blue-400" />}
              label="Profile opens"
              value={data.views}
            />
            <Stat
              icon={<Phone size={16} className="text-green-600 dark:text-green-400" />}
              label="People who got in touch"
              value={data.contacts}
              note={data.contactRate !== null ? `${data.contactRate}% of those who looked` : undefined}
            />
          </div>

          {data.byChannel.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                How they reached out
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.byChannel.map((c) => (
                  <span
                    key={c.channel}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100"
                  >
                    {channelLabel(c.channel)}
                    <span className="tabular-nums font-semibold">{c.clicks}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.trend === null && data.viewers > 0 && (
            /* Why there is no arrow. Better than an arrow that means nothing. */
            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
              Too few visits so far to show a reliable change — we start comparing
              months once there are at least {MIN_FOR_TREND} in each.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value, note, trend }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note?: string;
  trend?: number | null;
}) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-extrabold tabular-nums text-gray-900 dark:text-white">{value}</span>
        {typeof trend === 'number' && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
            trend >= 0 ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'
          }`}>
            {trend >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      {note && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{note}</p>}
    </div>
  );
}
