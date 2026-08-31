import { describe, it, expect } from 'vitest';

import {
  verifyRun, ungroundedNumbers, statusAfterRun, currentWorkAfterRun,
  ranked, withDeltas, type AgentResult, type Fact,
} from '../lib/workforceRuntime';

const fact = (key: string, value: number, source = 'businesses'): Fact =>
  ({ key, label: key, value, source });

const run = (over: Partial<AgentResult> = {}): AgentResult => ({
  agentKey: 'chief-of-staff',
  facts: [fact('listings', 532), fact('claims_pending', 4)],
  findings: [{ title: 'Claims waiting', severity: 'act', detail: 'Four claims need review.', basis: ['claims_pending'] }],
  summary: '532 listings, 4 claims waiting.',
  ...over,
});

describe('a run has to be checkable', () => {
  it('accepts a run where every number is traceable', () => {
    expect(verifyRun(run())).toEqual({ status: 'ok' });
  });

  it('rejects a fact that does not say where it came from', () => {
    const v = verifyRun(run({ facts: [{ key: 'x', label: 'x', value: 5, source: '' }], findings: [], summary: 'fine' }));
    expect(v.status).toBe('rejected');
    expect(v.reason).toMatch(/where it came from/i);
  });

  it('rejects a finding resting on nothing', () => {
    const v = verifyRun(run({ findings: [{ title: 'Vibes', severity: 'watch', detail: 'Feels slow.', basis: [] }] }));
    expect(v.status).toBe('rejected');
    expect(v.reason).toMatch(/rests on no measurement/i);
  });

  it('rejects a finding citing something the run never measured', () => {
    const v = verifyRun(run({ findings: [{ title: 'Traffic', severity: 'act', detail: 'Down.', basis: ['page_views'] }] }));
    expect(v.status).toBe('rejected');
    expect(v.reason).toMatch(/never measured/i);
  });

  /*
   * The realistic failure. An agent measures three things correctly and then
   * writes a summary containing a number it invented — and the summary is the
   * only line anybody reads.
   */
  it('rejects a summary that states a number the run never measured', () => {
    const v = verifyRun(run({ summary: '532 listings, and 12000 page views this week.' }));
    expect(v.status).toBe('rejected');
    expect(v.reason).toMatch(/12000/);
  });

  it('says so plainly when there was nothing to measure', () => {
    expect(verifyRun(run({ facts: [], findings: [], summary: 'Nothing today.' })).status)
      .toBe('nothing-to-report');
  });

  it('rejects a value that is not a real number', () => {
    const v = verifyRun(run({ facts: [{ key: 'x', label: 'x', value: NaN, source: 'businesses' }], findings: [], summary: 'x' }));
    expect(v.status).toBe('rejected');
  });
});

describe('which numbers count as claims', () => {
  const facts = [fact('a', 532), fact('b', 4)];

  it('lets measured numbers through', () => {
    expect(ungroundedNumbers('532 listings and 4 claims', facts)).toEqual([]);
  });

  it('catches an invented one', () => {
    expect(ungroundedNumbers('532 listings, 9000 views', facts)).toEqual(['9000']);
  });

  it('reads comma-formatted numbers as the same value', () => {
    expect(ungroundedNumbers('1,000 spots remain', [fact('spots', 1000)])).toEqual([]);
  });

  // Flagging "3 of 7" and percentages would make the check so noisy it gets
  // switched off, and neither is a measurement being presented as a finding.
  it('ignores small numbers and percentages used as phrasing', () => {
    expect(ungroundedNumbers('3 of 7 checks done, up 40%', facts)).toEqual([]);
  });

  it('accepts a delta the run computed', () => {
    expect(ungroundedNumbers('up by 25 since yesterday', [{ ...fact('a', 532), delta: 25 }])).toEqual([]);
  });
});

describe('what the roster shows afterwards', () => {
  it('marks the agent active after a good run', () => {
    expect(statusAfterRun({ status: 'ok' })).toBe('active');
  });

  /*
   * An agent that keeps reporting "active" while its last three runs failed is
   * worse than one that admits it is broken — the roster is where somebody
   * would notice.
   */
  it('marks it in error after a rejected or failed run', () => {
    expect(statusAfterRun({ status: 'rejected', reason: 'x' })).toBe('error');
    expect(statusAfterRun({ status: 'failed', reason: 'x' })).toBe('error');
  });

  it('marks it waiting when there was nothing to do', () => {
    expect(statusAfterRun({ status: 'nothing-to-report' })).toBe('waiting');
  });

  it('writes the failure into current_work rather than hiding it', () => {
    const w = currentWorkAfterRun(run(), { status: 'rejected', reason: 'made a number up' }, new Date('2026-09-01T09:30:00Z'));
    expect(w).toMatch(/rejected at 2026-09-01 09:30/);
    expect(w).toMatch(/made a number up/);
  });

  it('writes the summary when the run was good', () => {
    expect(currentWorkAfterRun(run(), { status: 'ok' }, new Date('2026-09-01T09:30:00Z')))
      .toBe('532 listings, 4 claims waiting. (2026-09-01 09:30)');
  });
});

describe('presentation helpers', () => {
  it('puts what needs doing above what needs watching', () => {
    const out = ranked([
      { title: 'c', severity: 'info', detail: '', basis: ['x'] },
      { title: 'a', severity: 'act', detail: '', basis: ['x'] },
      { title: 'b', severity: 'watch', detail: '', basis: ['x'] },
    ]);
    expect(out.map((f) => f.title)).toEqual(['a', 'b', 'c']);
  });

  it('computes movement against the previous run', () => {
    const now = withDeltas([fact('a', 532), fact('b', 4)], [fact('a', 500), fact('b', 9)]);
    expect(now.map((f) => f.delta)).toEqual([32, -5]);
  });

  it('reports no movement rather than zero when there is no previous run', () => {
    expect(withDeltas([fact('a', 5)], null)[0].delta).toBeNull();
  });

  it('leaves a brand new fact without a delta', () => {
    expect(withDeltas([fact('new', 3)], [fact('old', 1)])[0].delta).toBeNull();
  });
});
