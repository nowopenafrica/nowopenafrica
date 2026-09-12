import { describe, it, expect } from 'vitest';
import {
  cronStatusMeta, jobKindLabel, JOB_STATUS_LABEL, JOB_STATUS_TONE,
  isRetryable, fmtIso, isUnprovisionedError, type CronStatus, type EnrichmentJobRow,
} from './enrichmentOps';

const job: EnrichmentJobRow = {
  id: 'j1', business_id: 'b1', job_type: 'enrichment', status: 'failed',
  priority: 50, attempts: 1, run_at: '2026-09-12T00:00:00.000Z',
  created_at: '2026-09-12T00:00:00.000Z', error: 'rate limited', result: null,
};

describe('enrichmentOps — cron status verdict', () => {
  it('calls an unknown status down', () => {
    expect(cronStatusMeta(null)).toEqual({ tone: 'down', label: 'Unknown' });
  });

  it('is honest when the endpoint is not configured', () => {
    const s: CronStatus = { scheduled: true, active: true, configured: false };
    expect(cronStatusMeta(s)).toEqual({ tone: 'warn', label: 'Not configured' });
  });

  it('flags an unscheduled or paused tick', () => {
    expect(cronStatusMeta({ configured: true, scheduled: false })).toEqual({ tone: 'warn', label: 'Not scheduled' });
    expect(cronStatusMeta({ configured: true, scheduled: true, active: false })).toEqual({ tone: 'warn', label: 'Paused' });
  });

  it('flags a failed last tick but calls a healthy one running', () => {
    expect(cronStatusMeta({ configured: true, scheduled: true, active: true, last_status: 'failed' })).toEqual({ tone: 'warn', label: 'Last tick failed' });
    expect(cronStatusMeta({ configured: true, scheduled: true, active: true, last_status: 'succeeded' })).toEqual({ tone: 'ok', label: 'Running' });
  });
});

describe('enrichmentOps — job display', () => {
  it('maps job types to friendly kinds', () => {
    expect(jobKindLabel('hours_resolution')).toBe('Hours');
    expect(jobKindLabel('enrichment')).toBe('Enrichment');
    expect(jobKindLabel('something-else')).toBe('something-else');
  });

  it('labels and tones every status the queue can hold', () => {
    expect(JOB_STATUS_LABEL.queued).toBe('Queued');
    expect(JOB_STATUS_TONE.failed).toBe('down');
    expect(JOB_STATUS_TONE.cancelled).toBe('warn');
    expect(JOB_STATUS_TONE.succeeded).toBe('ok');
  });

  it('only offers the retry lever under the attempts bound', () => {
    expect(isRetryable(job)).toBe(true);
    expect(isRetryable({ ...job, attempts: 3 })).toBe(false);
    expect(isRetryable({ ...job, status: 'queued' })).toBe(false);
  });
});

describe('enrichmentOps — dates', () => {
  it('renders an ISO stamp and passes nothing through as an em dash', () => {
    expect(fmtIso('2026-09-12T10:30:00.000Z')).toMatch(/12 Sep/);
    expect(fmtIso(null)).toBe('—');
    expect(fmtIso('not a date')).toBe('—');
  });
});

describe('enrichmentOps — provisioning detection', () => {
  it('recognises a missing table or function as not provisioned', () => {
    expect(isUnprovisionedError(`PGRST204 Could not find the table 'public.business_enrichment_jobs' in the schema cache`)).toBe(true);
    expect(isUnprovisionedError('PGRST202 Could not find the function public.enrichment_cron_status in the schema cache')).toBe(true);
    expect(isUnprovisionedError('relation "public.business_enrichment_jobs" does not exist')).toBe(true);
    expect(isUnprovisionedError('Could not find the table public.business_change_proposals')).toBe(true);
  });

  it('keeps real failures out of that bucket', () => {
    expect(isUnprovisionedError('permission denied for table business_enrichment_jobs')).toBe(false);
    expect(isUnprovisionedError('network error')).toBe(false);
    expect(isUnprovisionedError('')).toBe(false);
    expect(isUnprovisionedError(null)).toBe(false);
  });
});