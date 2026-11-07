import { describe, expect, it } from 'vitest';
import { checkArtworkFit, describeShape, studioSizeFor } from './artworkFit';

describe('artworkFit', () => {
  it('names a square against a 2:1 board', () => {
    expect(checkArtworkFit({ width: 1080, height: 1080 }, '12m x 6m')).toEqual({
      verdict: 'mismatch',
      message: 'This is square; the placement is 2:1.',
    });
  });
  it('accepts within 5%', () => {
    expect(checkArtworkFit({ width: 2400, height: 1180 }, '12m x 6m')).toEqual({ verdict: 'match' });
  });
  it('never guesses an unreadable size', () => {
    expect(checkArtworkFit({ width: 1080, height: 1920 }, '30 seconds')).toEqual({
      verdict: 'unknown',
      message: 'Size to confirm with the media owner',
    });
    expect(checkArtworkFit({ width: 1080, height: 1920 }, null).verdict).toBe('unknown');
    expect(studioSizeFor('3 faces')).toBeNull();
  });
  it('sizes the studio canvas to the placement, long edge 2400', () => {
    expect(studioSizeFor('12m x 6m')).toEqual({ w: 2400, h: 1200 });
    expect(studioSizeFor('1080 x 1920 px')).toEqual({ w: 1350, h: 2400 });
  });
  it('describes common shapes', () => {
    expect(describeShape(1920, 1080)).toBe('16:9');
    expect(describeShape(1080, 1350)).toBe('4:5');
    expect(describeShape(2400, 1000)).toBe('2.4:1');
    expect(describeShape(1000, 2400)).toBe('1:2.4');
  });
});
