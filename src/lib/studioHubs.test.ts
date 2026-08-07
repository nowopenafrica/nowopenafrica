import { describe, it, expect } from 'vitest';
import { HUBS, HOME_MODULES, HIDDEN_MODULES, INTENTS, hubOf, greeting, type ModuleKey } from './studioHubs';

// The IA is data, so the shelving can be checked mechanically. These tests exist
// because the module registry is edited by hand in several places at once —
// removing QR Studio, AI Creative Director and Review Manager touched four
// separate lists, and a module dropped from one but not the others becomes
// either unreachable or duplicated with no visible error.

const ALL: ModuleKey[] = [
  'home', 'brand-kit', 'card',
  'design', 'social', 'copywriter', 'assistant',
  'campaigns', 'promotions', 'live-promo', 'planner', 'landing',
  'quotations', 'invoices', 'catalogues', 'loyalty',
  'health', 'analytics', 'challenges',
  'media', 'export',
];

describe('Studio information architecture', () => {
  it('places every module exactly once — no orphans, no duplicates', () => {
    const placed = [...HUBS.flatMap((h) => h.modules), ...HOME_MODULES, ...HIDDEN_MODULES];

    const missing = ALL.filter((k) => !placed.includes(k));
    expect(missing, `unreachable modules: ${missing.join(', ')}`).toEqual([]);

    const duplicated = placed.filter((k, i) => placed.indexOf(k) !== i);
    expect(duplicated, `modules in two places: ${duplicated.join(', ')}`).toEqual([]);
  });

  it('never places a module in more than one hub', () => {
    for (const key of ALL) {
      const hubs = HUBS.filter((h) => h.modules.includes(key));
      expect(hubs.length, `${key} is in ${hubs.length} hubs`).toBeLessThanOrEqual(1);
    }
  });

  it('keeps Growth out of the hubs — it is the front door, not a peer', () => {
    expect(hubOf('home')).toBeUndefined();
    expect(hubOf('challenges')).toBeUndefined();
  });

  it('reports the hub for a visible module', () => {
    expect(hubOf('design')).toBe('create');
    expect(hubOf('social')).toBe('promote');
    expect(hubOf('invoices')).toBe('manage');
  });

  it('stays at three hubs — a fourth is how the old eight-group menu grew back', () => {
    expect(HUBS.map((h) => h.key)).toEqual(['create', 'promote', 'manage']);
  });
});

describe('intent launcher', () => {
  // A tile that opens an empty page is worse than no tile: it teaches the owner
  // the product is hollow. Every intent must land somewhere real.
  it('only targets modules that are reachable', () => {
    const reachable = [...HUBS.flatMap((h) => h.modules), ...HOME_MODULES];
    for (const intent of INTENTS) {
      expect(reachable, `intent "${intent.label}" targets unreachable ${intent.target}`).toContain(intent.target);
    }
  });

  it('has unique ids and labels', () => {
    expect(new Set(INTENTS.map((i) => i.id)).size).toBe(INTENTS.length);
    expect(new Set(INTENTS.map((i) => i.label)).size).toBe(INTENTS.length);
  });

  it('describes an outcome, not a tool name', () => {
    for (const intent of INTENTS) {
      expect(intent.outcome.length, `${intent.label} has no outcome`).toBeGreaterThan(8);
      expect(intent.outcome.toLowerCase()).not.toContain('studio');
    }
  });
});

describe('greeting', () => {
  it('follows the clock', () => {
    expect(greeting(0)).toBe('Good morning');
    expect(greeting(11)).toBe('Good morning');
    expect(greeting(12)).toBe('Good afternoon');
    expect(greeting(16)).toBe('Good afternoon');
    expect(greeting(17)).toBe('Good evening');
    expect(greeting(23)).toBe('Good evening');
  });
});
