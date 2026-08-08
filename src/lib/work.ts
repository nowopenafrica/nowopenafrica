// NowOpen OS — work layer (pure, no React / Supabase I/O).
//
// Projects, tasks and goals assigned to the team. Statuses are canonical
// lowercase; the sets here mirror the os_work_items CHECK constraints. The
// board component reads os_work_items from Supabase and falls back to
// WORK_SEED (clearly labelled) until the migration is applied, the same
// honest-fallback pattern as the workforce directory.

import { NOWOPEN_ORG_ID, type WorkforceMember } from './workforce';

export type WorkKind = 'project' | 'task' | 'goal';
export type WorkStatus = 'todo' | 'in_progress' | 'waiting' | 'blocked' | 'done' | 'cancelled';
export type WorkPriority = 'low' | 'medium' | 'high' | 'urgent';

export const WORK_KINDS: readonly WorkKind[] = ['project', 'task', 'goal'];
export const WORK_STATUSES: readonly WorkStatus[] = ['todo', 'in_progress', 'waiting', 'blocked', 'done', 'cancelled'];
export const WORK_PRIORITIES: readonly WorkPriority[] = ['low', 'medium', 'high', 'urgent'];

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  waiting: 'Waiting',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const WORK_KIND_LABELS: Record<WorkKind, string> = {
  project: 'Project',
  task: 'Task',
  goal: 'Goal',
};

export const WORK_PRIORITY_LABELS: Record<WorkPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export interface WorkItem {
  id: string;
  org_id: string;
  kind: WorkKind;
  title: string;
  status: WorkStatus;
  priority: WorkPriority;
  department: string;
  assignee_id?: string | null;
  owner_user_id?: string | null;
  due_at?: string | null;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface WorkSummary {
  total: number;
  open: number;
  inProgress: number;
  blocked: number;
  waiting: number;
  done: number;
  overdue: number;
  byDepartment: Record<string, number>;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}

/** Only overdue when it has a due date, isn't done/cancelled and is past now. */
export function summarizeWork(items: WorkItem[], now = new Date()): WorkSummary {
  let open = 0;
  let inProgress = 0;
  let blocked = 0;
  let waiting = 0;
  let done = 0;
  let overdue = 0;
  const byDepartment: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};

  for (const w of items) {
    if (w.status === 'done' || w.status === 'cancelled') {
      if (w.status === 'done') done += 1;
    } else {
      open += 1;
      if (w.status === 'in_progress') inProgress += 1;
      if (w.status === 'blocked') blocked += 1;
      if (w.status === 'waiting') waiting += 1;
      if (w.due_at && !Number.isNaN(new Date(w.due_at).getTime()) && new Date(w.due_at).getTime() < now.getTime()) overdue += 1;
    }
    byDepartment[w.department] = (byDepartment[w.department] ?? 0) + 1;
    byStatus[w.status] = (byStatus[w.status] ?? 0) + 1;
    byPriority[w.priority] = (byPriority[w.priority] ?? 0) + 1;
  }

  return { total: items.length, open, inProgress, blocked, waiting, done, overdue, byDepartment, byStatus, byPriority };
}

export interface WorkFilters {
  kind: 'all' | WorkKind;
  department: 'all' | string;
  assignee: 'all' | string;
}

export function filterWork(items: WorkItem[], filters: WorkFilters): WorkItem[] {
  return items.filter((w) => {
    if (filters.kind !== 'all' && w.kind !== filters.kind) return false;
    if (filters.department !== 'all' && w.department !== filters.department) return false;
    if (filters.assignee !== 'all' && w.assignee_id !== filters.assignee) return false;
    return true;
  });
}

/** Honest AI statuses derived from the work ledger: an agent with a blocked
 *  item is blocked, one with in-progress work is working, one with only
 *  to-do/waiting (or nothing) is waiting for kickoff. Never fabricated. */
export function deriveAgentStatuses(items: WorkItem[], agentIds: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of agentIds) {
    const mine = items.filter((w) => w.assignee_id === id);
    if (mine.some((w) => w.status === 'blocked')) out[id] = 'blocked';
    else if (mine.some((w) => w.status === 'in_progress')) out[id] = 'working';
    else if (mine.some((w) => w.status === 'waiting')) out[id] = 'waiting';
    else out[id] = 'waiting';
  }
  return out;
}

// Planned first work items, mirrored by the 20260808020000_os_work seed. The
// component uses these as the honest dev/fallback state until the migration is
// applied. Assignees are referenced by agent key and resolved against the
// workforce via mapSeedToMembers. Keep in sync with the SQL seed.
export interface WorkSeedItem {
  kind: WorkKind;
  title: string;
  status: WorkStatus;
  priority: WorkPriority;
  department: string;
  assigneeAgentKey: string;
  dueOffsetDays: number;
  description: string;
}

export const WORK_SEED: WorkSeedItem[] = [
  { kind: 'project', title: 'Africa is NowOpen — campaign build', status: 'in_progress', priority: 'high', department: 'Marketing & Growth', assigneeAgentKey: 'growth-director', dueOffsetDays: 10, description: 'Landing page, creative assets, ads and launch email for the platform campaign.' },
  { kind: 'task', title: 'August social content calendar', status: 'in_progress', priority: 'medium', department: 'Social Media', assigneeAgentKey: 'social-director', dueOffsetDays: 5, description: 'Calendar, captions and scheduled posts across every NowOpen channel.' },
  { kind: 'project', title: 'Ship the OS work layer', status: 'todo', priority: 'high', department: 'Product & Engineering', assigneeAgentKey: 'product-manager', dueOffsetDays: 21, description: 'Projects, tasks and goals assigned to the team — this board.' },
  { kind: 'task', title: 'Draft Q3 strategy brief', status: 'blocked', priority: 'high', department: 'Strategy & BI', assigneeAgentKey: 'strategy-director', dueOffsetDays: 3, description: 'Blocked on market data from the Research Analyst.' },
  { kind: 'goal', title: 'Verify 10 new businesses this week', status: 'in_progress', priority: 'high', department: 'Trust & Safety', assigneeAgentKey: 'trust-safety-agent', dueOffsetDays: 7, description: 'Trust metric: verification turnaround stays under 24 hours.' },
  { kind: 'task', title: 'Monthly finance report', status: 'waiting', priority: 'medium', department: 'Finance', assigneeAgentKey: 'finance-analyst', dueOffsetDays: 12, description: 'Revenue, expenses and cash flow summary for human approval.' },
];

/** Turn the seed manifest into WorkItem rows, resolving assignees by agent key
 *  against the given workforce members (idempotent on unknown keys → null). */
export function mapSeedToMembers(seed: readonly WorkSeedItem[], members: readonly WorkforceMember[]): WorkItem[] {
  const byKey = new Map(members.filter((m) => m.agent_key).map((m) => [m.agent_key as string, m.id]));
  const dueBase = Date.now();
  return seed.map((s, i) => ({
    id: `seed-work-${i}`,
    org_id: NOWOPEN_ORG_ID,
    kind: s.kind,
    title: s.title,
    status: s.status,
    priority: s.priority,
    department: s.department,
    assignee_id: byKey.get(s.assigneeAgentKey) ?? null,
    due_at: new Date(dueBase + s.dueOffsetDays * 86_400_000).toISOString(),
    description: s.description,
  }));
}
