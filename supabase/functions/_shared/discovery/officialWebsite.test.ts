/**
 * The official-website parser: JSON-LD, anchors and meta tags into a
 * completed candidate with per-field evidence.
 */

import { describe, expect, it } from 'vitest';
import { parseWebsitePage, businessNode, extractJsonLd, plausibleEmail, decodeEntities } from './officialWebsite.ts';

const HOME = 'https://zanzibarcoffee.ng';

function page(html: string): string {
  return `<!doctype html><html><head>${html}</head><body></body></html>`;
}

describe('parseWebsitePage', () => {
  it('parses a LocalBusiness JSON-LD block with primary evidence', () => {
    const html = page(`
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"CoffeeShop",
       "name":"Zanzibar Coffee",
       "telephone":"+234 803 123 4567",
       "email":"hello@zanzibarcoffee.ng",
       "address":{"streetAddress":"12 Adetokunbo Ademola Street","addressLocality":"Victoria Island","addressRegion":"Lagos"},
       "description":"Specialty coffee since 2019."}
      </script>`);
    const r = parseWebsitePage(html, HOME);
    expect(r.note).toBeNull();
    const c = r.candidate!;
    expect(c.name).toBe('Zanzibar Coffee');
    expect(c.category).toBe('Coffee Shop');
    expect(c.phone).toBe('+2348031234567');
    expect(c.email).toBe('hello@zanzibarcoffee.ng');
    expect(c.city).toBe('Victoria Island');
    expect(c.address).toContain('Adetokunbo Ademola');
    expect(c.description).toContain('Specialty coffee');
    expect(c.website).toBe(HOME);
    expect(c.sourceRecordId).toBe(HOME);
    expect(c.evidence.phone.method).toBe('structured_data');
    expect(c.evidence.email.confidence).toBe(95);
    expect(r.extracted).toEqual(expect.arrayContaining(['phone', 'email', 'address']));
  });

  it('pulls contacts out of anchors when there is no JSON-LD', () => {
    const html = page(`
      <title>Zanzibar Coffee | Lagos</title>
      <meta property="og:description" content="Specialty coffee in VI.">
      <a href="tel:+2347030001111">Call us</a>
      <a href="mailto:orders@zanzibarcoffee.ng">Email</a>
      <a href="https://instagram.com/zanzibarcoffee">Instagram</a>
      <a href="https://facebook.com/zanzibarcoffee">Facebook</a>
      <a href="https://x.com/zanzibarcoffee">X</a>`);
    const c = parseWebsitePage(html, `${HOME}/`).candidate!;
    expect(c.name).toBe('Zanzibar Coffee');
    expect(c.phone).toBe('+2347030001111');
    expect(c.email).toBe('orders@zanzibarcoffee.ng');
    expect(c.description).toContain('Specialty coffee');
    expect(c.profile.instagram).toBe('https://instagram.com/zanzibarcoffee');
    expect(c.profile.facebook).toBe('https://facebook.com/zanzibarcoffee');
    expect(c.profile.twitter).toBe('https://x.com/zanzibarcoffee');
    expect(c.evidence.phone.method).toBe('dom_extraction');
  });

  it('a domain-sweep page adds nothing to a name-only record', () => {
    const html = page('<title>Fresh Fish Lagos</title>');
    const r = parseWebsitePage(html, `${HOME}/`);
    expect(r.candidate).toBeNull();
    expect(r.note).toMatch(/no new contact signal/);
  });

  it('honours a canonical URL as the website field', () => {
    const html = page(`
      <link rel="canonical" href="https://zanzibarcoffee.ng/home">
      <title>Zanzibar Coffee</title>
      <a href="mailto:hi@zanzibarcoffee.ng">Email</a>`);
    const c = parseWebsitePage(html, HOME).candidate!;
    expect(c.website).toBe('https://zanzibarcoffee.ng/home');
  });

  it('reads a WhatsApp link as a dialable phone', () => {
    const html = page(`
      <title>Zanzibar Coffee</title>
      <a href="https://wa.me/2347030002222?text=hi">Chat</a>`);
    const c = parseWebsitePage(html, HOME).candidate!;
    expect(c.phone).toBe('+2347030002222');
    expect(c.evidence.phone.method).toBe('dom_extraction');
  });

  it('normalises a natty phone written in text, at regex confidence', () => {
    const html = page(`
      <title>Zanzibar Coffee</title>
      <a href="mailto:hi@zanzibarcoffee.ng">Email</a>
      <p>Reach us on +234 704 123 9999 for orders.</p>`);
    const c = parseWebsitePage(html, HOME).candidate!;
    expect(c.phone).toBe('+2347041239999');
    expect(c.evidence.phone.confidence).toBeLessThan(50);
  });

  it('does not emit a social "explore" link as a profile', () => {
    const html = page(`
      <title>Zanzibar Coffee</title>
      <a href="mailto:hi@zanzibarcoffee.ng">Email</a>
      <a href="https://instagram.com/explore">Explore</a>`);
    const c = parseWebsitePage(html, HOME).candidate!;
    expect(c!.profile.instagram).toBeUndefined();
  });

  it('extracts a business node from a @graph of scaffolding', () => {
    /*
     * Wrapped in the script tag it actually arrives in. This fixture passed
     * bare JSON to `extractJsonLd`, which reads HTML and looks for
     * <script type="application/ld+json"> — so it matched nothing, returned
     * [], and the assertion failed on the fixture rather than on the
     * behaviour it was written to check (flattening @graph and skipping
     * scaffolding types).
     */
    const nodes = extractJsonLd(`<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Zanzibar' },
        { '@type': 'Restaurant', name: 'Zanzibar Coffee' },
      ],
    })}</script>`);
    expect(businessNode(nodes)?.name).toBe('Zanzibar Coffee');
  });
});

