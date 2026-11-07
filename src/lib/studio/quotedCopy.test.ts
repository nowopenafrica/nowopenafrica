import { describe, expect, it } from 'vitest';

import { quotedCopy } from './promptOps';

/*
 * Found by typing a realistic business name into the live editor:
 * `change the headline to "Ada's Hair Studio"` set the headline to **Ada**.
 *
 * One pattern treated every quote character as both an opener and a closer,
 * and forbade all of them inside the copy — so an apostrophe ended the
 * quotation. It would have truncated most African business names, silently,
 * leaving a design that looked like the instruction had worked.
 */
describe('an apostrophe is not a closing quote', () => {
  it('keeps the whole name', () => {
    expect(quotedCopy('change the headline to "Ada\'s Hair Studio"')).toBe("Ada's Hair Studio");
    expect(quotedCopy('make it say "Mama\'s Kitchen"')).toBe("Mama's Kitchen");
    expect(quotedCopy('set the cta to "Don\'t miss out"')).toBe("Don't miss out");
  });

  it('keeps a typographic apostrophe too', () => {
    /* What a phone keyboard and a word processor actually produce. */
    expect(quotedCopy('headline “We’re open late”')).toBe('We’re open late');
    expect(quotedCopy('headline "We’re open late"')).toBe('We’re open late');
  });

  it('reads curly quotes as a pair', () => {
    expect(quotedCopy('say “Open for business”')).toBe('Open for business');
    expect(quotedCopy('say ‘Open for business’')).toBe('Open for business');
  });
});

describe('a real quotation, not any two apostrophes', () => {
  it('ignores possessives with no quotation around them', () => {
    expect(quotedCopy("change it to it's Ada's")).toBeNull();
    expect(quotedCopy("don't shrink the headline")).toBeNull();
  });

  it('still reads a single-quoted phrase', () => {
    expect(quotedCopy("make the headline say 'Open late'")).toBe('Open late');
    expect(quotedCopy("set it to 'Fresh bread daily'.")).toBe('Fresh bread daily');
  });

  it('prefers double quotes, so what is inside them is left alone', () => {
    expect(quotedCopy(`say "Joe's and Ann's" today`)).toBe("Joe's and Ann's");
  });
});

describe('nothing to quote', () => {
  it('returns null rather than an empty string', () => {
    expect(quotedCopy('make the headline bigger')).toBeNull();
    expect(quotedCopy('')).toBeNull();
  });

  /* A bare pair of quotes is a typo, not a request for an empty headline. */
  it('does not read an empty quotation', () => {
    expect(quotedCopy('change the headline to ""')).toBeNull();
  });
});
