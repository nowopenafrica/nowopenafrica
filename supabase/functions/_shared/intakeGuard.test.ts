/**
 * What a stranger may spend of our Instagram hour.
 *
 * The assertions that matter are the ones about NOT letting public traffic
 * empty the budget. When it is gone the gallery refresh stops, the admin
 * batch stops, and the only visible symptom is "Instagram is not working" —
 * with nothing on screen connecting that to a visitor typing handles.
 */

import { describe, it, expect } from 'vitest';

import {
  decideIntake, spentPercent, windowStart, minutesLeftInWindow,
  PUBLIC_CEILING, PER_CALLER_MAX,
} from './intakeGuard';
import { usageFromHeaders, EMPTY_USAGE } from './quota';

const NOW = new Date('2026-10-10T14:20:00Z');
const usage = (over: Partial<typeof EMPTY_USAGE> = {}) => ({ ...EMPTY_USAGE, ...over });

describe('public traffic cannot empty the hour', () => {
  it('refuses once public spend reaches the ceiling', () => {
    const d = decideIntake(usage({ callCount: PUBLIC_CEILING }), 0, NOW);
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.reason).toBe('budget');
  });

  it('leaves room for the scheduled jobs and the admin tools', () => {
    /*
     * The reservation is the point: the gallery refresh runs every twenty
     * minutes on this same budget, and an operator may start a batch at any
     * time. Both keep existing listings correct, which matters more than an
     * anonymous lookup.
     */
    expect(PUBLIC_CEILING).toBeLessThan(100);
    expect(decideIntake(usage({ callCount: PUBLIC_CEILING - 1 }), 0, NOW).allow).toBe(true);
  });

  it('reads the highest percentage, not the first', () => {
    /*
     * MEASURED: call_count 45 while total_time was 86. Watching the call
     * count alone believes it has half the hour left when it has 14%.
     */
    const d = decideIntake(usage({ callCount: 5, totalTime: PUBLIC_CEILING + 10 }), 0, NOW);
    expect(d.allow).toBe(false);
  });
});

describe('unknown spend is not empty spend', () => {
  it('reports null when Meta reported nothing', () => {
    expect(spentPercent(usage())).toBeNull();
    expect(spentPercent(null)).toBeNull();
  });

  it('still serves when the quota is unknown', () => {
    /*
     * Meta omits the headers until an endpoint has seen traffic, so refusing
     * on silence would refuse the first request of every window. The
     * per-caller limit still bounds what that silence can cost.
     */
    expect(decideIntake(null, 0, NOW).allow).toBe(true);
    expect(decideIntake(usage(), 0, NOW).allow).toBe(true);
  });

  it('survives malformed headers rather than throwing mid-request', () => {
    for (const bad of ['not json', '{', '{"call_count":"nonsense"}']) {
      expect(() => usageFromHeaders({ 'x-app-usage': bad }), bad).not.toThrow();
    }
    expect(spentPercent(usageFromHeaders({ 'x-app-usage': 'not json' }))).toBeNull();
  });

  it('reads the real header shape', () => {
    const u = usageFromHeaders({ 'x-app-usage': '{"call_count":45,"total_cputime":0,"total_time":86}' });
    expect(spentPercent(u)).toBe(86);
  });
});

describe('one caller cannot enumerate accounts', () => {
  it('refuses past the per-caller limit', () => {
    const d = decideIntake(null, PER_CALLER_MAX, NOW);
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.reason).toBe('caller');
  });

  it('is generous enough for a real business owner', () => {
    // Somebody checking their own shop needs one lookup, maybe a retry.
    expect(PER_CALLER_MAX).toBeGreaterThanOrEqual(2);
    expect(decideIntake(null, PER_CALLER_MAX - 1, NOW).allow).toBe(true);
  });

  it('checks the caller limit before the budget', () => {
    /*
     * Both are exceeded here. Refusing on the caller limit is the one the
     * person can act on, and it does not disclose how much of the platform's
     * budget is left — which is not a stranger's business.
     */
    const d = decideIntake(usage({ callCount: 99 }), PER_CALLER_MAX + 5, NOW);
    if (!d.allow) expect(d.reason).toBe('caller');
    else throw new Error('should have refused');
  });
});

describe('what a refused visitor is told', () => {
  it('gives a time and a way forward, not a dead end', () => {
    const d = decideIntake(usage({ callCount: 99 }), 0, NOW);
    if (d.allow) throw new Error('should have refused');
    expect(d.retryAfterMinutes).toBeGreaterThan(0);
    expect(d.message).toMatch(/try again/i);
    // The route that always works, offered instead of nothing.
    expect(d.message).toMatch(/add your business/i);
  });

  it('never promises a zero-minute wait', () => {
    const atEdge = new Date('2026-10-10T14:59:59Z');
    expect(minutesLeftInWindow(atEdge)).toBeGreaterThanOrEqual(1);
  });
});

describe('the window matches the SQL implementation', () => {
  it('floors to the hour, so buckets line up with rate_limit_buckets', () => {
    expect(windowStart(new Date('2026-10-10T14:37:12Z')).toISOString())
      .toBe('2026-10-10T14:00:00.000Z');
  });

  it('counts the minutes remaining in that window', () => {
    expect(minutesLeftInWindow(new Date('2026-10-10T14:20:00Z'))).toBe(40);
  });
});

describe('the limit fits how this audience reaches the internet', () => {
  it('is generous enough for a shared mobile address', () => {
    /*
     * Three was the first number here, chosen thinking of one owner checking
     * one shop — and it locked the founder out of his own product after two
     * curl tests and one click. Worse, Nigerian mobile networks NAT heavily,
     * so one address can be hundreds of real people: three would have shut
     * out a carrier's subscribers after a single curious visitor.
     */
    expect(PER_CALLER_MAX).toBeGreaterThanOrEqual(10);
  });

  it('still stops enumeration on its own address', () => {
    // Bounded per address; the budget ceiling bounds the rest.
    expect(decideIntake(null, PER_CALLER_MAX, NOW).allow).toBe(false);
    expect(PER_CALLER_MAX).toBeLessThan(100);
  });
});
