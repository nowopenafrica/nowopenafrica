// NowOpen OS — the AI working day (pure, no React / Supabase I/O).
//
// Every role runs a three-beat day: a morning plan, a midday check and an
// end-of-day report. Beats are derived from the clock; the plan comes from
// the role's digital job description; the numbers (in flight, blocked, done,
// waiting for sign-off) come from the real ledgers. Nothing here invents
// activity — a quiet department gets a quiet report, not fake work.

import { JOB_DESCRIPTIONS, type JobDescription } from './jobDescriptions';
import type { WorkforceMember } from './workforce';
import type { WorkItem } from './work';
import type { ApprovalRequest } from './approvals';
import { hashString, mulberry32 } from './videoCreator';

export type DayBeat = 'morning' | 'midday' | 'eod';

export const DAY_BEATS: readonly DayBeat[] = ['morning', 'midday', 'eod'];

export const DAY_BEAT_LABELS: Record<DayBeat, string> = {
  morning: 'Morning plan',
  midday: 'Midday check',
  eod: 'End of day',
};

export const DAY_BEAT_DESCRIPTIONS: Record<DayBeat, string> = {
  morning: 'What each role plans to do today, from its job description.',
  midday: 'How the week is tracking at the halfway point of the day.',
  eod: 'What actually moved — done, blocked and waiting on sign-off.',
};

/** Which beat the clock is on. Morning before noon, midday before 5pm, EOD after. */
export function dayBeat(now = new Date()): DayBeat {
  const h = now.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'midday';
  return 'eod';
}

export interface RoleDayPlan {
  agentKey: string;
  role: string;
  department: string;
  /** The beat the clock is on right now. */
  beat: DayBeat;
  /** What the role plans to do today (its daily cadence). */
  morning: string[];
  /** The week's targets it checks in on at midday. */
  midday: string[];
  /** How it closes the day: the number that actually moved. */
  eod: string;
}

/** Deterministic daily plan for one role, from its job description. */
export function roleDayPlan(jd: JobDescription, now = new Date()): RoleDayPlan {
  return {
    agentKey: jd.agentKey,
    role: jd.role,
    department: jd.department,
    beat: dayBeat(now),
    morning: jd.cadence.daily,
    midday: jd.cadence.weekly,
    eod: `Close out ${jd.cadence.monthly[0]?.toLowerCase() ?? 'the month'} and log outcomes against ${jd.kpis[0]?.toLowerCase() ?? 'the KPI set'}.`,
  };
}

/** One plan per roster role, in roster order. */
export function roleDayPlans(now = new Date()): RoleDayPlan[] {
  return JOB_DESCRIPTIONS.map((jd) => roleDayPlan(jd, now));
}

/** Plans grouped by department (roster order), for department report cards. */
export function dayPlansByDepartment(now = new Date()): Map<string, RoleDayPlan[]> {
  const map = new Map<string, RoleDayPlan[]>();
  for (const p of roleDayPlans(now)) {
    const list = map.get(p.department) ?? [];
    list.push(p);
    map.set(p.department, list);
  }
  return map;
}

export interface DepartmentDayCard {
  department: string;
  roles: string[];
  planned: number;
  inFlight: number;
  blocked: number;
  done: number;
  awaitingApproval: number;
  /** One honest, data-derived line for the beat. */
  headline: string;
}

/** Builds one card per department that has roles and/or open work. All numbers
 *  come from the real members, work items and approvals — never fabricated. */
export function departmentDayCards(input: {
  members: WorkforceMember[];
  items: WorkItem[];
  approvals: ApprovalRequest[];
  now?: Date;
}): DepartmentDayCard[] {
  const now = input.now ?? new Date();
  const beat = dayBeat(now);
  const byDept = dayPlansByDepartment(now);
  const membersByDept = new Map<string, string[]>();
  for (const m of input.members) {
    if (m.kind !== 'ai') continue;
    const list = membersByDept.get(m.department) ?? [];
    list.push(m.name);
    membersByDept.set(m.department, list);
  }

  const itemStatusByDept = new Map<string, { planned: number; inFlight: number; blocked: number; done: number }>();
  for (const w of input.items) {
    if (w.status === 'cancelled') continue;
    const row = itemStatusByDept.get(w.department) ?? { planned: 0, inFlight: 0, blocked: 0, done: 0 };
    if (w.status === 'done') row.done += 1;
    else if (w.status === 'blocked') row.blocked += 1;
    else if (w.status === 'in_progress') row.inFlight += 1;
    else row.planned += 1;
    itemStatusByDept.set(w.department, row);
  }

  const approvalByDept = new Map<string, number>();
  const itemDept = new Map(input.items.map((w) => [w.id, w.department]));
  for (const a of input.approvals) {
    if (a.status !== 'pending') continue;
    const dept = itemDept.get(a.work_item_id);
    if (!dept) continue;
    approvalByDept.set(dept, (approvalByDept.get(dept) ?? 0) + 1);
  }

  const depts = new Set<string>([...byDept.keys(), ...membersByDept.keys(), ...itemStatusByDept.keys()]);
  const cards: DepartmentDayCard[] = [];
  for (const dept of depts) {
    const roles = [...new Set([...(byDept.get(dept)?.map((p) => p.role) ?? []), ...(membersByDept.get(dept) ?? [])])];
    const work = itemStatusByDept.get(dept) ?? { planned: 0, inFlight: 0, blocked: 0, done: 0 };
    const awaitingApproval = approvalByDept.get(dept) ?? 0;
    const card: DepartmentDayCard = {
      department: dept,
      roles,
      planned: work.planned,
      inFlight: work.inFlight,
      blocked: work.blocked,
      done: work.done,
      awaitingApproval,
      headline: departmentHeadline(dept, beat, { ...work, awaitingApproval }, now),
    };
    cards.push(card);
  }
  return cards.sort((a, b) => a.department.localeCompare(b.department));
}

/** One honest line per department card, seeded by day + department so the same
 *  day reads the same, but different departments never read identically. */
export function departmentHeadline(
  department: string,
  beat: DayBeat,
  counts: { planned: number; inFlight: number; blocked: number; done: number; awaitingApproval: number },
  now = new Date(),
): string {
  const rng = mulberry32(hashString(`${department}:${now.toISOString().slice(0, 10)}`));
  const open = counts.planned + counts.inFlight + counts.blocked;
  const pick = (options: string[]): string => options[Math.floor(rng() * options.length)];

  if (counts.blocked > 0) {
    return `${counts.blocked} blocked — ${pick(['the bottleneck to unstick', 'what the founder should see first', 'top of the unblock queue'])}.`;
  }
  if (counts.awaitingApproval > 0) {
    return `${counts.awaitingApproval} waiting on a human sign-off.`;
  }
  if (counts.inFlight > 0) {
    return `${counts.inFlight} in flight${counts.done > 0 ? `, ${counts.done} already done` : ''} — ${beat === 'morning' ? 'the day has started' : beat === 'midday' ? 'tracking on plan' : 'closing strong'}.`;
  }
  if (open > 0) {
    return `${open} planned and ${counts.done} done — ${pick(['on the radar for today', 'queued for the next sprint'])}.`;
  }
  return counts.done > 0
    ? `${counts.done} delivered — ${beat === 'eod' ? 'clean end of day' : 'ahead of schedule'}.`
    : 'Quiet day — no open work on the board.';
}
