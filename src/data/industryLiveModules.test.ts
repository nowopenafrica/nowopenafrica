import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { BUSINESS_CATEGORIES } from './categories';
import { CATEGORY_FEATURES, getCategoryFeatures } from './categoryFeatures';
import { INDUSTRIES, liveModulesFor } from './industrySystems';

/**
 * What /platform claims each industry can do.
 *
 * The page's `groups` are the full vision, most of it unbuilt, and every chip
 * used to carry a green tick — which reads as "this works". The shipped module
 * map meanwhile grew to cover all 250 categories and appeared nowhere.
 *
 * The fix is a live-module list DERIVED from `categoryFeatures.ts`. These tests
 * exist to keep it derived: a hand-written list would drift the moment someone
 * added a module, and drift here means the marketing page claiming a feature
 * the product does not have.
 */

const stripComments = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const systems = stripComments(readFileSync('src/data/industrySystems.ts', 'utf8'));
const platform = stripComments(readFileSync('src/pages/Platform.tsx', 'utf8'));

describe('every industry is featured with its real modules', () => {
  it('covers all 250 categories across the industries', () => {
    // An uncovered category is a business type /platform never mentions.
    const covered = new Set(INDUSTRIES.flatMap((i) => i.categories));
    const missing = BUSINESS_CATEGORIES.filter((c) => !covered.has(c));
    expect(missing, `not featured: ${missing.join(', ')}`).toEqual([]);
  });

  it('gives every industry at least one working module', () => {
    // Now that all 250 categories transact, an industry with an empty
    // "Working today" block would mean a broken derivation, not an honest gap.
    const empty = INDUSTRIES.filter((i) => liveModulesFor(i).length === 0);
    expect(empty.map((i) => i.name), 'no live modules').toEqual([]);
  });

  it('lists only interactions the module map actually ships', () => {
    /*
     * The assertion that matters. Every label must be a tabLabel that really
     * exists on one of that industry's own categories — so the page cannot
     * name a capability the product does not have, for that industry.
     */
    for (const industry of INDUSTRIES) {
      const shipped = new Set(
        industry.categories.flatMap((c) => getCategoryFeatures(c).map((f) => f.tabLabel)),
      );
      for (const mod of liveModulesFor(industry)) {
        expect(shipped, `${industry.name}: ${mod.label}`).toContain(mod.label);
      }
    }
  });

  it('counts categories honestly, never more than the industry has', () => {
    for (const industry of INDUSTRIES) {
      for (const mod of liveModulesFor(industry)) {
        expect(mod.categories, `${industry.name}/${mod.label}`).toBeGreaterThan(0);
        expect(mod.categories, `${industry.name}/${mod.label}`)
          .toBeLessThanOrEqual(industry.categories.length);
      }
    }
  });

  it('orders by how much of the industry runs it', () => {
    // The first chip should be what that industry mostly does, which is only
    // true if the sort is by category count.
    for (const industry of INDUSTRIES) {
      const counts = liveModulesFor(industry).map((m) => m.categories);
      expect([...counts].sort((a, b) => b - a), industry.name).toEqual(counts);
    }
  });

  it('reflects a new module without anyone editing a marketing list', () => {
    /*
     * The derivation proven end to end: Salon / Barber ships a queue, and the
     * Barbers industry must therefore advertise one. Nothing in
     * industrySystems.ts mentions a queue — it comes from the module map.
     */
    const barbers = INDUSTRIES.find((i) => i.slug === 'barbers');
    expect(barbers).toBeDefined();
    expect(liveModulesFor(barbers!).map((m) => m.label)).toContain('Queue');
    expect(CATEGORY_FEATURES['Salon / Barber'].map((f) => f.tabLabel)).toContain('Queue');
  });
});

describe('the list stays computed, not authored', () => {
  it('derives from CATEGORY_FEATURES rather than a literal', () => {
    expect(systems).toContain("import { CATEGORY_FEATURES } from './categoryFeatures'");
    expect(systems).toMatch(/export function liveModulesFor/);
    expect(systems).toMatch(/CATEGORY_FEATURES\[category\]/);
    // No hand-maintained live list hiding in the industry definitions.
    expect(systems).not.toMatch(/liveModules:\s*\[/);
  });

  it('does not let an industry declare its own working set', () => {
    for (const industry of INDUSTRIES) {
      expect(industry, industry.name).not.toHaveProperty('liveModules');
    }
  });
});

describe('the page distinguishes shipped from planned', () => {
  it('renders the derived modules, not the industry groups, as what works', () => {
    expect(platform).toContain('liveModulesFor(active)');
    expect(platform).toContain('Working today');
    expect(platform).toMatch(/liveModules\.map\(\(mod\) =>/);
  });

  it('stops putting a green tick on unbuilt roadmap features', () => {
    /*
     * The old panel rendered `<Check className="text-green-500" />` beside
     * every feature in `groups`, including ones that do not exist. A tick is a
     * claim. The roadmap chips now carry a neutral marker instead.
     */
    const groupsBlock = platform.slice(platform.indexOf('active.groups.map'));
    expect(groupsBlock).not.toMatch(/<Check[^>]*text-green/);
    expect(groupsBlock).toMatch(/<Plus/);
    expect(platform).toContain('The full system we are building');
  });
});
