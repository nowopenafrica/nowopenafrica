import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Newspaper, Download, FileText, ImageIcon, Megaphone, Building2, Copy, Plus, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { NOWOPEN_ORG_ID } from '../../lib/workforce';
import {
  PRESS_KINDS, PRESS_STATUS_LABELS, mapPressRow, formatPressDate, summarizePress,
  PRESS_SEED, type PressItem, type PressStatus,
} from '../../lib/press';

// The Press Room (#10) — the public face of NowOpen Africa. The press kit,
// founder bio, media assets and download centre stay as curated brand content;
// the news timeline is now a live press-and-coverage ledger on os_press.
// The section falls back to the bundled seed (clearly labelled) until the
// migration is applied, same honest-fallback pattern as the rest of the OS.

const FACTS = [
  { label: 'Headquarters', value: 'Lagos, Nigeria' },
  { label: 'Launched', value: '2024' },
  { label: 'Markets', value: 'Africa-wide' },
  { label: 'Mission', value: 'Every African business, open to the world' },
  { label: 'One-liner', value: 'The business operating system that gets local businesses found, trusted and profitable.' },
];

const KIND_LABEL: Record<'release' | 'coverage', string> = {
  release: 'Press release',
  coverage: 'Coverage',
};

const STATUS_TONE: Record<PressStatus, string> = {
  draft: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
  scheduled: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300',
  published: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300',
};

const copy = (text: string, label: string) => {
  navigator.clipboard?.writeText(text).then(() => toast.success(`${label} copied`)).catch(() => toast.error('Could not copy — select manually.'));
};

