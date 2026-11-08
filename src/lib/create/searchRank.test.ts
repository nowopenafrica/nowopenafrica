import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DESIGN_TEMPLATES, templateByKey, type DesignTemplate } from '../designTemplates';
import { clearUploadedDeliverables, registerUploadedDeliverable } from '../design/deliverables';
import { DIRECTIONS } from '../design/directions';
import { INDUSTRY_GROUPS } from '../design/taxonomy';
import { OCCASIONS, SUBCATEGORIES } from './catalogueTaxonomy';
import { classifyIntent } from './intent';
import {
  clearSearchMisses, parseQuery, rankTemplates, searchCatalogue, searchMisses,
} from './searchRank';

const REAL_ESTATE = 'Professional Services';
const HOSPITALITY = 'Food & Hospitality';

/** A throwaway template classified as one subcategory, so ranking is tested on known facts. */
const tpl = (key: string, sub: string, over: Partial<DesignTemplate> = {}): DesignTemplate => {
  const base = templateByKey('tiered-sale');
  registerUploadedDeliverable(key, { category: 'flyers', name: key, subcategory: sub, deliverable: sub });
  return { ...base, key, label: key, desc: '', tags: [], industries: [], direction: undefined, ...over };
};

beforeEach(() => clearSearchMisses());
afterEach(() => clearUploadedDeliverables());

describe('lexicon sanity', () => {
  it('names only real industry groups, directions and occasions', () => {
    const q = (s: string) => parseQuery(s);
    for (const s of ['restaurant', 'real estate', 'fashion', 'salon', 'tech', 'school', 'shop']) {
      const ind = q(s).industry;
      expect(ind, s).not.toBeNull();
      expect(INDUSTRY_GROUPS, s).toContain(ind);
    }
    for (const s of ['luxury', 'minimal', 'corporate', 'editorial', 'bold', 'modern', 'playful']) {
      expect(DIRECTIONS.map((d) => d.key), s).toContain(q(s).direction);
    }
    for (const s of ['sale', 'launch', 'opening', 'holiday', 'wedding', 'church', 'football']) {
      expect(OCCASIONS, s).toContain(q(s).occasion);
    }
  });
});

describe('parseQuery: the five founder examples', () => {
  it('luxury real estate flyer', () => {
    expect(parseQuery('luxury real estate flyer')).toEqual({
      subcategory: 'flyer', direction: 'luxury', industry: REAL_ESTATE, occasion: null, format: null, rest: [],
    });
  });

  it('modern business card', () => {
    expect(parseQuery('modern business card')).toMatchObject({
      subcategory: 'business-card', direction: 'contemporary', industry: null, rest: [],
    });
  });

  it('billboard for a new restaurant', () => {
    expect(parseQuery('billboard for a new restaurant')).toMatchObject({
      subcategory: 'billboard', industry: HOSPITALITY, occasion: 'opening', rest: [],
    });
  });

  it('investor pitch deck names a product the catalogue lacks', () => {
    const q = parseQuery('investor pitch deck');
    expect(q.subcategory).toBe('pitch-deck');
    expect(SUBCATEGORIES.map((s) => s.key)).not.toContain('pitch-deck');
  });

  it('fashion Instagram campaign', () => {
    expect(parseQuery('fashion Instagram campaign')).toMatchObject({
      subcategory: 'instagram-post', industry: 'Fashion & Beauty', rest: [],
    });
  });
});

describe('synonyms', () => {
  it.each(['posh', 'upscale', 'premium', 'high-end', 'High End'])('%s means luxury', (w) => {
    expect(parseQuery(`${w} flyer`).direction).toBe('luxury');
  });
  it('modern means contemporary', () => expect(parseQuery('modern poster').direction).toBe('contemporary'));
  it.each(['estate agency', 'real estate', 'property'])('%s is the real-estate group', (w) => {
    expect(parseQuery(`${w} flyer`).industry).toBe(REAL_ESTATE);
  });
  it.each(['new restaurant', 'opening'])('%s is the opening occasion', (w) => {
    expect(parseQuery(`${w} flyer`).occasion).toBe('opening');
  });
  it.each(['restaurant', 'food'])('%s is hospitality', (w) => {
    expect(parseQuery(`${w} menu`).industry).toBe(HOSPITALITY);
  });
  it.each(['IG', 'insta'])('%s is the Instagram post', (w) => {
    expect(parseQuery(`${w} for my shop`).subcategory).toBe('instagram-post');
  });
  it('keeps words it does not know in rest', () => {
    expect(parseQuery('posh flyer for my estate agency').rest).toEqual([]);
    expect(parseQuery('flyer with zebras').rest).toEqual(['zebras']);
  });
});

