import { describe, it, vi, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../lib/supabase', () => {
  const orgId = '00000000-0000-4000-8000-00000000a001';
  const workforce = [
    { id: 'ai-1', org_id: orgId, kind: 'ai', name: 'Growth Director', title: 'Growth Director', department: 'Growth', status: 'working', agent_key: 'growth-director' },
    { id: 'h-1', org_id: orgId, kind: 'human', name: 'Ada Obi', title: 'Operations Lead', department: 'Operations', status: 'clocked-in' },
  ];
  const workItems = [
    { id: 'wi-1', org_id: orgId, kind: 'task', title: 'Draft Q3 strategy brief', status: 'blocked', priority: 'high', department: 'Strategy & BI', assignee_id: 'ai-1', created_at: '2026-08-05T09:00:00.000Z' },
    { id: 'wi-2', org_id: orgId, kind: 'task', title: 'August social content calendar', status: 'in_progress', priority: 'medium', department: 'Social Media', assignee_id: null, created_at: '2026-08-07T09:00:00.000Z' },
  ];
  const approvals = [
    { id: 'a-1', org_id: orgId, work_item_id: 'wi-2', reason: 'Ship the social calendar', status: 'pending', requested_by: 'ai-1', created_at: '2026-08-08T09:00:00.000Z' },
  ];
  const q = (data: unknown) => {
    const result = { data, error: null };
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      then: (onF?: any, onR?: any) => Promise.resolve(result).then(onF, onR),
      catch: (onR?: any) => Promise.resolve(result).catch(onR),
      finally: (onF?: any) => Promise.resolve(result).finally(onF),
    };
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((table: string) =>
        q(table === 'os_workforce' ? workforce : table === 'os_work_items' ? workItems : table === 'os_approvals' ? approvals : [])),
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

import AskNowOpenPalette from '../components/admin/AskNowOpenPalette';

describe('AskNowOpen palette smoke', () => {
  it('answers questions from the real ledgers and jumps to the section', async () => {
    const onOpenSection = vi.fn();
    render(<AskNowOpenPalette open onClose={vi.fn()} onOpenSection={onOpenSection} />);

    // Before typing: honest suggestion chips.
    expect(await screen.findByText('Who is blocked right now?')).toBeInTheDocument();

    // A blocked question returns only real blocked rows.
    fireEvent.change(screen.getByLabelText('Ask NowOpen'), { target: { value: 'who is blocked' } });
    expect(await screen.findByText('Draft Q3 strategy brief is blocked')).toBeInTheDocument();
    expect(screen.queryByText('August social content calendar is blocked')).not.toBeInTheDocument();

    // Activating the answer deep-links to the Work Board.
    fireEvent.click(screen.getByText('Draft Q3 strategy brief is blocked'));
    expect(onOpenSection).toHaveBeenCalledWith('work-board');
  });

  it('surfaces pending sign-offs on an approval question', async () => {
    render(<AskNowOpenPalette open onClose={vi.fn()} onOpenSection={vi.fn()} />);
    await screen.findByText('Who is blocked right now?');
    fireEvent.change(screen.getByLabelText('Ask NowOpen'), { target: { value: 'what needs my sign-off' } });
    expect(await screen.findByText('"Ship the social calendar" needs your sign-off')).toBeInTheDocument();
  });

  it('doubles as a jump menu that filters sections by name', async () => {
    render(<AskNowOpenPalette open onClose={vi.fn()} onOpenSection={vi.fn()} />);
    await screen.findByText('Who is blocked right now?');
    fireEvent.change(screen.getByLabelText('Ask NowOpen'), { target: { value: 'work' } });
    expect(await screen.findByText('Work Board')).toBeInTheDocument();
    expect(screen.getByText('Workforce Factory')).toBeInTheDocument();
    expect(screen.queryByText('Press Room')).not.toBeInTheDocument();
  });
});
