import { describe, it, expect } from 'vitest';

import {
  FOUNDING_CAP,
  FOUNDING_INNER_CIRCLE,
  tierOf,
  tierLabel,
  foundingNumberLabel,
  foundingProgress,
  progressLabel,
  foundingRequirements,
  qualifiesForFounding,
  foundingGaps,
} from '../lib/founding';

/** A business that meets every requirement, for tests to break one at a time. */
const complete = {
  user_id: 'u1',
  email_verified: true,
  phone_verified: true,
  name: 'Golden Sands Hotel',
  category: 'Hotels',
  location: 'Lagos',
  about: 'A beachfront hotel.',
  opening_hours: 'Mon-Sun 08:00-22:00',
  phone: '08012345678',
  logo_url: 'https://example.com/logo.png',
};

describe('tiers', () => {
  it('puts the first hundred in the inner circle', () => {
    expect(tierOf(1)).toBe('founding-100');
    expect(tierOf(FOUNDING_INNER_CIRCLE)).toBe('founding-100');
  });

  it('starts the wider tier at 101 — the boundary is not shared', () => {
    expect(tierOf(FOUNDING_INNER_CIRCLE + 1)).toBe('founding-1000');
    expect(tierOf(FOUNDING_CAP)).toBe('founding-1000');
  });

  it('has no tier beyond the cap or below one', () => {
    expect(tierOf(FOUNDING_CAP + 1)).toBeNull();
    expect(tierOf(0)).toBeNull();
    expect(tierOf(null)).toBeNull();
    expect(tierOf(undefined)).toBeNull();
  });

  it('names each tier', () => {
    expect(tierLabel(tierOf(7))).toBe('Founding 100');
    expect(tierLabel(tierOf(700))).toBe('Founding Business');
    expect(tierLabel(null)).toBe('');
  });

  it('pads the number so the badge is a fixed width', () => {
    expect(foundingNumberLabel(7)).toBe('Founding No. 00007');
    expect(foundingNumberLabel(1000)).toBe('Founding No. 01000');
  });
});

describe('the counter', () => {
  it('reports what is left', () => {
    const p = foundingProgress(347);
    expect(p.taken).toBe(347);
    expect(p.remaining).toBe(653);
    expect(p.percent).toBe(35);
    expect(p.full).toBe(false);
  });

  it('clamps a count outside the range rather than showing a negative remainder', () => {
    expect(foundingProgress(-5).taken).toBe(0);
    expect(foundingProgress(5000).remaining).toBe(0);
    expect(foundingProgress(5000).full).toBe(true);
  });

  // The brief's own condition: only show a live number if it is real. An empty
  // campaign says it is open; it never invents a head start.
  it('does not announce its own emptiness at zero', () => {
    const label = progressLabel(foundingProgress(0));
    expect(label).toBe('Founding spots are open');
    expect(label).not.toMatch(/0 of/);
  });

  it('states the real count once there is one', () => {
    expect(progressLabel(foundingProgress(347))).toContain('347 of 1,000');
    expect(progressLabel(foundingProgress(1000))).toMatch(/All 1,000/);
  });
});

describe('qualification', () => {
  it('accepts a finished, verified, owned business', () => {
    expect(qualifiesForFounding(complete)).toBe(true);
    expect(foundingGaps(complete)).toEqual([]);
  });

  // The single rule the whole programme rests on: registering is not enough.
  it('rejects an empty listing — the reason the reward is not for signing up', () => {
    expect(qualifiesForFounding({ user_id: 'u1', email_verified: true, phone_verified: true, name: 'Shell Ltd' })).toBe(false);
  });

  it('rejects an unclaimed listing even when it is complete and verified', () => {
    expect(qualifiesForFounding({ ...complete, user_id: null })).toBe(false);
    expect(foundingGaps({ ...complete, user_id: null }).map((g) => g.key)).toEqual(['owned']);
  });

  it('rejects a complete but unverified business', () => {
    expect(qualifiesForFounding({ ...complete, phone_verified: false })).toBe(false);
  });

  // The legacy `verified` column is true on 24 seeded, unowned records with
  // trust_score 0. Honouring it would hand founding numbers to listings nobody
  // has ever checked — the exact failure the programme exists to prevent.
  it('ignores the legacy verified flag entirely', () => {
    const seeded = { ...complete, email_verified: false, phone_verified: false, verified: true };
    expect(qualifiesForFounding(seeded)).toBe(false);
    expect(foundingGaps(seeded).map((g) => g.key)).toEqual(['verified']);
  });

  it('names every outstanding step, so an owner is told what to do', () => {
    const gaps = foundingGaps({ ...complete, opening_hours: '', phone: '' });
    expect(gaps.map((g) => g.key)).toEqual(['hours', 'contact']);
    expect(gaps[0].label).toBe('Opening hours');
  });

  it('accepts the fallback columns the database also accepts', () => {
    // phone is dropped so the email fallback is what satisfies 'contact'.
    const { about, opening_hours, phone: _phone, logo_url, ...rest } = complete;
    expect(qualifiesForFounding({
      ...rest,
      description: about,
      hours: opening_hours,
      email: 'hi@example.com',
      image_url: logo_url,
    })).toBe(true);
  });

  it('treats whitespace as absent', () => {
    expect(qualifiesForFounding({ ...complete, about: '   ' })).toBe(false);
  });

  // Drift here means a business is told it qualifies and then refused by the
  // database, which reads as a broken button.
  it('checks exactly the nine things founding_qualifies() checks', () => {
    expect(foundingRequirements(complete).map((r) => r.key)).toEqual([
      'owned', 'verified', 'name', 'category', 'location', 'about', 'hours', 'contact', 'image',
    ]);
  });
});
