import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, CheckCircle2, X, Bot, User, Loader2, CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  NOWOPEN_ORG_ID, DEPARTMENTS, departmentByName, seedMembers,
  type WorkforceMember,
} from '../../lib/workforce';
import { sectionById } from '../../lib/adminCreator';
import { WORK_SEED, mapSeedToMembers, type WorkItem } from '../../lib/work';
import {
  APPROVAL_STATUS_LABELS, APPROVAL_STATUSES, summarizeApprovals, filterApprovals,
  DECISION_EFFECTS, APPROVALS_SEED, mapSeedToApprovals,
  type ApprovalRequest, type ApprovalStatus, type ApprovalFilters,
} from '../../lib/approvals';

// Approvals hub (#23, group People): agent-finished work queued for a human to
// sign off. A decision moves the work item (approved → done, rejected → back to
// the board) and the requesting agent back to an active state — the queue is
// derived from os_approvals, never fabricated. Falls back to the labelled seed
// until the migration is applied, same honest-fallback pattern as the other OS
// modules.

type Outcome = 'approved' | 'rejected';

const STATUS_TONE: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  approved: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
  rejected: 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400',
};

export default function ApprovalsHub({ onOpenSection }: { onOpenSection?: (id: string) => void }) {
  const { user } = useAuth();
  const currentUser = useMemo(
    () => (user?.id ? { id: user.id, email: user.email } : undefined),
    [user?.id, user?.email],
  );

  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [members, setMembers] = useState<WorkforceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [filters, setFilters] = useState<ApprovalFilters>({ status: 'pending', department: 'all' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ap, wk, wf] = await Promise.all([
        supabase.from('os_approvals').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_work_items').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_workforce').select('*').eq('org_id', NOWOPEN_ORG_ID),
      ]);
      const rows = (ap.data ?? []) as ApprovalRequest[];
      const workRows = (wk.data ?? []) as WorkItem[];
      const people = (wf.data ?? []) as WorkforceMember[];
      if (ap.error || wk.error || wf.error || rows.length === 0 || workRows.length === 0 || people.length === 0) {
        throw new Error('os tables unavailable');
      }
      setApprovals(rows);
      setItems(workRows);
      setMembers(people);
      setUsingFallback(false);
    } catch {
      const fallbackMembers = seedMembers(currentUser);
      const fallbackItems = mapSeedToMembers(WORK_SEED, fallbackMembers);
      setMembers(fallbackMembers);
      setItems(fallbackItems);
      setApprovals(mapSeedToApprovals(APPROVALS_SEED, fallbackItems));
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { void load(); }, [load]);

  const workById = useMemo(() => new Map(items.map((w) => [w.id, w])), [items]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const departmentOf = (r: ApprovalRequest): string | null | undefined =>
    workById.get(r.work_item_id)?.department;

  const summary = useMemo(() => summarizeApprovals(approvals), [approvals]);
  const filtered = useMemo(() => filterApprovals(approvals, filters, departmentOf), [approvals, filters, departmentOf]);
  const pending = approvals.filter((a) => a.status === 'pending');
  const decided = approvals
    .filter((a) => a.status !== 'pending')
    .sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''));

  const requesterName = (r: ApprovalRequest): string | null => {
    const m = r.requested_by ? memberById.get(r.requested_by) : undefined;
    return m?.name ?? null;
  };

  const openDepartment = (id: string | null | undefined) => {
    if (id) onOpenSection?.(id);
  };

  const officeFor = (r: ApprovalRequest): { id: string; label: string } | null => {
    const dep = departmentOf(r);
    const sec = dep ? departmentByName(dep)?.sectionId : undefined;
    const section = sec ? sectionById(sec) : undefined;
    return section ? { id: section.id, label: section.label } : null;
  };

  const patchLocal = (id: string, outcome: Outcome) => {
    const effects = DECISION_EFFECTS[outcome];
    const now = new Date().toISOString();
    setApprovals((list) => list.map((a) =>
      a.id === id ? { ...a, status: outcome, decided_by: currentUser?.id ?? null, decided_at: now, updated_at: now } : a));
    const target = approvals.find((a) => a.id === id);
    const item = target ? workById.get(target.work_item_id) : undefined;
    if (item) {
      setItems((list) => list.map((w) => (w.id === item.id ? { ...w, status: effects.work, updated_at: now } : w)));
      if (item.assignee_id) {
        setMembers((list) => list.map((m) => (m.id === item.assignee_id ? { ...m, status: effects.member, updated_at: now } : m)));
      }
    }
  };

  const decide = async (r: ApprovalRequest, outcome: Outcome) => {
    if (actioning) return;
    setActioning(r.id);
    const item = workById.get(r.work_item_id);
    const title = item?.title ?? 'work item';
    const effects = DECISION_EFFECTS[outcome];

    if (usingFallback) {
      patchLocal(r.id, outcome);
      setActioning(null);
      toast(outcome === 'approved'
        ? `Approved for this session — ${title} is done. Apply the os_approvals migration to persist.`
        : `Sent back for this session — ${title} returns to the board. Apply the os_approvals migration to persist.`);
      return;
    }

    try {
      const now = new Date().toISOString();
      const calls: unknown[] = [
        supabase.from('os_approvals').update({
          status: outcome, decided_by: currentUser?.id ?? null, decided_at: now, updated_at: now,
        }).eq('id', r.id),
        supabase.from('os_work_items').update({ status: effects.work, updated_at: now }).eq('id', r.work_item_id),
      ];
      if (r.requested_by) {
        calls.push(
          supabase.from('os_workforce').update({ status: effects.member, updated_at: now }).eq('id', r.requested_by),
        );
      }
      await Promise.all(calls);
      toast.success(outcome === 'approved' ? `Approved — ${title} is done.` : `Sent back to the board — ${title}.`);
      void load();
    } catch {
      toast.error('Could not save the decision — admin permissions needed.');
    } finally {
      setActioning(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ClipboardCheck size={18} className="text-purple-600 dark:text-purple-400" />
            Approvals Hub
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Agent-finished work waiting for a human sign-off — the decisions move the work ledger, honestly.
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${pending.length > 0 ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}`}>
          {pending.length > 0 ? `${pending.length} awaiting review` : 'Queue is clear'}
        </span>
      </div>

      {usingFallback && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
          Demo queue — the os_approvals migration isn't applied in this project yet. Decisions are kept for this
          session; once the migration runs, approvals come from the database and sign-offs persist.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Pending', value: summary.pending, tone: 'text-amber-600 dark:text-amber-400' },
          { label: 'Approved', value: summary.approved, tone: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Rejected', value: summary.rejected, tone: 'text-rose-600 dark:text-rose-400' },
        ].map(({ label, value, tone }) => (
          <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <span className={`text-xl font-bold ${tone}`}>{value}</span>
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</span>
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as ApprovalFilters['status'] }))}
            className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2">
            <option value="all">All statuses</option>
            {APPROVAL_STATUSES.map((s) => <option key={s} value={s}>{APPROVAL_STATUS_LABELS[s]}</option>)}
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
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={18} className="animate-spin mr-2" /> Loading the approval queue…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr,320px] items-start">
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Queue</p>
              {filtered.filter((a) => a.status === 'pending').length === 0 ? (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  Nothing waiting right now — every agent is cleared for take-off.
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.filter((a) => a.status === 'pending').map((r) => {
                    const requester = requesterName(r);
                    const office = officeFor(r);
                    const member = r.requested_by ? memberById.get(r.requested_by) : undefined;
                    const busy = actioning === r.id;
                    return (
                      <div key={r.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 dark:text-white leading-snug">
                              {workById.get(r.work_item_id)?.title ?? 'Unknown work item'}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {requester && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                                  {member?.kind === 'ai' ? <Bot size={11} /> : <User size={11} />}
                                  {requester} requested
                                </span>
                              )}
                              {departmentOf(r) && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                                  {departmentOf(r)}
                                </span>
                              )}
                            </div>
                          </div>
                          {r.created_at && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                              <CalendarClock size={11} />
                              {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{r.reason}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button type="button" disabled={actioning !== null} onClick={() => void decide(r, 'approved')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                            {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                            Approve
                          </button>
                          <button type="button" disabled={actioning !== null} onClick={() => void decide(r, 'rejected')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                            {busy ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                            Reject
                          </button>
                          {office && (
                            <button type="button" onClick={() => openDepartment(office.id)}
                              className="ml-auto text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300">
                              Open {office.label}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Recent decisions</p>
              {decided.length === 0 ? (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-center text-xs text-gray-400 dark:text-gray-500">
                  No decisions yet — the history fills as you sign off.
                </div>
              ) : (
                <div className="space-y-2">
                  {decided.map((r) => (
                    <div key={r.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                          {workById.get(r.work_item_id)?.title ?? 'Unknown work item'}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                          {requesterName(r) ?? 'Agent'} · {r.decided_at ? new Date(r.decided_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 ${STATUS_TONE[r.status]}`}>
                        {APPROVAL_STATUS_LABELS[r.status]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <p className="text-sm font-bold text-gray-900 dark:text-white">How sign-off works</p>
            <ul className="mt-3 space-y-3 text-xs text-gray-600 dark:text-gray-300">
              <li className="flex gap-2">
                <CheckCircle2 size={14} className="shrink-0 text-emerald-500 mt-0.5" />
                <span><span className="font-semibold text-gray-900 dark:text-white">Approve</span> — the work item is
                  marked <span className="font-semibold">done</span> and the agent returns to <span className="font-semibold">active</span>.</span>
              </li>
              <li className="flex gap-2">
                <X size={14} className="shrink-0 text-rose-500 mt-0.5" />
                <span><span className="font-semibold text-gray-900 dark:text-white">Reject</span> — the item goes back
                  to the board as <span className="font-semibold">in progress</span> and the agent returns to <span className="font-semibold">working</span>.</span>
              </li>
              <li className="flex gap-2">
                <ClipboardCheck size={14} className="shrink-0 text-purple-500 mt-0.5" />
                <span>Every decision is stored on <span className="font-semibold">os_approvals</span> with who decided and
                  when — nothing is invented client-side.</span>
              </li>
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
