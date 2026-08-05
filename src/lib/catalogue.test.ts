import { describe, it, expect, beforeEach } from 'vitest';
import { Business } from '../types';
import {
  Catalogue,
  CATALOGUE_CATEGORIES, catalogueCategoryLabel,
  createCatalogueItem, suggestCatalogueItems, createCatalogue,
  formatCataloguePrice, catalogueFullText,
  loadCatalogue, saveCatalogue,
} from './catalogue';

const restaurant = {
  id: '1',
  name: 'Meat Club',
  category: 'Restaurant',
  location: 'Lagos',
  phone: '+234 800 123 4567',
} as unknown as Business;

const shop = {
  id: '2',
  name: 'Urban Thread',
  category: 'Fashion Store',
  location: 'Abuja',
} as unknown as Business;

beforeEach(() => localStorage.clear());

describe('catalogue — categories', () => {
  it('covers the three catalogue kinds', () => {
    expect(CATALOGUE_CATEGORIES.map((c) => c.key)).toEqual(['products', 'services', 'menu']);
    for (const c of CATALOGUE_CATEGORIES) {
      expect(catalogueCategoryLabel(c.key)).toBe(c.label);
    }
  });
});

describe('catalogue — building', () => {
  it('suggests menu items for food businesses', () => {
    const s = suggestCatalogueItems(restaurant);
    expect(s.length).toBe(3);
    expect(s.every((i) => i.category === 'menu')).toBe(true);
    expect(s[0].name).toContain('Meat Club');
  });

  it('suggests products for shops and services otherwise', () => {
    expect(suggestCatalogueItems(shop).every((i) => i.category === 'products')).toBe(true);
    expect(suggestCatalogueItems({ name: 'Zenith Spa', category: 'Spa & Beauty' } as Business).every((i) => i.category === 'services')).toBe(true);
  });

  it('creates a titled catalogue with starter items', () => {
    const c = createCatalogue(restaurant);
    expect(c.title).toContain('Meat Club');
    expect(c.items.length).toBeGreaterThan(0);
  });

  it('creates items with ids and featured flags', () => {
    const it = createCatalogueItem({ name: 'Grill', description: 'Fresh off the fire', price: 7000, category: 'menu', emoji: '🍖', featured: true });
    expect(it.id.length).toBeGreaterThan(3);
    expect(it.featured).toBe(true);
  });
});

describe('catalogue — rendering & persistence', () => {
  it('formats prices, showing Ask for free-form pricing', () => {
    expect(formatCataloguePrice(0)).toBe('Ask');
    expect(formatCataloguePrice(7000)).toContain('₦');
    expect(formatCataloguePrice(7000)).toContain('7,000');
  });

  it('renders the full catalogue grouped by category', () => {
    const c = createCatalogue(restaurant, [
      { id: 'a', name: 'Grill', description: '', price: 7000, category: 'menu', emoji: '🍖', featured: true },
      { id: 'b', name: 'Delivery', description: '', price: 2000, category: 'services', emoji: '🛵', featured: false },
    ]);
    const text = catalogueFullText(c, restaurant);
    expect(text).toContain('MENU ITEMS');
    expect(text).toContain('SERVICES');
    expect(text).toContain('Grill');
    expect(text).toContain('Meat Club');
    expect(text).toContain('Order/Book');
  });

  it('saves and reloads the catalogue per business', () => {
    const c = createCatalogue(restaurant);
    saveCatalogue('biz1', c);
    const loaded = loadCatalogue('biz1');
    expect(loaded).not.toBeNull();
    expect((loaded as Catalogue).items.length).toBe(c.items.length);
    expect(loadCatalogue('other')).toBeNull();
  });

  it('returns null when no catalogue has been saved', () => {
    expect(loadCatalogue('empty')).toBeNull();
  });
});
