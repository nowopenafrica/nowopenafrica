// NowOpen OS — hierarchy + permission matrix (pure, no React / Supabase I/O).
//
// Two source-of-truth maps live here: REPORTING_TREE (which agent reports to
// which, mirrored by the reports_to seed in 20260808090000_os_hierarchy.sql)
// and PERMISSION_MATRIX (what each L0-L5 level may do). The org chart is built
// from real workforce rows: a member's reports_to column wins when present,
// otherwise the tree is consulted — so the DB and the dev roster stay honest.

import type { WorkforceMember } from './workforce';
import { JOB_DESCRIPTIONS, jobDescriptionByAgentKey, PERMISSION_LABELS, type PermissionLevel } from './jobDescriptions';

/** agentKey -> manager agentKey. 'founder' is the human owner's seat. */
export const REPORTING_TREE: Record<string, string> = {
  'chief-of-staff': 'founder',
  'strategy-director': 'founder',
  'growth-director': 'founder',
  'comms-director': 'founder',
  'creative-director': 'founder',
  'sales-director': 'founder',
  'operations-director': 'founder',
  'finance-analyst': 'founder',
  'product-manager': 'founder',
  'research-analyst': 'strategy-director',
  'data-analyst': 'strategy-director',
  'seo-manager': 'growth-director',
  'social-director': 'growth-director',
  'email-marketing-manager': 'growth-director',
  'content-manager': 'social-director',
  'copywriter': 'creative-director',
  'production-manager': 'creative-director',
  'product-designer': 'creative-director',
  'motion-designer': 'creative-director',
  'post-supervisor': 'production-manager',
  'partnerships-manager': 'sales-director',
  'customer-success-manager': 'operations-director',
  'trust-safety-agent': 'operations-director',
  'community-manager': 'operations-director',
};

export interface PermissionRow {
  level: PermissionLevel;
  label: string;
  /** What a role at this level may do on its own. */
  can: string[];
  /** What still needs a human at (or above) this level. */
  needsApprovalFor: string[];
  example: string;
}

export const PERMISSION_MATRIX: PermissionRow[] = [
  {
    level: 0,
    label: PERMISSION_LABELS[0],
    can: ['View dashboards and ledgers', 'Read reports and the knowledge base', 'Watch the working day'],
    needsApprovalFor: ['Everything that changes a row'],
    example: 'A stakeholder seat that can see the org but never touch it.',
  },
  {
    level: 1,
    label: PERMISSION_LABELS[1],
    can: ['Draft proposals and briefs', 'Queue ideas onto a backlog'],
    needsApprovalFor: ['Sharing beyond the draft', 'Creating work items', 'Reaching external parties'],
    example: 'An agent that proposes but never ships.',
  },
  {
    level: 2,
    label: PERMISSION_LABELS[2],
    can: ['Prepare drafts and share them internally', 'Create and move work items in a department', 'File for approval'],
    needsApprovalFor: ['Public statements and publishing', 'Spend and budget changes', 'Anything customer-facing'],
    example: 'Research, content and design roles that produce but pass work up.',
  },
  {
    level: 3,
    label: PERMISSION_LABELS[3],
    can: ['Act on pre-approved department playbooks', 'Run experiments and publish internal work', 'Delegate to L2 roles'],
    needsApprovalFor: ['Spend beyond budget', 'Hiring and people changes', 'Public announcements'],
    example: 'A director who runs the department but raises money and messages.',
  },
  {
    level: 4,
    label: PERMISSION_LABELS[4],
    can: ['Run a department end to end', 'Spend within an approved budget', 'Approve L3 and below'],
    needsApprovalFor: ['Org-level policy and budget changes'],
    example: 'Chief of Staff and Operations — autonomous day to day, exceptions escalate.',
  },
  {
    level: 5,
    label: PERMISSION_LABELS[5],
    can: ['Do everything every level can', 'Approve any approval request', 'Set org policy and budgets'],
    needsApprovalFor: [],
    example: 'The founder — the only seat that outranks the matrix.',
  },
];

export function permissionRow(level: PermissionLevel): PermissionRow {
  return PERMISSION_MATRIX.find((r) => r.level === level) ?? PERMISSION_MATRIX[0];
}

