import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Activity, Loader2, RefreshCw, RotateCcw, Zap } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import {
  JOB_STATUS_LABEL, JOB_STATUS_TONE, cronStatusMeta, fmtIso,
  isRetryable, isUnprovisionedError, jobKindLabel, type CronStatus, type EnrichmentJobRow,
} from '../../lib/enrichmentOps';

/**
 * Admin → Oversight → Enrichment Engine Ops.
 *
 * The diagnostics half of the scheduler (20260912000000 + 20260912010000): it
 * shows what enrichment_cron_status() reports about the cron job, the most
 * recent queue rows, and offers the two admin levers — enqueue what is due
 * NOW, and return failed jobs to the line. No lever touches a business row;
 * both only move work into the queue, which the executor then drains under
 * the usual safety boundary.
 */

const toneClass = (t: string) =>
  t === 'ok'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    : t === 'warn'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';

export default function EnrichmentOpsPanel() {
  const [status, setStatus] = useState<CronStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [rows, setRows] = useState<EnrichmentJobRow[]>([]);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [unprovisioned, setUnprovisioned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let statusErr: string | null = null;
    try {
      const { data, error } = await supabase.rpc('enrichment_cron_status');
      statusErr = error && error.message ? error.message : null;
      setStatus(error ? null : (data as CronStatus | null));
    } catch (e) {
      statusErr = (e as Error)?.message ?? 'status unavailable';
      setStatus(null);
    }
    let jobsErr: string | null = null;
    try {
      const { data: jobs, error: jobsError } = await supabase
        .from('business_enrichment_jobs')
        .select('*, business:businesses(name, username)')
        .order('created_at', { ascending: false })
        .limit(25);
      jobsErr = jobsError ? jobsError.message : null;
      setRows((jobs as EnrichmentJobRow[] | null) ?? []);
    } catch (e) {
      jobsErr = (e as Error)?.message ?? 'queue read failed';
      setRows([]);
    }
    // A database that predates the enrichment migrations answers PGRST204 etc.
    // Show a designed state instead of dumping the raw PostgREST fragment.
    const anyErr = statusErr ?? jobsErr;
    if (anyErr && isUnprovisionedError(anyErr)) {
      setUnprovisioned(true);
      setStatus(null);
      setRows([]);
      setStatusError(null);
      setRowsError(null);
    } else {
      setUnprovisioned(false);
      setStatusError(statusErr);
      setRowsError(jobsErr);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const enqueueNow = async () => {
    setBusy('queue');
    const { data, error } = await supabase.rpc('admin_requeue_enrichment', { p_max: 20 });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Queued ${data ?? 0} business(es) for enrichment.`);
    void load();
  };

  const retryFailed = async () => {
    setBusy('retry');
    const { data, error } = await supabase.rpc('admin_retry_failed_enrichment', { p_max: 25 });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Returned ${data ?? 0} failed job(s) to the queue.`);
    void load();
  };

  const meta = cronStatusMeta(status);
  const couldRetry = rows.filter(isRetryable).length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Enrichment Engine Ops</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Diagnostics and control for the continuous-enrichment scheduler: what the cron is doing,
            what is queued, and the two admin levers for the queue.
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

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="animate-spin mr-2" /> Loading scheduler status…
        </div>
      ) : unprovisioned ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center space-y-1.5">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Enrichment is not yet provisioned in this database.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            This console reads the queue table, the scheduler and a status function — all created by the
            enrichment migrations (20260911000000 … 20260912020000). Until a database has them (
            <code className="font-mono">audits/APPLY_PENDING_ENRICHMENT.sql</code> provisions the whole set in one
            paste), there is nothing to show here and nothing wrong with the app.
          </p>
        </div>
      ) : (
        <>
          <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${toneClass(meta.tone)}`}>
            <Activity size={16} className="mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">{meta.label}</span>
              {status?.configured && status.scheduled && status.schedule && (
                <span className="opacity-75"> · {status.schedule}</span>
              )}
              {statusError && <span className="block text-xs opacity-80 mt-0.5">Status call: {statusError}</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Last tick</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white capitalize">
                {status?.last_status ?? '—'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{fmtIso(status?.last_run ?? null)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">In queue</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {(status?.queued ?? 0).toLocaleString()} job(s)
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">queued or running</p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Succeeded</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {(status?.succeeded ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">lifetime runs</p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Retryable</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{couldRetry}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">failed and under bound</p>
            </div>
          </div>

          {status && !status.configured && (
            <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              <span className="font-semibold">No endpoint configured.</span>{' '}
              Until an operator sets <code className="font-mono">private_config.enrichment_endpoint</code> (server-side, e.g.
              <code className="font-mono">…/enrich-business?limit=8&amp;refill=1</code>) the cron tick is a no-op that returns
              nothing to run — the pipeline is deliberately, visibly idle.
            </div>
          )}

          {rowsError && (
            <div className="rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              Queue read failed: {rowsError}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void enqueueNow()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {busy === 'queue' ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} />}
              Enqueue what is due now
            </button>
            <button
              onClick={() => void retryFailed()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {busy === 'retry' ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />}
              Retry failed jobs
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Recent queue</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Latest 25 of {rows.length === 25 ? '…' : 'all now shown'}</p>
            </div>
            {rows.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
                Queue idle. When a business is due, a job lands here and the scheduler picks it up.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-4 py-2">Business</th>
                      <th className="px-4 py-2">Job</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Prio</th>
                      <th className="px-4 py-2">Tries</th>
                      <th className="px-4 py-2">Run at</th>
                      <th className="px-4 py-2">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {rows.map((job) => (
                      <tr key={job.id} className="text-gray-800 dark:text-gray-200">
                        <td className="px-4 py-2 font-medium truncate max-w-[180px]">
                          {job.business?.name ?? `Business ${job.business_id.slice(0, 8)}`}
                        </td>
                        <td className="px-4 py-2">
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {jobKindLabel(job.job_type)}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${toneClass(JOB_STATUS_TONE[job.status] ?? 'down')}`}>
                            {JOB_STATUS_LABEL[job.status] ?? job.status}
                          </span>
                          {isRetryable(job) && <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">retryable</span>}
                        </td>
                        <td className="px-4 py-2 text-xs">{job.priority}</td>
                        <td className="px-4 py-2 text-xs">{job.attempts}</td>
                        <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtIso(job.run_at)}</td>
                        <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-[240px] truncate">
                          {job.error ?? (job.status === 'succeeded' ? 'ok' : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}