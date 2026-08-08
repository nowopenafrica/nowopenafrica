// NowOpen OS — launches layer (pure, no React / Supabase I/O).
//
// Every feature launch on one board: a name, an owner area, a target and the
// standard checklist. Status is always derived from the checklist ticks —
// never stored — so the board is honest. The Launch Control section reads
// os_launches from Supabase and falls back to LAUNCHES_SEED (clearly
// labelled) until the migration is applied, same honest-fallback pattern as
// the rest of the OS.

import { NOWOPEN_ORG_ID } from './workforce';

/** The standard launch checklist, in order. Mirrored by the os_launches
 *  checklist_done boolean array — keep the two in sync. */
export const LAUNCH_CHECKLIST = [
  'Design review passed',
  'QA sign-off',
  'Marketing assets ready',
  'Explainer video made',
  'Launch email drafted',
  'Docs & release notes written',
  'Rollout scheduled',
] as const;

export type LaunchStatus = 'not_started' | 'in_progress' | 'ready';

export const LAUNCH_STATUS_LABELS: Record<LaunchStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  ready: 'Ready to ship',
};

export interface LaunchItem {
  id: string;
  org_id: string;
  name: string;
  area: string;
  target: string;
  /** One tick per LAUNCH_CHECKLIST item. */
  done: boolean[];
  created_at?: string;
  updated_at?: string;
}

export interface LaunchRow {
  id: string;
  org_id: string;
  name: string;
  area: string;
  target: string;
  checklist_done?: boolean[] | null;
  created_at?: string;
  updated_at?: string;
}

/** Map an os_launches row (checklist_done) to the LaunchItem shape. */
export function mapLaunchRow(row: LaunchRow): LaunchItem {
  return {
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    area: row.area,
    target: row.target,
    done: row.checklist_done ?? [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function launchStatus(l: LaunchItem): LaunchStatus {
  const done = l.done.filter(Boolean).length;
  if (done === 0) return 'not_started';
  if (done >= LAUNCH_CHECKLIST.length) return 'ready';
  return 'in_progress';
}

export function launchProgress(l: LaunchItem): number {
  return Math.round((l.done.filter(Boolean).length / LAUNCH_CHECKLIST.length) * 100);
}

export interface LaunchSummary {
  total: number;
  ready: number;
  inProgress: number;
  notStarted: number;
  avgProgress: number;
  byArea: Record<string, number>;
}

export function summarizeLaunches(launches: LaunchItem[]): LaunchSummary {
  const byArea: Record<string, number> = {};
  let ready = 0;
  let inProgress = 0;
  let notStarted = 0;
  let progressSum = 0;
  for (const l of launches) {
    const s = launchStatus(l);
    if (s === 'ready') ready += 1;
    else if (s === 'in_progress') inProgress += 1;
    else notStarted += 1;
    progressSum += launchProgress(l);
    byArea[l.area] = (byArea[l.area] ?? 0) + 1;
  }
  return {
    total: launches.length,
    ready,
    inProgress,
    notStarted,
    avgProgress: launches.length === 0 ? 0 : Math.round(progressSum / launches.length),
    byArea,
  };
}

// The launches Launch Control used to hardcode, mirrored by the
// 20260808060000_os_launches seed. The component uses these as the honest
// dev/fallback state until the migration is applied. Keep in sync with the
// SQL seed.
export const LAUNCHES_SEED: LaunchItem[] = [
  { id: 'seed-launch-0', org_id: NOWOPEN_ORG_ID, name: 'AI Video Studio', area: 'Product · Media', target: 'Aug 2026', done: [true, true, true, true, true, true, true], created_at: '2026-06-01T10:00:00Z' },
  { id: 'seed-launch-1', org_id: NOWOPEN_ORG_ID, name: 'Verified Badge', area: 'Trust & Safety', target: 'Mar 2026', done: [true, true, true, true, true, true, true], created_at: '2026-02-01T10:00:00Z' },
  { id: 'seed-launch-2', org_id: NOWOPEN_ORG_ID, name: 'Restaurant Week 2026', area: 'Growth · Campaigns', target: 'Sep 2026', done: [true, false, false, false, false, false, false], created_at: '2026-07-15T10:00:00Z' },
];
