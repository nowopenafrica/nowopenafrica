/**
 * Pacing a run inside Instagram's limit.
 *
 * The assertion that matters most is that an UNREPORTED quota is never read
 * as an empty one. Meta omits these headers until an endpoint has seen
 * traffic, so "no header" is the normal state at the start of a run — and
 * treating it as 0% spent is how you arrive at the wall at full speed.
 */

import { describe, it, expect } from 'vitest';

import {
  readUsage, spentPercent, pace, resumeAt, pauseExplanation,
  SLOW_AT, PAUSE_AT, EMPTY_USAGE,
} from './instagramQuota';

/** A Headers-alike, because that is all readUsage needs. */
const headers = (h: Record<string, string>) => ({
  get: (name: string) => h[name.toLowerCase()] ?? null,
});

const BASE = 1200;

describe('reading what Meta reports', () => {
  it('reads the three percentages from X-App-Usage', () => {
    const u = readUsage(headers({
      'x-app-usage': '{"call_count":28,"total_cputime":15,"total_time":20}',
    }));
    expect(u.callCount).toBe(28);
    expect(u.totalCpuTime).toBe(15);
    expect(u.totalTime).toBe(20);
  });

  it('reads the minutes until access returns from the business-use-case header', () => {
    /*
     * The single most useful number Meta sends: it turns "stopped" into
     * "continues at a time you can read off a clock".
     */
    const u = readUsage(headers({
      'x-business-use-case-usage':
        '{"1790161078687252":[{"type":"pages","call_count":100,"estimated_time_to_regain_access":12}]}',
    }));
    expect(u.regainAccessMinutes).toBe(12);
  });

  it('takes the worst case across business objects', () => {
    const u = readUsage(headers({
      'x-business-use-case-usage':
        '{"a":[{"estimated_time_to_regain_access":5}],"b":[{"estimated_time_to_regain_access":31}]}',
    }));
    expect(u.regainAccessMinutes).toBe(31);
  });
});

describe('unreported is not zero', () => {
  it('reports null, not 0, when Meta sent no headers', () => {
    /*
     * THE ONE THAT MATTERS. Meta omits these until an endpoint has seen
     * enough traffic, so a run begins with nothing reported. Reading that as
     * "0% spent" is a claim nobody made.
     */
    const u = readUsage(headers({}));
    expect(u).toEqual(EMPTY_USAGE);
    expect(spentPercent(u)).toBeNull();
  });

  it('survives a malformed header rather than throwing mid-run', () => {
    for (const bad of ['not json', '{', '[]', '{"call_count":"nonsense"}']) {
      expect(() => readUsage(headers({ 'x-app-usage': bad })), bad).not.toThrow();
    }
    expect(spentPercent(readUsage(headers({ 'x-app-usage': 'not json' })))).toBeNull();
  });

  it('proceeds at the normal pace when nothing is known', () => {
    // Not knowing is a reason to behave normally, not to stop.
    expect(pace(EMPTY_USAGE, BASE)).toEqual({ action: 'go', delayMs: BASE });
  });
});

describe('it slows down before it has to', () => {
  it('runs at the normal delay while there is room', () => {
    expect(pace({ ...EMPTY_USAGE, callCount: 10 }, BASE)).toEqual({ action: 'go', delayMs: BASE });
    expect(pace({ ...EMPTY_USAGE, callCount: SLOW_AT - 1 }, BASE).action).toBe('go');
  });

  it('stretches the remaining calls once past the slow threshold', () => {
    const p = pace({ ...EMPTY_USAGE, callCount: SLOW_AT }, BASE);
    expect(p.action).toBe('slow');
    if (p.action === 'slow') expect(p.delayMs).toBeGreaterThan(BASE);
  });

  it('slows further the closer it gets', () => {
    const near = pace({ ...EMPTY_USAGE, callCount: SLOW_AT }, BASE);
    const nearer = pace({ ...EMPTY_USAGE, callCount: PAUSE_AT - 1 }, BASE);
    if (near.action === 'slow' && nearer.action === 'slow') {
      expect(nearer.delayMs).toBeGreaterThan(near.delayMs);
    } else {
      throw new Error('both should be slowing');
    }
  });

  it('uses the highest of the three percentages, not the first', () => {
    // CPU time can be the binding one even when call count looks fine.
    const p = pace({ ...EMPTY_USAGE, callCount: 5, totalCpuTime: PAUSE_AT + 2 }, BASE);
    expect(p.action).toBe('pause');
  });
});

describe('it stops while calls still work', () => {
  it('pauses at the threshold rather than running into the refusal', () => {
    /*
     * Hitting the wall is not free: Meta counts the refused calls too, so
     * charging on spends the NEXT hour as well and the operator waits longer
     * than if the run had simply stopped.
     */
    const p = pace({ ...EMPTY_USAGE, callCount: PAUSE_AT }, BASE);
    expect(p.action).toBe('pause');
  });

  it('believes Meta over its own arithmetic about when to return', () => {
    const p = pace({ ...EMPTY_USAGE, callCount: 100, regainAccessMinutes: 7 }, BASE);
    expect(p).toMatchObject({ action: 'pause', resumeInMinutes: 7 });
  });

  it('waits out the window when Meta did not say how long', () => {
    // The window is a rolling hour; the honest worst case is the whole of it.
    const p = pace({ ...EMPTY_USAGE, callCount: 99 }, BASE);
    expect(p).toMatchObject({ action: 'pause', resumeInMinutes: 60 });
  });

  it('never returns a zero-minute pause, which would spin', () => {
    const p = pace({ ...EMPTY_USAGE, regainAccessMinutes: 0.2 }, BASE);
    if (p.action === 'pause') expect(p.resumeInMinutes).toBeGreaterThanOrEqual(1);
  });
});

describe('what the operator is told', () => {
  const NOW = new Date('2026-10-09T14:20:00');

  it('gives a clock time to come back, not a duration to compute', () => {
    /*
     * Locale-agnostic on purpose: the time is rendered for whoever is
     * reading it, so this pins the MINUTE and that an hour is present,
     * not a 24-hour format the operator may never see.
     */
    expect(resumeAt(15, NOW)).toMatch(/:35/);
  });

  it('does not call a pause a failure', () => {
    /*
     * The wording is the point. A run that stopped inside the limit, kept
     * what it filed and knows where to resume has not failed — and calling it
     * a failure is what sends somebody looking for a way around the limit.
     */
    const msg = pauseExplanation(40, 960, 15, NOW);
    expect(msg).not.toMatch(/fail/i);
    expect(msg).toMatch(/Paused/);
    expect(msg).toMatch(/40 accounts are filed/);
    expect(msg).toMatch(/960 still to go/);
    expect(msg).toMatch(/:35/);
  });

  it('reads naturally for a single account', () => {
    expect(pauseExplanation(1, 1, 5, NOW)).toMatch(/1 account is filed/);
  });
});
