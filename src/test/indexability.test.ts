import { describe, it, expect } from 'vitest';

import { isIndexableProfile, type ProfileBusiness } from '../lib/businessPageRender';

/**
 * One rule, applied everywhere the platform speaks to a search engine:
 * a page may only ask to be indexed when somebody is accountable for the
 * record behind it — an owner has claimed it, or it came from an authorised
 * source.
 *
 * The reason it exists: all 32 publicly listed businesses are fabricated demo
 * data. Index-suffixed placeholder phone numbers (…0123020, …1234024),
 * emails on invented domains, and websites that do not resolve —
 * goldensandshotel.ng, serengetilodge.ke, comfortliving.ke, techhubng.com,
 * goldengem.co.za, none of them registered. Every one of those pages was being
 * server-rendered with LocalBusiness structured data and no robots directive,
 * so the platform was telling Google they are real and contactable.
 *
 * Showing them stays a product decision — the site would otherwise be empty.
 * Vouching for them is not.
 */

const demo: ProfileBusiness = {
  id: 'b1',
  name: 'Golden Sands Hotel',
  username: 'golden-sands-hotel',
  phone: '08031234567',
  website: 'https://goldensandshotel.ng',
  claim_status: 'unclaimed',
  data_status: 'user_created',
};

describe('a profile may only be indexed when somebody stands behind it', () => {
  it('refuses an unclaimed demo listing', () => {
    expect(isIndexableProfile(demo)).toBe(false);
  });

  it('allows it the moment a real owner claims it', () => {
    expect(isIndexableProfile({ ...demo, claim_status: 'claimed' })).toBe(true);
  });

  it('allows a record from an authorised source', () => {
    expect(isIndexableProfile({ ...demo, data_status: 'imported_authorized' })).toBe(true);
  });

  it('refuses a synthetic prospect even if something else looks right', () => {
    expect(isIndexableProfile({ ...demo, data_status: 'synthetic_unverified' })).toBe(false);
  });

  /*
   * The legacy `verified` boolean is true on 24 seeded records with
   * trust_score 0 and no owner. It must never be a route to indexability —
   * that is the same flag that once unlocked "Verified dealer" badges.
   */
  it('ignores the legacy verified flag', () => {
    expect(isIndexableProfile({ ...demo, verified: true })).toBe(false);
  });

  it('refuses a record with no status columns at all', () => {
    expect(isIndexableProfile({ id: 'x', name: 'Nameless' })).toBe(false);
  });
});
