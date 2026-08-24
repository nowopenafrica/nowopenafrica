import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Rocket, Plus, Trash2, CheckSquare, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { NOWOPEN_ORG_ID } from '../../lib/workforce';
import {
  LAUNCH_CHECKLIST, LAUNCH_STATUS_LABELS, mapLaunchRow,
  launchProgress, launchStatus, summarizeLaunches, LAUNCHES_SEED,
  type LaunchItem,
} from '../../lib/launches';

// Launch Control (#18, group Run): every feature launch on one board. A launch
// gets a name, an owner area, a target and the standard checklist, and its
// status is derived from the ticks — never stored. Rows live in os_launches;
// the section falls back to the bundled seed (clearly labelled) until the
// migration is applied, same honest-fallback pattern as the rest of the OS.

export default function LaunchControl() {
  const [launches, setLaunches] = useState<LaunchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [target, setTarget] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('os_launches')
        .select('*')
        .eq('org_id', NOWOPEN_ORG_ID);
      const rows = (data ?? []) as unknown[];
      if (error || rows.length === 0) throw new Error('os_launches unavailable');
      setLaunches(rows.map((r) => mapLaunchRow(r as Parameters<typeof mapLaunchRow>[0])));
      setUsingFallback(false);
    } catch {
      setLaunches(LAUNCHES_SEED);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => summarizeLaunches(launches), [launches]);

  const add = async () => {
    if (!name.trim()) { toast.error('Give the launch a name.'); return; }
    const fresh: LaunchItem = {
      id: usingFallback ? `seed-local-${Date.now()}` : 'pending',
      org_id: NOWOPEN_ORG_ID,
      name: name.trim(),
      area: area.trim() || 'Unassigned',
      target: target.trim() || 'TBA',
      done: LAUNCH_CHECKLIST.map(() => false),
      created_at: new Date().toISOString(),
    };
    if (usingFallback) {
      setLaunches((list) => [fresh, ...list]);
      setName(''); setArea(''); setTarget('');
      toast.success(`Launch "${fresh.name}" added for this session. Apply the os_launches migration to persist.`);
      return;
    }
    try {
      const { error } = await supabase.from('os_launches').insert({
        org_id: NOWOPEN_ORG_ID,
        name: fresh.name,
        area: fresh.area,
        target: fresh.target,
        checklist_done: fresh.done,
      });
      if (error) throw error;
      toast.success(`Launch "${fresh.name}" added to the board.`);
      setName(''); setArea(''); setTarget('');
      void load();
    } catch {
      toast.error('Could not save — os_launches needs admin permissions and the migration to exist.');
    }
  };

  const toggle = async (id: string, index: number) => {
    if (usingFallback) {
      setLaunches((list) => list.map((l) => (l.id === id ? { ...l, done: l.done.map((d, di) => (di === index ? !d : d)) } : l)));
      return;
    }
    try {
      const targetLaunch = launches.find((l) => l.id === id);
      if (!targetLaunch) return;
      const next = targetLaunch.done.map((d, di) => (di === index ? !d : d));
      const { error } = await supabase.from('os_launches').update({ checklist_done: next, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      void load();
    } catch {
      toast.error('Could not save the tick — admin permissions needed.');
    }
  };

  const remove = async (id: string) => {
    if (usingFallback) {
      setLaunches((list) => list.filter((l) => l.id !== id));
      return;
    }
    try {
      const { error } = await supabase.from('os_launches').delete().eq('id', id);
      if (error) throw error;
      void load();
    } catch {
      toast.error('Could not delete — admin permissions needed.');
    }
  };

  const toneFor = (l: LaunchItem): string => {
    const s = launchStatus(l);
    if (s === 'ready') return 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400';
    if (s === 'in_progress') return 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
    return 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400';
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Open launches', value: summary.total, tone: 'text-gray-900 dark:text-white' },
          { label: 'Ready', value: summary.ready, tone: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'In flight', value: summary.inProgress, tone: 'text-orange-600 dark:text-orange-400' },
          { label: 'Average progress', value: `${summary.avgProgress}%`, tone: 'text-purple-600 dark:text-purple-400' },
        ].map(({ label, value, tone }) => (
          <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <span className={`text-xl font-bold ${tone}`}>{value}</span>
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {usingFallback && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
          Demo launch board — the os_launches migration isn't applied in this project yet. Changes are kept for this
          session; once it runs, launches come from the database and ticks persist.
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Open a launch</h3>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,1fr,auto] gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Feature name…"
            className="inline-flex items-center px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Owner area…"
            className="inline-flex items-center px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target (e.g. Oct 2026)…"
            className="inline-flex items-center px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
          <button onClick={() => void add()} className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-purple-600 text-white px-4 rounded-lg hover:bg-purple-700 transition min-h-[44px]">
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={18} className="animate-spin mr-2" /> Loading the launch board…
        </div>
      ) : (
        <div className="space-y-4">
          {launches.map((l) => (
            <div key={l.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300 flex items-center justify-center shrink-0">
                  <Rocket size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{l.name}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{l.area} · target {l.target}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${toneFor(l)}`}>
                  {LAUNCH_STATUS_LABELS[launchStatus(l)]}
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-28 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-purple-600 transition-all duration-500" style={{ width: `${launchProgress(l)}%` }} />
                  </div>
                  <span className="text-xs font-black text-gray-700 dark:text-gray-200">{launchProgress(l)}%</span>
                  <button aria-label={`Delete ${l.name}`} onClick={() => void remove(l.id)} className="inline-flex items-center justify-center w-[44px] h-[44px] rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {LAUNCH_CHECKLIST.map((c, i) => (
                  <button key={c} onClick={() => void toggle(l.id, i)}
                    className={`flex items-center gap-2 px-3 rounded-lg text-xs font-medium border transition ${l.done[i] ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'} min-h-[44px]`}>
                    <CheckSquare size={13} className={l.done[i] ? 'text-emerald-600' : 'text-gray-300 dark:text-gray-600'} />
                    {c}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
