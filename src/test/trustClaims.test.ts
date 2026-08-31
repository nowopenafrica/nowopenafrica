import { describe, it, expect } from 'vitest';

import { trustClaims, isTrustVerified, isClaimed, unverifiedNotice } from '../lib/trustClaims';

/**
 * A record shaped exactly like the 24 seeded businesses on live: the legacy
 * `verified` boolean set, and nothing behind it.
 */
const seeded = {
  user_id: null,
  verified: true,
  email_verified: false,
  phone_verified: false,
  verification_tier: 'none',
  trust_score: 0,
};

/** Claimed by a real owner who completed contact verification. */
const real = {
  user_id: 'u1',
  verified: false,
  email_verified: true,
  phone_verified: true,
};

describe('what NowOpen may assert', () => {
  // The regression that mattered: a pharmacy page told readers the medicines
  // were "Genuine, verified" on a listing nobody had ever contacted.
  it('says nothing at all about a seeded, unclaimed listing', () => {
    expect(trustClaims(seeded, 'pharmacy')).toEqual([]);
    expect(trustClaims(seeded, 'finance')).toEqual([]);
    expect(trustClaims(seeded, 'vehicles')).toEqual([]);
    expect(trustClaims(seeded, 'property')).toEqual([]);
  });

  it('does not treat the legacy verified flag as verification', () => {
    expect(isTrustVerified(seeded)).toBe(false);
    expect(isClaimed(seeded)).toBe(false);
  });

  it('says nothing about a claimed business that has not verified', () => {
    expect(trustClaims({ user_id: 'u1', verified: true }, 'finance')).toEqual([]);
  });

  it('lets a genuinely verified business state who it is', () => {
    const claims = trustClaims(real, 'vehicles');
    expect(claims.map((c) => c.label)).toEqual(['Verified dealer']);
  });

  /*
   * The wording rule. NowOpen does not inspect vehicles, test medicines or
   * licence lenders, so no tier may claim it did — a verified record proves
   * identity and nothing more.
   */
  it('never claims to have inspected, tested or licensed anything', () => {
    const everything = { ...real, id_verified: true, registration_verified: true,
      address_verified: true, documents_reviewed: true, onsite_verified: true };
    const words = (['pharmacy', 'finance', 'vehicles', 'property', 'general'] as const)
      .flatMap((s) => trustClaims(everything, s))
      .map((c) => c.label)
      .join(' | ');
    expect(words).not.toMatch(/inspect|genuine|licen[cs]ed|regulated|guarantee/i);
  });

  it('reports a document check only when one happened', () => {
    expect(trustClaims(real, 'finance').map((c) => c.key)).toEqual(['identity-finance']);
    expect(trustClaims({ ...real, registration_verified: true }, 'finance').map((c) => c.key))
      .toEqual(['identity-finance', 'registered']);
  });

  it('keeps the caveat attached to the claim it qualifies', () => {
    expect(trustClaims(real, 'pharmacy')[0].detail).toMatch(/not tested by NowOpen/i);
    expect(trustClaims(real, 'finance')[0].detail).toMatch(/does not licence or regulate/i);
  });
});

describe('what to say instead', () => {
  it('tells the reader a listing is unclaimed rather than leaving a gap', () => {
    expect(unverifiedNotice(seeded)).toMatch(/not been claimed/i);
  });

  it('distinguishes claimed-but-unverified from unclaimed', () => {
    expect(unverifiedNotice({ user_id: 'u1' })).toMatch(/not completed NowOpen verification/i);
  });

  it('says nothing once the business is verified', () => {
    expect(unverifiedNotice(real)).toBeNull();
  });
});
