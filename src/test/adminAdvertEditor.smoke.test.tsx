import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';

/**
 * Editing a placement from the admin console.
 *
 * Two properties are worth pinning. First, an admin's save must NOT carry the
 * owner filter: the owner path scopes every read and update by `user_id`, and
 * keeping that filter in the console would update zero rows while reporting
 * success. Second, an editor must be refused with a reason — their role can
 * read the row but the database refuses the write, so a button would turn a
 * permissions rule into a bug report.
 */

const state: {
  advert: Record<string, unknown> | null;
  error: { message: string } | null;
  updateError: { message: string } | null;
  businesses: Array<{ id: string; name: string }>;
} = { advert: null, error: null, updateError: null, businesses: [] };

interface UpdateCall {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}

let updates: UpdateCall[] = [];

vi.mock('../lib/supabase', () => {
  const chain = (table: string) => {
    let mode: 'select' | 'update' | 'insert' = 'select';
    let payload: Record<string, unknown> = {};
    const filters: Array<[string, unknown]> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {
      select: vi.fn(() => c),
      update: vi.fn((next: Record<string, unknown>) => { mode = 'update'; payload = next; return c; }),
      insert: vi.fn(() => { mode = 'insert'; return c; }),
      eq: vi.fn((column: string, value: unknown) => { filters.push([column, value]); return c; }),
      limit: vi.fn(() => c),
      order: vi.fn(() => c),
      maybeSingle: vi.fn(async () => ({
        data: state.error ? null : state.advert,
        error: state.error,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (resolve?: any) => {
        if (mode === 'update') {
          updates.push({ table, payload, filters });
          return Promise.resolve({ data: null, error: state.updateError }).then(resolve);
        }
        if (mode === 'insert') return Promise.resolve({ data: null, error: null }).then(resolve);
        return Promise.resolve({
          data: table === 'businesses' ? state.businesses : [],
          error: null,
        }).then(resolve);
      },
    };
    return c;
  };
  return {
    supabase: {
      from: vi.fn((table: string) => chain(table)),
      rpc: vi.fn(async () => ({ data: null, error: null })),
      storage: { from: vi.fn(() => ({ upload: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })) })) },
    },
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', email: 'admin@nowopen.africa' }, loading: false }),
}));

// The form reports failures through a toast, not inline text. Mocking the
// toast is what lets us assert the message without mounting a Toaster.
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import toast from 'react-hot-toast';
import AdminAdvertEditor from '../components/admin/AdminAdvertEditor';

const open = (
  role: string | null = 'admin',
  onClose = vi.fn(),
  onSaved = vi.fn(),
) => render(
  <MemoryRouter>
    <AdminAdvertEditor advertId="a1" role={role} onClose={onClose} onSaved={onSaved} />
  </MemoryRouter>,
);

beforeEach(() => {
  updates = [];
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  state.error = null;
  state.updateError = null;
  state.businesses = [];
  state.advert = {
    id: 'a1',
    title: 'Lagos Billboard',
    description: 'Roadside board on the Lekki expressway.',
    category: 'Billboard',
    location: 'Lekki, Lagos',
    budget: 1000000,
    duration: 30,
    pricing: 50000,
    status: 'active',
    business_id: 'b1',
    image_url: '',
  };
});

describe('AdminAdvertEditor', () => {
  it('opens a placement for an admin', async () => {
    open();
    await waitFor(() => expect(screen.getByDisplayValue('Lagos Billboard')).toBeInTheDocument());
    expect(screen.getByText('Edit placement')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save placement' })).toBeInTheDocument();
  });

  it('saves by id alone, without the owner filter', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    open('admin', onClose, onSaved);

    const title = await screen.findByDisplayValue('Lagos Billboard');
    await userEvent.clear(title);
    await userEvent.type(title, 'Lagos Billboard — Marina');
    await userEvent.click(screen.getByRole('button', { name: 'Save placement' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const call = updates.find((u) => u.table === 'advertisements');
    expect(call, 'no update reached advertisements').toBeTruthy();
    expect(call!.payload.title).toBe('Lagos Billboard — Marina');
    // The row is the target. A user_id filter here would match another
    // person's placement zero times and still report success.
    expect(call!.filters).toEqual([['id', 'a1']]);
  });

  it('shows a save failure instead of closing on success', async () => {
    state.updateError = { message: 'new row violates row-level security policy' };
    const onClose = vi.fn();
    open('admin', onClose);

    await screen.findByDisplayValue('Lagos Billboard');
    await userEvent.click(screen.getByRole('button', { name: 'Save placement' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/row-level security/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('refuses an editor, and says why', async () => {
    open('editor');
    await waitFor(() => expect(screen.getByText(/Only an admin can change a placement/i)).toBeInTheDocument());
    // And offers no way in.
    expect(screen.queryByRole('button', { name: 'Save placement' })).not.toBeInTheDocument();
  });

  it('reports a failed read instead of showing an empty form', async () => {
    state.error = { message: 'permission denied' };
    open();
    await waitFor(() => expect(screen.getByText(/permission denied/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Save placement' })).not.toBeInTheDocument();
  });

  it('is reached from the Adverts tab, for a role the database accepts', () => {
    const dash = readFileSync('src/pages/AdminDashboard.tsx', 'utf8');
    expect(dash).toMatch(/canEditAdverts\(role\) && \(/);
    expect(dash).toMatch(/setEditAdvertId\(a\.id\)/);
    expect(dash).toMatch(/<AdminAdvertEditor/);
  });
});
