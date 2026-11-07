import { describe, it, expect } from 'vitest';

import { DESIGN_TEMPLATES, inkFor } from '../designTemplates';
import { TYPEFACES, pairingOf } from './typefaces';
import {
  DESIGN_STYLES, applyStyle, inkOn, luminance, partnerTone, shade,
  styleColours, styleOf, tint,
} from './styles';

/** A spread of real brand colours: dark, mid, light, saturated, near-white. */
const BRANDS = [
  '#2563eb', '#0b1220', '#e11d48', '#f59e0b', '#facc15',
  '#065f46', '#ffffff', '#111111', '#7c3aed', '#22d3ee', '#fef08a',
];

/** WCAG relative luminance — the real curve, not the luma approximation. */
const rel = (hex: string): number => {
  const h = hex.replace('#', '');
  const chan = (i: number) => {
    const v = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(0) + 0.7152 * chan(1) + 0.0722 * chan(2);
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [rel(a), rel(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('colour maths', () => {
  it('moves toward black and toward white', () => {
    expect(luminance(shade('#808080', 0.5))).toBeLessThan(luminance('#808080'));
    expect(luminance(tint('#808080', 0.5))).toBeGreaterThan(luminance('#808080'));
  });

  it('does nothing at zero and goes all the way at one', () => {
    expect(shade('#3366cc', 0)).toBe('#3366cc');
    expect(shade('#3366cc', 1)).toBe('#000000');
    expect(tint('#3366cc', 1)).toBe('#ffffff');
  });

  it('weights the channels rather than averaging them', () => {
    // A plain average calls pure blue and pure yellow equally bright, which is
    // how a template ends up putting white text on #ffff00.
    expect(luminance('#ffff00')).toBeGreaterThan(luminance('#0000ff'));
  });

  it('survives a short hex, a missing hash and junk', () => {
    expect(() => luminance('#abc')).not.toThrow();
    expect(() => luminance('abc123')).not.toThrow();
    expect(() => luminance('')).not.toThrow();
  });

  it('picks readable ink on both ends', () => {
    expect(inkOn('#ffffff')).toBe('#0b1220');
    expect(inkOn('#000000')).toBe('#ffffff');
    expect(inkOn('#facc15')).toBe('#0b1220');
  });

  it('derives a second tone that is visibly different from the first', () => {
    for (const brand of BRANDS) {
      expect(Math.abs(luminance(partnerTone(brand)) - luminance(brand)), brand)
        .toBeGreaterThan(0.08);
    }
  });
});

describe('a style never makes an unreadable design', () => {
  // This is the assertion that matters most in this file. Generated design goes
  // out without a human looking at every combination, so the guarantee has to
  // be structural: any style, on any brand colour, must produce body text that
  // clears WCAG AA.
  it('clears 4.5:1 for ink on the ground, for every style and every brand', () => {
    for (const style of DESIGN_STYLES) {
      for (const brand of BRANDS) {
        const c = styleColours(style, brand);
        expect(contrast(c.ink, c.base), `${style.key} on ${brand}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the accent visible against the ground', () => {
    // 1.6:1 is not a text threshold — the accent paints bullets, prices and
    // badges. It only has to be seen as a separate colour.
    for (const style of DESIGN_STYLES) {
      for (const brand of BRANDS) {
        const c = styleColours(style, brand);
        expect(contrast(c.accent, c.base), `${style.key} on ${brand}`).toBeGreaterThan(1.35);
      }
    }
  });

  it('copes with a brand colour that is absent or malformed', () => {
    for (const value of ['', '2563eb', '#xyz', '#fff']) {
      const c = styleColours(DESIGN_STYLES[0], value);
      expect(c.base.startsWith('#'), value).toBe(true);
      expect(contrast(c.ink, c.base), value).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('colour comes from the business, not from the style', () => {
  it('carries no hex value of its own', () => {
    // A style with a hex in it is a stock template with the business name typed
    // into it, which is the opposite of what NowOpen sells.
    for (const style of DESIGN_STYLES) {
      expect(JSON.stringify(style), style.key).not.toMatch(/#[0-9a-f]{3,6}/i);
    }
  });

  it('changes what it produces when the brand colour changes', () => {
    for (const style of DESIGN_STYLES) {
      const a = styleColours(style, '#2563eb');
      const b = styleColours(style, '#e11d48');
      // 'mono' deliberately keeps a neutral ground, so only its accent moves.
      const moved = a.base !== b.base || a.accent !== b.accent;
      expect(moved, style.key).toBe(true);
    }
  });
});

describe('applying a style', () => {
  // A template with a look brings its own furniture, so styles are tested on one without.
  const tpl = DESIGN_TEMPLATES.find((t) => !t.look)!;

  it('does not mutate the catalogue', () => {
    // DESIGN_TEMPLATES is module-level data shared by every tool. A mutation
    // would leak one customer's style into the next render.
    const before = JSON.stringify(tpl);
    for (const style of DESIGN_STYLES) applyStyle(tpl, style);
    expect(JSON.stringify(tpl)).toBe(before);
  });

  it('keeps the layout — only the treatment changes', () => {
    /*
     * CHANGED 2026-09-15. This asserted `out.shapes` equals `tpl.shapes` — that
     * a style may never touch geometry at all.
     *
     * Styles now add FURNITURE: a masthead rule for Press, a corner cut for
     * Megaphone, drafting ticks for Blueprint. Measured reason — the 47 layouts
     * carry 73 shapes between them, 46 of which are plain rectangles, so the
     * library read as text on a coloured ground however well the surface was
     * tuned. Furniture is treatment: it paints UNDER the type and moves nothing.
     *
     * What must still hold is the part this test was really protecting, and it
     * is asserted below rather than implied: no slot moves, and the template's
     * own shapes survive intact instead of being replaced.
     */
    for (const style of DESIGN_STYLES) {
      const out = applyStyle(tpl, style);
      expect(out.slots.map((s) => `${s.role}:${s.x},${s.y},${s.w}`))
        .toEqual(tpl.slots.map((s) => `${s.role}:${s.x},${s.y},${s.w}`));

      // The layout's own geometry is kept, and kept FIRST so the style's
      // furniture paints over it rather than under it.
      const own = tpl.shapes ?? [];
      expect(out.shapes?.slice(0, own.length)).toEqual(own);
      // Anything beyond it is exactly what the style declared.
      expect(out.shapes?.slice(own.length)).toEqual(style.furniture ?? []);
    }
  });

  it('gives every style furniture of its own, and never the same set twice', () => {
    /*
     * Two styles with identical furniture would be two styles a customer cannot
     * tell apart — the same failure the pairings have a distinctness test for.
     */
    const sets = DESIGN_STYLES.map((s) => JSON.stringify(s.furniture ?? []));
    for (const [i, set] of sets.entries()) {
      expect(set, `${DESIGN_STYLES[i].key} has no furniture`).not.toBe('[]');
    }
    expect(new Set(sets).size).toBe(sets.length);
  });

  it('keeps furniture clear of the headline', () => {
    /*
     * Furniture is decoration; a headline is the design. A heavy block sitting
     * under the headline at full opacity would be the one way this change could
     * make a design worse rather than richer, so anything that overlaps the
     * headline box has to be faint enough to read through.
     */
    const overlaps = (a: {x: number; y: number; w: number; h: number},
                      b: {x: number; y: number; w: number; h: number}) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

    for (const style of DESIGN_STYLES) {
      const head = tpl.slots.find((sl) => sl.role === 'headline');
      if (!head) continue;
      // SlotSpec has no height — a text slot grows with its content — so a
      // generous 0.25 band stands in for the headline area.
      const box = { x: head.x, y: head.y, w: head.w, h: 0.25 };
      for (const f of style.furniture ?? []) {
        if (f.kind !== 'rect') continue;
        if (!overlaps(f, box)) continue;
        expect(f.alpha ?? 1, `${style.key} rect over the headline`).toBeLessThanOrEqual(0.55);
      }
    }
  });

  it('only ever names a typeface that exists', () => {
    const keys = new Set(TYPEFACES.map((t) => t.key));
    for (const template of DESIGN_TEMPLATES) {
      for (const style of DESIGN_STYLES) {
        const out = applyStyle(template, style);
        expect(keys.has(out.font!), `${template.key}/${style.key}`).toBe(true);
        for (const slot of out.slots) {
          expect(keys.has(slot.font!), `${template.key}/${style.key}/${slot.role}`).toBe(true);
        }
      }
    }
  });

  it('sets the headline in the pairing display face and the eyebrow in its accent', () => {
    for (const style of DESIGN_STYLES) {
      const pairing = pairingOf(style.pairing);
      const out = applyStyle(tpl, style);
      const headline = out.slots.find((s) => s.role === 'headline');
      const eyebrow = out.slots.find((s) => s.role === 'eyebrow');
      if (headline) expect(headline.font, style.key).toBe(pairing.display);
      if (eyebrow) expect(eyebrow.font, style.key).toBe(pairing.accent);
    }
  });

  it('scales type without ever producing a non-positive size', () => {
    for (const template of DESIGN_TEMPLATES) {
      for (const style of DESIGN_STYLES) {
        for (const slot of applyStyle(template, style).slots) {
          if (slot.size != null) expect(slot.size, `${template.key}/${style.key}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('is deterministic', () => {
    const a = applyStyle(tpl, DESIGN_STYLES[3]);
    const b = applyStyle(tpl, DESIGN_STYLES[3]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('the style library', () => {
  it('gives every style a name and a reason to pick it', () => {
    for (const style of DESIGN_STYLES) {
      expect(style.label.length, style.key).toBeGreaterThan(2);
      expect(style.blurb.length, style.key).toBeGreaterThan(20);
      expect(style.pairing, style.key).toBe(pairingOf(style.pairing).key);
    }
  });

  it('holds no two styles a customer could not tell apart', () => {
    // A style that produces the same design as another is costing a slot in the
    // picker and buying nothing.
    const shapes = DESIGN_STYLES.map((s) =>
      `${s.pairing}/${s.colour}/${s.scheme}/${s.surface?.kind}/${s.type?.upperHeadline}`);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it('multiplies the layouts rather than replacing them', () => {
    expect(DESIGN_TEMPLATES.length * DESIGN_STYLES.length).toBeGreaterThan(200);
  });

  it('always resolves, even for a key that has been removed', () => {
    expect(styleOf('gone').key).toBe(DESIGN_STYLES[0].key);
  });
});

describe('the palette agrees with the renderer, not just with itself', () => {
  /*
   * The bug this exists to catch, in full.
   *
   * The renderer decides its text colour from the TEMPLATE's scheme via
   * inkFor(), which never measures anything — white for dark, near-black for
   * light. The ground came from the STYLE. Under a 'keep' style those two
   * disagree the instant a light-scheme layout is dressed in a dark style: the
   * surface came out deep blue and the renderer painted near-black type on it.
   *
   * The original contrast test passed throughout, because it tested
   * styleColours in isolation where it was perfectly correct. Only the pair is
   * wrong. So this asserts the pair.
   */
  it('returns exactly the ink the renderer will use, for every combination', () => {
    for (const tpl of DESIGN_TEMPLATES) {
      for (const style of DESIGN_STYLES) {
        for (const brand of BRANDS) {
          const scheme = style.scheme === 'keep' ? tpl.scheme : style.scheme;
          const c = styleColours(style, brand, scheme);
          expect(c.ink, `${tpl.key}/${style.key}/${brand}`)
            .toBe(inkFor({ ...tpl, scheme }));
        }
      }
    }
  });

  it('clears AA with that ink, on that ground, in both schemes', () => {
    for (const style of DESIGN_STYLES) {
      for (const scheme of ['dark', 'light'] as const) {
        for (const brand of BRANDS) {
          const c = styleColours(style, brand, scheme);
          expect(contrast(c.ink, c.base), `${style.key}/${scheme}/${brand}`)
            .toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('puts a light ground under a light-scheme layout', () => {
    // The visible symptom: Quiet Luxe and Gallery Serif rendered on deep blue.
    const light = DESIGN_TEMPLATES.filter((t) => t.scheme === 'light');
    expect(light.length).toBeGreaterThan(0);
    for (const style of DESIGN_STYLES.filter((s) => s.scheme === 'keep')) {
      for (const brand of BRANDS) {
        const c = styleColours(style, brand, 'light');
        expect(luminance(c.base), `${style.key}/${brand}`).toBeGreaterThan(0.4);
      }
    }
  });

  it('defaults to dark when no scheme is given, so old callers are unchanged', () => {
    for (const style of DESIGN_STYLES.filter((s) => s.scheme === 'keep')) {
      expect(styleColours(style, '#2563eb')).toEqual(styleColours(style, '#2563eb', 'dark'));
    }
  });
});
