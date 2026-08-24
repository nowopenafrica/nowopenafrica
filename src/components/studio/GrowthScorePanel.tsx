import { useState } from 'react';
import { ArrowRight, Gauge } from 'lucide-react';
import { Business } from '../../types';
import { marketingHealth } from '../../lib/marketingHealth';
import { GrowthPlanModule } from '../../lib/growth';
import CompetitorInsightsPanel from './CompetitorInsightsPanel';

interface Props {
  business: Business;
  onNavigate: (module: GrowthPlanModule) => void;
}

export default function GrowthScorePanel({ business, onNavigate }: Props) {
  const health = marketingHealth(business);
  const [openDim, setOpenDim] = useState(health.weakest?.key ?? '');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-teal-500 text-white flex items-center justify-center">
          <Gauge size={18} />
        </div>
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Business Growth Score</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">11 dimensions that decide how fast your business grows.</p>
        </div>
      </div>

      {/* Overall */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-gray-200 dark:stroke-gray-700" />
                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" stroke="url(#growGrad)" strokeLinecap="round"
                  strokeDasharray={`${health.score}, 100`} />
                <defs>
                  <linearGradient id="growGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#22c55e" />
                    <stop offset="100%" stopColor="#14b8a6" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">{health.score ?? '—'}</span>
                <span className="text-[10px] text-gray-400">{health.score === null ? 'no data' : '/ 100'}</span>
              </div>
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{health.label}</p>
              {/* Only ever names a measured dimension. This used to point at
                  whichever seeded number happened to be smallest. */}
              {health.weakest && health.strongest ? (
                <>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Weakest: {health.weakest.emoji} {health.weakest.label} · Strongest: {health.strongest.emoji} {health.strongest.label}
                  </p>
                  <button onClick={() => setOpenDim(health.weakest!.key)}
                    className="mt-2 inline-flex items-center gap-1 min-h-[44px] text-xs font-semibold text-green-600 dark:text-green-400 hover:underline">
                    Focus on your biggest opportunity <ArrowRight size={12} />
                  </button>
                </>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Publish a post, add an offer or collect a review and this starts scoring.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Dimensions */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {health.dimensions.map((d) => {
            const open = openDim === d.key;
            return (
              <div key={d.key}
                className={`rounded-xl border p-3.5 transition ${open
                  ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/30'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40'}`}>
                <button onClick={() => setOpenDim(open ? '' : d.key)} className="w-full text-left">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-900 dark:text-white">{d.emoji} {d.label}</span>
                    {d.score === null
                      ? <span className="font-medium text-gray-400 dark:text-gray-500">Not tracked yet</span>
                      : <span className="font-bold text-gray-600 dark:text-gray-300 tabular-nums">{d.score}/100</span>}
                  </div>
                  {d.score !== null && (
                    <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div className={`h-full rounded-full ${d.score >= 70 ? 'bg-green-500' : d.score >= 45 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${d.score}%` }} />
                    </div>
                  )}
                </button>
                {open && (
                  <div className="mt-2.5 space-y-2">
                    <p className="text-xs text-gray-600 dark:text-gray-300">{d.detail}</p>
                    <p className="text-xs text-green-700 dark:text-green-400">{d.tip}</p>
                    <button onClick={() => onNavigate(d.module)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400 hover:underline">
                      Fix in {d.label} <ArrowRight size={11} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
        <CompetitorInsightsPanel business={business} />
      </div>
    </div>
  );
}
