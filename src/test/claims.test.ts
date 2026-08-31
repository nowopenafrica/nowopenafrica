import { describe, it, expect } from 'vitest';
import {
  isClaimable, claimState, evidenceIsUsable, claimStatusLabel, unclaimedCount,
} from '../lib/claims';

describe('isClaimable', () => {
  it('offers a claim only on a page nobody owns', () => {
    expect(isClaimable({ user_id: null })).toBe(true);
    expect(isClaimable({})).toBe(true);
    // Offering it on an owned page invites the takeover the review step exists
    // to stop — better not to ask the question at all.
    expect(isClaimable({ user_id: 'someone' })).toBe(false);
  });
});

describe('claimState', () => {
  it('shows the claim button on an unowned page', () => {
    expect(claimState({ user_id: null }, null)).toBe('claimable');
  });

  it('shows waiting once a claim is in', () => {
    expect(claimState({ user_id: null }, { status: 'pending' })).toBe('pending');
  });

  it('lets a rejected claimant try again with better evidence', () => {
    // Not a permanent lockout: an honest owner may simply have given too little
    // the first time.
    expect(claimState({ user_id: null }, { status: 'rejected' })).toBe('rejected');
  });

  it('says owned once the business has an owner, whatever the claim said', () => {
    expect(claimState({ user_id: 'u1' }, { status: 'pending' })).toBe('owned');
  });
});

describe('evidenceIsUsable', () => {
  it('accepts either a phone or an email — one is enough to check', () => {
    expect(evidenceIsUsable('', '08012345678')).toBe(true);
    expect(evidenceIsUsable('I am the owner, ade@meatclub.ng', '')).toBe(true);
  });

  it('refuses an empty submission', () => {
    // Nothing for a reviewer to act on is not a claim.
    expect(evidenceIsUsable('', '')).toBe(false);
    expect(evidenceIsUsable('  ', '   ')).toBe(false);
  });

  it('refuses a token entry too short to check', () => {
    expect(evidenceIsUsable('me', '123')).toBe(false);
  });
});

describe('claimStatusLabel', () => {
  it('says what happened in plain words', () => {
    expect(claimStatusLabel('pending')).toMatch(/review/i);
    expect(claimStatusLabel('approved')).toMatch(/yours/i);
    expect(claimStatusLabel('rejected')).toMatch(/not approved/i);
  });
});

describe('unclaimedCount', () => {
  it('counts the acquisition opportunity sitting in the catalogue', () => {
    expect(unclaimedCount([{ user_id: null }, { user_id: 'u' }, {}])).toBe(2);
    expect(unclaimedCount([])).toBe(0);
  });
});
