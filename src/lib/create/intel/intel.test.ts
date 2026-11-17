import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIRECTIONS } from '../../design/directions';
import { PALETTES, paletteOf } from '../../design/palettes';
import { INDUSTRY_GROUPS } from '../../design/taxonomy';
import { TYPEFACES, TYPE_PAIRINGS } from '../../design/typefaces';
import { CATEGORIES } from '../catalogueTaxonomy';
import { localDateISO } from '../../dates';
import {
  ALL_PAIRINGS, ARCHETYPES, FACE_GAPS, INDUSTRIES, INTEL_PAIRINGS, MOVEMENTS, PHOTOGRAPHY,
  REQUEST_FAMILIES, TRENDS, activeTrends, archetypeOf, movementsForIndustry, overdueTrends,
} from './index';
import { GENERATED_DOCS } from './docs';

const unique = (xs: string[]) => new Set(xs).size === xs.length;
const movementKeys = new Set(MOVEMENTS.map((m) => m.key));

describe('movements', () => {
  it('holds 25 movements with unique keys and names', () => {
    expect(MOVEMENTS).toHaveLength(25);
    expect(unique(MOVEMENTS.map((m) => m.key))).toBe(true);
    expect(unique(MOVEMENTS.map((m) => m.name))).toBe(true);
  });

  it.each(MOVEMENTS.map((m) => [m.key, m] as const))('%s points only at things that exist', (_k, m) => {
    expect(DIRECTIONS.map((d) => d.key)).toContain(m.group);
    for (const p of m.pairings) expect(ALL_PAIRINGS.map((x) => x.key), `pairing ${p}`).toContain(p);
    for (const a of m.archetypes) expect(ARCHETYPES.map((x) => x.key), `archetype ${a}`).toContain(a);
    for (const mode of m.imagery) expect(PHOTOGRAPHY.map((x) => x.mode), `imagery ${mode}`).toContain(mode);
    const pal = paletteOf(m.samplePalette);
    expect(pal, `palette ${m.samplePalette}`).not.toBeNull();
    expect(m.paletteFamilies).toContain(pal!.family);
  });

  it.each(MOVEMENTS.map((m) => [m.key, m] as const))('%s says when to use it and when not to', (_k, m) => {
    expect(m.principles.length).toBeGreaterThanOrEqual(3);
    expect(m.useWhen.length).toBeGreaterThanOrEqual(3);
    expect(m.avoidWhen.length).toBeGreaterThanOrEqual(3);
    expect(m.pitfalls.length).toBeGreaterThanOrEqual(3);
    expect(m.archetypes.length).toBeGreaterThanOrEqual(3);
    expect(unique(m.archetypes)).toBe(true);
  });

  it('never offers a picture-only layout to a movement that uses no pictures', () => {
    for (const m of MOVEMENTS) {
      const noPictures = m.imagery.every((i) => i === 'none');
      if (noPictures) expect(m.archetypes.every((a) => !archetypeOf(a).needsImage), m.key).toBe(true);
      // And a movement that can run without a picture has a layout that needs none.
      if (m.imagery.includes('none')) expect(m.archetypes.some((a) => !archetypeOf(a).needsImage), m.key).toBe(true);
    }
  });

  it('uses every archetype at least once, and no two movements share the same three', () => {
    const used = new Set(MOVEMENTS.flatMap((m) => m.archetypes));
    for (const a of ARCHETYPES) expect(used.has(a.key), a.key).toBe(true);
    expect(unique(MOVEMENTS.map((m) => m.archetypes.join('|')))).toBe(true);
  });
});

describe('pairings', () => {
  it('adds pairings without renaming the existing ones', () => {
    expect(unique(ALL_PAIRINGS.map((p) => p.key))).toBe(true);
    expect(ALL_PAIRINGS.slice(0, TYPE_PAIRINGS.length)).toEqual(TYPE_PAIRINGS);
  });

  it('uses only faces we ship, and never an accent face for a headline', () => {
    const faces = new Map(TYPEFACES.map((t) => [t.key, t]));
    for (const p of INTEL_PAIRINGS) {
      for (const k of [p.display, p.text, p.accent]) expect(faces.has(k), `${p.key}: ${k}`).toBe(true);
      expect(faces.get(p.display)!.role, p.key).not.toBe('accent');
    }
  });

  it('keeps Coolvetica for NowOpen: no library pairing hands it to a customer design', () => {
    for (const p of INTEL_PAIRINGS) expect([p.display, p.text, p.accent]).not.toContain('coolvetica');
  });

  it('lists missing voices as proposals against real movements', () => {
    for (const g of FACE_GAPS) {
      expect(g.status).toBe('proposed');
      for (const m of g.movements) expect(movementKeys.has(m), m).toBe(true);
      expect(TYPEFACES.map((t) => t.label)).not.toContain(g.candidate);
    }
  });
});

