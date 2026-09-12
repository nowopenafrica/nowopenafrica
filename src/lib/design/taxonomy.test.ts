import { describe, it, expect } from 'vitest';

import { DESIGN_TEMPLATES } from '../designTemplates';
import { DESIGN_STYLES } from './styles';
import {
  INDUSTRY_GROUPS, STYLE_TAGS, TEMPLATE_USES, diversify, findTemplates,
  industryGroupFor, libraryDepth, templateCounts, usedStyleTags,
} from './taxonomy';

describe('every template says what it is for', () => {
  it('carries a use, so it can be filtered', () => {
    const uses = new Set(TEMPLATE_USES.map((u) => u.key));
    for (const tpl of DESIGN_TEMPLATES) {
      expect(tpl.use, `${tpl.key} has no use`).toBeTruthy();
      expect(uses.has(tpl.use!), `${tpl.key} -> ${tpl.use}`).toBe(true);
    }
  });

  it('only ever names a REAL NowOpen industry group', () => {
    // The single rule that keeps this from becoming a second taxonomy. A tag of
    // "Restaurants" would filter to nothing while looking perfectly sensible in
    // the source.
    for (const tpl of DESIGN_TEMPLATES) {
      for (const industry of tpl.industries ?? []) {
        expect(INDUSTRY_GROUPS, `${tpl.key} -> ${industry}`).toContain(industry);
      }
    }
  });

  it('only ever names a real style tag', () => {
    for (const tpl of DESIGN_TEMPLATES) {
      for (const tag of tpl.styles ?? []) {
        expect(STYLE_TAGS, `${tpl.key} -> ${tag}`).toContain(tag);
      }
    }
  });

  it('carries enough search words to be findable', () => {
    // A template with one tag is a template that answers one query.
    for (const tpl of DESIGN_TEMPLATES) {
      expect((tpl.tags ?? []).length, `${tpl.key}`).toBeGreaterThanOrEqual(3);
      expect((tpl.styles ?? []).length, `${tpl.key}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('gives every use at least one template', () => {
    // A filter that returns nothing is worse than a filter that is absent: it
    // tells the customer the library has nothing for them.
    const counts = templateCounts('use', TEMPLATE_USES.map((u) => u.key));
    for (const [use, n] of Object.entries(counts)) {
      expect(n, `use ${use} is empty`).toBeGreaterThan(0);
    }
  });

  it('gives every industry group something to show', () => {
    const counts = templateCounts('industry', INDUSTRY_GROUPS);
    for (const [industry, n] of Object.entries(counts)) {
      expect(n, `${industry} is empty`).toBeGreaterThan(0);
    }
  });
});

describe('search', () => {
  it('finds the obvious thing by its own words', () => {
    const cases: [string, string][] = [
      ['menu price list', 'price-list'],
      ['we are hiring', 'vacancy'],
      ['house for sale', 'property-listing'],
      ['opening hours', 'opening-hours'],
      ['certificate of completion', 'certificate'],
      ['before and after', 'before-after'],
      ['company profile', 'company-profile'],
      ['new arrivals', 'product-grid'],
      ['event lineup', 'event-lineup'],
      ['customer review', 'testimonial-card'],
    ];
    for (const [query, expected] of cases) {
      const keys = findTemplates(query).map((t) => t.key);
      expect(keys, `"${query}"`).toContain(expected);
    }
  });

  it('ranks a label match above a tag match', () => {
    const keys = findTemplates('flash sale').map((t) => t.key);
    expect(keys[0]).toBe('flash-sale');
  });

  it('requires every word to match, rather than any of them', () => {
    // An OR search on four words returns most of the library and calls it a
    // result. Returning nothing and letting somebody drop a word is honest.
    expect(findTemplates('certificate billboard forklift')).toHaveLength(0);
  });

  it('ignores the words nobody means', () => {
    // "I need a template for my restaurant menu" must not be defeated by
    // "need", "template", "for" and "my".
    const plain = findTemplates('menu').map((t) => t.key);
    const chatty = findTemplates('I need a design template for my menu').map((t) => t.key);
    expect(chatty).toEqual(plain);
  });

  it('returns everything for an empty query', () => {
    expect(findTemplates('')).toHaveLength(DESIGN_TEMPLATES.length);
    expect(findTemplates('   ')).toHaveLength(DESIGN_TEMPLATES.length);
  });

  it('is deterministic and stable', () => {
    const a = findTemplates('sale offer').map((t) => t.key);
    const b = findTemplates('sale offer').map((t) => t.key);
    expect(a).toEqual(b);
  });

  it('combines a phrase with filters', () => {
    const results = findTemplates('sale', { use: 'marketing' });
    expect(results.length).toBeGreaterThan(0);
    for (const tpl of results) expect(tpl.use, tpl.key).toBe('marketing');
  });

  it('keeps a general-purpose layout visible when an industry is picked', () => {
    // An untagged industry list means "suits anything". Dropping those the
    // moment somebody picks a trade would hide the best layouts we have.
    const general = DESIGN_TEMPLATES.filter((t) => !t.industries?.length);
    expect(general.length).toBeGreaterThan(0);
    const keys = findTemplates('', { industry: INDUSTRY_GROUPS[0] }).map((t) => t.key);
    for (const tpl of general) expect(keys, tpl.key).toContain(tpl.key);
  });

  it('never invents a result', () => {
    for (const tpl of findTemplates('luxury restaurant weekend promotion')) {
      expect(DESIGN_TEMPLATES).toContain(tpl);
    }
  });
});

describe('the library, counted honestly', () => {
  it('reports depth as layouts times styles rather than a written number', () => {
    expect(libraryDepth()).toBe(DESIGN_TEMPLATES.length * DESIGN_STYLES.length);
  });

  it('has grown past the archetypes it was missing', () => {
    for (const key of [
      'property-listing', 'before-after', 'opening-hours', 'vacancy',
      'pull-quote', 'team-intro', 'product-grid', 'order-delivery',
      'certificate', 'company-profile', 'event-lineup', 'swiss-grid',
    ]) {
      expect(DESIGN_TEMPLATES.map((t) => t.key), key).toContain(key);
    }
  });

  it('uses most of the style vocabulary, so the tags are not decoration', () => {
    expect(usedStyleTags().length).toBeGreaterThanOrEqual(STYLE_TAGS.length - 4);
  });

  it('has no duplicate keys or labels', () => {
    const keys = DESIGN_TEMPLATES.map((t) => t.key);
    const labels = DESIGN_TEMPLATES.map((t) => t.label);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('opening on the business own trade', () => {
  it('places a real category in its group', () => {
    expect(industryGroupFor('Restaurant')).toBe('Food & Hospitality');
    expect(industryGroupFor('  restaurant  ')).toBe('Food & Hospitality');
  });

  it('returns null rather than guessing', () => {
    // A wrong guess filters the library down to the wrong trade, which looks
    // like the library is empty. Null has to mean "show everything".
    for (const value of ['', '   ', null, undefined, 'Spaceship Repair']) {
      expect(industryGroupFor(value), String(value)).toBeNull();
    }
  });

  it('only ever returns a group the filter understands', () => {
    for (const group of INDUSTRY_GROUPS) {
      const anyCategory = findTemplates('', { industry: group });
      expect(anyCategory.length, group).toBeGreaterThan(0);
    }
  });
});

describe('the gallery order shows range', () => {
  it('loses nothing and invents nothing', () => {
    const out = diversify();
    expect(out).toHaveLength(DESIGN_TEMPLATES.length);
    expect(new Set(out.map((t) => t.key)).size).toBe(DESIGN_TEMPLATES.length);
    for (const tpl of out) expect(DESIGN_TEMPLATES).toContain(tpl);
  });

  it('does not open with three of the same scheme in a row', () => {
    // The fault this exists to fix: the catalogue's own order put three dark
    // blue layouts first, and a 312-design library looked like one design.
    const first = diversify().slice(0, 6).map((t) => t.scheme);
    expect(new Set(first).size).toBeGreaterThan(1);
    expect(first[0]).not.toBe(first[1]);
  });

  it('alternates light and dark far more than catalogue order does', () => {
    const flips = (list: { scheme: string }[]) =>
      list.filter((t, i) => i > 0 && t.scheme !== list[i - 1].scheme).length;
    expect(flips(diversify())).toBeGreaterThan(flips(DESIGN_TEMPLATES));
  });

  it('is deterministic — a gallery nobody can point a colleague at is useless', () => {
    expect(diversify().map((t) => t.key)).toEqual(diversify().map((t) => t.key));
  });

  it('copes with a single template and with none', () => {
    expect(diversify([])).toEqual([]);
    expect(diversify([DESIGN_TEMPLATES[0]])).toEqual([DESIGN_TEMPLATES[0]]);
  });
});
