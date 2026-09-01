import { describe, it, expect } from 'vitest';

import {
  chiefOfStaff, trustSafety, customerSuccess, growthDirector,
  AGENTS, notifiable, runStatus, bySeverity, type Finding,
} from './agents';

/**
 * These run against the same module the scheduler imports — not a copy. The
 * point of putting the rules in a dependency-free file was so this file and the
 * edge function can never disagree.
 */

/** Today's live numbers, so the tests describe the real platform. */
const LIVE = {
  listings_public: 32, listings_total: 532, claimed: 2, verified: 1,
  missing_hours: 30, claims_pending: 0, reports_open: 0, review_queue: 0,
  offers_running: 0, founding_claimed: 0,
};

describe('the chief of staff', () => {
  it('leads on the thing the product is named after', () => {
    const r = chiefOfStaff(LIVE);
    expect(r.findings[0].severity).toBe('critical');
    expect(r.findings[0].title).toMatch(/cannot say whether they are open/i);
    expect(r.findings[0].basis).toEqual(['missing_hours', 'listings_public']);
  });

  // A brief that always finds something is a brief people learn to skim.
  it('reports all clear when there is nothing to say', () => {
    const healthy = { ...LIVE, missing_hours: 0, offers_running: 4 };
    const r = chiefOfStaff(healthy);
    expect(r.findings).toEqual([]);
    expect(r.summary).toMatch(/^All clear/);
    expect(runStatus(r)).toBe('nothing-to-report');
  });

  it('does not call missing hours critical when most listings have them', () => {
    const r = chiefOfStaff({ ...LIVE, missing_hours: 3 });
    expect(r.findings.some((x) => /open/i.test(x.title) && x.severity === 'critical')).toBe(false);
  });

  it('divides safely when there are no listings at all', () => {
    const r = chiefOfStaff({ listings_public: 0, missing_hours: 0 });
    expect(r.findings.every((x) => Number.isFinite(x.basis.length))).toBe(true);
    expect(r.summary).toContain('0 public listings');
  });
});

describe('trust and safety', () => {
  it('puts fake and impersonation reports above everything else', () => {
    const r = trustSafety({ reports_open: 9, reports_over_24h: 5, reports_not_real: 1 });
    expect(r.findings[0].severity).toBe('critical');
    expect(r.findings[0].title).toMatch(/fake or impersonating/i);
  });

  it('separates a stale queue from a fresh one', () => {
    const stale = trustSafety({ reports_open: 3, reports_over_24h: 3 });
    expect(stale.findings[0].severity).toBe('attention');

    const fresh = trustSafety({ reports_open: 3, reports_over_24h: 0 });
    expect(fresh.findings[0].severity).toBe('watch');
    expect(fresh.findings[0].title).toMatch(/under a day old/i);
  });

  it('advises closing a business rather than deleting it', () => {
    const r = trustSafety({ reports_open: 1, reports_closed_claim: 1 });
    expect(r.findings.some((x) => /permanently closed/i.test(x.detail))).toBe(true);
  });

  it('says nothing when the queue is empty', () => {
    expect(trustSafety({}).findings).toEqual([]);
  });
});

describe('customer success', () => {
  // A pending claim is a person sitting in front of "we are checking it".
  it('treats an owner waiting over 48 hours as critical', () => {
    const r = customerSuccess({ claims_pending: 2, claims_over_48h: 2 });
    expect(r.findings[0].severity).toBe('critical');
    expect(r.findings[0].title).toMatch(/waited over 48 hours/i);
  });

  it('drops to attention while still inside the window', () => {
    const r = customerSuccess({ claims_pending: 2, claims_over_48h: 0 });
    expect(r.findings[0].severity).toBe('attention');
  });

  it('names the highest-yield outreach there is', () => {
    const r = customerSuccess({ claimed_no_hours: 4 });
    expect(r.findings.some((x) => /no opening hours/i.test(x.title))).toBe(true);
  });

  it('uses singular English for one owner', () => {
    const r = customerSuccess({ claims_pending: 1, claims_over_48h: 1 });
    expect(r.findings[0].title).toMatch(/1 owner has waited/);
  });
});

describe('the growth director', () => {
  /*
   * Volume flatters. 500 prospects and no claims is not progress, and the
   * agent has to be willing to say so.
   */
  it('calls out a funnel with no entrance', () => {
    const r = growthDirector({ prospects: 500, claims_started: 0, claimed: 0 });
    expect(r.findings[0].severity).toBe('critical');
    expect(r.findings[0].title).toMatch(/not one claim started/i);
  });

  it('distinguishes a blocked review step from a blocked entrance', () => {
    const r = growthDirector({ prospects: 500, claims_started: 12, claimed: 0 });
    expect(r.findings[0].title).toMatch(/none approved/i);
    expect(r.findings[0].detail).toMatch(/blocked at review/i);
  });

  it('stops complaining once claims are being approved', () => {
    const r = growthDirector({ prospects: 500, claims_started: 12, claimed: 9, suggestions_7d: 3, founding_claimed: 2 });
    expect(r.findings.filter((x) => x.severity === 'critical')).toEqual([]);
  });
});

describe('the safety boundary', () => {
  /*
   * The property the whole design rests on: an unattended agent reports, it
   * does not act. Nothing an agent returns can name a business to change, a
   * person to message, or an approval to grant.
   */
  it('returns only facts, findings and a summary — never an instruction to act', () => {
    for (const [key, run] of Object.entries(AGENTS)) {
      const r = run(LIVE);
      expect(Object.keys(r).sort()).toEqual(['agentKey', 'facts', 'findings', 'summary']);
      expect(r.agentKey).toBe(key);
    }
  });

  it('rests every finding on fact keys that exist in the same run', () => {
    for (const run of Object.values(AGENTS)) {
      const r = run({ ...LIVE, reports_open: 3, claims_pending: 2, prospects: 500 });
      const keys = new Set(r.facts.map((f) => f.key));
      for (const finding of r.findings) {
        expect(finding.basis.length).toBeGreaterThan(0);
        for (const b of finding.basis) expect(keys.has(b)).toBe(true);
      }
    }
  });

  // An agent that notifies on everything trains people to mute it, and a muted
  // alarm looks like coverage while providing none.
  it('notifies only on critical findings', () => {
    const noisy = trustSafety({ reports_open: 5, reports_over_24h: 5, reports_closed_claim: 2 });
    expect(noisy.findings.length).toBeGreaterThan(1);
    expect(notifiable(noisy)).toEqual([]);

    const urgent = trustSafety({ reports_open: 5, reports_not_real: 2 });
    expect(notifiable(urgent)).toHaveLength(1);
  });

  it('sorts worst first, because people read the top', () => {
    const mixed: Finding[] = [
      { title: 'c', severity: 'watch', detail: '', basis: ['x'] },
      { title: 'a', severity: 'critical', detail: '', basis: ['x'] },
      { title: 'b', severity: 'attention', detail: '', basis: ['x'] },
    ];
    expect(bySeverity(mixed).map((x) => x.title)).toEqual(['a', 'b', 'c']);
  });

  it('every scheduled agent has an implementation', () => {
    expect(Object.keys(AGENTS).sort()).toEqual(
      ['chief-of-staff', 'customer-success', 'growth-director', 'trust-safety'],
    );
  });
});
