import { describe, it, expect } from 'vitest';

import {
  chiefOfStaff, trustSafety, customerSuccess, growthDirector,
  strategyDirector, researchAnalyst, seoManager, socialDirector,
  contentManager, commsDirector, creativeDirector, copywriter,
  productionManager, postSupervisor, salesDirector, operationsDirector,
  financeAnalyst, productManager,
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
      [
        'chief-of-staff', 'comms-director', 'content-manager', 'copywriter',
        'creative-director', 'customer-success', 'finance-analyst',
        'growth-director', 'operations-director', 'post-supervisor',
        'production-manager', 'product-manager', 'research-analyst',
        'sales-director', 'seo-manager', 'social-director',
        'strategy-director', 'trust-safety',
      ].sort(),
    );
  });
});

describe('the strategy director', () => {
  it('flags a board where nothing is ready', () => {
    const r = strategyDirector({ launches_total: 2, launches_ready: 0, enrichment_backlog: 0 });
    expect(r.findings.some((x) => x.severity === 'attention' && /no launch on the board is ready/i.test(x.title))).toBe(true);
  });

  it('watches the enrichment queue without crying crisis', () => {
    const r = strategyDirector({ launches_total: 1, launches_ready: 1, enrichment_backlog: 3 });
    expect(r.findings.filter((x) => x.severity === 'attention')).toEqual([]);
    expect(r.findings[0].basis).toEqual(['enrichment_backlog']);
  });

  it('says nothing quietly when both are healthy', () => {
    expect(strategyDirector({ launches_total: 1, launches_ready: 1, enrichment_backlog: 0 }).findings).toEqual([]);
  });
});

describe('the research analyst', () => {
  it('counts the unturned intelligence', () => {
    const r = researchAnalyst({ radar_pending: 4 });
    expect(r.findings[0].basis).toEqual(['radar_pending']);
  });

  it('names a week when every source is silent', () => {
    const r = researchAnalyst({ suggestions_7d: 0, discovery_7d: 0 });
    expect(r.findings.some((x) => /no discovery or suggestions/i.test(x.title))).toBe(true);
  });
});

describe('the SEO manager', () => {
  it('calls out listings search cannot index', () => {
    const r = seoManager({ listings_public: 10, no_description: 6 });
    expect(r.findings[0].severity).toBe('attention');
    expect(r.findings[0].basis).toEqual(['no_description', 'listings_public']);
  });

  it('is quiet when every listing carries copy', () => {
    const r = seoManager({ listings_public: 10, no_description: 0, no_media: 0, default_24_7: 0 });
    expect(r.findings).toEqual([]);
  });
});

describe('the social director', () => {
  it('treats a failed post as the pipeline erroring', () => {
    const r = socialDirector({ posts_failed: 1 });
    expect(r.findings[0].severity).toBe('attention');
  });

  it('flags an empty calendar only when there is something to promote', () => {
    const r = socialDirector({ posts_scheduled: 0, listings_public: 10 });
    expect(r.findings.some((x) => /nothing is scheduled/i.test(x.title))).toBe(true);
    expect(socialDirector({ posts_scheduled: 0, listings_public: 0 }).findings.some((x) => /nothing is scheduled/i.test(x.title))).toBe(false);
  });
});

describe('the content manager', () => {
  it('spots slots holding no copy', () => {
    const r = contentManager({ posts_needing_caption: 3 });
    expect(r.findings[0].severity).toBe('attention');
    expect(r.findings[0].title).toMatch(/no caption/i);
  });

  it('is quiet when the pipeline is clean', () => {
    expect(contentManager({ posts_scheduled: 6, posts_needing_caption: 0, posts_failed: 0, social_work_open: 0 }).findings).toEqual([]);
  });
});

describe('the comms director', () => {
  it('measures the human gate on everything public', () => {
    const r = commsDirector({ publication_approvals_pending: 2 });
    expect(r.findings[0].severity).toBe('attention');
    expect(r.findings[0].basis).toEqual(['publication_approvals_pending']);
  });

  it('protests silence in the knowledge base', () => {
    const r = commsDirector({ publication_approvals_pending: 0, knowledge_30d: 0 });
    expect(r.findings.some((x) => /knowledge base in 30 days/i.test(x.title))).toBe(true);
  });
});