describe('industries', () => {
  it('holds 25 profiles with unique keys', () => {
    expect(INDUSTRIES).toHaveLength(25);
    expect(unique(INDUSTRIES.map((i) => i.key))).toBe(true);
  });

  it.each(INDUSTRIES.map((i) => [i.key, i] as const))('%s is complete and consistent', (_k, i) => {
    expect(INDUSTRY_GROUPS).toContain(i.group);
    for (const k of [...i.fits, ...i.avoid]) expect(movementKeys.has(k), k).toBe(true);
    expect(i.fits.filter((k) => i.avoid.includes(k))).toEqual([]);
    expect(i.fits.length).toBeGreaterThanOrEqual(3);
    expect(i.avoid.length).toBeGreaterThanOrEqual(2);
    expect(i.mustCarry.length).toBeGreaterThanOrEqual(3);
    expect(i.imagery.length).toBeGreaterThanOrEqual(1);
    expect(i.cautions.length).toBeGreaterThanOrEqual(1);
    expect(i.deliverables.length).toBeGreaterThanOrEqual(3);
  });

  it('gives every movement at least one industry it suits', () => {
    const fitted = new Set(INDUSTRIES.flatMap((i) => i.fits));
    for (const m of MOVEMENTS) expect(fitted.has(m.key), m.key).toBe(true);
  });

  it('ranks fits first, drops avoids, and never blocks an unknown industry', () => {
    const list = movementsForIndustry('skincare-beauty').map((m) => m.key);
    expect(list.slice(0, 2)).toEqual(['luxury-minimalism', 'organic-natural']);
    expect(list).not.toContain('constructivism');
    expect(movementsForIndustry('no-such-trade')).toHaveLength(25);
    expect(movementsForIndustry(null)).toHaveLength(25);
  });

  it('offers at least three movements in three different groups, so three concepts can differ', () => {
    for (const i of INDUSTRIES) {
      const groups = new Set(movementsForIndustry(i.key).slice(0, 6).map((m) => m.group));
      expect(groups.size, i.key).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('trends', () => {
  const iso = /^\d{4}-\d{2}-\d{2}$/;

  it('dates every entry and points at real movements', () => {
    expect(unique(TRENDS.map((t) => t.key))).toBe(true);
    for (const t of TRENDS) {
      expect(t.added).toMatch(iso);
      expect(t.reviewBy).toMatch(iso);
      expect(t.reviewBy > t.added, t.key).toBe(true);
      expect(t.basis.length).toBeGreaterThan(20);
      expect(t.caution.length).toBeGreaterThan(10);
      for (const m of t.movements) expect(movementKeys.has(m), `${t.key}: ${m}`).toBe(true);
    }
  });

  it('has no trend past its review date: review it, re-date it or retire it', () => {
    expect(overdueTrends(localDateISO()).map((t) => t.key)).toEqual([]);
  });

  it('shows nothing that is unapproved or stale', () => {
    const proposed = TRENDS.filter((t) => t.status === 'proposed').map((t) => t.key);
    const active = activeTrends('2026-11-15').map((t) => t.key);
    for (const k of proposed) expect(active).not.toContain(k);
    expect(activeTrends('2099-01-01')).toEqual([]);
  });

  it('claims no statistics', () => {
    for (const t of TRENDS) expect(`${t.summary} ${t.basis}`, t.key).not.toMatch(/\d+\s?%|\bpercent\b/i);
  });
});

describe('request taxonomy', () => {
  it('maps seven families onto catalogue categories, covering all of them', () => {
    expect(REQUEST_FAMILIES).toHaveLength(7);
    const keys = CATEGORIES.map((c) => c.key as string);
    for (const r of REQUEST_FAMILIES) for (const c of r.categories) expect(keys, `${r.key}: ${c}`).toContain(c);
    const covered = new Set(REQUEST_FAMILIES.flatMap((r) => r.categories));
    for (const k of keys) expect(covered.has(k), k).toBe(true);
  });
});

describe('sample palettes', () => {
  it('are real palettes', () => {
    const keys = PALETTES.map((p) => p.key);
    for (const m of MOVEMENTS) expect(keys).toContain(m.samplePalette);
  });
});

describe('docs/creative-intelligence', () => {
  it.each(Object.keys(GENERATED_DOCS))('%s matches the registry (run `npm run intel:docs`)', (name) => {
    const path = `docs/creative-intelligence/${name}`;
    expect(existsSync(path), `${path} is missing`).toBe(true);
    expect(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).toBe(GENERATED_DOCS[name]());
  });

  it.each(['README.md', 'fundamentals.md', 'print-production.md'])('%s exists', (name) => {
    expect(existsSync(`docs/creative-intelligence/${name}`)).toBe(true);
  });
});
