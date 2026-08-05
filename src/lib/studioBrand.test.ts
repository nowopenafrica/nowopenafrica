import { describe, it, expect } from 'vitest';
import {
  hexToRgb, rgbToHex, paletteFromPixels, personalityByKey, brandGuidelinesText,
  PERSONALITIES, BrandPalette,
} from './studioBrand';

describe('studio brand', () => {
  it('converts hex to rgb and back', () => {
    expect(hexToRgb('#16a34a')).toEqual({ r: 22, g: 163, b: 74 });
    expect(rgbToHex(22, 163, 74)).toBe('#16A34A');
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
    expect(rgbToHex(255, 255, 255)).toBe('#FFFFFF');
  });

  it('extracts a deterministic palette from pixels', () => {
    // 4px: two greens, one red, one near-black
    const data = new Uint8ClampedArray([
      0x16, 0xa3, 0x4a, 255,
      0x16, 0xa3, 0x4a, 255,
      0xdc, 0x26, 0x26, 255,
      0x0a, 0x0a, 0x0a, 255,
    ]);
    const p = paletteFromPixels(data) as BrandPalette;
    expect(p.primary).toMatch(/^#[0-9A-F]{6}$/);
    expect(p.accent).toMatch(/^#[0-9A-F]{6}$/);
    expect(p.neutral).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('falls back to the friendly personality for unknown keys', () => {
    expect(personalityByKey('nope').key).toBe('friendly');
  });

  it('every personality has a palette and unique key', () => {
    const keys = PERSONALITIES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of PERSONALITIES) {
      expect(p.palette.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(p.tone.length).toBeGreaterThan(10);
    }
  });

  it('renders brand guidelines with all sections', () => {
    const text = brandGuidelinesText({ name: 'Meat Club', category: 'Restaurant', description: '' }, {
      personality: personalityByKey('friendly'),
      palette: personalityByKey('friendly').palette,
      source: 'default',
    });
    expect(text).toContain('Meat Club');
    expect(text).toContain('LOGO USAGE');
    expect(text).toContain('BRAND COLOURS');
    expect(text).toContain('TYPOGRAPHY');
    expect(text).toContain('BRAND VOICE');
    expect(text).toContain('PHOTOGRAPHY');
  });
});
