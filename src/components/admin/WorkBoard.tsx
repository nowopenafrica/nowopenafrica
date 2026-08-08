import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Kanban, Plus, X, Loader2, CalendarClock, Bot, User, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  NOWOPEN_ORG_ID, DEPARTMENTS, departmentByName, seedMembers,
  type WorkforceMember,
} from '../../lib/workforce';
import { sectionById } from '../../lib/adminCreator';
import {
  WORK_KINDS, WORK_STATUSES, WORK_PRIORITIES, WORK_STATUS_LABELS, WORK_KIND_LABELS, WORK_PRIORITY_LABELS,
  WORK_SEED, mapSeedToMembers, summarizeWork, filterWork, deriveAgentStatuses,
  type WorkItem, type WorkKind, type WorkStatus, type WorkPriority, type WorkFilters,
} from '../../lib/work';

// The daily work layer (#22, group People): projects, tasks and goals on a
// board, assignable to the workforce, with honest statuses from os_work_items.
// Falls back to the planned seed (labelled) until the migration is applied.
// The AI-agent strip is derived from real open work via deriveAgentStatuses —
// no invented "working" statuses.

const BOARD_COLUMNS: readonly WorkStatus[] = ['todo', 'in_progress', 'waiting', 'blocked', 'done'];

const KIND_TONE: Record<WorkKind, string> = {
  project: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  task: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  goal: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
};

const PRIORITY_TONE: Record<WorkPriority, string> = {
  low: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  medium: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  high: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  urgent: 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400',
};

const isOverdue = (w: WorkItem, now = new Date()): boolean => {
  if (w.status === 'done' || w.status === 'cancelled' || !w.due_at) return false;
  const due = new Date(w.due_at);
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
};

