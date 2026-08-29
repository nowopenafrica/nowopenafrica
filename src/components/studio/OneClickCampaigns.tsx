import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Rocket, Copy, Download, Send, Save, Trash2, CalendarDays, Sparkles } from 'lucide-react';
import { Business } from '../../types';
import { COPY_GOALS, CopyGoal } from '../../lib/copywriter';
import {
  CampaignPlan, CAMPAIGN_LENGTHS,
  buildCampaign, campaignPlanText, campaignBroadcastText,
  goalLabel, dateLabel, shiftDate, loadCampaigns, saveCampaigns,
} from '../../lib/campaigns';
import { downloadText, slugForFile } from '../../lib/studio';
import { localDateISO } from '../../lib/dates';

interface Props {
  business: Business;
}

export default function OneClickCampaigns({ business }: Props) {
  const [goal, setGoal] = useState<CopyGoal>('weekend-promo');
  const [startDate, setStartDate] = useState(() => localDateISO());
  const [days, setDays] = useState<number>(5);
  const [plan, setPlan] = useState<CampaignPlan | null>(() => buildCampaign(business, 'weekend-promo', localDateISO(), 5));
  const [saved, setSaved] = useState<CampaignPlan[]>(() => loadCampaigns(business.id));
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const generated = useMemo(
    () => buildCampaign(business, goal, startDate, days),
    [business, goal, startDate, days],
  );

  const copy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1200);
    }).catch(() => toast.error('Could not copy — select the text manually.'));
  };

  const regenerate = () => {
    setPlan(buildCampaign(business, goal, startDate, days));
    toast.success(`${goalLabel(goal)} campaign generated`);
  };

  const savePlan = () => {
    const next = [{ ...(plan || generated), id: `${Date.now()}` }, ...saved];
    setSaved(next);
    saveCampaigns(business.id, next);
    toast.success('Campaign saved');
  };

  const removePlan = (id: string) => {
    const next = saved.filter((p) => p.id !== id);
    setSaved(next);
    saveCampaigns(business.id, next);
  };

  const broadcast = () => {
    const text = campaignBroadcastText(plan || generated);
    if (business.phone) {
      const digits = business.phone.replace(/[^\d]/g, '').replace(/^0/, '234');
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank');
    } else toast.success('Copy the broadcast and send it from your phone.');
  };

  const download = () => {
    downloadText(campaignPlanText(plan || generated), `${slugForFile(business.name)}-${goal}-campaign.txt`);
    toast.success('Campaign plan downloaded');
  };

  const active = plan || generated;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Controls */}
      <div className="lg:col-span-2 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Campaign goal</label>
          <div className="grid grid-cols-2 gap-2">
            {COPY_GOALS.map((g) => (
              <button key={g.key} onClick={() => setGoal(g.key)}
                className={`inline-flex items-center text-left px-3 rounded-lg text-xs font-medium border transition ${goal === g.key ? 'border-transparent text-white bg-purple-600' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'} min-h-[44px]`}>
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Length</label>
            <div className="flex gap-2">
              {CAMPAIGN_LENGTHS.map((n) => (
                <button key={n} onClick={() => setDays(n)}
                  className={`flex-1 px-2 rounded-lg text-sm font-bold border transition ${days === n ? 'border-transparent text-white bg-purple-600' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'} min-h-[44px] items-center`}>
                  {n}d
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <button onClick={regenerate} className="w-full inline-flex items-center justify-center gap-2 px-4 rounded-lg text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
            <Rocket size={15} /> Generate one-click campaign
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={savePlan} className="inline-flex items-center justify-center gap-1.5 px-4 rounded-lg text-sm font-medium bg-gray-900 dark:bg-gray-700 text-white hover:opacity-90 transition min-h-[44px]">
              <Save size={14} /> Save
            </button>
            <button onClick={download} className="inline-flex items-center justify-center gap-1.5 px-4 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition min-h-[44px]">
              <Download size={14} /> Download
            </button>
          </div>
          <button onClick={broadcast} className="w-full inline-flex items-center justify-center gap-2 px-4 rounded-lg text-sm font-bold bg-green-600 text-white hover:bg-green-700 transition min-h-[44px]">
            <Send size={14} /> WhatsApp broadcast
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
            <CalendarDays size={13} /> {active.days}-day timeline
          </h4>
            <div className="space-y-1.5">
            {Array.from({ length: active.days }).map((_, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="font-medium text-purple-600 dark:text-purple-400">Day {i + 1}</span>
                <span className="text-gray-500 dark:text-gray-400">{dateLabel(shiftDate(active.startDate, i))}</span>
                <span className="text-gray-700 dark:text-gray-300">{active.steps[i * 5]?.focus}</span>
              </div>
            ))}
          </div>
        </div>

        {saved.length > 0 && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Saved campaigns ({saved.length})</h4>
            <div className="space-y-1.5">
              {saved.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-gray-200">{p.headline}</span>
                  <button onClick={() => setPlan(p)} className="text-purple-600 dark:text-purple-400 hover:underline shrink-0">Load</button>
                  <button onClick={() => removePlan(p.id)} className="text-gray-400 hover:text-red-500 transition shrink-0"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="lg:col-span-3 space-y-4">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">{active.headline}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {active.days} days · {active.steps.length} assets · written from your profile
          </p>
        </div>

        {Array.from({ length: active.days }).map((_, i) => {
          const day = i + 1;
          const steps = active.steps.filter((s) => s.day === day);
          return (
            <div key={day} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
              <div className="px-5 py-3 bg-purple-50 dark:bg-purple-900/20 flex items-center justify-between">
                <span className="text-sm font-bold text-purple-700 dark:text-purple-300">Day {day} — {steps[0]?.focus}</span>
                <span className="text-[11px] text-gray-500 dark:text-gray-400">{dateLabel(shiftDate(active.startDate, day - 1))}</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {steps.map((s) => (
                  <div key={s.id} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-gray-900 dark:text-white">{s.platform} · {s.asset}</span>
                      <button onClick={() => copy(s.id, s.caption)}
                        className="inline-flex items-center gap-1 px-2.5 rounded-lg text-[11px] font-medium bg-blue-600 text-white hover:bg-blue-700 transition min-h-[44px]">
                        {copiedId === s.id ? 'Copied!' : 'Copy'} <Copy size={11} />
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap leading-relaxed max-h-28 overflow-y-auto">{s.caption}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <p className="text-[11px] text-gray-400 flex items-center gap-1">
          <Sparkles size={12} /> Pair each step with a design from the AI Marketing Department or the Flyer Generator — or just copy and post.
        </p>
      </div>
    </div>
  );
}
