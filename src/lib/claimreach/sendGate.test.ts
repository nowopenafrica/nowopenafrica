import { describe, it, expect } from 'vitest';

import {
  evaluateSend, inQuietHours, verdictSummary,
  type GateRequest, type BlockerCode,
} from './sendGate';

/**
 * ClaimReach §28 — the gate every outbound message passes.
 *
 * These tests exist because the alternative is eleven early returns in a send
 * loop that nobody can exercise together. Each `it` below is a rule that, if
 * it stopped working, would put a message on a real person's phone.
 *
 * Two properties are asserted throughout rather than in one place:
 *
 *   UNKNOWN IS A BLOCKER — every optional input defaults to refusing, because
 *   a gate that fails open on outbound messaging fails onto people.
 *
 *   EVERY BLOCKER IS RETURNED — an operator fixing one reason at a time and
 *   discovering the next only on re-run concludes the tool is fighting them.
 */

/** A request that is allowed, so each test can break exactly one thing. */
function ok(over: Partial<GateRequest> = {}): GateRequest {
  return {
    business: {
      id: 'b1',
      name: 'Zanzibar Coffee',
      claimStatus: 'unclaimed',
      dataConfidence: 'source_confirmed',
    },
    contact: { channel: 'sms', normalized: '+2348030000001', hasProvenance: true },
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
    suppressed: false,
    priorAttempts: [],
    channelConfigured: true,
    killSwitch: { all: false, channels: {} },
    messageVariables: [{ name: 'business_name', evidenceBacked: true }],
    localHour: 11,
    ...over,
  };
}

const blocks = (r: GateRequest, code: BlockerCode) => {
  const v = evaluateSend(r);
  expect(v.allowed, `expected a block for ${code}`).toBe(false);
  expect(v.blockers.map((b) => b.code)).toContain(code);
};

describe('the baseline is sendable', () => {
  it('allows a clean request', () => {
    // If this ever fails, every negative test below is passing vacuously.
    const v = evaluateSend(ok());
    expect(v.blockers).toEqual([]);
    expect(v.allowed).toBe(true);
    expect(verdictSummary(v)).toBe('Ready to send');
  });
});

describe('the emergency stop cannot be reasoned past', () => {
  it('blocks everything when the global switch is on', () => {
    blocks(ok({ killSwitch: { all: true, channels: {} } }), 'kill_switch_all');
  });

  it('blocks one channel without touching the others', () => {
    blocks(ok({ killSwitch: { all: false, channels: { sms: true } } }), 'kill_switch_channel');
    expect(evaluateSend(ok({ killSwitch: { all: false, channels: { whatsapp: true } } })).allowed).toBe(true);
  });
});

describe('suppression — §22', () => {
  it('blocks a suppressed contact', () => {
    blocks(ok({ suppressed: true }), 'suppressed');
  });

  it('blocks when suppression was never checked', () => {
    /*
     * The most important assertion in this file. "Not checked" and "not
     * suppressed" are different facts, and treating them alike is exactly how
     * the first message to somebody who opted out gets sent.
     */
    blocks(ok({ suppressed: undefined }), 'suppressed');
  });
});

describe('the contact must be in the form suppression is stored in', () => {
  it('refuses a local-format phone number', () => {
    /*
     * Suppression is stored in E.164. A send checking `08030000001` against an
     * opt-out reading `+2348030000001` PASSES the suppression check and
     * messages somebody who said stop. So the un-normalised number is refused
     * here rather than normalised silently, where the mismatch would be
     * invisible.
     */
    blocks(ok({ contact: { channel: 'sms', normalized: '08030000001', hasProvenance: true } }), 'contact_not_normalised');
  });

  it('refuses an email with capitals', () => {
    blocks(ok({ contact: { channel: 'email', normalized: 'Hello@Example.NG', hasProvenance: true } }), 'contact_not_normalised');
  });

  it('accepts a normalised email', () => {
    expect(evaluateSend(ok({
      campaign: { ...ok().campaign, channels: ['email'] },
      contact: { channel: 'email', normalized: 'hello@example.ng', hasProvenance: true },
    })).allowed).toBe(true);
  });

  it('refuses a missing contact', () => {
    blocks(ok({ contact: { channel: 'sms', normalized: null, hasProvenance: true } }), 'contact_missing');
    blocks(ok({ contact: { channel: 'sms', normalized: '   ', hasProvenance: true } }), 'contact_missing');
  });

  it('refuses a contact with no recorded source — §7', () => {
    /*
     * "We found it online" is not an answer to a business asking where we got
     * their number, and a message that cannot be justified should not be sent.
     */
    blocks(ok({ contact: { channel: 'sms', normalized: '+2348030000001', hasProvenance: false } }), 'contact_no_provenance');
  });
});

