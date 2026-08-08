import { describe, it, expect } from 'vitest';
import { openRoles, factorySummary, buildFactoryMember, buildFactoryBatch } from './workforceFactory';
import { JOB_DESCRIPTIONS } from './jobDescriptions';

const orgId = '00000000-0000-4000-8000-00000000a001';

/** A fresh roster with only the human owner — no agents hired yet. */
const ownerOnly = [
  { id: 'h-owner', org_id: orgId, kind: 'human' as const, name: 'Ada Obi', title: 'Owner', department: 'Founder Office', status: 'clocked-in' as const },
];

describe('openRoles', () => {
  it('lists every JD not yet on the roster', () => {
    const roles = openRoles([]);
    expect(roles).toHaveLength(JOB_DESCRIPTIONS.length);
  });

  it('never offers a role twice once it is hired', () => {
    const members = [
      ...ownerOnly,
      { id: 'x1', org_id: orgId, kind: 'ai' as const, name: 'Strategy Director', title: 'Strategy Director', department: 'Strategy & BI', status: 'active' as const, agent_key: 'strategy-director' },
    ];
    const roles = openRoles(members);
    expect(roles.some((r) => r.agentKey === 'strategy-director')).toBe(false);
    expect(roles).toHaveLength(JOB_DESCRIPTIONS.length - 1);
  });

  it('carries the reporting line from the real tree', () => {
    const post = openRoles([]).find((r) => r.agentKey === 'post-supervisor');
    expect(post?.reportsTo).toBe('production-manager');
    const staff = openRoles([]).find((r) => r.agentKey === 'chief-of-staff');
    expect(staff?.reportsTo).toBe('founder');
  });
});

describe('factorySummary', () => {
  it('counts hired, open and the state of every department', () => {
    const s = factorySummary([]);
    expect(s.total).toBe(JOB_DESCRIPTIONS.length);
    expect(s.hired).toBe(0);
    expect(s.open).toBe(JOB_DESCRIPTIONS.length);
    expect(s.staffed).toBe(0);
    expect(s.empty).toBeGreaterThan(0);
  });
});

describe('buildFactoryMember', () => {
  it('assembles a hire-ready row from its digital job description', () => {
    const m = buildFactoryMember({ agentKey: 'post-supervisor', members: ownerOnly, orgId });
    expect(m.kind).toBe('ai');
    expect(m.title).toBe('Post Supervisor');
    expect(m.department).toBe('Post Production');
    expect(m.agent_key).toBe('post-supervisor');
    expect(m.status).toBe('active');
    expect(m.kpis).toHaveLength(3);
  });

  it('wires reports_to to a hired manager, else leaves an honest gap', () => {
    const withManager = buildFactoryMember({
      agentKey: 'post-supervisor',
      members: [...ownerOnly, { id: 'pm', org_id: orgId, kind: 'ai' as const, name: 'Production Manager', title: 'Production Manager', department: 'Creative', status: 'active' as const, agent_key: 'production-manager' }],
      orgId,
    });
    expect(withManager.reports_to).toBe('pm');

    const without = buildFactoryMember({ agentKey: 'post-supervisor', members: ownerOnly, orgId });
    expect(without.reports_to).toBeNull();
  });

  it('defaults the display name to the role and honours a custom name', () => {
    expect(buildFactoryMember({ agentKey: 'data-analyst', members: ownerOnly, orgId }).name).toBe('Data Analyst');
    expect(buildFactoryMember({ agentKey: 'data-analyst', name: 'Zainab', members: ownerOnly, orgId }).name).toBe('Zainab');
  });
});

describe('buildFactoryBatch', () => {
  it('builds one member per open role', () => {
    const batch = buildFactoryBatch({ members: [], orgId });
    expect(batch).toHaveLength(JOB_DESCRIPTIONS.length);
    expect(batch.every((m) => m.kind === 'ai')).toBe(true);
    expect(new Set(batch.map((m) => m.agent_key)).size).toBe(batch.length);
  });
});
