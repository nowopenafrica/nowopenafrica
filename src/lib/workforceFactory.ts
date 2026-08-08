// NowOpen OS — workforce factory (pure, no React / Supabase I/O).
//
// Turns the digital job descriptions into hire-ready workforce rows: pick an
// open role, the factory assembles the member from its JD (department,
// permission level, KPIs) and wires the reporting line from REPORTING_TREE —
// a manager that is already hired becomes the reports_to, otherwise the row
// ships without one and the org chart says so honestly instead of inventing a
// line. The factory floor only lists roles that are genuinely open: a JD whose
// agent_key is already on the roster is not offered twice.

import type { WorkforceMember } from './workforce';
import { JOB_DESCRIPTIONS, jobDescriptionByAgentKey, type PermissionLevel } from './jobDescriptions';
import { REPORTING_TREE } from './hierarchy';

export interface FactoryOpenRole {
  agentKey: string;
  role: string;
  department: string;
  purpose: string;
  kpis: string[];
  permission: PermissionLevel;
  /** The agent key (or 'founder') the role reports to, from the real tree. */
  reportsTo: string;
}

export interface FactorySummary {
  hired: number;
  total: number;
  open: number;
  /** Departments with at least one hired agent. */
  staffed: number;
  /** Departments with a mix of hired agents and open roles. */
  partial: number;
  /** Departments with open roles but nobody hired yet. */
  empty: number;
}

const hiredKeys = (members: readonly WorkforceMember[]): Set<string> =>
  new Set(members.filter((m) => m.kind === 'ai' && m.agent_key).map((m) => m.agent_key as string));

/** Every JD not yet on the roster, grouped later by the factory floor. */
export function openRoles(members: readonly WorkforceMember[]): FactoryOpenRole[] {
  const hired = hiredKeys(members);
  return JOB_DESCRIPTIONS
    .filter((j) => !hired.has(j.agentKey))
    .map((j) => ({
      agentKey: j.agentKey,
      role: j.role,
      department: j.department,
      purpose: j.purpose,
      kpis: [...j.kpis],
      permission: j.permission,
      reportsTo: REPORTING_TREE[j.agentKey] ?? 'founder',
    }));
}

/** The factory floor header — what is hired, what is still open. */
export function factorySummary(members: readonly WorkforceMember[]): FactorySummary {
  const roles = openRoles(members);
  const hired = hiredKeys(members);
  const depts = new Set(JOB_DESCRIPTIONS.map((j) => j.department));
  let staffed = 0;
  let partial = 0;
  let empty = 0;
  for (const dept of depts) {
    const hiredInDept = JOB_DESCRIPTIONS.some((j) => j.department === dept && hired.has(j.agentKey));
    const openInDept = roles.some((r) => r.department === dept);
    if (hiredInDept && openInDept) { staffed += 1; partial += 1; }
    else if (hiredInDept) staffed += 1;
    else if (openInDept) empty += 1;
  }
  return { hired: hired.size, total: JOB_DESCRIPTIONS.length, open: roles.length, staffed, partial, empty };
}

/** Assemble a hire-ready workforce row from a digital job description. The
 *  manager's id is wired only when that manager is already on the roster —
 *  otherwise reports_to stays null and the chart flags the gap. */
export function buildFactoryMember(input: {
  agentKey: string;
  name?: string;
  members: readonly WorkforceMember[];
  orgId: string;
}): WorkforceMember {
  const jd = jobDescriptionByAgentKey(input.agentKey);
  if (!jd) throw new Error(`no digital job description for ${input.agentKey}`);
  const managerKey = REPORTING_TREE[input.agentKey];
  const manager = managerKey === 'founder'
    ? input.members.find((m) => m.kind === 'human')
    : input.members.find((m) => m.agent_key === managerKey);
  return {
    id: `factory-${input.agentKey}`,
    org_id: input.orgId,
    kind: 'ai',
    name: input.name?.trim() || jd.role,
    title: jd.role,
    department: jd.department,
    status: 'active',
    agent_key: input.agentKey,
    current_work: 'Just hired — lining up first assignment.',
    reports_to: manager?.id ?? null,
    kpis: [...jd.kpis],
  };
}

/** Build every still-open role in one batch — the "fill the floor" action. */
export function buildFactoryBatch(input: {
  members: readonly WorkforceMember[];
  orgId: string;
}): WorkforceMember[] {
  return openRoles(input.members).map((r) => buildFactoryMember({ agentKey: r.agentKey, members: input.members, orgId: input.orgId }));
}
