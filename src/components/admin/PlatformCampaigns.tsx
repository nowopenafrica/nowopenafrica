import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Rocket, Plus, Trash2, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { NOWOPEN_ORG_ID } from '../../lib/workforce';
import {
  CAMPAIGN_STATUS_LABELS, mapCampaignRow, advanceStatus,
  campaignWindowLabel, nextStep, summarizeCampaigns, CAMPAIGNS_SEED,
  type CampaignItem,
} from '../../lib/osCampaigns';

// The Campaign Factory's platform ledger (#6, group Produce): platform-wide
// campaigns (Africa is NowOpen, Restaurant Week, Tailor Week) moved through
// idea → planning → in_build → live → wrapped. Status on the row is the truth;
// performance is intentionally never faked — it comes from real platform data.
// Rows live in os_campaigns; the panel falls back to the bundled seed (clearly
// labelled) until the migration is applied, same honest-fallback pattern as the
// rest of the OS. The per-business Campaign Manager below stays as-is.

export default function PlatformCampaigns() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [name, setName] = useState('');
  const [focus, setFocus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('os_campaigns')
        .select('*')
        .eq('org_id', NOWOPEN_ORG_ID);
      const rows = (data ?? []) as unknown[];
      if (error || rows.length === 0) throw new Error('os_campaigns unavailable');
      setCampaigns(rows.map((r) => mapCampaignRow(r as Parameters<typeof mapCampaignRow>[0])));
      setUsingFallback(false);
    } catch {
      setCampaigns(CAMPAIGNS_SEED);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => summarizeCampaigns(campaigns), [campaigns]);

  const slugify = (value: string): string =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `campaign-${Date.now()}`;

  const add = async () => {
    if (!name.trim()) { toast.error('Give the campaign a name.'); return; }
    const fresh: CampaignItem = {
      id: usingFallback ? `seed-local-${Date.now()}` : 'pending',
      org_id: NOWOPEN_ORG_ID,
      slug: slugify(name),
      name: name.trim(),
      focus: focus.trim() || 'TBA',
      audience: '',
      channels: [],
      status: 'idea',
      starts_at: null,
      ends_at: null,
      created_at: new Date().toISOString(),
    };
    if (usingFallback) {
      setCampaigns((list) => [fresh, ...list]);
      setName(''); setFocus('');
      toast.success(`Campaign "${fresh.name}" added for this session. Apply the os_campaigns migration to persist.`);
      return;
    }
    try {
      const { error } = await supabase.from('os_campaigns').insert({
        org_id: NOWOPEN_ORG_ID,
        slug: fresh.slug,
        name: fresh.name,
        focus: fresh.focus,
      });
      if (error) throw error;
      toast.success(`Campaign "${fresh.name}" opened on the platform ledger.`);
      setName(''); setFocus('');
      void load();
    } catch {
      toast.error('Could not save — os_campaigns needs admin permissions and the migration to exist.');
    }
  };

  const advance = async (c: CampaignItem) => {
    const next = advanceStatus(c.status);
    if (next === c.status) { toast('The campaign is already wrapped.'); return; }
    if (usingFallback) {
      setCampaigns((list) => list.map((x) => (x.id === c.id ? { ...x, status: next } : x)));
      return;
    }
    try {
      const { error } = await supabase.from('os_campaigns').update({ status: next, updated_at: new Date().toISOString() }).eq('id', c.id);
      if (error) throw error;
      void load();
    } catch {
      toast.error('Could not save the status — admin permissions needed.');
    }
  };

  const remove = async (id: string) => {
    if (usingFallback) {
      setCampaigns((list) => list.filter((c) => c.id !== id));
      return;
    }
    try {
      const { error } = await supabase.from('os_campaigns').delete().eq('id', id);
      if (error) throw error;
      void load();
    } catch {
      toast.error('Could not delete — admin permissions needed.');
    }
  };

  const toneFor = (c: CampaignItem): string => {
    if (c.status === 'live') return 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400';
    if (c.status === 'in_build') return 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
    if (c.status === 'planning') return 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
    if (c.status === 'wrapped') return 'bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400';
    return 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Rocket size={16} className="text-orange-500" />
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Platform campaigns</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Campaigns on the ledger', value: summary.total, tone: 'text-gray-900 dark:text-white' },
          { label: 'Live now', value: summary.live, tone: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'In build', value: summary.inBuild, tone: 'text-orange-600 dark:text-orange-400' },
          { label: 'Wrapped', value: summary.wrapped, tone: 'text-violet-600 dark:text-violet-400' },
        ].map(({ label, value, tone }) => (
          <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <span className={`text-xl font-bold ${tone}`}>{value}</span>
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {usingFallback && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
          Demo platform ledger — the os_campaigns migration isn't applied in this project yet. Changes are kept for this
          session; once it runs, campaigns come from the database and statuses persist.
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Open a platform campaign</h3>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,auto] gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name…"
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Focus (e.g. Open every business on the map)…"
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <button onClick={() => void add()} className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition">
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={18} className="animate-spin mr-2" /> Loading the platform ledger…
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => (
            <div key={c.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300 flex items-center justify-center shrink-0">
                  <Rocket size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{c.name}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{c.focus} · {campaignWindowLabel(c)}</p>
                  {c.audience && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">For {c.audience}</p>}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${toneFor(c)}`}>
                  {CAMPAIGN_STATUS_LABELS[c.status]}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => void advance(c)} aria-label={`Advance ${c.name}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition">
                    Next <ArrowRight size={11} />
                  </button>
                  <button aria-label={`Remove ${c.name}`} onClick={() => void remove(c.id)} className="text-gray-300 hover:text-rose-500 transition"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {c.channels.map((ch) => (
                  <span key={ch} className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-[10px] font-medium text-gray-500 dark:text-gray-400">{ch}</span>
                ))}
                <span className="text-[11px] text-gray-400 dark:text-gray-500">Next: {nextStep(c)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
