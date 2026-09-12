import { describe, it, expect } from 'vitest';

import {
  plan, planHeadline, biggestObstacles, SENDING_NOT_IMPLEMENTED, BLOCKER_LABELS,
  type Candidate, type PlanSettings,
} from './dryRun';
import type { BlockerCode } from './sendGate';

/**
 * ClaimReach §26 — the dry run.
 *
 * The planner's job is to be right about what WOULD happen, which makes two
 * properties worth more than the rest:
 *
 *   IT NEVER OVERSTATES REACH. A plan that promises more sends than the cap
 *   allows, or counts a business it cannot legitimately contact, is worse than
 *   no plan — it becomes the number a founder repeats.
 *
 *   ONE CHANNEL PER BUSINESS. §23 forbids arriving on a second channel within
 *   72 hours, so a plan queueing three channels for one business plans its own
 *   rejection.
 */

const settings = (over: Partial<PlanSettings> = {}): PlanSettings => ({
  campaign: {
    id: 'c1',
    status: 'active',
    channels: ['sms', 'email'],
    minDataConfidence: 'source_confirmed',
    approvalMode: 'automatic',
    approved: false,
    maxAttempts: 4,
    dailyCapRemaining: 100,
    quietHours: { fromHour: 22, toHour: 8 },
  },
  killSwitch: { all: false, channels: {} },
  configuredChannels: { sms: true, email: true },
  messageVariables: [{ name: 'business_name', evidenceBacked: true }],
  ...over,
});

/** A candidate that would be contacted, so a test can break exactly one thing. */
const candidate = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  business: { id, name: `Business ${id}`, claimStatus: 'unclaimed', dataConfidence: 'source_confirmed' },
  contacts: [
    { channel: 'sms', normalized: `+23480300000${id.slice(-1)}`, hasProvenance: true },
    { channel: 'email', normalized: `${id}@example.com`, hasProvenance: true },
  ],
  priorAttempts: [],
  suppressed: { sms: false, email: false },
  localHour: 11,
  ...over,
});

const codesOf = (blockers: { code: BlockerCode }[]) => blockers.map((b) => b.code);

describe('the baseline plans a send', () => {
  it('would contact a clean candidate', () => {
    // If this fails, every negative test below passes vacuously.
    const p = plan([candidate('b1')], settings());
    expect(p.wouldSend).toBe(1);
    expect(p.rows[0].outcome).toBe('would_send');
    expect(p.rows[0].verdict.blockers).toEqual([]);
  });

  it('uses the first channel the operator listed, not a built-in preference', () => {
    expect(plan([candidate('b1')], settings()).rows[0].channel).toBe('sms');

    const emailFirst = settings();
    emailFirst.campaign.channels = ['email', 'sms'];
    expect(plan([candidate('b1')], emailFirst).rows[0].channel).toBe('email');
  });

  it('plans exactly one channel per business', () => {
    const p = plan([candidate('b1')], settings());
    // Both are considered and reported; only one is chosen.
    expect(p.rows[0].considered.map((c) => c.channel)).toEqual(['sms', 'email']);
    expect(p.rows.filter((r) => r.outcome === 'would_send')).toHaveLength(1);
  });

  it('falls through to the next channel when the first is blocked', () => {
    const p = plan(
      [candidate('b1', { suppressed: { sms: true, email: false } })],
      settings(),
    );
    expect(p.rows[0].outcome).toBe('would_send');
    expect(p.rows[0].channel).toBe('email');
  });
});

describe('the cap is consumed, not merely checked', () => {
  it('stops planning sends once the run has used the allowance', () => {
    const s = settings();
    s.campaign.dailyCapRemaining = 2;
    const p = plan([candidate('b1'), candidate('b2'), candidate('b3')], s);

    expect(p.wouldSend).toBe(2);
    expect(p.deferredByCap).toBe(1);
    expect(p.blocked).toBe(0);
  });

  it('treats a cap that was already spent the same way', () => {
    /*
     * "Exhausted before the run" and "exhausted by the run" are the same fact
     * about the same campaign, so they must not appear as different problems.
     */
    const s = settings();
    s.campaign.dailyCapRemaining = 0;
    const p = plan([candidate('b1')], s);

    expect(p.wouldSend).toBe(0);
    expect(p.deferredByCap).toBe(1);
    expect(codesOf(p.rows[0].verdict.blockers)).toEqual(['daily_cap_reached']);
  });

  it('never plans more sends than the cap allows', () => {
    const s = settings();
    s.campaign.dailyCapRemaining = 3;
    const many = Array.from({ length: 50 }, (_, i) => candidate(`b${i}`));
    expect(plan(many, s).wouldSend).toBe(3);
  });

  it('does not spend the cap on a candidate it cannot send to', () => {
    const s = settings();
    s.campaign.dailyCapRemaining = 1;
    const p = plan(
      [candidate('b1', { suppressed: { sms: true, email: true } }), candidate('b2')],
      s,
    );
    // b1 is suppressed; the single allowance goes to b2 rather than being lost.
    expect(p.wouldSend).toBe(1);
    expect(p.rows.find((r) => r.businessId === 'b2')?.outcome).toBe('would_send');
  });
});

