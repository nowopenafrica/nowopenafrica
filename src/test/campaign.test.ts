import { describe, it, expect } from 'vitest';

import {
  progress, progressLabel, showCounter, phaseOf, canJoin, COUNTER_MIN,
  normalizeReferralCode, referralLink, inviteMessage, shareTargets,
  nextMilestone, circleLabel, PILLARS, TIMELINE, CAMPAIGN_PATH,
  type CampaignStats,
} from '../lib/campaign';

/** The campaign's real state on live today, so the tests describe reality. */
const LIVE: CampaignStats = {
  slug: 'founding-1000', name: 'The Founding 1,000', status: 'draft',
  starts_at: null, ends_at: null, target_users: 1000, target_businesses: 300,
  hero_headline: null, hero_subcopy: null,
  users: 11, businesses: 32, claimed: 2, founding: 1,
  cities: 8, categories: 29, offers: 0,
};

describe('progress', () => {
  it('reports what is left', () => {
    const p = progress(183, 300);
    expect(p).toMatchObject({ count: 183, target: 300, remaining: 117, percent: 61, full: false });
  });

  it('clamps rather than showing a negative remainder or over 100%', () => {
    expect(progress(-5, 300).count).toBe(0);
    expect(progress(9999, 300)).toMatchObject({ percent: 100, remaining: 0, full: true });
  });

  it('never divides by zero', () => {
    expect(Number.isFinite(progress(0, 0).percent)).toBe(true);
  });
});

describe('the counter tells the truth', () => {
  /*
   * The single most important rule on the page. Day one shows a real 11 and 32,
   * not an invented 742.
   */
  it('does not announce its own emptiness at zero', () => {
    const label = progressLabel(progress(0, 1000), 'explorers');
    expect(label).toBe('Opening now — be the first');
    expect(label).not.toMatch(/0 of/);
  });

  it('states the real count once there is one', () => {
    expect(progressLabel(progress(742, 1000), 'explorers')).toBe('742 of 1,000 explorers');
  });

  it('says so when a target is met', () => {
    expect(progressLabel(progress(300, 300), 'business')).toMatch(/All 300 business places are taken/);
  });

  // A bar pinned at 1% communicates nothing the copy does not say better.
  it('hides the bar while the numbers are tiny', () => {
    expect(showCounter({ ...LIVE, status: 'live', users: 3, businesses: 2 })).toBe(false);
    expect(showCounter({ ...LIVE, status: 'live', users: COUNTER_MIN, businesses: 0 })).toBe(true);
  });

  it('hides the bar entirely before the campaign is live', () => {
    expect(showCounter({ ...LIVE, users: 900, businesses: 250 })).toBe(false);
    expect(showCounter(null)).toBe(false);
  });
});

describe('campaign phase', () => {
  it('treats draft as preparing, so the page never claims to be running', () => {
    expect(phaseOf(LIVE)).toBe('preparing');
  });

  it('opens a scheduled campaign only once its start time has passed', () => {
    const s = { ...LIVE, status: 'scheduled' as const, starts_at: '2026-09-05T00:00:00Z' };
    expect(phaseOf(s, new Date('2026-09-01T00:00:00Z'))).toBe('preparing');
    expect(phaseOf(s, new Date('2026-09-06T00:00:00Z'))).toBe('open');
  });

  it('closes a live campaign once its end date is behind us', () => {
    const s = { ...LIVE, status: 'live' as const, ends_at: '2026-08-01T00:00:00Z' };
    expect(phaseOf(s, new Date('2026-09-01T00:00:00Z'))).toBe('closed');
  });

  // A closed campaign that still shows a join button takes somebody's
  // enthusiasm and hands back an error.
  it('stops offering to join once closed or paused', () => {
    expect(canJoin('closed')).toBe(false);
    expect(canJoin('paused')).toBe(false);
    expect(canJoin('open')).toBe(true);
    expect(canJoin('preparing')).toBe(true);
  });
});

describe('referral codes', () => {
  it('accepts a six-character code in any case or spacing', () => {
    expect(normalizeReferralCode(' k3m9xz ')).toBe('K3M9XZ');
    expect(normalizeReferralCode('K3M-9XZ')).toBe('K3M9XZ');
  });

  it('rejects anything that is not a code, rather than half-accepting it', () => {
    expect(normalizeReferralCode('short')).toBeNull();
    expect(normalizeReferralCode('waytoolongcode')).toBeNull();
    expect(normalizeReferralCode('')).toBeNull();
    expect(normalizeReferralCode(null)).toBeNull();
  });

  it('builds a link on the canonical campaign path', () => {
    expect(referralLink('K3M9XZ', 'https://nowopenafrica.com'))
      .toBe(`https://nowopenafrica.com${CAMPAIGN_PATH}?ref=K3M9XZ`);
  });

  it('does not double a trailing slash on the origin', () => {
    expect(referralLink('K3M9XZ', 'https://nowopenafrica.com/')).not.toContain('.com//');
  });
});

describe('sharing', () => {
  const link = 'https://nowopenafrica.com/campaign/founding-1000?ref=K3M9XZ';

  it('puts WhatsApp first, because that is how a link travels here', () => {
    expect(shareTargets(link, 'hi').map((t) => t.key)).toEqual(
      ['whatsapp', 'copy', 'x', 'facebook', 'linkedin'],
    );
  });

  it('encodes the message so a link inside it survives', () => {
    const wa = shareTargets(link, inviteMessage(link, 'business')).find((t) => t.key === 'whatsapp');
    expect(wa?.href).toContain('https://wa.me/?text=');
    expect(wa?.href).not.toContain(' ');
    expect(decodeURIComponent(wa!.href!.split('text=')[1])).toContain(link);
  });

  it('says what the recipient gets, not what NowOpen wants', () => {
    expect(inviteMessage(link, 'business')).toMatch(/get discovered/i);
    expect(inviteMessage(link, 'person')).toMatch(/find what's open/i);
  });
});

describe('the founding circle', () => {
  it('explains why an invite has not counted yet', () => {
    // A working system looks broken if this is not said.
    expect(circleLabel({ invited: 3, activated: 0 }))
      .toMatch(/count once they keep a business or add their own/i);
  });

  it('reports real progress once somebody activates', () => {
    expect(circleLabel({ invited: 7, activated: 4 })).toBe('4 of 7 have started using NowOpen');
  });

  it('invites a first share when the circle is empty', () => {
    expect(circleLabel({ invited: 0, activated: 0 })).toMatch(/share your link/i);
  });

  it('always has a next milestone until the last one', () => {
    expect(nextMilestone(0)).toBe(1);
    expect(nextMilestone(4)).toBe(10);
    expect(nextMilestone(100)).toBeNull();
  });
});

describe('the page only promises what exists', () => {
  /*
   * Every pillar links to a route that is in the router today. A campaign that
   * promises a feature the product lacks converts once, then costs a refund and
   * a reputation.
   */
  it('points every pillar at a real route', () => {
    expect(PILLARS.map((p) => p.href)).toEqual(
      ['/discover', '/open-now', '/keeps', '/offers', '/studio'],
    );
  });

  it('presents the timeline as four phases, not four achievements', () => {
    expect(TIMELINE).toHaveLength(4);
    for (const t of TIMELINE) {
      expect(t.goal).toBeTruthy();
      // No past tense, no completion claims.
      expect(t.goal).not.toMatch(/\b(achieved|completed|done|reached)\b/i);
    }
  });
});
