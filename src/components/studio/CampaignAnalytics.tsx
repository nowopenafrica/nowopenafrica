import { useMemo } from 'react';
import { TrendingUp, Sparkles, BarChart3, Megaphone, Star, ArrowRight, CalendarDays, Heart, MessageCircle } from 'lucide-react';
import { Business } from '../../types';
import { GrowthPlanModule } from '../../lib/growth';
import { computeAnalytics, Insight } from '../../lib/analytics';

interface Props {
  business: Business;
  onNavigate: (module: GrowthPlanModule) => void;
}

const TONE_STYLES: Record<Insight['tone'], { chip: string; dot: string }> = {
  good: { chip: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300', dot: 'bg-green-500' },
  warn: { chip: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  info: { chip: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
};

export default function CampaignAnalytics({ business, onNavigate }: Props) {
  const snap = useMemo(() => computeAnalytics(business), [business]);
  const circumference = 2 * Math.PI * 54;
  const maxPosts = Math.max(1, ...snap.weeklyActivity.map((w) => w.posts));
  const maxPromos = Math.max(1, ...snap.weeklyActivity.map((w) => w.promos));
  const maxChannels = Math.max(1, ...snap.postsByPlatform.map((c) => c.published + c.planned));
  const hasChannels = snap.postsByPlatform.length > 0;

  const rs = snap.reviewStats;
  const sentimentTotal = Math.max(1, rs.positive + rs.neutral + rs.negative);

  return (
    <div className="space-y-5">
      {/* Marketing Health Score + insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Score */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp size={16} className="text-purple-600 dark:text-purple-400" /> Marketing Health Score
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{snap.scoreLabel} — how active your marketing is right now.</p>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-4">
            <div className="relative w-28 h-28 shrink-0">
              <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
                <circle cx="64" cy="64" r="54" fill="none" strokeWidth="12" className="stroke-gray-100 dark:stroke-gray-700" />
                <circle cx="64" cy="64" r="54" fill="none" strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - (snap.score / 100) * circumference}
                  className="stroke-purple-500 transition-all duration-700" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-gray-900 dark:text-white">{snap.score}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">/ 100</span>
              </div>
            </div>

            <div className="flex-1 space-y-2">
              {snap.scoreItems.map((i) => (
                <div key={i.label}>
                  <div className="flex items-center justify-between text-[11px] font-medium text-gray-600 dark:text-gray-300">
                    <span>{i.label}</span>
                    <span className="text-gray-400">{i.earned}/{i.max}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-700"
                      style={{ width: `${(i.earned / i.max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-gray-50 dark:bg-gray-900 p-4 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
            Score = content cadence (30) + promotion activity (25) + reviews & reputation (25) + loyalty audience (20). Every point links to the module that improves it.
          </div>
        </div>

        {/* Insights */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles size={16} className="text-purple-600 dark:text-purple-400" /> What to do next
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Instant, rule-based recommendations from your data.</p>
          <div className="mt-4 space-y-2.5">
            {snap.insights.map((insight, i) => {
              const style = TONE_STYLES[insight.tone];
              return (
                <button key={i} onClick={() => onNavigate(insight.module)}
                  className="w-full text-left flex items-start gap-3 px-3.5 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{insight.tip}</span>
                    <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-400">
                      Open module <ArrowRight size={10} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Weekly activity + channels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <BarChart3 size={16} className="text-purple-600 dark:text-purple-400" /> Weekly activity
            </h3>
            <div className="flex items-center gap-3 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" /> Posts</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Promos</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Published posts vs promo launches, last 8 weeks.</p>
          <div className="flex items-end justify-between gap-2 h-36">
            {snap.weeklyActivity.map((w) => (
              <div key={w.week} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="flex items-end justify-center gap-1 w-full flex-1">
                  <div className="w-2.5 rounded-t bg-purple-500 transition-all duration-500"
                    style={{ height: `${(w.posts / maxPosts) * 100}%` }} title={`${w.posts} posts`} />
                  <div className="w-2.5 rounded-t bg-amber-500 transition-all duration-500"
                    style={{ height: `${(w.promos / maxPromos) * 100}%` }} title={`${w.promos} promos`} />
                </div>
                <span className="text-[9px] text-gray-400">{w.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CalendarDays size={16} className="text-purple-600 dark:text-purple-400" /> Content by platform
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Everything planned vs published, from your Content Planner.</p>
          {!hasChannels ? (
            <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center">
              <CalendarDays size={20} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
              <p className="text-xs text-gray-500 dark:text-gray-400">No content planned yet. Add a week in the Content Planner and watch this chart come alive.</p>
              <button onClick={() => onNavigate('planner')} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 transition">
                Open Content Planner <ArrowRight size={12} />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {snap.postsByPlatform.map((c) => (
                <div key={c.platform}>
                  <div className="flex items-center justify-between text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                    <span>{c.platform}</span>
                    <span className="text-gray-400">
                      <span className="text-purple-600 dark:text-purple-400">{c.published} published</span>
                      {c.planned > 0 && <span> · {c.planned} planned</span>}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden flex">
                    <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${(c.published / maxChannels) * 100}%` }} />
                    {c.planned > 0 && (
                      <div className="h-full bg-gray-300 dark:bg-gray-500 transition-all duration-500" style={{ width: `${(c.planned / maxChannels) * 100}%` }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Promo + reviews + loyalty */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Promo snapshot */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Megaphone size={16} className="text-purple-600 dark:text-purple-400" /> Promotions
            </h3>
            <button onClick={() => onNavigate('live-promo')} className="text-[11px] font-medium text-purple-600 dark:text-purple-400 hover:underline">
              Manage
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {([
              ['Live now', snap.promoStats.live, 'text-green-600 dark:text-green-400'],
              ['Scheduled', snap.promoStats.scheduled, 'text-amber-600 dark:text-amber-400'],
              ['Ended', snap.promoStats.ended, 'text-gray-500 dark:text-gray-400'],
              ['Shared', snap.promoStats.shared, 'text-blue-600 dark:text-blue-400'],
            ] as [string, number, string][]).map(([label, value, color]) => (
              <div key={label} className="rounded-xl bg-gray-50 dark:bg-gray-900 p-3 text-center">
                <p className={`text-xl font-black ${color}`}>{value}</p>
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-3">{snap.promoStats.total} promotion{snap.promoStats.total === 1 ? '' : 's'} tracked in the Live Promotion Center.</p>
        </div>

        {/* Review sentiment */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Star size={16} className="text-purple-600 dark:text-purple-400" /> Review sentiment
            </h3>
            <button onClick={() => onNavigate('home')} className="text-[11px] font-medium text-purple-600 dark:text-purple-400 hover:underline">
              Manage
            </button>
          </div>
          <div className="flex items-end gap-2 mt-3">
            <p className="text-3xl font-black text-gray-900 dark:text-white">{rs.avg || '—'}</p>
            <div className="flex gap-0.5 pb-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={13} className={i < Math.round(rs.avg) ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'} />
              ))}
            </div>
            <p className="pb-1 ml-auto text-xs text-gray-400">{rs.total} review{rs.total === 1 ? '' : 's'}</p>
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden flex">
            <div className="h-full bg-green-500" style={{ width: `${(rs.positive / sentimentTotal) * 100}%` }} />
            <div className="h-full bg-gray-400" style={{ width: `${(rs.neutral / sentimentTotal) * 100}%` }} />
            <div className="h-full bg-red-500" style={{ width: `${(rs.negative / sentimentTotal) * 100}%` }} />
          </div>
          <div className="flex justify-between text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-1.5">
            <span className="text-green-600 dark:text-green-400">{rs.positive} positive</span>
            <span>{rs.neutral} neutral</span>
            <span className="text-red-500">{rs.negative} negative</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">{rs.responded} of {rs.total} review{rs.total === 1 ? '' : 's'} responded to.</p>
        </div>

        {/* Loyalty snapshot */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Heart size={16} className="text-purple-600 dark:text-purple-400" /> Loyalty
            </h3>
            <button onClick={() => onNavigate('loyalty')} className="text-[11px] font-medium text-purple-600 dark:text-purple-400 hover:underline">
              Manage
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {([
              ['Members', snap.loyalty.members, 'text-purple-600 dark:text-purple-400'],
              ['Active (30d)', snap.loyalty.active, 'text-green-600 dark:text-green-400'],
              ['Visits', snap.loyalty.visits, 'text-blue-600 dark:text-blue-400'],
              ['Rewards redeemed', snap.loyalty.redemptions, 'text-red-600 dark:text-red-400'],
            ] as [string, number, string][]).map(([label, value, color]) => (
              <div key={label} className="rounded-xl bg-gray-50 dark:bg-gray-900 p-3 text-center">
                <p className={`text-xl font-black ${color}`}>{value}</p>
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-3">Repeat customers tracked in your Loyalty Hub.</p>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <MessageCircle size={12} /> Analytics reads your Content Planner, Live Promotion Center, Review Manager, Loyalty Hub and campaign drafts — all stored on this device.
      </p>
    </div>
  );
}
