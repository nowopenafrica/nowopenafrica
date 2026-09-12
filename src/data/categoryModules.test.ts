import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { BUSINESS_CATEGORIES } from './categories';
import {
  CATEGORY_FEATURES,
  MODULE_LIBRARY,
  getActiveFeatures,
  getCategoryFeatures,
} from './categoryFeatures';

/**
 * The module map: which categories can actually transact.
 *
 * A category with no module gets a profile with a Contact button and nothing
 * to do — the visitor has to leave the platform to buy anything. 140 of the
 * 250 categories were in that state, and the reason was nearly always that
 * the trade does not take a dated appointment: a consultancy takes an
 * enquiry, a school an application, a barber a place in the queue, a cinema
 * a seat, a gym a plan.
 */

const stripComments = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const profile = stripComments(
  readFileSync('src/pages/BusinessDetail.tsx', 'utf8'),
);

describe('every category can transact', () => {
  it('leaves no category without a module', () => {
    const orphans = BUSINESS_CATEGORIES.filter(
      (c) => getCategoryFeatures(c).length === 0,
    );
    expect(orphans, `no module: ${orphans.join(', ')}`).toEqual([]);
  });

  it('keys the map only off real categories', () => {
    // A key that is not a category is a module nothing can ever reach.
    for (const key of Object.keys(CATEGORY_FEATURES)) {
      expect(BUSINESS_CATEGORIES, key).toContain(key);
    }
  });
});

describe('a business page can run more than one module', () => {
  it('gives the trades that need several more than one', () => {
    /*
     * These are not chosen for variety. Each is a business that cannot be
     * served by a single form: the block industry sells blocks and then has
     * to deliver them; the dealer sells, values a trade-in and books test
     * drives; the AC engineer repairs, installs, and sells a service plan.
     */
    for (const c of [
      'Restaurant',
      'Salon / Barber',
      'Car Dealership',
      'Air Conditioning & Refrigeration',
      'Block Industry & Cement',
      'Ride-Hailing & Taxi',
      'University & College',
      'Building Materials Store',
    ]) {
      expect(getCategoryFeatures(c).length, c).toBeGreaterThan(1);
    }
  });

  it('keeps module keys unique inside a category', () => {
    // Two modules sharing a key would collapse into one: `find` by key
    // resolves the first, and React would warn on the duplicate list key.
    const clashes: string[] = [];
    for (const [cat, mods] of Object.entries(CATEGORY_FEATURES)) {
      const keys = mods.map((m) => m.key);
      const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
      if (dupes.length) clashes.push(`${cat} -> ${[...new Set(dupes)].join(', ')}`);
    }
    expect(clashes, clashes.join(' | ')).toEqual([]);
  });

  it('gives every module something to say and something to do', () => {
    for (const [cat, mods] of Object.entries(CATEGORY_FEATURES)) {
      for (const m of mods) {
        expect(m.key, cat).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(m.ctaLabel.length, `${cat}/${m.key}`).toBeGreaterThan(3);
        expect(m.tabLabel.length, `${cat}/${m.key}`).toBeGreaterThan(0);
        // A cart module needs products; anything else needs a source or none.
        expect(['service', 'product', 'none'], `${cat}/${m.key}`).toContain(m.itemSource);
      }
    }
  });
});

describe('every declared module is reachable on the page', () => {
  /*
   * The bug this guards against. BusinessDetail selects modules by SHAPE:
   *
   *   const bookingModule = features.find(f => f.itemSource === 'service');
   *
   * With one module per category that was total. It no longer is — most
   * categories now declare two or three, and the extras are usually
   * service-shaped too, so `find` returned the first and dropped the rest.
   * The modal could always render them; nothing opened them.
   */
  it('renders a way into the modules the industry layout does not use', () => {
    expect(profile).toContain('const extraModules = features.filter');
    expect(profile).toContain('extraModules.length > 0');
    expect(profile).toMatch(/extraModules\.map\(mod =>/);
    expect(profile).toMatch(/setBooking\(\{ moduleKey: mod\.key \}\)/);
  });

  it('excludes only the modules the layout already reaches', () => {
    // If a shape is dropped from `reachedKeys` its module renders twice.
    for (const named of [
      'bookingModule',
      'reservationModule',
      'cartModule',
      'productBookingModule',
    ]) {
      expect(profile, named).toMatch(
        new RegExp(`reachedKeys[\\s\\S]{0,240}${named}`),
      );
    }
  });

  it('resolves the opened module from the full list, not from a shape', () => {
    expect(profile).toContain('features.find(f => f.key === booking.moduleKey)');
  });
});

describe('the add-on library', () => {
  it('offers every shape a category can default to', () => {
    // An owner whose category defaults to one module must be able to add the
    // others by hand; a shape missing here is only available by luck of
    // category.
    const names = MODULE_LIBRARY.map((m) => m.name.toLowerCase()).join(' | ');
    for (const shape of ['queue', 'ticket', 'plan', 'application', 'enquir']) {
      expect(names, shape).toContain(shape);
    }
  });

  it('has unique keys, since a business selects modules by key', () => {
    const keys = MODULE_LIBRARY.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('the owner stays in control of what shows', () => {
  it('treats enabled_modules as authoritative when set', () => {
    // A category that now defaults to three modules must not force three onto
    // an owner who chose one.
    const cat = 'Air Conditioning & Refrigeration';
    const defaults = getCategoryFeatures(cat);
    expect(defaults.length).toBeGreaterThan(1);
    const chosen = getActiveFeatures(cat, [defaults[0].key]);
    expect(chosen).toHaveLength(1);
    expect(chosen[0].key).toBe(defaults[0].key);
  });

  it('falls back to the category defaults when nothing is chosen', () => {
    const cat = 'Car Dealership';
    expect(getActiveFeatures(cat, null)).toEqual(getCategoryFeatures(cat));
    expect(getActiveFeatures(cat, undefined)).toEqual(getCategoryFeatures(cat));
  });

  it('lets an owner turn everything off', () => {
    expect(getActiveFeatures('Restaurant', [])).toEqual([]);
  });
});

describe('coverage is local as well as global', () => {
  it('serves the informal trades, not just the incorporated ones', () => {
    /*
     * The platform's audience is Nigerian, and a directory that can only
     * transact for a consultancy and not for a POS agent, a keke rider or a
     * roadside mechanic has the coverage backwards.
     */
    for (const c of [
      'POS & Agent Banking',
      'Keke & Okada Services',
      'Roadside Mechanic',
      'Local Market Stall',
      'Water Vendor',
      'Buka / Local Eatery',
      'Barbing Kiosk',
      'Recharge Card & Data Vendor',
      'Thrift & Second-hand (Okrika)',
      'Football Viewing Centre',
      'Gele & Aso-Oke Styling',
      'Block Industry & Cement',
    ]) {
      expect(getCategoryFeatures(c).length, c).toBeGreaterThan(0);
    }
  });

  it('serves the trades a global business would expect', () => {
    for (const c of [
      'Cloud & Hosting Services',
      'Fintech & Payments',
      'Freight Forwarding',
      'Investment & Wealth Management',
      'Recruitment & HR',
      'Warehousing & Storage',
      'Trademark & IP Services',
      'Cinema & Theatre',
      'Museum & Heritage Site',
      'University & College',
    ]) {
      expect(getCategoryFeatures(c).length, c).toBeGreaterThan(0);
    }
  });
});
