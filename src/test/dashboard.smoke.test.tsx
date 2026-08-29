import { describe, it, vi, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/supabase', () => {
  const tableData: Record<string, unknown[]> = {
    businesses: [
      { id: 'b1', name: 'Test Cafe', category: 'restaurant', user_id: 'u1' },
    ],
  };
  const q = (data: unknown) => {
    const result = { data, error: null };
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: Array.isArray(data) ? data[0] ?? null : data ?? null,
        error: null,
      })),
      then: (onF?: any, onR?: any) => Promise.resolve(result).then(onF, onR),
      catch: (onR?: any) => Promise.resolve(result).catch(onR),
      finally: (onF?: any) => Promise.resolve(result).finally(onF),
    };
    return chain;
  };
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      from: vi.fn((table: string) => q(tableData[table] ?? [])),
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
    currency: 'USD',
    setCurrency: vi.fn(),
    format: (n: number) => `$${n}`,
    formatUsd: (n: number) => `$${n}`,
    rate: 1,
    ratesLive: false,
    currencies: [],
    info: { code: 'USD', symbol: '$' },
  }),
}));

import Dashboard from '../pages/Dashboard';

describe('Dashboard smoke', () => {
  it('renders the signed-in overview without crashing', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );
    expect(screen.getByText(/Welcome back/i)).toBeInTheDocument();
    // The name now appears more than once — the completeness panel labels
    // itself with the business it is scoring. The assertion is that the
    // overview rendered it at all, not that it rendered it exactly once.
    expect((await screen.findAllByText(/Test Cafe/i)).length).toBeGreaterThan(0);
  });
});