describe('the creative director', () => {
  it('treats unlicensed assets as the one thing that stays dangerous', () => {
    const r = creativeDirector({ assets_unlicensed: 5 });
    expect(r.findings[0].severity).toBe('attention');
    expect(r.findings[0].title).toMatch(/rights decision/i);
  });

  it('escalates unhonoured takedowns', () => {
    const r = creativeDirector({ takedowns_unhonoured: 1 });
    expect(r.findings[0].severity).toBe('attention');
    expect(r.findings[0].title).toMatch(/takedown/i);
  });
});

describe('the copywriter', () => {
  it('calls out the highest-yield copy task there is', () => {
    const r = copywriter({ listings_public: 10, no_description: 4 });
    expect(r.findings[0].severity).toBe('attention');
    expect(r.findings[0].title).toMatch(/no description/i);
  });

  it('names deals nobody can read', () => {
    const r = copywriter({ listings_public: 0, offers_no_description: 2 });
    expect(r.findings.some((x) => /no description/i.test(x.title))).toBe(true);
  });
});

describe('the production manager', () => {
  it('flags approved work stuck between approval and delivery', () => {
    const r = productionManager({ video_assets_approved: 2, video_assets_published: 0 });
    expect(r.findings[0].severity).toBe('attention');
    expect(r.findings[0].basis).toEqual(['video_assets_approved', 'video_assets_published']);
  });
});

describe('the post supervisor', () => {
  it('defends the QA line', () => {
    const r = postSupervisor({ assets_awaiting_review: 7 });
    expect(r.findings[0].severity).toBe('attention');
    expect(r.findings[0].title).toMatch(/not yet quality-checked/i);
  });

  it('watches rejected assets rather than forgetting them', () => {
    const r = postSupervisor({ assets_awaiting_review: 0, assets_rejected: 2 });
    expect(r.findings[0].basis).toEqual(['assets_rejected']);
  });
});

describe('the sales director', () => {
  it('ranks an unanswered profile request above everything', () => {
    const r = salesDirector({ profile_requests_new: 3, orders_open: 0, prospects: 0 });
    expect(r.findings[0].severity).toBe('attention');
    expect(r.findings[0].title).toMatch(/asked us to build/i);
  });

  it('spots prospects whose front door is not seen', () => {
    const r = salesDirector({ prospects: 100, profile_requests_new: 0, profile_requests_7d: 0 });
    expect(r.findings.some((x) => x.severity === 'watch' && /nobody asked to be built/i.test(x.title))).toBe(true);
  });
});

describe('the operations director', () => {
  it('names blocked work as the most expensive status', () => {
    const r = operationsDirector({ work_blocked: 2 });
    expect(r.findings[0].severity).toBe('attention');
    expect(r.findings[0].title).toMatch(/blocked/i);
  });

  it('surfaces failed enrichment jobs as lost rows', () => {
    const r = operationsDirector({ work_blocked: 0, enrichment_failed: 3 });
    expect(r.findings[0].severity).toBe('attention');
    expect(r.findings[0].title).toMatch(/enrichment job/i);
  });
});

describe('the finance analyst', () => {
  it('watches revenue being decided in the quote queue', () => {
    const r = financeAnalyst({ orders_open: 4 });
    expect(r.findings[0].severity).toBe('watch');
  });

  it('names a checkout that never closes', () => {
    const r = financeAnalyst({ leads_total: 5, leads_paid: 0 });
    expect(r.findings.some((x) => /none paid/i.test(x.title))).toBe(true);
  });
});

describe('the product manager', () => {
  it('calls a roadmap with nothing shippable', () => {
    const r = productManager({ launches_total: 3, launches_ready: 0 });
    expect(r.findings[0].severity).toBe('attention');
    expect(r.findings[0].title).toMatch(/shippable/i);
  });

  it('is quiet when launches are ready and nothing is blocked', () => {
    const r = productManager({ launches_total: 3, launches_ready: 3, work_blocked: 0, suggestions_7d: 2, listings_public: 200 });
    expect(r.findings.filter((x) => x.severity === 'attention')).toEqual([]);
  });
});
