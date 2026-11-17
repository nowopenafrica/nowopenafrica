import { describe, expect, it } from 'vitest';
import { BUSINESS_CATEGORY_GROUPS } from '../../../data/categories';
import { SUBCATEGORIES } from '../catalogueTaxonomy';
import { INDUSTRIES, MOVEMENTS, movementOf } from '../intel';
import { CATEGORY_TO_INDUSTRY, DELIVERABLE_EXTRA, DIRECTION_TO_MOVEMENTS, INDUSTRY_WORDS, MOVEMENT_WORDS } from './lexicon';
import { answerBrief, briefIsReady, directionsToExplore, readBrief } from './readBrief';

const groupsOf = (keys: string[]) => new Set(keys.map((k) => movementOf(k)!.group));

/*
 * The five benchmark briefs, exactly as typed in the CI-0 trace. Each test
 * names the failure that trace found, so the reason for the assertion survives.
 */
describe('the five benchmark briefs', () => {
  it('skincare: a launch is a launch, not an event, and the trade and country are kept', () => {
    const b = readBrief('Launch poster for a luxury Nigerian skincare brand');
    expect(b.deliverable?.value).toBe('poster');
    expect(b.family?.value).toBe('print-merch');
    expect(b.industry?.value).toBe('skincare-beauty');
    expect(b.objective?.value).toBe('launch');
    expect(b.tier?.value).toBe('luxury');
    expect(b.place).toMatchObject({ value: 'Nigeria', source: 'typed' });
    expect(b.movements.value[0]).toBe('luxury-minimalism');
    expect(b.cautions.join(' ')).toMatch(/medical|cure/i);
  });

  it('real estate: a billboard is understood, with Lagos, the trade and the tier', () => {
    const b = readBrief('Billboard for high-end Lagos real estate');
    expect(b.deliverable?.value).toBe('billboard');
    expect(b.family?.value).toBe('advertising');
    expect(b.industry?.value).toBe('real-estate');
    expect(b.tier?.value).toBe('luxury');
    expect(b.place?.value).toBe('Lagos');
    expect(b.objective).toMatchObject({ value: 'awareness', source: 'default' });
    expect(b.mustCarry.join(' ')).toMatch(/location/i);
  });

  it('fashion: "a fashion label" is the business, not a product label', () => {
    const b = readBrief('Brand identity for a premium African fashion label');
    expect(b.deliverable).toBeNull();
    expect(b.scope.value).toBe('system');
    expect(b.family?.value).toBe('branding');
    expect(b.objective?.value).toBe('identity');
    expect(b.industry).toMatchObject({ value: 'fashion-apparel', from: 'fashion label' });
    expect(b.tier?.value).toBe('premium');
    expect(b.place?.value).toBe('Africa');
    expect(b.limits.join(' ')).toMatch(/cannot draw an original logo/i);
    expect(briefIsReady(b)).toBe(true);
  });

  it('conference: social posts are a series for an event, for an international audience', () => {
    const b = readBrief('Social posts for an international tech conference');
    expect(b.deliverable?.value).toBe('instagram-post');
    expect(b.scope.value).toBe('series');
    expect(b.industry?.value).toBe('events-conferences');
    expect(b.objective?.value).toBe('event');
    expect(b.audience).toMatchObject({ source: 'inferred', from: 'international' });
    expect(b.mustCarry.join(' ')).toMatch(/date and city/i);
  });

  it('restaurant: an opening, in the 4:5 feed size, leaning contemporary', () => {
    const b = readBrief('Instagram post for a contemporary restaurant opening');
    expect(b.deliverable?.value).toBe('instagram-post');
    expect(b.format?.value).toBe('instagram-portrait');
    expect(b.industry?.value).toBe('restaurant-dining');
    expect(b.objective?.value).toBe('opening');
    expect(b.movements.value[0]).toBe('afro-contemporary');
    expect(b.movements.value).not.toContain('gradient-futurism');
    expect(b.imagery.join(' ')).toMatch(/dishes/i);
  });

  it('gives the conference and the restaurant different briefs (CI-0: they got identical results)', () => {
    const a = readBrief('Social posts for an international tech conference');
    const b = readBrief('Instagram post for a contemporary restaurant opening');
    expect(a.industry?.value).not.toBe(b.industry?.value);
    expect(a.movements.value.slice(0, 3)).not.toEqual(b.movements.value.slice(0, 3));
    expect(a.mustCarry).not.toEqual(b.mustCarry);
  });

  it.each([
    'Launch poster for a luxury Nigerian skincare brand',
    'Billboard for high-end Lagos real estate',
    'Brand identity for a premium African fashion label',
    'Social posts for an international tech conference',
    'Instagram post for a contemporary restaurant opening',
  ])('"%s" is ready with at most three questions and three groups of movement', (text) => {
    const b = readBrief(text);
    expect(briefIsReady(b)).toBe(true);
    expect(b.questions.length).toBeLessThanOrEqual(3);
    expect(b.questions.map((q) => q.field)).not.toContain('deliverable');
    expect(b.questions.map((q) => q.field)).not.toContain('industry');
    expect(groupsOf(b.movements.value.slice(0, 6)).size).toBeGreaterThanOrEqual(3);
  });
});

