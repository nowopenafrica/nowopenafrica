import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { UsersRound, Bot, User, Plus, X, ArrowRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  NOWOPEN_ORG_ID, DEPARTMENTS, AI_ROSTER_SEED, STATUS_LABELS,
  AI_STATUSES, HUMAN_STATUSES, statusesFor, summarizeWorkforce, filterWorkforce, departmentByName,
  type WorkforceMember, type WorkforceKind, type WorkforceStatus, type WorkforceFilters,
} from '../../lib/workforce';
import { sectionById } from '../../lib/adminCreator';

// The People front door of the OS (#21, group People): every human and AI
// agent, with honest statuses from the os_workforce table. When the migration
// hasn't been applied (dev, or a project that predates it) the view falls back
// to the planned AI roster and says so — it never presents invented people as
// real. Humans appear once the admin signs in: the current user is clocked-in
// as the owner, matching the DB (owner_user_id) once rows are saved.

const ALL_STATUSES: WorkforceStatus[] = [...new Set([...AI_STATUSES, ...HUMAN_STATUSES])];

const STATUS_TONE: Record<WorkforceStatus, string> = {
  active: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
  working: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
  waiting: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  blocked: 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400',
  'awaiting-approval': 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  'off-schedule': 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  error: 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400',
  'clocked-in': 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
  'in-meeting': 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  'on-break': 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  away: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  'clocked-out': 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
};

function seedMembers(user?: { id?: string; email?: string }): WorkforceMember[] {
  const ai: WorkforceMember[] = AI_ROSTER_SEED.map((r) => ({
    id: `seed-ai-${r.agentKey}`,
    org_id: NOWOPEN_ORG_ID,
    kind: 'ai',
    name: r.name,
    title: r.title,
    department: r.department,
    status: 'active',
    current_work: r.currentWork,
    agent_key: r.agentKey,
  }));
  if (!user?.id) return ai;
  return [{
    id: `seed-human-${user.id}`,
    org_id: NOWOPEN_ORG_ID,
    kind: 'human',
    name: user.email?.split('@')[0] || 'Owner',
    title: 'Owner',
    department: 'Founder Office',
    status: 'clocked-in',
    current_work: 'Running NowOpen Africa — this view is you. Clock in from the office.',
    owner_user_id: user.id,
  }, ...ai];
}

