import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'react-hot-toast';

// jsdom has no matchMedia — react-hot-toast's <Toaster /> needs it.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

vi.mock('../lib/supabase', () => {
  // Hoisted into the factory: top-level fixtures trip vitest's mock hoisting.
  const jobs = [
    {
      id: 'j1', business_id: 'b1', job_type: 'hours_resolution', status: 'queued',
      priority: 40, attempts: 0, run_at: '2026-09-12T00:00:00.000Z',
      created_at: '2026-09-12T00:00:00.000Z', error: null, result: null,
      queue_reason: 'hours never set',
      business: { name: 'Meat Club Lagos', username: 'meat-club' },
    },
    {
      id: 'j2', business_id: 'b2', job_type: 'enrichment', status: 'running',
      priority: 50, attempts: 1, run_at: '2026-09-12T00:00:00.000Z',
      created_at: '2026-09-12T00:00:00.000Z', error: null, result: null,
      business: { name: 'Nkanchi Beauty', username: 'nkanchi' },
    },
    {
      id: 'j3', business_id: 'b3', job_type: 'enrichment', status: 'failed',
      priority: 50, attempts: 1, run_at: '2026-09-11T08:00:00.000Z',
      created_at: '2026-09-11T08:00:00.000Z', error: 'Nominatim rate-limited us.', result: null,
      business: { name: 'Third Spot', username: null },
    },
  ];
  let statusResult = {
    scheduled: true, schedule: '*/15 * * * *', active: true,
    last_run: '2026-09-12T00:00:00.000Z', last_status: 'succeeded',
    configured: true, queued: 2, succeeded: 41,
  };
  let jobsError: { message: string } | null = null;
  let rpcSpy: ((fn: string, params: unknown) => void) | undefined;
  const result = () => ({ data: jobs, error: jobsError });
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    then: (onF?: any, onR?: any) => Promise.resolve(result()).then(onF, onR),
    catch: (onR?: any) => Promise.resolve(result()).catch(onR),
    finally: (onF?: any) => Promise.resolve(result()).finally(onF),
  };
  return {
    __setStatus: (s: typeof statusResult | null | undefined) => { statusResult = s as typeof statusResult; },
    __setJobsError: (m: string | null) => { jobsError = m ? { message: m } : null; },
    __setRpcSpy: (spy: (fn: string, params: unknown) => void) => { rpcSpy = spy; },
    supabase: {
      from: vi.fn(() => chain),
      rpc: vi.fn(async (fn: string, params: unknown) => {
        // Only the admin levers are asserted on; the status call that load()
        // makes after every action would otherwise overwrite the captured one.
        if (fn.startsWith('admin_')) rpcSpy?.(fn, params);
        if (fn === 'admin_requeue_enrichment') return { data: 3, error: null };
        if (fn === 'admin_retry_failed_enrichment') return { data: 2, error: null };
        return { data: statusResult, error: null };
      }),
    },
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-admin', email: 'admin@nowopen.africa' },
    session: null,
    loading: false,
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

import EnrichmentOpsPanel from '../components/admin/EnrichmentOpsPanel';
import * as supabaseModule from '../lib/supabase';

const sb = supabaseModule as unknown as {
  supabase: {
    from: ReturnType<typeof vi.fn>;
    rpc: ReturnType<typeof vi.fn>;
  };
  __setStatus: (s: object | null | undefined) => void;
  __setJobsError: (m: string | null) => void;
  __setRpcSpy: (spy: (fn: string, params: unknown) => void) => void;
};

const renderWithToaster = () => render(
  <>
    <EnrichmentOpsPanel />
    <Toaster />
  </>,
);

describe('EnrichmentOpsPanel smoke', () => {
  beforeEach(() => {
    sb.__setStatus({
      scheduled: true, schedule: '*/15 * * * *', active: true,
      last_run: '2026-09-12T00:00:00.000Z', last_status: 'succeeded',
      configured: true, queued: 2, succeeded: 41,
    });
    sb.__setJobsError(null);
    sb.__setRpcSpy(() => undefined);
    sb.supabase.rpc.mockClear();
  });

  it('renders the scheduler verdict, tiles and the recent queue', async () => {
    renderWithToaster();
    await screen.findByText('Meat Club Lagos'); // queue loaded
    expect(screen.getAllByText(/Running/).length).toBeGreaterThan(0);
    expect(screen.getByText(/\/15 \* \* \* \*/)).toBeInTheDocument();
    expect(screen.getByText('2 job(s)')).toBeInTheDocument();
    expect(screen.getByText('41')).toBeInTheDocument();
    expect(screen.getByText('Meat Club Lagos')).toBeInTheDocument();
    expect(screen.getByText('Nkanchi Beauty')).toBeInTheDocument();
    expect(screen.getByText('Hours')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enqueue what is due now/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry failed jobs/ })).toBeInTheDocument();
  });

  it('shows the failed row as retryable with its reason', async () => {
    renderWithToaster();
    await screen.findByText('Meat Club Lagos');
    expect(screen.getByText(/Nominatim rate-limited/)).toBeInTheDocument();
    expect(screen.getAllByText('retryable').length).toBeGreaterThan(0);
  });

  it('enqueues what is due now through the admin lever', async () => {
    let call: unknown = null;
    sb.__setRpcSpy((fn, params) => { call = { fn, params }; });
    renderWithToaster();
    await userEvent.click(await screen.findByRole('button', { name: /Enqueue what is due now/ }));
    await waitFor(() => expect(call).not.toBeNull());
    expect(call).toEqual({ fn: 'admin_requeue_enrichment', params: { p_max: 20 } });
    expect(await screen.findByText(/Queued 3 business\(es\)/)).toBeInTheDocument();
  });

  it('returns failed jobs to the line', async () => {
    let call: unknown = null;
    sb.__setRpcSpy((fn, params) => { call = { fn, params }; });
    renderWithToaster();
    await userEvent.click(await screen.findByRole('button', { name: /Retry failed jobs/ }));
    await waitFor(() => expect(call).not.toBeNull());
    expect(call).toEqual({ fn: 'admin_retry_failed_enrichment', params: { p_max: 25 } });
    expect(await screen.findByText(/Returned 2 failed job\(s\)/)).toBeInTheDocument();
  });

  it('is honestly idle when no endpoint is configured', async () => {
    sb.__setStatus({ scheduled: true, schedule: '*/15 * * * *', active: true, configured: false, queued: 0, succeeded: 0 });
    renderWithToaster();
    expect(await screen.findByText(/Not configured/)).toBeInTheDocument();
    expect(screen.getByText(/private_config\.enrichment_endpoint/)).toBeInTheDocument();
  });

  it('shows a designed "not provisioned" state instead of the raw missing-table error', async () => {
    sb.__setJobsError("PGRST204 Could not find the table 'public.business_enrichment_jobs' in the schema cache");
    renderWithToaster();
    expect(await screen.findByText(/not yet provisioned/)).toBeInTheDocument();
    expect(screen.queryByText(/PGRST204/)).not.toBeInTheDocument();
    expect(screen.queryByText(/business_enrichment_jobs/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enqueue what is due now/ })).not.toBeInTheDocument();
  });
});