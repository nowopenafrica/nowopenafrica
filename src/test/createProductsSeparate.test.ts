/**
 * Two different products both called "Create" — keep them apart.
 *
 * ── WHAT HAPPENED ────────────────────────────────────────────────────────
 *
 * NowOpen has a design-and-print marketplace called **NowOpen Create**: the
 * public page on /media, with a page title, a nav item and its own audit doc
 * (docs/nowopen-create-2.0-audit.md). It sells printed business cards, flyers
 * and posters.
 *
 * It then grew a **Universal Create** hub: the floating button that asks
 * "What do you want to open?" and opens a service, an offer, a reel, a
 * business tool.
 *
 * Both were built into src/components/create/ and src/lib/create/, so one
 * folder held two products. MEASURED 2026-10-06, the homepage carried two
 * visible controls labelled exactly "Create", going to different places.
 *
 * They now live in separate folders and the newer one is labelled "New",
 * because the marketplace's name has prior claim. These tests keep it that
 * way — the failure mode is gradual and silent, which is what a test is for.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MARKETPLACE_DIRS = ['src/components/create', 'src/lib/create'];
const HUB_DIRS = ['src/components/universalCreate', 'src/lib/universalCreate'];

const filesIn = (dir: string) =>
  readdirSync(dir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

describe('the two Create products stay apart', () => {
  it('keeps the marketplace and the hub in separate folders', () => {
    // Both must still exist. A test that passes because a folder vanished
    // would be proving nothing.
    for (const d of [...MARKETPLACE_DIRS, ...HUB_DIRS]) {
      expect(filesIn(d).length, `${d} is empty`).toBeGreaterThan(0);
    }
  });

  it('does not let the hub import the marketplace, or the reverse', () => {
    /*
     * The real risk. One import is harmless; it is the fourth that makes them
     * one tangled product nobody can describe, and by then separating them is
     * a refactor rather than a rule.
     */
    for (const dir of HUB_DIRS) {
      for (const f of filesIn(dir)) {
        const src = readFileSync(join(dir, f), 'utf8');
        const bad = src.match(/from\s+['"][^'"]*(?:components|lib)\/create\/[^'"]+['"]/g);
        expect(bad, `${dir}/${f} imports the marketplace: ${bad?.join(', ')}`).toBeNull();
      }
    }
    for (const dir of MARKETPLACE_DIRS) {
      for (const f of filesIn(dir)) {
        const src = readFileSync(join(dir, f), 'utf8');
        const bad = src.match(/from\s+['"][^'"]*universalCreate\/[^'"]+['"]/g);
        expect(bad, `${dir}/${f} imports the hub: ${bad?.join(', ')}`).toBeNull();
      }
    }
  });

  it('does not label the floating button "Create"', () => {
    /*
     * The nav item labelled "Create" goes to the marketplace on /media. A
     * second control with the same word, three inches away, going somewhere
     * else, is a defect regardless of which one is "right".
     */
    const src = readFileSync('src/components/universalCreate/UniversalCreateButton.tsx', 'utf8');
    const label = src.match(/<span className="text-sm font-bold">([^<]+)<\/span>/)?.[1];
    expect(label, 'the button has no visible label').toBeTruthy();
    expect(label!.trim().toLowerCase()).not.toBe('create');
  });

  it('leaves the marketplace its name', () => {
    // "NowOpen Create" is the marketplace's: public title, nav item, audit doc.
    const media = readFileSync('src/pages/Media.tsx', 'utf8');
    expect(media).toContain('NowOpen Create');
  });
});
