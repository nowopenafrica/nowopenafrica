import { describe, it, expect } from 'vitest';
import { INDUSTRIES, PILLARS, UNIVERSAL_FEATURES } from './industrySystems';
import { BUSINESS_CATEGORIES } from './categories';

describe('industrySystems', () => {
  it('has unique slugs and names', () => {
    const slugs = INDUSTRIES.map((i) => i.slug);
    const names = INDUSTRIES.map((i) => i.name);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every industry lists only real business categories', () => {
    for (const ind of INDUSTRIES) {
      for (const cat of ind.categories) {
        expect(BUSINESS_CATEGORIES).toContain(cat);
      }
    }
  });

  it('covers every business category the product ships', () => {
    const covered = new Set(INDUSTRIES.flatMap((i) => i.categories));
    const missing = BUSINESS_CATEGORIES.filter((c) => !covered.has(c));
    expect(missing).toEqual([]);
  });

  it('gives every industry at least one feature group with features', () => {
    for (const ind of INDUSTRIES) {
      const featureCount = ind.groups.reduce((n, g) => n + g.features.length, 0);
      expect(featureCount, `${ind.name} has no features`).toBeGreaterThan(0);
    }
  });

  it('covers the new add-on module features on the platform page', () => {
    const allFeatures = INDUSTRIES.flatMap((i) => i.groups.flatMap((g) => g.features));
    for (const moduleFeature of ['Quotes & estimates', 'Home visits', 'Request pickup', 'Book a fitting', 'Rentals & hire', 'Book a lesson', 'Date-range rentals']) {
      expect(allFeatures, `missing feature: ${moduleFeature}`).toContain(moduleFeature);
    }
  });

  it('has ten platform pillars and a multi-category universal feature', () => {
    expect(PILLARS).toHaveLength(10);
    expect(UNIVERSAL_FEATURES).toContain('Multi-category listing');
  });
});
