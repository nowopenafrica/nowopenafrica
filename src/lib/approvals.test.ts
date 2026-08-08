import { describe, it, expect } from 'vitest';
import {
  APPROVAL_STATUSES, APPROVAL_STATUS_LABELS,
  summarizeApprovals, filterApprovals, DECISION_EFFECTS, decideApproval,
  APPROVALS_SEED, mapSeedToApprovals,
  type ApprovalRequest,
} from './approvals';

const org = '00000000-0000-4000-8000-00000000a001';

function req(over: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'a1', org_id: org, work_item_id: 'w1', reason: 'Sign off', status: 'pending',
    ...over,
  };
}

describe('approvals lib', () => {
  it('labels every canonical status', () => {
    expect(APPROVAL_STATUSES).toEqual(['pending', 'approved', 'rejected']);
    expect(APPROVAL_STATUS_LABELS.pending).toBe('Pending');
    expect(APPROVAL_STATUS_LABELS.approved).toBe('Approved');
    expect(APPROVAL_STATUS_LABELS.rejected).toBe('Rejected');
  });

  it('summarizes the queue without inventing rows', () => {
    const summary = summarizeApprovals([
      req({ id: 'a1', status: 'pending' }),
      req({ id: 'a2', status: 'pending' }),
      req({ id: 'a3', status: 'approved' }),
      req({ id: 'a4', status: 'rejected' }),
    ]);
    expect(summary.total).toBe(4);
    expect(summary.pending).toBe(2);
    expect(summary.approved).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.byStatus).toEqual({ pending: 2, approved: 1, rejected: 1 });
  });

  it('filters by status and by the work item department', () => {
    const requests = [
      req({ id: 'a1', work_item_id: 'w1', status: 'pending' }),
      req({ id: 'a2', work_item_id: 'w2', status: 'approved' }),
      req({ id: 'a3', work_item_id: 'w3', status: 'pending' }),
    ];
    const deptOf = (r: ApprovalRequest) =>
      r.work_item_id === 'w1' ? 'Finance' : r.work_item_id === 'w2' ? 'Social Media' : 'Strategy & BI';

    expect(filterApprovals(requests, { status: 'pending', department: 'all' }, deptOf).map((r) => r.id))
      .toEqual(['a1', 'a3']);
    expect(filterApprovals(requests, { status: 'approved', department: 'all' }, deptOf).map((r) => r.id))
      .toEqual(['a2']);
    expect(filterApprovals(requests, { status: 'all', department: 'Finance' }, deptOf).map((r) => r.id))
      .toEqual(['a1']);
    expect(filterApprovals(requests, { status: 'all', department: 'Strategy & BI' }, deptOf).map((r) => r.id))
      .toEqual(['a3']);
    expect(filterApprovals(requests, { status: 'pending', department: 'Finance' }, deptOf).map((r) => r.id))
      .toEqual(['a1']);
  });

  it('maps decisions to ledger effects', () => {
    expect(DECISION_EFFECTS.approved).toEqual({ work: 'done', member: 'active' });
    expect(DECISION_EFFECTS.rejected).toEqual({ work: 'in_progress', member: 'working' });
  });

  it('records a rejection note with the decision and clears it on approve', () => {
    const now = new Date('2026-08-08T10:00:00Z');
    const rejected = decideApproval(req(), 'rejected', { decidedBy: 'u-admin', note: '  Add the August numbers.  ', now });
    expect(rejected.status).toBe('rejected');
    expect(rejected.decision_note).toBe('Add the August numbers.');
    expect(rejected.decided_by).toBe('u-admin');
    expect(rejected.decided_at).toBe('2026-08-08T10:00:00.000Z');
    expect(rejected.updated_at).toBe('2026-08-08T10:00:00.000Z');

    const approved = decideApproval(req(), 'approved', { decidedBy: 'u-admin', note: 'ignored', now });
    expect(approved.status).toBe('approved');
    expect(approved.decision_note).toBeNull();

    // A rejection with only whitespace leaves no note behind.
    const bare = decideApproval(req(), 'rejected', { decidedBy: 'u-admin', note: '   ', now });
    expect(bare.decision_note).toBeNull();
  });

  it('maps the seed manifest against work items and their assignees', () => {
    const workItems = [
      { id: 'w-f', title: 'Monthly finance report', assignee_id: 'm-finance' },
      { id: 'w-s', title: 'Draft Q3 strategy brief', assignee_id: 'm-strategy' },
      { id: 'w-x', title: 'Unrelated task', assignee_id: null },
    ];
    const approvals = mapSeedToApprovals(APPROVALS_SEED, workItems);
    expect(approvals).toHaveLength(APPROVALS_SEED.length);
    expect(approvals[0]).toMatchObject({ work_item_id: 'w-f', requested_by: 'm-finance', status: 'pending' });
    expect(approvals[1]).toMatchObject({ work_item_id: 'w-s', requested_by: 'm-strategy', status: 'pending' });
    expect(approvals[2]).toMatchObject({ work_item_id: 'seed-work-unknown-2', requested_by: null, status: 'pending' });
    expect(approvals.every((a) => a.org_id === org)).toBe(true);
  });
});
