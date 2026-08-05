import { useMemo } from 'react';
import { Check, AlertCircle, Lightbulb, TrendingUp } from 'lucide-react';
import { Business } from '../../types';
import { BrandIdentity } from '../../lib/brandIdentity';
import { computeBrandHealth } from '../../lib/brandHealth';

interface Props {
  business: Business;
  identity: BrandIdentity;
}

export default function BrandHealthPanel({ business, identity }: Props) {
  const health = useMemo(() => computeBrandHealth(business, identity), [business, identity]);
  const { score, items, suggestions } = health;
  const color = score >= 80 ? '#059669' : score >= 60 ? '#d97706' : '#dc2626';
  const label = score >= 80 ? 'Strong' : score >= 60 ? 'Good' : 'Needs work';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Score ring */}
      <div className="lg:col-span-2 flex flex-col items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-6">
        <div className="relative w-36 h-36 rounded-full flex items-center justify-center" style={{ background: `conic-gradient(${color} ${score * 3.6}deg, #e5e7eb 0deg)` }}>
          <div className="absolute inset-2 rounded-full bg-white dark:bg-gray-900 flex flex-col items-center justify-center">
            <p className="text-4xl font-black" style={{ color }}>{score}%</p>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{label}</p>
          </div>
        </div>
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <TrendingUp size={13} /> Each recommendation below earns points
        </p>
      </div>

      {/* Score breakdown */}
      <div className="lg:col-span-3 space-y-2">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
            {it.ok
              ? <Check size={15} className="text-green-600 dark:text-green-400 flex-shrink-0" />
              : it.partial
                ? <AlertCircle size={15} className="text-amber-500 flex-shrink-0" />
                : <AlertCircle size={15} className="text-red-500 flex-shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{it.label}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{it.detail}</p>
            </div>
            <span className={`text-xs font-bold flex-shrink-0 ${it.ok ? 'text-green-600 dark:text-green-400' : it.partial ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
              {it.earned}/{it.total}
            </span>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      <div className="lg:col-span-5">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb size={16} className="text-purple-600 dark:text-purple-400" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">AI Recommendations — grow your score</h3>
        </div>
        {suggestions.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-4">Perfect score — nothing to improve right now.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {suggestions.map((s) => (
              <div key={s.label} className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.label}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{s.action} — {s.impact}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full flex-shrink-0">
                  +{s.points}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
