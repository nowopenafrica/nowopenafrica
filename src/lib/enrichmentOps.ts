// Pure display helpers for the Enrichment Engine Ops panel: the scheduler
// status from enrichment_cron_status() and the job queue from
// business_enrichment_jobs. No React, so the decisions stay unit-testable.

export interface CronStatus {
  scheduled?: boolean;
  schedule?: string | null;
  active?: boolean | null;
  last_run?: string | null;
  last_status?: string | null;
  configured?: boolean;
  queued?: number;
  succeeded?: number;
}

export type SignalTone = 'ok' | 'warn' | 'down';

export interface CronStatusMeta {
  tone: SignalTone;
  label: string;
}

/** Turn the cron status payload into a single honest verdict. */
export function cronStatusMeta(s: CronStatus | null | undefined): CronStatusMeta {
  if (!s) return { tone: 'down', label: 'Unknown' };
  if (!s.configured) return { tone: 'warn', label: 'Not configured' };
  if (!s.scheduled) return { tone: 'warn', label: 'Not scheduled' };
  if (s.scheduled && s.active === false) return { tone: 'warn', label: 'Paused' };
  if (s.last_status === 'failed' || s.last_status === 'ERROR') return { tone: 'warn', label: 'Last tick failed' };
  return { tone: 'ok', label: 'Running' };
}

export interface EnrichmentJobRow {
  id: string;
  business_id: string;
  job_type: string;
  status: string;
  priority: number;
  attempts: number;
  run_at: string | null;
  created_at: string | null;
  finished_at?: string | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  queue_reason?: string | null;
  business?: { name: string | null; username?: string | null } | null;
}

export function jobKindLabel(jobType: string): string {
  if (jobType === 'hours_resolution') return 'Hours';
  if (jobType === 'enrichment') return 'Enrichment';
  return jobType;
}

export const JOB_STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const JOB_STATUS_TONE: Record<string, SignalTone> = {
  queued: 'ok',
  running: 'ok',
  succeeded: 'ok',
  failed: 'down',
  cancelled: 'warn',
};

/** A failed job an admin can safely return to the line (kept under a bound). */
export function isRetryable(job: EnrichmentJobRow): boolean {
  return job.status === 'failed' && job.attempts < 3;
}

export function fmtIso(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * PostgREST answers "no such relation/function" (PGRST202/PGRST204 in the
 * schema cache, "does not exist" without one) when the enrichment Phase-3
 * migrations have not been run in a database yet. Panels treat that as "not
 * provisioned" — a designed empty state — not as a failure to surface raw.
 */
export function isUnprovisionedError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /PGRST202|PGRST204|could not find (a |the )?(table|function|relation)|does(\s+not)?\s+exist/i.test(message);
}