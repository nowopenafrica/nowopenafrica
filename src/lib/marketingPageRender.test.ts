import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import {
  MARKETING_PAGES, marketingPageFor, renderMarketingPage,
} from './marketingPageRender';

const SITE = 'https://nowopenafrica.com';

/** The React page each entry claims to describe. */
const SOURCE: Record<string, string> = {
  '/': 'src/pages/Home.tsx',
  '/about': 'src/pages/About.tsx',
  '/platform': 'src/pages/Platform.tsx',
  '/discover': 'src/pages/Discover.tsx',
  '/waitlist': 'src/pages/Waitlist.tsx',
};

// Curly apostrophes, entities and JSX line wrapping make exact substring
// matching useless. Compare on words instead.
const normalise = (s: string) => s
  .replace(/[’'`]/g, '')
  .replace(/&[a-z]+;/gi, ' ')
  .replace(/[^a-z0-9]+/gi, ' ')
  .toLowerCase()
  .trim();

describe('routing', () => {
  it('matches the five pages and nothing else', () => {
    expect(marketingPageFor('/')?.path).toBe('/');
    expect(marketingPageFor('/about')?.path).toBe('/about');
    expect(marketingPageFor('/ABOUT')?.path).toBe('/about');
    expect(marketingPageFor('/about/')?.path).toBe('/about');
    // A business profile must NOT be answered by this renderer — it has its own,
    // which reads the actual business.
    expect(marketingPageFor('/yemzoarts')).toBeUndefined();
    expect(marketingPageFor('/businesses/in/lagos')).toBeUndefined();
    expect(marketingPageFor('')).toBeUndefined();
  });
});

describe('the crawler is told what the page actually says', () => {
  // Serving search engines text the page does not contain is cloaking. It is
  // also how a site ranks for a promise it never makes.
  for (const page of MARKETING_PAGES) {
    it(`${page.path} — its title and description come from the page`, () => {
      const src = normalise(readFileSync(SOURCE[page.path], 'utf8'));
      expect(src, `${page.path} title`).toContain(normalise(page.title));
      expect(src, `${page.path} description`).toContain(normalise(page.description));
    });

    it(`${page.path} — its heading appears on the page`, () => {
      const src = normalise(readFileSync(SOURCE[page.path], 'utf8'));
      // The h1 may be split across JSX elements, so check its words survive.
      for (const word of normalise(page.h1).split(' ').filter((w) => w.length > 3)) {
        expect(src, `${page.path} h1 word "${word}"`).toContain(word);
      }
    });
  }
});

describe('the rendered page', () => {
  const home = renderMarketingPage(MARKETING_PAGES[0], SITE);

  it('gives a crawler a heading, prose and links', () => {
    expect(home).toMatch(/<h1>/);
    expect(home).toMatch(/<p>/);
    expect(home).toMatch(/<a href="\/businesses">/);
    expect(home).not.toMatch(/needs JavaScript/i);
  });

  it('sets a canonical without a trailing slash for the homepage', () => {
    expect(home).toContain(`<link rel="canonical" href="${SITE}">`);
    const about = renderMarketingPage(MARKETING_PAGES[1], SITE);
    expect(about).toContain(`<link rel="canonical" href="${SITE}/about">`);
  });

  it('is indexable — these are real pages, unlike an unclaimed listing', () => {
    expect(home).toMatch(/<meta name="robots" content="index, follow/);
  });

  it('escapes text rather than trusting it', () => {
    const rendered = renderMarketingPage({
      path: '/x', title: 'a<script>b', description: 'c"d', h1: "e'f",
      paragraphs: ['g<h'], links: [{ href: '/y', label: 'i&j' }],
    }, SITE);
    expect(rendered).not.toContain('<script>b');
    expect(rendered).toContain('&lt;script&gt;');
    expect(rendered).toContain('i&amp;j');
  });

  it('links only to real routes', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    for (const page of MARKETING_PAGES) {
      for (const link of page.links) {
        expect(app.includes(`path="${link.href}"`), `${link.href} is not a route`).toBe(true);
      }
    }
  });

  it('claims nothing about verification or counts', () => {
    // Every one of these pages is served to search engines. An unearned trust
    // claim here is the most expensive place to put one.
    for (const page of MARKETING_PAGES) {
      const text = [page.title, page.description, page.h1, ...page.paragraphs].join(' ');
      expect(text, page.path).not.toMatch(/\bverified listings\b/i);
      expect(text, page.path).not.toMatch(/\b\d{2,}\+?\s*(businesses|customers|reviews|users)\b/i);
    }
  });
});

describe('the middleware sends crawlers here', () => {
  const mw = readFileSync('middleware.ts', 'utf8');

  it('routes marketing paths to the renderer', () => {
    expect(mw).toContain('shouldRenderMarketing');
    expect(mw).toContain('/api/marketing');
  });

  it('only for crawlers — a person still gets the app', () => {
    const fn = mw.slice(mw.indexOf('export function shouldRenderMarketing'));
    expect(fn.slice(0, 300)).toMatch(/if \(!isCrawler\(userAgent\)\) return null;/);
  });

  it('checks marketing before the business-profile fallback', () => {
    // A single-segment path is treated as a business username. If the profile
    // check ran first, nothing here would ever match.
    expect(mw.indexOf('shouldRenderMarketing(url.pathname'))
      .toBeLessThan(mw.indexOf('shouldRenderProfile(url.pathname'));
  });
});
