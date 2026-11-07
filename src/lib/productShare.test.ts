import { describe, it, expect } from 'vitest';

import { SITE_URL } from './seo';
import {
  businessProfileUrl,
  productShareUrl,
  productShareText,
  productShareTitle,
} from './productShare';

describe('businessProfileUrl', () => {
  it('prefers the handle over the id', () => {
    expect(businessProfileUrl({ username: 'acme', id: 'abc-123' }, SITE_URL))
      .toBe(`${SITE_URL}/acme`);
  });

  it('falls back to the id path when there is no handle', () => {
    expect(businessProfileUrl({ id: 'abc-123' }, SITE_URL)).toBe(`${SITE_URL}/businesses/abc-123`);
  });

  it('treats an empty handle as no handle', () => {
    expect(businessProfileUrl({ username: '', id: 'abc-123' }, SITE_URL))
      .toBe(`${SITE_URL}/businesses/abc-123`);
  });

  it('returns null when there is neither handle nor id', () => {
    expect(businessProfileUrl({}, SITE_URL)).toBeNull();
    expect(businessProfileUrl(null, SITE_URL)).toBeNull();
    expect(businessProfileUrl(undefined, SITE_URL)).toBeNull();
  });
});

describe('productShareUrl', () => {
  it('appends the products tab and product id', () => {
    expect(productShareUrl(`${SITE_URL}/acme`, 'p1')).toBe(`${SITE_URL}/acme?tab=products&product=p1`);
  });

  it('uses & when the profile URL already has a query string', () => {
    expect(productShareUrl(`${SITE_URL}/acme?ref=x`, 'p1'))
      .toBe(`${SITE_URL}/acme?ref=x&tab=products&product=p1`);
  });

  it('url-encodes the product id', () => {
    expect(productShareUrl(`${SITE_URL}/acme`, 'a b/c')).toContain('product=a%20b%2Fc');
  });
});

describe('productShareText', () => {
  it('names the price when there is one', () => {
    expect(productShareText('Acme', { name: 'Widget', price: 'N5,000' }))
      .toBe('Widget - N5,000 at Acme on NowOpen Africa');
  });

  it('drops the price clause when there is no price', () => {
    expect(productShareText('Acme', { name: 'Widget' })).toBe('Widget at Acme on NowOpen Africa');
  });

  it('degrades to a generic noun when the product is unnamed', () => {
    expect(productShareText('Acme', {})).toBe('this item at Acme on NowOpen Africa');
  });
});

describe('productShareTitle', () => {
  it('combines product and business', () => {
    expect(productShareTitle('Acme', { name: 'Widget' })).toBe('Widget - Acme | NowOpen Africa');
  });

  it('falls back to a generic noun', () => {
    expect(productShareTitle('Acme', {})).toBe('Product - Acme | NowOpen Africa');
  });
});
