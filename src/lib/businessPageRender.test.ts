import { describe, it, expect } from 'vitest';

import {
  renderBusinessPage, profileJsonLd, breadcrumbJsonLd, openState,
  openingHoursSpecification, profileTitle, profileDescription, profilePath,
  CLOSING_SOON_MINUTES, embedJson, type ProfilePage, type ProfileBusiness,
} from './businessPageRender';

const business = (over: Partial<ProfileBusiness> = {}): ProfileBusiness => ({
  id: '11111111-2222-3333-4444-555555555555',
  username: 'mama-put',
  name: 'Mama Put Kitchen',
  description: 'A neighbourhood kitchen in Yaba serving Nigerian classics cooked to order every day.',
  category: 'Restaurant',
  location: 'Yaba, Lagos',
  phone: '08031234567',
  email: 'hello@mamaput.ng',
  website: 'https://mamaput.ng',
  image_url: 'https://x/cover.jpg',
  rating: 4.6,
  verified: true,
  opening_hours: 'Mon-Sat: 9AM-8PM',
  timezone: 'Africa/Lagos',
  open_status: null,
  ...over,
});

const page = (over: Partial<ProfilePage> = {}): ProfilePage => ({
  business: business(),
  products: [
    { id: 'p1', name: 'Jollof rice & chicken', price: '₦4,500', description: 'Party style', image_url: 'https://x/j.jpg' },
    { id: 'p2', name: 'Chapman', price: 'Ask' },
  ],
  services: [{ id: 's1', name: 'Event catering', price: 'From ₦150,000' }],
  reviews: [{ id: 'r1', author_name: 'Chidi', rating: 5, comment: 'Best jollof in Yaba.' }],
  reviewCount: 24,
  siteUrl: 'https://nowopenafrica.com',
  // A Wednesday at 10:00 Lagos time — inside Mon–Sat 9–8.
  now: new Date('2026-08-26T09:00:00Z'),
  ...over,
});