describe('the fuller extraction', () => {
  /**
   * A page shaped the way real African hospitality sites are: schema.org
   * LocalBusiness in JSON-LD, og: tags, a wa.me link, social anchors.
   *
   * Every field here is one a business published about ITSELF. Nothing is
   * inferred, and nothing absent from the page gets a value.
   */
  const LD = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Hotel',
    name: 'Duchess Hotel',
    description: 'Rooms and conferencing in Ikeja.',
    slogan: 'Rest well, work well.',
    logo: { '@type': 'ImageObject', url: 'https://duchess.example/logo.png' },
    image: ['https://duchess.example/front.jpg'],
    telephone: '+234 802 111 2222',
    email: 'stay@duchess.example',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '12 Allen Avenue',
      addressLocality: 'Ikeja',
      addressRegion: 'Lagos',
    },
    geo: { '@type': 'GeoCoordinates', latitude: 6.6018, longitude: 3.3515 },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['https://schema.org/Monday', 'https://schema.org/Friday'],
        opens: '08:00',
        closes: '18:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'https://schema.org/Saturday',
        opens: '09:00',
        closes: '14:00',
      },
    ],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      itemListElement: [
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Airport transfer' } },
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Conference hire' } },
        { '@type': 'Offer', itemOffered: { '@type': 'Product', name: 'Executive Suite' } },
      ],
    },
  });

  const PAGE = '<!doctype html><html><head>'
    + '<title>Duchess Hotel</title>'
    + '<meta property="og:image" content="/img/cover.jpg">'
    + '<script type="application/ld+json">' + LD + '</script>'
    + '</head><body>'
    + '<a href="https://wa.me/2348021112222">WhatsApp us</a>'
    + '<a href="https://www.linkedin.com/company/duchess-hotel">LinkedIn</a>'
    + '<a href="https://www.youtube.com/@duchesshotel">YouTube</a>'
    + '<a href="https://www.tiktok.com/@duchesshotel">TikTok</a>'
    + '<a href="https://instagram.com/duchesshotel">Instagram</a>'
    + '</body></html>';

  const parsed = parseWebsitePage(PAGE, 'https://duchess.example/contact');

  const pageWith = (ld: unknown, body = '') =>
    '<html><head><title>Test Ltd</title><script type="application/ld+json">'
    + JSON.stringify(ld) + '</script></head><body>' + body + '</body></html>';

  it('reads the opening hours a business already published', () => {
    /*
     * The highest-value field in this whole set. Measured 2026-09-15: 3 of
     * 3,118 businesses on NowOpen have any opening hours, and the product is
     * named after the question hours answer. openingHoursSpecification is
     * where a business most often already has them, machine-readable.
     */
    expect(parsed.details.facts.openingHours).toBe('Mon,Fri: 08:00-18:00; Sat: 09:00-14:00');
    expect(parsed.extracted).toContain('opening_hours');
  });

  it('reads coordinates instead of discarding them', () => {
    // Hardcoded null before, so every "near me" query was worse than the
    // source data allowed.
    expect(parsed.candidate?.latitude).toBeCloseTo(6.6018);
    expect(parsed.candidate?.longitude).toBeCloseTo(3.3515);
  });

  it('never turns a missing geo into the Gulf of Guinea', () => {
    // Number(null) is 0, so a naive read puts every geo-less business at
    // (0, 0) — open sea south of Ghana, and a plausible-looking coordinate.
    const noGeo = parseWebsitePage(
      pageWith({ '@type': 'LocalBusiness', name: 'X Ltd', telephone: '+234 802 111 2222' }),
      'https://x.example/',
    );
    expect(noGeo.candidate?.latitude).toBeNull();
    expect(noGeo.candidate?.longitude).toBeNull();
  });

  it('records the WhatsApp number behind a wa.me link', () => {
    // The channel this audience actually answers on.
    expect(parsed.details.facts.whatsapp).toBe('+2348021112222');
  });

  it('records every social network, not only three', () => {
    expect(Object.keys(parsed.details.facts.socials).sort())
      .toEqual(['instagram', 'linkedin', 'tiktok', 'youtube']);
  });

  it('lists service and product NAMES, separated by type', () => {
    // Names are facts about what the business does. The marketing copy
    // attached to them is somebody's writing and is deliberately not taken.
    expect(parsed.details.owned.services).toEqual(['Airport transfer', 'Conference hire']);
    expect(parsed.details.owned.products).toEqual(['Executive Suite']);
  });

  it('records the logo and cover image as URLs, not as copies', () => {
    /*
     * A pointer to where the image lives. NowOpen does not fetch or host the
     * bytes here: the image belongs to the business, and republishing it is
     * their decision rather than a side effect of an operator reading a page.
     */
    expect(parsed.details.owned.logoUrl).toBe('https://duchess.example/logo.png');
    expect(parsed.details.owned.coverImageUrl).toBe('https://duchess.example/front.jpg');
  });

  it('resolves a relative image against the page it was read from', () => {
    const relative = parseWebsitePage(
      '<html><head><title>Y Ltd</title>'
      + '<meta property="og:image" content="/img/cover.jpg">'
      + '<meta name="description" content="A shop in Yaba.">'
      + '</head><body><a href="mailto:hi@y.example">mail</a></body></html>',
      'https://y.example/about/',
    );
    expect(relative.details.owned.coverImageUrl).toBe('https://y.example/img/cover.jpg');
  });

  it('keeps the slogan separate from the description', () => {
    expect(parsed.details.owned.slogan).toBe('Rest well, work well.');
    expect(parsed.candidate?.description).toBe('Rooms and conferencing in Ikeja.');
  });

  it('still reports details when there is no importable candidate', () => {
    /*
     * "This site publishes hours and a logo but no contact details" is useful
     * to an operator deciding whether to chase the listing. A blank panel is
     * not, and the early returns used to give one.
     */
    const thin = parseWebsitePage(
      '<html><head><script type="application/ld+json">'
      + JSON.stringify({
        '@type': 'LocalBusiness',
        openingHours: 'Mo-Sa 08:00-20:00',
        logo: 'https://thin.example/logo.svg',
      })
      + '</script></head><body></body></html>',
      'https://thin.example/',
    );
    expect(thin.candidate).toBeNull();
    expect(thin.details.facts.openingHours).toBe('Mo-Sa 08:00-20:00');
    expect(thin.details.owned.logoUrl).toBe('https://thin.example/logo.svg');
  });

  it('invents nothing for a page that publishes nothing', () => {
    const bare = parseWebsitePage(
      '<html><head><title>Hello</title></head><body>Hi</body></html>',
      'https://bare.example/',
    );
    expect(bare.details.facts.openingHours).toBeNull();
    expect(bare.details.facts.whatsapp).toBeNull();
    expect(bare.details.facts.latitude).toBeNull();
    expect(bare.details.owned.logoUrl).toBeNull();
    expect(bare.details.owned.coverImageUrl).toBeNull();
    expect(bare.details.owned.services).toEqual([]);
    expect(bare.details.owned.products).toEqual([]);
    expect(bare.details.owned.about).toBeNull();
  });

  it('reads schema.org "open all day" as 24 hours, not a time range', () => {
    const allDay = parseWebsitePage(
      pageWith({
        '@type': 'Hospital',
        name: 'Z Clinic',
        telephone: '+234 802 111 2222',
        openingHoursSpecification: {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['https://schema.org/Monday'],
          opens: '00:00',
          closes: '23:59',
        },
      }),
      'https://z.example/',
    );
    expect(allDay.details.facts.openingHours).toBe('Mon: 24 hours');
  });

  it('caps a catalogue rather than importing somebody’s whole inventory', () => {
    // This is a lead, not a product feed.
    const many = pageWith({
      '@type': 'Store',
      name: 'Big Shop',
      telephone: '+234 802 111 2222',
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        itemListElement: Array.from({ length: 200 }, (_, i) => ({
          '@type': 'Offer',
          itemOffered: { '@type': 'Product', name: 'Item ' + i },
        })),
      },
    });
    expect(parseWebsitePage(many, 'https://big.example/').details.owned.products).toHaveLength(40);
  });
});

