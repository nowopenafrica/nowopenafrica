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
  const rows = [
    {
      id: 'p1', business_id: 'b1', field_name: 'opening_hours',
      current_value: 'Mon–Sat: 9AM–7PM', proposed_value: 'Mon–Sun: 8AM–10PM',
      source_id: 'openstreetmap', source_url: 'https://www.openstreetmap.org/node/1', confidence: 92,
      extraction_method: 'structured_data', evidence_id: 'e1',
      reason: 'OpenStreetMap hours differ from stored hours.', status: 'pending',
      reviewed_by: null, reviewed_at: null, note: null, auto_applied: false,
      created_at: '2026-09-11T12:00:00.000Z', updated_at: '2026-09-11T12:00:00.000Z',
      business: { name: 'Meat Club Lagos', username: 'meat-club' },
    },
    {
      id: 'p2', business_id: 'b2', field_name: 'logo_url',
      current_value: null, proposed_value: 'https://cdn.example/logo.png',
      source_id: 'wikimedia', source_url: 'https://commons.example/file', confidence: 80,
      extraction_method: 'structured_data', evidence_id: 'e2',
      reason: 'Logo found on Wikimedia Commons.', status: 'approved',
      reviewed_by: 'u-admin', reviewed_at: '2026-09-11T13:00:00.000Z', note: 'Approved in change review', auto_applied: false,
      created_at: '2026-09-10T12:00:00.000Z', updated_at: '2026-09-11T13:00:00.000Z',
      business: { name: 'Nkanchi Beauty', username: 'nkanchi' },
    },
    {
      id: 'p3', business_id: 'b3', field_name: 'email',
      current_value: 'old@example.com', proposed_value: 'new@example.com',
      source_id: 'google', source_url: 'https://business.google.example', confidence: 55,
      extraction_method: 'ai_extracted', evidence_id: 'e3',
      reason: 'Email updated on the Google profile.', status: 'rejected',
      reviewed_by: 'u-admin', reviewed_at: '2026-09-09T09:00:00.000Z', note: 'Wrong domain', auto_applied: false,
      created_at: '2026-09-09T08:00:00.000Z', updated_at: '2026-09-09T09:00:00.000Z',
      business: { name: 'Third Spot', username: 'third-spot' },
    },
  ];
  let currentError: { message: string } | null = null;
  const result = () => ({ data: rows, error: currentError });
  let updateSpy: ((patch: unknown) => void) | undefined;
  let rpcSpy: ((fn: string, params: unknown) => void) | undefined;
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    update: (patch: unknown) => { updateSpy?.(patch); return chain; },
    then: (onF?: any, onR?: any) => Promise.resolve(result()).then(onF, onR),
    catch: (onR?: any) => Promise.resolve(result()).catch(onR),
    finally: (onF?: any) => Promise.resolve(result()).finally(onF),
  };
  return {
    __setReadError: (m: string | null) => { currentError = m ? { message: m } : null; },
    __setUpdateSpy: (spy: (patch: unknown) => void) => { updateSpy = spy; },
    __setRpcSpy: (spy: (fn: string, params: unknown) => void) => { rpcSpy = spy; },
    supabase: {
      from: vi.fn(() => chain),
      rpc: vi.fn(async (fn: string, params: unknown) => {
        rpcSpy?.(fn, params);
        return { data: true, error: null };
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

import ChangeProposalsPanel from '../components/admin/ChangeProposalsPanel';
import * as supabaseModule from '../lib/supabase';

const sb = supabaseModule as unknown as {
  supabase: {
    from: ReturnType<typeof vi.fn>;
    rpc: ReturnType<typeof vi.fn>;
  };
  __setReadError: (m: string | null) => void;
  __setUpdateSpy: (spy: (patch: unknown) => void) => void;
  __setRpcSpy: (spy: (fn: string, params: unknown) => void) => void;
};

describe('ChangeProposalsPanel smoke', () => {
  beforeEach(() => {
    sb.__setReadError(null);
    sb.__setUpdateSpy(() => undefined);
    sb.__setRpcSpy(() => undefined);
    sb.supabase.rpc.mockClear();
  });

  it('queues only pending proposals for review, showing the diff', async () => {
    render(<ChangeProposalsPanel />);
    expect(await screen.findByText(/Meat Club Lagos/)).toBeInTheDocument();
    expect(screen.getByText('Mon–Sun: 8AM–10PM')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pending \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Approved & applied \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rejected \(1\)/ })).toBeInTheDocument();
    expect(screen.queryByText(/Nkanchi Beauty/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Third Spot/)).not.toBeInTheDocument();
  });

  it('approves a pending proposal and asks the applier to write it', async () => {
    let patch: unknown = null;
    let rpcCall: unknown = null;
    sb.__setUpdateSpy((p) => { patch = p; });
    sb.__setRpcSpy((fn, params) => { rpcCall = { fn, params }; });
    render(
      <>
        <ChangeProposalsPanel />
        <Toaster />
      </>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(patch).not.toBeNull());
    expect(sb.supabase.from).toHaveBeenCalledWith('business_change_proposals');
    expect(patch).toMatchObject({ status: 'approved', reviewed_by: 'u-admin', reviewed_at: expect.any(String) });
    await waitFor(() => expect(rpcCall).not.toBeNull());
    expect(rpcCall).toEqual({ fn: 'apply_business_change_proposal', params: { p_proposal: 'p1' } });
    expect(await screen.findByText(/Applied — the edits are now on the live profile\./)).toBeInTheDocument();
  });

  it('rejects a proposal without touching the business row', async () => {
    let patch: unknown = null;
    sb.__setUpdateSpy((p) => { patch = p; });
    render(
      <>
        <ChangeProposalsPanel />
        <Toaster />
      </>,
    );
    await screen.findByText(/Meat Club Lagos/);
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(patch).not.toBeNull());
    expect(patch).toMatchObject({ status: 'rejected', reviewed_by: 'u-admin' });
    expect(sb.supabase.rpc).not.toHaveBeenCalled();
    expect(await screen.findByText(/Rejected\./)).toBeInTheDocument();
  });

  it('offers a retry on an approved proposal that was never applied', async () => {
    render(<ChangeProposalsPanel />);
    const all = screen.getByRole('button', { name: /All/ });
    await userEvent.click(all);
    expect(screen.getByRole('button', { name: 'Retry apply' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Apply' }).length).toBe(1);
  });

  it('shows a designed “not provisioned” state instead of the raw missing-table error', async () => {
    sb.__setReadError("PGRST204 Could not find the table 'public.business_change_proposals' in the schema cache");
    render(<ChangeProposalsPanel />);
    expect(await screen.findByText(/not yet provisioned/)).toBeInTheDocument();
    expect(screen.queryByText(/PGRST204/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Meat Club Lagos/)).not.toBeInTheDocument();
  });
});