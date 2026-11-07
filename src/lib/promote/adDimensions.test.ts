import { describe, expect, it } from 'vitest';

import {
  describeDimensions, ratioOf, readAdDimensions, requiredPixels,
} from './adDimensions';

/*
 * Every string below is taken verbatim from `advertisements.dimensions` on
 * production. The column is free text and 97 rows use it for five different
 * things, so a parser written against an imagined format would be wrong
 * about most of the inventory.
 */

describe('a real physical size', () => {
  it('reads the dominant metre form', () => {
    const d = readAdDimensions('12m x 6m');
    expect(d).toMatchObject({ kind: 'size', width: 12, height: 6, unit: 'm' });
    expect(ratioOf(d)).toBeCloseTo(2, 5);
  });

  it('reads decimals and portrait orientations', () => {
    expect(readAdDimensions('9m x 4.5m')).toMatchObject({ width: 9, height: 4.5 });
    expect(readAdDimensions('4m x 8m')).toMatchObject({ width: 4, height: 8, ratio: 0.5 });
  });

  it('notices when the size is per face', () => {
    expect(readAdDimensions('1.2m x 1.8m each')).toMatchObject({ kind: 'size', each: true });
    expect(describeDimensions(readAdDimensions('1m x 0.6m each'))).toBe('1m × 0.6m each');
  });

  it('reads a count sitting in front of a size', () => {
    const d = readAdDimensions('2 towers, 6m x 3m');
    expect(d).toMatchObject({ kind: 'size', width: 6, height: 3, count: 2 });
    expect(describeDimensions(d)).toBe('2 faces, 6m × 3m each');
  });
});

describe('pixels, not metres', () => {
  /* "300x250 & 728x90" — two IAB display units in one field. */
  it('reads bare numbers as pixels and keeps the alternates', () => {
    const d = readAdDimensions('300x250 & 728x90');
    expect(d).toMatchObject({ kind: 'size', width: 300, height: 250, unit: 'px' });
    if (d.kind !== 'size') return;
    expect(d.alternates).toEqual([{ width: 728, height: 90, unit: 'px' }]);
  });

  it('does not ask a pixel size for print resolution it already has', () => {
    expect(requiredPixels(readAdDimensions('300x250'))).toEqual({ width: 300, height: 250 });
  });
});

describe('fields that are not a size at all', () => {
  /*
   * A preview that treats "Both flanks" as a width draws nonsense, and one
   * that treats "30 seconds" as a width is worse.
   */
  it('reads airtime as a duration', () => {
    expect(readAdDimensions('30 seconds')).toMatchObject({ kind: 'duration', seconds: 30 });
    expect(readAdDimensions('60 seconds')).toMatchObject({ kind: 'duration', seconds: 60 });
    expect(readAdDimensions('30s spot, one a day')).toMatchObject({ kind: 'duration', seconds: 30, note: 'spot, one a day' });
    expect(describeDimensions(readAdDimensions('60 seconds'))).toBe('1 minute slot');
  });

  it('reads a bare count of faces', () => {
    expect(readAdDimensions('10 lightboxes')).toMatchObject({ kind: 'count', count: 10, of: 'lightbox' });
    expect(readAdDimensions('16 screens')).toMatchObject({ kind: 'count', count: 16, of: 'screen' });
    expect(readAdDimensions('6 escalators')).toMatchObject({ kind: 'count', count: 6, of: 'escalator' });
    /* The lazy match used to stop at the first word: "backlit". */
    expect(readAdDimensions('25 backlit panels')).toMatchObject({ count: 25, of: 'backlit panel' });
  });

  it('reads a described extent as prose, not a measurement', () => {
    for (const text of ['Both flanks', 'Full exterior', 'Full vehicle', 'LED both flanks', 'Full page']) {
      expect(readAdDimensions(text)).toMatchObject({ kind: 'coverage', described: text });
    }
  });

  it('has no ratio for anything that is not a size', () => {
    expect(ratioOf(readAdDimensions('30 seconds'))).toBeNull();
    expect(ratioOf(readAdDimensions('Both flanks'))).toBeNull();
    expect(requiredPixels(readAdDimensions('Full exterior'))).toBeNull();
  });
});

describe('what it refuses to invent', () => {
  /*
   * An advertising surface is manufactured from these numbers. Inventing a
   * width to make a mockup look complete puts a business in front of a
   * printer with the wrong artwork.
   */
  it('says the dimensions are pending rather than guessing one', () => {
    expect(readAdDimensions('')).toEqual({ kind: 'unknown' });
    expect(readAdDimensions(null)).toEqual({ kind: 'unknown' });
    expect(readAdDimensions('negotiable')).toEqual({ kind: 'unknown' });
    expect(describeDimensions({ kind: 'unknown' })).toBe('Dimensions pending confirmation');
  });

  it('works out the pixels a printed size needs, and only then', () => {
    /* Large format is specified far below paper DPI — it is read from a road. */
    expect(requiredPixels(readAdDimensions('12m x 6m'))).toEqual({ width: 4800, height: 2400 });
    expect(requiredPixels(readAdDimensions('10 lightboxes'))).toBeNull();
  });
});
