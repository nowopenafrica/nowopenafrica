// NowOpen OS — Ask NowOpen (pure, no React / Supabase I/O).
//
// The palette engine: answer the founder's questions from the real ledgers and
// point at the section that holds the work. Every answer is derived from rows
// that exist — a question with nothing behind it gets an honest "nothing to
// see yet" line, never a fabricated number. Navigation always rides along so
// the palette doubles as a jump-to-anywhere command menu.

import type { WorkforceMember } from './workforce';
import type { WorkItem } from './work';
import type { ApprovalRequest } from './approvals';
import { summarizeOs, osHealthScore, type OsExtendedBriefing } from './commandOs';
import { departmentScorecards } from './scorecards';
import { buildActivityStream } from './activityStream';
import { ADMIN_SECTIONS, type AdminSection } from './adminCreator';

export type AskItemKind = 'ask' | 'go' | 'suggest';

export interface AskItem {
  id: string;
  kind: AskItemKind;
  title: string;
  detail: string;
  /** Which admin section the answer lives in — jumping there is one click. */
  sectionId?: string;
  /** For suggestion chips: re-running this text as a real query. */
  runQuery?: string;
}

export interface AskInput {
  members: WorkforceMember[];
  items: WorkItem[];
  approvals: ApprovalRequest[];
  /** Optional health history — enriches "what happened recently". */
  snapshots?: readonly { health: number; snapshot_date?: string; derived_at?: string }[];
  /** Injectable section list so tests can shrink the nav surface. */
  sections?: readonly AdminSection[];
}

/** The chips the palette shows before anyone types — honest starter questions. */
export const ASK_SUGGESTIONS: readonly { id: string; question: string }[] = [
  { id: 'blocked', question: 'Who is blocked right now?' },
  { id: 'signoff', question: 'What needs my sign-off?' },
  { id: 'health', question: 'How healthy is the OS?' },
  { id: 'activity', question: 'What happened recently?' },
  { id: 'attention', question: 'Which departments need attention?' },
  { id: 'agents', question: 'How many agents are working?' },
];

const nameOf = (members: readonly WorkforceMember[], id?: string | null): string =>
  members.find((m) => m.id === id)?.name ?? 'Unassigned';

/** Every live admin section as a "Go to …" item, for command-menu navigation. */
export function osNavigationActions(sections: readonly AdminSection[] = ADMIN_SECTIONS): AskItem[] {
  return sections.map((s) => ({
    id: `go-${s.id}`,
    kind: 'go' as const,
    title: s.label,
    detail: s.group,
    sectionId: s.id,
  }));
}

/** Answer an OS question from the real ledgers, newest intent-first. */
export function askNowOpen(input: AskInput, query: string): AskItem[] {
  const { members, items, approvals } = input;
  const sections = input.sections ?? ADMIN_SECTIONS;
  const q = query.trim().toLowerCase();
  const b = summarizeOs({ members, items, approvals, docs: [] });
  const answers: AskItem[] = [];

  const push = (title: string, detail: string, sectionId: string) => {
    answers.push({ id: `ask-${answers.length + 1}`, kind: 'ask', title, detail, sectionId });
  };

  if (!q) {
    return [
      ...ASK_SUGGESTIONS.map((s) => ({
        id: `suggest-${s.id}`,
        kind: 'suggest' as const,
        title: s.question,
        detail: 'Ask the OS',
        runQuery: s.question,
      })),
      ...osNavigationActions(sections),
    ];
  }

  if (/(blocked|stuck|behind)/.test(q)) {
    const blocked = items.filter((w) => w.status === 'blocked');
    if (blocked.length === 0) {
      push('No blocked work — the board is clear', `${b.openItems} open item${b.openItems === 1 ? '' : 's'} moving on the board`, 'work-board');
    }
    for (const w of blocked) {
      push(`${w.title} is blocked`, `${w.department} · ${nameOf(members, w.assignee_id)}`, 'work-board');
    }
  } else if (/(sign.?off|approval|approve|pending)/.test(q)) {
    const pending = approvals.filter((a) => a.status === 'pending');
    if (pending.length === 0) {
      push('No sign-offs waiting — the approval queue is clear', `${b.decisionsTotal} decision${b.decisionsTotal === 1 ? '' : 's'} already signed`, 'approvals');
    }
    for (const a of pending) {
      push(`"${a.reason}" needs your sign-off`, `${nameOf(members, a.requested_by)} requested it`, 'approvals');
    }
  } else if (/(health|healthy|score|snapshot)/.test(q)) {
    const ext: OsExtendedBriefing = {
      ...b,
      launchesOpen: 0, launchesReady: 0, partnersActive: 0, partnersNegotiation: 0,
      pressPublished: 0, pressPending: 0, campaignsLive: 0, campaignsInBuild: 0,
      launchesTotal: 0, partnersTotal: 0, pressTotal: 0, campaignsTotal: 0,
    };
    push(`OS health ${osHealthScore(ext)}/100`, `${b.pendingSignOffs} sign-offs waiting · ${b.blockedItems} blocked items`, 'founder');
  } else if (/(attention|worry|escalat)/.test(q)) {
    const cards = departmentScorecards({ members, items, approvals });
    const needing = cards.filter((c) => c.status === 'attention');
    if (needing.length === 0) {
      push('No departments need attention right now', `${cards.length} departments scored from the real ledgers`, 'workforce');
    }
    for (const c of needing) {
      push(`${c.department} needs attention`, `${c.blocked} blocked · ${c.awaitingApproval} waiting on sign-off`, 'workforce');
    }
  } else if (/(agent|working|team|staff|who)/.test(q)) {
    push(
      `${b.agentsWorking} of ${b.agents} agents working right now`,
      `${b.agentsBlocked} blocked · ${b.agentsWaiting} waiting for kickoff`,
      'workforce',
    );
  } else if (/(activity|latest|recent|happened|today|stream)/.test(q)) {
    const stream = buildActivityStream({ members, items, approvals, snapshots: input.snapshots, limit: 3 });
    if (stream.length === 0) {
      push('Nothing timestamped yet', 'The stream fills as rows are created and moved', 'work-board');
    }
    for (const e of stream) {
      push(`${e.actor} ${e.text}`, `${e.department} · ${e.at.slice(0, 10)}`, 'work-board');
    }
  }

  return [...answers, ...osNavigationActions(sections)];
}
