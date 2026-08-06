import { describe, it, expect } from 'vitest';
import {
  deriveTier, computeTrustScore, publicTrustSummary, VERIFICATION_STEPS, TIERS,
  type TrustSignals,
} from './trust';

const NOW = new Date('2026-08-05T12:00:00Z').getTime();

const bare: TrustSignals = {};

const fullyVerified: TrustSignals = {
  email_verified: true, phone_verified: true,
  id_verified: true, registration_verified: true,
  address_verified: true, documents_reviewed: true, onsite_verified: true,
};

const completeProfile: TrustSignals = {
  ...fullyVerified,
  description: 'Fresh meat, cut to order.',
  logo_url: 'x', image_url: 'y', location: 'Lagos',
  phone: '+234', website: 'https://x.example.com', email: 'a@b.co',
  rating: 5,
  created_at: '2024-01-01T00:00:00Z',
};

describe('tier ladder', () => {
  it('starts unverified', () => {
    expect(deriveTier(bare)).toBe('none');
  });

  it('climbs only when each stage is complete', () => {
    expect(deriveTier({ email_verified: true })).toBe('none'); // phone still missing
    expect(deriveTier({ email_verified: true, phone_verified: true })).toBe('bronze');
    expect(deriveTier({ email_verified: true, phone_verified: true, id_verified: true })).toBe('bronze');
    expect(deriveTier({ email_verified: true, phone_verified: true, id_verified: true, registration_verified: true })).toBe('silver');
  });

  it('reaches platinum only with on-site verification', () => {
    const { onsite_verified, ...gold } = fullyVerified;
    expect(onsite_verified).toBe(true);
    expect(deriveTier(gold)).toBe('gold');
    expect(deriveTier(fullyVerified)).toBe('platinum');
  });
});

describe('trust score', () => {
  it('is 0 for an empty row', () => {
    expect(computeTrustScore(bare, NOW).score).toBe(0);
  });

  it('never exceeds 100', () => {
    expect(computeTrustScore(completeProfile, NOW).score).toBeLessThanOrEqual(100);
  });

  it('breaks the score down so it can be audited', () => {
    const { breakdown, score } = computeTrustScore(completeProfile, NOW);
    const summed = breakdown.reduce((s, b) => s + b.earned, 0);
    expect(summed).toBe(score);
    expect(breakdown.reduce((s, b) => s + b.max, 0)).toBe(100);
  });

  it('rewards verification more than profile polish', () => {
    const polished = computeTrustScore({ ...completeProfile, ...bare, email_verified: false, phone_verified: false, id_verified: false, registration_verified: false, address_verified: false, documents_reviewed: false, onsite_verified: false }, NOW).score;
    const verified = computeTrustScore(fullyVerified, NOW).score;
    expect(verified).toBeGreaterThan(polished);
  });
});

describe('publicTrustSummary', () => {
  it('lists every verification step, confirmed or not', () => {
    const s = publicTrustSummary(bare, NOW);
    expect(s.items).toHaveLength(VERIFICATION_STEPS.length);
    expect(s.confirmedCount).toBe(0);
    expect(s.totalCount).toBe(VERIFICATION_STEPS.length);
  });

  it('shows unverified items rather than hiding them', () => {
    // The point of the panel: a visitor can see what ISN'T verified.
    const partial = publicTrustSummary({ email_verified: true, phone_verified: true }, NOW);
    expect(partial.items.filter((i) => !i.confirmed).length).toBeGreaterThan(0);
    expect(partial.items.some((i) => i.confirmed)).toBe(true);
  });

  it('prefers an admin-set score over the derived one', () => {
    const s = publicTrustSummary({ ...bare, trust_score: 91 }, NOW);
    expect(s.score).toBe(91);
  });

  it('falls back to the derived score when none is stored', () => {
    const derived = computeTrustScore(completeProfile, NOW).score;
    expect(publicTrustSummary({ ...completeProfile, trust_score: null }, NOW).score).toBe(Math.round(derived));
    expect(publicTrustSummary({ ...completeProfile, trust_score: 0 }, NOW).score).toBe(Math.round(derived));
  });

  it('prefers the stored tier but falls back to the derived one', () => {
    expect(publicTrustSummary({ ...bare, verification_tier: 'gold' }, NOW).tier.key).toBe('gold');
    expect(publicTrustSummary(fullyVerified, NOW).tier.key).toBe('platinum');
  });

  it('ignores a nonsense stored tier instead of rendering a blank badge', () => {
    const s = publicTrustSummary({ ...fullyVerified, verification_tier: 'diamond' }, NOW);
    expect(s.tier.key).toBe('platinum');
    expect(Object.keys(TIERS)).toContain(s.tier.key);
  });

  it('counts confirmed signals accurately', () => {
    const s = publicTrustSummary(fullyVerified, NOW);
    expect(s.confirmedCount).toBe(s.totalCount);
  });
});
