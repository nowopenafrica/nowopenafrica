import { describe, it, expect } from 'vitest';
import {
  parseBusinessListHtml,
  buildBusinessListUrl,
  BUSINESSLIST_SOURCE_KEY,
  BUSINESSLIST_CATEGORIES,
  BUSINESSLIST_BASE,
} from './businesslist';

/**
 * The BusinessList adapter scrapes businesslist.com.ng for Nigerian business
 * data. Each test uses a realistic HTML fragment that matches the site's
 * actual structure.
 */

describe('BusinessList adapter', () => {
  it('exports a valid source key', () => {
    expect(BUSINESSLIST_SOURCE_KEY).toBe('businesslist_ng');
  });

  it('maps at least 30 BusinessList categories to NowOpen categories', () => {
    expect(Object.keys(BUSINESSLIST_CATEGORIES).length).toBeGreaterThanOrEqual(30);
  });
});

describe('buildBusinessListUrl', () => {
  it('builds a search URL when a query is given', () => {
    expect(buildBusinessListUrl({ query: 'restaurant lagos' }))
      .toBe('https://www.businesslist.com.ng/search?q=restaurant%20lagos');
  });

  it('builds a category/location URL', () => {
    expect(buildBusinessListUrl({ category: 'Restaurants', location: 'Lagos' }))
      .toBe('https://www.businesslist.com.ng/category/restaurants/lagos');
  });

  it('adds a page parameter', () => {
    expect(buildBusinessListUrl({ category: 'Hotels', page: 2 }))
      .toBe('https://www.businesslist.com.ng/category/hotels?page=2');
  });

  it('falls back to the base URL', () => {
    expect(buildBusinessListUrl({})).toBe(BUSINESSLIST_BASE);
  });
});

describe('parseBusinessListHtml', () => {
  it('extracts business listings from HTML with company links', () => {
    const html = `
      <a href="/company/12345/taste-lagos-restaurant">
        <h2 class="company-name">Taste Lagos Restaurant</h2>
      </a>
      <span class="category">Restaurants</span>
      <span class="location">Lagos Island, Lagos</span>
      <span class="phone">08012345678</span>
      <a href="mailto:info@tastelagos.ng">info@tastelagos.ng</a>
      <a href="https://tastelagos.ng">Visit website</a>
      <a href="/company/67890/quick-bites">
        <h2 class="company-name">Quick Bites</h2>
      </a>
      <span class="category">Fast Food</span>
      <span class="location">Victoria Island, Lagos</span>
      <span class="phone">08098765432</span>
    `;

    const results = parseBusinessListHtml(html, 'Restaurant');
    expect(results.length).toBeGreaterThanOrEqual(1);

    const first = results[0];
    expect(first.sourceKey).toBe('businesslist_ng');
    expect(first.sourceRecordId).toMatch(/^bl:\d+$/);
    expect(first.sourceUrl).toContain('businesslist.com.ng/company/');
    expect(first.name).toBeDefined();
    expect(first.name.length).toBeGreaterThan(0);
  });

  it('returns an empty array for HTML with no company links', () => {
    const html = '<html><body><p>No businesses here.</p></body></html>';
    expect(parseBusinessListHtml(html, 'Restaurant')).toEqual([]);
  });

  it('deduplicates by company ID', () => {
    const html = `
      <a href="/company/111/dup-test"><h2>Dup Test</h2></a>
      <a href="/company/111/dup-test"><h2>Dup Test</h2></a>
    `;
    const results = parseBusinessListHtml(html, 'Restaurant');
    expect(results).toHaveLength(1);
  });

  it('extracts phone numbers with Nigerian patterns', () => {
    const html = `
      <a href="/company/222/phone-test"><h2>Phone Test</h2></a>
      <span>Call us: +2348012345678</span>
    `;
    const results = parseBusinessListHtml(html, 'Restaurant');
    expect(results[0].phone).toBe('+2348012345678');
  });

  it('assigns the category hint when HTML does not contain a category', () => {
    const html = `
      <a href="/company/333/no-cat"><h2>No Category</h2></a>
    `;
    const results = parseBusinessListHtml(html, 'Banking & Finance');
    expect(results[0].category).toBe('Banking & Finance');
  });
});