describe('a plain LocalBusiness page is not invisible', () => {
  /**
   * THE DEFECT, found 2026-09-15.
   *
   * businessNode() returned the first node whose @type was absent from one
   * list called GENERIC_TYPES — and `LocalBusiness` was in it. So a page marked
   * up as a plain LocalBusiness matched nothing, businessNode returned null,
   * and the parser read no name, no phone, no address, no hours and no logo
   * from its structured data.
   *
   * `LocalBusiness` is schema.org's canonical type for a shop with a front
   * door. It is what a small business's site almost always uses. The extractor
   * was therefore blindest to exactly the businesses this directory exists for.
   *
   * The list now splits: page scaffolding (never the business) from vague
   * business types (the business, just not a usable category).
   */
  const plain = parseWebsitePage(
    '<html><head><title>Mama Put Kitchen</title>'
    + '<script type="application/ld+json">'
    + JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'Mama Put Kitchen',
      telephone: '+234 803 444 5555',
      email: 'hello@mamaput.example',
      description: 'Home cooking in Surulere.',
      logo: 'https://mamaput.example/logo.png',
      address: { '@type': 'PostalAddress', streetAddress: '4 Adeniran Ogunsanya', addressLocality: 'Surulere' },
      openingHours: 'Mo-Sa 07:00-21:00',
      geo: { latitude: 6.4969, longitude: 3.3481 },
    })
    + '</script></head><body></body></html>',
    'https://mamaput.example/',
  );

  it('reads the business from it at all', () => {
    expect(plain.candidate).not.toBeNull();
    expect(plain.candidate?.name).toBe('Mama Put Kitchen');
    expect(plain.candidate?.phone).toBe('+2348034445555');
    expect(plain.candidate?.email).toBe('hello@mamaput.example');
  });

  it('reads its address, hours, coordinates and logo', () => {
    expect(plain.candidate?.address).toContain('4 Adeniran Ogunsanya');
    expect(plain.details.facts.openingHours).toBe('Mo-Sa 07:00-21:00');
    expect(plain.candidate?.latitude).toBeCloseTo(6.4969);
    expect(plain.details.owned.logoUrl).toBe('https://mamaput.example/logo.png');
  });

  it('still offers no category, because "Local Business" is not one', () => {
    /*
     * The reason the two lists exist rather than one. Being a poor CATEGORY and
     * being the wrong NODE are different questions; a single list could only
     * answer them the same way, and answered the second one wrongly.
     */
    expect(plain.candidate?.category).toBe('');
  });

  it('still prefers a specific type when the page offers one', () => {
    const both = parseWebsitePage(
      '<html><head><title>Duchess</title>'
      + '<script type="application/ld+json">'
      + JSON.stringify([
        { '@type': 'WebSite', name: 'Duchess Site' },
        { '@type': 'Organization', name: 'Duchess Group' },
        { '@type': 'Hotel', name: 'Duchess Hotel', telephone: '+234 802 111 2222' },
      ])
      + '</script></head><body></body></html>',
      'https://duchess.example/',
    );
    expect(both.candidate?.name).toBe('Duchess Hotel');
    expect(both.candidate?.category).toBe('Hotel');
  });

  it('never mistakes page furniture for the business', () => {
    const furniture = parseWebsitePage(
      '<html><head><title>Shop</title>'
      + '<script type="application/ld+json">'
      + JSON.stringify([
        { '@type': 'BreadcrumbList', name: 'Home > Shop' },
        { '@type': 'SearchAction', name: 'Search' },
      ])
      + '</script></head><body></body></html>',
      'https://furniture.example/',
    );
    // No business node at all, so nothing is claimed about a business.
    expect(furniture.candidate).toBeNull();
  });
});

