// NowOpen OS — scorecards (pure, no React / Supabase I/O).
//
// Turns the real ledgers into one honest card per department: how much work
// moved, what's blocked, what's waiting on a human, and a 0-100 ledger score.
// The score is derived only from rows that exist — a department with no work
// gets no score, because there is nothing to score. KPIs come from the digital
// job descriptions (OS-15); a department with no roles and no work is empty,
// not healthy.

import type { WorkforceMember } from './workforce';
import type { WorkItem } from './work';
import type { ApprovalRequest } from './approvals';
import { jobDescriptionsByDepartment } from './jobDescriptions';

export type DepartmentStatus = 'healthy' | 'attention' | 'quiet' | 'empty';

export interface DepartmentScorecard {
  department: string;
  roles: number;
  done: number;
  open: number;
  inFlight: number;
  blocked: number;
  waiting: number;
  awaitingApproval: number;
  /** done / (done + open), null when there is nothing done or open to divide. */
  completionRate: number | null;
  /** 0-100 ledger health; null when the department has no work at all. */
  score: number | null;
  status: DepartmentStatus;
  kpis: string[];
}

export function departmentScorecards(input: {
  members: WorkforceMember[];
  items: WorkItem[];
  approvals: ApprovalRequest[];
}): DepartmentScorecard[] {
  const { items, approvals } = input;

  const itemDept = new Map<string, string>();
  for (const w of items) itemDept.set(w.id, w.department);

  const pendingApprovalByDept = new Map<string, number>();
  for (const a of approvals) {
    if (a.status !== 'pending') continue;
    const dept = itemDept.get(a.work_item_id);
    if (!dept) continue;
    pendingApprovalByDept.set(dept, (pendingApprovalByDept.get(dept) ?? 0) + 1);
  }

  const byDept = new Map<string, { done: number; open: number; inFlight: number; blocked: number; waiting: number }>();
  for (const w of items) {
    if (w.status === 'cancelled') continue;
    const row = byDept.get(w.department) ?? { done: 0, open: 0, inFlight: 0, blocked: 0, waiting: 0 };
    if (w.status === 'done') row.done += 1;
    else {
      row.open += 1;
      if (w.status === 'in_progress') row.inFlight += 1;
      else if (w.status === 'blocked') row.blocked += 1;
      else if (w.status === 'waiting') row.waiting += 1;
    }
    byDept.set(w.department, row);
  }

  const roleCounts = new Map<string, number>();
  for (const m of input.members) {
    if (m.kind !== 'ai') continue;
    roleCounts.set(m.department, (roleCounts.get(m.department) ?? 0) + 1);
  }

  const depts = new Set<string>([...byDept.keys(), ...roleCounts.keys()]);
  const cards: DepartmentScorecard[] = [];

  for (const dept of depts) {
    const work = byDept.get(dept) ?? { done: 0, open: 0, inFlight: 0, blocked: 0, waiting: 0 };
    const awaitingApproval = pendingApprovalByDept.get(dept) ?? 0;
    const total = work.done + work.open;
    const completionRate = total > 0 ? Math.round((work.done / total) * 100) : null;
    const score = total > 0 ? Math.max(0, 100 - work.blocked * 20 - awaitingApproval * 15 - work.waiting * 5) : null;

    let status: DepartmentStatus;
    if (total === 0 && roleCounts.get(dept) === 0) status = 'empty';
    else if (total === 0) status = 'quiet';
    else if (work.blocked > 0 || awaitingApproval > 0) status = 'attention';
    else status = 'healthy';

    const jds = jobDescriptionsByDepartment(dept);
    cards.push({
      department: dept,
      roles: roleCounts.get(dept) ?? 0,
      done: work.done,
      open: work.open,
      inFlight: work.inFlight,
      blocked: work.blocked,
      waiting: work.waiting,
      awaitingApproval,
      completionRate,
      score,
      status,
      kpis: [...new Set(jds.flatMap((j) => j.kpis))],
    });
  }

  return cards.sort((a, b) => a.department.localeCompare(b.department));
}

export const DEPARTMENT_STATUS_LABELS: Record<DepartmentStatus, string> = {
  healthy: 'On track',
  attention: 'Needs attention',
  quiet: 'Quiet day',
  empty: 'No roles yet',
};

/** One honest line describing why a scorecard reads the way it does. */
export function scorecardNote(card: DepartmentScorecard): string {
  if (card.status === 'empty') return 'No roles and no work on the board yet.';
  if (card.status === 'quiet') return 'Roles ready, nothing on the board — a quiet day, not a failed one.';
  const bits: string[] = [];
  if (card.blocked > 0) bits.push(`${card.blocked} blocked`);
  if (card.awaitingApproval > 0) bits.push(`${card.awaitingApproval} waiting on sign-off`);
  if (card.inFlight > 0) bits.push(`${card.inFlight} in flight`);
  if (card.done > 0) bits.push(`${card.done} done`);
  return bits.length > 0 ? bits.join(', ') : 'Nothing moved on the board yet.';
}

/** Count of scorecards that need a founder's eyes right now. */
export function scorecardsNeedingAttention(cards: readonly DepartmentScorecard[]): number {
  return cards.filter((c) => c.status === 'attention').length;
}
