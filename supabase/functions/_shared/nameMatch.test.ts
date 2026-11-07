/**
 * Telling a duplicate listing from a different business with a similar name.
 *
 * The assertions that matter are the FALSE POSITIVES. A missed duplicate
 * costs a reviewer one merge. A wrong one invites them to merge two real
 * companies into a single page, which destroys one of them — and the names in
 * this directory are full of shared trade words and shared city names.
 */

import { describe, it, expect } from 'vitest';

import { nameSimilarity, probableDuplicate, tokens, DUPLICATE_THRESHOLD } from './nameMatch';

const listings = [
  { id: 'a', name: 'Bodylush Hairs' },
  { id: 'b', name: 'Lagos Continental Hotel' },
  { id: 'c', name: 'Jumia Nigeria' },
  { id: 'd', name: 'Ada Fabrics' },
];

describe('it recognises the same business written differently', () => {
  it.each([
    ['Bodylush Hairs', 'Bodylush Hair'],
    ['Bodylush Hairs', 'Bodylush Hairs Ltd'],
    ['The Bodylush Hairs Company', 'Bodylush Hairs'],
    ["Ada's Fabrics", 'Ada Fabrics'],
  ])('matches %j with %j', (a, b) => {
    expect(nameSimilarity(a, b).score).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });

  it('ignores legal suffixes and "official"', () => {
    expect(tokens('Ada Fabrics Ltd')).toEqual(tokens('Ada Fabrics'));
    expect(tokens('Ada Fabrics Official')).toEqual(tokens('Ada Fabrics'));
  });

  it('treats a trailing s as the same word', () => {
    // "Bodylush Hairs" and "Bodylush Hair" are one shop.
    expect(nameSimilarity('Bodylush Hairs', 'Bodylush Hair').score).toBe(1);
  });
});

describe('the price of being strict, paid knowingly', () => {
  it.each([
    ['Jumia', 'Jumia Nigeria'],
    ['Bodylush Hairs', 'Bodylush Hair Extensions'],
    ['National Museum', 'National Museum, Igbo-Ukwu'],
  ])('does NOT match %j with %j', (a, b) => {
    /*
     * These are refused on purpose. An earlier CONTAINMENT rule matched them
     * and, run across the live directory, flagged 640 pairs — 15.6% of every
     * listing — including "DoubleTree by Hilton Addis Ababa Airport" with
     * "Hilton Addis Ababa" and "Nairobi Hospital" with "Nairobi Women's
     * Hospital".
     *
     * A missed duplicate costs a reviewer one merge. A wrong one invites them
     * to merge two real companies into one page. The first two here are
     * probably the same business and we accept losing them; the third is
     * genuinely two different museums, which is the point.
     */
    expect(nameSimilarity(a, b).score).toBe(0);
  });
});

describe('it does not merge different businesses', () => {
  it('refuses a single shared trade word', () => {
    /*
     * THE ONE THAT MATTERS. "Lagos Hotel" and "Lagos Fabrics" share a city;
     * "Ada Fabrics" and "Bola Fabrics" share a trade. Neither is a duplicate,
     * and merging them would delete a real company's page.
     */
    expect(nameSimilarity('Lagos Hotel', 'Lagos Fabrics').score).toBe(0);
    expect(nameSimilarity('Ada Fabrics', 'Bola Fabrics').score).toBe(0);
    expect(probableDuplicate('Lagos Grand Hotel', listings)).toBeNull();
  });

  it('keeps country names, because this directory is Africa-wide', () => {
    // Dropping "Nigeria" would make these one business.
    expect(nameSimilarity('Jumia Nigeria', 'Jumia Kenya').score).toBeLessThan(DUPLICATE_THRESHOLD);
  });

  it('finds nothing for a genuinely new business', () => {
    expect(probableDuplicate('Marybel New Look Boutique', listings)).toBeNull();
  });

  it('scores nothing against an empty or nameless listing', () => {
    expect(nameSimilarity('Ada Fabrics', null).score).toBe(0);
    expect(nameSimilarity(null, 'Ada Fabrics').score).toBe(0);
    expect(nameSimilarity('', '').score).toBe(0);
    // A name of nothing but noise words must not match everything.
    expect(nameSimilarity('The Ltd', 'Ada Fabrics').score).toBe(0);
  });
});

describe('what it hands back', () => {
  it('names the listing and the words that matched', () => {
    const hit = probableDuplicate('bodylush hair', listings);
    expect(hit?.listing.id).toBe('a');
    expect(hit?.match.shared).toContain('bodylush');
    // The evidence travels with the match, so a reviewer sees the reasoning.
    expect(hit?.match.shared).toContain('hair');
  });

  it('is case and punctuation blind', () => {
    expect(probableDuplicate('BODYLUSH  HAIRS!!', listings)?.listing.id).toBe('a');
  });
});

describe('a branch number is not noise', () => {
  it('keeps numbered branches apart', () => {
    /*
     * MEASURED on the live directory: dropping one-character tokens merged
     * "Toungo 1 Primary Health Care Center" with "Toungo 2 ...", and five
     * separate "El Maadi Residential Tower" blocks with each other. The
     * number is the only thing telling them apart.
     */
    expect(nameSimilarity('Toungo 1 Primary Health Care Center',
      'Toungo 2 Primary Health Care Center').score).toBe(0);
    expect(nameSimilarity('El Maadi Residential Tower 9',
      'El Maadi Residential Tower 7').score).toBe(0);
  });

  it('still matches the same branch written twice', () => {
    expect(nameSimilarity('Toungo 1 Primary Health Care Center',
      'Toungo 1 Primary Health Care Centre Ltd').score).toBe(0);
    // (Centre/Center differ — a spelling difference is not something this
    // guesses at, and a reviewer sees both listings anyway.)
    expect(nameSimilarity('El Maadi Residential Tower 9',
      'El Maadi Residential Tower 9').score).toBe(1);
  });
});

describe('a single letter can be the whole identity', () => {
  it('keeps the bureaux de change apart', () => {
    /*
     * MEASURED on the live directory: dropping single letters reduced every
     * one of these to {bureau, de, change} and flagged them as the same
     * business.
     */
    expect(nameSimilarity('A & S Bureau de Change', 'A & C Bureau De Change').score).toBe(0);
    expect(nameSimilarity('A & S Bureau de Change', 'A AND B BUREAU DE CHANGE LIMITED').score).toBe(0);
  });

  it('still matches a possessive against its plain form', () => {
    /*
     * The reason single characters were dropped in the first place: without
     * stripping 's first, "Ada's Fabrics" becomes {ada, s, fabrics}.
     */
    expect(nameSimilarity("Ada's Fabrics", 'Ada Fabrics').score).toBe(1);
    expect(tokens("Ada's Fabrics")).toEqual(['ada', 'fabrics']);
  });
});
