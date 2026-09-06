import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { createForMe, groupFor, knownFacts, type CreateProfile } from './createForMe';
import { BUSINESS_CATEGORY_GROUPS } from '../data/categories';

const complete = (over: Partial<CreateProfile> = {}): CreateProfile => ({
  name: 'Mama Ada Kitchen',
  category: 'Restaurant',
  logo_url: 'https://x/logo.png',
  image_url: 'https://x/cover.jpg',
  description: 'Home cooking in Yaba.',
  phone: '+2348000000000',
  whatsapp: '+2348000000000',
  location: 'Yaba, Lagos',
  opening_hours: 'Mon-Sat 9-9',
  products: 12,
  ...over,
});

describe('it knows which trade it is talking to', () => {
  it('maps real categories to their group', () => {
    expect(groupFor('Restaurant')).toBe('Food & Hospitality');
    expect(groupFor('restaurant')).toBe('Food & Hospitality');
    expect(groupFor('  Restaurant  ')).toBe('Food & Hospitality');
    expect(groupFor('Not A Category')).toBeNull();
    expect(groupFor(null)).toBeNull();
  });

  it('gives a restaurant restaurant work, not generic work', () => {
    const keys = createForMe(complete({ products: 0 })).map((s) => s.key);
    expect(keys).toContain('menu');
    expect(keys).toContain('todays-offer');
  });

  it('gives a mechanic different work from a tailor', () => {
    // Real category names, taken from data/categories.ts — a guessed one falls
    // through to the universal set and the test passes for the wrong reason.
    const mechanic = createForMe(complete({ category: 'Automotive', products: 0 })).map((s) => s.label);
    const tailor = createForMe(complete({ category: 'Tailor & Fashion Designer', products: 0 })).map((s) => s.label);
    expect(mechanic).not.toEqual(tailor);
    expect(mechanic).toContain('Service menu');
    expect(tailor).toContain('Collection catalogue');
  });

  it('still says something useful for a category it does not know', () => {
    const out = createForMe(complete({ category: 'Interdimensional Portal Repair' }));
    expect(out.length).toBeGreaterThan(0);
    // Falls back to the universal set rather than guessing at a trade.
    expect(out.map((s) => s.key)).toContain('digital-card');
  });
});

describe('foundations come first', () => {
  it('puts the logo above anything decorative', () => {
    const out = createForMe(complete({ logo_url: null, products: 0 }));
    expect(out[0].key).toBe('logo');
    expect(out[0].priority).toBe('foundation');
  });

  it('will not suggest a reel to a business nobody can contact', () => {
    const out = createForMe(complete({ phone: null, whatsapp: null, products: 0 }));
    const contact = out.findIndex((s) => s.key === 'contact');
    const reel = out.findIndex((s) => s.key === 'food-reel');
    expect(contact).toBeGreaterThanOrEqual(0);
    if (reel >= 0) expect(contact).toBeLessThan(reel);
  });

  it('names the actual gap rather than encouraging in general', () => {
    const out = createForMe(complete({ opening_hours: null, hours: null }));
    const hours = out.find((s) => s.key === 'hours');
    expect(hours?.why).toMatch(/Open Now/);
  });

  it('says nothing about foundations that are already there', () => {
    const keys = createForMe(complete()).map((s) => s.key);
    for (const gap of ['logo', 'cover', 'description', 'contact', 'hours']) {
      expect(keys, gap).not.toContain(gap);
    }
  });
});

describe('it does not repeat itself', () => {
  it('drops the catalogue suggestion once there is a catalogue', () => {
    const withProducts = createForMe(complete({ products: 20 })).map((s) => s.key);
    expect(withProducts).not.toContain('menu');
    const without = createForMe(complete({ products: 0 })).map((s) => s.key);
    expect(without).toContain('menu');
  });

  it('returns each suggestion once and respects the cap', () => {
    const out = createForMe(complete({ logo_url: null, image_url: null, description: null, products: 0 }), 4);
    expect(out).toHaveLength(4);
    expect(new Set(out.map((s) => s.key)).size).toBe(4);
  });

  it('is deterministic — the same business gets the same advice', () => {
    const a = createForMe(complete({ products: 0 }));
    const b = createForMe(complete({ products: 0 }));
    expect(a).toEqual(b);
  });
});

describe('every suggestion is actionable', () => {
  const tabs = readFileSync('src/pages/Studio.tsx', 'utf8');

  it('opens a Studio tab that actually exists', () => {
    // A recommendation pointing at a tab that was renamed is a dead end, and
    // the owner blames the product rather than the link.
    const seen = new Set<string>();
    for (const group of Object.keys(BUSINESS_CATEGORY_GROUPS.map((g) => g.group))) void group;
    for (const category of BUSINESS_CATEGORY_GROUPS.flatMap((g) => g.items)) {
      for (const s of createForMe(complete({ category, products: 0 }), 20)) seen.add(s.tab);
    }
    expect(seen.size).toBeGreaterThan(3);
    for (const tab of seen) {
      expect(tabs.includes(`key: '${tab}'`), `Studio has no tab "${tab}"`).toBe(true);
    }
  });

  it('says what it will pull from the profile', () => {
    for (const s of createForMe(complete({ products: 0 }), 20)) {
      expect(s.uses.length, s.key).toBeGreaterThan(0);
      expect(s.why.length, s.key).toBeGreaterThan(20);
    }
  });
});

describe('it states what NowOpen already knows', () => {
  it('lists real facts, and nothing it does not have', () => {
    expect(knownFacts(complete())).toContain('your logo');
    expect(knownFacts(complete({ logo_url: null }))).not.toContain('your logo');
    expect(knownFacts({})).toEqual([]);
  });
});
