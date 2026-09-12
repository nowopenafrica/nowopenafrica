import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { BUSINESS_CATEGORIES } from './categories';
import { DEMO_CONTENT_CATEGORIES, demoGallery, demoServices } from './demoContent';

/**
 * The demo profiles' own content.
 *
 * These pages are linked from the homepage now and are dressed to look like a
 * filled-in business. That makes two things load-bearing: the content has to be
 * plausible FOR ITS INDUSTRY, and the page has to keep saying it is a demo.
 */

const stripComments = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/*
 * The profile source with its comments removed.
 *
 * Three of these assertions failed on their first run against the notes that
 * EXPLAIN the removal — the file documents that "John Doe" and "Premium Widget"
 * used to be here, and a plain search finds the documentation. The code is what
 * is being asserted about.
 */
const profileRaw = readFileSync('src/pages/BusinessDetail.tsx', 'utf8');
const profile = stripComments(profileRaw);

const sampleFiles = readdirSync('src/data')
  .filter((n) => n.startsWith('sample') && n.endsWith('.ts') && !n.includes('.test.'));

describe('every category it claims is a real one', () => {
  it('keys only off BUSINESS_CATEGORIES', () => {
    // A key that is not a real category is content nothing can ever reach.
    for (const c of DEMO_CONTENT_CATEGORIES) {
      expect(BUSINESS_CATEGORIES, c).toContain(c);
    }
  });

  it('covers the industries that used to fall through', () => {
    for (const c of [
      'Real Estate', 'Restaurant', 'Pharmacy', 'Car Dealership', 'Agriculture',
      'Manufacturing', 'Fashion & Apparel', 'Grocery / Mini-Mart', 'Bakery & Pastry',
    ]) {
      expect(DEMO_CONTENT_CATEGORIES, c).toContain(c);
    }
  });
});

describe('the services read as that industry', () => {
  it('never shows web development to a butchery again', () => {
    /*
     * The defect this replaces: ONE list — "Web Development / Mobile App
     * Development / UI/UX Design", priced in dollars — rendered on every
     * industry without a purpose-built set.
     */
    for (const c of DEMO_CONTENT_CATEGORIES) {
      const names = demoServices(c).map((s) => s.name.toLowerCase()).join(' | ');
      if (c === 'Software & IT') continue;
      expect(names, c).not.toMatch(/web development|mobile app development|ui\/ux/);
    }
  });

  it('prices in naira, on a platform that quotes naira', () => {
    for (const c of DEMO_CONTENT_CATEGORIES) {
      for (const s of demoServices(c)) {
        expect(s.price, `${c}: ${s.name}`).not.toMatch(/\$|USD/);
      }
    }
  });

  it('says something real about each service', () => {
    for (const c of DEMO_CONTENT_CATEGORIES) {
      const services = demoServices(c);
      expect(services.length, c).toBeGreaterThanOrEqual(4);
      for (const s of services) {
        expect(s.name.length, `${c}: name`).toBeGreaterThan(3);
        // A description that is shorter than the name is a placeholder.
        expect(s.description.length, `${c}: ${s.name}`).toBeGreaterThan(30);
        expect(s.price.length, `${c}: ${s.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('gives an unknown industry an obviously unfilled page', () => {
    // Honest: it looks like a business that has not added its services yet,
    // which is what a real new listing looks like on day one.
    const fallback = demoServices('Something We Have Not Written');
    expect(fallback[0].name).toMatch(/^Your /);
    expect(demoServices(null)[0].name).toMatch(/^Your /);
  });
});

describe('the galleries', () => {
  it('are industry-specific, not three placeholders on every page', () => {
    const first = demoGallery('Real Estate').join();
    const second = demoGallery('Pharmacy').join();
    expect(first).not.toBe(second);
    for (const c of DEMO_CONTENT_CATEGORIES) {
      expect(demoGallery(c).length, c).toBeGreaterThanOrEqual(3);
    }
  });

  it('use the licensed host the CSP already allows', () => {
    // picsum placeholders are gone; Pexels permits commercial use and is in
    // img-src. Nothing is taken from a real business's own photographs.
    for (const c of DEMO_CONTENT_CATEGORIES) {
      for (const url of demoGallery(c)) {
        expect(url, c).toMatch(/^https:\/\/images\.pexels\.com\/photos\//);
      }
    }
    expect(stripComments(readFileSync('src/data/demoContent.ts', 'utf8'))).not.toContain('picsum');
  });
});

describe('no invented social proof, anywhere in the demo data', () => {
  it('has stripped every fabricated rating and verified badge', () => {
    /*
     * Forty-five demo records carried `rating: 4.8` and `verified: true`. Both
     * are on the permanent prohibition list, and a fabricated rating is worse
     * than useless: it devalues every real rating on the platform.
     */
    for (const name of sampleFiles) {
      const src = readFileSync(`src/data/${name}`, 'utf8');
      expect(src, `${name} rating`).not.toMatch(/\brating:\s*[0-9]/);
      expect(src, `${name} verified`).not.toMatch(/\bverified:\s*true/);
    }
  });

  it('shows no reviews at all on a demo profile', () => {
    // Not placeholder reviews, not anonymised ones — none. "John Doe / Jane
    // Smith / Mike Johnson" with five stars each is an invented testimonial.
    expect(profile).not.toContain('sampleReviews');
    expect(profile).toMatch(/const reviews = isSample\s*\n\s*\?\s*\[\]/);
    for (const invented of ['John Doe', 'Jane Smith', 'Mike Johnson']) {
      expect(profile, invented).not.toContain(invented);
    }
  });

  it('leaves an empty products tab rather than inventing stock', () => {
    expect(profile).not.toContain('Premium Widget');
    expect(profile).not.toContain('Business Software Suite');
  });
});

describe('a demo profile wears no trust signal it has not earned', () => {
  it('shows no rating, and no "0.0" in place of one', () => {
    // The fallback read "0.0" beside a gold star, which says rated-zero rather
    // than not-yet-reviewed. Every new listing wore it too.
    expect(profile).not.toMatch(/'0\.0'/);
    expect(profile).toMatch(/No reviews yet/);
    expect(profile).toMatch(/\{business\.rating \? \(/);
  });

  it('shows no trust score', () => {
    // It was rendering PLATINUM — the top grade — on a page with invented
    // details and nobody behind it.
    const collapsed = profile.replace(/\s+/g, ' ');
    expect(collapsed).toContain('{!isSample && ( <BusinessTrustPanel');
  });

  it('does not invent a rating or a badge for the generated samples either', () => {
    const gen = readFileSync('src/data/populateData.ts', 'utf8');
    expect(stripComments(gen)).not.toMatch(/rating: 3\.5/);
    expect(stripComments(gen)).not.toMatch(/verified: index/);
  });
});

describe('a demo profile says so on the page', () => {
  it('carries a banner, not just a browser-tab hint', () => {
    /*
     * "(sample)" in the <title> was the only signal. That became indefensible
     * once these pages were enriched to look real and linked from the
     * homepage — a screenshot carried nothing to say it was a demo.
     */
    expect(profileRaw).toMatch(/This is a demo profile, not a real business/);
    expect(profile).toMatch(/\{isSample && \(/);
  });

  it('names what is placeholder, and offers the real thing', () => {
    expect(profile).toMatch(/placeholders/);
    expect(profile).toMatch(/nothing to contact/);
    expect(profile).toMatch(/to="\/send-business"/);
  });
});
