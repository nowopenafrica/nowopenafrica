// NowOpen OS — approvals layer (pure, no React / Supabase I/O).
//
// Agent-finished work that needs a human sign-off before it counts as done.
// Statuses are canonical lowercase, mirroring the os_approvals CHECK
// constraint. Rollups, filtering and the fallback manifest live here so the
// queue component stays thin, matching the workforce + work layers.

import { NOWOPEN_ORG_ID } from './workforce';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export const APPROVAL_STATUSES: readonly ApprovalStatus[] = ['pending', 'approved', 'rejected'];

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

export interface ApprovalRequest {
  id: string;
  org_id: string;
  work_item_id: string;
  requested_by?: string | null;
  reason: string;
  status: ApprovalStatus;
  decision_note?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ApprovalSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  byStatus: Record<string, number>;
}

export function summarizeApprovals(requests: ApprovalRequest[]): ApprovalSummary {
  const byStatus: Record<string, number> = {};
  let pending = 0;
  let approved = 0;
  let rejected = 0;
  for (const a of requests) {
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    if (a.status === 'pending') pending += 1;
    else if (a.status === 'approved') approved += 1;
    else rejected += 1;
  }
  return { total: requests.length, pending, approved, rejected, byStatus };
}

export interface ApprovalFilters {
  status: 'all' | ApprovalStatus;
  department: 'all' | string;
}

/** The department of the work item an approval points at, resolved by the
 *  caller (which holds the joined work items). */
export function filterApprovals(
  requests: ApprovalRequest[],
  filters: ApprovalFilters,
  departmentOf: (r: ApprovalRequest) => string | null | undefined,
): ApprovalRequest[] {
  return requests.filter((r) => {
    if (filters.status !== 'all' && r.status !== filters.status) return false;
    if (filters.department !== 'all' && departmentOf(r) !== filters.department) return false;
    return true;
  });
}

/** What a decision does to the ledger: approving closes the work item and
 *  frees the agent; rejecting sends the work back to the board. Pure table so
 *  the component and the tests share the exact same outcome. */
export const DECISION_EFFECTS = {
  approved: { work: 'done', member: 'active' as const },
  rejected: { work: 'in_progress', member: 'working' as const },
} as const;

/** Record a decision on an approval: status, who decided, when, and — for a
 *  rejection — the note the reviewer leaves so the agent knows what to fix.
 *  Pure, so the DB write and the session-only fallback patch the same row. */
export function decideApproval(
  r: ApprovalRequest,
  outcome: 'approved' | 'rejected',
  opts: { decidedBy: string | null; note?: string | null; now?: Date },
): ApprovalRequest {
  const now = (opts.now ?? new Date()).toISOString();
  const note = outcome === 'approved' ? null : opts.note?.trim() || null;
  return { ...r, status: outcome, decision_note: note, decided_by: opts.decidedBy, decided_at: now, updated_at: now };
}

// Planned first approvals, mirrored by the 20260808030000_os_approvals seed.
// Referenced by work item title; ids resolve against the joined work items.
export interface ApprovalSeed {
  title: string;
  reason: string;
}

export const APPROVALS_SEED: ApprovalSeed[] = [
  { title: 'Monthly finance report', reason: 'Revenue, expenses and cash flow summary for human approval.' },
  { title: 'Draft Q3 strategy brief', reason: 'Strategy must be signed off before it becomes the quarterly plan.' },
  { title: 'August social content calendar', reason: 'Public posts go live only after a human approves the calendar.' },
];

/** Turn the seed manifest into ApprovalRequest rows, resolving the work item
 *  (and, from it, the requesting agent) against the given work items. Unknown
 *  titles get a synthetic work_item_id — idempotent, never crashes the queue. */
export function mapSeedToApprovals(
  seed: readonly ApprovalSeed[],
  workItems: readonly { id: string; title: string; assignee_id?: string | null }[],
): ApprovalRequest[] {
  const byTitle = new Map(workItems.map((w) => [w.title, w]));
  const base = Date.now();
  return seed.map((s, i) => {
    const item = byTitle.get(s.title);
    return {
      id: `seed-approval-${i}`,
      org_id: NOWOPEN_ORG_ID,
      work_item_id: item?.id ?? `seed-work-unknown-${i}`,
      requested_by: item?.assignee_id ?? null,
      reason: s.reason,
      status: 'pending' as ApprovalStatus,
      created_at: new Date(base - (seed.length - i) * 3_600_000).toISOString(),
    };
  });
}
