import { describe, it, expect } from 'vitest';
import { buildActivityStream, groupActivityByDay, activityStatuses } from './activityStream';
import type { WorkforceMember } from './workforce';
import type { WorkItem } from './work';
import type { ApprovalRequest } from './approvals';

const members: WorkforceMember[] = [
  { id: 'h1', org_id: 'o', kind: 'human', name: 'Ada Obi', title: 'Owner', department: 'Founder Office', status: 'clocked-in' },
  { id: 'a1', org_id: 'o', kind: 'ai', name: 'Growth Director', title: 'Growth Director', department: 'Marketing & Growth', status: 'working', agent_key: 'growth-director' },
];

const items: WorkItem[] = [
  {
    id: 'w1', org_id: 'o', kind: 'task', title: 'Launch email', status: 'in_progress', priority: 'high',
    department: 'Marketing & Growth', assignee_id: 'a1',
    created_at: '2026-08-08T08:00:00.000Z', updated_at: '2026-08-08T09:30:00.000Z',
  },
  {
    id: 'w2', org_id: 'o', kind: 'task', title: 'Old seeded item', status: 'todo', priority: 'low',
    department: 'Social Media', assignee_id: null,
    created_at: '2026-08-08T08:00:00.000Z',
  },
];

const approvals: ApprovalRequest[] = [
  {
    id: 'ap1', org_id: 'o', work_item_id: 'w1', requested_by: 'a1', reason: 'Campaign copy sign-off',
    status: 'pending', created_at: '2026-08-08T09:00:00.000Z',
  },
  {
    id: 'ap2', org_id: 'o', work_item_id: 'w1', requested_by: 'a1', reason: 'Finance report',
    status: 'approved', created_at: '2026-08-07T10:00:00.000Z',
    decided_at: '2026-08-07T16:00:00.000Z', decided_by: 'Ada Obi',
  },
];

describe('buildActivityStream', () => {
  it('derives entries from real ledgers with real timestamps, newest first', () => {
    const feed = buildActivityStream({ members, items, approvals });
    expect(feed[0].kind).toBe('work-status'); // 09:30Z — the newest stamp
    expect(feed[0].text).toContain('moved “Launch email” to in progress');
    expect(feed.some((e) => e.kind === 'approval-requested')).toBe(true);
    expect(feed.some((e) => e.kind === 'approval-decided' && e.text.startsWith('approved'))).toBe(true);
    for (let i = 1; i < feed.length; i += 1) {
      expect(feed[i - 1].at >= feed[i].at).toBe(true);
    }
  });

  it('does not invent timestamps or status changes for seeded rows', () => {
    const feed = buildActivityStream({ members, items: [items[1]], approvals: [] });
    // "Old seeded item" has created_at and no update, so one entry only — and
    // it is the open, not a fake "moved to to do".
    expect(feed).toHaveLength(1);
    expect(feed[0].kind).toBe('work-opened');
  });

  it('respects the limit, newest wins', () => {
    const feed = buildActivityStream({ members, items, approvals, limit: 2 });
    expect(feed).toHaveLength(2);
    expect(feed.every((e) => e.at >= '2026-08-08T09:00:00.000Z')).toBe(true);
  });

  it('adds health snapshot entries when history is provided', () => {
    const feed = buildActivityStream({
      members, items: [], approvals: [],
      snapshots: [{ health: 88, snapshot_date: '2026-08-08T08:00:00.000Z' }],
    });
    expect(feed).toHaveLength(1);
    expect(feed[0].kind).toBe('health-snapshot');
    expect(feed[0].text).toContain('88/100');
  });

  it('renders an empty feed when there is nothing timestamped', () => {
    expect(buildActivityStream({ members, items: [], approvals: [] })).toEqual([]);
  });
});

describe('groupActivityByDay', () => {
  it('groups newest day first', () => {
    const groups = groupActivityByDay(buildActivityStream({ members, items, approvals }));
    expect(groups[0].day).toBe('2026-08-08');
    expect(groups.some((g) => g.day === '2026-08-07')).toBe(true);
  });
});

describe('activityStatuses', () => {
  it('lists distinct live statuses on the board', () => {
    expect(activityStatuses(items)).toEqual(['in_progress']);
  });
});