describe('an email is never a filename', () => {
  /**
   * MEASURED ON PRODUCTION, 2026-09-15. Reading bellanaija.com through the
   * manual extractor reported the business's email address as:
   *
   *     logo-word-black@2x.png
   *
   * `@2x` is the retina-image naming convention and `.png` satisfies "a dot
   * followed by two or more letters", so the last-resort scan of raw HTML —
   * which runs only when a page publishes no mailto: and no structured email —
   * reached for the first thing with an @ in it and found a filename.
   *
   * A wrong email is the contact field an operator is least likely to
   * sanity-check, and a profile publishing a filename as a business's address
   * is visibly fabricated. The rule this tool exists to keep is that nothing
   * may invent a contact detail.
   */
  it('rejects the exact string that shipped', () => {
    expect(plausibleEmail('logo-word-black@2x.png')).toBeNull();
  });

  it('rejects the rest of the asset-filename family', () => {
    for (const s of [
      'sprite@3x.jpg', 'hero@2x.webp', 'icon@2x.svg', 'bg@2x.gif',
      'font@2x.woff2', 'video@2x.mp4', 'style@2x.css', 'bundle@2x.js',
    ]) {
      expect(plausibleEmail(s), s).toBeNull();
    }
  });

  it('still reads a real address', () => {
    expect(plausibleEmail('reservation@lagosoriental.com')).toBe('reservation@lagosoriental.com');
    expect(plausibleEmail('mailto:Hello@MamaPut.NG')).toBe('hello@mamaput.ng');
    expect(plausibleEmail('write to info@shop.co.za today')).toBe('info@shop.co.za');
  });

  it('finds nothing rather than something, when unsure', () => {
    // An absent field is honest. A wrong one is not.
    for (const s of ['', null, undefined, 'no email here', '@', 'a@b']) {
      expect(plausibleEmail(s), String(s)).toBeNull();
    }
  });

  it('refuses a numeric TLD', () => {
    expect(plausibleEmail('build@123.456')).toBeNull();
  });

  it('does not take a filename out of a whole page', () => {
    const page = '<html><head><title>Shop</title></head><body>'
      + '<img src="/assets/logo-word-black@2x.png">'
      + '<p>Call +234 802 111 2222</p>'
      + '</body></html>';
    const parsed = parseWebsitePage(page, 'https://shop.example/');
    expect(parsed.candidate?.email ?? null).toBeNull();
  });

  it('still takes a real address out of a whole page', () => {
    const page = '<html><head><title>Shop</title></head><body>'
      + '<img src="/assets/logo@2x.png">'
      + '<p>Write to hello@shop.example</p>'
      + '</body></html>';
    const parsed = parseWebsitePage(page, 'https://shop.example/');
    expect(parsed.candidate?.email).toBe('hello@shop.example');
  });
});

