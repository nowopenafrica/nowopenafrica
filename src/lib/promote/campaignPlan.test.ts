import { describe, expect, it } from 'vitest';

import {
  describeCost, lineCost, readyToSend, summarise, type PlanLine,
} from './campaignPlan';

const line = (over: Partial<PlanLine> = {}): PlanLine => ({
  id: 'l1',
  advertId: 'a1',
  title: 'Unipole, Aba Road',
  type: 'Billboard',
  location: 'Port Harcourt',
  dimensions: '12m x 6m',
  days: 30,
  ratePerDay: 1000,
  priceBasis: 'indicative',
  currency: 'NGN',
  artworkUrl: null,
  ...over,
});

const money = (n: number) => `NGN ${n.toLocaleString('en-NG')}`;

describe('a line costs what it costs, or nothing knowable', () => {
  it('multiplies the rate by the days', () => {
    expect(lineCost(line())).toBe(30000);
  });

  /*
   * Null rather than zero. A line with no duration costs an unknown amount,
   * and zero would quietly make a plan look cheaper the more unknowns it
   * carries — exactly backwards.
   */
  it('is unknown, not free, when a piece is missing', () => {
    expect(lineCost(line({ days: null }))).toBeNull();
    expect(lineCost(line({ ratePerDay: null }))).toBeNull();
  });
});

describe('totals are kept apart by where the number came from', () => {
  /*
   * All 97 placements on production are `unverified_import` from published
   * rate cards. A single confident total under a list of billboards would
   * claim a price nobody has given.
   */
  it('never merges a quote with a rate card', () => {
    const s = summarise([
      line({ id: 'a', priceBasis: 'indicative', ratePerDay: 1000 }),
      line({ id: 'b', priceBasis: 'quoted', ratePerDay: 2000 }),
    ]);
    expect(s.totals).toHaveLength(2);
    expect(s.totals.find((t) => t.basis === 'indicative')?.total).toBe(30000);
    expect(s.totals.find((t) => t.basis === 'quoted')?.total).toBe(60000);
    expect(s.hasConfirmedTotal).toBe(false);
  });

  it('allows a confident total only when every line is really quoted', () => {
    const quoted = summarise([
      line({ id: 'a', priceBasis: 'quoted' }),
      line({ id: 'b', priceBasis: 'quoted' }),
    ]);
    expect(quoted.hasConfirmedTotal).toBe(true);
    expect(describeCost(quoted, money)).toBe('NGN 60,000, quoted.');
  });

  /* A partial sum presented as a total is the same lie in smaller type. */
  it('withholds a group total when any line in it is uncosted', () => {
    const s = summarise([
      line({ id: 'a' }),
      line({ id: 'b', days: null }),
    ]);
    const group = s.totals.find((t) => t.basis === 'indicative');
    expect(group?.total).toBeNull();
    expect(group?.incomplete).toEqual([{ title: 'Unipole, Aba Road', why: 'no duration set' }]);
  });

  it('describes the cost as a conversation, not a decision', () => {
    const s = summarise([line()]);
    expect(describeCost(s, money)).toContain('indicative');
    expect(describeCost(summarise([]), money)).toBe('Nothing added yet.');
  });

  it('says the owners will quote when nothing can be costed', () => {
    const s = summarise([line({ ratePerDay: null })]);
    expect(describeCost(s, money)).toMatch(/will quote/);
  });
});

describe('what the plan is made of', () => {
  it('counts the mediums, commonest first', () => {
    const s = summarise([
      line({ id: 'a', type: 'Billboard' }),
      line({ id: 'b', type: 'Billboard' }),
      line({ id: 'c', type: 'Transit' }),
    ]);
    expect(s.byMedium).toEqual([
      { medium: 'Billboard', count: 2 },
      { medium: 'Transit', count: 1 },
    ]);
  });

  it('files a placement with no medium rather than dropping it', () => {
    expect(summarise([line({ type: null })]).byMedium).toEqual([{ medium: 'Other', count: 1 }]);
  });

  it('counts how much creative is ready', () => {
    const s = summarise([
      line({ id: 'a', artworkUrl: 'https://example.test/a.png' }),
      line({ id: 'b' }),
    ]);
    expect(s.creativeReady).toBe(1);
  });
});

describe('what is still missing, said so somebody can act on it', () => {
  it('names each gap once, with a count', () => {
    const s = summarise([
      line({ id: 'a', days: null, ratePerDay: null }),
      line({ id: 'b' }),
    ]);
    expect(s.missing.join(' ')).toMatch(/1 placement has no duration/);
    expect(s.missing.join(' ')).toMatch(/2 placements have no artwork/);
    expect(s.missing.join(' ')).toMatch(/1 placement has no published rate/);
  });

  it('has nothing to say about a complete plan', () => {
    expect(summarise([line({ artworkUrl: 'https://example.test/a.png' })]).missing).toEqual([]);
  });
});

describe('sending it', () => {
  /*
   * Permissive about gaps, strict about one thing. An enquiry with no
   * placements wastes a media owner's time; an enquiry with no artwork is
   * completely normal, because artwork usually follows the rate.
   */
  it('refuses an empty plan', () => {
    const out = readyToSend(summarise([]));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.why).toMatch(/at least one placement/);
  });

  it('allows a plan that still has gaps', () => {
    expect(readyToSend(summarise([line({ days: null, artworkUrl: null })])).ok).toBe(true);
  });
});
