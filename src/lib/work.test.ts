import { describe, it, expect } from 'vitest';
import {
  WORK_SEED, summarizeWork, filterWork, deriveAgentStatuses, mapSeedToMembers,
  type WorkItem,
} from './work';
import { AI_ROSTER_SEED, DEPARTMENTS, type WorkforceMember } from './workforce';

const org = '00000000-0000-4000-8000-00000000a001';
const now = new Date('2026-08-08T12:00:00Z');

const items: WorkItem[] = [
  { id: 'a', org_id: org, kind: 'project', title: 'Campaign build', status: 'in_progress', priority: 'high', department: 'Marketing & Growth', assignee_id: 'm1', due_at: '2026-08-20T00:00:00Z' },
  { id: 'b', org_id: org, kind: 'task', title: 'Strategy brief', status: 'blocked', priority: 'high', department: 'Strategy & BI', assignee_id: 'm2', due_at: '2026-08-05T00:00:00Z' },
  { id: 'c', org_id: org, kind: 'goal', title: 'Verify businesses', status: 'in_progress', priority: 'medium', department: 'Trust & Safety', assignee_id: 'm3', due_at: '2026-08-15T00:00:00Z' },
  { id: 'd', org_id: org, kind: 'task', title: 'Finance report', status: 'waiting', priority: 'low', department: 'Finance', assignee_id: 'm4' },
  { id: 'e', org_id: org, kind: 'task', title: 'Ship work layer', status: 'todo', priority: 'high', department: 'Product & Engineering', assignee_id: 'm1' },
  { id: 'f', org_id: org, kind: 'project', title: 'Done thing', status: 'done', priority: 'medium', department: 'Operations' },
];

describe('work — summary', () => {
  it('counts open, in-progress, blocked, waiting, done and overdue', () => {
    const s = summarizeWork(items, now);
    expect(s.total).toBe(6);
    expect(s.open).toBe(5);
    expect(s.inProgress).toBe(2);
    expect(s.blocked).toBe(1);
    expect(s.waiting).toBe(1);
    expect(s.done).toBe(1);
    expect(s.overdue).toBe(1); // strategy brief due before now
    expect(s.byStatus['todo']).toBe(1);
    expect(s.byDepartment['Finance']).toBe(1);
    expect(s.byPriority['high']).toBe(3);
  });

  it('never counts done or cancelled items as overdue', () => {
    const done: WorkItem = { id: 'z', org_id: org, kind: 'task', title: 'Old done', status: 'done', priority: 'low', department: 'Operations', due_at: '2020-01-01T00:00:00Z' };
    expect(summarizeWork([done], now).overdue).toBe(0);
  });
});

describe('work — filtering', () => {
  it('filters by kind, department and assignee', () => {
    expect(filterWork(items, { kind: 'task', department: 'all', assignee: 'all' })).toHaveLength(3);
    expect(filterWork(items, { kind: 'all', department: 'Finance', assignee: 'all' })).toHaveLength(1);
    expect(filterWork(items, { kind: 'all', department: 'all', assignee: 'm1' })).toHaveLength(2);
    expect(filterWork(items, { kind: 'all', department: 'all', assignee: 'all' })).toHaveLength(6);
  });
});

describe('work — honest agent statuses', () => {
  it('blocked beats in-progress, in-progress means working', () => {
    const derived = deriveAgentStatuses(items, ['m1', 'm2', 'm3', 'm4', 'm99']);
    expect(derived.m1).toBe('working'); // in-progress + todo
    expect(derived.m2).toBe('blocked');
    expect(derived.m3).toBe('working');
    expect(derived.m4).toBe('waiting'); // only a waiting item
    expect(derived.m99).toBe('waiting'); // no work at all
  });
});

describe('work — seed manifest', () => {
  it('mirrors six rows that all reference real agents and departments', () => {
    expect(WORK_SEED).toHaveLength(6);
    const agentKeys = new Set(AI_ROSTER_SEED.map((r) => r.agentKey));
    const deptNames = new Set(DEPARTMENTS.map((d) => d.name));
    expect(new Set(WORK_SEED.map((s) => s.title)).size).toBe(6);
    for (const s of WORK_SEED) {
      expect(agentKeys.has(s.assigneeAgentKey), s.assigneeAgentKey).toBe(true);
      expect(deptNames.has(s.department), s.department).toBe(true);
    }
  });

  it('resolves assignees by agent key and maps unknown keys to null', () => {
    const members: WorkforceMember[] = [
      { id: 'wm-growth', org_id: org, kind: 'ai', name: 'Growth Director', title: 'Growth Director', department: 'Marketing & Growth', status: 'active', agent_key: 'growth-director' },
      { id: 'wm-social', org_id: org, kind: 'ai', name: 'Social Director', title: 'Social Director', department: 'Social Media', status: 'active', agent_key: 'social-director' },
    ];
    const mapped = mapSeedToMembers(WORK_SEED, members);
    expect(mapped).toHaveLength(6);
    expect(mapped.find((w) => w.title === 'Africa is NowOpen — campaign build')?.assignee_id).toBe('wm-growth');
    expect(mapped.find((w) => w.title === 'August social content calendar')?.assignee_id).toBe('wm-social');
    // Strategy Director isn't in the fixture members — resolves to null, not a crash.
    expect(mapped.find((w) => w.title === 'Draft Q3 strategy brief')?.assignee_id).toBeNull();
    // Due dates land in the future relative to the mapping time.
    for (const w of mapped) {
      expect(new Date(w.due_at as string).getTime()).toBeGreaterThan(Date.now() - 1000);
    }
  });
});
