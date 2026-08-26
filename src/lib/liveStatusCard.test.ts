import { describe, it, expect } from 'vitest';

import {
  wrapLines, coverRect, statusCardBlock,
  STATUS_CARD_WIDTH, STATUS_CARD_HEIGHT, NAME_LINE, TITLE_LINE, NAME_GAP,
} from './liveStatusCard';

// A stand-in for canvas text metrics: every character is 10 units wide. Exact
// widths do not matter here — the wrapping decisions do.
const measure = (s: string) => s.length * 10;

describe('wrapLines', () => {
  it('breaks at the last word that fits', () => {
    expect(wrapLines('one two three four', 100, measure)).toEqual(['one two', 'three four']);
  });

  it('returns nothing for nothing, rather than a line of whitespace', () => {
    expect(wrapLines('', 100, measure)).toEqual([]);
    expect(wrapLines('   ', 100, measure)).toEqual([]);
  });

  it('keeps a word that is longer than the line intact', () => {
    // Hyphenating a URL or a business name mid-string reads as a typo, and the
    // alternative is splitting a word the owner chose.
    const lines = wrapLines('nowopenafrica.com/live/abcdefghijklmnop', 100, measure);
    expect(lines).toEqual(['nowopenafrica.com/live/abcdefghijklmnop']);
  });

  it('marks text it had to drop instead of stopping mid-sentence', () => {
    const lines = wrapLines('one two three four five six seven eight', 100, measure, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
  });

  it('does not add an ellipsis when everything fitted', () => {
    const lines = wrapLines('one two', 100, measure, 3);
    expect(lines).toEqual(['one two']);
  });
});

describe('coverRect', () => {
  it('crops the sides of a wide frame to fill a tall card', () => {
    const r = coverRect(1920, 1080, STATUS_CARD_WIDTH, STATUS_CARD_HEIGHT);
    // 9:16 out of 16:9 keeps the full height and a narrow centre strip.
    expect(r.sh).toBe(1080);
    expect(Math.round(r.sw)).toBe(Math.round(1080 * (STATUS_CARD_WIDTH / STATUS_CARD_HEIGHT)));
    expect(r.sx).toBeGreaterThan(0);
    expect(r.sy).toBe(0);
  });

  it('crops the top and bottom of a frame taller than the card', () => {
    const r = coverRect(1080, 3000, STATUS_CARD_WIDTH, STATUS_CARD_HEIGHT);
    expect(r.sw).toBe(1080);
    expect(r.sh).toBeLessThan(3000);
    expect(r.sy).toBeGreaterThan(0);
  });

  it('centres the crop, so a person framed in the middle stays in it', () => {
    const r = coverRect(1920, 1080, STATUS_CARD_WIDTH, STATUS_CARD_HEIGHT);
    expect(r.sx + r.sw / 2).toBeCloseTo(960, 5);
  });

  it('returns an empty rect for a source with no size rather than dividing by zero', () => {
    expect(coverRect(0, 0, STATUS_CARD_WIDTH, STATUS_CARD_HEIGHT)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
  });
});

describe('the card is a status shape', () => {
  it('is 9:16', () => {
    expect(STATUS_CARD_WIDTH / STATUS_CARD_HEIGHT).toBeCloseTo(9 / 16, 5);
  });
});

describe('statusCardBlock', () => {
  const CTA_TOP = 1490;

  it('keeps the last line of the title clear of the button', () => {
    // The bug this replaces: the block was laid out downwards from a fixed top,
    // so a two-line business name pushed the title under the CTA.
    for (const names of [0, 1, 2]) {
      for (const titles of [1, 2, 3]) {
        const b = statusCardBlock(names, titles, CTA_TOP);
        expect(b.bottom).toBeLessThan(CTA_TOP);
      }
    }
  });

  it('pushes the block up as it grows, instead of down', () => {
    const short = statusCardBlock(1, 1, CTA_TOP);
    const tall = statusCardBlock(2, 3, CTA_TOP);
    expect(tall.top).toBeLessThan(short.top);
    expect(tall.bottom).toBe(short.bottom);
  });

  it('charges no gap for a name that is not there', () => {
    expect(statusCardBlock(0, 1, CTA_TOP).height).toBe(TITLE_LINE);
    expect(statusCardBlock(1, 1, CTA_TOP).height).toBe(NAME_LINE + NAME_GAP + TITLE_LINE);
  });
});
