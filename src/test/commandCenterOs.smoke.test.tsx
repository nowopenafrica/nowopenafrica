import { describe, it, vi, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../hooks/useCommandData', () => ({
  useCommandData: () => ({
    stats: {
      totalBusinesses: 120, businessesToday: 2, verifiedBusinesses: 84,
      totalUsers: 340, usersToday: 5, revenueToday: 45000, paidPayments: 3,
      pendingApprovals: 2, scheduledPosts: 7, publishedPosts: 18, videoQueue: 3,
      campaigns: 4, openSupport: 2, uptime: 99.9, topCategory: 'Restaurant',
    },
    sample: false,
    loading: false,
    reload: vi.fn(),
  }),
}));

vi.mock('../lib/supabase', () => {
  const orgId = '00000000-0000-4000-8000-00000000a001';
  const workforce = [
    { id: 'ai-1', org_id: orgId, kind: 'ai', name: 'Growth Director', title: 'Growth Director', department: 'Marketing & Growth', status: 'active', agent_key: 'growth-director' },
    { id: 'ai-2', org_id: orgId, kind: 'ai', name: 'Finance Analyst', title: 'Finance Analyst', department: 'Finance', status: 'awaiting-approval', agent_key: 'finance-analyst' },
    { id: 'ai-3', org_id: orgId, kind: 'ai', name: 'Social Director', title: 'Social Director', department: 'Social Media', status: 'working', agent_key: 'social-director' },
    { id: 'h-1', org_id: orgId, kind: 'human', name: 'Ada Obi', title: 'Operations Lead', department: 'Operations', status: 'clocked-in' },
  ];
  const workItems = [
    { id: 'wi-1', org_id: orgId, kind: 'task', title: 'Monthly finance report', status: 'waiting', priority: 'medium', department: 'Finance', assignee_id: 'ai-2' },
    { id: 'wi-2', org_id: orgId, kind: 'project', title: 'Africa is NowOpen — campaign build', status: 'in_progress', priority: 'high', department: 'Marketing & Growth', assignee_id: 'ai-1' },
    { id: 'wi-3', org_id: orgId, kind: 'task', title: 'August social content calendar', status: 'in_progress', priority: 'medium', department: 'Social Media', assignee_id: 'ai-3' },
    { id: 'wi-4', org_id: orgId, kind: 'goal', title: 'Verify 10 new businesses this week', status: 'blocked', priority: 'high', department: 'Trust & Safety', assignee_id: null },
  ];
  const approvals = [
    { id: 'ap-1', org_id: orgId, work_item_id: 'wi-1', requested_by: 'ai-2', reason: 'Sign off.', status: 'pending' },
    { id: 'ap-2', org_id: orgId, work_item_id: 'wi-3', requested_by: 'ai-3', reason: 'Sign off.', status: 'approved', decided_at: '2026-08-08T09:00:00Z' },
  ];
  const knowledge = [
    { id: 'kb-1', org_id: orgId, category: 'Brand', title: 'Brand voice', summary: 'S', body: [], tags: [], source: 'sop' },
    { id: 'kb-2', org_id: orgId, category: 'Finance', title: 'Monthly finance report — approved', summary: 'S', body: [], tags: [], source: 'decision' },
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
    supabase: {
      from: vi.fn((table: string) =>
        q(table === 'os_workforce' ? workforce : table === 'os_work_items' ? workItems : table === 'os_approvals' ? approvals : table === 'os_knowledge' ? knowledge : [])),
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

import CommandCenter from '../components/admin/CommandCenter';

describe('CommandCenter OS strip', () => {
  it('renders the OS at a glance from the real os_* ledgers', async () => {
    render(<MemoryRouter><CommandCenter /></MemoryRouter>);
    expect(await screen.findByText('OS at a glance')).toBeInTheDocument();
    expect(screen.getByText('Sign-offs waiting')).toBeInTheDocument();
    expect(screen.getByText('Blocked work')).toBeInTheDocument();
    expect(screen.getByText('Open items')).toBeInTheDocument();
    expect(screen.getByText('Agents working')).toBeInTheDocument();
    expect(screen.getByText('Knowledge docs')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.queryByText(/Demo OS/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 work item waiting for your sign-off/)).toBeInTheDocument();
    expect(screen.getByText(/1 work item are blocked on the board/)).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 agents working, 1 waiting for kickoff/)).toBeInTheDocument();
    expect(screen.getByText(/1 decision signed today, 1 in the knowledge base/)).toBeInTheDocument();
  });

  it('deep-links into the OS sections', async () => {
    const onOpenModule = vi.fn();
    render(<MemoryRouter><CommandCenter onOpenModule={onOpenModule} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Approvals Hub/ }));
    expect(onOpenModule).toHaveBeenCalledWith('approvals');
    fireEvent.click(screen.getByRole('button', { name: /Work Board/ }));
    expect(onOpenModule).toHaveBeenCalledWith('work-board');
    fireEvent.click(screen.getByRole('button', { name: /Workforce Directory/ }));
    expect(onOpenModule).toHaveBeenCalledWith('workforce');
    fireEvent.click(screen.getByRole('button', { name: /Knowledge Base/ }));
    expect(onOpenModule).toHaveBeenCalledWith('knowledge');
  });
});

describe('CommandCenter OS fallback', () => {
  it('labels the demo OS when the os_* tables are unavailable', async () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      insert: vi.fn(async () => ({ data: null, error: null })),
      then: (onF?: any, onR?: any) => Promise.resolve({ data: [], error: null }).then(onF, onR),
      catch: (onR?: any) => Promise.resolve({ data: [], error: null }).catch(onR),
      finally: (onF?: any) => Promise.resolve({ data: [], error: null }).finally(onF),
    };
    const { supabase } = await import('../lib/supabase');
    vi.mocked(supabase.from).mockImplementation(() => chain as never);
    render(<MemoryRouter><CommandCenter /></MemoryRouter>);
    expect(await screen.findByText(/Demo OS/)).toBeInTheDocument();
    expect(screen.getByText('OS at a glance')).toBeInTheDocument();
  });
});
