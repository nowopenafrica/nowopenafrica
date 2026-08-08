import { describe, it, expect } from 'vitest';
import {
  DEPARTMENTS, AI_ROSTER_SEED, statusesFor, isValidStatus, summarizeWorkforce, filterWorkforce,
  type WorkforceMember,
} from './workforce';

const org = '00000000-0000-4000-8000-00000000a001';

const members: WorkforceMember[] = [
  { id: 'm1', org_id: org, kind: 'human', name: 'Temi', title: 'Founder', department: 'Founder Office', status: 'clocked-in' },
  { id: 'm2', org_id: org, kind: 'ai', name: 'Strategy Director', title: 'Strategy Director', department: 'Strategy & BI', status: 'working' },
  { id: 'm3', org_id: org, kind: 'ai', name: 'Post Supervisor', title: 'Post Supervisor', department: 'Post Production', status: 'blocked' },
  { id: 'm4', org_id: org, kind: 'ai', name: 'Copywriter', title: 'Copywriter', department: 'Creative & Brand', status: 'awaiting-approval' },
  { id: 'm5', org_id: org, kind: 'ai', name: 'Trust & Safety Agent', title: 'Trust & Safety Agent', department: 'Trust & Safety', status: 'error' },
  { id: 'm6', org_id: org, kind: 'human', name: 'Kola', title: 'Ops Lead', department: 'Operations', status: 'on-break' },
];

describe('workforce — status sets', () => {
  it('exposes per-kind statuses', () => {
    expect(statusesFor('ai')).toContain('blocked');
    expect(statusesFor('ai')).toContain('awaiting-approval');
    expect(statusesFor('ai')).toContain('error');
    expect(statusesFor('ai')).not.toContain('clocked-in');
    expect(statusesFor('human')).toContain('clocked-in');
    expect(statusesFor('human')).toContain('on-break');
    expect(statusesFor('human')).not.toContain('blocked');
  });

  it('validates statuses against the kind', () => {
    expect(isValidStatus('ai', 'working')).toBe(true);
    expect(isValidStatus('ai', 'blocked')).toBe(true);
    expect(isValidStatus('ai', 'clocked-in')).toBe(false);
    expect(isValidStatus('human', 'working')).toBe(true);
    expect(isValidStatus('human', 'error')).toBe(false);
  });
});

describe('workforce — departments', () => {
  it('has all 14 vision departments with unique names', () => {
    expect(DEPARTMENTS).toHaveLength(14);
    expect(new Set(DEPARTMENTS.map((d) => d.name)).size).toBe(14);
  });

  it('maps every roster seed row to a known department', () => {
    for (const r of AI_ROSTER_SEED) {
      expect(DEPARTMENTS.some((d) => d.name === r.department), r.department).toBe(true);
    }
  });

  it('resolves departments by name', () => {
    expect(DEPARTMENTS.filter((d) => d.name === 'Founder Office')[0]?.sectionId).toBe('founder');
    expect(DEPARTMENTS.find((d) => d.name === 'Nope')).toBeUndefined();
  });
});

describe('workforce — AI roster seed', () => {
  it('mirrors the 18-row migration seed with unique agent keys', () => {
    expect(AI_ROSTER_SEED).toHaveLength(18);
    expect(new Set(AI_ROSTER_SEED.map((r) => r.agentKey)).size).toBe(18);
  });

  it('names every agent as a director/manager/analyst with title matching name', () => {
    for (const r of AI_ROSTER_SEED) {
      expect(r.title).toBe(r.name);
      expect(r.currentWork.length).toBeGreaterThan(20);
    }
  });
});

describe('workforce — rollups', () => {
  it('counts by kind, status and department', () => {
    const s = summarizeWorkforce(members);
    expect(s.total).toBe(6);
    expect(s.humans).toBe(2);
    expect(s.ai).toBe(4);
    expect(s.byStatus['working']).toBe(1);
    expect(s.byDepartment['Post Production']).toBe(1);
  });

  it('flags blocked, awaiting-approval and error as needing attention', () => {
    expect(summarizeWorkforce(members).needingAttention).toBe(3);
  });
});

describe('workforce — filtering', () => {
  it('filters by kind, department and status', () => {
    expect(filterWorkforce(members, { kind: 'ai', department: 'all', status: 'all' })).toHaveLength(4);
    expect(filterWorkforce(members, { kind: 'all', department: 'Creative & Brand', status: 'all' })).toHaveLength(1);
    expect(filterWorkforce(members, { kind: 'all', department: 'all', status: 'on-break' })).toHaveLength(1);
    expect(filterWorkforce(members, { kind: 'human', department: 'all', status: 'all' })).toHaveLength(2);
  });

  it('returns everything when no filters are applied', () => {
    expect(filterWorkforce(members, { kind: 'all', department: 'all', status: 'all' })).toHaveLength(6);
  });
});
