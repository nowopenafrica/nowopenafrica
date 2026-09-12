import { describe, it, expect } from 'vitest';
import {
  LAUNCH_CHECKLIST, LAUNCH_STATUS_LABELS,
  launchStatus, launchProgress, summarizeLaunches, mapLaunchRow, LAUNCHES_SEED,
  type LaunchItem, autoTickCount,
} from './launches';

const org = '00000000-0000-4000-8000-00000000a001';

function launch(over: Partial<LaunchItem> = {}): LaunchItem {
  return { id: 'l1', org_id: org, name: 'Restaurant Week', area: 'Growth · Campaigns', target: 'Sep 2026', done: [], ...over };
}

describe('launches lib', () => {
  it('exposes the standard seven-step checklist and status labels', () => {
    expect(LAUNCH_CHECKLIST).toHaveLength(7);
    expect(LAUNCH_CHECKLIST[0]).toBe('Design review passed');
    expect(LAUNCH_CHECKLIST).toContain('Rollout scheduled');
    expect(LAUNCH_STATUS_LABELS.ready).toBe('Ready to ship');
    expect(LAUNCH_STATUS_LABELS.not_started).toBe('Not started');
  });

  it('derives status from the checklist ticks, never stored', () => {
    expect(launchStatus(launch({ done: [] }))).toBe('not_started');
    expect(launchStatus(launch({ done: [false, false, false, false, false, false, false] }))).toBe('not_started');
    expect(launchStatus(launch({ done: [true, true, false, false, false, false, false] }))).toBe('in_progress');
    expect(launchStatus(launch({ done: [true, true, true, true, true, true, true] }))).toBe('ready');
  });

  it('computes progress as a rounded percentage', () => {
    expect(launchProgress(launch({ done: [] }))).toBe(0);
    expect(launchProgress(launch({ done: [true, true, true, true, true, true, true] }))).toBe(100);
    expect(launchProgress(launch({ done: [true, true, true, false, false, false, false] }))).toBe(43);
  });

  it('summarizes the board by status and area', () => {
    const s = summarizeLaunches([
      launch({ id: 'l1', name: 'A', done: [true, true, true, true, true, true, true], area: 'Trust & Safety' }),
      launch({ id: 'l2', name: 'B', done: [true, false, false, false, false, false, false], area: 'Growth · Campaigns' }),
      launch({ id: 'l3', name: 'C', done: [], area: 'Growth · Campaigns' }),
    ]);
    expect(s.total).toBe(3);
    expect(s.ready).toBe(1);
    expect(s.inProgress).toBe(1);
    expect(s.notStarted).toBe(1);
    expect(s.avgProgress).toBe(38);
    expect(s.byArea).toEqual({ 'Trust & Safety': 1, 'Growth · Campaigns': 2 });
  });

  it('maps os_launches rows, tolerating a missing checklist', () => {
    const row = { id: 'r1', org_id: org, name: 'AI Video Studio', area: 'Product · Media', target: 'Aug 2026', checklist_done: [true, false] as boolean[] };
    expect(mapLaunchRow(row)).toMatchObject({ id: 'r1', name: 'AI Video Studio', done: [true, false] });
    expect(mapLaunchRow({ ...row, checklist_done: null }).done).toEqual([]);
  });

  it('maps checklist_evidence alongside the ticks and counts auto ticks', () => {
    const row = {
      id: 'r2', org_id: org, name: 'Verified Badge', area: 'Trust & Safety', target: 'Mar 2026',
      checklist_done: [true, true, false, false, false, false, false] as boolean[],
      checklist_evidence: [{ auto: true, source: 'os_approvals' }, null, null, null, null, null, null],
    };
    const row2 = { ...row, checklist_evidence: [{ auto: true, source: 'os_approvals' }, null, { auto: true, source: 'business_media_assets' }, null, null, null, null] };
    const mapped = mapLaunchRow(row);
    expect(mapped.evidence).toEqual(row.checklist_evidence);
    expect(autoTickCount(mapped)).toBe(1);
    expect(autoTickCount(mapLaunchRow(row2))).toBe(2);
    expect(autoTickCount(launch({ done: [true] }))).toBe(0);
  });

  it('mirrors the three seed launches', () => {
    expect(LAUNCHES_SEED).toHaveLength(3);
    expect(new Set(LAUNCHES_SEED.map((l) => l.name)).size).toBe(3);
    expect(LAUNCHES_SEED[0]).toMatchObject({ name: 'AI Video Studio', done: [true, true, true, true, true, true, true] });
    expect(LAUNCHES_SEED.every((l) => l.org_id === org)).toBe(true);
  });
});
