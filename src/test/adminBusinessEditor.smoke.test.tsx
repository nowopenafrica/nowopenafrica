import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

let insertSpy: ((rows: unknown[]) => void) | undefined;

vi.mock('../lib/supabase', () => {
  const chain = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {
      select: vi.fn(() => c),
      eq: vi.fn(() => c),
      ilike: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => c),
      insert: (rows: unknown[]) => { insertSpy?.(rows); return c; },
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
    __setInsertSpy: (spy: (rows: unknown[]) => void) => { insertSpy = spy; },
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', email: 'admin@nowopen.africa' }, loading: false }),
}));

import * as supabaseModule from '../lib/supabase';
import AdminBusinessEditor from '../components/admin/AdminBusinessEditor';

const sb = supabaseModule as unknown as {
  __setInsertSpy: (spy: (rows: unknown[]) => void) => void;
};

const open = (role: string | null = 'admin') => render(
  <MemoryRouter>
    <AdminBusinessEditor businessId="b1" role={role} onClose={() => {}} />
  </MemoryRouter>,
);

beforeEach(() => {
  sb.__setInsertSpy(() => undefined);
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

  it('opens an unclaimed listing for an editor', async () => {
    open('editor');
    await waitFor(() => expect(screen.getByText('Zanzibar Coffee')).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /Details/i })).toBeInTheDocument();
    expect(screen.queryByText(/admin action/i)).not.toBeInTheDocument();
  });

  it('refuses an editor a claimed listing', async () => {
    state.business = { ...state.business, claim_status: 'claimed', user_id: 'owner-9' };
    open('editor');
    await waitFor(() => expect(screen.getByText(/only they can change it now/i)).toBeInTheDocument());
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('reports a failed read instead of showing an empty form', async () => {
    // supabase-js resolves with { error } — a try/catch here would render
    // "not found" for every failure, including a permissions problem.
    state.error = { message: 'permission denied' };
    open();
    await waitFor(() => expect(screen.getByText(/permission denied/i)).toBeInTheDocument());
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('creates an unclaimed business from the console', async () => {
    let inserted: unknown = null;
    sb.__setInsertSpy((rows) => { inserted = rows; });
    const onClose = vi.fn();

    render(
      <MemoryRouter>
        <AdminBusinessEditor businessId={undefined} creating role="admin" onClose={onClose} onSaved={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Add a new business')).toBeInTheDocument();
    expect(screen.getByText('Add New Business')).toBeInTheDocument();
    expect(screen.getByText(/Saved as an unclaimed listing NowOpen maintains/i)).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();

    const field = (label: string) => within(screen.getByText(label).parentElement as HTMLElement);

    await userEvent.type(field('Business Name').getByRole('textbox'), 'Lekki Tea House');
    await userEvent.type(field('Description').getByRole('textbox'), 'Fresh tea and coffee in Lekki.');
    await userEvent.selectOptions(field('Category').getByRole('combobox'), 'Café & Bakery');
    await userEvent.click(screen.getByRole('button', { name: 'Save Business' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(inserted).toBeDefined();
    const row = (inserted as Record<string, unknown>[])[0];
    expect(row).toMatchObject({
      name: 'Lekki Tea House',
      username: 'lekki-tea-house',
      user_id: null,
      claim_status: 'unclaimed',
      data_status: 'admin_curated',
    });
  });
});
