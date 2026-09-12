import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The admin editor for a listing NowOpen maintains.
 *
 * The property worth pinning is the REFUSAL, not the form: a claimed profile
 * must never open for editing from the console, and the admin must be told
 * why. A missing button with no explanation sends them to the SQL editor,
 * where nothing is logged and no guard applies.
 */

const state: {
  business: Record<string, unknown> | null;
  error: { message: string } | null;
} = { business: null, error: null };

vi.mock('../lib/supabase', () => {
  const chain = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {
      select: vi.fn(() => c),
      eq: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => c),
      maybeSingle: vi.fn(async () => ({
        data: state.error ? null : state.business,
        error: state.error,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (onF?: any) => Promise.resolve({ data: [], error: null }).then(onF),
    };
    return c;
  };
  return {
    supabase: {
      from: vi.fn(() => chain()),
      rpc: vi.fn(async () => ({ data: null, error: null })),
      storage: { from: vi.fn(() => ({ upload: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })) })) },
    },
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', email: 'admin@nowopen.africa' }, loading: false }),
}));

import AdminBusinessEditor from '../components/admin/AdminBusinessEditor';

const open = (role: string | null = 'admin') => render(
  <MemoryRouter>
    <AdminBusinessEditor businessId="b1" role={role} onClose={() => {}} />
  </MemoryRouter>,
);

beforeEach(() => {
  state.business = {
    id: 'b1', name: 'Zanzibar Coffee', username: 'zanzibar-coffee',
    claim_status: 'unclaimed', user_id: null, category: 'Café & Bakery',
    enabled_modules: [],
  };
  state.error = null;
});

describe('AdminBusinessEditor', () => {
  it('opens an unclaimed listing for editing', async () => {
    open();
    await waitFor(() => expect(screen.getByText('Zanzibar Coffee')).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /Details/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Story/i })).toBeInTheDocument();
  });

  it('refuses a claimed listing, and says why', async () => {
    state.business = { ...state.business, claim_status: 'claimed', user_id: 'owner-9' };
    open();

    await waitFor(() => expect(screen.getByText(/only they can change it now/i)).toBeInTheDocument());
    // And offers no way in.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('refuses while a claim is pending', async () => {
    state.business = { ...state.business, claim_status: 'claim_pending' };
    open();
    await waitFor(() => expect(screen.getByText(/claim is pending/i)).toBeInTheDocument());
  });

  it('refuses an editor even on an unclaimed listing', async () => {
    open('editor');
    await waitFor(() => expect(screen.getByText(/admin action/i)).toBeInTheDocument());
  });

  it('reports a failed read instead of showing an empty form', async () => {
    // supabase-js resolves with { error } — a try/catch here would render
    // "not found" for every failure, including a permissions problem.
    state.error = { message: 'permission denied' };
    open();
    await waitFor(() => expect(screen.getByText(/permission denied/i)).toBeInTheDocument());
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});
