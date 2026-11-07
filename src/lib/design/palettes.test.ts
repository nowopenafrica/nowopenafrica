import { describe, expect, it } from 'vitest';
import { contrastRatio, normaliseHex, relativeLuminance } from './styles';
import {
  displayOnlyRoles,
  paletteOf,
  PALETTES,
  readableInk,
  TEXT_ROLES,
  type PaletteFamily,
} from './palettes';

const FAMILIES: PaletteFamily[] = ['warm', 'cool', 'earth', 'bold', 'pastel', 'mono'];

const hue = (hex: string): number => {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

describe('palettes', () => {
  it('ships at least 30 palettes, at least 3 per family', () => {
    expect(PALETTES.length).toBeGreaterThanOrEqual(30);
    for (const f of FAMILIES) {
      expect(PALETTES.filter((p) => p.family === f).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('has unique keys and names', () => {
    expect(new Set(PALETTES.map((p) => p.key)).size).toBe(PALETTES.length);
    expect(new Set(PALETTES.map((p) => p.name)).size).toBe(PALETTES.length);
  });

  it('stores only normalised 6-digit hex', () => {
    for (const p of PALETTES) {
      for (const c of Object.values(p.colours)) {
        expect(c, p.key).toBe(normaliseHex(c));
        expect(c, p.key).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('puts ink on the ground at 4.5:1 or better', () => {
    for (const p of PALETTES) {
      expect(contrastRatio(p.colours.ink, p.colours.ground), p.key).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('can set readable text on every text role', () => {
    for (const p of PALETTES) {
      for (const role of TEXT_ROLES) {
        const c = p.colours[role];
        const ratio = contrastRatio(readableInk(c), c);
        const displayOk = (role === 'highlight' || role === 'primary') && ratio >= 3;
        expect(ratio >= 4.5 || displayOk, `${p.key}.${role} ${ratio.toFixed(2)}`).toBe(true);
      }
    }
  });

  it('reports display-only roles consistently', () => {
    for (const p of PALETTES) {
      for (const role of displayOnlyRoles(p)) {
        expect(['primary', 'highlight']).toContain(role);
        expect(contrastRatio(readableInk(p.colours[role]), p.colours[role])).toBeLessThan(4.5);
      }
    }
  });

  it('matches its declared scheme', () => {
    for (const p of PALETTES) {
      expect(p.scheme === 'dark', p.key).toBe(relativeLuminance(p.colours.ground) < 0.2);
    }
  });

  it('keeps secondary a different hue from primary outside mono', () => {
    for (const p of PALETTES.filter((q) => q.family !== 'mono')) {
      const d = Math.abs(hue(p.colours.primary) - hue(p.colours.secondary));
      expect(Math.min(d, 360 - d), p.key).toBeGreaterThanOrEqual(40);
    }
  });

  it('returns null for an unknown key', () => {
    expect(paletteOf('nope')).toBeNull();
    expect(paletteOf(undefined)).toBeNull();
  });

  it('finds a palette by key', () => {
    expect(paletteOf(PALETTES[0].key)).toBe(PALETTES[0]);
  });
});
