import { describe, it, expect } from 'vitest';
import { getCategoryFeatures, getActiveFeatures, getModuleByKey, MODULE_LIBRARY, CATEGORY_FEATURES } from './categoryFeatures';
import { CATEGORY_TAB_LABELS } from './categoryTabLabels';
import { BUSINESS_CATEGORIES } from './categories';

describe('categoryFeatures', () => {
  it('gives dine-in food categories a reservation + a cart module', () => {
    expect(getCategoryFeatures('Café & Bakery').map((m) => m.key)).toEqual(['reservations', 'orders']);
  });

  it('returns no modules for an unknown/blank category', () => {
    expect(getCategoryFeatures('Not A Category')).toEqual([]);
    expect(getCategoryFeatures(null)).toEqual([]);
  });

  describe('getActiveFeatures', () => {
    it('null selection = all of the category defaults', () => {
      expect(getActiveFeatures('Café & Bakery', null).map((m) => m.key)).toEqual(['reservations', 'orders']);
    });

    it('empty selection = no modules', () => {
      expect(getActiveFeatures('Café & Bakery', [])).toEqual([]);
    });

    it('narrows to the selected category keys', () => {
      expect(getActiveFeatures('Café & Bakery', ['reservations']).map((m) => m.key)).toEqual(['reservations']);
    });

    it('resolves owner-added add-on modules from the library', () => {
      const keys = getActiveFeatures('Café & Bakery', ['reservations', 'appointments']).map((m) => m.key);
      expect(keys).toContain('reservations'); // kept from the category
      expect(keys).toContain('appointments'); // resolved from MODULE_LIBRARY
    });

    it('ignores selected keys that resolve to nothing', () => {
      const keys = getActiveFeatures('Café & Bakery', ['reservations', 'ghost-module']).map((m) => m.key);
      expect(keys).toEqual(['reservations']);
    });
  });

  it('getModuleByKey resolves library modules only', () => {
    expect(getModuleByKey('appointments')?.ctaLabel).toBeTruthy();
    expect(getModuleByKey('totally-made-up')).toBeUndefined();
  });

  it('has a unique key for every library module', () => {
    const keys = MODULE_LIBRARY.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('maps everyday food vendors to an ordering module', () => {
    expect(getCategoryFeatures('Local Food Vendor').map((m) => m.key)).toEqual(['orders']);
    expect(getCategoryFeatures('Suya & Grill').map((m) => m.key)).toEqual(['reservations', 'orders']);
  });

  it('gives home-service trades quote/estimate modules', () => {
    const keys = getCategoryFeatures('Plumbing Services').map((m) => m.key);
    expect(keys).toEqual(['quotes']);
    expect(getCategoryFeatures('Laundry & Dry Cleaning').map((m) => m.key)).toEqual(['pickup']);
  });

  it('gives tailors a fitting module plus a shop', () => {
    expect(getCategoryFeatures('Tailor & Fashion Designer').map((m) => m.key)).toEqual(['fittings', 'orders']);
  });

  it('gives car rental a date-range booking', () => {
    const rental = getCategoryFeatures('Car Rental')[0];
    expect(rental.key).toBe('rentals');
    expect(rental.showDateRange).toBe(true);
  });

  it('add-on modules resolve from the library for any business', () => {
    for (const key of ['quotes', 'home-visits', 'pickup', 'rentals', 'fittings', 'lessons']) {
      expect(getModuleByKey(key)).toBeTruthy();
    }
  });

  it('every configured feature key is a real category', () => {
    for (const key of Object.keys(CATEGORY_FEATURES)) {
      expect(BUSINESS_CATEGORIES).toContain(key);
    }
  });

  it('every tab-label override key is a real category', () => {
    for (const key of Object.keys(CATEGORY_TAB_LABELS)) {
      expect(BUSINESS_CATEGORIES).toContain(key);
    }
  });

  it('gives no single category duplicate module keys', () => {
    for (const [category, features] of Object.entries(CATEGORY_FEATURES)) {
      const keys = features.map((f) => f.key);
      expect(new Set(keys).size, `${category} has duplicate module keys`).toBe(keys.length);
    }
  });
});
