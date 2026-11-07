import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  byClaimedThenImageThenVerified, byImageThenClaimedThenVerified,
  isClaimed, hasListingImage, shuffle,
  type ImageClaimedVerifiedRow,
} from '../lib/discover';

/**
 * What the front pages lead with.
 *
 * This order has now changed TWICE — claim-first, then image-first on
 * 2026-09-13, then claim-first again on 2026-09-14 — and until this file
 * existed nothing failed either time. A ranking that decides what every visitor
 * sees first, changed silently, is exactly the thing worth pinning.
 *
 * THE RULE: a claimed business first, whatever it looks like. Then an unclaimed
 * business with a logo or cover. Then everything else.
 */

const row = (over: Partial<ImageClaimedVerifiedRow> = {}): ImageClaimedVerifiedRow =>
  ({ claimed: false, hasImage: false, verified: false, ...over });

const CLAIMED_WITH_IMAGE = row({ claimed: true, hasImage: true });
const CLAIMED_NO_IMAGE = row({ claimed: true });
const UNCLAIMED_WITH_IMAGE = row({ hasImage: true });
const UNCLAIMED_NO_IMAGE = row();

describe('featured ordering', () => {
  it('ranks the four cases in the agreed order', () => {
    const shuffled = [
      UNCLAIMED_NO_IMAGE, UNCLAIMED_WITH_IMAGE, CLAIMED_NO_IMAGE, CLAIMED_WITH_IMAGE,
    ];
    expect([...shuffled].sort(byClaimedThenImageThenVerified)).toEqual([
      CLAIMED_WITH_IMAGE,
      CLAIMED_NO_IMAGE,
      UNCLAIMED_WITH_IMAGE,
      UNCLAIMED_NO_IMAGE,
    ]);
  });

  it('puts a claimed business above a prettier unclaimed one', () => {
    /*
     * The whole point of the 2026-09-14 reversal, and the case that silently
     * regressed before. A claimed profile is a business that turned up;
     * leading with a better-looking guess tells every owner that claiming buys
     * them nothing.
     */
    expect(byClaimedThenImageThenVerified(CLAIMED_NO_IMAGE, UNCLAIMED_WITH_IMAGE))
      .toBeLessThan(0);
  });

  it('puts an unclaimed business WITH an image above one without', () => {
    expect(byClaimedThenImageThenVerified(UNCLAIMED_WITH_IMAGE, UNCLAIMED_NO_IMAGE))
      .toBeLessThan(0);
  });

  it('uses verification only to break a tie inside a tier', () => {
    const a = row({ claimed: true, hasImage: true, verified: false });
    const b = row({ claimed: true, hasImage: true, verified: true });
    expect([a, b].sort(byClaimedThenImageThenVerified)).toEqual([b, a]);

    // …and never to lift a row out of its tier.
    expect(byClaimedThenImageThenVerified(row({ verified: true }), CLAIMED_NO_IMAGE))
      .toBeGreaterThan(0);
  });

  it('treats missing flags as false rather than throwing', () => {
    expect(() => [{}, CLAIMED_WITH_IMAGE].sort(byClaimedThenImageThenVerified)).not.toThrow();
    expect([{}, CLAIMED_WITH_IMAGE].sort(byClaimedThenImageThenVerified)[0]).toBe(CLAIMED_WITH_IMAGE);
  });

  it('is a stable sort, so the shuffle still decides order within a tier', () => {
    /*
     * The homepage shuffles first and sorts second, so "random" means random
     * WITHIN a priority tier. A non-stable comparator would throw that away.
     */
    const tier = ['a', 'b', 'c', 'd'].map((id) => ({ id, ...UNCLAIMED_WITH_IMAGE }));
    expect(tier.sort(byClaimedThenImageThenVerified).map((x) => x.id))
      .toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps the old name working, pointing at the new order', () => {
    // Renamed rather than deleted: a stale import should not compile-fail in a
    // surface nobody remembered, but it must not perform the old ranking.
    expect(byImageThenClaimedThenVerified).toBe(byClaimedThenImageThenVerified);
  });
});

describe('the inputs the order is built from', () => {
  it('counts a logo OR a cover as an image', () => {
    expect(hasListingImage({ logo_url: 'x', image_url: null })).toBe(true);
    expect(hasListingImage({ logo_url: null, image_url: 'y' })).toBe(true);
    expect(hasListingImage({ logo_url: null, image_url: null })).toBe(false);
  });

  it('counts an owner OR a claimed status as claimed', () => {
    expect(isClaimed({ claim_status: 'claimed', user_id: null })).toBe(true);
    expect(isClaimed({ claim_status: 'unclaimed', user_id: 'u1' })).toBe(true);
    expect(isClaimed({ claim_status: 'claim_pending', user_id: null })).toBe(false);
  });

  it('shuffle returns a copy, so the caller\'s array is not reordered', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input);
    expect(out).not.toBe(input);
    expect([...out].sort()).toEqual(input);
  });
});

describe('the homepage fetches what it ranks', () => {
  /*
   * Ordering cannot promote a row that was never fetched. This bit the site
   * once already: the homepage read the newest 30, and both claimed businesses
   * were the OLDEST rows in the table, so neither had ever appeared on it.
   */
  const home = readFileSync('src/pages/Home.tsx', 'utf8');

  it('asks for claimed businesses specifically, not just the newest', () => {
    expect(home).toMatch(/claim_status\.eq\.claimed,user_id\.not\.is\.null/);
  });

  it('asks for businesses that HAVE an image, not just the newest', () => {
    /*
     * MEASURED 2026-09-14: of the newest 30 listings, ZERO carried a logo or
     * cover, while 1,825 image-bearing listings sat further down the table. So
     * the image tier of the comparator was empty in practice and the front page
     * led with blank cards whatever the sort said. Ranking cannot promote a row
     * that was never fetched.
     */
    expect(home).toMatch(/logo_url\.not\.is\.null,image_url\.not\.is\.null/);
  });

  it('filters every business query to what the public may see', () => {
    // A profile submitted through /add-business lands `ready_for_review`, and
    // without this it would appear on the front page before anybody reviewed it.
    const queries = home.split("supabase.from('businesses')").slice(1);
    expect(queries.length).toBeGreaterThanOrEqual(3);
    for (const q of queries) {
      const head = q.slice(0, 400);
      expect(head).toMatch(/is_listable/);
      expect(head).toMatch(/profile_state/);
    }
  });
});
