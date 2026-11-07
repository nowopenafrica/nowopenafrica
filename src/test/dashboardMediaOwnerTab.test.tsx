import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The Dashboard's "Media owner" tab, rendered for real (not a source grep).
 *
 * The supabase client is mocked with the queries the Dashboard already makes;
 * each table's rows (and an optional error) are set per test. Nothing reaches
 * a database.
 */

const db: {
  tables: Record<string, unknown[]>;
  errors: Record<string, { message: string }>;
} = { tables: {}, errors: {} };

vi.mock('../lib/supabase', () => {
  const q = (table: string) => {
    const result = () => (db.errors[table]
      ? { data: null, error: db.errors[table] }
      : { data: db.tables[table] ?? [], error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'range']) chain[m] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => {
      const r = result();
      return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain.then = (f?: any, r?: any) => Promise.resolve(result()).then(f, r);
    return chain;
  };
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      from: vi.fn((table: string) => q(table)),
      rpc: vi.fn(async () => ({ data: [], error: null })),
    },
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'owner@example.com' },
    session: null,
    loading: false,
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => ({
    currency: 'USD', setCurrency: vi.fn(), format: (n: number) => `$${n}`, formatUsd: (n: number) => `$${n}`,
    rate: 1, ratesLive: false, currencies: [], info: { code: 'USD', symbol: '$' },
  }),
}));

import Dashboard from '../pages/Dashboard';

const renderAt = (url = '/dashboard') => render(
  <MemoryRouter initialEntries={[url]}>
    <Dashboard />
  </MemoryRouter>,
);

/** The Overview's business data finished loading (the tablist is stable). */
const settled = async () => {
  await waitFor(() => expect(screen.getByRole('tab', { name: /Bookings & Enquiries/ })).toBeInTheDocument());
  // Let fetchUserData's chained awaits finish.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  db.tables = {};
  db.errors = {};
});

describe('Dashboard Media owner tab', () => {
  it('is hidden for a user with no owned or member business', async () => {
    renderAt();
    await settled();
    expect(screen.queryByRole('tab', { name: /Media owner/ })).not.toBeInTheDocument();
    expect(screen.queryByText("We couldn't check your business memberships just now.")).not.toBeInTheDocument();
  });

  it('shows for a member of a business they do not own', async () => {
    db.tables.business_members = [{ business_id: 'b2', businesses: { id: 'b2', name: 'Shared Shop' } }];
    renderAt();
    expect(await screen.findByRole('tab', { name: /Media owner/ })).toBeInTheDocument();
  });

  it('shows for an owner', async () => {
    db.tables.businesses = [{ id: 'b1', name: 'Test Cafe', category: 'restaurant', user_id: 'u1' }];
    renderAt();
    expect(await screen.findByRole('tab', { name: /Media owner/ })).toBeInTheDocument();
  });

  it('?tab=media-owner opens it', async () => {
    db.tables.business_members = [{ business_id: 'b2', businesses: { id: 'b2', name: 'Shared Shop' } }];
    renderAt('/dashboard?tab=media-owner');
    expect(await screen.findByRole('checkbox', { name: 'I sell advertising space' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Media owner/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('?tab=media-owner falls back to Overview when there is no business', async () => {
    renderAt('/dashboard?tab=media-owner');
    await settled();
    await waitFor(() => expect(screen.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true'));
  });

  it('says so instead of silently dropping the tab when memberships cannot be read', async () => {
    db.errors.business_members = { message: 'relation "business_members" does not exist' };
    renderAt('/dashboard?tab=media-owner');
    expect(await screen.findByText("We couldn't check your business memberships just now.")).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Media owner/ })).toHaveAttribute('aria-selected', 'true');
  });
});