describe('rankTemplates', () => {
  it('puts the luxury real-estate flyer above a plain flyer that mentions luxury', () => {
    const right = tpl('z-right', 'flyer', { direction: 'luxury', industries: [REAL_ESTATE] });
    const plain = tpl('a-plain', 'flyer', { tags: ['luxury'] });
    const ranked = rankTemplates(parseQuery('luxury real estate flyer'), [plain, right], new Map());
    expect(ranked.map((t) => t.key)).toEqual(['z-right', 'a-plain']);
  });

  it('weighs the subcategory double', () => {
    const product = tpl('p', 'flyer');
    const facets = tpl('f', 'poster', { direction: 'luxury' });
    const ranked = rankTemplates(parseQuery('luxury flyer'), [facets, product], new Map());
    expect(ranked.map((t) => t.key)).toEqual(['p', 'f']);
  });

  it('breaks ties by quality score, treating no score as 0, then by key', () => {
    const a = tpl('a', 'flyer');
    const b = tpl('b', 'flyer');
    const c = tpl('c', 'flyer');
    const q = parseQuery('flyer');
    expect(rankTemplates(q, [a, b, c], new Map([['c', 90], ['b', 80]])).map((t) => t.key)).toEqual(['c', 'b', 'a']);
    expect(rankTemplates(q, [c, b, a], new Map()).map((t) => t.key)).toEqual(['a', 'b', 'c']);
  });

  it('matches the opening occasion from a template tag', () => {
    const open = tpl('open', 'billboard', { tags: ['opening'] });
    const none = tpl('none', 'billboard');
    const ranked = rankTemplates(parseQuery('billboard for a new restaurant'), [none, open], new Map());
    expect(ranked[0].key).toBe('open');
  });

  it('still returns flyers when some words are unknown (partial match)', () => {
    const flyers = [tpl('f1', 'flyer'), tpl('f2', 'flyer'), tpl('m', 'menu')];
    const ranked = rankTemplates(parseQuery('posh flyer for my estate agency'), flyers, new Map());
    expect(ranked.map((t) => t.key)).toEqual(['f1', 'f2']);
  });

  it('drops templates that match no parsed facet', () => {
    const ranked = rankTemplates(parseQuery('flyer'), [tpl('m', 'menu')], new Map());
    expect(ranked).toEqual([]);
  });

  it('uses free text only when no facet parsed', () => {
    const zebra = tpl('zebra', 'flyer', { tags: ['zebra'] });
    const other = tpl('other', 'flyer');
    expect(rankTemplates(parseQuery('zebra'), [other, zebra], new Map()).map((t) => t.key)).toEqual(['zebra']);
    /* With a facet present, the unknown word does not filter. */
    expect(rankTemplates(parseQuery('zebra flyer'), [other, zebra], new Map()).length).toBe(2);
  });

  it('returns nothing for a product that is not in the catalogue', () => {
    expect(rankTemplates(parseQuery('investor pitch deck'), DESIGN_TEMPLATES, new Map())).toEqual([]);
  });

  it('works on the real catalogue', () => {
    const ranked = rankTemplates(parseQuery('business card'), DESIGN_TEMPLATES, new Map());
    expect(ranked.length).toBeGreaterThan(0);
  });
});

describe('searchCatalogue and misses', () => {
  it('says a missing product is not in the catalogue yet, points to the nearest, and records the miss', () => {
    const out = searchCatalogue('investor pitch deck', DESIGN_TEMPLATES, new Map());
    expect(out.status).toBe('not-in-catalogue');
    if (out.status !== 'not-in-catalogue') return;
    expect(out.message).toBe("Pitch deck isn't in the catalogue yet.");
    expect(SUBCATEGORIES.find((s) => s.key === out.nearest)?.category).toBe('presentations');
    expect(searchMisses()).toEqual(['investor pitch deck']);
  });

  it('records a query that finds nothing, and not one that finds something', () => {
    expect(searchCatalogue('qqqq', DESIGN_TEMPLATES, new Map()).status).toBe('none');
    const hit = searchCatalogue('business card', DESIGN_TEMPLATES, new Map());
    expect(hit.status).toBe('results');
    expect(searchMisses()).toEqual(['qqqq']);
  });
});

describe('the existing request bar is unchanged', () => {
  it('classifyIntent still reads a sentence the same way', () => {
    expect(classifyIntent('modern business card').kind).toBe('graphic');
  });
});
