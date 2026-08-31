/**
 * What it means for an AI employee to have actually done its job.
 *
 * The roster has eighteen AI roles with titles, departments and job
 * descriptions, and until now not one of them ran: every write to os_workforce
 * came from a human clicking in the admin console, and `current_work` was a
 * sentence written once in a seed migration. An org chart, not a workforce.
 *
 * This is the contract that makes a run real, and the reason it is strict:
 * an agent that reports on the business is read by the founder and acted on. A
 * number it made up is worse than no number, because it is indistinguishable
 * from one it measured. So every figure an agent reports has to arrive with the
 * query that produced it, and a run carrying an ungrounded figure is rejected
 * rather than displayed.
 */

/** A number the agent measured, with proof of where it came from. */
export interface Fact {
  key: string;
  label: string;
  value: number;
  /** The table or view queried. Empty means nobody can check it. */
  source: string;
  /** Optional filter description, so the number is reproducible by hand. */
  filter?: string;
  /** Compared with the previous run, when there was one. */
  delta?: number | null;
}

export type Severity = 'info' | 'watch' | 'act';

/** Something the agent thinks a person should do, tied to facts it measured. */
export interface Finding {
  title: string;
  severity: Severity;
  detail: string;
  /** Fact keys this rests on. A finding resting on nothing is not reportable. */
  basis: string[];
}

export interface AgentResult {
  agentKey: string;
  facts: Fact[];
  findings: Finding[];
  /** One line for the roster's `current_work`. */
  summary: string;
}

export type RunStatus = 'ok' | 'nothing-to-report' | 'rejected' | 'failed';

export interface RunVerdict {
  status: RunStatus;
  /** Why a run was rejected — shown to an admin, never swallowed. */
  reason?: string;
}

/**
 * Would a reader be able to check every claim in this run?
 *
 * Three rules, all about traceability rather than correctness:
 *
 *   1. every fact names a source
 *   2. every finding rests on facts that exist in the same run
 *   3. the summary quotes no number that is not a fact
 *
 * The third is the one that catches the realistic failure. An agent that
 * measures three things correctly and then writes "traffic is up 40%" in its
 * summary has fabricated the only sentence anybody reads.
 */
export function verifyRun(result: AgentResult): RunVerdict {
  const keys = new Set(result.facts.map((f) => f.key));

  for (const f of result.facts) {
    if (!f.source?.trim()) {
      return { status: 'rejected', reason: `Fact "${f.key}" does not say where it came from.` };
    }
    if (!Number.isFinite(f.value)) {
      return { status: 'rejected', reason: `Fact "${f.key}" is not a finite number.` };
    }
  }

  for (const finding of result.findings) {
    if (finding.basis.length === 0) {
      return { status: 'rejected', reason: `Finding "${finding.title}" rests on no measurement.` };
    }
    const orphan = finding.basis.find((b) => !keys.has(b));
    if (orphan) {
      return { status: 'rejected', reason: `Finding "${finding.title}" cites "${orphan}", which this run never measured.` };
    }
  }

  const invented = ungroundedNumbers(result.summary, result.facts);
  if (invented.length > 0) {
    return {
      status: 'rejected',
      reason: `The summary states ${invented.join(', ')}, which this run never measured.`,
    };
  }

  if (result.facts.length === 0) return { status: 'nothing-to-report' };
  return { status: 'ok' };
}

/**
 * Numbers in prose that no fact backs.
 *
 * Percentages and small ordinals are ignored — "the first 1,000" and "3 of 7"
 * are phrasing, not measurements, and flagging them would make the check so
 * noisy it gets switched off. What matters is a figure presented as a finding.
 */
export function ungroundedNumbers(summary: string, facts: Fact[]): string[] {
  const allowed = new Set<number>();
  for (const f of facts) {
    allowed.add(f.value);
    if (typeof f.delta === 'number') allowed.add(Math.abs(f.delta));
  }
  // Small numbers read as prose ("two things", "3 of 7"), not as claims.
  const SMALL = 10;

  const found = String(summary).match(/\b\d[\d,]*\b(?!\s*%)/g) ?? [];
  const bad: string[] = [];
  for (const raw of found) {
    const n = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    if (n <= SMALL) continue;
    if (allowed.has(n)) continue;
    if (!bad.includes(raw)) bad.push(raw);
  }
  return bad;
}

/**
 * The status a roster entry should carry after a run.
 *
 * A rejected or failed run shows as 'error' rather than quietly leaving the
 * previous state. An agent that silently keeps saying "active" while its last
 * three runs failed is worse than one that admits it is broken.
 */
export function statusAfterRun(verdict: RunVerdict): string {
  switch (verdict.status) {
    case 'ok': return 'active';
    case 'nothing-to-report': return 'waiting';
    default: return 'error';
  }
}

/** What the roster shows as `current_work` after a run. */
export function currentWorkAfterRun(result: AgentResult, verdict: RunVerdict, at: Date): string {
  const when = at.toISOString().slice(0, 16).replace('T', ' ');
  if (verdict.status === 'rejected') return `Last run rejected at ${when}: ${verdict.reason}`;
  if (verdict.status === 'failed') return `Last run failed at ${when}: ${verdict.reason ?? 'unknown error'}`;
  if (verdict.status === 'nothing-to-report') return `Ran at ${when}. Nothing to report.`;
  return `${result.summary} (${when})`;
}

/** Findings worth a person's attention, most urgent first. */
export function ranked(findings: Finding[]): Finding[] {
  const order: Record<Severity, number> = { act: 0, watch: 1, info: 2 };
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Compare this run's facts with the previous run's, filling in deltas. */
export function withDeltas(facts: Fact[], previous: Fact[] | null | undefined): Fact[] {
  if (!previous?.length) return facts.map((f) => ({ ...f, delta: null }));
  const before = new Map(previous.map((f) => [f.key, f.value]));
  return facts.map((f) => {
    const was = before.get(f.key);
    return { ...f, delta: typeof was === 'number' ? f.value - was : null };
  });
}
