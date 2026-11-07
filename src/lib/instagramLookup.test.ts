/**
 * Matching a business to its own listing from a handle.
 *
 * The assertion that matters most is that a loose match never offers somebody
 * else's business to claim. Everything downstream of this — the claim form,
 * the admin review, eventually control of a real company's page — starts from
 * what this function returns, so a generous match here is the beginning of an
 * impersonation rather than a convenience.
 */

import { describe, it, expect } from 'vitest';

import { rankMatches, nameKey, isOwned, listingPath, type ListingRow } from './instagramLookup';

const row = (over: Partial<ListingRow> = {}): ListingRow => ({
  id: 'b1',
  name: 'Bodylush Hairs',
  username: 'bodylush-hairs',
  location: 'Lekki, Lagos',
  category: 'Wig & Hair Extensions',
  image_url: null,
  claim_status: 'unclaimed',
  social_links: { instagram: 'bodylush_hairs' },
  ...over,
});

describe('it matches the handle however the listing stored it', () => {
  it.each([
    ['bodylush_hairs'],
    ['https://www.instagram.com/bodylush_hairs/'],
    ['https://instagram.com/bodylush_hairs'],
    ['https://www.instagram.com/bodylush_hairs/profilecard/'],
    ['https://www.instagram.com/bodylush_hairs/?igsh=abc'],
  ])('finds the listing when social_links holds %j', (stored) => {
    /*
     * All five shapes are really on file — the column holds bare handles and
     * full URLs side by side. A miss here tells a business we do not have it,
     * and it goes and creates a duplicate of its own listing.
     */
    const m = rankMatches('bodylush_hairs', [row({ social_links: { instagram: stored } })]);
    expect(m).toHaveLength(1);
    expect(m[0].via).toBe('handle');
  });

  it('is not confused by case', () => {
    expect(rankMatches('BodyLush_Hairs'.toLowerCase(), [row()])).toHaveLength(1);
  });
});

describe('it never offers a stranger a business to claim', () => {
  it('does not match a handle that merely appears inside a name', () => {
    /*
     * THE ONE THAT MATTERS. `includes()` would offer every business with
     * "ada" in its name to anybody whose handle is @ada — and the next screen
     * is a claim form. A partial match is the start of an impersonation.
     */
    const others = [
      row({ id: 'x1', name: 'Ada Fabrics', social_links: {} }),
      row({ id: 'x2', name: 'Adaeze Catering', social_links: {} }),
      row({ id: 'x3', name: 'Ada Hotel and Suites', social_links: {} }),
    ];
    expect(rankMatches('ada', others)).toEqual([]);
  });

  it('does not match on location or category', () => {
    const r = row({ name: 'Something Else', social_links: {} });
    expect(rankMatches('lekki', [r])).toEqual([]);
    expect(rankMatches('wig', [r])).toEqual([]);
  });

  it('returns nothing for an empty handle rather than everything', () => {
    expect(rankMatches('', [row()])).toEqual([]);
    expect(rankMatches('   ', [row()])).toEqual([]);
  });
});

describe('a name match is offered, but as a suggestion', () => {
  it('matches a handle against the whole business name', () => {
    // A handle is a compressed business name: bodylushhairs = "Bodylush Hairs".
    const m = rankMatches('bodylushhairs', [row({ social_links: {} })]);
    expect(m).toHaveLength(1);
    expect(m[0].via).toBe('name');
  });

  it('puts an exact handle match above a name match', () => {
    const exact = row({ id: 'exact', social_links: { instagram: 'bodylushhairs' } });
    const named = row({ id: 'named', name: 'Bodylush Hairs', social_links: {} });
    const m = rankMatches('bodylushhairs', [named, exact]);
    expect(m.map((x) => x.listing.id)).toEqual(['exact', 'named']);
    expect(m[0].via).toBe('handle');
  });

  it('offers each listing once', () => {
    const r = row({ social_links: { instagram: 'bodylushhairs' }, name: 'Bodylush Hairs' });
    expect(rankMatches('bodylushhairs', [r, r])).toHaveLength(1);
  });
});

describe('nameKey', () => {
  it('ignores punctuation, spacing and case', () => {
    expect(nameKey("Ada's Fabrics")).toBe(nameKey('adasfabrics'));
    expect(nameKey('Bodylush  Hairs')).toBe('bodylushhairs');
  });

  it('treats a curly apostrophe as an apostrophe', () => {
    // Instagram stores U+2019; it must not create a different business.
    expect(nameKey('Ada’s Fabrics')).toBe(nameKey("Ada's Fabrics"));
  });

  it('is empty for nothing, rather than matching everything', () => {
    expect(nameKey(null)).toBe('');
    expect(nameKey('   ')).toBe('');
    // And an empty key must never match a real listing.
    expect(rankMatches('!!!', [row({ name: '!!!', social_links: {} })])).toEqual([]);
  });
});

describe('what the page does with a match', () => {
  it('knows an owned listing cannot be claimed again', () => {
    expect(isOwned(row({ claim_status: 'claimed' }))).toBe(true);
    expect(isOwned(row({ claim_status: 'unclaimed' }))).toBe(false);
    expect(isOwned(row({ claim_status: null }))).toBe(false);
  });

  it('links by username, falling back to id', () => {
    expect(listingPath(row())).toBe('/business/bodylush-hairs');
    expect(listingPath(row({ username: null }))).toBe('/business/b1');
  });
});
