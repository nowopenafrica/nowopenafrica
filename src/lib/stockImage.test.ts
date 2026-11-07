import { describe, it, expect } from 'vitest';

import {
  isStockPlaceholder, coverAltText, STOCK_COVER_NOTICE, STOCK_COVER_EXPLANATION,
} from './stockImage';

/**
 * MEASURED LIVE, 2026-09-14: 1,176 of 3,059 business profiles carried a cover
 * image from images.pexels.com, rendered full-bleed with `alt={business.name}`.
 *
 * The enrichment engine was honest everywhere except the page — the asset is
 * registered as a licensed placeholder and the proposal says "replace it with
 * the real image". A visitor saw a photograph of a building and reasonably
 * concluded it was the business's building.
 *
 * These tests hold the disclosure in place, and hold it to erring one way:
 * a placeholder must never render unlabelled, and a real photo must never be
 * slandered as stock.
 */

describe('spotting a stock placeholder', () => {
  it('recognises the libraries the engine places from', () => {
    for (const url of [
      'https://images.pexels.com/photos/30688589/pexels-photo-30688589.jpeg',
      'https://images.unsplash.com/photo-123',
      'https://cdn.pixabay.com/photo/2020/01/01/x.jpg',
      'https://picsum.photos/800/400',
      'https://placehold.co/600x400',
    ]) {
      expect(isStockPlaceholder(url), url).toBe(true);
    }
  });

  it("leaves a business own photograph alone", () => {
    for (const url of [
      'https://wvayqqfqqocwjripugnb.supabase.co/storage/v1/object/public/covers/a.jpg',
      'https://zanzibarcoffee.ng/shopfront.jpg',
      'https://cdn.prod.website-files.com/logo.png',
      '/local-upload.jpg',
      '',
      null,
      undefined,
    ]) {
      expect(isStockPlaceholder(url as string), String(url)).toBe(false);
    }
  });

  it('matches on the host, not on the name', () => {
    /*
     * A real Nigerian business could be called "Pexels Interiors". Matching a
     * substring anywhere in the URL would brand its own photograph as stock —
     * the one direction this check must not fail in.
     */
    expect(isStockPlaceholder('https://pexels-interiors.ng/shopfront.jpg')).toBe(false);
    expect(isStockPlaceholder('https://mysite.ng/photos/pexels-photo-1.jpg')).toBe(false);
  });

  it('still catches a subdomain of a stock host', () => {
    expect(isStockPlaceholder('https://static.images.pexels.com/x.jpg')).toBe(true);
  });

  it('does not throw on a malformed URL', () => {
    for (const url of ['http://', 'not a url', '://broken', 'javascript:alert(1)']) {
      expect(() => isStockPlaceholder(url)).not.toThrow();
    }
  });
});

describe('alt text makes no claim the picture cannot support', () => {
  it('names the business for a real photograph', () => {
    expect(coverAltText('Zanzibar Coffee', 'https://zanzibarcoffee.ng/shop.jpg'))
      .toBe('Zanzibar Coffee');
  });

  it('says "placeholder" for a stock one', () => {
    /*
     * The audience that cannot see the caption and judge for itself is
     * precisely the one the alt text serves.
     */
    const alt = coverAltText('Duchess International Hospital', 'https://images.pexels.com/photos/1.jpg');
    expect(alt).toMatch(/stock/i);
    expect(alt).toMatch(/placeholder/i);
    expect(alt).toContain('Duchess International Hospital');
  });

  it('copes with a missing name', () => {
    expect(coverAltText('', null)).toBe('this business');
  });
});

describe('what the notice says', () => {
  it('is short enough to sit on the image', () => {
    expect(STOCK_COVER_NOTICE.length).toBeLessThan(40);
  });

  it('tells the owner how to fix it, since they are the one who can', () => {
    expect(STOCK_COVER_EXPLANATION).toMatch(/claim/i);
    expect(STOCK_COVER_EXPLANATION).toMatch(/licens/i);
  });

  it('always carries a disclaiming word, so it cannot read as a caption', () => {
    /*
     * The first version of this banned the phrase "photo of the business" and
     * failed on "standing in FOR a photo of the business" — which is the
     * disclaimer, not the claim. A blunt negative cannot tell those apart.
     * What matters is positive: every string a visitor reads beside the
     * picture must contain a word marking it as not-the-thing.
     */
    for (const text of [STOCK_COVER_NOTICE, STOCK_COVER_EXPLANATION]) {
      expect(text, text).toMatch(/stock|placeholder|standing in/i);
    }
  });
});
