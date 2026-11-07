import { describe, it, expect } from 'vitest';

import { BASE_SAMPLE, sampleFor, TEMPLATES_WITH_OWN_COPY } from './sampleCopy';
import { DESIGN_TEMPLATES } from '../designTemplates';

/*
 * MEASURED 2026-10-14 on /media: all twelve visible cards rendered the same
 * four lines, so a catalogue advertising "376 designs" read as one poster
 * repeated. The layouts differed; nobody could see it.
 */

describe('every template still renders something', () => {
  it('falls back field by field, so an unlisted template is unchanged', () => {
    expect(sampleFor({ key: 'a-template-that-does-not-exist' })).toEqual(BASE_SAMPLE);
  });

  it('never leaves a layout without a headline', () => {
    for (const t of DESIGN_TEMPLATES) {
      const copy = sampleFor(t);
      // 'statement' deliberately clears the eyebrow and subline; a headline is
      // the one thing every layout needs.
      expect(copy.headline, t.key).toBeTruthy();
    }
  });

  it('covers a meaningful share of the catalogue', () => {
    expect(TEMPLATES_WITH_OWN_COPY).toBeGreaterThanOrEqual(30);
  });
});

describe('the grid now shows its own variety', () => {
  /*
   * The point of the change. If these collapse back to one value, the
   * catalogue has silently become one poster again.
   */
  it('renders many different headlines across the catalogue', () => {
    const headlines = new Set(DESIGN_TEMPLATES.map((t) => sampleFor(t).headline));
    expect(headlines.size).toBeGreaterThanOrEqual(25);
  });

  it('renders many different eyebrows', () => {
    const eyebrows = new Set(DESIGN_TEMPLATES.map((t) => sampleFor(t).eyebrow));
    expect(eyebrows.size).toBeGreaterThanOrEqual(20);
  });

  it('gives the layouts with their own row types their own rows', () => {
    expect(sampleFor({ key: 'opening-hours' }).services).toContain('Monday to Friday');
    expect(sampleFor({ key: 'giveaway-steps' }).services).toContain('Tag two friends');
    expect(sampleFor({ key: 'event-lineup' }).services).toContain('First act');
  });
});

describe('it is placeholder, not fabricated business data', () => {
  const everything = DESIGN_TEMPLATES.flatMap((t) => {
    const c = sampleFor(t);
    return [
      c.brand, c.eyebrow, c.headline, c.subline, c.meta, c.cta,
      ...(c.services ?? []),
      ...(c.contact ?? []),
      ...(c.price ?? []).map((p) => p.label),
      ...(c.stats ?? []).map((s) => s.label),
    ].filter((x): x is string => typeof x === 'string' && x.length > 0);
  });

  /*
   * The rule the gallery set and this must not break: "No invented business
   * name, no invented phone number, no invented review."
   */
  it('contains no phone number', () => {
    const offenders = everything.filter((s) => /\+?\d[\d\s().-]{6,}/.test(s));
    expect(offenders).toEqual([]);
  });

  it('contains no email address or invented web address', () => {
    const offenders = everything.filter((s) => /@[a-z0-9.-]+\.[a-z]{2,}/i.test(s));
    expect(offenders).toEqual([]);
  });

  it('contains no review score or star rating', () => {
    const offenders = everything.filter((s) => /\b\d(\.\d)?\s*(stars?|\/\s*5)\b/i.test(s));
    expect(offenders).toEqual([]);
  });

  /*
   * A trading name is the real failure mode, so test for what a trading name
   * actually looks like rather than allow-listing prose word by word. The
   * first version of this test did the latter and flagged 286 perfectly good
   * strings, which is a broken test, not a finding.
   */
  it('names no business', () => {
    /*
     * The closing \b must sit OUTSIDE the group. Inside, it bound only the
     * last alternative, so "inc" had no trailing boundary and matched
     * "includes" in "What the price includes."
     */
    const tradingName = /\b(?:ltd|limited|inc\.?|plc|enterprises?|ventures?|holdings?|stores?|boutique|emporium|&\s*(?:sons|co))\b/i;
    const possessive = /\b[A-Z][a-z]+'s\b/;
    const offenders = everything.filter((s) => tradingName.test(s) || possessive.test(s));
    expect(offenders).toEqual([]);
  });
});
