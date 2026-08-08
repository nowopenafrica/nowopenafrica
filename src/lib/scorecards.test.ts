import { describe, it, expect } from 'vitest';
import { departmentScorecards, scorecardNote, scorecardsNeedingAttention } from './scorecards';
import { seedMembers } from './workforce';
import type { WorkItem } from './work';
import type { ApprovalRequest } from './approvals';

const members = seedMembers({ id: 'u-owner', email: 'owner@nowopen.africa' });

const item = (over: Partial<WorkItem> & { id: string; department: string }): WorkItem => ({
  org_id: 'o', kind: 'task', title: 'T', status: 'todo', priority: 'medium', ...over,
});

describe('departmentScorecards', () => {
  it('scores departments only from real work — no work, no score', () => {
    const cards = departmentScorecards({ members, items: [], approvals: [] });
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(c.score).toBeNull();
      expect(c.completionRate).toBeNull();
      expect(c.status === 'quiet' || c.status === 'empty').toBe(true);
    }
  });

  it('counts done, open, blocked and sign-offs per department', () => {
    const items: WorkItem[] = [
      item({ id: 'w1', department: 'Marketing & Growth', status: 'done' }),
      item({ id: 'w2', department: 'Marketing & Growth', status: 'in_progress' }),
      item({ id: 'w3', department: 'Strategy & BI', status: 'blocked' }),
    ];
    const approvals: ApprovalRequest[] = [
      { id: 'a1', org_id: 'o', work_item_id: 'w2', reason: 'r', status: 'pending' },
    ];
    const cards = departmentScorecards({ members, items, approvals });
    const growth = cards.find((c) => c.department === 'Marketing & Growth')!;
    const strategy = cards.find((c) => c.department === 'Strategy & BI')!;
    expect(growth.done).toBe(1);
    expect(growth.inFlight).toBe(1);
    expect(growth.awaitingApproval).toBe(1);
    expect(growth.completionRate).toBe(50);
    expect(growth.score).toBe(85); // 100 - 15 for the pending sign-off
    expect(strategy.blocked).toBe(1);
    expect(strategy.status).toBe('attention');
    expect(strategy.score).toBe(80); // 100 - 20 for the blocker
  });

  it('flags attention only when something is actually stuck', () => {
    const items: WorkItem[] = [item({ id: 'w1', department: 'Operations', status: 'done' })];
    const cards = departmentScorecards({ members, items, approvals: [] });
    const ops = cards.find((c) => c.department === 'Operations')!;
    expect(ops.status).toBe('healthy');
    expect(ops.score).toBe(100);
    expect(scorecardsNeedingAttention(cards)).toBe(0);
  });

  it('pulls KPIs from the department job descriptions', () => {
    const cards = departmentScorecards({ members, items: [], approvals: [] });
    const growth = cards.find((c) => c.department === 'Marketing & Growth')!;
    expect(growth.kpis.length).toBeGreaterThan(0);
    expect(growth.roles).toBeGreaterThan(0);
  });

  it('writes an honest note for every status', () => {
    const items: WorkItem[] = [
      item({ id: 'w1', department: 'Marketing & Growth', status: 'done' }),
      item({ id: 'w2', department: 'Strategy & BI', status: 'blocked' }),
    ];
    const cards = departmentScorecards({ members, items, approvals: [] });
    for (const c of cards) expect(scorecardNote(c).length).toBeGreaterThan(0);
    expect(scorecardNote(cards.find((c) => c.department === 'Strategy & BI')!)).toContain('blocked');
  });
});
