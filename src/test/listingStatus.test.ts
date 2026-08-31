import { describe, it, expect } from 'vitest';

import {
  listingBadge, isClaimable, isProspect, isListable, isIndexable,
  reportIsUsable, REPORT_REASONS,
} from '../lib/listingStatus';

/** A row straight from the 500-record synthetic seed. */
const prospect = {
  data_status: 'synthetic_unverified',
  claim_status: 'unclaimed',
  verification_status: 'unverified',
  lifecycle_status: 'active',
  user_id: null,
} as const;

describe('the three states stay apart', () => {
  it('calls an unclaimed listing unclaimed, and does not dress it up', () => {
    const b = listingBadge(prospect);
    expect(b.kind).toBe('unclaimed');
    expect(b.tone).toBe('warn');
    expect(b.detail).toMatch(/not owner-managed/i);
  });

  it('separates claimed from verified', () => {
    const claimed = { ...prospect, claim_status: 'claimed', user_id: 'u1' } as const;
    expect(listingBadge(claimed).kind).toBe('claimed');
    expect(listingBadge(claimed).detail).toMatch(/has not completed verification/i);
    expect(listingBadge({ ...claimed, verification_status: 'verified' }).kind).toBe('verified');
  });

  it('says a claim is under review rather than continuing to invite claims', () => {
    expect(listingBadge({ ...prospect, claim_status: 'claim_pending' }).kind).toBe('pending');
    expect(isClaimable({ ...prospect, claim_status: 'claim_pending' })).toBe(false);
  });

  // Whether the doors have shut matters more than who administers the page.
  it('lets closure outrank verification', () => {
    const shut = { ...prospect, verification_status: 'verified', user_id: 'u1',
      claim_status: 'claimed', lifecycle_status: 'permanently_closed' } as const;
    expect(listingBadge(shut).kind).toBe('closed');
  });

  it('falls back to ownership when the columns have not been backfilled', () => {
    expect(listingBadge({ user_id: 'u1' }).kind).toBe('claimed');
    expect(listingBadge({}).kind).toBe('unclaimed');
  });
});

describe('claimability', () => {
  it('offers the claim on a fresh prospect', () => {
    expect(isClaimable(prospect)).toBe(true);
  });

  it('refuses on a business that already has an owner', () => {
    expect(isClaimable({ ...prospect, user_id: 'u1' })).toBe(false);
  });

  it('refuses on a suspended or shut-down listing', () => {
    expect(isClaimable({ ...prospect, lifecycle_status: 'suspended' })).toBe(false);
    expect(isClaimable({ ...prospect, lifecycle_status: 'permanently_closed' })).toBe(false);
  });
});

/*
 * The rule the whole seed import rests on. These 500 businesses are invented —
 * no phone, no email, no street address — and profile pages are server-rendered
 * with LocalBusiness JSON-LD. Listing them would put fabricated Nigerian
 * companies into Google on a domain that currently ranks honestly.
 */
describe('synthetic records never reach the public directory', () => {
  it('keeps a prospect out of discovery', () => {
    expect(isProspect(prospect)).toBe(true);
    expect(isListable(prospect)).toBe(false);
    expect(isIndexable(prospect)).toBe(false);
  });

  it('lets a prospect in the moment a real owner claims it', () => {
    const claimed = { ...prospect, claim_status: 'claimed', user_id: 'u1' } as const;
    expect(isProspect(claimed)).toBe(false);
    expect(isListable(claimed)).toBe(true);
    expect(isIndexable(claimed)).toBe(true);
  });

  it('keeps provenance on the record after the claim', () => {
    const claimed = { ...prospect, claim_status: 'claimed', user_id: 'u1' } as const;
    expect(claimed.data_status).toBe('synthetic_unverified');
  });

  it('drops a suspended business out of the directory entirely', () => {
    expect(isListable({ data_status: 'user_created', claim_status: 'claimed', lifecycle_status: 'suspended' })).toBe(false);
  });

  // Not deleted: "this shut down" is useful, and is the reason to keep the page.
  it('keeps a permanently closed business listed', () => {
    expect(isListable({ data_status: 'user_created', claim_status: 'claimed', lifecycle_status: 'permanently_closed' })).toBe(true);
  });

  it('lists an ordinary business created in the product', () => {
    expect(isListable({ data_status: 'user_created', claim_status: 'unclaimed', lifecycle_status: 'active' })).toBe(true);
  });
});

describe('reports', () => {
  it('accepts a stated reason on its own', () => {
    expect(reportIsUsable('closed', '')).toBe(true);
    expect(reportIsUsable('not_real', '')).toBe(true);
  });

  it('requires an explanation for "something else"', () => {
    expect(reportIsUsable('other', '')).toBe(false);
    expect(reportIsUsable('other', 'too short')).toBe(false);
    expect(reportIsUsable('other', 'They are operating without a licence.')).toBe(true);
  });

  it('rejects a reason the database would refuse', () => {
    expect(reportIsUsable('made_up_reason', 'plenty of detail here')).toBe(false);
  });

  // Drift means a report the UI accepts and the CHECK constraint rejects.
  it('offers exactly the reasons the database allows', () => {
    expect(REPORT_REASONS.map((r) => r.value)).toEqual([
      'closed', 'moved', 'wrong_phone', 'wrong_address', 'wrong_hours',
      'wrong_category', 'duplicate', 'not_real', 'impersonation', 'offensive', 'other',
    ]);
  });
});