/** A human owner always holds L5; an AI agent holds what its JD grants. */
export function permissionForMember(member: WorkforceMember): PermissionLevel {
  if (member.kind === 'human') return 5;
  if (member.agent_key) return jobDescriptionByAgentKey(member.agent_key)?.permission ?? 2;
  return 2;
}

/** True when a level may sign off work that a lower level finished. */
export function canApprove(level: PermissionLevel, required: PermissionLevel): boolean {
  return level >= required;
}

/** Every JD in the roster, with its level resolved — the permission ledger. */
export function rosterPermissions(): { agentKey: string; role: string; department: string; permission: PermissionLevel }[] {
  return JOB_DESCRIPTIONS.map((j) => ({ agentKey: j.agentKey, role: j.role, department: j.department, permission: j.permission }));
}

/** The founder seat used only when no human row exists yet. */
const VIRTUAL_FOUNDER: WorkforceMember = {
  id: 'founder-seat',
  org_id: '',
  kind: 'human',
  name: 'Founder',
  title: 'Founder',
  department: 'Founder Office',
  status: 'active',
};

/** Who a member reports to — their reports_to column when set, else the tree.
 *  Humans below the founder seat report to it; the founder seat reports to no
 *  one. */
export function managerOf(
  member: WorkforceMember,
  members: readonly WorkforceMember[],
  root: WorkforceMember,
): WorkforceMember | undefined {
  if (member.kind === 'human') {
    if (member.id === root.id) return undefined;
    return root;
  }
  if (member.reports_to) return members.find((m) => m.id === member.reports_to);
  if (member.agent_key) {
    const target = REPORTING_TREE[member.agent_key];
    if (target === 'founder') return root;
    if (target) return members.find((m) => m.agent_key === target);
  }
  return undefined;
}

export interface OrgNode {
  member: WorkforceMember;
  depth: number;
  children: OrgNode[];
}

export interface OrgChart {
  root: OrgNode;
  /** Deepest chain in the org, as a number of hops from the founder. */
  depth: number;
  /** Roster rows that could not be placed under a manager. */
  orphaned: WorkforceMember[];
}

/** Builds the org chart from the real workforce. Human row is the root; the
 *  planned AI team hangs off it via REPORTING_TREE. Rows with no resolvable
 *  manager are surfaced as orphans — never silently dropped. */
export function buildOrgChart(members: WorkforceMember[]): OrgChart {
  const human = members.find((m) => m.kind === 'human');
  const rootMember: WorkforceMember = human ?? VIRTUAL_FOUNDER;
  const root: OrgNode = { member: rootMember, depth: 0, children: [] };
  const placed = new Set<string>([rootMember.id]);
  let maxDepth = 0;
  let frontier: OrgNode[] = [root];

  while (frontier.length > 0) {
    const next: OrgNode[] = [];
    for (const parent of frontier) {
      for (const m of members) {
        if (placed.has(m.id)) continue;
        if (managerOf(m, members, rootMember)?.id !== parent.member.id) continue;
        const node: OrgNode = { member: m, depth: parent.depth + 1, children: [] };
        parent.children.push(node);
        placed.add(m.id);
        maxDepth = Math.max(maxDepth, node.depth);
        next.push(node);
      }
    }
    frontier = next;
  }

  const orphaned = members.filter((m) => !placed.has(m.id));
  return { root, depth: maxDepth, orphaned };
}

/** Everyone reporting directly to a member. */
export function directReports(members: readonly WorkforceMember[], memberId: string): WorkforceMember[] {
  const manager = members.find((m) => m.id === memberId);
  if (!manager) return [];
  const root = members.find((m) => m.kind === 'human') ?? VIRTUAL_FOUNDER;
  return members.filter((m) => m.id !== memberId && managerOf(m, members, root)?.id === memberId);
}

/** The chain from a member up to the founder, member first. */
export function reportingChain(members: readonly WorkforceMember[], memberId: string): WorkforceMember[] {
  const start = members.find((m) => m.id === memberId);
  if (!start) return [];
  const root = members.find((m) => m.kind === 'human');
  const chain: WorkforceMember[] = [];
  let current: WorkforceMember | undefined = start;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current = managerOf(current, members, root ?? VIRTUAL_FOUNDER);
  }
  return chain;
}
