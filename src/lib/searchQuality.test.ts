import { describe, it, expect } from 'vitest';

import { searchQuality, MIN_SEARCHES, type RawEvent } from './northStar';

/**
 * §36 of the IQ mandate:
 *
 *     "A search isn't successful merely because results appeared."
 *
 * `supplyGaps()` already covers the zero-result case — the search that
 * obviously failed. This covers the one that looks fine and is not: thirty
 * results, nobody clicks.
 *
 * The measure has three steps, because "did it work" has three honest
 * answers: results came back, somebody clicked one, and something came of it.
 */

let clock = 0;
const at = () => new Date(Date.UTC(2026, 8, 1, 0, 0, clock++)).toISOString();

const search = (session: string, term: string, results: number): RawEvent => ({
  name: 'search_performed',
  session_id: session,
  props: { term, place: 'lekki', results },
  created_at: at(),
});

const click = (session: string, term: string, position = 1): RawEvent => ({
  name: 'search_result_clicked',
  session_id: session,
  props: { term, place: 'lekki', position },
  business_id: 'b1',
  created_at: at(),
});

const contact = (session: string): RawEvent => ({
  name: 'business_contact_clicked',
  session_id: session,
  business_id: 'b1',
  created_at: at(),
});

/** Enough searches to clear MIN_SEARCHES, all of them answered and clicked. */
function baseline(n = MIN_SEARCHES): RawEvent[] {
  const out: RawEvent[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(search(`s${i}`, `term${i}`, 5), click(`s${i}`, `term${i}`));
  }
  return out;
}

describe('the three steps after results appear', () => {
  it('counts a search that returned results as answered', () => {
    const q = searchQuality(baseline());
    expect(q.measured).toBe(MIN_SEARCHES);
    expect(q.answered).toBe(MIN_SEARCHES);
    expect(q.answerRate).toBe(100);
  });

  it('separates "results appeared" from "somebody clicked"', () => {
    /*
     * The whole point. Ten searches, all returning results, and nobody
     * clicked anything: an answer rate of 100% and an engagement rate of 0.
     * A platform reporting only the first number would call this healthy.
     */
    const events: RawEvent[] = [];
    for (let i = 0; i < MIN_SEARCHES; i += 1) events.push(search(`s${i}`, `t${i}`, 8));

    const q = searchQuality(events);
    expect(q.answerRate).toBe(100);
    expect(q.engaged).toBe(0);
    expect(q.engagementRate).toBe(0);
  });

  it('counts a connection in the same session as a conversion', () => {
    const events = baseline();
    events.push(contact('s0'));

    const q = searchQuality(events);
    expect(q.converted).toBe(1);
    expect(q.conversionRate).toBe(10);
  });

  it('does not credit a connection to a session that did not search', () => {
    const events = baseline();
    events.push(contact('someone-else'));
    expect(searchQuality(events).converted).toBe(0);
  });
});

describe('what it refuses to claim', () => {
  it('reports no rates below the minimum sample', () => {
    /*
     * Two searches and one click is not "50% search success". Printing that
     * number would make a scorecard worse than printing nothing, so the rates
     * come back null and the caller has to say "insufficient data" — §42.
     */
    const q = searchQuality([search('s1', 'a', 3), click('s1', 'a'), search('s2', 'b', 3)]);
    expect(q.measured).toBe(2);
    expect(q.answerRate).toBeNull();
    expect(q.engagementRate).toBeNull();
    expect(q.conversionRate).toBeNull();
  });

  it('still reports the raw counts, which are facts', () => {
    // A count is observed; a rate is a claim about a population. The first is
    // safe at any sample size.
    const q = searchQuality([search('s1', 'a', 3), click('s1', 'a')]);
    expect(q.measured).toBe(1);
    expect(q.answered).toBe(1);
    expect(q.engaged).toBe(1);
  });

  it('skips searches that never reported an outcome', () => {
    /*
     * The same rule supplyGaps() applies. Older home-hero events predate the
     * `results` field; treating a missing count as zero would invent failures
     * out of searches that may well have succeeded.
     */
    const legacy: RawEvent = {
      name: 'search_performed',
      session_id: 's9',
      props: { term: 'jollof', from: 'home-hero' },
      created_at: at(),
    };
    const q = searchQuality([...baseline(), legacy]);
    expect(q.measured).toBe(MIN_SEARCHES);
  });

  it('ignores an event with no session, rather than guessing', () => {
    const orphan: RawEvent = {
      name: 'search_performed',
      session_id: null,
      props: { term: 'x', results: 4 },
      created_at: at(),
    };
    expect(searchQuality([orphan]).measured).toBe(0);
  });
});

describe('joining a click to its search', () => {
  it('matches on the term, not on time', () => {
    /*
     * A time window would quietly drop exactly the searches worst served by
     * the platform — the slow ones, where the click lands long after. Term
     * matching is exact, and `search_result_clicked` carries the same term
     * the search wrote precisely so this join needs no session-stitching
     * layer underneath it.
     */
    const events = [
      search('s1', 'plumber', 4),
      // A different search in the same session, clicked; the first was not.
      search('s1', 'electrician', 4),
      click('s1', 'electrician'),
    ];
    for (let i = 0; i < MIN_SEARCHES; i += 1) events.push(search(`pad${i}`, `p${i}`, 1));

    const q = searchQuality(events);
    expect(q.engaged).toBe(1);
  });

  it('reports how far down people had to look', () => {
    const events = [
      search('a', 'x', 9), click('a', 'x', 1),
      search('b', 'y', 9), click('b', 'y', 7),
      search('c', 'z', 9), click('c', 'z', 3),
    ];
    // Positions 1, 3, 7 — the median is 3.
    expect(searchQuality(events).medianClickPosition).toBe(3);
  });

  it('has no median when nothing was clicked', () => {
    expect(searchQuality([search('a', 'x', 5)]).medianClickPosition).toBeNull();
  });
});
