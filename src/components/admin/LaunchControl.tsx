import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Rocket, Plus, Trash2, CheckSquare } from 'lucide-react';

// Launch Control (#18) — every feature launch on one board. A feature gets a
// name, an owner area, and the standard checklist (design, QA, marketing,
// videos, emails, docs, release notes, rollout). Progress persists locally
// until the launches land in the backend.

const CHECKLIST = [
  'Design review passed',
  'QA sign-off',
  'Marketing assets ready',
  'Explainer video made',
  'Launch email drafted',
  'Docs & release notes written',
  'Rollout scheduled',
];

interface Launch {
  id: string;
  name: string;
  area: string;
  target: string;
  done: boolean[];
  createdAt: string;
}

const KEY = 'nowopen_launches_v1';

const SAMPLE: Launch[] = [
  { id: 'l1', name: 'AI Video Studio', area: 'Product · Media', target: 'Aug 2026', done: [true, true, true, true, true, true, true], createdAt: '2026-06-01T10:00:00Z' },
  { id: 'l2', name: 'Verified Badge', area: 'Trust & Safety', target: 'Mar 2026', done: [true, true, true, true, true, true, true], createdAt: '2026-02-01T10:00:00Z' },
  { id: 'l3', name: 'Restaurant Week 2026', area: 'Growth · Campaigns', target: 'Sep 2026', done: [true, false, false, false, false, false, false], createdAt: '2026-07-15T10:00:00Z' },
];

export default function LaunchControl() {
  const [launches, setLaunches] = useState<Launch[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Launch[] | null;
      return stored ?? SAMPLE;
    } catch { return SAMPLE; }
  });
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [target, setTarget] = useState('');

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(launches)); }, [launches]);

  const add = () => {
    if (!name.trim()) { toast.error('Give the launch a name.'); return; }
    setLaunches((l) => [{ id: crypto.randomUUID(), name: name.trim(), area: area.trim() || 'Unassigned', target: target.trim() || 'TBA', done: CHECKLIST.map(() => false), createdAt: new Date().toISOString() }, ...l]);
    setName(''); setArea(''); setTarget('');
    toast.success(`Launch "${name.trim()}" added to the board.`);
  };

  const toggle = (id: string, i: number) => {
    setLaunches((list) => list.map((l) => (l.id === id ? { ...l, done: l.done.map((d, di) => (di === i ? !d : d)) } : l)));
  };

  const remove = (id: string) => setLaunches((list) => list.filter((l) => l.id !== id));

  const pct = (l: Launch) => Math.round((l.done.filter(Boolean).length / CHECKLIST.length) * 100);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Open a launch</h3>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,1fr,auto] gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Feature name…"
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Owner area…"
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target (e.g. Oct 2026)…"
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <button onClick={add} className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition">
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

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
              <div className="flex items-center gap-2">
                <div className="w-28 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-purple-600 transition-all duration-500" style={{ width: `${pct(l)}%` }} />
                </div>
                <span className="text-xs font-black text-gray-700 dark:text-gray-200">{pct(l)}%</span>
                <button onClick={() => remove(l.id)} className="text-gray-300 hover:text-rose-500 transition"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {CHECKLIST.map((c, i) => (
                <button key={c} onClick={() => toggle(l.id, i)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition ${l.done[i] ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                  <CheckSquare size={13} className={l.done[i] ? 'text-emerald-600' : 'text-gray-300 dark:text-gray-600'} />
                  {c}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
