import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

/**
 * "Claims waiting for a decision" in the admin Media owners tab, against a fake
 * supabase client. Approve and reject go through admin_decide_claim; reject
 * needs a reason and a refused reject makes no call.
 */

interface Call { op: string; name?: string; args?: unknown; table?: string }
const calls: Call[] = [];
const state: { claims: unknown[]; rpcError: { message: string } | null } = { claims: [], rpcError: null };
const openSpy = vi.fn();

vi.mock('../lib/supabase', () => {
  const chainFor = (table: string) => {
    const call: Call = { op: 'select', table };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'range']) c[m] = vi.fn(() => c);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.then = (f?: any, r?: any) => {
      calls.push(call);
      const rows = table === 'placement_claims' ? state.claims
        : table === 'media_owners' ? [{ id: 'o1', name: 'Lagos Boards', website: null, country_codes: ['NG'], business_id: 'b1', verification: 'verified', verification_note: 'x', relationship: 'active' }]
        : table === 'advertisements' ? [{ id: 'a1', title: 'Third Mainland board', lifecycle: 'imported', owner_id: null, owner_role: null, location: 'Lagos, Nigeria' }]
        : [];
      return Promise.resolve({ data: rows, error: null }).then(f, r);
    };
    return c;
  };
  return {
    supabase: {
      from: vi.fn((t: string) => chainFor(t)),
      rpc: vi.fn(async (name: string, args: unknown) => {
        calls.push({ op: 'rpc', name, args });
        return state.rpcError ? { data: null, error: state.rpcError } : { data: null, error: null };
      }),
      storage: {
        from: vi.fn((bucket: string) => ({
          createSignedUrl: vi.fn(async (path: string) => {
            calls.push({ op: 'sign', name: bucket, args: { path } });
            return { data: { signedUrl: `https://signed.example/${path}` }, error: null };
          }),
        })),
      },
    },
  };
});

import MediaOwnersPanel from '../components/admin/MediaOwnersPanel';

const decide = () => calls.filter((c) => c.op === 'rpc' && c.name === 'admin_decide_claim');

beforeEach(() => {
  calls.length = 0;
  state.rpcError = null;
  state.claims = [
    { id: 'c1', advert_id: 'a1', owner_id: 'o1', role: 'authorised_representative', statement: 'We manage the site for the landlord',
      document_path: 'media-owners/o1/authorisation_letter-1.pdf', status: 'pending', reason: null, created_at: '2026-11-01T10:00:00Z' },
  ];
  openSpy.mockReset();
  vi.stubGlobal('open', openSpy);
});

const section = async () => {
  render(<MediaOwnersPanel />);
  return within(await screen.findByRole('region', { name: 'Claims waiting for a decision' }));
};

describe('Claims waiting for a decision', () => {
  it('lists the placement, who claims, the statement and the letter', async () => {
    const s = await section();
    await s.findByText('Third Mainland board');
    expect(s.getByText(/Lagos Boards/)).toBeInTheDocument();
    expect(s.getByText(/We manage the site for the landlord/)).toBeInTheDocument();
    expect(s.getByText(/Claims waiting for a decision \(1\)/)).toBeInTheDocument();
    fireEvent.click(s.getByRole('button', { name: /Open authorisation letter/ }));
    await waitFor(() => expect(openSpy).toHaveBeenCalled());
    expect(calls.some((c) => c.op === 'sign' && c.name === 'verification-docs')).toBe(true);
  });

  it('says so when nothing is waiting', async () => {
    state.claims = [];
    const s = await section();
    await s.findByText('No claims are waiting for a decision.');
  });

  it('approves through admin_decide_claim with no reason', async () => {
    const s = await section();
    fireEvent.click(await s.findByRole('button', { name: 'Approve claim for Third Mainland board' }));
    await waitFor(() => expect(decide()).toHaveLength(1));
    expect(decide()[0].args).toEqual({ p_claim_id: 'c1', p_approve: true, p_reason: null });
  });

  it('keeps Reject disabled until a reason is typed, then rejects with it', async () => {
    const s = await section();
    fireEvent.click(await s.findByRole('button', { name: 'Reject claim for Third Mainland board' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Reject claim' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(decide()).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: ' The permit names another company ' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(decide()).toHaveLength(1));
    expect(decide()[0].args).toEqual({ p_claim_id: 'c1', p_approve: false, p_reason: 'The permit names another company' });
  });

  it('shows the database refusal in words', async () => {
    state.rpcError = { message: 'This placement already has an owner' };
    const s = await section();
    fireEvent.click(await s.findByRole('button', { name: 'Approve claim for Third Mainland board' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This placement already has an owner');
  });
});
