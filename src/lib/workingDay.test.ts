import { describe, it, expect } from 'vitest';
import {
  DAY_BEATS, DAY_BEAT_LABELS, dayBeat, roleDayPlan, roleDayPlans, dayPlansByDepartment,
  departmentDayCards, departmentHeadline,
} from './workingDay';
import { JOB_DESCRIPTIONS } from './jobDescriptions';
import type { WorkforceMember } from './workforce';
import type { WorkItem } from './work';

const org = '00000000-0000-4000-8000-00000000a001';

describe('working day — beats', () => {
  it('maps the clock to morning, midday and end of day', () => {
    expect(dayBeat(new Date('2026-08-08T08:30:00'))).toBe('morning');
    expect(dayBeat(new Date('2026-08-08T12:00:00'))).toBe('midday');
    expect(dayBeat(new Date('2026-08-08T16:59:59'))).toBe('midday');
    expect(dayBeat(new Date('2026-08-08T17:00:00'))).toBe('eod');
    expect(dayBeat(new Date('2026-08-08T23:00:00'))).toBe('eod');
  });

  it('labels every beat', () => {
    expect(DAY_BEATS).toEqual(['morning', 'midday', 'eod']);
    for (const b of DAY_BEATS) expect(DAY_BEAT_LABELS[b].length).toBeGreaterThan(3);
  });
});

describe('working day — role plans', () => {
  it('builds a plan for every role from its job description', () => {
    const plans = roleDayPlans(new Date('2026-08-08T09:00:00'));
    expect(plans).toHaveLength(JOB_DESCRIPTIONS.length);
    for (const p of plans) {
      expect(p.morning.length).toBeGreaterThanOrEqual(2);
      expect(p.midday.length).toBeGreaterThanOrEqual(2);
      expect(p.eod.length).toBeGreaterThan(10);
      expect(p.beat).toBe('morning');
    }
  });

  it('a single role plan reflects the clock beat', () => {
    const jd = JOB_DESCRIPTIONS.find((j) => j.agentKey === 'data-analyst')!;
    expect(roleDayPlan(jd, new Date('2026-08-08T18:00:00')).beat).toBe('eod');
    expect(roleDayPlan(jd, new Date('2026-08-08T13:00:00')).beat).toBe('midday');
  });

  it('groups plans by department in roster order', () => {
    const byDept = dayPlansByDepartment(new Date('2026-08-08T09:00:00'));
    expect(byDept.get('Data & Analytics')?.map((p) => p.role)).toEqual(['Data Analyst']);
    expect(byDept.get('Marketing & Growth')?.length).toBeGreaterThanOrEqual(1);
  });
});

describe('working day — department report cards', () => {
  const members: WorkforceMember[] = [
    { id: 'm1', org_id: org, kind: 'ai', name: 'Data Analyst', title: 'Data Analyst', department: 'Data & Analytics', status: 'working', agent_key: 'data-analyst' },
    { id: 'm2', org_id: org, kind: 'ai', name: 'Growth Director', title: 'Growth Director', department: 'Marketing & Growth', status: 'working', agent_key: 'growth-director' },
    { id: 'm3', org_id: org, kind: 'ai', name: 'Post Supervisor', title: 'Post Supervisor', department: 'Post Production', status: 'blocked', agent_key: 'post-supervisor' },
  ];
  const items: WorkItem[] = [
    { id: 'w1', org_id: org, kind: 'task', title: 'Funnel report', status: 'in_progress', priority: 'high', department: 'Data & Analytics', assignee_id: 'm1' },
    { id: 'w2', org_id: org, kind: 'task', title: 'Growth test', status: 'done', priority: 'medium', department: 'Marketing & Growth', assignee_id: 'm2' },
    { id: 'w3', org_id: org, kind: 'task', title: 'QC video', status: 'blocked', priority: 'high', department: 'Post Production', assignee_id: 'm3' },
  ];

  it('derives every number from the real ledgers', () => {
    const cards = departmentDayCards({ members, items, approvals: [], now: new Date('2026-08-08T09:00:00') });
    const data = cards.find((c) => c.department === 'Data & Analytics')!;
    expect(data.inFlight).toBe(1);
    expect(data.blocked).toBe(0);
    expect(data.done).toBe(0);
    expect(data.roles).toContain('Data Analyst');

    const growth = cards.find((c) => c.department === 'Marketing & Growth')!;
    expect(growth.done).toBe(1);

    const post = cards.find((c) => c.department === 'Post Production')!;
    expect(post.blocked).toBe(1);
    expect(post.headline).toMatch(/blocked/);
  });

  it('counts pending approvals that belong to a department', () => {
    const approvals = [{ id: 'a1', org_id: org, work_item_id: 'w1', requested_by: 'm1', reason: 'Sign off funnel report', status: 'pending' as const }];
    const cards = departmentDayCards({ members, items, approvals, now: new Date('2026-08-08T09:00:00') });
    const data = cards.find((c) => c.department === 'Data & Analytics')!;
    expect(data.awaitingApproval).toBe(1);
  });

  it('reports a quiet department honestly instead of inventing work', () => {
    const cards = departmentDayCards({ members: [], items: [], approvals: [], now: new Date('2026-08-08T09:00:00') });
    const distinctDepts = new Set(JOB_DESCRIPTIONS.map((j) => j.department));
    expect(cards.length).toBe(distinctDepts.size);
    for (const c of cards) {
      expect(c.planned + c.inFlight + c.blocked + c.done + c.awaitingApproval).toBe(0);
    }
    expect(departmentHeadline('Finance', 'morning', { planned: 0, inFlight: 0, blocked: 0, done: 0, awaitingApproval: 0 }))
      .toMatch(/Quiet day/);
  });
});
