import { describe, it, expect } from 'vitest';
import {
  CATEGORY_TEMPLATES, UNIVERSAL_FORBIDDEN_CLAIMS, TEMPLATED_INDUSTRIES, CATEGORY_ALIASES,
  DELIBERATELY_UNMAPPED,
  templateFor, industryForCategory, forbiddenClaimsFor, findForbiddenClaim,
} from './categoryTemplates';
import { INDUSTRIES } from './industrySystems';
import { BUSINESS_CATEGORIES } from './categories';

describe('industryForCategory', () => {
  it('resolves a real category to its industry', () => {
    expect(industryForCategory('Restaurant')).toBe('restaurants');
  });

  it('is case-insensitive and ignores surrounding space', () => {
    expect(industryForCategory('  restaurant  ')).toBe('restaurants');
  });

  it('returns null for something that is not a category', () => {
    expect(industryForCategory('Not A Category')).toBeNull();
    expect(industryForCategory('')).toBeNull();
    expect(industryForCategory(null)).toBeNull();
  });

  it('is deterministic for a category in more than one industry', () => {
    // 19 categories appear twice. Whatever it answers, it must answer the same
    // thing every time, or two runs produce different suggestions.
    const multi = 'Café & Bakery';
    const first = industryForCategory(multi);
    expect(first).toBeTruthy();
    for (let i = 0; i < 5; i += 1) expect(industryForCategory(multi)).toBe(first);
  });
});

describe('templateFor', () => {
  it('returns a vocabulary for a templated category', () => {
    const t = templateFor('Restaurant');
    expect(t?.industry).toBe('restaurants');
    expect(t!.services.length).toBeGreaterThan(4);
  });

  it('returns NULL rather than filler for an untemplated industry', () => {
    /*
     * The important one. An industry nobody has written a vocabulary for must
     * produce nothing — "Services: consultation, support, enquiries" under a
     * real business name is filler pretending to be information.
     */
    const untemplated = INDUSTRIES.find((i) => !TEMPLATED_INDUSTRIES.includes(i.slug));
    expect(untemplated, 'every industry is templated — update this test').toBeTruthy();
    expect(templateFor(untemplated!.categories[0])).toBeNull();
  });

  it('returns null for an unknown category', () => {
    expect(templateFor('Interdimensional Plumbing')).toBeNull();
  });
});

describe('the templates themselves', () => {
  it('name a real industry', () => {
    const slugs = new Set(INDUSTRIES.map((i) => i.slug));
    for (const t of CATEGORY_TEMPLATES) {
      expect(slugs.has(t.industry), `${t.industry} is not an industry`).toBe(true);
    }
  });

  it('are one per industry', () => {
    expect(new Set(TEMPLATED_INDUSTRIES).size).toBe(CATEGORY_TEMPLATES.length);
  });

  it('every template has thought about what it must not say', () => {
    // An empty forbidden list is a template nobody reviewed.
    for (const t of CATEGORY_TEMPLATES) {
      expect(t.forbiddenClaims.length, `${t.industry} forbids nothing`).toBeGreaterThan(0);
    }
  });

  it('never suggests a service that its own rules forbid', () => {
    /*
     * The self-consistency check. A template that suggests "Certified repairs"
     * while forbidding "certified" would emit content its own guard rejects —
     * and the guard runs after generation, so the bug would surface as silently
     * empty output rather than an error.
     */
    for (const t of CATEGORY_TEMPLATES) {
      for (const s of [...t.services, ...t.products]) {
        const hit = findForbiddenClaim(s, t.services.length ? undefined : undefined);
        expect(hit, `${t.industry}: "${s}" trips the universal list on "${hit}"`).toBeNull();
      }
    }
  });

  it('never suggests something its own industry forbids', () => {
    for (const t of CATEGORY_TEMPLATES) {
      const own = t.forbiddenClaims.map((c) => c.toLowerCase());
      for (const s of [...t.services, ...t.products]) {
        const hit = own.find((c) => s.toLowerCase().includes(c));
        expect(hit, `${t.industry}: suggests "${s}" but forbids "${hit}"`).toBeUndefined();
      }
    }
  });

  it('answers every FAQ by pointing at the business, never by claiming', () => {
    /*
     * No templated answer may assert anything. "Yes, we offer parking" is a
     * claim NowOpen is in no position to make on somebody else's behalf.
     */
    for (const t of CATEGORY_TEMPLATES) {
      for (const f of t.faqs) {
        expect(f.question.endsWith('?'), `${t.industry}: "${f.question}" is not a question`).toBe(true);
        expect(
          /contact|ask the|use the contact/i.test(f.answer),
          `${t.industry}: "${f.answer}" does not defer to the business`,
        ).toBe(true);
        expect(/^yes\b|^no\b/i.test(f.answer.trim()), `${t.industry}: answer asserts`).toBe(false);
      }
    }
  });

  it('gives the sensitive industries more to be careful about', () => {
    // Hospitals and schools are ~70% of the directory and the categories where
    // a wrong suggestion does real harm.
    const median = 6;
    for (const slug of ['hospitals', 'schools', 'lawyers']) {
      const t = CATEGORY_TEMPLATES.find((x) => x.industry === slug);
      expect(t, `${slug} has no template`).toBeTruthy();
      expect(t!.forbiddenClaims.length, `${slug} is under-guarded`).toBeGreaterThan(median);
    }
  });

  it('suggests no products for industries that sell none', () => {
    // A hospital does not have a product catalogue. An empty list is correct.
    expect(CATEGORY_TEMPLATES.find((t) => t.industry === 'hospitals')!.products).toEqual([]);
    expect(CATEGORY_TEMPLATES.find((t) => t.industry === 'lawyers')!.products).toEqual([]);
  });

  it('declares a schema.org type for each', () => {
    for (const t of CATEGORY_TEMPLATES) {
      expect(t.schemaType).toMatch(/^[A-Z][A-Za-z]+$/);
    }
  });
});

