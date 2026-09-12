import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Loader2, RefreshCw, X, ExternalLink, FileCheck2 } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { isUnprovisionedError } from '../../lib/enrichmentOps';
import {
  PROPOSAL_STATUS_LABEL, proposalFieldLabel, proposalReviewPatch,
  displayValue, sourceLabel, isApplied, APPLIED_SENTINEL,
  type ChangeProposalRow,
} from '../../lib/changeProposals';

/**
 * Admin → Oversight → Change Proposals & Evidence.
 *
 * The human half of the enrichment engine's output. The executor deposits
 * "source X says the opening hours differ — adopt it?" rows here, each with
 * the evidence it rests on. Reviewing is the ONLY path that changes a real
 * business: Approve stamps the reviewer then calls the SECURITY DEFINER
 * applier, which re-checks the evidence and the staff gate inside the
 * database. Rejecting leaves the proposal as history, never touching the row.
 */

type ReviewRow = ChangeProposalRow & {
  business?: { name: string | null; username: string | null } | null;
};

type Tab = 'pending' | 'approved' | 'rejected' | 'all';

const TABS: Tab[] = ['pending', 'approved', 'rejected', 'all'];

const TAB_LABEL: Record<Tab, string> = {
  pending: 'Pending',
  approved: 'Approved & applied',
  rejected: 'Rejected',
  all: 'All',
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function ChangeProposalsPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unprovisioned, setUnprovisioned] = useState(false);
  const [tab, setTab] = useState<Tab>('pending');
  const [working, setWorking] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('business_change_proposals')
      .select('*, business:businesses(name, username)')
      .order('created_at', { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) {
      if (isUnprovisionedError(error.message)) {
        setUnprovisioned(true);
        setRows([]);
        return;
      }
      toast.error(error.message);
      return;
    }
    setUnprovisioned(false);
    setRows((data as ReviewRow[] | null) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { pending: 0, approved: 0, rejected: 0, all: rows.length };
    for (const r of rows) {
      if (r.status === 'pending') c.pending += 1;
      else if (r.status === 'approved') c.approved += 1;
      else if (r.status === 'rejected') c.rejected += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(
    () => (tab === 'all' ? rows : rows.filter((r) => r.status === tab)),
    [rows, tab],
  );

  const applyProposal = async (row: ReviewRow) => {
    setWorking(row.id);
    // 1. Stamp the reviewer and move it out of the pending queue.
    const { error: upError } = await supabase
      .from('business_change_proposals')
      .update(proposalReviewPatch('approve', new Date().toISOString(), user?.id ?? null, null))
      .eq('id', row.id);
    if (upError) { setWorking(null); toast.error(upError.message); return; }
    // 2. The applier re-checks staff + evidence and writes the business row.
    const { error: rpcError } = await supabase.rpc('apply_business_change_proposal', { p_proposal: row.id });
    setWorking(null);
    if (rpcError) { toast.error(rpcError.message); return; }
    toast.success('Applied — the edits are now on the live profile.');
    void load();
  };

  const rejectProposal = async (row: ReviewRow) => {
    setWorking(row.id);
    const { error } = await supabase
      .from('business_change_proposals')
      .update(proposalReviewPatch('reject', new Date().toISOString(), user?.id ?? null, reasonFor[row.id] ?? null))
      .eq('id', row.id);
    setWorking(null);
    if (error) { toast.error(error.message); return; }
    setReasonFor((prev) => { const next = { ...prev }; delete next[row.id]; return next; });
    toast.success('Rejected.');
    void load();
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Change Proposals &amp; Evidence</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Sourced changes the enrichment engine wants to make to a business, each backed by evidence.
            Approving asks the database to re-check the evidence and write the field; rejecting leaves the row untouched.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {TAB_LABEL[t]} <span className="opacity-70">({counts[t]})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="animate-spin mr-2" /> Loading proposals…
        </div>
      ) : unprovisioned ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center space-y-1.5">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Enrichment is not yet provisioned in this database.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            This review queue reads <code className="font-mono">business_change_proposals</code>, created
            by the enrichment migrations (20260911000000 … 20260912020000). Until a database has them (
            <code className="font-mono">audits/APPLY_PENDING_ENRICHMENT.sql</code> provisions the whole set in one
            paste), there is nothing to review and nothing wrong with the app.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center text-sm text-gray-500 dark:text-gray-400">
          {tab === 'pending'
            ? 'Nothing waiting. When an enrichment job finds a sourced change with evidence, it lands here for a human to review.'
            : 'No proposals in this state yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((row) => {
            const applied = isApplied(row);
            const retryable = row.status === 'approved' && !applied;
            const showActions = row.status === 'pending' || retryable;
            return (
              <div key={row.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">
                        {row.business?.name ?? `Business ${row.business_id}`}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        <span className="uppercase tracking-wide text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                          {proposalFieldLabel(row.field_name)}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                          row.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : row.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          : row.status === 'superseded' ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                        }`}>
                          {PROPOSAL_STATUS_LABEL[row.status] ?? row.status}
                        </span>
                      </div>
                    </div>
                    {row.business?.username && (
                      <a
                        href={`/${row.business.username}`}
                        className="shrink-0 rounded-lg p-2 text-gray-400 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="View profile"
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                  </div>

                  <div className="rounded-xl bg-gray-50 dark:bg-gray-900 p-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-3 text-gray-500 dark:text-gray-400">
                      <span className="shrink-0">Currently</span>
                      <span className={`text-right line-through decoration-gray-300 dark:decoration-gray-600 ${row.current_value ? '' : 'italic'}`}>
                        {displayValue(row.field_name, row.current_value)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3 text-gray-800 dark:text-gray-200 font-medium">
                      <span className="shrink-0">Propose</span>
                      <span className="text-right break-words">{displayValue(row.field_name, row.proposed_value)}</span>
                    </div>
                  </div>

                  {row.reason && <p className="text-xs text-gray-600 dark:text-gray-300">{row.reason}</p>}

                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      Match {row.confidence}
                    </span>
                    {row.extraction_method && (
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        {row.extraction_method.replace(/_/g, ' ')}
                      </span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded font-medium ${
                      row.evidence_id
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                    }`}>
                      {row.evidence_id ? 'Evidence on file' : 'No evidence'}
                    </span>
                    {sourceLabel(row.source_id, row.source_url) && (
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        {sourceLabel(row.source_id, row.source_url)}
                      </span>
                    )}
                  </div>

                  {row.source_url && (
                    <a
                      href={row.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-blue-600 dark:text-blue-400 truncate hover:underline"
                    >
                      {row.source_url}
                    </a>
                  )}

                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Proposed {fmtDate(row.created_at)}
                    {row.reviewed_at ? ` · reviewed ${fmtDate(row.reviewed_at)}` : ''}
                    {row.auto_applied ? ' · auto-applied' : ''}
                  </p>

                  {applied && (
                    <p className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      <FileCheck2 size={13} /> Applied — live on the profile.
                    </p>
                  )}

                  {showActions && (
                    <div className="space-y-2">
                      {row.status === 'pending' && (
                        <input
                          value={reasonFor[row.id] ?? ''}
                          onChange={(e) => setReasonFor((prev) => ({ ...prev, [row.id]: e.target.value }))}
                          placeholder="Reason (for rejection)"
                          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => void applyProposal(row)}
                          disabled={working === row.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                        >
                          {working === row.id ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                          {retryable ? 'Retry apply' : 'Apply'}
                        </button>
                        {row.status === 'pending' && (
                          <button
                            onClick={() => void rejectProposal(row)}
                            disabled={working === row.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                          >
                            {working === row.id ? <Loader2 className="animate-spin" size={14} /> : <X size={14} />}
                            Reject
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {row.note && row.note !== APPLIED_SENTINEL && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{row.note}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}