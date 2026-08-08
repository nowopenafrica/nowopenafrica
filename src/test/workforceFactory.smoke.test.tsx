import { describe, it, vi, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toaster } from 'react-hot-toast';

// jsdom has no matchMedia — react-hot-toast's <Toaster /> needs it.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

vi.mock('../lib/supabase', () => {
  const orgId = '00000000-0000-4000-8000-00000000a001';
  const workforce = [
    { id: 'h-owner', org_id: orgId, kind: 'human', name: 'Ada Obi', title: 'Owner', department: 'Founder Office', status: 'clocked-in' },
    { id: 'sd', org_id: orgId, kind: 'ai', name: 'Strategy Director', title: 'Strategy Director', department: 'Strategy & BI', status: 'active', agent_key: 'strategy-director' },
  ];
  const q = (data: unknown) => {
    const result = { data, error: null };
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      insert: vi.fn(async () => ({ data: null, error: null })),
      then: (onF?: any, onR?: any) => Promise.resolve(result).then(onF, onR),
      catch: (onR?: any) => Promise.resolve(result).catch(onR),
      finally: (onF?: any) => Promise.resolve(result).finally(onF),
    };
    return chain;
  };
  return {
    supabase: { from: vi.fn((table: string) => q(table === 'os_workforce' ? workforce : [])) },
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

import WorkforceFactory from '../components/admin/WorkforceFactory';

describe('WorkforceFactory smoke', () => {
  it('shows the factory floor with honest hired and open counts', async () => {
    render(<WorkforceFactory />);
    expect(await screen.findByText('Factory floor')).toBeInTheDocument();
    // One JD (strategy-director) is on the roster; the other 23 are open.
    expect(screen.getByText(/1 of 24 roles hired/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fill all 23 open roles/ })).toBeInTheDocument();
    // Hired agent shows as staffed; a genuinely open role offers a Hire button.
    expect(screen.getByText('Strategy Director')).toBeInTheDocument();
    expect(screen.getByText('Post Supervisor')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Hire' }).length).toBeGreaterThan(0);
  });

  it('hires an open role from its digital job description', async () => {
    render(<><Toaster /><WorkforceFactory /></>);
    await screen.findByText('Factory floor');
    fireEvent.click(screen.getAllByRole('button', { name: 'Hire' })[0]);
    const nameInput = screen.getByPlaceholderText(/Name \(defaults to/);
    fireEvent.change(nameInput, { target: { value: 'Test Hire' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm/ }));
    expect(await screen.findByText(/Test Hire hired/)).toBeInTheDocument();
  });

  it('shows the permission and reporting line straight from the JD and tree', async () => {
    render(<WorkforceFactory />);
    await screen.findByText('Factory floor');
    // Open roles carry their JD permission level and the tree's reporting line.
    expect(screen.getAllByText(/L3 · Act with approval/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Reports to Production Manager/)).toBeInTheDocument();
  });
});
