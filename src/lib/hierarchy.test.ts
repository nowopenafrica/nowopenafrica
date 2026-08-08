import { describe, it, expect } from 'vitest';
import { seedMembers } from './workforce';
import { AI_ROSTER_SEED } from './workforce';
import {
  REPORTING_TREE, PERMISSION_MATRIX,
  permissionForMember, permissionRow, canApprove, rosterPermissions,
  buildOrgChart, managerOf, directReports, reportingChain,
} from './hierarchy';
import { JOB_DESCRIPTIONS, PERMISSION_LABELS } from './jobDescriptions';

const owner = { id: 'u-owner', email: 'owner@nowopen.africa' };
const roster = seedMembers(owner);

describe('reporting tree', () => {
  it('covers every agent in the roster', () => {
    const keys = new Set(AI_ROSTER_SEED.map((r) => r.agentKey));
    for (const k of keys) {
      expect(REPORTING_TREE[k], `missing edge for ${k}`).toBeTruthy();
    }
  });

  it('only references managers that exist in the roster', () => {
    const keys = new Set(AI_ROSTER_SEED.map((r) => r.agentKey));
    for (const target of Object.values(REPORTING_TREE)) {
      if (target === 'founder') continue;
      expect(keys.has(target), `unknown manager ${target}`).toBe(true);
    }
  });

  it('resolves every JD to a permission level', () => {
    const rosterKeys = new Set(AI_ROSTER_SEED.map((r) => r.agentKey));
    const permissions = rosterPermissions();
    expect(permissions.length).toBe(JOB_DESCRIPTIONS.length);
    for (const p of permissions) expect(rosterKeys.has(p.agentKey)).toBe(true);
  });
});

describe('permission matrix', () => {
  it('has all six levels in order, L0 read-only to L5 full control', () => {
    expect(PERMISSION_MATRIX.map((r) => r.level)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(PERMISSION_MATRIX[0].needsApprovalFor.length).toBeGreaterThan(0);
    expect(PERMISSION_MATRIX[5].needsApprovalFor).toEqual([]);
  });

  it('labels match the shared permission vocabulary', () => {
    for (const row of PERMISSION_MATRIX) expect(row.label).toBe(PERMISSION_LABELS[row.level]);
  });

  it('canApprove is monotonic', () => {
    expect(canApprove(5, 0)).toBe(true);
    expect(canApprove(5, 5)).toBe(true);
    expect(canApprove(2, 3)).toBe(false);
    expect(canApprove(3, 3)).toBe(true);
  });

  it('permissionRow falls back safely', () => {
    expect(permissionRow(0).level).toBe(0);
    expect(permissionRow(5).level).toBe(5);
  });
});

describe('permissions per member', () => {
  it('gives the human owner full control', () => {
    const human = roster.find((m) => m.kind === 'human');
    expect(human).toBeDefined();
    expect(permissionForMember(human!)).toBe(5);
  });

  it('reads the JD level for AI agents', () => {
    const growth = roster.find((m) => m.agent_key === 'growth-director');
    const copy = roster.find((m) => m.agent_key === 'copywriter');
    expect(permissionForMember(growth!)).toBe(3);
    expect(permissionForMember(copy!)).toBe(2);
  });

  it('defaults an AI agent without a JD to L2', () => {
    expect(permissionForMember({ id: 'x', org_id: 'o', kind: 'ai', name: 'X', title: 'X', department: 'Ops', status: 'active' })).toBe(2);
  });
});

describe('org chart', () => {
  it('roots the chart at the human owner and places the whole roster', () => {
    const chart = buildOrgChart(roster);
    expect(chart.root.member.kind).toBe('human');
    expect(chart.orphaned).toEqual([]);
    expect(chart.root.children.length).toBeGreaterThan(0);
  });

  it('hangs the founder group directly off the founder', () => {
    const chart = buildOrgChart(roster);
    const direct = new Set(chart.root.children.map((c) => c.member.agent_key));
    expect(direct.has('chief-of-staff')).toBe(true);
    expect(direct.has('strategy-director')).toBe(true);
    expect(direct.has('operations-director')).toBe(true);
    // Roles that report to a director are one level deeper, not direct.
    expect(direct.has('research-analyst')).toBe(false);
  });

  it('keeps the deepest chain at three hops (founder -> director -> manager -> specialist)', () => {
    const chart = buildOrgChart(roster);
    expect(chart.depth).toBe(3);
  });

  it('reports a virtual founder when no human row exists yet', () => {
    const aiOnly = roster.filter((m) => m.kind === 'ai');
    const chart = buildOrgChart(aiOnly);
    expect(chart.root.member.name).toBe('Founder');
    expect(chart.root.children.length).toBeGreaterThan(0);
  });

  it('manages direct reports per director', () => {
    const strategy = roster.find((m) => m.agent_key === 'strategy-director')!;
    const direct = directReports(roster, strategy.id).map((m) => m.agent_key).sort();
    expect(direct).toEqual(['data-analyst', 'research-analyst']);
  });

  it('walks the chain from a specialist up to the founder', () => {
    const analyst = roster.find((m) => m.agent_key === 'research-analyst')!;
    const chain = reportingChain(roster, analyst.id).map((m) => m.agent_key ?? m.name);
    expect(chain[0]).toBe('research-analyst');
    expect(chain[1]).toBe('strategy-director');
    expect(chain[chain.length - 1]).toBe('owner');
  });
});

describe('manager resolution', () => {
  it('prefers reports_to when present', () => {
    const human = roster.find((m) => m.kind === 'human')!;
    const manager = roster.find((m) => m.agent_key === 'strategy-director')!;
    const custom = { ...manager, reports_to: human.id };
    const members = [human, ...roster.filter((m) => m.id !== manager.id), custom];
    expect(managerOf(custom, members, human)?.id).toBe(human.id);
  });
});