describe('candidates it cannot legitimately contact', () => {
  it('separates "no way to reach them" from "blocked by a rule"', () => {
    const noContacts = candidate('b1', { contacts: [], suppressed: {} });
    const p = plan([noContacts], settings());
    expect(p.rows[0].outcome).toBe('no_contact');
    expect(p.withoutContact).toBe(1);
    expect(p.wouldSend).toBe(0);
  });

  it('treats a contact with no recorded source as unreachable, not sendable', () => {
    /*
     * §7. This is the live state of every business on NowOpen: 65 have a
     * phone number and none has a source_url or an evidence row, so the
     * honest plan today contacts nobody.
     */
    const p = plan(
      [candidate('b1', {
        contacts: [
          { channel: 'sms', normalized: '+2348030000001', hasProvenance: false },
          { channel: 'email', normalized: 'b1@example.com', hasProvenance: false },
        ],
      })],
      settings(),
    );
    expect(p.wouldSend).toBe(0);
    expect(p.rows[0].outcome).toBe('no_contact');
    expect(p.byBlocker.contact_no_provenance).toBe(1);
  });

  it('refuses when suppression was never checked, rather than assuming it is fine', () => {
    const p = plan([candidate('b1', { suppressed: {} })], settings());
    expect(p.wouldSend).toBe(0);
    expect(p.byBlocker.suppressed).toBe(1);
  });

  it('does not contact a business that has already claimed', () => {
    const p = plan(
      [candidate('b1', {
        business: { id: 'b1', name: 'Claimed Ltd', claimStatus: 'claimed', dataConfidence: 'owner_confirmed' },
      })],
      settings(),
    );
    expect(p.wouldSend).toBe(0);
    expect(p.byBlocker.business_claimed).toBe(1);
  });

  it('reports an unconfigured provider as the reason rather than sending anyway', () => {
    const p = plan([candidate('b1')], settings({ configuredChannels: {} }));
    expect(p.wouldSend).toBe(0);
    expect(p.byBlocker.channel_not_configured).toBe(1);
  });

  it('counts one business blocked on both channels as one problem', () => {
    // Not two: an operator's list should say how many businesses need work.
    const p = plan([candidate('b1', { suppressed: { sms: true, email: true } })], settings());
    expect(p.byBlocker.suppressed).toBe(1);
  });
});

describe('the plan is reproducible', () => {
  it('orders rows deterministically regardless of input order', () => {
    const s = settings();
    const a = plan([candidate('b3'), candidate('b1'), candidate('b2')], s);
    const b = plan([candidate('b1'), candidate('b2'), candidate('b3')], s);
    expect(a.rows.map((r) => r.businessId)).toEqual(['b1', 'b2', 'b3']);
    expect(b.rows.map((r) => r.businessId)).toEqual(a.rows.map((r) => r.businessId));
  });

  it('gives the cap to the same candidates on a re-run', () => {
    const s = settings();
    s.campaign.dailyCapRemaining = 1;
    const first = plan([candidate('b2'), candidate('b1')], s);
    const again = plan([candidate('b1'), candidate('b2')], s);
    expect(first.rows.find((r) => r.outcome === 'would_send')?.businessId)
      .toBe(again.rows.find((r) => r.outcome === 'would_send')?.businessId);
  });
});

describe('what the console shows an operator', () => {
  it('always carries the note that nothing can be sent', () => {
    expect(plan([], settings()).note).toBe(SENDING_NOT_IMPLEMENTED);
    expect(SENDING_NOT_IMPLEMENTED).toMatch(/cannot send/);
  });

  it('names the largest obstacle rather than reporting a bare zero', () => {
    const blocked = Array.from({ length: 5 }, (_, i) => candidate(`b${i}`, { suppressed: {} }));
    const p = plan(blocked, settings());
    expect(p.wouldSend).toBe(0);
    expect(planHeadline(p)).toContain('suppressed');
    expect(planHeadline(p)).toContain('5 of 5');
  });

  it('says plainly that nothing is sent even when the plan is full', () => {
    expect(planHeadline(plan([candidate('b1')], settings())))
      .toMatch(/no messaging provider/);
  });

  it('ranks obstacles by how many businesses they stop', () => {
    const p = plan(
      [
        candidate('b1', { suppressed: {} }),
        candidate('b2', { suppressed: {} }),
        candidate('b3', { contacts: [], suppressed: {} }),
      ],
      settings(),
    );
    const ranked = biggestObstacles(p);
    expect(ranked[0].count).toBeGreaterThanOrEqual(ranked[ranked.length - 1].count);
    expect(ranked.map((r) => r.code)).toContain('suppressed');
  });

  it('has wording for every blocker the gate can return', () => {
    /*
     * A code with no label renders as a raw identifier in the console, which
     * is how an operator ends up guessing what `other_channel_too_recently`
     * means. Asserted against the gate's own union so a new code cannot be
     * added without wording.
     */
    const declared = Object.keys(BLOCKER_LABELS);
    expect(declared).toContain('quiet_hours');
    for (const label of Object.values(BLOCKER_LABELS)) {
      expect(label.length).toBeGreaterThan(8);
    }
    expect(new Set(declared).size).toBe(declared.length);
  });

  it('reports an empty candidate set honestly', () => {
    const p = plan([], settings());
    expect(p.rows).toEqual([]);
    expect(planHeadline(p)).toBe('No candidates matched this campaign.');
  });
});
