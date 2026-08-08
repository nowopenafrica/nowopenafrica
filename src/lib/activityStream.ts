// NowOpen OS — activity stream (pure, no React / Supabase I/O).
//
// A chronological feed of what actually happened in the OS, derived strictly
// from the real ledgers: work items (opened, moved between statuses),
// approvals (requested, decided) and health snapshots. Nothing is invented —
// if a row carries a timestamp the stream says what the timestamp means, and
// rows without timestamps simply don't appear. Newest first.

import type { WorkforceMember } from './workforce';
import type { WorkItem } from './work';
import { WORK_STATUS_LABELS, type WorkStatus } from './work';
import type { ApprovalRequest } from './approvals';

export type ActivityKind =
  | 'work-opened'
  | 'work-status'
  | 'approval-requested'
  | 'approval-decided'
  | 'health-snapshot';

export interface ActivityEntry {
  id: string;
  at: string;
  kind: ActivityKind;
  actor: string;
  department: string;
  text: string;
}

export interface ActivityInput {
  members: WorkforceMember[];
  items: WorkItem[];
  approvals: ApprovalRequest[];
  /** Optional health history (os_snapshots rows) — adds health entries. */
  snapshots?: readonly { health: number; snapshot_date?: string; derived_at?: string }[];
  /** Cap the feed length. Newest entries win. */
  limit?: number;
}

const memberName = (members: readonly WorkforceMember[], id?: string | null): string =>
  members.find((m) => m.id === id)?.name ?? 'The founder';

const isValidIso = (iso?: string | null): iso is string =>
  !!iso && !Number.isNaN(new Date(iso).getTime());

/** Derive the activity feed from the real ledgers. Entries carry no invented
 *  timestamps: only rows that were created or moved show up, in row order. */
export function buildActivityStream(input: ActivityInput): ActivityEntry[] {
  const { members, items, approvals, snapshots } = input;
  const limit = input.limit ?? 50;
  const entries: ActivityEntry[] = [];

  for (const w of items) {
    if (isValidIso(w.created_at)) {
      const actor = memberName(members, w.assignee_id);
      entries.push({
        id: `work-opened-${w.id}`,
        at: w.created_at as string,
        kind: 'work-opened',
        actor,
        department: w.department,
        text: `opened “${w.title}”`,
      });
    }
    if (isValidIso(w.updated_at) && w.updated_at !== w.created_at && w.status !== 'todo') {
      entries.push({
        id: `work-status-${w.id}`,
        at: w.updated_at as string,
        kind: 'work-status',
        actor: memberName(members, w.assignee_id),
        department: w.department,
        text: `moved “${w.title}” to ${WORK_STATUS_LABELS[w.status].toLowerCase()}`,
      });
    }
  }

  for (const a of approvals) {
    if (isValidIso(a.created_at)) {
      entries.push({
        id: `approval-requested-${a.id}`,
        at: a.created_at as string,
        kind: 'approval-requested',
        actor: memberName(members, a.requested_by),
        department: 'Founder Office',
        text: `asked for sign-off: “${a.reason}”`,
      });
    }
    if (isValidIso(a.decided_at) && a.status !== 'pending') {
      entries.push({
        id: `approval-decided-${a.id}`,
        at: a.decided_at as string,
        kind: 'approval-decided',
        actor: a.decided_by ?? 'The founder',
        department: 'Founder Office',
        text: `${a.status === 'approved' ? 'approved' : 'rejected'} a sign-off${a.decision_note ? ` — ${a.decision_note}` : ''}`,
      });
    }
  }

  for (const s of snapshots ?? []) {
    const at = s.derived_at ?? s.snapshot_date;
    if (isValidIso(at)) {
      entries.push({
        id: `health-snapshot-${at}`,
        at: at as string,
        kind: 'health-snapshot',
        actor: 'OS',
        department: 'Founder Office',
        text: `recorded OS health ${s.health}/100`,
      });
    }
  }

  return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

/** Group the feed by calendar day, newest day first — for the stream UI. */
export function groupActivityByDay(entries: readonly ActivityEntry[]): { day: string; entries: ActivityEntry[] }[] {
  const groups = new Map<string, ActivityEntry[]>();
  for (const e of entries) {
    const day = e.at.slice(0, 10);
    const list = groups.get(day) ?? [];
    list.push(e);
    groups.set(day, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, list]) => ({ day, entries: list }));
}

/** The distinct statuses ever recorded on the board, for filter chips. */
export function activityStatuses(items: readonly WorkItem[]): WorkStatus[] {
  return [...new Set(items.filter((w) => w.status !== 'todo' && w.status !== 'cancelled').map((w) => w.status))];
}
