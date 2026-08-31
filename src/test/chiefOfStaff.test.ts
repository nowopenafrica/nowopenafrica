import { describe, it, expect } from 'vitest';

import { chiefOfStaffBrief, assess, toFacts, type PlatformFacts } from '../lib/agents/chiefOfStaff';
import { verifyRun, ranked } from '../lib/workforceRuntime';

/** The platform as it actually stands on 1 Sep 2026. */
const today: PlatformFacts = {
  listings_public: 32, listings_total: 532, claimed: 2, verified: 1,
  missing_hours: 30, claims_pending: 0, reports_open: 0, review_queue: 0,
  offers_running: 0, founding_claimed: 0,
};

const quiet: PlatformFacts = {
  listings_public: 400, listings_total: 400, claimed: 380, verified: 300,
  missing_hours: 5, claims_pending: 0, reports_open: 0, review_queue: 0,
  offers_running: 40, founding_claimed: 120,
};

describe('the brief is checkable', () => {
  // The contract the whole runtime rests on: if this agent ever states a
  // number it did not measure, the run is thrown away rather than shown.
  it('passes verification on real data', () => {
    expect(verifyRun(chiefOfStaffBrief(today))).toEqual({ status: 'ok' });
  });

  it('passes verification on a healthy platform too', () => {
    expect(verifyRun(chiefOfStaffBrief(quiet))).toEqual({ status: 'ok' });
  });

  it('gives every fact a source somebody can re-run by hand', () => {
    expect(toFacts(today).every((f) => f.source && f.label)).toBe(true);
  });

  it('ties every finding to something it measured', () => {
    const r = chiefOfStaffBrief(today);
    const keys = new Set(r.facts.map((f) => f.key));
    expect(r.findings.every((x) => x.basis.length > 0 && x.basis.every((b) => keys.has(b)))).toBe(true);
  });
});

describe('what it says about today', () => {
  it('leads on the fact that almost nothing can say whether it is open', () => {
    const top = ranked(assess(today))[0];
    expect(top.severity).toBe('act');
    expect(top.title).toMatch(/30 of 32/);
  });

  it('raises how few listings have an owner', () => {
    // 2 of 32 is under the tenth that would count as a working funnel.
    expect(assess(today).some((f) => f.title === 'Only 2 of 32 listings are claimed')).toBe(true);
  });

  it('escalates to "act" when literally nothing is owned', () => {
    const none = assess({ ...today, claimed: 0 });
    expect(none.some((f) => f.title === 'No listing has an owner' && f.severity === 'act')).toBe(true);
  });

  it('counts the decisions in the summary', () => {
    expect(chiefOfStaffBrief(today).summary).toMatch(/^32 public listings, 2 claimed, 1 verified\./);
    expect(chiefOfStaffBrief(today).summary).toMatch(/1 thing needs a decision/);
  });

  // It is the line the founder reads every morning; it should read like English.
  it('agrees the verb with the count', () => {
    expect(chiefOfStaffBrief({ ...today, reports_open: 0, claims_pending: 0, review_queue: 0, missing_hours: 0, claimed: 30 }).summary)
      .toMatch(/Nothing needs a decision today/);
    const one = chiefOfStaffBrief({ ...today, claimed: 30, missing_hours: 0, reports_open: 1, claims_pending: 0, review_queue: 0 });
    expect(one.summary).toMatch(/1 thing needs a decision/);
    const many = chiefOfStaffBrief({ ...today, claimed: 30, missing_hours: 0, reports_open: 1, claims_pending: 2, review_queue: 0 });
    expect(many.summary).toMatch(/2 things need a decision/);
  });

  // A brief that speaks up only at scale is silent exactly when it is needed.
  it('flags a single unanswered report', () => {
    const one = assess({ ...quiet, reports_open: 1 });
    expect(one[0]).toMatchObject({ severity: 'act' });
    expect(one[0].title).toBe('1 report unanswered');
  });

  it('says so plainly when there is nothing to decide', () => {
    expect(assess(quiet).filter((f) => f.severity === 'act')).toEqual([]);
    expect(chiefOfStaffBrief(quiet).summary).toMatch(/Nothing needs a decision today/);
  });

  it('puts what needs doing above what needs watching', () => {
    const out = ranked(assess({ ...today, reports_open: 2 }));
    expect(out[0].severity).toBe('act');
    expect(out[out.length - 1].severity).not.toBe('act');
  });

  it('does not divide by zero on an empty platform', () => {
    const empty: PlatformFacts = { listings_public: 0, listings_total: 0, claimed: 0, verified: 0,
      missing_hours: 0, claims_pending: 0, reports_open: 0, review_queue: 0, offers_running: 0, founding_claimed: 0 };
    expect(() => chiefOfStaffBrief(empty)).not.toThrow();
    expect(verifyRun(chiefOfStaffBrief(empty)).status).toBe('ok');
  });
});
