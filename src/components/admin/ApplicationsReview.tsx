import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Loader2, Inbox, ClipboardList, CheckCircle2, XCircle, CalendarClock,
  ArrowRight, RotateCcw, Search, ChevronDown, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { NOWOPEN_ORG_ID } from '../../lib/workforce';
import {
  HUB_RELATIONSHIP_TYPES, hubRelationshipById,
  schemaFor, APPLICATION_STATUSES, APPLICATION_STATUS_LABELS,
  mapApplicationRow, toApplicationRow, summarizeApplications,
  FORM_APPLICATIONS_SEED, advanceApplication, rejectApplication,
  reopenApplication, canAdvance, nextStatusFor, applicationPipeline,
  acknowledgedAgreements, formatFileSize,
  type FormApplication, type ApplicationRow, type ApplicationStatus,
  type HubRelationshipType,
} from '../../lib/formsEngine';

// Applications Review — the front door of the Forms Hub. Every submission that
// arrived via the public /forms page is reviewed here: filtered by relationship
// and status, walked through its own pipeline one honest step at a time, or
// rejected with a note (which leaves it on the ledger, reopenable any time).
// Reviewing records the decision on os_form_applications — nothing else happens
// automatically, and approved applicants continue in the Onboarding Command
// Center.

function answerValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.filter(Boolean).join(', ');
  if (typeof v === 'object') {
    const f = v as { name?: unknown; size?: unknown };
    if (f.name !== undefined) {
      return `${String(f.name)}${f.size !== undefined ? ` · ${formatFileSize(Number(f.size))}` : ''}`;
    }
    return JSON.stringify(v);
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

export default function ApplicationsReview() {
  const [applications, setApplications] = useState<FormApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [relationshipFilter, setRelationshipFilter] = useState<'all' | HubRelationshipType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ApplicationStatus>('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<FormApplication | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('os_form_applications')
        .select('*')
        .eq('org_id', NOWOPEN_ORG_ID);
      const rows = (data ?? []) as ApplicationRow[];
      if (error || rows.length === 0) throw new Error('applications ledger unavailable');
      setApplications(rows.map(mapApplicationRow));
      setUsingFallback(false);
    } catch {
      setApplications(FORM_APPLICATIONS_SEED);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const persistApplication = async (next: FormApplication) => {
    if (usingFallback) {
      setApplications((list) => list.map((x) => (x.id === next.id ? next : x)));
      return true;
    }
    const { id: _id, ...row } = toApplicationRow(next);
    const { error } = await supabase.from('os_form_applications').update(row).eq('id', next.id);
    return !error;
  };

  const advance = async (app: FormApplication) => {
    const next = advanceApplication(app);
    if (next === app) return;
    setBusy(true);
    try {
      if (await persistApplication(next)) {
        toast.success(`${next.reference} moved to ${APPLICATION_STATUS_LABELS[next.status]}.`);
      } else {
        toast.error('Could not save the decision — admin permissions needed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    const next = rejectApplication(rejectTarget, new Date(), note.trim() || undefined);
    setBusy(true);
    try {
      if (await persistApplication(next)) {
        toast.success(`${next.reference} rejected — it stays on the ledger with the reason, reopenable any time.`);
        setRejectTarget(null);
        setNote('');
      } else {
        toast.error('Could not save the decision — admin permissions needed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const reopen = async (app: FormApplication) => {
    const next = reopenApplication(app);
    setBusy(true);
    try {
      if (await persistApplication(next)) {
        toast.success(`${next.reference} reopened — back at ${APPLICATION_STATUS_LABELS[next.status]}.`);
      } else {
        toast.error('Could not save the decision — admin permissions needed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const summary = useMemo(() => summarizeApplications(applications), [applications]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...applications]
      .filter((a) => relationshipFilter === 'all' || a.relationship === relationshipFilter)
      .filter((a) => statusFilter === 'all' || a.status === statusFilter)
      .filter((a) => !q
        || a.applicant_name.toLowerCase().includes(q)
        || a.email.toLowerCase().includes(q)
        || a.reference.toLowerCase().includes(q))
      .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  }, [applications, relationshipFilter, statusFilter, search]);

  const statusBadge = (a: FormApplication) => {
    if (a.status === 'archived' && a.rejected === true) {
      return { label: 'Rejected', tone: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' };
    }
    const label = APPLICATION_STATUS_LABELS[a.status] ?? a.status;
    if (a.status === 'approved' || a.status === 'active' || a.status === 'onboarding') {
      return { label, tone: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' };
    }
    if (a.status === 'archived') {
      return { label: 'Archived', tone: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400' };
    }
    return { label, tone: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' };
  };

  const fieldLabel = (relationship: HubRelationshipType, id: string): string => {
    const s = schemaFor(relationship);
    const f = s.sections.flatMap((sec) => sec.fields).find((x) => x.id === id);
    return f?.label ?? id;
  };

  const summaryChips = [
    { label: 'Total', value: summary.total, icon: Inbox, tone: 'text-gray-600 dark:text-gray-300' },
    { label: 'Pending review', value: summary.pendingReview, icon: ClipboardList, tone: 'text-amber-600 dark:text-amber-400' },
    { label: 'Approved', value: summary.approved, icon: CheckCircle2, tone: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Rejected', value: summary.rejected, icon: XCircle, tone: 'text-red-600 dark:text-red-400' },
    { label: 'Today', value: summary.today, icon: CalendarClock, tone: 'text-blue-600 dark:text-blue-400' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 size={16} className="animate-spin mr-2" /> Reading the applications ledger…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {usingFallback && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Showing the dev applications — apply the os_form_applications and os_form_applications_review migrations to persist real decisions.
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Inbox size={18} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">Applications Review</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {summary.total} applications · {summary.pendingReview} pending review · {summary.approved} approved · {summary.rejected} rejected · {summary.today} today
              </p>
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
          Every submission from the public Forms Hub, reviewed honestly. Advancing moves an application one step along its own relationship pipeline; rejecting records the reason on the ledger without deleting it. No email is sent and no profile is created by a decision here — approved applicants continue in the Onboarding Command Center.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {summaryChips.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <p className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${c.tone}`}>
              <c.icon size={11} /> {c.label}
            </p>
            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setRelationshipFilter('all')}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition ${relationshipFilter === 'all'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            aria-pressed={relationshipFilter === 'all'}>
            All · {summary.total}
          </button>
          {HUB_RELATIONSHIP_TYPES.map((r) => (
            <button key={r} type="button" onClick={() => setRelationshipFilter(r)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition ${relationshipFilter === r
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
              aria-pressed={relationshipFilter === r}>
              {hubRelationshipById(r)?.emoji} {hubRelationshipById(r)?.label} · {summary.byRelationship[r] ?? 0}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              aria-label="Search applications"
              placeholder="Search by name, email or reference…"
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <label className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Status</span>
            <select value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | ApplicationStatus)}
              aria-label="Filter by status"
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
              <option value="all">All statuses</option>
              {APPLICATION_STATUSES.map((s) => (
                <option key={s} value={s}>{APPLICATION_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {visible.length === 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          No applications match this filter.
        </div>
      )}

      <div className="space-y-2">
        {visible.map((a) => {
          const badge = statusBadge(a);
          const open = openId === a.id;
          const next = nextStatusFor(a);
          const pipeline = applicationPipeline(a);
          const idx = pipeline.indexOf(a.status);
          const pct = idx >= 0 ? Math.round((idx / Math.max(pipeline.length - 1, 1)) * 100) : 0;
          const agreed = acknowledgedAgreements(a);
          const answerEntries = Object.entries(a.answers)
            .filter(([k, v]) => !k.startsWith('agreed_')
              && v !== '' && v !== null && v !== undefined
              && !(Array.isArray(v) && v.length === 0));
          return (
            <div key={a.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => setOpenId(open ? null : a.id)}
                    className="min-w-0 text-left flex-1 flex items-center gap-2" aria-label={`${a.applicant_name} application details`}>
                    <span className="text-lg shrink-0">{hubRelationshipById(a.relationship)?.emoji}</span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-gray-900 dark:text-white truncate">{a.applicant_name}</span>
                      <span className="block text-[10px] text-gray-500 dark:text-gray-400 truncate">
                        {a.reference} · {hubRelationshipById(a.relationship)?.label} · {new Date(a.submitted_at).toLocaleString()}
                      </span>
                    </span>
                  </button>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.tone}`}>{badge.label}</span>
                  <ChevronDown size={14} className={`shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {a.source && (
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[9px] font-bold text-gray-500 dark:text-gray-400">via {a.source}</span>
                  )}
                  <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[9px] font-bold text-gray-500 dark:text-gray-400">{a.country}</span>
                  {canAdvance(a) && next && (
                    <button type="button" onClick={() => advance(a)} disabled={busy}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition">
                      <ArrowRight size={10} /> Advance to {APPLICATION_STATUS_LABELS[next]}
                    </button>
                  )}
                  {a.status === 'archived' && a.rejected === true ? (
                    <button type="button" onClick={() => reopen(a)} disabled={busy}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition">
                      <RotateCcw size={10} /> Reopen
                    </button>
                  ) : (
                    <button type="button" onClick={() => { setRejectTarget(a); setNote(''); }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 transition">
                      <XCircle size={10} /> Reject
                    </button>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${a.status === 'archived' && a.rejected === true ? 'bg-red-400' : 'bg-purple-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="shrink-0 text-[9px] font-bold text-gray-400">
                    {idx >= 0 ? `Step ${idx + 1} of ${pipeline.length}` : '—'}
                  </span>
                </div>
                {a.decision_note && (
                  <p className="mt-2 text-[10px] font-semibold text-red-600 dark:text-red-400">
                    Decision note: {a.decision_note}
                  </p>
                )}
              </div>

              {open && (
                <div className="border-t border-gray-100 dark:border-gray-700 p-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Reference</p>
                      <p className="mt-0.5 font-mono text-gray-700 dark:text-gray-300">{a.reference}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Email</p>
                      <p className="mt-0.5 text-gray-700 dark:text-gray-300 break-all">{a.email}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Consent</p>
                      <p className="mt-0.5 text-gray-700 dark:text-gray-300">{a.consent ? 'Accepted' : 'Missing'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Submitted</p>
                      <p className="mt-0.5 text-gray-700 dark:text-gray-300">{new Date(a.submitted_at).toLocaleDateString()}</p>
                    </div>
                  </div>

                  {answerEntries.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Answers</p>
                      <div className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 divide-y divide-gray-100 dark:divide-gray-700">
                        {answerEntries.map(([k, v]) => (
                          <div key={k} className="flex items-start justify-between gap-3 px-2.5 py-1.5">
                            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 shrink-0">{fieldLabel(a.relationship, k)}</span>
                            <span className="text-[11px] text-gray-700 dark:text-gray-300 text-right break-all">{answerValue(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {agreed.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide self-center mr-1">Acknowledged</span>
                      {agreed.map((id) => (
                        <span key={id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={9} /> {id}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-label="Reject application">
          <form onSubmit={confirmReject}
            className="w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-900 dark:text-white">Reject application</p>
              <button type="button" onClick={() => setRejectTarget(null)} aria-label="Close reject dialog">
                <X size={14} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" />
              </button>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {rejectTarget.reference} · {rejectTarget.applicant_name}. The application moves to rejected and stays on the ledger — it can be reopened at any time.
            </p>
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Why? (honest note, optional)</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                aria-label="Rejection note"
                placeholder="e.g. Role filled internally, budget not approved this quarter, portfolio gaps…"
                className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRejectTarget(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition">
                Cancel
              </button>
              <button type="submit" disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />} Reject application
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
