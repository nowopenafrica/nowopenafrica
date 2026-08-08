// NowOpen OS — command-center layer (pure, no React / Supabase I/O).
//
// Aggregates the four os_* tables (workforce, work items, approvals,
// knowledge) into the OS briefing the Command Center front door shows. Every
// number is derived from the real ledgers — agent states come from the work
// items they're assigned via deriveAgentStatuses, sign-offs from os_approvals,
// knowledge from os_knowledge. Nothing is fabricated.

import type { WorkforceMember } from './workforce';
import type { WorkItem } from './work';
import { deriveAgentStatuses } from './work';
import type { ApprovalRequest } from './approvals';
import type { KnowledgeDoc } from './knowledge';

export interface OsState {
  members: WorkforceMember[];
  items: WorkItem[];
  approvals: ApprovalRequest[];
  docs: KnowledgeDoc[];
}

export interface OsBriefing {
  totalMembers: number;
  agents: number;
  agentsWorking: number;
  agentsBlocked: number;
  agentsWaiting: number;
  openItems: number;
  doneItems: number;
  blockedItems: number;
  pendingSignOffs: number;
  decisionsToday: number;
  decisionsTotal: number;
  kbDocs: number;
  kbDecisions: number;
}

const isToday = (iso: string | null | undefined, now: Date): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime())
    && d.getUTCFullYear() === now.getUTCFullYear()
    && d.getUTCMonth() === now.getUTCMonth()
    && d.getUTCDate() === now.getUTCDate();
};

export function summarizeOs({ members, items, approvals, docs }: OsState, now = new Date()): OsBriefing {
  const agents = members.filter((m) => m.kind === 'ai');
  const agentIds = agents.map((a) => a.id);
  const states = deriveAgentStatuses(items, agentIds);
  let agentsWorking = 0;
  let agentsBlocked = 0;
  let agentsWaiting = 0;
  for (const id of agentIds) {
    const s = states[id] ?? 'waiting';
    if (s === 'blocked') agentsBlocked += 1;
    else if (s === 'working') agentsWorking += 1;
    else agentsWaiting += 1;
  }

  const decided = approvals.filter((a) => a.status !== 'pending');

  return {
    totalMembers: members.length,
    agents: agents.length,
    agentsWorking,
    agentsBlocked,
    agentsWaiting,
    openItems: items.filter((w) => w.status !== 'done' && w.status !== 'cancelled').length,
    doneItems: items.filter((w) => w.status === 'done').length,
    blockedItems: items.filter((w) => w.status === 'blocked').length,
    pendingSignOffs: approvals.filter((a) => a.status === 'pending').length,
    decisionsToday: decided.filter((a) => isToday(a.decided_at, now)).length,
    decisionsTotal: decided.length,
    kbDocs: docs.length,
    kbDecisions: docs.filter((d) => d.source === 'decision').length,
  };
}

/** Deterministic OS briefing lines for the Command Center, honest to the data:
 *  sign-offs that need a human, blocked work, agent state and decision memory. */
export function osBriefingLines(b: OsBriefing): string[] {
  const lines: string[] = [];

  if (b.pendingSignOffs > 0) {
    lines.push(`${b.pendingSignOffs} work item${b.pendingSignOffs === 1 ? '' : 's'} waiting for your sign-off in the Approvals Hub.`);
  } else {
    lines.push('No sign-offs waiting — the approval queue is clear.');
  }

  if (b.blockedItems > 0) {
    lines.push(`${b.blockedItems} work item${b.blockedItems === 1 ? '' : 's'} are blocked on the board — worth a look.`);
  } else if (b.openItems > 0) {
    lines.push(`No blocked work — ${b.openItems} open item${b.openItems === 1 ? '' : 's'} moving on the board.`);
  }

  if (b.agents > 0) {
    const bits = [`${b.agentsWorking} of ${b.agents} agents working`];
    if (b.agentsBlocked > 0) bits.push(`${b.agentsBlocked} blocked`);
    if (b.agentsWaiting > 0) bits.push(`${b.agentsWaiting} waiting for kickoff`);
    lines.push(`${bits.join(', ')} right now.`);
  }

  if (b.decisionsToday > 0) {
    lines.push(`${b.decisionsToday} decision${b.decisionsToday === 1 ? '' : 's'} signed today, ${b.kbDecisions} in the knowledge base.`);
  } else if (b.kbDecisions > 0) {
    lines.push(`${b.kbDecisions} decision${b.kbDecisions === 1 ? '' : 's'} already in the knowledge base.`);
  }

  return lines;
}
