import { describe, it, expect } from 'vitest';
import {
  OCCASION_TEMPLATES, SOCIAL_FORMATS, FLYER_FORMATS,
  POSTER_TEMPLATES, POSTER_FORMATS, BANNER_TEMPLATES, BANNER_FORMATS,
  PROMO_TEMPLATES, PROMO_FORMATS, STUDIO_LAYOUTS, layoutByKey, darken,
} from './studioPresets';

const lists = [
  ['occasions', OCCASION_TEMPLATES],
  ['poster', POSTER_TEMPLATES],
  ['banner', BANNER_TEMPLATES],
  ['promo', PROMO_TEMPLATES],
] as const;
const formats = [
  ['social', SOCIAL_FORMATS],
  ['flyer', FLYER_FORMATS],
  ['poster', POSTER_FORMATS],
  ['banner', BANNER_FORMATS],
  ['promo', PROMO_FORMATS],
] as const;

describe('studio presets', () => {
  it('templates have unique keys, labels and valid accent colours', () => {
    for (const [name, list] of lists) {
      const keys = list.map((t) => t.key);
      const labels = list.map((t) => t.label);
      expect(new Set(keys).size, `${name} keys`).toBe(keys.length);
      expect(new Set(labels).size, `${name} labels`).toBe(labels.length);
      for (const t of list) {
        expect(t.accent, `${name}.${t.key} accent`).toMatch(/^#[0-9a-f]{6}$/);
        expect(t.headline.length).toBeGreaterThan(3);
        expect(t.badge.length).toBeGreaterThan(0);
      }
    }
  });

  it('formats have unique keys and positive dimensions', () => {
    for (const [name, list] of formats) {
      const keys = list.map((f) => f.key);
      expect(new Set(keys).size, `${name} keys`).toBe(keys.length);
      for (const f of list) {
        expect(f.w).toBeGreaterThan(0);
        expect(f.h).toBeGreaterThan(0);
      }
    }
  });

  it('social formats cover the main platforms', () => {
    const labels = SOCIAL_FORMATS.map((f) => f.label);
    expect(labels).toEqual(expect.arrayContaining(['Instagram Post', 'TikTok', 'Pinterest', 'YouTube Thumbnail']));
  });

  it('promo templates cover the core promotion types', () => {
    const labels = PROMO_TEMPLATES.map((t) => t.label);
    expect(labels).toEqual(expect.arrayContaining(['Percent Off', 'Buy One Get One', 'Referral', 'Gift Voucher', 'Clearance']));
  });

  it('promo formats include social and print sizes', () => {
    const labels = PROMO_FORMATS.map((f) => f.label);
    expect(labels).toEqual(expect.arrayContaining(['Social Post', 'Story / WhatsApp Status', 'A4 Flyer', 'A3 Poster']));
  });

  it('exposes a set of modern design layouts with unique keys', () => {
    const keys = STUDIO_LAYOUTS.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThanOrEqual(5);
    expect(layoutByKey('classic').label).toBe('Classic');
    expect(layoutByKey('missing-key').key).toBe('classic');
    for (const l of STUDIO_LAYOUTS) {
      expect(l.desc.length).toBeGreaterThan(3);
    }
  });

  it('darkens hex colours into hex', () => {
    expect(darken('#000000', 0.5)).toBe('#000000');
    expect(darken('#ffffff', 1)).toBe('#000000');
    expect(darken('#ff0000', 0)).toBe('#ff0000');
    expect(darken('#123456', 0.5)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