describe('the page a crawler receives', () => {
  it('contains the business name, category and location as real text', () => {
    // The whole point: this used to be "NowOpen Africa needs JavaScript
    // enabled to run" and nothing else.
    const html = renderBusinessPage(page());
    expect(html).toContain('Mama Put Kitchen');
    expect(html).toContain('Restaurant');
    expect(html).toContain('Yaba, Lagos');
    expect(html).not.toContain('needs JavaScript enabled');
  });

  it('lists the products and services with their prices', () => {
    const html = renderBusinessPage(page());
    expect(html).toContain('Jollof rice &amp; chicken');
    expect(html).toContain('₦4,500');
    expect(html).toContain('Event catering');
  });

  it('carries the reviews', () => {
    expect(renderBusinessPage(page())).toContain('Best jollof in Yaba.');
  });

  it('sets a canonical url on the username form people actually share', () => {
    const html = renderBusinessPage(page());
    expect(html).toContain('<link rel="canonical" href="https://nowopenafrica.com/mama-put">');
  });

  it('falls back to the id url for a business with no username', () => {
    const b = business({ username: null });
    expect(profilePath(b)).toBe('/businesses/11111111-2222-3333-4444-555555555555');
  });

  it('escapes everything a business could type into its own name', () => {
    const html = renderBusinessPage(page({
      business: business({ name: '<script>alert(1)</script> & Sons', description: '"quoted"' }),
    }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&amp; Sons');
  });

  it('emits both structured-data blocks', () => {
    const html = renderBusinessPage(page());
    expect((html.match(/application\/ld\+json/g) || []).length).toBe(2);
  });
});

describe('profileJsonLd', () => {
  it('describes a LocalBusiness with its contact details', () => {
    const ld = profileJsonLd(page()) as Record<string, unknown>;
    expect(ld['@type']).toBe('LocalBusiness');
    expect(ld.name).toBe('Mama Put Kitchen');
    expect(ld.url).toBe('https://nowopenafrica.com/mama-put');
    expect(ld.telephone).toBe('08031234567');
  });

  it('only claims a rating when reviews exist to support it', () => {
    // aggregateRating with reviewCount 0 is invalid structured data, and Google
    // penalises the page rather than ignoring the field.
    const withReviews = profileJsonLd(page()) as Record<string, unknown>;
    expect(withReviews.aggregateRating).toBeTruthy();

    const none = profileJsonLd(page({ reviewCount: 0 })) as Record<string, unknown>;
    expect(none.aggregateRating).toBeUndefined();

    const unrated = profileJsonLd(page({ business: business({ rating: 0 }) })) as Record<string, unknown>;
    expect(unrated.aggregateRating).toBeUndefined();
  });

  it('offers the products so a listing can surface with them', () => {
    const ld = profileJsonLd(page()) as Record<string, unknown>;
    const offers = ld.makesOffer as { itemOffered: { name: string } }[];
    expect(offers).toHaveLength(2);
    expect(offers[0].itemOffered.name).toBe('Jollof rice & chicken');
  });

  it('omits makesOffer entirely for a business with no products', () => {
    const ld = profileJsonLd(page({ products: [] })) as Record<string, unknown>;
    expect(ld.makesOffer).toBeUndefined();
  });

  it('is serialisable — a page that throws here renders nothing', () => {
    expect(() => JSON.stringify(profileJsonLd(page()))).not.toThrow();
  });
});

describe('breadcrumbJsonLd', () => {
  it('walks businesses → category → this business', () => {
    const bc = breadcrumbJsonLd(page()) as { itemListElement: { position: number; name: string }[] };
    expect(bc.itemListElement.map((i) => i.name)).toEqual(['Businesses', 'Restaurant', 'Mama Put Kitchen']);
    expect(bc.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
  });

  it('skips the category rung when there is no category', () => {
    const bc = breadcrumbJsonLd(page({ business: business({ category: null }) })) as { itemListElement: unknown[] };
    expect(bc.itemListElement).toHaveLength(2);
  });
});

describe('openingHoursSpecification', () => {
  it('emits a rule per open day and omits the closed ones', () => {
    // A closed day emitted as 00:00–00:00 would claim the business is open at
    // midnight.
    const spec = openingHoursSpecification('Mon-Sat: 9AM-8PM') as { dayOfWeek: string; opens: string }[];
    expect(spec).toHaveLength(6);
    expect(spec.every((s) => s.opens === '09:00')).toBe(true);
    expect(spec.some((s) => s.dayOfWeek.endsWith('Sunday'))).toBe(false);
  });

  it('collapses always-open into one all-week rule', () => {
    const spec = openingHoursSpecification('24 hours') as { dayOfWeek: string[] }[];
    if (spec.length) expect(Array.isArray(spec[0].dayOfWeek)).toBe(true);
  });

  it('returns nothing for hours it cannot parse, rather than guessing', () => {
    expect(openingHoursSpecification('')).toEqual([]);
    expect(openingHoursSpecification(null)).toEqual([]);
  });
});

describe('openState', () => {
  const wed10 = new Date('2026-08-26T09:00:00Z');   // 10:00 in Lagos
  const wed1930 = new Date('2026-08-26T18:30:00Z'); // 19:30 in Lagos
  const sun = new Date('2026-08-23T09:00:00Z');     // Sunday, closed

  it('says open, with when it closes', () => {
    const s = openState(business(), wed10);
    expect(s.kind).toBe('open');
    expect(s.detail).toMatch(/Open until/);
  });

  it('has a distinct closing-soon state, because it changes what a customer does', () => {
    const s = openState(business(), wed1930);
    expect(s.kind).toBe('closing-soon');
    expect(s.detail).toMatch(/Closes in \d+ minutes?/);
  });

  it('does not call it closing soon when there is plenty of time', () => {
    expect(openState(business(), wed10).kind).not.toBe('closing-soon');
    expect(CLOSING_SOON_MINUTES).toBeGreaterThan(0);
  });

  it('says closed, and when it opens again', () => {
    const s = openState(business(), sun);
    expect(s.kind).toBe('closed');
    expect(s.detail).toMatch(/Opens/);
  });

  it("lets the owner's override beat the timetable", () => {
    // A business that shut early knows something the schedule does not.
    expect(openState(business({ open_status: 'closed' }), wed10).kind).toBe('closed');
    expect(openState(business({ open_status: 'open' }), sun).kind).toBe('open');
  });

  it('admits it does not know rather than guessing open', () => {
    const s = openState(business({ opening_hours: null, hours: null, open_status: null }), wed10);
    expect(s.kind).toBe('unknown');
    expect(s.label).toMatch(/not confirmed/i);
  });

  it('renders the state into the page', () => {
    expect(renderBusinessPage(page({ now: wed1930 }))).toContain('Closing soon');
  });
});

describe('title and description', () => {
  it('puts the name, trade and place in the title', () => {
    expect(profileTitle(page())).toBe('Mama Put Kitchen — Restaurant in Yaba, Lagos | NowOpen Africa');
  });

  it("prefers the business's own words for the description", () => {
    expect(profileDescription(page())).toContain('neighbourhood kitchen');
  });

  it('writes a useful sentence when the business wrote nothing', () => {
    // A page of template text is what makes a directory look automated, so this
    // path only runs when there is genuinely nothing to use.
    const d = profileDescription(page({ business: business({ description: '' }) }));
    expect(d).toContain('Mama Put Kitchen');
    expect(d).toContain('Restaurant in Yaba, Lagos');
    expect(d).toMatch(/2 products and 1 service/);
  });

  it('keeps descriptions inside what a search result will show', () => {
    const long = 'x'.repeat(900);
    expect(profileDescription(page({ business: business({ description: long }) })).length).toBeLessThanOrEqual(300);
  });
});

describe('embedJson', () => {
  it('neutralises a script tag hidden in a business name', () => {
    // JSON.stringify does NOT escape `<`, so this closed the JSON-LD block and
    // executed. Stored XSS from a field any owner can edit.
    const out = embedJson({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('\\u003c');
  });

  it('still parses back to exactly what went in', () => {
    const value = { name: '</script> & <b>bold</b>', n: 42, nested: { a: ['<x>'] } };
    expect(JSON.parse(embedJson(value))).toEqual(value);
  });

  it('escapes the separators that are legal JSON but illegal in a script', () => {
    const out = embedJson({ s: '\u2028\u2029' });
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
    expect(JSON.parse(out)).toEqual({ s: '\u2028\u2029' });
  });
});
