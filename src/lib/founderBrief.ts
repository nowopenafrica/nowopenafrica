// NowOpen OS — founder morning brief (pure, no React / Supabase I/O).
//
// The founder-facing read-out: a dated, time-of-day greeting over the live
// operating system. Everything here is derived from the eight ledgers via the
// OS briefing — health score, the executive lines, and a short "needs your
// attention" list that only surfaces signals actually waiting on the founder
// today (sign-offs, blocked work, launches ready, press pending, campaigns in
// build, partners in negotiation). Nothing is seeded or staged.

import {
  osExtendedBriefingLines, osHealthScore, type OsExtendedBriefing,
} from './commandOs';

export interface FounderAttentionItem {
  label: string;
  value: number;
  module: string;
}

export interface FounderBrief {
  greeting: string;
  date: string;
  health: number;
  summary: string;
  lines: string[];
  attention: FounderAttentionItem[];
}

export function greetingFor(now = new Date()): string {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export function buildFounderBrief(
  b: OsExtendedBriefing,
  now = new Date(),
  recommendation = '',
): FounderBrief {
  const attention: FounderAttentionItem[] = [];
  if (b.pendingSignOffs > 0) attention.push({ label: 'Sign-offs waiting', value: b.pendingSignOffs, module: 'approvals' });
  if (b.blockedItems > 0) attention.push({ label: 'Blocked work items', value: b.blockedItems, module: 'work-board' });
  if (b.launchesReady > 0) attention.push({ label: 'Launches ready to ship', value: b.launchesReady, module: 'launch' });
  if (b.pressPending > 0) attention.push({ label: 'Press stories pending', value: b.pressPending, module: 'press-room' });
  if (b.campaignsInBuild > 0) attention.push({ label: 'Campaigns in build', value: b.campaignsInBuild, module: 'campaign-factory' });
  if (b.partnersNegotiation > 0) attention.push({ label: 'Partners in negotiation', value: b.partnersNegotiation, module: 'partners' });

  const lines = osExtendedBriefingLines(b);
  if (recommendation) lines.push(recommendation);

  const health = osHealthScore(b);
  const summary = health >= 80
    ? `The operating system is healthy at ${health}/100 — the eight ledgers are flowing.`
    : health >= 50
      ? `The operating system is at ${health}/100 — a few ledgers need attention today.`
      : `The operating system is at ${health}/100 — blocked or backlogged. Prioritise the ledger signals below.`;

  return {
    greeting: greetingFor(now),
    date: now.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
    }),
    health,
    summary,
    lines,
    attention,
  };
}
