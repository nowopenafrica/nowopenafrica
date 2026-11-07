import { describe, expect, it } from 'vitest';
import { resolveLook, gradientCss } from './look';
import { PALETTES, TEXT_ROLES, displayOnlyRoles } from './palettes';
import { styleColours, styleOf, contrastRatio, DESIGN_STYLES } from './styles';
import { TYPE_PAIRINGS } from './typefaces';
import { templateByKey, surfaceSpecLayers, shapeColor, inkFor, type DesignTemplate } from '../designTemplates';

const ACCENT = '#2563eb';
const size = { width: 1080, height: 1080 };

describe('resolveLook', () => {
  it("falls back to today's colours for a template with no look", () => {
    for (const key of ['statement', 'ticket', 'promo-burst', 'price-block', 'web-hero']) {
      const tpl = templateByKey(key);
      const style = styleOf(DESIGN_STYLES[0].key);
      const c = styleColours(style, ACCENT, tpl.scheme);
      const r = resolveLook(tpl, { accent: c.accent, base: c.base, styleKey: style.key, ...size });
      expect(r.source, key).toBe('fallback');
      expect(r.roles.primary).toBe(c.accent);
      expect(r.roles.secondary).toBe(c.accent);
      expect(r.roles.highlight).toBe(c.accent);
      expect(r.roles.ground).toBe(c.base);
      expect(r.roles.ink).toBe(inkFor(tpl));
      expect(r.inkOn.ground).toBe(inkFor(tpl));
      expect(r.groundLayers).toEqual(surfaceSpecLayers(tpl, c.accent, c.base));
      expect(r.pairing.key).toBe(style.pairing);
      expect(r.pattern).toBeNull();
      expect(r.duotone).toBeNull();
    }
  });

  it('defaults the fallback pairing to modern and the ground by scheme', () => {
    const tpl = templateByKey('statement');
    const r = resolveLook(tpl, { accent: ACCENT, ...size });
    expect(r.pairing.key).toBe('modern');
    expect(r.roles.ground).toBe(tpl.scheme === 'dark' ? '#0b1220' : '#f7f7f5');
  });

  const fixture = (palette: string, type = 'modern'): DesignTemplate => ({
    ...templateByKey('statement'),
    look: { palette, type },
  });

  it('resolves a template look to its palette', () => {
    const r = resolveLook(fixture(PALETTES[0].key), { accent: ACCENT, ...size });
    expect(r.roles).toEqual(PALETTES[0].colours);
    expect(r.source).toBe('look');
    expect(r.pairing.key).toBe('modern');
    expect(r.scheme).toBe(PALETTES[0].scheme);
  });

  it('lets an override replace one part and keep the rest', () => {
    const tpl = fixture(PALETTES[0].key, TYPE_PAIRINGS[1].key);
    const r = resolveLook(tpl, { accent: ACCENT, override: { palette: PALETTES[1].key }, ...size });
    expect(r.roles).toEqual(PALETTES[1].colours);
    expect(r.pairing.key).toBe(TYPE_PAIRINGS[1].key);
  });

  it('prefers a brand palette over the template palette', () => {
    const r = resolveLook(fixture(PALETTES[0].key), { accent: ACCENT, brandPalette: PALETTES[2], ...size });
    expect(r.roles).toEqual(PALETTES[2].colours);
  });

  it('picks readable ink for every role', () => {
    // Some palettes have an accent role that is display-only; test a body-safe one.
    const pal = PALETTES.find((p) => displayOnlyRoles(p).length === 0);
    expect(pal).toBeDefined();
    const r = resolveLook(fixture(pal!.key), { accent: ACCENT, ...size });
    for (const role of TEXT_ROLES) {
      expect(contrastRatio(r.inkOn[role], r.roles[role]), role).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("sets text on the ground in the palette's own ink", () => {
    for (const pal of PALETTES) {
      const r = resolveLook(fixture(pal.key), { accent: ACCENT, ...size });
      expect(r.inkOn.ground, pal.key).toBe(pal.colours.ink);
      expect(contrastRatio(r.inkOn.ground, r.roles.ground), pal.key).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('turns a gradient spec into CSS using role colours', () => {
    const roles = PALETTES[0].colours;
    const css = gradientCss({ kind: 'linear', stops: ['primary', 'secondary'], angle: 135 }, roles);
    expect(css).toContain(roles.primary);
    expect(css).toContain(roles.secondary);
    expect(css).toContain('135deg');
  });

  it('keeps accent as an alias of primary', () => {
    const roles = PALETTES[0].colours;
    expect(shapeColor('accent', '#111111', '#222222', '#333333', roles)).toBe(roles.primary);
    expect(shapeColor('accent', '#111111', '#222222', '#333333')).toBe('#111111');
    expect(shapeColor('highlight', '#111111', '#222222', '#333333', roles)).toBe(roles.highlight);
  });

  it('falls back when the look names a palette that does not exist', () => {
    const r = resolveLook(fixture('no-such-palette'), { accent: ACCENT, ...size });
    expect(r.source).toBe('fallback');
  });

  it('builds ground layers, duotone and a headline gradient from the look', () => {
    const tpl: DesignTemplate = {
      ...templateByKey('statement'),
      look: {
        palette: PALETTES[0].key, type: 'modern',
        gradient: { kind: 'mesh', stops: ['ground', 'primary', 'secondary'] },
        headlineGradient: true, duotone: ['ground', 'primary'],
      },
    };
    const r = resolveLook(tpl, { accent: ACCENT, ...size });
    expect(r.groundLayers.length).toBeGreaterThan(1);
    expect(r.headlineGradient).toContain(PALETTES[0].colours.primary);
    expect(r.duotone).toEqual([PALETTES[0].colours.ground, PALETTES[0].colours.primary]);
  });

  it('draws a look pattern as SVG in the role colour', () => {
    const tpl: DesignTemplate = {
      ...templateByKey('statement'),
      look: { palette: PALETTES[0].key, type: 'modern', pattern: { key: 'step', role: 'primary', opacity: 0.08, scale: 0.1 } },
    };
    const r = resolveLook(tpl, { accent: ACCENT, ...size });
    expect(r.pattern).not.toBeNull();
    expect(r.pattern!.svg.startsWith('<svg')).toBe(true);
    expect(r.pattern!.svg).toContain(PALETTES[0].colours.primary);
    expect(r.pattern!.opacity).toBe(0.08);
    expect(r.pattern!.zone).toBe('full');
  });
});
