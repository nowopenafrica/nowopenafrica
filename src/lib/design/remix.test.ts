import { describe, expect, it } from 'vitest';

import { PATTERNS } from './patterns';
import { contrastRatio } from './styles';
import {
  PALETTES, TEXT_ROLES, readableInk, type Palette, type PaletteRole,
} from './palettes';
import { TYPE_PAIRINGS } from './typefaces';
import type { Look, LookPart } from './look';
import { brandPalette, needsMet, remixLook, seedFrom, type Harmony, type TextNeed } from './remix';

/** The brand colours styles.test.ts uses: dark, mid, light, saturated, near-white. */
const BRANDS = [
  '#2563eb', '#0b1220', '#e11d48', '#f59e0b', '#facc15',
  '#065f46', '#ffffff', '#111111', '#7c3aed', '#22d3ee', '#fef08a',
];
const HARMONIES: Harmony[] = ['analogous', 'complementary', 'split'];
const SCHEMES = ['dark', 'light'] as const;
const ROLES: PaletteRole[] = ['ground', 'ink', 'primary', 'secondary', 'highlight'];
const ALL_PARTS: LookPart[] = ['palette', 'gradient', 'pattern', 'type'];

const BASE: Look = {
  palette: 'lagoon',
  gradient: { kind: 'linear', stops: ['ground', 'secondary'], angle: 180 },
  pattern: { key: 'dots', role: 'primary', opacity: 0.08, scale: 0.1 },
  type: 'modern',
};