describe('phone numbers, from everywhere schema.org puts them', () => {
  /**
   * THE GAP THIS CLOSES: the parser read `node.telephone` and nothing else.
   *
   * schema.org's usual home for a business number on an `Organization` is
   * `contactPoint` — jumia.com.ng's own markup is exactly that shape — so a
   * page could publish its switchboard, its sales line and its support line in
   * machine-readable form and the extractor reported no phone at all.
   */
  const ldPage = (ld: unknown, body = '') =>
    '<html><head><title>Test Ltd</title><script type="application/ld+json">'
    + JSON.stringify(ld) + '</script></head><body>' + body + '</body></html>';

  it('reads a number from contactPoint, not only from telephone', () => {
    const parsed = parseWebsitePage(
      ldPage({
        '@type': 'Organization',
        name: 'Jumia Nigeria',
        contactPoint: [
          { '@type': 'ContactPoint', contactType: 'customer service', telephone: '+234 700 600 0000' },
        ],
      }),
      'https://shop.example/',
    );
    expect(parsed.candidate?.phone).toBe('+2347006000000');
  });

  it('reads a single contactPoint object as well as an array', () => {
    const parsed = parseWebsitePage(
      ldPage({
        '@type': 'Organization',
        name: 'One Point Ltd',
        contactPoint: { '@type': 'ContactPoint', telephone: '+234 802 111 2222' },
      }),
      'https://one.example/',
    );
    expect(parsed.candidate?.phone).toBe('+2348021112222');
  });

  it('reads a number from a nested location node', () => {
    const parsed = parseWebsitePage(
      ldPage({
        '@type': 'Organization',
        name: 'Branchy Ltd',
        location: { '@type': 'LocalBusiness', telephone: '+234 803 444 5555' },
      }),
      'https://branchy.example/',
    );
    expect(parsed.candidate?.phone).toBe('+2348034445555');
  });

  it('keeps every distinct number, not just the first', () => {
    /*
     * The candidate row holds one, because businesses.phone is one column. A
     * business publishing a switchboard, a sales line and a WhatsApp number has
     * published three facts, and discarding two of them silently is a choice
     * nobody made on purpose.
     */
    const parsed = parseWebsitePage(
      ldPage(
        {
          '@type': 'LocalBusiness',
          name: 'Many Lines Ltd',
          telephone: '+234 802 111 2222',
          contactPoint: [
            { '@type': 'ContactPoint', contactType: 'sales', telephone: '+234 803 444 5555' },
            { '@type': 'ContactPoint', contactType: 'support', telephone: '+234 805 777 8888' },
          ],
        },
        '<a href="tel:+2348099998888">Call</a><a href="https://wa.me/2348011112222">WhatsApp</a>',
      ),
      'https://many.example/',
    );
    expect(parsed.details.facts.phones).toEqual([
      '+2348021112222', '+2348034445555', '+2348057778888',
      '+2348099998888', '+2348011112222',
    ]);
    // The structured one still wins for the row itself.
    expect(parsed.candidate?.phone).toBe('+2348021112222');
  });

  it('deduplicates the same number written two ways', () => {
    const parsed = parseWebsitePage(
      ldPage(
        { '@type': 'LocalBusiness', name: 'Dupe Ltd', telephone: '+234 802 111 2222' },
        '<a href="tel:+2348021112222">Call us</a>',
      ),
      'https://dupe.example/',
    );
    expect(parsed.details.facts.phones).toEqual(['+2348021112222']);
  });

  it('caps the list rather than harvesting a directory page', () => {
    const parsed = parseWebsitePage(
      ldPage({
        '@type': 'Organization',
        name: 'Big Directory',
        contactPoint: Array.from({ length: 30 }, (_, i) => ({
          '@type': 'ContactPoint',
          telephone: '+23480' + String(10000000 + i),
        })),
      }),
      'https://big.example/',
    );
    expect(parsed.details.facts.phones.length).toBeLessThanOrEqual(6);
  });

  it('records nothing when the page publishes no number', () => {
    const parsed = parseWebsitePage(
      ldPage({ '@type': 'LocalBusiness', name: 'Quiet Ltd', email: 'hi@quiet.example' }),
      'https://quiet.example/',
    );
    expect(parsed.details.facts.phones).toEqual([]);
    expect(parsed.candidate?.phone ?? null).toBeNull();
  });

  it('lists a number found only in the page text, so the panel matches the row', () => {
    /*
     * allPhones() reads structured data, tel: and wa.me links. firstPhone()
     * also scans the page text as a last resort — so a site printing its number
     * as prose produced a candidate phone that the facts list never contained,
     * and the UI showed a phone on one row while the panel beside it said the
     * page published none.
     */
    const prose = '<html><head><title>Prose Ltd</title></head><body>'
      + '<p>Call us on +234 201 280 6600 any weekday.</p>'
      + '</body></html>';
    const parsed = parseWebsitePage(prose, 'https://prose.example/');
    expect(parsed.candidate?.phone).toBe('+2342012806600');
    expect(parsed.details.facts.phones).toContain('+2342012806600');
  });

  it('puts the chosen number first and does not repeat it', () => {
    const page = '<html><head><title>Order Ltd</title>'
      + '<script type="application/ld+json">'
      + JSON.stringify({ '@type': 'LocalBusiness', name: 'Order Ltd', telephone: '+234 802 111 2222' })
      + '</script></head><body><a href="tel:+2348034445555">Other</a></body></html>';
    const parsed = parseWebsitePage(page, 'https://order.example/');
    expect(parsed.details.facts.phones[0]).toBe('+2348021112222');
    expect(new Set(parsed.details.facts.phones).size).toBe(parsed.details.facts.phones.length);
  });

  it('ignores a string that cannot be a real number', () => {
    // normalizePhone is the gate; this records that junk does not slip past it.
    const parsed = parseWebsitePage(
      ldPage({ '@type': 'LocalBusiness', name: 'Junk Ltd', telephone: 'call us!' },
        '<a href="mailto:hi@junk.example">mail</a>'),
      'https://junk.example/',
    );
    expect(parsed.details.facts.phones).toEqual([]);
  });
});

