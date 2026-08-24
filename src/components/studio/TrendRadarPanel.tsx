import { useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Flame, Radio, RefreshCw } from 'lucide-react';
import { Business } from '../../types';
import { trendRadarFor } from '../../lib/trendRadar';
import { TREND_MARKETS } from '../../lib/videoCreator';

interface Props {
  business: Business;
}

const copy = (text: string, message: string) => {
  navigator.clipboard?.writeText(text).then(() => toast.success(message)).catch(() => toast.error('Could not copy — select the text manually.'));
};

export default function TrendRadarPanel({ business }: Props) {
  const [market, setMarket] = useState(() => trendRadarFor(business).market);
  const radar = trendRadarFor(business, { market });

  return (
    <div className="space-y-5">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 text-white flex items-center justify-center">
            <Radio size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">AI Trend Radar</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Trending {radar.flag} {radar.marketLabel} · {radar.industryEmoji} {radar.industryLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={market} onChange={(e) => setMarket(e.target.value)}
            className="inline-flex items-center px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]">
            {TREND_MARKETS.map((m) => <option key={m.key} value={m.key}>{m.flag} {m.label}</option>)}
          </select>
          <button onClick={() => setMarket(market)}
            className="inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition min-h-[44px]">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Best trend hero */}
      <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/40 dark:to-orange-950/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{radar.best.emoji}</span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-red-500 dark:text-red-400">Top opportunity · {radar.best.score}/100</p>
              <h4 className="text-lg font-bold text-gray-900 dark:text-white">{radar.best.topic}</h4>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-500 text-white">
            <Flame size={13} /> Hottest now
          </span>
        </div>
        <p className="mt-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{radar.best.suggestedPost}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => copy(radar.best.suggestedPost, 'Post copied')}
            className="inline-flex items-center gap-1.5 px-3.5 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition min-h-[44px]">
            <Copy size={13} /> Copy post
          </button>
          <button onClick={() => copy(radar.best.suggestedReel, 'Reel idea copied')}
            className="inline-flex items-center gap-1.5 px-3.5 rounded-lg text-xs font-semibold border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition min-h-[44px]">
            <Copy size={13} /> Copy reel idea
          </button>
        </div>
      </div>

      {/* Trend list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {radar.trends.slice(1).map((t) => (
          <div key={t.topic} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{t.emoji}</span>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">{t.topic}</h4>
              </div>
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{t.score}/100</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400" style={{ width: `${t.score}%` }} />
            </div>
            <p className="mt-2.5 text-xs text-gray-500 dark:text-gray-400">{t.fit}</p>
            <button onClick={() => copy(t.suggestedPost, 'Post copied')}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-500 dark:text-red-400 hover:underline">
              <Copy size={11} /> Copy suggested post
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
