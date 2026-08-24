import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Users, Plus, Trash2, Rocket, Crown, Building2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { NOWOPEN_ORG_ID } from '../../lib/workforce';
import { marketplaceCatalog, industryLabelFor } from '../../lib/campaignMarketplace';
import {
  PARTNER_STAGES, PARTNER_TYPES, mapPartnerRow, advanceStage, summarizePartners,
  PARTNERS_SEED, type PartnerItem, type PartnerStage,
} from '../../lib/partners';

// The Partnership CRM (#11) — investors, media, government, creators, agencies,
// sponsors and universities, moved through a proposal → negotiation → active →
// alumni pipeline. Rows live in os_partners; the section falls back to the
// bundled seed (clearly labelled) until the migration is applied, same
// honest-fallback pattern as the rest of the OS. The Campaign packs tab
// reuses the real marketplace data for launching together.

const STAGE_TONE: Record<PartnerStage, string> = {
  Proposal: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300',
  Negotiation: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300',
  Active: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300',
  Alumni: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
};

export default function PartnershipCrm() {
  const [tab, setTab] = useState<'Pipeline' | 'Campaign packs'>('Pipeline');
  const [partners, setPartners] = useState<PartnerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<string>(PARTNER_TYPES[0]);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('os_partners')
        .select('*')
        .eq('org_id', NOWOPEN_ORG_ID);
      const rows = (data ?? []) as unknown[];
      if (error || rows.length === 0) throw new Error('os_partners unavailable');
      setPartners(rows.map((r) => mapPartnerRow(r as Parameters<typeof mapPartnerRow>[0])));
      setUsingFallback(false);
    } catch {
      setPartners(PARTNERS_SEED);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => summarizePartners(partners), [partners]);

  const byStage = useMemo(
    () => Object.fromEntries(PARTNER_STAGES.map((s) => [s, partners.filter((p) => p.stage === s)])) as Record<PartnerStage, PartnerItem[]>,
    [partners],
  );

  const packs = useMemo(() => marketplaceCatalog().slice(0, 12), []);

  const add = async () => {
    if (!name.trim()) { toast.error('Give the partner a name.'); return; }
    if (usingFallback) {
      const fresh: PartnerItem = {
        id: `seed-local-${Date.now()}`,
        org_id: NOWOPEN_ORG_ID,
        name: name.trim(),
        type,
        note: note.trim(),
        stage: 'Proposal',
        created_at: new Date().toISOString(),
      };
      setPartners((list) => [fresh, ...list]);
      setName(''); setNote('');
      toast.success(`${name.trim()} added to the pipeline for this session. Apply the os_partners migration to persist.`);
      return;
    }
    try {
      const { error } = await supabase.from('os_partners').insert({
        org_id: NOWOPEN_ORG_ID,
        name: name.trim(),
        type,
        note: note.trim(),
        stage: 'Proposal',
      });
      if (error) throw error;
      toast.success(`${name.trim()} added to the pipeline.`);
      setName(''); setNote('');
      void load();
    } catch {
      toast.error('Could not save — os_partners needs admin permissions and the migration to exist.');
    }
  };

  const move = async (id: string, dir: 1 | -1) => {
    if (usingFallback) {
      setPartners((list) => list.map((p) => (p.id === id ? { ...p, stage: advanceStage(p.stage, dir) } : p)));
      return;
    }
    try {
      const current = partners.find((p) => p.id === id);
      if (!current) return;
      const { error } = await supabase.from('os_partners')
        .update({ stage: advanceStage(current.stage, dir), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      void load();
    } catch {
      toast.error('Could not move the partner — admin permissions needed.');
    }
  };

  const remove = async (id: string) => {
    if (usingFallback) {
      setPartners((list) => list.filter((p) => p.id !== id));
      return;
    }
    try {
      const { error } = await supabase.from('os_partners').delete().eq('id', id);
      if (error) throw error;
      void load();
    } catch {
      toast.error('Could not delete — admin permissions needed.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(['Pipeline', 'Campaign packs'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-semibold border transition ${tab === t ? 'border-transparent text-white bg-purple-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'} min-h-[44px]`}>
            {t === 'Pipeline' ? <Users size={13} /> : <Rocket size={13} />} {t}
          </button>
        ))}
      </div>

      {tab === 'Pipeline' ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total partners', value: summary.total, tone: 'text-gray-900 dark:text-white' },
              { label: 'Active now', value: summary.active, tone: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'In negotiation', value: summary.perStage.Negotiation, tone: 'text-amber-600 dark:text-amber-400' },
              { label: 'Past partners', value: summary.perStage.Alumni, tone: 'text-gray-500 dark:text-gray-400' },
            ].map(({ label, value, tone }) => (
              <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                <span className={`text-xl font-bold ${tone}`}>{value}</span>
                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {usingFallback && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
              Demo partner pipeline — the os_partners migration isn't applied in this project yet. Changes are kept for
              this session; once it runs, partners come from the database and stages persist.
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Add a partner</h3>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr,auto] gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Organisation name…"
                className="inline-flex items-center px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="inline-flex items-center px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm min-h-[44px]">
                {PARTNER_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What are we working on…"
                className="inline-flex items-center px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
              <button onClick={() => void add()} className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-purple-600 text-white px-4 rounded-lg hover:bg-purple-700 transition min-h-[44px]">
                <Plus size={15} /> Add
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 size={18} className="animate-spin mr-2" /> Loading the pipeline…
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {PARTNER_STAGES.map((s) => (
                <div key={s} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${STAGE_TONE[s]}`}>{s}</span>
                    <span className="text-xs text-gray-400 font-bold">{byStage[s].length}</span>
                  </div>
                  <div className="mt-3 space-y-2 min-h-[120px]">
                    {byStage[s].length === 0 && <p className="text-[11px] text-gray-400 py-6 text-center">Empty</p>}
                    {byStage[s].map((p) => (
                      <div key={p.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{p.name}</p>
                          <button aria-label={`Remove ${p.name}`} onClick={() => void remove(p.id)} className="inline-flex items-center justify-center w-[44px] h-[44px] rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 shrink-0"><Trash2 size={12} /></button>
                        </div>
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{p.type}</span>
                        {p.note && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 leading-snug">{p.note}</p>}
                        <div className="mt-2 flex items-center gap-1">
                          <button aria-label={`Move ${p.name} back`} onClick={() => void move(p.id, -1)} disabled={s === 'Proposal'}
                            className="inline-flex items-center px-1.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-600 min-h-[44px]">←</button>
                          <button aria-label={`Move ${p.name} forward`} onClick={() => void move(p.id, 1)} disabled={s === 'Alumni'}
                            className="inline-flex items-center px-1.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-600 min-h-[44px]">→</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
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
                <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-[10px] font-semibold text-gray-600 dark:text-gray-300">{industryLabelFor(p.industryKey)}</span>
                <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-[10px] font-semibold text-gray-600 dark:text-gray-300">{p.durationDays} days</span>
              </div>
              <button onClick={() => toast.success(`Launch agreed for ${p.title} — pitch it to an Active partner first.`)}
                className="mt-4 inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition min-h-[44px]">
                <Building2 size={13} /> Propose to a partner
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