describe('only unclaimed businesses are contacted', () => {
  it('blocks a business that already claimed', () => {
    // Messaging an owner who acted tells them we did not notice.
    blocks(ok({ business: { ...ok().business, claimStatus: 'claimed' } }), 'business_claimed');
  });

  for (const status of ['claim_pending', 'claim_rejected', 'claim_suspended']) {
    it(`blocks ${status}, which needs a human rather than a reminder`, () => {
      blocks(ok({ business: { ...ok().business, claimStatus: status } }), 'business_not_unclaimed');
    });
  }

  it('blocks an unknown claim status rather than assuming', () => {
    blocks(ok({ business: { ...ok().business, claimStatus: null } }), 'business_not_unclaimed');
  });
});

describe('data confidence — §28', () => {
  it('blocks a business below the campaign threshold', () => {
    blocks(ok({ business: { ...ok().business, dataConfidence: 'unconfirmed' } }), 'confidence_below_threshold');
  });

  it('allows a business above it', () => {
    expect(evaluateSend(ok({ business: { ...ok().business, dataConfidence: 'admin_verified' } })).allowed).toBe(true);
  });

  it('treats a missing confidence as unconfirmed', () => {
    blocks(ok({ business: { ...ok().business, dataConfidence: undefined } }), 'confidence_below_threshold');
  });

  it('refuses every business today, and that is correct', () => {
    /*
     * All 271 businesses on NowOpen carry `unconfirmed`, because the evidence
     * model was created empty rather than backfilled. So a campaign requiring
     * anything higher sends to nobody — worth pinning, because the first
     * reaction to a dry run showing zero sendable rows will be that the gate
     * is broken. It is reporting the truth: no business has confirmed data.
     */
    const v = evaluateSend(ok({
      business: { ...ok().business, dataConfidence: 'unconfirmed' },
      campaign: { ...ok().campaign, minDataConfidence: 'source_confirmed' },
    }));
    expect(v.allowed).toBe(false);
    expect(v.blockers.map((b) => b.detail).join(' ')).toMatch(/requires source_confirmed/);
  });
});

describe('frequency — §23', () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

  it('blocks when the daily cap is used up', () => {
    blocks(ok({ campaign: { ...ok().campaign, dailyCapRemaining: 0 } }), 'daily_cap_reached');
  });

  it('stops after the last message in the sequence — §14', () => {
    /*
     * A business that has not answered four messages is not persuaded by a
     * fifth; it is being harassed by a system that cannot count.
     */
    blocks(ok({
      priorAttempts: [1, 2, 3, 4].map((i) => ({ at: hoursAgo(i * 200), channel: 'sms' as const })),
    }), 'max_attempts_reached');
  });

  it('blocks a same-channel message inside 48 hours', () => {
    blocks(ok({ priorAttempts: [{ at: hoursAgo(10), channel: 'sms' }] }), 'contacted_too_recently');
  });

  it('allows it once the gap has passed', () => {
    expect(evaluateSend(ok({ priorAttempts: [{ at: hoursAgo(60), channel: 'sms' }] })).allowed).toBe(true);
  });

  it('blocks arriving on a second channel too soon — the cross-channel storm', () => {
    /*
     * §23's named failure: contacted by WhatsApp, then immediately SMS, then
     * email. Arriving on a second channel reads as pursuit, not as a
     * reminder, which is why the gap is longer than the same-channel one.
     */
    blocks(ok({ priorAttempts: [{ at: hoursAgo(50), channel: 'whatsapp' }] }), 'other_channel_too_recently');
  });

  it('allows a second channel after the longer gap', () => {
    expect(evaluateSend(ok({ priorAttempts: [{ at: hoursAgo(80), channel: 'whatsapp' }] })).allowed).toBe(true);
  });
});

describe('no unsupported claims — §7 and §10', () => {
  it('blocks a message using a variable with no evidence', () => {
    /*
     * Checked on the VARIABLES, not by scanning the prose. A regex over
     * generated text cannot prove the absence of an invented claim; an
     * unbacked variable is a fact with no source, and that is decidable.
     */
    blocks(ok({
      messageVariables: [
        { name: 'business_name', evidenceBacked: true },
        { name: 'services', evidenceBacked: false },
      ],
    }), 'unsupported_claim');
  });

  it('names the offending variable, so it can be removed or sourced', () => {
    const v = evaluateSend(ok({ messageVariables: [{ name: 'award_count', evidenceBacked: false }] }));
    expect(v.blockers.find((b) => b.code === 'unsupported_claim')?.detail).toContain('award_count');
  });

  it('allows a message whose every variable is backed', () => {
    expect(evaluateSend(ok({
      messageVariables: [
        { name: 'business_name', evidenceBacked: true },
        { name: 'city', evidenceBacked: true },
      ],
    })).allowed).toBe(true);
  });
});

