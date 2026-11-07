import { describe, it, expect } from 'vitest';

import {
  renderDiscoveryPage, isIndexable, hoursCoverage, discoveryTitle, discoveryDescription,
  discoveryJsonLd, breadcrumbJsonLd, slugify, unslugify, MIN_INDEXABLE,
  type DiscoveryPage, type DiscoveryListing,
} from '../lib/discoveryPageRender';
import { shouldRenderDiscovery } from '../../middleware';

const GOOGLE = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0 Safari/537.36';

const listing = (n: number, over: Partial<DiscoveryListing> = {}): DiscoveryListing => ({
  id: `id-${n}`,
  name: `Business ${n}`,
  username: `business-${n}`,
  category: 'Restaurant & Food',
  location: 'Lagos, Nigeria',
  description: 'A place to eat.',
  openLabel: null,
  hasHours: false,
  // Accountable by default in fixtures, so each test states the condition it is
  // actually exercising rather than inheriting it.
  hasProvenance: true,
  ...over,
});

const page = (over: Partial<DiscoveryPage> = {}): DiscoveryPage => ({
  siteUrl: 'https://nowopenafrica.com',
  path: '/businesses/restaurant/in/lagos',
  place: 'Lagos',
  category: 'Restaurant & Food',
  total: 6,
  listings: [
    listing(1, { hasHours: true, openLabel: 'Open now' }),
    listing(2), listing(3), listing(4), listing(5), listing(6),
  ],
  relatedCategories: [{ label: 'Hotel & Lodging', path: '/businesses/hotel-lodging/in/lagos' }],
  relatedPlaces: [{ label: 'Abuja', path: '/businesses/in/abuja' }],
  ...over,
});

describe('the indexing threshold', () => {
  it('indexes a page with enough businesses and real hours', () => {
    expect(isIndexable(page())).toBe(true);
  });

  /*
   * The rule the whole file exists for. A city+category page with two listings
   * is a thin result for the query it would rank for, and §29 of the brief
   * forbids generating them.
   */
  it('refuses to be indexed below the threshold', () => {
    expect(isIndexable(page({ total: 4, listings: [listing(1, { hasHours: true })] }))).toBe(false);
  });

  /*
   * CHANGED 2026-09-15. This used to assert the opposite.
   *
   * There was a second condition: at least one accountable listing had to have
   * opening hours, because NowOpen is named after knowing whether somewhere is
   * open. The instinct was right and the placement was wrong.
   *
   * MEASURED IN PRODUCTION: 3 of 3,118 businesses have any opening-hours text.
   * So of the 220 discovery pages the sitemap submitted, exactly one passed —
   * 40 of 40 sampled through Googlebot returned `noindex`. 148 pages that
   * qualified on accountability were suppressed by a data gap, and the sitemap
   * went on submitting them, asking Google to consider pages the site then told
   * it to ignore.
   *
   * A page listing sixty accountable hospitals in Lagos with names, addresses
   * and phone numbers answers "hospitals in Lagos". Hours would make it better.
   * Their absence does not make it thin. The surface that genuinely must not
   * exist without hours is /open-now, and that has its own rule.
   *
   * Hours are now a priority signal — hoursCoverage() — not an existence gate.
   */
  it('indexes a dense accountable page even when nobody has published hours', () => {
    const noHours = page({ listings: Array.from({ length: 6 }, (_, i) => listing(i)) });
    expect(noHours.total).toBeGreaterThanOrEqual(MIN_INDEXABLE);
    expect(isIndexable(noHours)).toBe(true);
  });

  it('still reports hours coverage, so the gap stays visible', () => {
    // The data gap is real and must not become invisible just because it no
    // longer hides the page.
    const noHours = page({ listings: Array.from({ length: 6 }, (_, i) => listing(i)) });
    expect(hoursCoverage(noHours)).toBe(0);

    const half = page({
      listings: [
        ...Array.from({ length: 3 }, (_, i) => listing(i, { hasHours: true })),
        ...Array.from({ length: 3 }, (_, i) => listing(i + 3)),
      ],
    });
    expect(hoursCoverage(half)).toBeCloseTo(0.5);
  });

  it('counts coverage over accountable listings only', () => {
    const mixed = page({
      listings: [
        ...Array.from({ length: 5 }, (_, i) => listing(i, { hasHours: true })),
        // Not accountable: must not dilute the measure.
        listing(9, { hasProvenance: false, hasHours: false }),
      ],
    });
    expect(hoursCoverage(mixed)).toBe(1);
  });

  /*
   * The condition added after the first version shipped wrong.
   *
   * It counted every listable business, and all 32 publicly listed businesses
   * turned out to be fabricated demo data — placeholder phone numbers, emails
   * on invented domains, websites that do not resolve. /businesses/in/lagos
   * went live as `index, follow` with fourteen of them and LocalBusiness
   * markup, which is the platform vouching to Google for businesses that do
   * not exist.
   */
  it('refuses to be indexed on the strength of records nobody is accountable for', () => {
    const demoOnly = page({
      total: 14,
      listings: Array.from({ length: 14 }, (_, i) =>
        listing(i, { hasProvenance: false, hasHours: true, openLabel: 'Open now' })),
    });
    expect(demoOnly.total).toBeGreaterThanOrEqual(MIN_INDEXABLE);
    // Plenty of listings, plenty with hours — and still noindex, because not
    // one of them has an owner or an authorised source behind it.
    expect(isIndexable(demoOnly)).toBe(false);
    expect(renderDiscoveryPage(demoOnly)).toContain('content="noindex, follow"');
  });

  it('counts only accountable listings toward the threshold', () => {
    const mixed = page({
      total: 20,
      listings: [
        ...Array.from({ length: 4 }, (_, i) => listing(i, { hasHours: true })),
        ...Array.from({ length: 16 }, (_, i) => listing(100 + i, { hasProvenance: false, hasHours: true })),
      ],
    });
    // 4 accountable is below the bar of 5, however many demo rows sit beside them.
    expect(isIndexable(mixed)).toBe(false);
  });

  it('indexes once enough accountable listings exist', () => {
    const real = page({
      total: 5,
      listings: Array.from({ length: 5 }, (_, i) => listing(i, { hasHours: true, openLabel: 'Open now' })),
    });
    expect(isIndexable(real)).toBe(true);
  });

  it('emits noindex in the HTML when not indexable, and still renders the page', () => {
    const html = renderDiscoveryPage(page({ total: 2, listings: [listing(1)] }));
    expect(html).toContain('name="robots" content="noindex, follow"');
    // A person following a link must still get something useful.
    expect(html).toContain('Business 1');
  });

  it('emits index when it qualifies', () => {
    expect(renderDiscoveryPage(page())).toContain('content="index, follow');
  });
});

