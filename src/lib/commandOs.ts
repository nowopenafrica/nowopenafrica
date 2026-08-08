// NowOpen OS — command-center layer (pure, no React / Supabase I/O).
//
// Aggregates the four core os_* tables (workforce, work items, approvals,
// knowledge) into the OS briefing the Command Center front door shows, and the
// eight ledgers (plus launches, partners, press and campaigns, OS-6/OS-7/
// OS-9/OS-10) into the executive briefing the Founder Dashboard shows. Every
// number is derived from the real ledgers — agent states come from the work
// items they're assigned via deriveAgentStatuses, sign-offs from os_approvals,
// knowledge from os_knowledge. Nothing is fabricated.

import type { WorkforceMember } from './workforce';
import type { WorkItem } from './work';
import { deriveAgentStatuses } from './work';
import type { ApprovalRequest } from './approvals';
import type { KnowledgeDoc } from './knowledge';
import type { LaunchItem } from './launches';
import { launchStatus } from './launches';
import type { PartnerItem } from './partners';
import type { PressItem } from './press';
import type { CampaignItem } from './osCampaigns';

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

/** The full OS for the executive view: the four core ledgers plus the launch
 *  board (os_launches), the partner pipeline (os_partners), the press ledger
 *  (os_press) and the platform campaigns (os_campaigns). */
export interface OsExtendedInput extends OsState {
  launches: LaunchItem[];
  partners: PartnerItem[];
  press: PressItem[];
  campaigns: CampaignItem[];
}

export interface OsExtendedBriefing extends OsBriefing {
  launchesOpen: number;
  launchesReady: number;
  partnersActive: number;
  partnersNegotiation: number;
  pressPublished: number;
  pressPending: number;
  campaignsLive: number;
  campaignsInBuild: number;
}

export function summarizeOsExtended({ members, items, approvals, docs, launches, partners, press, campaigns }: OsExtendedInput, now = new Date()): OsExtendedBriefing {
  const base = summarizeOs({ members, items, approvals, docs }, now);
  const statuses = launches.map(launchStatus);
  return {
    ...base,
    launchesOpen: launches.length,
    launchesReady: statuses.filter((s) => s === 'ready').length,
    partnersActive: partners.filter((p) => p.stage === 'Active').length,
    partnersNegotiation: partners.filter((p) => p.stage === 'Negotiation').length,
    pressPublished: press.filter((p) => p.status === 'published').length,
    pressPending: press.filter((p) => p.status !== 'published').length,
    campaignsLive: campaigns.filter((c) => c.status === 'live').length,
    campaignsInBuild: campaigns.filter((c) => c.status === 'in_build').length,
  };
}

/** An honest 0–100 health read on the operating system itself: a clean base
 *  that drops for a clogged approval queue, blocked work, blocked agents and a
 *  pipeline where deals stall in negotiation with nothing active. A live
 *  campaign with no published press about it also costs the score — something
 *  is running that nobody can read about. */
export function osHealthScore(b: OsExtendedBriefing): number {
  let score = 100;
  score -= Math.min(b.pendingSignOffs * 6, 24);
  score -= Math.min(b.blockedItems * 5, 20);
  score -= Math.min(b.agentsBlocked * 4, 12);
  if (b.partnersActive === 0 && b.partnersNegotiation > 0) score -= 5;
  if (b.campaignsLive > 0 && b.pressPublished === 0) score -= 4;
  return Math.max(0, score);
}

/** The executive OS briefing: the core lines plus what's on the launch board,
 *  in the partner pipeline, published to press and live on the platform. */
export function osExtendedBriefingLines(b: OsExtendedBriefing): string[] {
  const lines = osBriefingLines(b);
  if (b.launchesReady > 0) {
    lines.push(`${b.launchesReady} launch${b.launchesReady === 1 ? '' : 'es'} ready to ship.`);
  } else if (b.launchesOpen > 0) {
    lines.push(`No launches ready — ${b.launchesOpen} open on the launch board.`);
  }
  if (b.partnersActive + b.partnersNegotiation > 0) {
    lines.push(`${b.partnersActive} active partner${b.partnersActive === 1 ? '' : 's'}, ${b.partnersNegotiation} in negotiation.`);
  }
  if (b.pressPublished > 0) {
    lines.push(b.pressPending > 0
      ? `${b.pressPublished} press stor${b.pressPublished === 1 ? 'y' : 'ies'} published, ${b.pressPending} pending.`
      : `${b.pressPublished} press stor${b.pressPublished === 1 ? 'y' : 'ies'} published.`);
  } else if (b.pressPending > 0) {
    lines.push(`${b.pressPending} press item${b.pressPending === 1 ? '' : 's'} pending publication.`);
  }
  if (b.campaignsLive > 0) {
    lines.push(`${b.campaignsLive} campaign${b.campaignsLive === 1 ? '' : 's'} live right now.`);
  } else if (b.campaignsInBuild > 0) {
    lines.push(`${b.campaignsInBuild} campaign${b.campaignsInBuild === 1 ? '' : 's'} in build — momentum building.`);
  }
  return lines;
}