describe('quiet hours — §24', () => {
  it('handles a range that crosses midnight', () => {
    /*
     * Nigeria's default is 22:00–08:00, so the range wraps. A naive
     * `from <= h && h < to` is false all night and true all day — precisely
     * inverted, and the bug would send at 3am and refuse at noon.
     */
    for (const h of [22, 23, 0, 3, 7]) {
      expect(inQuietHours(h, 22, 8), `${h}:00 should be quiet`).toBe(true);
    }
    for (const h of [8, 12, 18, 21]) {
      expect(inQuietHours(h, 22, 8), `${h}:00 should be allowed`).toBe(false);
    }
  });

  it('handles a same-day range too', () => {
    expect(inQuietHours(13, 12, 14)).toBe(true);
    expect(inQuietHours(15, 12, 14)).toBe(false);
  });

  it('treats an empty range as no quiet period', () => {
    expect(inQuietHours(3, 0, 0)).toBe(false);
  });

  it('blocks a send at 3am', () => {
    blocks(ok({ localHour: 3 }), 'quiet_hours');
  });
});

describe('approval modes — §27', () => {
  it('blocks an unapproved message in a manual campaign', () => {
    blocks(ok({ campaign: { ...ok().campaign, approvalMode: 'manual', approved: false } }), 'approval_required');
  });

  it('blocks an unapproved batch in a semi-automatic campaign', () => {
    // The default for a new campaign, per §27.
    blocks(ok({ campaign: { ...ok().campaign, approvalMode: 'semi_automatic', approved: false } }), 'approval_required');
  });

  it('allows an approved one', () => {
    expect(evaluateSend(ok({
      campaign: { ...ok().campaign, approvalMode: 'manual', approved: true },
    })).allowed).toBe(true);
  });
});

describe('campaign and channel state', () => {
  for (const status of ['draft', 'paused', 'complete']) {
    it(`blocks a ${status} campaign`, () => {
      blocks(ok({ campaign: { ...ok().campaign, status } }), 'campaign_inactive');
    });
  }

  it('blocks a channel the campaign does not use', () => {
    blocks(ok({ contact: { channel: 'whatsapp', normalized: '+2348030000001', hasProvenance: true } }), 'channel_not_in_campaign');
  });

  it('blocks an unconfigured provider, and says that is the reason', () => {
    /*
     * A channel with no credentials is the normal state of one nobody has set
     * up. An operator needs to see that named rather than wonder why the
     * queue is not moving — which is what a silent skip produces.
     */
    const v = evaluateSend(ok({ channelConfigured: false }));
    expect(v.allowed).toBe(false);
    expect(v.blockers.find((b) => b.code === 'channel_not_configured')?.detail).toMatch(/No sms provider is configured/);
  });
});

describe('it reports every reason, not the first', () => {
  it('lists them all for the dry run', () => {
    const v = evaluateSend(ok({
      business: { ...ok().business, claimStatus: 'claimed', dataConfidence: 'unconfirmed' },
      contact: { channel: 'sms', normalized: '08030000001', hasProvenance: false },
      suppressed: true,
      localHour: 3,
      campaign: { ...ok().campaign, status: 'paused', dailyCapRemaining: 0 },
      channelConfigured: false,
      messageVariables: [{ name: 'services', evidenceBacked: false }],
      killSwitch: { all: true, channels: {} },
    }));

    expect(v.allowed).toBe(false);
    // Ten distinct problems in one request — an operator shown one at a time
    // would re-run this ten times.
    expect(v.blockers.length).toBeGreaterThanOrEqual(10);
    expect(verdictSummary(v)).toMatch(/^\d+ reasons:/);

    const found = v.blockers.map((b) => b.code);
    for (const code of [
      'kill_switch_all', 'campaign_inactive', 'channel_not_configured',
      'business_claimed', 'confidence_below_threshold', 'contact_not_normalised',
      'contact_no_provenance', 'suppressed', 'daily_cap_reached',
      'unsupported_claim', 'quiet_hours',
    ] as BlockerCode[]) {
      expect(found, `${code} should be reported`).toContain(code);
    }
  });

  it('every blocker carries a sentence an operator can act on', () => {
    const v = evaluateSend(ok({ suppressed: true, localHour: 2 }));
    for (const b of v.blockers) {
      expect(b.detail.length, b.code).toBeGreaterThan(15);
      expect(b.detail).toMatch(/[.:]$|\dh|\d:00/);
    }
  });
});