describe('sources: a guess is never passed off as the customer\'s word', () => {
  it('marks what was typed, what was read and what was assumed', () => {
    const b = readBrief('A4 flyer for my bakery "Fresh bread from 6am"');
    expect(b.format).toMatchObject({ value: 'a4', source: 'typed' });
    expect(b.headline).toMatchObject({ value: 'Fresh bread from 6am', source: 'typed' });
    expect(b.industry?.source).toBe('inferred');
    expect(b.audience?.source).toBe('default');
    expect(b.tone?.source).toBe('default');
  });

  it('never supplies a place that was not named', () => {
    expect(readBrief('Flyer for my salon').place).toBeNull();
    expect(readBrief('Flyer for my salon', { city: 'Ibadan' }).place).toMatchObject({ value: 'Ibadan', source: 'default' });
  });

  it('puts a movement the customer named first, even where the trade would not', () => {
    const b = readBrief('brutalist poster for my clinic');
    expect(b.movements.source).toBe('typed');
    expect(b.movements.value[0]).toBe('neo-brutalism');
  });

  it('drops a style hint the trade works against', () => {
    const b = readBrief('fun flyer for a law firm');
    expect(b.movements.value.slice(0, 3)).not.toContain('memphis');
  });
});

describe('questions', () => {
  it('asks what is being made when the request does not say', () => {
    const b = readBrief('something for my restaurant');
    expect(b.questions[0].field).toBe('deliverable');
    expect(briefIsReady(b)).toBe(false);
  });

  it('asks the trade when nothing names it, and not when the listing does', () => {
    expect(readBrief('a poster').questions.map((q) => q.field)).toContain('industry');
    const known = readBrief('a poster', { category: 'Real Estate', businessName: 'Palm Court' });
    expect(known.industry).toMatchObject({ value: 'real-estate', source: 'default' });
    expect(known.questions.map((q) => q.field)).toEqual(['message']);
  });

  it('never asks more than three, and never for what it already has', () => {
    const b = readBrief('help');
    expect(b.questions).toHaveLength(3);
    const full = readBrief('Poster for my gym "Join in January"', { businessName: 'Iron House' });
    expect(full.questions).toEqual([]);
  });

  it('shapes the message question to the objective', () => {
    expect(readBrief('event poster for a concert').questions.find((q) => q.field === 'message')?.ask).toMatch(/date and place/);
    expect(readBrief('sale flyer for my shop').questions.find((q) => q.field === 'message')?.ask).toMatch(/price/);
  });

  it('takes answers as the customer\'s own word and stops asking', () => {
    let b = readBrief('something nice');
    b = answerBrief(b, 'deliverable', 'flyer');
    expect(b.deliverable).toMatchObject({ value: 'flyer', source: 'typed' });
    expect(b.format?.value).toBe('a5');
    b = answerBrief(b, 'industry', 'cafe-bakery');
    expect(b.industry).toMatchObject({ value: 'cafe-bakery', source: 'typed' });
    expect(b.mustCarry.length).toBeGreaterThan(0);
    expect(briefIsReady(b)).toBe(true);
    b = answerBrief(b, 'message', 'Fresh bread from 6am');
    expect(b.headline?.value).toBe('Fresh bread from 6am');
    expect(b.questions.map((q) => q.field)).toEqual(['business']);
    expect(answerBrief(b, 'business', 'Crumb', {}).questions).toEqual([]);
  });

  it('ignores an empty or unknown answer', () => {
    const b = readBrief('a poster');
    expect(answerBrief(b, 'industry', '  ')).toBe(b);
    expect(answerBrief(b, 'industry', 'no-such-trade').industry).toBeNull();
  });
});

describe('directions to explore', () => {
  it("offers three movements from three different groups, the customer's lean first", () => {
    const b = readBrief('Launch poster for a luxury Nigerian skincare brand');
    const three = directionsToExplore(b);
    expect(three).toHaveLength(3);
    expect(three[0]).toBe('luxury-minimalism');
    expect(groupsOf(three).size).toBe(3);
  });
});

describe('honest limits', () => {
  it('says what Create cannot make', () => {
    expect(readBrief('a reel video for my shop').limits.join(' ')).toMatch(/still designs/i);
    expect(readBrief('pitch deck for my startup').limits.join(' ')).toMatch(/no pitch deck/i);
    expect(readBrief('flyer for my shop').limits).toEqual([]);
  });
});

describe('lexicon', () => {
  it('has words for every industry profile, and only for real ones', () => {
    const keys = INDUSTRIES.map((i) => i.key).sort();
    expect(Object.keys(INDUSTRY_WORDS).sort()).toEqual(keys);
    for (const [k, words] of Object.entries(INDUSTRY_WORDS)) expect(words.length, k).toBeGreaterThan(0);
  });

  it('has words for every movement, and only for real ones', () => {
    expect(Object.keys(MOVEMENT_WORDS).sort()).toEqual(MOVEMENTS.map((m) => m.key).sort());
    for (const list of Object.values(DIRECTION_TO_MOVEMENTS)) for (const k of list) expect(movementOf(k), k).not.toBeNull();
  });

  it('maps only real listing categories to real industries', () => {
    const cats = new Set(BUSINESS_CATEGORY_GROUPS.flatMap((g) => g.items));
    const inds = new Set(INDUSTRIES.map((i) => i.key));
    for (const [cat, ind] of Object.entries(CATEGORY_TO_INDUSTRY)) {
      expect(cats.has(cat), cat).toBe(true);
      expect(inds.has(ind), ind).toBe(true);
    }
  });

  it('names only real products', () => {
    const subs = new Set(SUBCATEGORIES.map((s) => s.key));
    for (const k of Object.keys(DELIVERABLE_EXTRA)) expect(subs.has(k), k).toBe(true);
  });

  it('reads each industry from its own first word', () => {
    for (const [key, words] of Object.entries(INDUSTRY_WORDS)) {
      expect(readBrief(`a flyer for my ${words[0]}`).industry?.value, words[0]).toBe(key);
    }
  });
});
