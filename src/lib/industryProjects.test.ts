import { describe, expect, it } from 'vitest';

import { ARCHETYPE_KEYS, INDUSTRY_SLUGS, sampleProjectsFor } from './industryProjects';

const all = INDUSTRY_SLUGS.flatMap((slug) => sampleProjectsFor(slug));

describe('every industry on /platform gets demonstration work', () => {
  it('covers all 42 with at least two entries each', () => {
    expect(INDUSTRY_SLUGS.length).toBeGreaterThanOrEqual(42);
    for (const slug of INDUSTRY_SLUGS) {
      /* One entry demonstrates a card. The thing being taught is a SET. */
      expect(sampleProjectsFor(slug).length, slug).toBeGreaterThanOrEqual(2);
    }
  });

  it('falls back rather than returning nothing for an unknown industry', () => {
    expect(sampleProjectsFor('an-industry-added-tomorrow').length).toBeGreaterThanOrEqual(2);
  });

  /*
   * Grouped by what the job IS. A builder, a fabricator and a solar
   * installer deliver the same anatomy; only the nouns move. Enough
   * archetypes that the page is not one sentence forty-two times.
   */
  it('uses enough different shapes of work to be worth reading', () => {
    expect(ARCHETYPE_KEYS.length).toBeGreaterThanOrEqual(10);
    const distinct = new Set(INDUSTRY_SLUGS.map((s) => sampleProjectsFor(s)[0].title));
    expect(distinct.size).toBeGreaterThanOrEqual(8);
  });
});

describe('what makes an entry worth looking at', () => {
  /*
   * All four, in every sample. An entry missing any of them is the reason
   * most portfolios are boring.
   */
  it('is specific, not a category name', () => {
    for (const p of all) {
      expect(p.title.length, p.title).toBeGreaterThan(18);
      expect(p.title.split(' ').length, p.title).toBeGreaterThanOrEqual(4);
    }
  });

  it('carries a scale — a number that says how big the job was', () => {
    for (const p of all) {
      const text = `${p.title} ${p.summary}`;
      expect(/\d/.test(text), p.title).toBe(true);
    }
  });

  it('says what was actually done, at length', () => {
    for (const p of all) {
      expect(p.summary.length, p.title).toBeGreaterThan(60);
    }
  });

  it('places the work in time', () => {
    for (const p of all) expect(/\b20\d{2}\b/.test(p.meta), p.title).toBe(true);
  });

  it('carries tags somebody could filter on', () => {
    for (const p of all) {
      expect(p.tags.length, p.title).toBeGreaterThanOrEqual(1);
      for (const tag of p.tags) expect(tag.trim().length, p.title).toBeGreaterThan(2);
    }
  });
});

describe('these are demonstrations, not somebody\'s real work', () => {
  /*
   * This product has already served eighteen invented studios with
   * fabricated ratings to the public. An industry example page is allowed to
   * demonstrate a LAYOUT; it is not allowed to name a business.
   */
  it('never names a business, a brand or a person', () => {
    /* A real client is named with a capitalised proper noun followed by a
       company suffix, or an @handle, or a www address. */
    const named = /\b[A-Z][a-z]+\s+(Ltd|Limited|Plc|PLC|Inc|Nigeria|Africa|Group|Stores|Hotel|Bank)\b|@[a-z]|www\.|\.com\b/;
    for (const p of all) {
      const text = `${p.title} ${p.meta} ${p.summary}`;
      expect(named.test(text), `${p.title} :: ${text}`).toBe(false);
    }
  });

  /* Describes the client by TYPE, which is how a real portfolio protects
     a client who did not agree to be named. */
  it('describes clients generically', () => {
    for (const p of all) {
      expect(p.meta.length, p.title).toBeGreaterThan(10);
      expect(/client|public|enrolment|landlord|developer|company|brand/i.test(p.meta), p.meta).toBe(true);
    }
  });

  /* No star ratings, no testimonials — nothing here can verify either. */
  it('claims no rating and quotes no customer', () => {
    for (const p of all) {
      const text = `${p.title} ${p.summary}`;
      expect(/\b\d(\.\d)?\s*(stars?|\/5)\b/i.test(text), p.title).toBe(false);
      expect(/[“"']\s*\w/.test(p.summary), p.title).toBe(false);
    }
  });
});
