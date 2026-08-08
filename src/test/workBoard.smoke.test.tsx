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
    { id: 'ai-1', org_id: orgId, kind: 'ai', name: 'Growth Director', title: 'Growth Director', department: 'Growth', status: 'working', current_work: 'Africa is NowOpen', agent_key: 'growth-director' },
    { id: 'h-1', org_id: orgId, kind: 'human', name: 'Ada Obi', title: 'Operations Lead', department: 'Operations', status: 'clocked-in', current_work: 'Shipping SOP v3' },
  ];
  const workItems = [
    { id: 'wi-1', org_id: orgId, kind: 'project', title: 'Africa is NowOpen — campaign build', status: 'in_progress', priority: 'high', department: 'Marketing & Growth', assignee_id: 'ai-1', due_at: '2026-08-18T00:00:00.000Z', description: 'Landing page, creative assets, ads and launch email.' },
    { id: 'wi-2', org_id: orgId, kind: 'task', title: 'August social content calendar', status: 'todo', priority: 'medium', department: 'Social Media', assignee_id: null, due_at: null, description: null },
    { id: 'wi-3', org_id: orgId, kind: 'task', title: 'Draft Q3 strategy brief', status: 'blocked', priority: 'high', department: 'Strategy & BI', assignee_id: 'ai-1', due_at: '2026-08-01T00:00:00.000Z', description: 'Blocked on market data from the Research Analyst.' },
  ];
  const q = (data: unknown) => {
    const result = { data, error: null };
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      insert: vi.fn(async () => ({ data: null, error: null })),
      update: vi.fn(() => chain),
      then: (onF?: any, onR?: any) => Promise.resolve(result).then(onF, onR),
      catch: (onR?: any) => Promise.resolve(result).catch(onR),
      finally: (onF?: any) => Promise.resolve(result).finally(onF),
    };
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((table: string) =>
        q(table === 'os_workforce' ? workforce : table === 'os_work_items' ? workItems : [])),
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

import WorkBoard from '../components/admin/WorkBoard';

describe('WorkBoard smoke', () => {
  it('renders the board and KPIs from os_work_items', async () => {
    render(<WorkBoard />);
    expect(await screen.findByText('Africa is NowOpen — campaign build')).toBeInTheDocument();
    expect(screen.getByText('Work Board')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.queryByText(/Demo board/)).not.toBeInTheDocument();
  });

  it('derives the honest AI strip from the work ledger', async () => {
    render(<WorkBoard />);
    expect(await screen.findByText('Africa is NowOpen — campaign build')).toBeInTheDocument();
    expect(screen.getByText('0 working')).toBeInTheDocument();
    expect(screen.getByText('1 blocked')).toBeInTheDocument();
    expect(screen.getByText('0 waiting')).toBeInTheDocument();
  });

  it('opens a work item, links to its office and saves a status change', async () => {
    render(<><Toaster /><WorkBoard /></>);
    fireEvent.click(await screen.findByText('Draft Q3 strategy brief'));
    expect(screen.getByText('Blocked on market data from the Research Analyst.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open Analytics War Room/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(await screen.findByText('Work item updated')).toBeInTheDocument();
    expect(screen.getByText(/Select a work item to move it/)).toBeInTheDocument();
  });

  it('adds a work item through the form', async () => {
    render(<><Toaster /><WorkBoard /></>);
    fireEvent.click(screen.getByRole('button', { name: /Add item/ }));
    const title = screen.getByPlaceholderText(/e.g. Launch restaurant campaign/);
    fireEvent.change(title, { target: { value: 'Launch restaurant campaign' } });
    fireEvent.click(screen.getByRole('button', { name: /Add to board/ }));
    expect(await screen.findByText(/Launch restaurant campaign added to the board/)).toBeInTheDocument();
  });

  it('filters the board by department', async () => {
    render(<WorkBoard />);
    fireEvent.change(await screen.findByLabelText('Department'), { target: { value: 'Strategy & BI' } });
    expect(screen.getByText('Draft Q3 strategy brief')).toBeInTheDocument();
    expect(screen.queryByText('Africa is NowOpen — campaign build')).not.toBeInTheDocument();
    expect(screen.queryByText('August social content calendar')).not.toBeInTheDocument();
  });
});
