import { describe, it, expect } from 'vitest';
import { summarizeOs, osBriefingLines, type OsState } from './commandOs';
import type { WorkforceMember } from './workforce';
import type { WorkItem } from './work';
import type { ApprovalRequest } from './approvals';
import type { KnowledgeDoc } from './knowledge';

const org = '00000000-0000-4000-8000-00000000a001';

function member(over: Partial<WorkforceMember> = {}): WorkforceMember {
  return { id: 'm1', org_id: org, kind: 'ai', name: 'Agent', title: 'Agent', department: 'Strategy & BI', status: 'active', ...over };
}

function item(over: Partial<WorkItem> = {}): WorkItem {
  return { id: 'w1', org_id: org, kind: 'task', title: 'Task', status: 'todo', priority: 'medium', department: 'Finance', ...over };
}

function approval(over: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return { id: 'a1', org_id: org, work_item_id: 'w1', reason: 'Sign off', status: 'pending', ...over };
}

function doc(over: Partial<KnowledgeDoc> = {}): KnowledgeDoc {
  return { id: 'k1', org_id: org, category: 'Brand', title: 'Doc', summary: 'S', body: [], tags: [], source: 'sop', ...over };
}

function state(over: Partial<OsState> = {}): OsState {
  return { members: [], items: [], approvals: [], docs: [], ...over };
}

describe('commandOs lib', () => {
  it('counts agent states from the work ledger, not the members status field', () => {
    const b = summarizeOs(state({
      members: [
        member({ id: 'a1' }), member({ id: 'a2' }), member({ id: 'a3' }),
        member({ id: 'h1', kind: 'human' }),
      ],
      items: [
        item({ id: 'w1', status: 'in_progress', assignee_id: 'a1' }),
        item({ id: 'w2', status: 'blocked', assignee_id: 'a2' }),
        item({ id: 'w3', status: 'todo', assignee_id: 'a3' }),
      ],
    }));
    expect(b.totalMembers).toBe(4);
    expect(b.agents).toBe(3);
    expect(b.agentsWorking).toBe(1);
    expect(b.agentsBlocked).toBe(1);
    expect(b.agentsWaiting).toBe(1);
  });

  it('counts open, done and blocked work', () => {
    const b = summarizeOs(state({
      items: [
        item({ id: 'w1', status: 'in_progress' }),
        item({ id: 'w2', status: 'blocked' }),
        item({ id: 'w3', status: 'done' }),
        item({ id: 'w4', status: 'cancelled' }),
      ],
    }));
    expect(b.openItems).toBe(2);
    expect(b.doneItems).toBe(1);
    expect(b.blockedItems).toBe(1);
  });

  it("counts pending sign-offs and decisions, today's included", () => {
    const today = new Date('2026-08-08T12:00:00Z');
    const b = summarizeOs(state({
      approvals: [
        approval({ id: 'a1', status: 'pending' }),
        approval({ id: 'a2', status: 'approved', decided_at: '2026-08-08T09:00:00Z' }),
        approval({ id: 'a3', status: 'rejected', decided_at: '2026-07-01T09:00:00Z' }),
      ],
    }), today);
    expect(b.pendingSignOffs).toBe(1);
    expect(b.decisionsToday).toBe(1);
    expect(b.decisionsTotal).toBe(2);
  });

  it('counts knowledge docs and synced decisions', () => {
    const b = summarizeOs(state({
      docs: [
        doc({ id: 'k1', source: 'sop' }),
        doc({ id: 'k2', source: 'decision' }),
        doc({ id: 'k3', source: 'manual' }),
      ],
    }));
    expect(b.kbDocs).toBe(3);
    expect(b.kbDecisions).toBe(1);
  });

  it('writes honest briefing lines for a healthy OS', () => {
    const lines = osBriefingLines({
      pendingSignOffs: 0, blockedItems: 0, openItems: 3, agents: 4, agentsWorking: 3,
      agentsBlocked: 0, agentsWaiting: 1, decisionsToday: 0, kbDecisions: 2,
      totalMembers: 6, doneItems: 1, decisionsTotal: 2, kbDocs: 12,
    });
    expect(lines[0]).toBe('No sign-offs waiting — the approval queue is clear.');
    expect(lines.some((l) => l.includes('No blocked work — 3 open items'))).toBe(true);
    expect(lines.some((l) => l.includes('3 of 4 agents working'))).toBe(true);
    expect(lines.some((l) => l.includes('2 decisions already in the knowledge base'))).toBe(true);
  });

  it('flags sign-offs and blocked work when they exist', () => {
    const lines = osBriefingLines({
      pendingSignOffs: 2, blockedItems: 1, openItems: 5, agents: 3, agentsWorking: 1,
      agentsBlocked: 1, agentsWaiting: 1, decisionsToday: 1, kbDecisions: 3,
      totalMembers: 5, doneItems: 2, decisionsTotal: 4, kbDocs: 15,
    });
    expect(lines.some((l) => l.includes('2 work items waiting for your sign-off'))).toBe(true);
    expect(lines.some((l) => l.includes('1 work item are blocked'))).toBe(true);
    expect(lines.some((l) => l.includes('1 of 3 agents working, 1 blocked, 1 waiting'))).toBe(true);
    expect(lines.some((l) => l.includes('1 decision signed today, 3 in the knowledge base'))).toBe(true);
  });
});