describe('an article is not the business that published it', () => {
  /**
   * MEASURED 2026-09-15 on a page shaped like techcabal.com — a NewsArticle
   * node followed by the publisher's own Organization node:
   *
   *   name     "A story about shops"     <- the article headline
   *   category "News Article"
   *
   * businessNode() returned the first node whose @type was not on the exclusion
   * list, and NewsArticle was not on it, so the ARTICLE was taken for the
   * business and the real Organization two lines below was ignored. Any
   * business site with a blog — which is most of them — could file its latest
   * post as a business.
   *
   * Wrong about the name for as long as the parser existed; it started to
   * matter more the day `category` began reaching the database.
   */
  const withArticle = (extra: Record<string, unknown> = {}) =>
    '<html><head><title>Story</title><script type="application/ld+json">'
    + JSON.stringify([
      { '@type': 'NewsArticle', headline: 'A story', name: 'A story about shops' },
      { '@type': 'Organization', name: 'TechCabal', telephone: '+234 802 111 2222', ...extra },
    ])
    + '</script></head><body></body></html>';

  it('takes the publisher, not the headline', () => {
    const p = parseWebsitePage(withArticle(), 'https://news.example/story');
    expect(p.candidate?.name).toBe('TechCabal');
    expect(p.candidate?.category).toBe('');
  });

  it('never files a content type as a category', () => {
    for (const t of ['NewsArticle', 'BlogPosting', 'Article', 'Review', 'Recipe', 'Event', 'JobPosting']) {
      const page = '<html><head><title>X</title><script type="application/ld+json">'
        + JSON.stringify([
          { '@type': t, name: 'Some content' },
          { '@type': 'LocalBusiness', name: 'Real Business Ltd', telephone: '+234 802 111 2222' },
        ])
        + '</script></head><body></body></html>';
      const p = parseWebsitePage(page, 'https://x.example/');
      expect(p.candidate?.name, t).toBe('Real Business Ltd');
      expect(p.candidate?.category, t).toBe('');
    }
  });

  it('is not fooled by a sub-object lifted out of the business node', () => {
    /*
     * flattenNodes() raises nested nodes to the top level, so a PostalAddress
     * or ContactPoint inside a Hotel arrives looking like a sibling candidate.
     */
    const page = '<html><head><title>H</title><script type="application/ld+json">'
      + JSON.stringify([
        { '@type': 'PostalAddress', name: 'Head office', streetAddress: '1 Road' },
        { '@type': 'ContactPoint', name: 'Customer service', telephone: '+234 700 000 0000' },
        { '@type': 'Hotel', name: 'Duchess Hotel', telephone: '+234 802 111 2222' },
      ])
      + '</script></head><body></body></html>';
    const p = parseWebsitePage(page, 'https://duchess.example/');
    expect(p.candidate?.name).toBe('Duchess Hotel');
    expect(p.candidate?.category).toBe('Hotel');
  });

  it('still reads a real specific business type', () => {
    // The exclusions must not swallow the thing they exist to reveal.
    for (const [t, expected] of [['Hotel', 'Hotel'], ['Restaurant', 'Restaurant'],
      ['Dentist', 'Dentist'], ['HardwareStore', 'Hardware Store']] as const) {
      const page = '<html><head><title>X</title><script type="application/ld+json">'
        + JSON.stringify({ '@type': t, name: 'A Business', telephone: '+234 802 111 2222' })
        + '</script></head><body></body></html>';
      expect(parseWebsitePage(page, 'https://x.example/').candidate?.category, t).toBe(expected);
    }
  });
});

