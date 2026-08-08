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
  const rows = [
    { id: 'w1', org_id: orgId, kind: 'human', name: 'Ada Obi', title: 'Operations Lead', department: 'Operations', status: 'clocked-in', current_work: 'Shipping SOP v3' },
    { id: 'w2', org_id: orgId, kind: 'ai', name: 'Strategy Director', title: 'Strategy Director', department: 'Strategy & BI', status: 'working', current_work: 'Drafting the quarterly plan', agent_key: 'strategy-director' },
    { id: 'w3', org_id: orgId, kind: 'ai', name: 'Post Supervisor', title: 'Post Supervisor', department: 'Post Production', status: 'blocked', current_work: 'Awaiting footage', agent_key: 'post-supervisor' },
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
    supabase: { from: vi.fn((table: string) => q(table === 'os_workforce' ? rows : [])) },
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

import WorkforceDirectory from '../components/admin/WorkforceDirectory';

describe('WorkforceDirectory smoke', () => {
  it('renders the roster and stats from os_workforce', async () => {
    render(<WorkforceDirectory />);
    expect(await screen.findByText('Strategy Director')).toBeInTheDocument();
    expect(screen.getByText('Ada Obi')).toBeInTheDocument();
    expect(screen.getByText('Total workforce')).toBeInTheDocument();
    expect(screen.getByText('Need attention')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('opens a member and surfaces their department office', async () => {
    render(<WorkforceDirectory />);
    fireEvent.click(await screen.findByText('Strategy Director'));
    expect(screen.getByText('Currently working on')).toBeInTheDocument();
    expect(screen.getAllByText('Drafting the quarterly plan').length).toBeGreaterThan(0);
    expect(screen.getByText('Agent key')).toBeInTheDocument();
    expect(screen.getByText('strategy-director')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open Analytics War Room/ })).toBeInTheDocument();
  });

  it('shows the digital job description for an AI agent', async () => {
    render(<WorkforceDirectory />);
    fireEvent.click(await screen.findByText('Strategy Director'));
    expect(screen.getByText('Digital job description')).toBeInTheDocument();
    expect(screen.getByText(/L3 · Act with approval/)).toBeInTheDocument();
    expect(screen.getByText(/Watch the market and the five launch KPIs/)).toBeInTheDocument();
    expect(screen.getAllByText(/Escalates to/).length).toBeGreaterThan(0);
  });

  it('filters the roster by department', async () => {
    render(<WorkforceDirectory />);
    fireEvent.change(await screen.findByLabelText('Department'), { target: { value: 'Strategy & BI' } });
    expect(screen.getByText('Strategy Director')).toBeInTheDocument();
    expect(screen.queryByText('Ada Obi')).not.toBeInTheDocument();
    expect(screen.queryByText('Post Supervisor')).not.toBeInTheDocument();
  });

  it('adds a member through the form', async () => {
    render(<><Toaster /><WorkforceDirectory /></>);
    fireEvent.click(screen.getByRole('button', { name: /Add member/ }));
    const name = screen.getByPlaceholderText(/e.g. Research Analyst/);
    fireEvent.change(name, { target: { value: 'Research Analyst' } });
    fireEvent.click(screen.getByRole('button', { name: /Add agent/ }));
    expect(await screen.findByText(/joined the workforce/)).toBeInTheDocument();
  });

  it('renders the org chart rooted at the founder with honest reporting gaps', async () => {
    render(<WorkforceDirectory />);
    fireEvent.click(await screen.findByRole('button', { name: 'Org chart' }));
    expect(screen.getAllByText('Org chart').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ada Obi').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Strategy Director').length).toBeGreaterThan(0);
    // Post Supervisor's manager (Production Manager) is not in this roster,
    // so the chart says so instead of inventing a line.
    expect(screen.getByText('1 reporting gap')).toBeInTheDocument();
  });

  it('shows the L0-L5 permission matrix and per-member levels', async () => {
    render(<WorkforceDirectory />);
    fireEvent.click(await screen.findByRole('button', { name: 'Permissions' }));
    expect(screen.getByText('Permission matrix')).toBeInTheDocument();
    expect(screen.getByText('Read-only observer')).toBeInTheDocument();
    expect(screen.getByText('Full control')).toBeInTheDocument();
    expect(screen.getByText('Roster levels')).toBeInTheDocument();
    expect(screen.getAllByText('L3').length).toBeGreaterThan(0);
    expect(screen.getAllByText('L5').length).toBeGreaterThan(0);
  });

  it('shows the reporting chain for a selected member', async () => {
    render(<WorkforceDirectory />);
    fireEvent.click(await screen.findByText('Strategy Director'));
    expect(screen.getByText('Reports to')).toBeInTheDocument();
    expect(screen.getByText('Ada Obi · L5')).toBeInTheDocument();
  });
});