describe('findForbiddenClaim', () => {
  it('catches a universal claim in any category', () => {
    expect(findForbiddenClaim('Award-winning service', 'Restaurant')).toBeTruthy();
    expect(findForbiddenClaim('20 years of experience', 'Fashion & Apparel')).toBeTruthy();
  });

  it('catches an industry-specific claim', () => {
    expect(findForbiddenClaim('Laser hair removal', 'Spa & Beauty')).toBeTruthy();
  });

  it('is case-insensitive', () => {
    expect(findForbiddenClaim('AWARD-WINNING', 'Restaurant')).toBeTruthy();
  });

  it('passes ordinary text', () => {
    expect(findForbiddenClaim('Hair styling', 'Spa & Beauty')).toBeNull();
    expect(findForbiddenClaim('Table reservations', 'Restaurant')).toBeNull();
  });

  it('says nothing about empty text', () => {
    expect(findForbiddenClaim('', 'Restaurant')).toBeNull();
    expect(findForbiddenClaim(null, 'Restaurant')).toBeNull();
  });

  it('still applies the universal list to an unknown category', () => {
    // No template must never mean no guard.
    expect(findForbiddenClaim('Award-winning', 'Interdimensional Plumbing')).toBeTruthy();
    expect(forbiddenClaimsFor('Interdimensional Plumbing')).toEqual([...UNIVERSAL_FORBIDDEN_CLAIMS]);
  });
});

describe('coverage', () => {
  it('every business category resolves to an industry', () => {
    const uncovered = BUSINESS_CATEGORIES.filter((c) => !industryForCategory(c));
    expect(uncovered, `uncovered: ${uncovered.slice(0, 5).join(', ')}`).toEqual([]);
  });

  it('covers the categories the directory is actually made of', () => {
    // MEASURED: 1,621 Hospital & Clinic and 524 Schools & Training listings.
    for (const cat of ['Hospital & Clinic', 'Schools & Training']) {
      expect(templateFor(cat), `${cat} has no template`).toBeTruthy();
    }
  });
});

describe('category aliases', () => {
  it('recognises the names the live data actually uses', () => {
    /*
     * MEASURED: 533 "Schools & Training", 190 "Professional Services" and 41
     * "Health & Medical" listings carry category names the app never defined.
     * Without the alias they resolve to no industry at all.
     */
    expect(industryForCategory('Schools & Training')).toBe('schools');
    expect(industryForCategory('Health & Medical')).toBe('hospitals');
    expect(industryForCategory('Banking & Finance')).toBe('finance');
  });

  it('refuses to guess an industry for a grab-bag category', () => {
    /*
     * REGRESSION, 2026-09-17. 'professional services' was aliased to
     * `service-providers`, which is plumbers, electricians, cleaners and
     * locksmiths. It was harmless only because that industry had no template;
     * the moment one was written, 143 listings would have been handed a
     * plumber's vocabulary.
     *
     * MEASURED sample of those listings: BUA Cement, University Publishing
     * Company Ltd., Legit.ng, 4TEES RENTALS & BALLOONS NIGERIA LIMITED,
     * Zaacoal, Anti-Corruption Research Center, Phillips Consulting. A cement
     * maker, a publisher, a news site, a balloon hire firm, a charcoal
     * producer, a research centre and a consultancy.
     *
     * Null is the correct answer for all of them, and this test exists so the
     * next person who finds the gap fills it with a re-categorisation rather
     * than another alias.
     */
    for (const name of Object.keys(DELIBERATELY_UNMAPPED)) {
      expect(industryForCategory(name), `${name} resolved to an industry`).toBeNull();
      expect(templateFor(name), `${name} got a vocabulary`).toBeNull();
    }
  });

  it('records WHY each unmapped name is unmapped', () => {
    // A bare list would decay into "we never got round to it". Each entry has
    // to say what goes wrong if somebody maps it.
    for (const [name, reason] of Object.entries(DELIBERATELY_UNMAPPED)) {
      expect(reason.length, `${name} has no reason recorded`).toBeGreaterThan(40);
    }
  });

  it('never has a name in both the alias map and the unmapped list', () => {
    for (const name of Object.keys(DELIBERATELY_UNMAPPED)) {
      expect(CATEGORY_ALIASES[name], `${name} is both aliased and unmapped`).toBeUndefined();
    }
  });

  it('gives the two biggest imported categories a template', () => {
    expect(templateFor('Hospital & Clinic')?.industry).toBe('hospitals');
    expect(templateFor('Schools & Training')?.industry).toBe('schools');
  });

  it('refuses to guess an ambiguous one', () => {
    // "Arts & Culture" covers galleries, museums, performers and cultural
    // centres. Picking one would suggest gallery services to a dance troupe.
    expect(industryForCategory('Arts & Culture')).toBeNull();
    expect(templateFor('Arts & Culture')).toBeNull();
  });

  it('never lets an alias override a real category', () => {
    for (const [alias] of Object.entries(CATEGORY_ALIASES)) {
      const real = BUSINESS_CATEGORIES.find((c) => c.toLowerCase() === alias);
      expect(real, `"${alias}" is a real category and should not be aliased`).toBeUndefined();
    }
  });

  it('only aliases to industries that exist', () => {
    const slugs = new Set(INDUSTRIES.map((i) => i.slug));
    for (const target of Object.values(CATEGORY_ALIASES)) {
      expect(slugs.has(target), `alias target ${target} is not an industry`).toBe(true);
    }
  });
});
