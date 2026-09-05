import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import {
  activationFunnel, verdict, weekOnWeek, weeklyConnections,
  type FunnelBusiness, type FunnelStage, type RawEvent, type WeekConnections,
} from '../../lib/northStar';

/**
 * The activation dashboard — the North Star and the funnel underneath it.
 *
 * This is the screen that answers "is NowOpen working?", and it is built to be
 * able to say no. Registrations and account totals are deliberately absent:
 * they are the numbers that look best when nothing is happening.
 *
 * Reads are staff-gated by RLS on analytics_events, so this needs no new
 * permission and no migration.
 */

const DAYS = 90;

interface Loaded {
  series: WeekConnections[];
  funnel: FunnelStage[];
  businesses: number;
  syntheticWarning: number;
}

export default function ActivationPanel() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - DAYS * 864e5).toISOString();

      const [bizRes, evRes, keepRes, offerRes] = await Promise.all([
        supabase.from('businesses').select(
          'id,claim_status,data_status,description,category,location,phone,whatsapp,logo_url,image_url,opening_hours,hours,about,story,email_verified,phone_verified',
        ),
        supabase.from('analytics_events').select('name,props,business_id,created_at').gte('created_at', since),
        supabase.from('business_keeps').select('business_id'),
        supabase.from('business_offers').select('business_id'),
      ]);

      if (evRes.error) throw new Error(`Events: ${evRes.error.message}`);
      if (bizRes.error) throw new Error(`Businesses: ${bizRes.error.message}`);

      const rows = (bizRes.data ?? []) as Array<FunnelBusiness & { data_status?: string | null }>;
      const events = (evRes.data ?? []) as RawEvent[];

      const keeps: Record<string, number> = {};
      for (const k of (keepRes.data ?? []) as Array<{ business_id: string }>) {
        keeps[k.business_id] = (keeps[k.business_id] ?? 0) + 1;
      }
      const offers: Record<string, number> = {};
      for (const o of (offerRes.data ?? []) as Array<{ business_id: string }>) {
        offers[o.business_id] = (offers[o.business_id] ?? 0) + 1;
      }

      const businesses = rows.map((b) => ({ ...b, offers: offers[b.id] ?? 0 }));

      setData({
        series: weeklyConnections(events),
        funnel: activationFunnel(businesses, events, keeps),
        businesses: businesses.length,
        syntheticWarning: rows.filter((b) => b.data_status && b.data_status !== 'user_created'
          && b.claim_status !== 'claimed').length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load activation data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (loading) return <p className="text-sm text-gray-500">Reading {DAYS} days of activity…</p>;
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 text-sm">
        <p className="font-medium text-red-800 dark:text-red-200">{error}</p>
        <button onClick={() => void load()} className="mt-2 text-red-700 dark:text-red-300 underline">Try again</button>
      </div>
    );
  }
  if (!data) return null;

  const latest = data.series[data.series.length - 1];
  const wow = weekOnWeek(data.series);
  const peak = Math.max(1, ...data.series.map((w) => w.total));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Weekly Meaningful Business Connections</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            Calls, WhatsApp, emails, website clicks, directions, enquiries, bookings and Keeps.
            Page views and signups are not counted.
          </p>
        </div>
        <button onClick={() => void load()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm shrink-0">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex flex-wrap items-baseline gap-4">
          <span className="text-5xl font-bold text-gray-900 dark:text-white tabular-nums">
            {latest?.total ?? 0}
          </span>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            this week, across <strong>{latest?.businesses ?? 0}</strong> business
            {latest?.businesses === 1 ? '' : 'es'}
          </span>
          {wow !== null && wow !== 0 && (
            <span className={`inline-flex items-center gap-1 text-sm font-medium ${wow > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {wow > 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
              {wow > 0 ? '+' : ''}{wow}% on last week
            </span>
          )}
        </div>

        <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{verdict(data.series, data.funnel)}</p>

        {data.series.length > 0 && (
          <div className="mt-5 flex items-end gap-2 h-28">
            {data.series.map((w) => (
              <div key={w.week} className="flex-1 flex flex-col items-center gap-1" title={`${w.week}: ${w.total}`}>
                <div className="w-full rounded-t bg-blue-600 dark:bg-blue-500 min-h-[2px]"
                  style={{ height: `${(w.total / peak) * 100}%` }} />
                <span className="text-[10px] text-gray-500 tabular-nums">{w.week.slice(5)}</span>
              </div>
            ))}
          </div>
        )}

        {latest && latest.total > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(latest.byKind).filter(([, n]) => n > 0).map(([kind, n]) => (
              <span key={kind} className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                {kind} {n}
              </span>
            ))}
          </div>
        )}
      </div>

      {data.syntheticWarning > 0 && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 flex gap-3">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            <strong>{data.syntheticWarning}</strong> listing{data.syntheticWarning === 1 ? ' is' : 's are'} not
            owner-created and unclaimed. Those cannot produce a real connection, and they dilute every
            percentage below.
          </p>
        </div>
      )}

      <div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
          Activation funnel <span className="font-normal text-sm text-gray-500">— {data.businesses} businesses</span>
        </h3>
        <div className="mt-3 space-y-2">
          {data.funnel.map((s) => (
            <div key={s.key} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-gray-900 dark:text-white">{s.label}</span>
                <span className="tabular-nums text-gray-600 dark:text-gray-400 shrink-0">
                  {s.count} <span className="text-gray-400">({s.percent}%)</span>
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div className={`h-full rounded-full ${s.percent === 0 ? 'bg-red-400' : s.percent < 25 ? 'bg-amber-400' : 'bg-blue-600'}`}
                  style={{ width: `${s.percent}%` }} />
              </div>
              {s.percent < 25 && (
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{s.action}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