describe('titles and descriptions are written the way people search', () => {
  it('leads with the query, not the brand', () => {
    expect(discoveryTitle(page())).toBe('Restaurant & Food in Lagos — NowOpen Africa');
    expect(discoveryTitle(page({ category: null }))).toBe('Businesses in Lagos — NowOpen Africa');
  });

  it('describes counted facts and nothing else', () => {
    const d = discoveryDescription(page());
    expect(d).toContain('6 restaurant & food in Lagos');
    expect(d).toContain('1 open right now');
    // Never a superlative — nothing here measures "best".
    expect(d).not.toMatch(/\b(best|top|leading|greatest)\b/i);
  });

  it('omits the open count when nothing is open', () => {
    const d = discoveryDescription(page({ listings: [listing(1)] , total: 1 }));
    expect(d).not.toContain('open right now');
  });
});

describe('structured data', () => {
  it('counts the items it actually listed, not the total match', () => {
    // Overstating numberOfItems is invalid markup, and invalid structured data
    // is treated worse than none.
    const ld = discoveryJsonLd(page({ total: 240 })) as { numberOfItems: number };
    expect(ld.numberOfItems).toBe(6);
  });

  it('points each item at the shared profile URL', () => {
    const ld = discoveryJsonLd(page()) as { itemListElement: Array<{ item: { url: string } }> };
    expect(ld.itemListElement[0].item.url).toBe('https://nowopenafrica.com/business-1');
  });

  it('builds a breadcrumb trail from the real hierarchy', () => {
    const ld = breadcrumbJsonLd(page()) as { itemListElement: Array<{ name: string }> };
    expect(ld.itemListElement.map((x) => x.name))
      .toEqual(['NowOpen Africa', 'Businesses', 'Lagos', 'Restaurant & Food']);
  });

  it('escapes markup so a business name cannot break out of a script tag', () => {
    const html = renderDiscoveryPage(page({
      listings: [listing(1, { name: '</script><script>alert(1)</script>', hasHours: true })],
    }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;/script&gt;');
  });
});

describe('slugs round-trip', () => {
  it('handles multi-word places', () => {
    expect(slugify('Port Harcourt')).toBe('port-harcourt');
    expect(unslugify('port-harcourt')).toBe('Port Harcourt');
  });

  it('spells an ampersand as "and", the way the sitemap already submits it', () => {
    /*
     * CHANGED 2026-09-15. This asserted 'restaurant-food'.
     *
     * There were two slugify functions. discoveryPages.ts (which mints the
     * sitemap URLs) wrote "&" as the word "and"; this file's copy stripped it.
     * The same category therefore had two addresses, and the renderer could
     * never resolve the one the sitemap submitted:
     *
     *   submitted   /businesses/hospital-and-clinic/in/lagos
     *   resolvable  /businesses/hospital-clinic/in/lagos
     *
     * 25 categories contain "&", holding 2,657 of 3,118 businesses. Every one
     * of their category pages rendered "No businesses listed here yet."
     *
     * There is now one function, re-exported. The "and" spelling wins because
     * those are the URLs already given to search engines.
     */
    expect(slugify('Restaurant & Food')).toBe('restaurant-and-food');
    expect(slugify('Hospital & Clinic')).toBe('hospital-and-clinic');
  });
});

describe('middleware routing', () => {
  it('renders /businesses/in/:place for a crawler', () => {
    expect(shouldRenderDiscovery('/businesses/in/lagos', GOOGLE)).toEqual({ place: 'lagos', category: '' });
  });

  it('renders /businesses/:category/in/:place for a crawler', () => {
    expect(shouldRenderDiscovery('/businesses/restaurant/in/lagos', GOOGLE))
      .toEqual({ place: 'lagos', category: 'restaurant' });
  });

  // A false positive here serves a real customer plain HTML instead of the app,
  // which is much worse than a false negative.
  it('leaves people alone', () => {
    expect(shouldRenderDiscovery('/businesses/in/lagos', CHROME)).toBeNull();
  });

  it('does not claim the single-business URL, which the profile renderer owns', () => {
    expect(shouldRenderDiscovery('/businesses/some-uuid', GOOGLE)).toBeNull();
  });

  it('ignores anything that is not a discovery shape', () => {
    for (const p of ['/businesses', '/discover', '/businesses/a/b/c/d', '/keeps']) {
      expect(shouldRenderDiscovery(p, GOOGLE), p).toBeNull();
    }
  });

  it('rejects a slug with characters a place or category cannot contain', () => {
    expect(shouldRenderDiscovery('/businesses/in/lagos%20city', GOOGLE)).toBeNull();
    expect(shouldRenderDiscovery('/businesses/in/../etc', GOOGLE)).toBeNull();
  });
});