export default function PressRoom() {
  const [items, setItems] = useState<PressItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [headline, setHeadline] = useState('');
  const [outlet, setOutlet] = useState('');
  const [kind, setKind] = useState<'release' | 'coverage'>('release');
  const [summary, setSummary] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('os_press')
        .select('*')
        .eq('org_id', NOWOPEN_ORG_ID);
      const rows = (data ?? []) as unknown[];
      if (error || rows.length === 0) throw new Error('os_press unavailable');
      setItems(rows.map((r) => mapPressRow(r as Parameters<typeof mapPressRow>[0])));
      setUsingFallback(false);
    } catch {
      setItems(PRESS_SEED);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const summaryCounts = useMemo(() => summarizePress(items), [items]);

  const add = async () => {
    if (!headline.trim()) { toast.error('Give the story a headline.'); return; }
    if (usingFallback) {
      const fresh: PressItem = {
        id: `seed-local-${Date.now()}`,
        org_id: NOWOPEN_ORG_ID,
        headline: headline.trim(),
        outlet: outlet.trim(),
        kind,
        status: 'draft',
        url: '',
        summary: summary.trim(),
        created_at: new Date().toISOString(),
      };
      setItems((list) => [fresh, ...list]);
      setHeadline(''); setOutlet(''); setSummary('');
      toast.success('Story added for this session. Apply the os_press migration to persist.');
      return;
    }
    try {
      const { error } = await supabase.from('os_press').insert({
        org_id: NOWOPEN_ORG_ID,
        headline: headline.trim(),
        outlet: outlet.trim(),
        kind,
        status: 'draft',
        url: '',
        summary: summary.trim(),
      });
      if (error) throw error;
      toast.success('Story added to the news timeline.');
      setHeadline(''); setOutlet(''); setSummary('');
      void load();
    } catch {
      toast.error('Could not save — os_press needs admin permissions and the migration to exist.');
    }
  };

  const toggleStatus = async (id: string) => {
    const current = items.find((p) => p.id === id);
    if (!current) return;
    if (usingFallback) {
      setItems((list) => list.map((p) => (p.id === id ? { ...p, status: p.status === 'published' ? 'draft' : 'published' } : p)));
      return;
    }
    try {
      const next: PressStatus = current.status === 'published' ? 'draft' : 'published';
      const patch: { status: PressStatus; published_at?: string | null } = { status: next };
      if (next === 'published') patch.published_at = new Date().toISOString();
      const { error } = await supabase.from('os_press').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      void load();
    } catch {
      toast.error('Could not update — admin permissions needed.');
    }
  };

  const remove = async (id: string) => {
    if (usingFallback) {
      setItems((list) => list.filter((p) => p.id !== id));
      return;
    }
    try {
      const { error } = await supabase.from('os_press').delete().eq('id', id);
      if (error) throw error;
      void load();
    } catch {
      toast.error('Could not delete — admin permissions needed.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
        <div className="flex items-start gap-3">
          <Megaphone size={20} className="mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-bold">Press kit</h3>
            <p className="text-sm mt-1.5 leading-relaxed opacity-95 max-w-3xl">
              NowOpen Africa is the operating system for African businesses — a profile, a design studio, a marketing brain and an open-to-the-world storefront in one place. Press assets below are free to use with credit.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Key facts + founder */}
        <div className="space-y-5 min-w-0">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">At a glance</h3>
            <div className="space-y-3">
              {FACTS.map((f) => (
                <div key={f.label} className="border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0 last:pb-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{f.label}</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{f.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Founder bio</h3>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-black text-lg shrink-0">Y</div>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                Yemzo started NowOpen Africa to close the gap between local businesses and the people who want to find them. Two lines of summary for journalists:
                <span className="block mt-2 text-xs italic text-gray-500 dark:text-gray-400">"'{'{founder} is the founder of NowOpen Africa, building the operating system that gets every African business found, trusted and profitable.'}"</span>
              </p>
            </div>
            <button onClick={() => copy("Yemzo is the founder of NowOpen Africa, building the operating system that gets every African business found, trusted and profitable.", 'Founder bio')}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition">
              <Copy size={13} /> Copy bio
            </button>
          </div>
        </div>

        {/* News timeline */}
        <div className="space-y-5 min-w-0">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5"><Newspaper size={13} /> News</h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Press items', value: summaryCounts.total, tone: 'text-gray-900 dark:text-white' },
                { label: 'Published stories', value: summaryCounts.published, tone: 'text-emerald-600 dark:text-emerald-400' },
                { label: 'Drafts', value: summaryCounts.draft, tone: 'text-gray-500 dark:text-gray-400' },
                { label: 'Coverage pieces', value: summaryCounts.coverage, tone: 'text-purple-600 dark:text-purple-400' },
              ].map(({ label, value, tone }) => (
                <div key={label} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-2.5">
                  <span className={`text-base font-bold ${tone}`}>{value}</span>
                  <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{label}</p>
                </div>
              ))}
            </div>

            {usingFallback && (
              <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                Demo news timeline — the os_press migration isn't applied in this project yet. Changes are kept for this
                session; once it runs, stories come from the database.
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr,1fr,auto,1fr,auto] gap-2">
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline…"
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              <input value={outlet} onChange={(e) => setOutlet(e.target.value)} placeholder="Outlet…"
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              <select value={kind} onChange={(e) => setKind(e.target.value as 'release' | 'coverage')}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm">
                {PRESS_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary…"
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              <button onClick={() => void add()} className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition">
                <Plus size={15} /> Add
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 size={18} className="animate-spin mr-2" /> Loading the news timeline…
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
              {items.length === 0 && <p className="text-xs text-gray-400 py-6 text-center">No stories yet.</p>}
              {items.map((n) => (
                <div key={n.id} className="border-b border-gray-100 dark:border-gray-800 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-400">{formatPressDate(n.published_at)}</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${n.kind === 'coverage' ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300' : 'bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-300'}`}>
                        {KIND_LABEL[n.kind]}
                      </span>
                      <button aria-label={`Mark ${n.headline} ${n.status === 'published' ? 'draft' : 'published'}`} onClick={() => void toggleStatus(n.id)}
                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide hover:opacity-80 transition ${STATUS_TONE[n.status]}`}>
                        {PRESS_STATUS_LABELS[n.status]}
                      </button>
                      <button aria-label={`Remove ${n.headline}`} onClick={() => void remove(n.id)} className="text-gray-300 hover:text-rose-500 transition"><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">{n.headline}</p>
                  {n.outlet && <p className="text-[10px] font-semibold text-gray-400 mt-0.5">via {n.outlet}</p>}
                  {n.summary && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{n.summary}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Download centre */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 h-fit">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5"><Download size={13} /> Download centre</h3>
          <div className="space-y-2">
            {[
              { name: 'Logo pack (SVG · PNG)', icon: ImageIcon },
              { name: 'Press release template', icon: FileText },
              { name: 'Investor deck', icon: Building2 },
              { name: 'Founder headshots', icon: ImageIcon },
              { name: 'Brand guidelines', icon: FileText },
            ].map((d) => (
              <button key={d.name} onClick={() => toast.success(`"${d.name}" — final asset lands here once exported.`)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-left hover:border-purple-300 dark:hover:border-purple-700 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition">
                <d.icon size={15} className="text-purple-600 dark:text-purple-400 shrink-0" />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1">{d.name}</span>
                <Download size={13} className="text-gray-400 shrink-0" />
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-gray-400 leading-relaxed">The press room pulls from the Brand Asset Manager — export final files there and they appear here.</p>
        </div>
      </div>
    </div>
  );
}
