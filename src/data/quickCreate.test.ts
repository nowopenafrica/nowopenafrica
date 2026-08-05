import { describe, it, expect } from 'vitest';
import { QUICK_CREATE_ITEMS, QUICK_CREATE_GROUPS } from './quickCreate';
import {
  OCCASION_TEMPLATES, POSTER_TEMPLATES, BANNER_TEMPLATES, PROMO_TEMPLATES,
  SOCIAL_FORMATS, FLYER_FORMATS, POSTER_FORMATS, BANNER_FORMATS, PROMO_FORMATS,
} from './studioPresets';

const ALL_TEMPLATE_KEYS = new Set(
  [...OCCASION_TEMPLATES, ...POSTER_TEMPLATES, ...BANNER_TEMPLATES, ...PROMO_TEMPLATES].map((t) => t.key),
);
const ALL_FORMAT_KEYS = new Set(
  [...SOCIAL_FORMATS, ...FLYER_FORMATS, ...POSTER_FORMATS, ...BANNER_FORMATS, ...PROMO_FORMATS].map((f) => f.key),
);

describe('quick create', () => {
  it('points every card at a template that exists', () => {
    // A missing key doesn't throw — the editor quietly falls back to the first
    // template, so the card silently opens the wrong design. This is the test
    // that stops that.
    const broken = QUICK_CREATE_ITEMS
      .filter((i) => !ALL_TEMPLATE_KEYS.has(i.templateKey))
      .map((i) => `${i.key} -> ${i.templateKey}`);
    expect(broken).toEqual([]);
  });

  it('points every card at a format that exists', () => {
    const broken = QUICK_CREATE_ITEMS
      .filter((i) => !ALL_FORMAT_KEYS.has(i.formatKey))
      .map((i) => `${i.key} -> ${i.formatKey}`);
    expect(broken).toEqual([]);
  });

  it('has unique card keys', () => {
    const keys = QUICK_CREATE_ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every card a label, emoji and description', () => {
    for (const i of QUICK_CREATE_ITEMS) {
      expect(i.label.trim(), i.key).not.toBe('');
      expect(i.emoji.trim(), i.key).not.toBe('');
      expect(i.desc.trim(), i.key).not.toBe('');
    }
  });

  it('only uses declared groups, and every group is used', () => {
    const used = new Set(QUICK_CREATE_ITEMS.map((i) => i.group));
    for (const g of used) expect(QUICK_CREATE_GROUPS).toContain(g);
    for (const g of QUICK_CREATE_GROUPS) expect(used.has(g), `unused group: ${g}`).toBe(true);
  });

  it('covers the commercial moments the product promises', () => {
    // Guards against the grid quietly shrinking back to a handful of cards.
    const labels = QUICK_CREATE_ITEMS.map((i) => i.label.toLowerCase());
    for (const needed of [
      'open today', 'weekend sale', 'flash sale', 'price drop', 'new product',
      'christmas', 'ramadan', 'black friday', 'valentine', 'independence day',
      'grand opening', "we're hiring", 'customer review', 'referral campaign',
    ]) {
      expect(labels.some((l) => l.includes(needed)), `missing: ${needed}`).toBe(true);
    }
    expect(QUICK_CREATE_ITEMS.length).toBeGreaterThanOrEqual(25);
  });

  it('marks exactly one card as the full-campaign shortcut', () => {
    expect(QUICK_CREATE_ITEMS.filter((i) => i.fullCampaign)).toHaveLength(1);
  });
});
