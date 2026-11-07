import { describe, expect, it } from 'vitest';
import { PATTERNS, patternSvg, patternZoneBox } from './patterns';
import type { PatternSpec } from './look';

const spec = (key: PatternSpec['key'], extra: Partial<PatternSpec> = {}): PatternSpec =>
  ({ key, role: 'primary', opacity: 0.1, scale: 0.12, ...extra });

describe('patterns', () => {
  it('ships at least 20 patterns across four families', () => {
    expect(PATTERNS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(PATTERNS.map((p) => p.key)).size).toBe(PATTERNS.length);
    expect(new Set(PATTERNS.map((p) => p.family)).size).toBe(4);
  });

  it('draws every pattern as a self-contained SVG', () => {
    for (const p of PATTERNS) {
      const svg = patternSvg(spec(p.key), 1080, 1080, '#c2410c');
      expect(svg.startsWith('<svg'), p.key).toBe(true);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('#c2410c');
      expect(svg).not.toContain('href="http');
      expect(svg).not.toContain('<script');
      expect(svg).not.toContain('<image');
      expect(svg).not.toContain('NaN');
    }
  });

  it('is deterministic', () => {
    for (const p of PATTERNS) {
      expect(patternSvg(spec(p.key), 800, 600, '#123456')).toBe(patternSvg(spec(p.key), 800, 600, '#123456'));
    }
  });

  it('stays small enough for an A4 export', () => {
    for (const p of PATTERNS) {
      expect(patternSvg(spec(p.key), 2480, 3508, '#c2410c').length, p.key).toBeLessThan(20000);
    }
  });

  it('clips to its zone', () => {
    expect(patternZoneBox('top', 1000, 2000)).toMatchObject({ x: 0, y: 0, w: 1000 });
    expect(patternZoneBox('top', 1000, 2000).h).toBeLessThan(1000);
    expect(patternZoneBox('full', 1000, 2000)).toEqual({ x: 0, y: 0, w: 1000, h: 2000 });
    expect(patternZoneBox(undefined, 1000, 2000)).toEqual({ x: 0, y: 0, w: 1000, h: 2000 });
    const svg = patternSvg(spec('dots', { zone: 'bottom' }), 1000, 2000, '#000000');
    const box = patternZoneBox('bottom', 1000, 2000);
    expect(svg).toContain(`<rect x="0" y="${box.y}" width="1000" height="${box.h}"`);
    for (const zone of ['top', 'bottom', 'left', 'right', 'band'] as const) {
      const b = patternZoneBox(zone, 1000, 2000);
      expect(b.x + b.w).toBeLessThanOrEqual(1000);
      expect(b.y + b.h).toBeLessThanOrEqual(2000);
    }
  });
});