describe('brandPalette', () => {
  it('builds a full readable palette from one brand colour', () => {
    for (const primary of BRANDS) {
      for (const scheme of SCHEMES) {
        for (const harmony of HARMONIES) {
          const pal = brandPalette({ primary, scheme, harmony }) as Palette;
          const tag = `${primary} ${scheme} ${harmony}`;
          expect(pal, tag).not.toBeNull();
          for (const r of ROLES) expect(pal.colours[r], `${tag} ${r}`).toMatch(/^#[0-9a-f]{6}$/);
          expect(contrastRatio(pal.colours.ink, pal.colours.ground), tag).toBeGreaterThanOrEqual(4.5);
          expect(pal.scheme).toBe(scheme);
          for (const role of TEXT_ROLES) {
            const c = pal.colours[role];
            const ratio = contrastRatio(readableInk(c), c);
            const displayOk = (role === 'highlight' || role === 'primary') && ratio >= 3;
            expect(ratio >= 4.5 || displayOk, `${tag} ${role} ${ratio.toFixed(2)}`).toBe(true);
          }
        }
      }
    }
  });

  it('keeps the brand colour as primary when it can carry type', () => {
    const pal = brandPalette({ primary: '#0f766e', scheme: 'dark' });
    expect(pal?.colours.primary).toBe('#0f766e');
  });

  it('uses a supplied secondary colour', () => {
    const pal = brandPalette({ primary: '#0f766e', secondary: '#7c3aed', scheme: 'dark' });
    expect(pal?.colours.secondary).toBe('#7c3aed');
  });

  it('rejects a colour it cannot read', () => {
    expect(brandPalette({ primary: 'red', scheme: 'dark' })).toBeNull();
    expect(brandPalette({ primary: '#12', scheme: 'dark' })).toBeNull();
    expect(brandPalette({ primary: '', scheme: 'light' })).toBeNull();
  });
});

describe('remixLook', () => {
  const none = new Set<LookPart>();

  it('remixes deterministically', () => {
    for (let s = 1; s <= 20; s += 1) {
      expect(remixLook(BASE, s, none, 'dark')).toEqual(remixLook(BASE, s, none, 'dark'));
    }
    const keys = new Set<string>();
    for (let s = 1; s <= 20; s += 1) keys.add(remixLook(BASE, s, none, 'dark').palette);
    expect(keys.size).toBeGreaterThanOrEqual(8);
  });

  it('never changes a locked part', () => {
    for (const part of ALL_PARTS) {
      const locks = new Set<LookPart>([part]);
      for (let s = 1; s <= 20; s += 1) {
        const out = remixLook(BASE, s, locks, 'dark');
        expect(out[part], `${part} seed ${s}`).toEqual(BASE[part]);
      }
    }
  });

  it('returns the base look when everything is locked', () => {
    expect(remixLook(BASE, 7, new Set(ALL_PARTS), 'dark')).toEqual(BASE);
  });

  it('only picks palettes on the template’s scheme side', () => {
    for (const scheme of SCHEMES) {
      for (let s = 1; s <= 40; s += 1) {
        const pal = PALETTES.find((p) => p.key === remixLook(BASE, s, new Set(['gradient']), scheme).palette);
        expect(pal?.scheme, `${scheme} seed ${s}`).toBe(scheme);
      }
    }
  });

  it('chooses palettes whose text roles are readable', () => {
    for (const scheme of SCHEMES) {
      for (let s = 1; s <= 60; s += 1) {
        const out = remixLook(BASE, s, none, scheme);
        const pal = PALETTES.find((p) => p.key === out.palette) as Palette;
        for (const role of TEXT_ROLES) {
          const c = pal.colours[role];
          const ratio = contrastRatio(readableInk(c), c);
          const displayOk = (role === 'highlight' || role === 'primary') && ratio >= 3;
          expect(ratio >= 4.5 || displayOk, `${pal.key}.${role}`).toBe(true);
        }
      }
    }
  });

  it('keeps patterns faint and off the ground role, and gradients to roles', () => {
    const roleSet = new Set<string>(ROLES);
    for (let s = 1; s <= 60; s += 1) {
      const out = remixLook(BASE, s, none, 'light');
      if (out.pattern) {
        expect(out.pattern.opacity).toBeLessThanOrEqual(0.12);
        expect(out.pattern.opacity).toBeGreaterThan(0);
        expect(out.pattern.role).not.toBe('ground');
        expect(PATTERNS.map((p) => p.key)).toContain(out.pattern.key);
      }
      if (out.gradient) {
        expect(out.gradient.stops.length).toBeGreaterThanOrEqual(2);
        expect(out.gradient.stops.length).toBeLessThanOrEqual(4);
        for (const st of out.gradient.stops) expect(roleSet.has(st)).toBe(true);
      }
      expect(TYPE_PAIRINGS.map((p) => p.key)).toContain(out.type);
    }
  });

  it('does not let a lock change what the other parts do', () => {
    for (let s = 1; s <= 10; s += 1) {
      const free = remixLook(BASE, s, none, 'dark');
      const locked = remixLook(BASE, s, new Set<LookPart>(['type']), 'dark');
      expect(locked.palette).toBe(free.palette);
    }
  });
});

describe('text needs', () => {
  // Role-toned body text on the ground: what a pastel palette cannot give.
  const NEEDS: TextNeed[] = [
    { fg: 'primary', bgs: ['ground'], min: 4.5 },
    { fg: 'ink', bgs: ['ground'], min: 4.5 },
  ];

  it('only remixes onto palettes that meet the needs', () => {
    for (const scheme of SCHEMES) {
      for (let s = 1; s <= 40; s += 1) {
        const out = remixLook(BASE, s, new Set<LookPart>(), scheme, NEEDS);
        const pal = PALETTES.find((p) => p.key === out.palette) as Palette;
        expect(needsMet(pal.colours, NEEDS, out.gradient?.stops), `${scheme} seed ${s} ${pal.key}`).toBe(true);
      }
    }
  });

  it('keeps the stops of a locked gradient under the ink', () => {
    // A light base: no DARK palette has an accent that carries its own ink, so
    // on the dark side the only honest answer is to keep the base palette.
    const light: Look = { ...BASE, palette: 'cobalt-pop', gradient: { kind: 'linear', stops: ['ground', 'highlight'], angle: 180 } };
    const locks = new Set<LookPart>(['gradient']);
    let moved = 0;
    for (let s = 1; s <= 40; s += 1) {
      const out = remixLook(light, s, locks, 'light', NEEDS);
      const pal = PALETTES.find((p) => p.key === out.palette) as Palette;
      if (pal.key !== light.palette) moved += 1;
      for (const stop of light.gradient?.stops ?? []) {
        expect(contrastRatio(pal.colours.ink, pal.colours[stop]), `seed ${s} ${pal.key}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('nudges a brand palette until primary reads on its own ground', () => {
    for (const primary of BRANDS) {
      for (const scheme of SCHEMES) {
        const pal = brandPalette({ primary, scheme, needs: NEEDS }) as Palette;
        expect(needsMet(pal.colours, NEEDS), `${primary} ${scheme}`).toBe(true);
      }
    }
  });

  it('leaves a brand colour alone when it already meets the needs', () => {
    const pal = brandPalette({ primary: '#22d3ee', scheme: 'dark', needs: NEEDS }) as Palette;
    expect(pal.colours.primary).toBe('#22d3ee');
  });

  it('behaves as before when no needs are passed', () => {
    const a = brandPalette({ primary: '#0f766e', scheme: 'dark' });
    const b = brandPalette({ primary: '#0f766e', scheme: 'dark', needs: [] });
    expect(b?.colours).toEqual(a?.colours);
  });
});

describe('seedFrom', () => {
  it('is stable and 32-bit', () => {
    expect(seedFrom('abc')).toBe(seedFrom('abc'));
    expect(seedFrom('abc')).not.toBe(seedFrom('abd'));
    const v = seedFrom('NowOpen');
    expect(Number.isInteger(v) && v >= 0 && v <= 0xffffffff).toBe(true);
  });
});
