import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Users, Plus, Trash2, Rocket, Crown, Building2 } from 'lucide-react';
import { marketplaceCatalog, industryLabelFor } from '../../lib/campaignMarketplace';

// The Partnership CRM (#11) — investors, media, government, creators, agencies,
// sponsors and universities, moved through a proposal → negotiation → active →
// alumni pipeline. Persists locally until the backend table ships; the
// Campaign packs tab reuses the real marketplace data for launching together.

type Stage = 'Proposal' | 'Negotiation' | 'Active' | 'Alumni';

const STAGES: Stage[] = ['Proposal', 'Negotiation', 'Active', 'Alumni'];

const PARTNER_TYPES = ['Investor', 'Media', 'Government', 'Creator', 'Agency', 'Sponsor', 'University'];

interface Partner {
  id: string;
  name: string;
  type: string;
  note: string;
  stage: Stage;
  createdAt: string;
}

const KEY = 'nowopen_partners_v1';

const STAGE_TONE: Record<Stage, string> = {
  Proposal: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300',
  Negotiation: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300',
  Active: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300',
  Alumni: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
};

export default function PartnershipCrm() {
  const [tab, setTab] = useState<'Pipeline' | 'Campaign packs'>('Pipeline');
  const [partners, setPartners] = useState<Partner[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Partner[];
    } catch { return []; }
  });
  const [name, setName] = useState('');
  const [type, setType] = useState(PARTNER_TYPES[0]);
  const [note, setNote] = useState('');

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(partners)); }, [partners]);

  const add = () => {
    if (!name.trim()) { toast.error('Give the partner a name.'); return; }
    setPartners((p) => [...p, { id: crypto.randomUUID(), name: name.trim(), type, note: note.trim(), stage: 'Proposal', createdAt: new Date().toISOString() }]);
    setName(''); setNote('');
    toast.success(`${name.trim()} added to the pipeline.`);
  };

  const move = (id: string, dir: 1 | -1) => {
    setPartners((list) => list.map((p) => {
      if (p.id !== id) return p;
      const idx = STAGES.indexOf(p.stage);
      const next = Math.max(0, Math.min(STAGES.length - 1, idx + dir));
      return { ...p, stage: STAGES[next] };
    }));
  };

  const remove = (id: string) => setPartners((list) => list.filter((p) => p.id !== id));

  const byStage = useMemo(
    () => Object.fromEntries(STAGES.map((s) => [s, partners.filter((p) => p.stage === s)])) as Record<Stage, Partner[]>,
    [partners],
  );

  const packs = useMemo(() => marketplaceCatalog().slice(0, 12), []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(['Pipeline', 'Campaign packs'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${tab === t ? 'border-transparent text-white bg-purple-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            {t === 'Pipeline' ? <Users size={13} /> : <Rocket size={13} />} {t}
          </button>
        ))}
      </div>

      {tab === 'Pipeline' ? (
        <>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Add a partner</h3>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr,auto] gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Organisation name…"
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm">
                {PARTNER_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What are we working on…"
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              <button onClick={add} className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition">
                <Plus size={15} /> Add
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STAGES.map((s) => (
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
                        <button onClick={() => remove(p.id)} className="text-gray-300 hover:text-rose-500 transition shrink-0"><Trash2 size={12} /></button>
                      </div>
                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{p.type}</span>
                      {p.note && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 leading-snug">{p.note}</p>}
                      <div className="mt-2 flex items-center gap-1">
                        <button onClick={() => move(p.id, -1)} disabled={s === 'Proposal'}
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-600">←</button>
                        <button onClick={() => move(p.id, 1)} disabled={s === 'Alumni'}
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-600">→</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
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
                className="mt-4 inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition">
                <Building2 size={13} /> Propose to a partner
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
