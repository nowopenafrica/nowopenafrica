import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Kanban, Plus, X, Loader2, CalendarClock, Bot, User, CheckCircle2, Sunrise, Sun, Sunset } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  NOWOPEN_ORG_ID, DEPARTMENTS, departmentByName, seedMembers,
  STATUS_LABELS, findHumanOwner, clockIn, clockOut,
  type WorkforceMember,
} from '../../lib/workforce';
import { sectionById } from '../../lib/adminCreator';
import {
  WORK_KINDS, WORK_STATUSES, WORK_PRIORITIES, WORK_STATUS_LABELS, WORK_KIND_LABELS, WORK_PRIORITY_LABELS,
  WORK_SEED, mapSeedToMembers, summarizeWork, filterWork, deriveAgentStatuses,
  type WorkItem, type WorkKind, type WorkStatus, type WorkPriority, type WorkFilters,
} from '../../lib/work';
import { DAY_BEAT_LABELS, dayBeat, departmentDayCards } from '../../lib/workingDay';
import { buildActivityStream, groupActivityByDay } from '../../lib/activityStream';
import type { ApprovalRequest } from '../../lib/approvals';
import { mapApplicationRow, type ApplicationRow, type FormApplication } from '../../lib/formsEngine';

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
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [snapshots, setSnapshots] = useState<{ health: number; snapshot_date?: string; derived_at?: string }[]>([]);
  const [applications, setApplications] = useState<FormApplication[]>([]);
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
      const [wf, wk, ap, sn] = await Promise.all([
        supabase.from('os_workforce').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_work_items').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_approvals').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_snapshots').select('health, snapshot_date').eq('org_id', NOWOPEN_ORG_ID).order('snapshot_date', { ascending: false }),
      ]);
      const rows = (wk.data ?? []) as WorkItem[];
      const people = (wf.data ?? []) as WorkforceMember[];
      const queue = (ap.data ?? []) as ApprovalRequest[];
      const history = (sn.data ?? []) as { health: number; snapshot_date?: string }[];
      if (wk.error || wf.error || ap.error || rows.length === 0 || people.length === 0) throw new Error('os tables unavailable');
      setItems(rows);
      setMembers(people);
      setApprovals(queue);
      setSnapshots(history);
      // Applications are ancillary to the board: reviewer decisions feed the
      // activity stream, but an unavailable os_form_applications never knocks
      // the board into fallback.
      let appRows: FormApplication[] = [];
      try {
        const appsRes = await supabase.from('os_form_applications').select('*').eq('org_id', NOWOPEN_ORG_ID);
        if (!appsRes.error) appRows = ((appsRes.data ?? []) as ApplicationRow[]).map(mapApplicationRow);
      } catch { appRows = []; }
      setApplications(appRows);
      setUsingFallback(false);
    } catch {
      const fallbackMembers = seedMembers(currentUser);
      setMembers(fallbackMembers);
      setItems(mapSeedToMembers(WORK_SEED, fallbackMembers));
      setApprovals([]);
      setSnapshots([]);
      setApplications([]);
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

  const workingDay = useMemo(
    () => departmentDayCards({ members, items, approvals }),
    [members, items, approvals],
  );

  const activity = useMemo(
    () => groupActivityByDay(buildActivityStream({ members, items, approvals, snapshots, applications, limit: 40 })),
    [members, items, approvals, snapshots, applications],
  );

  const humans = useMemo(() => members.filter((m) => m.kind === 'human'), [members]);
  const humanOwner = useMemo(() => findHumanOwner(members, currentUser?.id), [members, currentUser?.id]);

  const toggleClock = async (clockInNow: boolean) => {
    if (!humanOwner || saving) return;
    setSaving(true);
    const patched = clockInNow ? clockIn(humanOwner) : clockOut(humanOwner);
    if (usingFallback) {
      setMembers((list) => list.map((m) => (m.id === humanOwner.id ? patched : m)));
      setSaving(false);
      toast(clockInNow
        ? 'Clocked in for this session — apply the os_workforce migration to persist.'
        : 'Clocked out for this session — apply the os_workforce migration to persist.');
      return;
    }
    try {
      const { error } = await supabase.from('os_workforce').update({
        status: patched.status,
        current_work: patched.current_work ?? null,
        updated_at: patched.updated_at,
      }).eq('id', humanOwner.id);
      if (error) throw error;
      setMembers((list) => list.map((m) => (m.id === humanOwner.id ? patched : m)));
      toast.success(clockInNow ? 'Clocked in — welcome to the board.' : 'Clocked out — see you later.');
    } catch {
      toast.error('Could not update your status — admin permissions needed.');
    } finally {
      setSaving(false);
    }
  };

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
          className="inline-flex items-center gap-1.5 px-3 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 transition min-h-[44px]">
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

      {/* OS-16: the AI working day — three beats, then one card per department. */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="px-4 pt-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">The AI working day</p>
        </div>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-gray-700">
          {(['morning', 'midday', 'eod'] as const).map((beat) => {
            const Icon = beat === 'morning' ? Sunrise : beat === 'midday' ? Sun : Sunset;
            const active = dayBeat() === beat;
            return (
              <div key={beat} className={`px-4 py-3 ${active ? 'bg-purple-50/60 dark:bg-purple-900/10' : ''}`}>
                <div className="flex items-center gap-2">
                  <Icon size={14} className={active ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500'} />
                  <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{DAY_BEAT_LABELS[beat]}</p>
                  {active && <span className="px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 text-[9px] font-bold">Now</span>}
                </div>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  {beat === 'morning'
                    ? 'Every role plans its day from its digital job description.'
                    : beat === 'midday'
                      ? 'Departments check the week is on track against real work.'
                      : 'What actually moved: done, blocked and waiting on sign-off.'}
                </p>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 border-t border-gray-100 dark:border-gray-700">
          {workingDay.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 col-span-full">No departments with roles yet — the day starts when the roster does.</p>
          )}
          {workingDay.map((card) => (
            <div key={card.department} className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-3">
              <p className="text-xs font-bold text-gray-900 dark:text-white">{card.department}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{card.roles.join(', ')}</p>
              <p className="mt-2 text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed">{card.headline}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">{card.inFlight} in flight</span>
                {card.blocked > 0 && <span className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400">{card.blocked} blocked</span>}
                {card.awaitingApproval > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">{card.awaitingApproval} sign-offs</span>}
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">{card.done} done</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
        AI agents right now — <span className="font-semibold text-emerald-600 dark:text-emerald-400">{agentStrip.working} working</span>
        {' · '}<span className="font-semibold text-rose-600 dark:text-rose-400">{agentStrip.blocked} blocked</span>
        {' · '}<span className="font-semibold text-amber-600 dark:text-amber-400">{agentStrip.waiting} waiting</span>
        <span className="text-gray-400 dark:text-gray-500"> (derived from open work on this board)</span>
      </div>

      {/* OS-18: activity stream — every entry stamped with a real ledger time. */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="px-4 pt-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Activity stream</p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            What actually happened, from the ledgers — no invented activity.
          </p>
        </div>
        <div className="p-4 space-y-4">
          {activity.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">Nothing timestamped yet — the stream fills as rows are created and moved.</p>
          )}
          {activity.map((group) => (
            <div key={group.day}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{group.day}</p>
              <ul className="mt-1.5 space-y-1">
                {group.entries.map((e) => (
                  <li key={e.id} className="flex items-start gap-2 text-xs">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${e.kind === 'health-snapshot' ? 'bg-purple-400' : e.kind === 'approval-decided' ? 'bg-emerald-400' : e.kind === 'application-decided' ? 'bg-rose-400' : e.kind === 'work-status' ? 'bg-blue-400' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    <span className="text-gray-700 dark:text-gray-300">
                      <span className="font-semibold text-gray-900 dark:text-white">{e.actor}</span> {e.text}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] text-gray-400 dark:text-gray-500">{e.at.slice(11, 16)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {humans.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Human team</p>
            {humanOwner && (
              humanOwner.status === 'clocked-in' ? (
                <button type="button" disabled={saving} onClick={() => void toggleClock(false)}
                  className="inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition min-h-[44px]">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} Clock out
                </button>
              ) : (
                <button type="button" disabled={saving} onClick={() => void toggleClock(true)}
                  className="inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition min-h-[44px]">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Clock in
                </button>
              )
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {humans.map((h) => (
              <span key={h.id} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-1 text-xs text-gray-600 dark:text-gray-300">
                <User size={12} />
                {h.name} · {STATUS_LABELS[h.status]}
              </span>
            ))}
          </div>
        </div>
      )}

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
                    className={`inline-flex items-center px-2 rounded-md text-xs font-semibold transition ${formKind === k ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'} min-h-[44px]`}>
                    {WORK_KIND_LABELS[k]}
                  </button>
                ))}
              </div>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Title</span>
              <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Launch restaurant campaign"
                className="flex items-center mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 min-h-[44px]" />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Department</span>
              <select value={formDepartment} onChange={(e) => setFormDepartment(e.target.value)}
                className="flex items-center mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 min-h-[44px]">
                {DEPARTMENTS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Assignee</span>
              <select value={formAssignee} onChange={(e) => setFormAssignee(e.target.value)}
                className="flex items-center mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 min-h-[44px]">
                <option value="none">Unassigned</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.kind === 'ai' ? 'AI' : 'Human'})</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Priority</span>
              <select value={formPriority} onChange={(e) => setFormPriority(e.target.value as WorkPriority)}
                className="flex items-center mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 min-h-[44px]">
                {WORK_PRIORITIES.map((p) => <option key={p} value={p}>{WORK_PRIORITY_LABELS[p]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Due date</span>
              <input type="date" value={formDue} onChange={(e) => setFormDue(e.target.value)}
                className="flex items-center mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 min-h-[44px]" />
            </label>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={!formTitle.trim() || saving}
              className="inline-flex items-center gap-1.5 px-4 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition min-h-[44px]">
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
            className="flex items-center mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 min-h-[44px]">
            <option value="all">All kinds</option>
            {WORK_KINDS.map((k) => <option key={k} value={k}>{WORK_KIND_LABELS[k]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Department</span>
          <select value={filters.department} onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}
            className="flex items-center mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 min-h-[44px]">
            <option value="all">All departments</option>
            {DEPARTMENTS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Assignee</span>
          <select value={filters.assignee} onChange={(e) => setFilters((f) => ({ ...f, assignee: e.target.value }))}
            className="flex items-center mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 min-h-[44px]">
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
                      className={`inline-flex items-center px-2 rounded-md text-[11px] font-semibold transition ${draftStatus === s ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'} min-h-[44px]`}>
                      {WORK_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Priority</span>
                  <select value={draftPriority} onChange={(e) => setDraftPriority(e.target.value as WorkPriority)}
                    className="flex items-center mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 min-h-[44px]">
                    {WORK_PRIORITIES.map((p) => <option key={p} value={p}>{WORK_PRIORITY_LABELS[p]}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Due date</span>
                  <input type="date" value={draftDue} onChange={(e) => setDraftDue(e.target.value)}
                    className="flex items-center mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 min-h-[44px]" />
                </label>
              </div>

              <label className="block">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Assignee</span>
                <select value={draftAssignee} onChange={(e) => setDraftAssignee(e.target.value)}
                  className="flex items-center mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 min-h-[44px]">
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
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition min-h-[44px]">
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
