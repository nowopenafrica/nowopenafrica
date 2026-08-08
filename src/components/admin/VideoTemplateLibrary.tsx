import { useMemo, useState } from 'react';
import { Crown, Rocket, LayoutTemplate, ArrowRight } from 'lucide-react';
import { VIDEO_INDUSTRIES, industryKeyForCategory, type VideoIndustry } from '../../lib/videoCreator';
import { marketplaceCatalog } from '../../lib/campaignMarketplace';

// The Video Template Library (#16) — ready-made, editable promo templates per
// industry, straight from the real campaign-marketplace data the Studio uses:
// restaurant, salon, hotel, real estate and every industry the platform serves.
// Pick an industry, browse its packs, and hand one to the AI Video Studio.

interface Props {
  onOpenSection?: (id: string) => void;
}

export default function VideoTemplateLibrary({ onOpenSection }: Props) {
  const [industry, setIndustry] = useState<string>(industryKeyForCategory('Restaurant'));
  const packs = useMemo(() => {
    const all = marketplaceCatalog();
    const byIndustry = all.filter((p) => p.industryKey === industry);
    return byIndustry.length > 0 ? byIndustry : all;
  }, [industry]);

  const current = VIDEO_INDUSTRIES.find((i) => i.key === industry) as VideoIndustry;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center shrink-0">
              <LayoutTemplate size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Template library — {current.label}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {current.promote.length} promo angles · {current.hashtags.length} hashtag sets · full colour palette ready.
              </p>
            </div>
          </div>
          <select value={industry} onChange={(e) => setIndustry(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm">
            {VIDEO_INDUSTRIES.map((i) => <option key={i.key} value={i.key}>{i.emoji} {i.label}</option>)}
          </select>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-900 p-4 text-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Promo angles</p>
            <div className="flex flex-wrap gap-1.5">
              {current.promote.map((p) => <span key={p} className="px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-900/30 text-[10px] font-medium text-cyan-700 dark:text-cyan-300">{p}</span>)}
            </div>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-900 p-4 text-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Story hooks & hashtags</p>
            <div className="flex flex-wrap gap-1.5">
              {current.hooks.map((h) => <span key={h} className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-[10px] font-medium text-blue-700 dark:text-blue-300">“{h}”</span>)}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {current.hashtags.map((h) => <span key={h} className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-[10px] font-semibold text-gray-600 dark:text-gray-300">{h}</span>)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {packs.map((p) => (
          <div key={p.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 flex flex-col">
            <div className="flex items-start justify-between">
              <span className="text-3xl">{p.emoji}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${p.tier === 'pro' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'}`}>
                {p.tier === 'pro' ? <Crown size={10} /> : null} {p.tier}
              </span>
            </div>
            <h4 className="mt-3 text-sm font-bold text-gray-900 dark:text-white">{p.title}</h4>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed flex-1">{p.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-[10px] font-semibold text-gray-600 dark:text-gray-300">{p.durationDays} days</span>
              <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-[10px] font-semibold text-gray-600 dark:text-gray-300">{p.channels.join(', ')}</span>
            </div>
            <button onClick={() => onOpenSection?.('video-studio')}
              className="mt-4 inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 transition">
              <Rocket size={13} /> Produce in AI Video Studio <ArrowRight size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
