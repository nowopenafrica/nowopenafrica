import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * Claiming an existing placement, against a fake supabase client.
 *
 * Nothing here reaches a database or storage: rpc, from() and storage are
 * mocked and every call is recorded, so a refused claim can be shown to make
 * NO call at all. supabase-js resolves with `{ data, error }`, never throws.
 */

interface Call { op: string; name?: string; args?: unknown; table?: string; payload?: unknown }
const calls: Call[] = [];
const state: {
  user: { id: string } | null;
  owned: { id: string }[];
  member: { business_id: string }[];
  owner: Record<string, unknown> | null;
  claims: Record<string, unknown>[];
  rpcError: { message: string } | null;
} = { user: null, owned: [], member: [], owner: null, claims: [], rpcError: null };

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: state.user, session: null, loading: false, signOut: vi.fn() }),
}));

vi.mock('../lib/supabase', () => {
  const chainFor = (table: string) => {
    const call: Call = { op: 'select', table };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const m of ['select', 'eq', 'in', 'order', 'range']) c[m] = vi.fn(() => c);
    c.insert = vi.fn((payload: unknown) => { call.op = 'insert'; call.payload = payload; return c; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.then = (f?: any, r?: any) => {
      calls.push(call);
      const rows = table === 'businesses' ? state.owned
        : table === 'business_members' ? state.member
        : table === 'placement_claims' ? state.claims : [];
      return Promise.resolve({ data: rows, error: null }).then(f, r);
    };
    return c;
  };
  return {
    supabase: {
      from: vi.fn((t: string) => chainFor(t)),
      rpc: vi.fn(async (name: string, args: unknown) => {
        calls.push({ op: 'rpc', name, args });
        if (name === 'get_my_media_owner') return { data: state.owner ? [state.owner] : [], error: null };
        if (name === 'owner_claim_placement') {
          return state.rpcError ? { data: null, error: state.rpcError } : { data: 'claim-1', error: null };
        }
        return { data: null, error: null };
      }),
      storage: {
        from: vi.fn((bucket: string) => ({
          upload: vi.fn(async (path: string, _f: unknown, opts: unknown) => {
            calls.push({ op: 'upload', name: bucket, args: { path, opts } });
            return { data: {}, error: null };
          }),
        })),
      },
    },
  };
});

import ClaimPlacementButton from '../components/promote/ClaimPlacementButton';
import { claimPlacement } from '../lib/promote/partner';

const rpcCalls = (name: string) => calls.filter((c) => c.op === 'rpc' && c.name === name);
const letter = () => new File(['x'], 'letter.pdf', { type: 'application/pdf' });

beforeEach(() => {
  calls.length = 0;
  state.user = { id: 'u1' };
  state.owned = [{ id: 'b1' }];
  state.member = [];
  state.owner = { id: 'o1', name: 'Lagos Boards', website: null, country_codes: ['NG'], verification: 'unverified', verified_at: null, verification_note: null };
  state.claims = [];
  state.rpcError = null;
});

const BUTTON = 'Is this your site? Claim it';

describe('ClaimPlacementButton', () => {
  it('shows for a signed-in member of a media-owner business', async () => {
    render(<ClaimPlacementButton advertId="a1" />);
    const btn = await screen.findByRole('button', { name: BUTTON });
    expect(btn.className).toContain('min-h-[44px]');
  });

  it('finds the media owner through a team membership too', async () => {
    state.owned = [];
    state.member = [{ business_id: 'b2' }];
    render(<ClaimPlacementButton advertId="a1" />);
    await screen.findByRole('button', { name: BUTTON });
    expect(rpcCalls('get_my_media_owner')[0].args).toEqual({ p_business_id: 'b2' });
  });

  it('never shows to a visitor, and asks the database nothing', async () => {
    state.user = null;
    const { container } = render(<ClaimPlacementButton advertId="a1" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
    expect(calls).toHaveLength(0);
  });

  it('never shows to a signed-in person whose business is not a media owner', async () => {
    state.owner = null;
    const { container } = render(<ClaimPlacementButton advertId="a1" />);
    await waitFor(() => expect(rpcCalls('get_my_media_owner').length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it('is not offered to a media owner whose verification was rejected', async () => {
    state.owner = { ...state.owner!, verification: 'rejected' };
    const { container } = render(<ClaimPlacementButton advertId="a1" />);
    await waitFor(() => expect(rpcCalls('get_my_media_owner').length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it('reads "Claim sent for review" when this owner already has a pending claim here', async () => {
    state.claims = [{ id: 'c1', advert_id: 'a1', status: 'pending', reason: null }];
    render(<ClaimPlacementButton advertId="a1" />);
    await screen.findByText('Claim sent for review');
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
  });

  it('ignores claims on other placements', async () => {
    state.claims = [{ id: 'c1', advert_id: 'other', status: 'pending', reason: null }];
    render(<ClaimPlacementButton advertId="a1" />);
    await screen.findByRole('button', { name: BUTTON });
  });

  it('shows the reason of a rejected claim and offers the claim again', async () => {
    state.claims = [{ id: 'c1', advert_id: 'a1', status: 'rejected', reason: 'The permit names another company' }];
    render(<ClaimPlacementButton advertId="a1" />);
    await screen.findByText(/The permit names another company/);
    expect(screen.getByRole('button', { name: BUTTON })).toBeInTheDocument();
  });

  it('files an owner claim with the statement, then reads "Claim sent for review"', async () => {
    render(<ClaimPlacementButton advertId="a1" />);
    fireEvent.click(await screen.findByRole('button', { name: BUTTON }));
    fireEvent.change(screen.getByLabelText('How is this site yours?'), { target: { value: ' We own the structure ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send claim' }));
    await screen.findByText('Claim sent for review');
    expect(rpcCalls('owner_claim_placement')[0].args).toEqual({
      p_advert_id: 'a1', p_owner_id: 'o1', p_role: 'owner', p_statement: 'We own the structure', p_document_path: null,
    });
    expect(calls.some((c) => c.op === 'upload')).toBe(false);
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
  });

  it('refuses a representative claim with no letter before any upload or call', async () => {
    render(<ClaimPlacementButton advertId="a1" />);
    fireEvent.click(await screen.findByRole('button', { name: BUTTON }));
    fireEvent.click(screen.getByLabelText('I represent the owner'));
    fireEvent.change(screen.getByLabelText('How is this site yours?'), { target: { value: 'We manage it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send claim' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/authorisation letter/i);
    expect(calls.some((c) => c.op === 'upload')).toBe(false);
    expect(rpcCalls('owner_claim_placement')).toHaveLength(0);
    expect(screen.queryByText('Claim sent for review')).toBeNull();
  });

  it('uploads the letter (upsert false, own folder) and files it with the claim', async () => {
    render(<ClaimPlacementButton advertId="a1" />);
    fireEvent.click(await screen.findByRole('button', { name: BUTTON }));
    fireEvent.click(screen.getByLabelText('I represent the owner'));
    fireEvent.change(screen.getByLabelText('How is this site yours?'), { target: { value: 'We manage it' } });
    fireEvent.change(screen.getByLabelText('Authorisation letter'), { target: { files: [letter()] } });
    fireEvent.click(screen.getByRole('button', { name: 'Send claim' }));
    await screen.findByText('Claim sent for review');
    const up = calls.find((c) => c.op === 'upload')!;
    expect(up.name).toBe('verification-docs');
    const { path, opts } = up.args as { path: string; opts: { upsert: boolean } };
    expect(path).toMatch(/^media-owners\/o1\/authorisation_letter-\d+\.pdf$/);
    expect(opts.upsert).toBe(false);
    expect(rpcCalls('owner_claim_placement')[0].args).toMatchObject({ p_role: 'authorised_representative', p_document_path: path });
  });

  it('shows the database refusal in words and does not claim success', async () => {
    state.rpcError = { message: 'This placement already has an owner' };
    render(<ClaimPlacementButton advertId="a1" />);
    fireEvent.click(await screen.findByRole('button', { name: BUTTON }));
    fireEvent.change(screen.getByLabelText('How is this site yours?'), { target: { value: 'Ours' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send claim' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This placement already has an owner');
    expect(screen.queryByText('Claim sent for review')).toBeNull();
  });
});

describe('claimPlacement', () => {
  it('refuses an empty statement without a call', async () => {
    const r = await claimPlacement('a1', 'o1', 'owner', '   ', null);
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('refuses a wrong file type before any upload', async () => {
    const r = await claimPlacement('a1', 'o1', 'authorised_representative', 'ours', new File(['x'], 'l.exe'));
    expect(r.ok).toBe(false);
    expect(calls.some((c) => c.op === 'upload')).toBe(false);
  });
});