describe('HTML entities never reach a business name', () => {
  /**
   * MEASURED IN PRODUCTION, 2026-09-15 — two rows the manual extractor filed
   * from real Nigerian business sites:
   *
   *   name         "Indomie &#8211; Instant Noodles"
   *   description  "Branding &amp; Web Design Agency that specializes in..."
   *
   * `<title>` and `<meta content="...">` are HTML, so an ampersand or a dash
   * arrives encoded. Nothing decoded them — and these fields become the NAME
   * and DESCRIPTION on a published profile, so a real company would have
   * appeared in the directory, and in the sitemap, called
   * "Indomie &#8211; Instant Noodles".
   *
   * JSON-LD never needed this: it is JSON and JSON.parse has already decoded
   * it. The fault was on the fallback path — the one that runs for the many
   * sites carrying no structured data at all, which is most of them.
   */
  it('decodes the exact strings that shipped', () => {
    expect(decodeEntities('Indomie &#8211; Instant Noodles')).toBe('Indomie – Instant Noodles');
    expect(decodeEntities('Branding &amp; Web Design Agency')).toBe('Branding & Web Design Agency');
  });

  it('handles named, decimal and hex forms', () => {
    expect(decodeEntities('Fish &amp; Chips')).toBe('Fish & Chips');
    expect(decodeEntities('Caf&eacute; Neo')).toBe('Café Neo');
    expect(decodeEntities('A &#8212; B')).toBe('A — B');
    expect(decodeEntities('A &#x2014; B')).toBe('A — B');
    expect(decodeEntities('Mama&#39;s Kitchen')).toBe("Mama's Kitchen");
    expect(decodeEntities('Ade&rsquo;s Place')).toBe('Ade’s Place');
  });

  it('leaves an unknown entity alone rather than mangling it', () => {
    // Silently deleting something unrecognised would be worse than showing it.
    expect(decodeEntities('A &notarealentity; B')).toBe('A &notarealentity; B');
    expect(decodeEntities('50% off &')).toBe('50% off &');
  });

  it('does not double-decode', () => {
    /*
     * A page that literally wrote "&amp;#8211;" meant to show "&#8211;". Named
     * entities are resolved last so the numeric pass cannot eat the result of
     * the named one.
     */
    expect(decodeEntities('&amp;#8211;')).toBe('&#8211;');
  });

  it('rejects an out-of-range code point instead of throwing', () => {
    // String.fromCodePoint throws above 0x10FFFF; the page keeps its text.
    expect(decodeEntities('&#99999999;')).toBe('&#99999999;');
    expect(decodeEntities('&#0;')).toBe('&#0;');
  });

  it('cleans the name a page publishes in its title', () => {
    const page = '<html><head><title>Indomie &#8211; Instant Noodles</title>'
      + '<meta name="description" content="Noodles &amp; more.">'
      + '</head><body><a href="mailto:hi@indomie.example">mail</a></body></html>';
    const p = parseWebsitePage(page, 'https://indomie.example/');
    // The title splits at the dash, as it does for a literal one.
    expect(p.candidate?.name).toBe('Indomie');
    expect(p.candidate?.description).toBe('Noodles & more.');
  });

  it('cleans an og:title too', () => {
    const page = '<html><head><title>x</title>'
      + '<meta property="og:site_name" content="Fish &amp; Chips Co">'
      + '<meta property="og:description" content="Caf&eacute; by the sea">'
      + '</head><body><a href="tel:+2348021112222">Call</a></body></html>';
    const p = parseWebsitePage(page, 'https://fish.example/');
    expect(p.candidate?.name).toBe('Fish & Chips Co');
    expect(p.candidate?.description).toBe('Café by the sea');
  });
});

/**
 * Gallery imagery, and the line it must not cross.
 *
 * MEASURED 2026-09-17: not one of the 3,139 unclaimed businesses had a single
 * gallery row, while 3,000 of them showed a stock photograph as their cover.
 * The cheap fix would have been to fill galleries from the same stock pool.
 *
 * That is the one thing this platform has ruled out in writing. A cover reads
 * as a card illustration; a GALLERY reads as "pictures of this place", and
 * four stock interiors under a real clinic's name is a claim about premises
 * nobody photographed.
 *
 * So the only source is what the business declared about ITSELF, in the field
 * whose defined meaning is "an image of this thing". These tests pin that
 * boundary, because the failure mode is silent: nothing errors when a parser
 * starts returning a site's banner furniture, it just quietly becomes a
 * gallery.
 */
