import { describe, it, expect } from 'vitest';
import { generateCopyVariants, smartCta, badgeHasAction } from './aiCopy';
import { DEFAULT_BRAND_IDENTITY } from './brandIdentity';
import { OCCASION_TEMPLATES } from '../data/studioPresets';

const business = { name: 'Meat Club', category: 'Restaurant & Bar', location: 'Lagos' };

describe('ai copy variants', () => {
  it('always returns a fixed set with the current template first', () => {
    const t = OCCASION_TEMPLATES[1];
    const v = generateCopyVariants(business, { ...DEFAULT_BRAND_IDENTITY }, t);
    expect(v.length).toBe(5);
    expect(v[0]).toMatchObject({ headline: t.headline, badge: t.badge });
  });

  it('stays within the Design Studio input limits', () => {
    const t = OCCASION_TEMPLATES[1];
    for (const v of generateCopyVariants(business, { ...DEFAULT_BRAND_IDENTITY }, t)) {
      expect(v.headline.length).toBeLessThanOrEqual(41);
      expect(v.subline.length).toBeLessThanOrEqual(61);
      expect(v.badge.length).toBeLessThanOrEqual(25);
    }
  });

  it('weaves the tagline into the on-brand variant', () => {
    const t = OCCASION_TEMPLATES[1];
    const identity = { ...DEFAULT_BRAND_IDENTITY, tagline: 'Meat, always fresh' };
    const v = generateCopyVariants(business, identity, t);
    const onBrand = v.find((x) => x.label === 'On-brand')!;
    expect(onBrand.headline).toBe('Meat, always fresh');
  });

  it('falls back to a generic bank for unknown template keys', () => {
    const t = { key: 'mystery', label: 'Mystery', headline: 'X', subline: 'Y', badge: 'Z', accent: '#000' };
    const v = generateCopyVariants(business, { ...DEFAULT_BRAND_IDENTITY }, t);
    expect(v.length).toBe(5);
  });
});

describe('smart CTA', () => {
  it('maps a restaurant to a reservation CTA', () => {
    const t = OCCASION_TEMPLATES[0];
    expect(smartCta(business, t).badge).toBe('RESERVE A TABLE');
  });

  it('falls back to an urgency CTA for offer templates', () => {
    const flash = OCCASION_TEMPLATES.find((x) => x.key === 'flash-sale')!;
    const c = smartCta({ name: 'Mystery', category: 'Mystery' }, flash);
    expect(c.badge).toBe('SHOP NOW');
  });

  it('recognises action badges', () => {
    expect(badgeHasAction('BOOK NOW')).toBe(true);
    expect(badgeHasAction('THANK YOU')).toBe(false);
  });
});
