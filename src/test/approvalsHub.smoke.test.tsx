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
    { id: 'ai-fin', org_id: orgId, kind: 'ai', name: 'Finance Analyst', title: 'Finance Analyst', department: 'Finance', status: 'awaiting-approval', current_work: 'Monthly finance report', agent_key: 'finance-analyst' },
    { id: 'ai-str', org_id: orgId, kind: 'ai', name: 'Strategy Director', title: 'Strategy Director', department: 'Strategy & BI', status: 'awaiting-approval', current_work: 'Draft Q3 strategy brief', agent_key: 'strategy-director' },
    { id: 'h-1', org_id: orgId, kind: 'human', name: 'Ada Obi', title: 'Operations Lead', department: 'Operations', status: 'clocked-in', current_work: 'Shipping SOP v3' },
  ];
  const workItems = [
    { id: 'wi-fin', org_id: orgId, kind: 'task', title: 'Monthly finance report', status: 'waiting', priority: 'medium', department: 'Finance', assignee_id: 'ai-fin', due_at: null },
    { id: 'wi-str', org_id: orgId, kind: 'task', title: 'Draft Q3 strategy brief', status: 'blocked', priority: 'high', department: 'Strategy & BI', assignee_id: 'ai-str', due_at: '2026-08-01T00:00:00.000Z' },
    { id: 'wi-soc', org_id: orgId, kind: 'task', title: 'August social content calendar', status: 'in_progress', priority: 'medium', department: 'Social Media', assignee_id: null, due_at: null },
  ];
  const approvals = [
    { id: 'ap-1', org_id: orgId, work_item_id: 'wi-fin', requested_by: 'ai-fin', reason: 'Revenue, expenses and cash flow summary for human approval.', status: 'pending' },
    { id: 'ap-2', org_id: orgId, work_item_id: 'wi-str', requested_by: 'ai-str', reason: 'Strategy must be signed off before it becomes the quarterly plan.', status: 'pending' },
    { id: 'ap-3', org_id: orgId, work_item_id: 'wi-soc', requested_by: null, reason: 'Public posts go live only after a human approves the calendar.', status: 'approved', decided_by: 'u-admin', decided_at: '2026-08-07T10:00:00Z' },
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
        q(table === 'os_approvals' ? approvals : table === 'os_work_items' ? workItems : table === 'os_workforce' ? workforce : [])),
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

import { supabase } from '../lib/supabase';
import ApprovalsHub from '../components/admin/ApprovalsHub';

describe('ApprovalsHub smoke', () => {
  it('renders the queue, KPIs and decision history from os_approvals', async () => {
    render(<ApprovalsHub />);
    expect(await screen.findByText('Monthly finance report')).toBeInTheDocument();
    expect(screen.getByText('Approvals Hub')).toBeInTheDocument();
    expect(screen.getByText('2 awaiting review')).toBeInTheDocument();
    expect(screen.getByText('Draft Q3 strategy brief')).toBeInTheDocument();
    expect(screen.getAllByText('Revenue, expenses and cash flow summary for human approval.').length).toBeGreaterThan(0);
    expect(screen.getByText('August social content calendar')).toBeInTheDocument();
    expect(screen.queryByText(/Demo queue/)).not.toBeInTheDocument();
  });

  it('approves an item and touches the whole ledger', async () => {
    render(<><Toaster /><ApprovalsHub /></>);
    fireEvent.click((await screen.findAllByRole('button', { name: /^Approve/ }))[0]);
    expect(await screen.findByText(/Approved — Monthly finance report is done/)).toBeInTheDocument();
    expect(supabase.from).toHaveBeenCalledWith('os_approvals');
    expect(supabase.from).toHaveBeenCalledWith('os_work_items');
    expect(supabase.from).toHaveBeenCalledWith('os_workforce');
  });

  it('rejects an item with a note and sends it back to the board', async () => {
    render(<><Toaster /><ApprovalsHub /></>);
    fireEvent.click((await screen.findAllByRole('button', { name: /^Reject/ }))[0]);
    fireEvent.change(screen.getByPlaceholderText(/e.g. Add the August numbers and re-submit/), { target: { value: 'Add the August numbers and re-submit.' } });
    fireEvent.click(screen.getByRole('button', { name: /Send back with note/ }));
    expect(await screen.findByText(/Sent back with your note — Monthly finance report/)).toBeInTheDocument();
  });

  it('rejects an item with no note and sends it back without one', async () => {
    render(<><Toaster /><ApprovalsHub /></>);
    fireEvent.click((await screen.findAllByRole('button', { name: /^Reject/ }))[0]);
    fireEvent.click(screen.getByRole('button', { name: /Send back with note/ }));
    expect(await screen.findByText(/Sent back to the board — Monthly finance report/)).toBeInTheDocument();
  });

  it('links to the department office for items with one', async () => {
    render(<ApprovalsHub />);
    expect(await screen.findByText('Draft Q3 strategy brief')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open Analytics War Room/ })).toBeInTheDocument();
  });

  it('filters the queue by status', async () => {
    render(<ApprovalsHub />);
    fireEvent.change(await screen.findByLabelText('Status'), { target: { value: 'approved' } });
    expect(screen.getByText('Nothing waiting right now — every agent is cleared for take-off.')).toBeInTheDocument();
    expect(screen.getByText('August social content calendar')).toBeInTheDocument();
    expect(screen.queryByText('Monthly finance report')).not.toBeInTheDocument();
    expect(screen.queryByText('Draft Q3 strategy brief')).not.toBeInTheDocument();
  });
});
