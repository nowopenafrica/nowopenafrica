import { describe, it, expect } from 'vitest';
import {
  BUSINESS_CATEGORY_GROUPS,
  BUSINESS_CATEGORIES,
  businessCategories,
  matchesCategory,
} from './categories';

describe('categories', () => {
  it('flattens the groups into BUSINESS_CATEGORIES without duplicates', () => {
    expect(BUSINESS_CATEGORIES).toEqual(BUSINESS_CATEGORY_GROUPS.flatMap((g) => g.items));
    expect(new Set(BUSINESS_CATEGORIES).size).toBe(BUSINESS_CATEGORIES.length);
  });

  describe('businessCategories', () => {
    it('returns just the primary when there are no secondary categories', () => {
      expect(businessCategories({ category: 'Tailor & Fashion Designer' })).toEqual(['Tailor & Fashion Designer']);
      expect(businessCategories({ category: 'Restaurant', secondary_categories: null })).toEqual(['Restaurant']);
    });

    it('includes every secondary category, deduplicating the primary', () => {
      expect(
        businessCategories({
          category: 'Tailor & Fashion Designer',
          secondary_categories: ['Fabric Store', 'Ready-to-Wear'],
        })
      ).toEqual(['Tailor & Fashion Designer', 'Fabric Store', 'Ready-to-Wear']);
    });

    it('ignores blank/null entries', () => {
      const dirty = ['', null, undefined] as Array<string | null | undefined>;
      expect(businessCategories({ category: 'Café & Bakery', secondary_categories: dirty as string[] })).toEqual(['Café & Bakery']);
    });

    it('handles a business with no category', () => {
      expect(businessCategories({ secondary_categories: ['Laundry & Dry Cleaning'] })).toEqual(['Laundry & Dry Cleaning']);
    });
  });

  describe('matchesCategory', () => {
    it('matches the primary category', () => {
      expect(matchesCategory({ category: 'Café & Bakery' }, 'Café & Bakery')).toBe(true);
      expect(matchesCategory({ category: 'Café & Bakery' }, 'Restaurant')).toBe(false);
    });

    it('matches any secondary category', () => {
      const b = { category: 'Tailor & Fashion Designer', secondary_categories: ['Fabric Store', 'Ready-to-Wear'] };
      expect(matchesCategory(b, 'Fabric Store')).toBe(true);
      expect(matchesCategory(b, 'Ready-to-Wear')).toBe(true);
      expect(matchesCategory(b, 'Café & Bakery')).toBe(false);
    });

    it('is safe with missing data', () => {
      expect(matchesCategory({}, 'Anything')).toBe(false);
      expect(matchesCategory({ category: 'Restaurant', secondary_categories: null }, 'Anything')).toBe(false);
    });
  });
});
