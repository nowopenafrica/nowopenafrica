import { useState } from 'react';
import toast from 'react-hot-toast';
import { Crown, Rocket, Tags } from 'lucide-react';
import { Business } from '../../types';
import { packsForIndustry, launchPack } from '../../lib/campaignMarketplace';
import { VIDEO_INDUSTRIES, industryKeyForCategory } from '../../lib/videoCreator';

interface Props {
  business: Business;
}

export default function CampaignMarketplace({ business }: Props) {
  const [industry, setIndustry] = useState(industryKeyForCategory(business.category));
  const packs = packsForIndustry(industry).sort((a, b) => a.tier === 'free' ? -1 : b.tier === 'free' ? 1 : 0);

  const launch = (packId: string) => {
    const pack = packs.find((p) => p.id === packId);
    if (!pack) return;
    const plan = launchPack(business, pack, new Date().toISOString().slice(0, 10));
    toast.success(`Campaign launched: ${plan.headline} — ${plan.steps.length} posts ready`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center">
            <Rocket size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Campaign Marketplace</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Ready-made multi-day campaigns, curated per industry.</p>
          </div>
        </div>
        <select value={industry} onChange={(e) => setIndustry(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm">
          {VIDEO_INDUSTRIES.map((i) => <option key={i.key} value={i.key}>{i.emoji} {i.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {packs.map((p) => (
          <div key={p.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 flex flex-col">
            <div className="flex items-start justify-between">
              <span className="text-3xl">{p.emoji}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${p.tier === 'pro'
                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'}`}>
                {p.tier === 'pro' ? <Crown size={10} /> : null} {p.tier}
              </span>
            </div>
            <h4 className="mt-3 text-sm font-bold text-gray-900 dark:text-white">{p.title}</h4>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed flex-1">{p.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-[10px] font-semibold text-gray-600 dark:text-gray-300">{p.durationDays} days</span>
              <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-[10px] font-semibold text-gray-600 dark:text-gray-300">{p.channels.length} channels</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
              <Tags size={11} /> {p.tags.slice(0, 3).join(' · ')}
            </div>
            <button onClick={() => launch(p.id)}
              className="mt-4 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 transition">
              <Rocket size={13} /> Launch campaign
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