export default function WorkBoard({ onOpenSection }: { onOpenSection?: (id: string) => void }) {
  const { user } = useAuth();
  const currentUser = useMemo(
    () => (user?.id ? { id: user.id, email: user.email } : undefined),
    [user?.id, user?.email],
  );

  const [items, setItems] = useState<WorkItem[]>([]);
  const [members, setMembers] = useState<WorkforceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState<WorkFilters>({ kind: 'all', department: 'all', assignee: 'all' });

  const [formKind, setFormKind] = useState<WorkKind>('task');
  const [formTitle, setFormTitle] = useState('');
  const [formDepartment, setFormDepartment] = useState(DEPARTMENTS[0].name);
  const [formAssignee, setFormAssignee] = useState('none');
  const [formPriority, setFormPriority] = useState<WorkPriority>('medium');
  const [formDue, setFormDue] = useState('');

  const [draftStatus, setDraftStatus] = useState<WorkStatus>('todo');
  const [draftPriority, setDraftPriority] = useState<WorkPriority>('medium');
  const [draftAssignee, setDraftAssignee] = useState('none');
  const [draftDue, setDraftDue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [wf, wk] = await Promise.all([
        supabase.from('os_workforce').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_work_items').select('*').eq('org_id', NOWOPEN_ORG_ID),
      ]);
      const rows = (wk.data ?? []) as WorkItem[];
      const people = (wf.data ?? []) as WorkforceMember[];
      if (wk.error || wf.error || rows.length === 0 || people.length === 0) throw new Error('os tables unavailable');
      setItems(rows);
      setMembers(people);
      setUsingFallback(false);
    } catch {
      const fallbackMembers = seedMembers(currentUser);
      setMembers(fallbackMembers);
      setItems(mapSeedToMembers(WORK_SEED, fallbackMembers));
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => summarizeWork(items), [items]);
  const filtered = useMemo(() => filterWork(items, filters), [items, filters]);
  const selected = items.find((w) => w.id === selectedId) ?? null;

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const memberName = (id?: string | null): string | null => (id ? memberById.get(id)?.name ?? null : null);

  const agentStrip = useMemo(() => {
    const aiIds = members.filter((m) => m.kind === 'ai').map((m) => m.id);
    const derived = deriveAgentStatuses(items, aiIds);
    let working = 0;
    let blocked = 0;
    let waiting = 0;
    Object.values(derived).forEach((s) => {
      if (s === 'blocked') blocked += 1;
      else if (s === 'working') working += 1;
      else waiting += 1;
    });
    return { working, blocked, waiting };
  }, [items, members]);

  useEffect(() => {
    setDraftStatus(selected?.status ?? 'todo');
    setDraftPriority(selected?.priority ?? 'medium');
    setDraftAssignee(selected?.assignee_id ?? 'none');
    setDraftDue(selected?.due_at?.slice(0, 10) ?? '');
  }, [selected]);

  const applyPatch = async (patch: Partial<WorkItem>) => {
    if (!selected) return;
    setSaving(true);
    if (usingFallback) {
      setItems((list) => list.map((w) => (w.id === selected.id ? { ...w, ...patch } : w)));
      setSelectedId(null);
      setSaving(false);
      toast('Board updated for this session — apply the os_work_items migration to persist.');
      return;
    }
    try {
      const { error } = await supabase
        .from('os_work_items')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', selected.id);
      if (error) throw error;
      setItems((list) => list.map((w) => (w.id === selected.id ? { ...w, ...patch, updated_at: new Date().toISOString() } : w)));
      setSelectedId(null);
      toast.success('Work item updated');
    } catch {
      toast.error('Could not save — admin permissions needed.');
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = () => {
    void applyPatch({
      status: draftStatus,
      priority: draftPriority,
      assignee_id: draftAssignee === 'none' ? null : draftAssignee,
      due_at: draftDue ? new Date(`${draftDue}T00:00:00`).toISOString() : null,
    });
  };

  const addItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || saving) return;
    const base = {
      org_id: NOWOPEN_ORG_ID,
      kind: formKind,
      title: formTitle.trim(),
      status: 'todo' as WorkStatus,
      priority: formPriority,
      department: formDepartment,
      assignee_id: formAssignee === 'none' ? null : formAssignee,
      due_at: formDue ? new Date(`${formDue}T00:00:00`).toISOString() : null,
    };
    setSaving(true);
    if (usingFallback) {
      setItems((list) => [{ id: `seed-work-${Date.now()}`, ...base, description: null }, ...list]);
      toast('Added for this session — apply the os_work_items migration to persist.');
    } else {
      try {
        const { error } = await supabase.from('os_work_items').insert(base);
        if (error) throw error;
        toast.success(`${formTitle.trim()} added to the board`);
        void load();
      } catch {
        toast.error('Could not save — os_work_items needs the migration and admin permissions.');
      }
    }
    setSaving(false);
    setFormTitle('');
    setFormDue('');
    setFormAssignee('none');
    setShowForm(false);
  };

  const openDepartment = (id: string | null | undefined) => {
    if (id) onOpenSection?.(id);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Kanban size={18} className="text-purple-600 dark:text-purple-400" />
            Work Board
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Projects, tasks and goals assigned to the team — honest statuses from os_work_items.
          </p>
        </div>
        <button type="button" onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 transition">
          <Plus size={15} /> Add item
        </button>
      </div>

      {usingFallback && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
          Demo board — the os_work_items migration isn't applied in this project yet. You're seeing the planned first
          work items; once the migration runs, rows come from the database and edits persist.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Open', value: summary.open, tone: 'text-gray-900 dark:text-white' },
          { label: 'In progress', value: summary.inProgress, tone: 'text-blue-600 dark:text-blue-400' },
          { label: 'Blocked', value: summary.blocked, tone: 'text-rose-600 dark:text-rose-400' },
          { label: 'Waiting', value: summary.waiting, tone: 'text-amber-600 dark:text-amber-400' },
          { label: 'Overdue', value: summary.overdue, tone: 'text-rose-600 dark:text-rose-400' },
        ].map(({ label, value, tone }) => (
          <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <span className={`text-xl font-bold ${tone}`}>{value}</span>
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
        AI agents right now — <span className="font-semibold text-emerald-600 dark:text-emerald-400">{agentStrip.working} working</span>
        {' · '}<span className="font-semibold text-rose-600 dark:text-rose-400">{agentStrip.blocked} blocked</span>
        {' · '}<span className="font-semibold text-amber-600 dark:text-amber-400">{agentStrip.waiting} waiting</span>
        <span className="text-gray-400 dark:text-gray-500"> (derived from open work on this board)</span>
      </div>

      {showForm && (
        <form onSubmit={addItem} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900 dark:text-white">Add a work item</p>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Close add item">
              <X size={16} />
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Kind</span>
              <div className="mt-1 grid grid-cols-3 gap-1 rounded-lg bg-gray-100 dark:bg-gray-700 p-1">
                {WORK_KINDS.map((k) => (
                  <button key={k} type="button" onClick={() => setFormKind(k)}
                    className={`px-2 py-1.5 rounded-md text-xs font-semibold transition ${formKind === k ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                    {WORK_KIND_LABELS[k]}
                  </button>
                ))}
              </div>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Title</span>
              <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Launch restaurant campaign"
                className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Department</span>
              <select value={formDepartment} onChange={(e) => setFormDepartment(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2">
                {DEPARTMENTS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Assignee</span>
              <select value={formAssignee} onChange={(e) => setFormAssignee(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2">
                <option value="none">Unassigned</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.kind === 'ai' ? 'AI' : 'Human'})</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Priority</span>
              <select value={formPriority} onChange={(e) => setFormPriority(e.target.value as WorkPriority)}
                className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2">
                {WORK_PRIORITIES.map((p) => <option key={p} value={p}>{WORK_PRIORITY_LABELS[p]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Due date</span>
              <input type="date" value={formDue} onChange={(e) => setFormDue(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2" />
            </label>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={!formTitle.trim() || saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {saving ? 'Saving…' : 'Add to board'}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Kind</span>
          <select value={filters.kind} onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value as WorkFilters['kind'] }))}
            className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2">
            <option value="all">All kinds</option>
            {WORK_KINDS.map((k) => <option key={k} value={k}>{WORK_KIND_LABELS[k]}</option>)}
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
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Assignee</span>
          <select value={filters.assignee} onChange={(e) => setFilters((f) => ({ ...f, assignee: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2">
            <option value="all">Everyone</option>
            <option value="none">Unassigned</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.kind === 'ai' ? 'AI' : 'Human'})</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={18} className="animate-spin mr-2" /> Loading the work board…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr,320px] items-start">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {BOARD_COLUMNS.map((status) => {
            const cards = filtered.filter((w) => w.status === status);
            return (
              <div key={status} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2 flex items-center justify-between">
                  {WORK_STATUS_LABELS[status]}
                  <span className="bg-white dark:bg-gray-800 rounded-full px-1.5 py-0.5 text-[10px]">{cards.length}</span>
                </p>
                <div className="space-y-2">
                  {cards.map((w) => {
                    const overdue = isOverdue(w);
                    const assignee = memberName(w.assignee_id);
                    return (
                      <button key={w.id} type="button" onClick={() => setSelectedId(w.id)}
                        className="w-full text-left rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 transition hover:shadow-sm hover:border-purple-300 dark:hover:border-purple-700">
                        <p className="text-xs font-semibold text-gray-900 dark:text-white leading-snug">{w.title}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${KIND_TONE[w.kind]}`}>{WORK_KIND_LABELS[w.kind]}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${PRIORITY_TONE[w.priority]}`}>{WORK_PRIORITY_LABELS[w.priority]}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
                          {assignee && (
                            <span className="inline-flex items-center gap-1 truncate">
                              {memberById.get(w.assignee_id as string)?.kind === 'ai' ? <Bot size={11} /> : <User size={11} />}
                              <span className="truncate">{assignee}</span>
                            </span>
                          )}
                          {w.due_at && (
                            <span className={`inline-flex items-center gap-1 ml-auto shrink-0 ${overdue ? 'text-rose-500 dark:text-rose-400 font-semibold' : ''}`}>
                              <CalendarClock size={11} />
                              {new Date(w.due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {cards.length === 0 && <p className="text-center text-[11px] text-gray-400 dark:text-gray-600 py-3">Empty</p>}
                </div>
              </div>
            );
          })}
        </div>

        <aside className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white leading-snug">{selected.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{WORK_KIND_LABELS[selected.kind]} · {selected.department}</p>
                </div>
                <button type="button" onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Close details">
                  <X size={16} />
                </button>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {WORK_STATUSES.map((s) => (
                    <button key={s} type="button" onClick={() => setDraftStatus(s)}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition ${draftStatus === s ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                      {WORK_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Priority</span>
                  <select value={draftPriority} onChange={(e) => setDraftPriority(e.target.value as WorkPriority)}
                    className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2">
                    {WORK_PRIORITIES.map((p) => <option key={p} value={p}>{WORK_PRIORITY_LABELS[p]}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Due date</span>
                  <input type="date" value={draftDue} onChange={(e) => setDraftDue(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2" />
                </label>
              </div>

              <label className="block">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Assignee</span>
                <select value={draftAssignee} onChange={(e) => setDraftAssignee(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2">
                  <option value="none">Unassigned</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.kind === 'ai' ? 'AI' : 'Human'})</option>)}
                </select>
              </label>

              {selected.description && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Notes</p>
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">{selected.description}</p>
                </div>
              )}

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Department office</p>
                {(() => {
                  const sec = departmentByName(selected.department)?.sectionId;
                  const section = sec ? sectionById(sec) : undefined;
                  return section ? (
                    <button type="button" onClick={() => openDepartment(section.id)}
                      className="mt-1 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300">
                      Open {section.label}
                    </button>
                  ) : (
                    <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">This department doesn't have an office yet — it's on the roadmap.</p>
                  );
                })()}
              </div>

              <button type="button" onClick={saveDraft} disabled={saving}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <Kanban size={22} className="mx-auto text-gray-300 dark:text-gray-600" />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Select a work item to move it, reassign it or adjust the due date.</p>
            </div>
          )}
        </aside>
        </div>
      )}
    </div>
  );
}
