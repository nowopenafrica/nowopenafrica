import { describe, expect, it } from 'vitest';
import { DIRECTIONS, directionOf, directionProblems } from './directions';
import { TYPE_PAIRINGS } from './typefaces';
import type { PaletteFamily } from './palettes';
import type { DesignTemplate } from '../designTemplates';

const FAMILIES: PaletteFamily[] = ['warm', 'cool', 'earth', 'bold', 'pastel', 'mono'];

describe('creative directions', () => {
  it('has 8 directions with unique keys and archetypes', () => {
    expect(DIRECTIONS).toHaveLength(8);
    expect(new Set(DIRECTIONS.map((d) => d.key)).size).toBe(8);
    expect(new Set(DIRECTIONS.map((d) => d.archetype)).size).toBe(8);
  });

  it('only uses pairings that exist, at least one each', () => {
    const known = new Set(TYPE_PAIRINGS.map((p) => p.key));
    for (const d of DIRECTIONS) {
      expect(d.pairings.length).toBeGreaterThan(0);
      for (const p of d.pairings) expect(known.has(p)).toBe(true);
    }
  });

  it('only uses real palette families', () => {
    for (const d of DIRECTIONS) {
      expect(d.paletteFamilies.length).toBeGreaterThan(0);
      for (const f of d.paletteFamilies) expect(FAMILIES).toContain(f);
    }
  });

  it('writes each intent as one sentence under 120 characters', () => {
    for (const d of DIRECTIONS) {
      expect(d.intent.length).toBeLessThan(120);
      expect(d.intent.match(/[.!?]/g) ?? []).toHaveLength(1);
      expect(d.intent.trim().endsWith('.')).toBe(true);
    }
  });

  it('looks directions up by key', () => {
    expect(directionOf('luxury')?.archetype).toBe('whitespace-centred');
    expect(directionOf('nope')).toBeNull();
    expect(directionOf(undefined)).toBeNull();
  });

  it('flags industry templates without industries, and unknown keys', () => {
    const base = { key: 'x', label: 'X' } as unknown as DesignTemplate;
    expect(directionProblems({ ...base, direction: 'industry' })).toHaveLength(1);
    expect(directionProblems({ ...base, direction: 'industry', industries: [] })).toHaveLength(1);
    expect(directionProblems({ ...base, direction: 'industry', industries: ['Health'] })).toEqual([]);
    expect(directionProblems({ ...base, direction: 'bogus' as never })).toHaveLength(1);
    expect(directionProblems(base)).toEqual([]);
    expect(directionProblems({ ...base, direction: 'bold' })).toEqual([]);
  });
});