export default function WorkforceDirectory({ onOpenSection }: { onOpenSection?: (id: string) => void }) {
  const { user } = useAuth();
  // Stable identity so a fresh context object every render (common in tests
  // and hot reload) doesn't restart the fetch loop.
  const currentUser = useMemo(
    () => (user?.id ? { id: user.id, email: user.email } : undefined),
    [user?.id, user?.email],
  );
  const [members, setMembers] = useState<WorkforceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState<WorkforceFilters>({ kind: 'all', department: 'all', status: 'all' });

  const [formKind, setFormKind] = useState<WorkforceKind>('ai');
  const [formName, setFormName] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDepartment, setFormDepartment] = useState(DEPARTMENTS[0].name);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('os_workforce')
        .select('*')
        .eq('org_id', NOWOPEN_ORG_ID);
      const rows = (data ?? []) as WorkforceMember[];
      if (error || rows.length === 0) throw new Error('os_workforce unavailable');
      setMembers(rows);
      setUsingFallback(false);
    } catch {
      setMembers(seedMembers(currentUser));
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => summarizeWorkforce(members), [members]);
  const filtered = useMemo(() => filterWorkforce(members, filters), [members, filters]);
  const selected = members.find((m) => m.id === selectedId) ?? null;

  const statusOptions: readonly WorkforceStatus[] = useMemo(
    () => (filters.kind === 'all' ? ALL_STATUSES : statusesFor(filters.kind)),
    [filters.kind],
  );

  const addMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('os_workforce').insert({
        org_id: NOWOPEN_ORG_ID,
        kind: formKind,
        name: formName.trim(),
        title: formTitle.trim() || formName.trim(),
        department: formDepartment,
        status: formKind === 'ai' ? 'active' : 'clocked-in',
      });
      if (error) throw error;
      toast.success(`${formName.trim()} joined the workforce`);
      setFormName('');
      setFormTitle('');
      setShowForm(false);
      void load();
    } catch {
      toast.error('Could not save — os_workforce needs admin permissions and the migration to exist.');
    } finally {
      setSaving(false);
    }
  };

  const openDepartment = (id: string | null | undefined) => {
    if (!id) return;
    onOpenSection?.(id);
  };

  return (
    <div className="space-y-5">
      {/* Headline + add action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <UsersRound size={18} className="text-purple-600 dark:text-purple-400" />
            Workforce Directory
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            The whole team — humans and AI agents — with honest statuses from the os_workforce table.
          </p>
        </div>
        <button type="button" onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 transition">
          <Plus size={15} /> Add member
        </button>
      </div>

      {/* Fallback notice */}
      {usingFallback && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
          Demo roster — the os_workforce migration isn't applied in this project yet. You're seeing the planned AI team
          plus the owner; once the migration runs, rows come from the database and edits persist.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total workforce', value: summary.total, icon: UsersRound, tone: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300' },
          { label: 'Humans', value: summary.humans, icon: User, tone: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' },
          { label: 'AI agents', value: summary.ai, icon: Bot, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
          { label: 'Need attention', value: summary.needingAttention, icon: Loader2, tone: 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tone}`}><Icon size={16} /></div>
              <span className="text-2xl font-bold text-gray-900 dark:text-white">{value}</span>
            </div>
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Add-member form */}
      {showForm && (
        <form onSubmit={addMember} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900 dark:text-white">Add a team member</p>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Close add member">
              <X size={16} />
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Kind</span>
              <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg bg-gray-100 dark:bg-gray-700 p-1">
                {(['ai', 'human'] as WorkforceKind[]).map((k) => (
                  <button key={k} type="button" onClick={() => setFormKind(k)}
                    className={`px-2 py-1.5 rounded-md text-xs font-semibold transition ${formKind === k ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                    {k === 'ai' ? 'AI agent' : 'Human'}
                  </button>
                ))}
              </div>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Department</span>
              <select value={formDepartment} onChange={(e) => setFormDepartment(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2">
                {DEPARTMENTS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</span>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={formKind === 'ai' ? 'e.g. Research Analyst' : 'e.g. Ada Obi'}
                className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Title</span>
              <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder={formKind === 'ai' ? 'Research Analyst' : 'Operations Lead'}
                className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2" />
            </label>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={!formName.trim() || saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {saving ? 'Saving…' : `Add ${formKind === 'ai' ? 'agent' : 'human'}`}
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Type</span>
          <select value={filters.kind} onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value as WorkforceFilters['kind'], status: 'all' }))}
            className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2">
            <option value="all">Everyone</option>
            <option value="ai">AI agents</option>
            <option value="human">Humans</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Department</span>
          <select value={filters.department} onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2">
            <option value="all">All departments</option>
            {DEPARTMENTS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</span>
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2">
            <option value="all">All statuses</option>
            {statusOptions.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>
      </div>

      {/* Directory + member details */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr,320px] gap-4 items-start">
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 size={18} className="animate-spin mr-2" /> Loading workforce…
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No one matches those filters — the directory may be empty.
            </div>
          ) : filtered.map((m) => (
            <button key={m.id} type="button" onClick={() => setSelectedId(m.id)}
              className={`w-full text-left rounded-xl border bg-white dark:bg-gray-800 p-4 transition hover:shadow-sm ${selectedId === m.id ? 'border-purple-400 dark:border-purple-600 ring-1 ring-purple-400' : 'border-gray-200 dark:border-gray-700'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${m.kind === 'ai' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                  {m.kind === 'ai' ? <Bot size={18} /> : <User size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{m.name}</p>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_TONE[m.status]}`}>{STATUS_LABELS[m.status]}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{m.title} · {m.department}</p>
                </div>
                {m.current_work && <p className="hidden sm:block max-w-[40%] text-[11px] text-gray-400 dark:text-gray-500 truncate">{m.current_work}</p>}
              </div>
            </button>
          ))}
        </div>

        <aside className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{selected.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{selected.title}</p>
                </div>
                <button type="button" onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Close details">
                  <X size={16} />
                </button>
              </div>
              <div>
                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_TONE[selected.status]}`}>{STATUS_LABELS[selected.status]}</span>
                <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{selected.kind === 'ai' ? 'AI agent' : 'Human'}</span>
              </div>
              {selected.current_work && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Currently working on</p>
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">{selected.current_work}</p>
                </div>
              )}
              {selected.kind === 'ai' && selected.agent_key && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Agent key</p>
                  <code className="text-xs text-purple-600 dark:text-purple-300 font-mono">{selected.agent_key}</code>
                </div>
              )}
              {selected.owner_user_id && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Linked account</p>
                  <p className="text-xs text-gray-700 dark:text-gray-300 font-mono truncate">{selected.owner_user_id}</p>
                </div>
              )}
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Department</p>
                <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">{departmentByName(selected.department)?.blurb ?? selected.department}</p>
                {(() => {
                  const sec = departmentByName(selected.department)?.sectionId;
                  const section = sec ? sectionById(sec) : undefined;
                  return section ? (
                    <button type="button" onClick={() => openDepartment(section.id)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300">
                      Open {section.label} <ArrowRight size={13} />
                    </button>
                  ) : (
                    <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">This department doesn't have an office yet — it's on the roadmap.</p>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <UsersRound size={22} className="mx-auto text-gray-300 dark:text-gray-600" />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Select a member to see their workload, KPIs and department.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
