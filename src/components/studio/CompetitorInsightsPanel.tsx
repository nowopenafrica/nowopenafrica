import { Crown, Eye, TrendingUp } from 'lucide-react';
import { Business } from '../../types';
import { competitorInsights } from '../../lib/competitorInsights';

interface Props {
  business: Business;
}

function scoreBar(width: number, color: string): string {
  return width > 0 ? `bg-gradient-to-r ${color}` : 'bg-gray-200 dark:bg-gray-700';
}

export default function CompetitorInsightsPanel({ business }: Props) {
  const insights = competitorInsights(business);
  const premium = business.verification_tier === 'premium';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-white flex items-center justify-center">
            <Eye size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Competitor Insights</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Benchmark vs local {insights.average.categoryLabel.toLowerCase()} competitors.</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold ${premium
          ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
          <Crown size={13} /> {premium ? 'Premium active' : 'Premium'}
        </span>
      </div>

      {!premium && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-800 dark:text-amber-200">
          <span className="font-bold">Premium feature.</span> Upgrade your plan to unlock full competitor benchmarking, gap analysis and rank tracking. Here is a free preview.
        </div>
      )}

      {/* Rank + average */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Your rank</p>
          <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">#{insights.rank}<span className="text-sm font-medium text-gray-400"> of 4</span></p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">vs 3 local competitors</p>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Market average</p>
          <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{insights.average.score}<span className="text-sm font-medium text-gray-400">/100</span></p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{insights.average.followers.toLocaleString()} followers · {insights.average.rating}★</p>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Your score</p>
          <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{insights.businessScore}<span className="text-sm font-medium text-gray-400">/100</span></p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{insights.businessFollowers.toLocaleString()} followers · {insights.businessRating}★</p>
        </div>
      </div>

      {/* Competitor list */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Competitors in {business.location || 'your area'}</h4>
        <div className="space-y-3">
          {[insights.average, ...insights.competitors].map((c) => (
            <div key={c.name} className="flex items-center gap-3">
              <span className="text-xl">{c.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-900 dark:text-white">{c.name}</span>
                  <span className="text-gray-500 dark:text-gray-400">{c.score}/100 · {c.followers.toLocaleString()} followers · {c.rating}★</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div className={`h-full rounded-full ${scoreBar(c.score, c.name === 'Market average' ? 'from-slate-400 to-slate-500' : 'from-purple-500 to-fuchsia-500')}`}
                    style={{ width: `${c.score}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gaps */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
          <TrendingUp size={15} className="text-purple-500" /> Biggest gaps to close
        </h4>
        <ul className="space-y-3">
          {insights.gaps.map((g) => (
            <li key={g.label} className="rounded-xl bg-gray-50 dark:bg-gray-900/40 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{g.label}</span>
                <span className="text-xs font-bold text-red-500">-{g.gap}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{g.tip}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