describe('galleryUrls', () => {
  const site = 'https://duchess.example/';

  it('keeps every picture a business declared of itself, not just the first', () => {
    const html = page(`
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Hotel","name":"Duchess Hotel",
       "image":["https://duchess.example/a.jpg","https://duchess.example/b.jpg","https://duchess.example/c.jpg"]}
      </script>`);
    const r = parseWebsitePage(html, site);
    // The first becomes the cover; the gallery is what the old parser threw away.
    expect(r.details.owned.coverImageUrl).toBe('https://duchess.example/a.jpg');
    expect(r.details.owned.galleryUrls).toEqual([
      'https://duchess.example/b.jpg',
      'https://duchess.example/c.jpg',
    ]);
  });

  it('never repeats the cover or the logo inside the gallery', () => {
    const html = page(`
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Hotel","name":"Duchess Hotel",
       "logo":"https://duchess.example/brand.png",
       "image":["https://duchess.example/a.jpg","https://duchess.example/a.jpg","https://duchess.example/brand.png"]}
      </script>
      <meta property="og:image" content="https://duchess.example/a.jpg">`);
    const r = parseWebsitePage(html, site);
    expect(r.details.owned.galleryUrls).toEqual([]);
  });

  it('is empty when the business declared one picture', () => {
    // The normal case, and an empty gallery is the correct answer for it.
    const html = page(`
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Hotel","name":"Duchess Hotel",
       "image":"https://duchess.example/only.jpg"}
      </script>`);
    expect(parseWebsitePage(html, site).details.owned.galleryUrls).toEqual([]);
  });

  it('drops furniture that is technically an image', () => {
    const html = page(`
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Hotel","name":"Duchess Hotel",
       "image":["https://duchess.example/real.jpg","https://duchess.example/sprite-nav.png",
                "https://duchess.example/favicon-32.png","https://duchess.example/tracking-pixel.gif",
                "https://duchess.example/room.jpg"]}
      </script>`);
    const r = parseWebsitePage(html, site);
    expect(r.details.owned.galleryUrls).toEqual(['https://duchess.example/room.jpg']);
  });

  it('resolves relative paths against the page it read', () => {
    const html = page(`
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Hotel","name":"Duchess Hotel",
       "image":["/a.jpg","/rooms/b.jpg"]}
      </script>`);
    expect(parseWebsitePage(html, site).details.owned.galleryUrls)
      .toEqual(['https://duchess.example/rooms/b.jpg']);
  });

  it('never mirrors a whole website', () => {
    const many = Array.from({ length: 30 }, (_, i) => `"https://duchess.example/p${i}.jpg"`).join(',');
    const html = page(`
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Hotel","name":"Duchess Hotel","image":[${many}]}
      </script>`);
    expect(parseWebsitePage(html, site).details.owned.galleryUrls.length).toBe(8);
  });

  it('never treats a social-share card as a photograph', () => {
    /*
     * REGRESSION, measured on the first live batch, 2026-09-17. og:image fed
     * the gallery and produced exactly two rows across 55 businesses:
     *
     *   Momentum   .../images/share-image-default.jpg
     *   Jobberman  https://www.jobberman.com/ogImage
     *
     * Neither pictures anything. They are link-preview cards — a logo on a
     * colour — and one says "default" in its own filename. As a cover that is
     * correct and intended. In a gallery it is an invented photograph of
     * premises.
     *
     * Two defences, and this pins both: og:image no longer feeds the gallery
     * at all, and a share card that a site also lists in schema.org `image` is
     * filtered by name.
     */
    const html = page(`
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Hotel","name":"Duchess Hotel",
       "image":["https://duchess.example/lobby.jpg","https://duchess.example/images/share-image-default.jpg",
                "https://duchess.example/ogImage","https://duchess.example/social-card.png"]}
      </script>
      <meta property="og:image" content="https://duchess.example/og-preview.jpg">
      <meta name="twitter:image" content="https://duchess.example/twitter-card.jpg">`);
    const r = parseWebsitePage(html, site);
    // The cover may still be a share card. A gallery may not.
    expect(r.details.owned.galleryUrls).toEqual([]);
  });

  it('takes no gallery from og:image even when nothing else is declared', () => {
    const html = page(`
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Hotel","name":"Duchess Hotel"}
      </script>
      <meta property="og:image" content="https://duchess.example/a-real-photo.jpg">
      <meta name="twitter:image" content="https://duchess.example/another.jpg">`);
    const r = parseWebsitePage(html, site);
    expect(r.details.owned.coverImageUrl).toBe('https://duchess.example/a-real-photo.jpg');
    expect(r.details.owned.galleryUrls).toEqual([]);
  });

  it('reads NOTHING from img tags, however many the page has', () => {
    /*
     * THE BOUNDARY. A page's <img> elements are its stock banners, its
     * clients' logos and whatever its theme shipped with. Scraping those and
     * calling the result a gallery is the misleading-gallery failure itself,
     * so the parser must not see them at all.
     */
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Hotel","name":"Duchess Hotel"}
      </script></head><body>
      <img src="https://duchess.example/banner1.jpg">
      <img src="https://duchess.example/banner2.jpg">
      <img src="https://stock.example/generic-hotel.jpg">
      </body></html>`;
    expect(parseWebsitePage(html, site).details.owned.galleryUrls).toEqual([]);
  });
});
