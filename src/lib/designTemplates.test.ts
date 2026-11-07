import { describe, it, expect } from 'vitest';
import {
  DESIGN_TEMPLATES, templateByKey, slotOf, slotBox, typePx, unitOf,
  motionAt, settleTime, surfaceLayers, hexAlpha, inkFor, SETTLED,
  shapeGeometry, listRowBoxes, templateListRoles, isListRole, defaultMediaScrim, surfaceSpecLayers,
  fittedTypePx,
  fitSlotSize,
  type SlotSpec,
} from './designTemplates';

// Formats a template must survive unchanged — the point of fractional geometry.
const FORMATS: [string, number, number][] = [
  ['square post', 1080, 1080],
  ['story', 1080, 1920],
  ['landscape', 1920, 1080],
  ['A3 poster', 2480, 3508],
  ['thumbnail preview', 240, 240],
];

describe('catalogue integrity', () => {
  it('has unique keys', () => {
    const keys = DESIGN_TEMPLATES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every template a headline — without one there is no design', () => {
    for (const t of DESIGN_TEMPLATES) expect(slotOf(t, 'headline')).toBeTruthy();
  });

  it('falls back to a real template for an unknown key', () => {
    expect(templateByKey('does-not-exist')).toBe(DESIGN_TEMPLATES[0]);
    expect(templateByKey('statement').key).toBe('statement');
  });

  it('never places a slot outside the canvas, at any format', () => {
    for (const t of DESIGN_TEMPLATES) {
      for (const [name, w, h] of FORMATS) {
        for (const s of t.slots) {
          const b = slotBox(s, w, h);
          expect(b.left, `${t.key}/${s.role} @ ${name}`).toBeGreaterThanOrEqual(0);
          expect(b.left + b.width, `${t.key}/${s.role} @ ${name}`).toBeLessThanOrEqual(w + 0.5);
          expect(b.top, `${t.key}/${s.role} @ ${name}`).toBeGreaterThanOrEqual(0);
          expect(b.top, `${t.key}/${s.role} @ ${name}`).toBeLessThanOrEqual(h);
        }
      }
    }
  });

  it('clamps a template authored with bad geometry rather than losing content', () => {
    // Off-canvas content is silently lost in a flat export, so a clamp turns an
    // authoring mistake into a visible squeeze instead of a missing headline.
    const bad: SlotSpec = { role: 'headline', x: 2, y: 5, w: 3 };
    const b = slotBox(bad, 1000, 1000);
    expect(b.left).toBe(0);
    expect(b.width).toBe(1000);
    expect(b.top).toBeLessThanOrEqual(1000);
  });
});

describe('type scale', () => {
  it('scales with the short edge, so a story is not bigger than a square', () => {
    expect(unitOf(1080, 1920)).toBe(1080);
    expect(typePx(0.09, 1080, 1080)).toBe(typePx(0.09, 1080, 1920));
  });

  it('grows for print', () => {
    expect(typePx(0.09, 2480, 3508)).toBeGreaterThan(typePx(0.09, 1080, 1080));
  });

  it('keeps the smallest type legible even on a preview thumbnail', () => {
    // 240px preview: metadata at 0.02 is ~5px. Small, but it must not round to 0
    // or the slot vanishes from the preview and reappears on export.
    for (const t of DESIGN_TEMPLATES) {
      for (const s of t.slots) {
        if (s.role === 'qr') continue;
        expect(typePx(s.size, 240, 240), `${t.key}/${s.role}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('motion', () => {
  const slot: SlotSpec = { role: 'headline', x: 0.1, y: 0.4, w: 0.8, motion: { in: 'rise', at: 0.5, dur: 0.5 } };

  it('is absent before its cue and settled after', () => {
    expect(motionAt(slot, 0, 1080, 1080).opacity).toBe(0);
    expect(motionAt(slot, 0.5, 1080, 1080).opacity).toBe(0);
    expect(motionAt(slot, 1.0, 1080, 1080)).toEqual(SETTLED);
    expect(motionAt(slot, 99, 1080, 1080)).toEqual(SETTLED);
  });

  it('interpolates monotonically in between', () => {
    const a = motionAt(slot, 0.6, 1080, 1080);
    const b = motionAt(slot, 0.8, 1080, 1080);
    expect(a.opacity).toBeGreaterThan(0);
    expect(b.opacity).toBeGreaterThan(a.opacity);
    // Travel shrinks as it arrives.
    expect(Math.abs(b.dy)).toBeLessThan(Math.abs(a.dy));
  });

  it('treats a slot with no motion as always settled, so stills need no special case', () => {
    expect(motionAt({ role: 'brand', x: 0, y: 0, w: 1 }, 0, 100, 100)).toEqual(SETTLED);
  });

  // The guarantee the still renderer depends on: resolving at settleTime()
  // must give the animation's exact final frame, for every slot.
  it('settles every slot of every template by settleTime()', () => {
    for (const t of DESIGN_TEMPLATES) {
      const end = settleTime(t);
      expect(end, t.key).toBeGreaterThan(0);
      for (const s of t.slots) {
        expect(motionAt(s, end, 1080, 1080), `${t.key}/${s.role}`).toEqual(SETTLED);
      }
    }
  });

  it('reveals a wipe by geometry, not opacity', () => {
    const wipe: SlotSpec = { role: 'eyebrow', x: 0, y: 0, w: 1, motion: { in: 'wipe', at: 0, dur: 1 } };
    const mid = motionAt(wipe, 0.5, 1080, 1080);
    expect(mid.opacity).toBe(1);
    expect(mid.clip).not.toBeNull();
    expect(mid.clip![1]).toBeGreaterThan(0);
    expect(mid.clip![1]).toBeLessThan(100);
  });

  it('scales travel with the canvas, so motion reads the same at any size', () => {
    const small = motionAt(slot, 0.5, 240, 240).dy;
    const large = motionAt(slot, 0.5, 2400, 2400).dy;
    expect(large).toBeGreaterThan(small);
  });
});

describe('surface', () => {
  it('always paints something, so text never lands on transparency', () => {
    for (const t of DESIGN_TEMPLATES) {
      const layers = surfaceLayers(t, '#9a3412', '#0b1220');
      expect(layers.length, t.key).toBeGreaterThan(0);
      for (const l of layers) expect(l).toMatch(/gradient/);
    }
  });

  it('adds a vignette layer only where the template asks for one', () => {
    /*
     * Asserts the VIGNETTE, not the layer count.
     *
     * This used to read `expect(surfaceLayers(noV, ...).length).toBe(1)`, which
     * silently also asserted that every surface is a single flat gradient — and
     * that was the flatness bug, pinned as if it were the specification. A
     * surface now carries its ramp plus a light source, so the count is 2 or 3;
     * what matters is that a black overlay appears only where asked.
     */
    /*
     * Measured as the vignette's own CONTRIBUTION — the same template with the
     * flag on and off — rather than by looking for black in the CSS. A dark
     * ground is legitimately near-black, so a string search for "rgba(0, 0, 0"
     * finds the ground and reports a vignette that is not there.
     */
    const plain = DESIGN_TEMPLATES.find(t => !t.surface.vignette)!;
    const withV = { ...plain, surface: { ...plain.surface, vignette: 0.4 } };

    expect(surfaceLayers(withV, '#9a3412', '#0b1220').length)
      .toBe(surfaceLayers(plain, '#9a3412', '#0b1220').length + 1);
    // And it is the last layer, so it sits over the ramp rather than under it.
    const layers = surfaceLayers(withV, '#9a3412', '#0b1220');
    expect(layers[layers.length - 1]).toContain('rgba(0, 0, 0, 0.4)');
  });

  it('gives every surface real tonal range, whatever the brand colour', () => {
    /*
     * THE FLATNESS BUG, 2026-09-15. All 376 generated designs rendered as one
     * flat block of the brand colour.
     *
     * The surface painter built its gradients from `accent` and `base`, and
     * styleColours() returns base === accent for the `brand` rule whenever the
     * brand is already readable — which is the default Signature style on most
     * brands. Every gradient therefore ran blue to blue. The library was 376
     * layouts wearing one look.
     *
     * Passing the SAME colour for both is the case that used to collapse, so
     * that is the case this test uses.
     */
    const stopsOf = (css: string) => css.match(/rgba?\([^)]*\)/g) ?? [];
    for (const t of DESIGN_TEMPLATES) {
      const layers = surfaceLayers(t, '#2563eb', '#2563eb');
      const distinct = new Set(layers.flatMap(stopsOf).map((c) => c.replace(/\s/g, '')));
      // One colour repeated is a flat fill. Three distinct values is a ramp.
      expect(distinct.size, `${t.key} (${t.surface.kind})`).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps a second hue when the ground has one of its own', () => {
    /*
     * A Duotone design is two colours by definition, and styleColours() hands
     * this function a ground derived from a PARTNER tone for that style.
     *
     * The first version of the tonal fix ended every ramp in a darkened accent,
     * which fixed the flat single-colour case and silently threw the partner
     * hue away — turning the one genuinely two-colour style into another
     * monochrome. Caught before it shipped; pinned here so it stays caught.
     */
    const tpl = DESIGN_TEMPLATES.find(t => t.surface.kind === 'gradient')!;
    const twoHue = surfaceLayers(tpl, '#2563eb', '#7c2d12').join(' ');
    // Some red must survive: the ground is a warm brown, the accent is blue.
    const reds = [...twoHue.matchAll(/rgba\((\d+), (\d+), (\d+)/g)]
      .map(m => [Number(m[1]), Number(m[2]), Number(m[3])]);
    expect(reds.some(([r, , b]) => r > b + 20), 'no warm stop survived').toBe(true);
    expect(reds.some(([r, , b]) => b > r + 20), 'no cool stop survived').toBe(true);
  });

  it('pairs light ink with dark surfaces and vice versa', () => {
    for (const t of DESIGN_TEMPLATES) {
      expect(inkFor(t)).toBe(t.scheme === 'dark' ? '#ffffff' : '#0b1220');
    }
  });
});

describe('hexAlpha', () => {
  it('handles long, short and hash-less hex', () => {
    expect(hexAlpha('#ffffff', 1)).toBe('rgba(255, 255, 255, 1)');
    expect(hexAlpha('fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(hexAlpha('#000', 0)).toBe('rgba(0, 0, 0, 0)');
  });

  it('clamps alpha and survives junk instead of emitting invalid CSS', () => {
    // A broken colour must not produce "rgba(NaN…)", which browsers drop
    // entirely — that is how a background silently disappears.
    expect(hexAlpha('#ffffff', 5)).toBe('rgba(255, 255, 255, 1)');
    expect(hexAlpha('', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(hexAlpha('not-a-colour', 0.5)).not.toContain('NaN');
  });
});

describe('shapes', () => {
  it('puts each wedge in its own corner', () => {
    const at = (corner: 'tl' | 'tr' | 'bl' | 'br') =>
      shapeGeometry({ kind: 'wedge', corner, w: 0.5, h: 0.5, tone: 'accent' }, 1000, 1000);

    // The right angle sits IN the corner — get the winding wrong and the wedge
    // appears on the opposite side of the layout, over the headline.
    expect(at('tl')).toEqual({ kind: 'polygon', points: [[0, 0], [500, 0], [0, 500]] });
    expect(at('tr')).toEqual({ kind: 'polygon', points: [[1000, 0], [500, 0], [1000, 500]] });
    expect(at('bl')).toEqual({ kind: 'polygon', points: [[0, 1000], [500, 1000], [0, 500]] });
    expect(at('br')).toEqual({ kind: 'polygon', points: [[1000, 1000], [500, 1000], [1000, 500]] });
  });

  it('shears a skewed rect into a parallelogram, keeping its height', () => {
    const g = shapeGeometry(
      { kind: 'rect', x: 0.1, y: 0.2, w: 0.5, h: 0.1, tone: 'accent', skew: 0.5 },
      1000, 1000,
    );
    expect(g.kind).toBe('polygon');
    if (g.kind !== 'polygon') return;
    const ys = g.points.map(([, y]) => y);
    expect(Math.min(...ys)).toBe(200);
    expect(Math.max(...ys)).toBe(300);
    // Top edge leans right of the bottom edge by skew * height.
    expect(g.points[0][0] - g.points[3][0]).toBeCloseTo(50, 6);
  });

  it('scales circles by the short edge, so they stay round on any format', () => {
    const wide = shapeGeometry({ kind: 'circle', cx: 0.5, cy: 0.5, r: 0.2, tone: 'accent' }, 2000, 1000);
    const tall = shapeGeometry({ kind: 'circle', cx: 0.5, cy: 0.5, r: 0.2, tone: 'accent' }, 1000, 2000);
    if (wide.kind !== 'circle' || tall.kind !== 'circle') throw new Error('expected circles');
    expect(wide.r).toBe(200);
    expect(tall.r).toBe(200);
  });

  it('rotates a stripe about its own centre', () => {
    const g = shapeGeometry(
      { kind: 'stripe', x: 0.25, y: 0.45, w: 0.5, h: 0.1, angle: 90, tone: 'accent' },
      1000, 1000,
    );
    if (g.kind !== 'polygon') throw new Error('expected a polygon');
    const cx = g.points.reduce((a, [x]) => a + x, 0) / 4;
    const cy = g.points.reduce((a, [, y]) => a + y, 0) / 4;
    expect(cx).toBeCloseTo(500, 6);
    expect(cy).toBeCloseTo(500, 6);
  });

  it('resolves every shape in the catalogue at every format', () => {
    for (const t of DESIGN_TEMPLATES) {
      for (const shape of t.shapes ?? []) {
        for (const [name, w, h] of FORMATS) {
          const g = shapeGeometry(shape, w, h);
          const nums = g.kind === 'polygon'
            ? g.points.flat()
            : g.kind === 'rect'
              ? [g.x, g.y, g.w, g.h]
              : [g.cx, g.cy, g.r];
          for (const n of nums) {
            expect(Number.isFinite(n), `${t.key}/${shape.kind} @ ${name}`).toBe(true);
          }
        }
      }
    }
  });
});

describe('list slots', () => {
  const column: SlotSpec = { role: 'services', x: 0.1, y: 0.5, w: 0.8, size: 0.03, gap: 2 };
  const strip: SlotSpec = { role: 'stats', x: 0.1, y: 0.5, w: 0.9, size: 0.03, direction: 'row' };

  it('steps a column down by size x gap', () => {
    const rows = listRowBoxes(column, 1000, 1000, 3);
    expect(rows).toHaveLength(3);
    expect(rows[0].y).toBe(500);
    expect(rows[1].y - rows[0].y).toBe(60); // 0.03 * 1000 * 2
    expect(rows.every(r => r.x === 100)).toBe(true);
  });

  it('divides a row strip into equal cells on one baseline', () => {
    const rows = listRowBoxes(strip, 1000, 1000, 3);
    expect(rows.map(r => Math.round(r.w))).toEqual([300, 300, 300]);
    expect(new Set(rows.map(r => r.y)).size).toBe(1);
  });

  it('returns nothing for an empty list rather than one blank row', () => {
    expect(listRowBoxes(column, 1000, 1000, 0)).toEqual([]);
  });

  it('reports only the list roles a template actually draws', () => {
    // Drives which editors appear. Over-reporting turns the panel into a form.
    const agency = templateByKey('agency-services');
    expect(templateListRoles(agency).sort()).toEqual(['contact', 'services']);
    expect(templateListRoles(templateByKey('statement'))).toEqual([]);
  });

  it('keeps every column list inside the canvas at its row cap', () => {
    // A four-row list that runs off the bottom is invisible in a flat export,
    // and the slot-bounds test above only checks the list's starting point.
    for (const t of DESIGN_TEMPLATES) {
      for (const slot of t.slots) {
        if ((slot.role === 'services' || slot.role === 'price') && slot.direction !== 'row') {
          const rows = slot.max ?? 4;
          for (const [name, w, h] of FORMATS) {
            const boxes = listRowBoxes(slot, w, h, rows);
            const last = boxes[boxes.length - 1];
            expect(last.y + last.size, `${t.key} ${slot.role} @ ${name}`).toBeLessThanOrEqual(h);
          }
        }
      }
    }
  });
});

describe('shapes never cover the headline', () => {
  /** Axis-aligned bounds of a resolved shape, in pixels. */
  function boundsOf(g: ReturnType<typeof shapeGeometry>) {
    if (g.kind === 'polygon') {
      const xs = g.points.map(([x]) => x);
      const ys = g.points.map(([, y]) => y);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    }
    if (g.kind === 'circle' || g.kind === 'ring') {
      return { x0: g.cx - g.r, x1: g.cx + g.r, y0: g.cy - g.r, y1: g.cy + g.r };
    }
    return { x0: g.x, x1: g.x + g.w, y0: g.y, y1: g.y + g.h };
  }

  // Only shapes big and opaque enough to actually obscure type. Hairline rules
  // and 8%-alpha tints are design devices that sit under text on purpose.
  const OPAQUE = 0.6;
  const BIG = 0.02;

  it('keeps every solid shape clear of the headline box, at every format', () => {
    // The Promo Burst badge sat on top of the first headline line on every
    // format before this existed, and it took a screenshot to notice.
    for (const t of DESIGN_TEMPLATES) {
      const headline = slotOf(t, 'headline');
      if (!headline) continue;

      for (const shape of t.shapes ?? []) {
        if ((shape.alpha ?? 1) < OPAQUE) continue;
        /*
         * A 'base'-toned shape IS the ground, not something on top of it.
         *
         * The half-photo layouts paint a solid block of the surface colour so
         * that type has a guaranteed background even when somebody drops a
         * bright photograph behind it — the block is the reason the headline is
         * readable, and inkFor() is defined against exactly this colour. Every
         * other tone can genuinely bury type, so every other tone still counts.
         */
        if (shape.tone === 'base') continue;
        /*
         * A headline declared `on` this shape's colour sits there on purpose:
         * its ink is chosen against that colour, and looks.test measures the
         * pair. The Colour Block card's band is the reason for its name.
         */
        const onRole: string[] = headline.on === 'primary' ? ['primary', 'accent'] : [headline.on ?? ''];
        if (headline.on && onRole.includes(shape.tone)) continue;

        for (const [name, w, h] of FORMATS) {
          const g = shapeGeometry(shape, w, h);
          const b = boundsOf(g);
          if ((b.x1 - b.x0) * (b.y1 - b.y0) < BIG * w * h) continue;

          const box = slotBox(headline, w, h);
          const lineH = typePx(headline.size, w, h) * 1.06;
          const top = headline.fromBottom ? box.top - lineH * 1.6 : box.top;
          const hb = { x0: box.left, x1: box.left + box.width, y0: top, y1: top + lineH * 1.6 };

          const overlaps = b.x0 < hb.x1 && b.x1 > hb.x0 && b.y0 < hb.y1 && b.y1 > hb.y0;
          expect(overlaps, `${t.key}: ${shape.kind} covers the headline @ ${name}`).toBe(false);
        }
      }
    }
  });
});

describe('promo primitives', () => {
  it('counts price as a list role', () => {
    expect(isListRole('price')).toBe(true);
    expect(templateListRoles(templateByKey('price-list'))).toContain('price');
  });

  it('offers a price editor only where a price slot exists', () => {
    expect(templateListRoles(templateByKey('flash-sale'))).not.toContain('price');
  });

  it('gives every disc badge a width to be a circle of', () => {
    // The disc's diameter is the slot's own `w` — that is what lets the canvas
    // and the DOM draw the same circle instead of each measuring the text.
    for (const t of DESIGN_TEMPLATES) {
      for (const slot of t.slots) {
        if (slot.treatment === 'disc') {
          expect(slot.w, `${t.key}/${slot.role}`).toBeGreaterThan(0);
          expect(slot.w, `${t.key}/${slot.role}`).toBeLessThanOrEqual(0.5);
        }
      }
    }
  });

  it('keeps a disc badge on the canvas at every format', () => {
    for (const t of DESIGN_TEMPLATES) {
      for (const slot of t.slots) {
        if (slot.treatment !== 'disc') continue;
        for (const [name, w, h] of FORMATS) {
          const box = slotBox(slot, w, h);
          // The circle is as tall as it is wide, so a badge low on a wide
          // canvas can run off the bottom even though its origin is inside.
          expect(box.top + box.width, `${t.key} disc @ ${name}`).toBeLessThanOrEqual(h + 0.5);
        }
      }
    }
  });
});

describe('background media scrim', () => {
  const alphaOf = (rgba: string) => Number(/rgba\([^,]+,[^,]+,[^,]+,([^)]+)\)/.exec(rgba)?.[1] ?? '1');

  it('keeps more surface for a light template than a dark one', () => {
    // The two schemes fail in opposite directions. A dark template writes in
    // white and survives a thin tint; a light one writes in near-black and
    // needs a pale ground, so thinning it equally loses the headline into the
    // photo. A single flat default did exactly that.
    const dark = DESIGN_TEMPLATES.find(t => t.scheme === 'dark')!;
    const light = DESIGN_TEMPLATES.find(t => t.scheme === 'light')!;
    expect(defaultMediaScrim(light)).toBeGreaterThan(defaultMediaScrim(dark));
  });

  it('never fully hides or fully removes the surface by default', () => {
    for (const t of DESIGN_TEMPLATES) {
      const scrim = defaultMediaScrim(t);
      expect(scrim, t.key).toBeGreaterThan(0.2);
      expect(scrim, t.key).toBeLessThanOrEqual(1);
    }
  });

  it('thins the tint layers in proportion', () => {
    const tpl = templateByKey('agency-services');
    const full = surfaceSpecLayers(tpl, '#f59e0b', '#0b1220', 1);
    const half = surfaceSpecLayers(tpl, '#f59e0b', '#0b1220', 0.5);
    expect(half).toHaveLength(full.length);
    // Compare the first tint layer, which is not the vignette.
    const a = alphaOf(full[0].stops[0].color);
    const b = alphaOf(half[0].stops[0].color);
    expect(b).toBeCloseTo(a * 0.5, 5);
  });

  it('leaves the vignette at full strength', () => {
    // The vignette is a legibility aid over photography — thinning it along
    // with the tint would remove it exactly when the image needs it.
    const tpl = DESIGN_TEMPLATES.find(t => (t.surface.vignette ?? 0) > 0)!;
    const full = surfaceSpecLayers(tpl, '#f59e0b', '#0b1220', 1);
    const thin = surfaceSpecLayers(tpl, '#f59e0b', '#0b1220', 0.3);
    const lastAlpha = (ls: typeof full) => alphaOf(ls[ls.length - 1].stops.slice(-1)[0].color);
    expect(lastAlpha(thin)).toBeCloseTo(lastAlpha(full), 5);
  });

  it('is a no-op at full opacity, so untouched callers render identically', () => {
    for (const t of DESIGN_TEMPLATES) {
      expect(surfaceSpecLayers(t, '#f59e0b', '#0b1220', 1))
        .toEqual(surfaceSpecLayers(t, '#f59e0b', '#0b1220'));
    }
  });
});

describe('a headline never overruns the copy beneath it', () => {
  /**
   * MEASURED ON THE LIVE GALLERY, 2026-09-15.
   *
   * Nothing measured or constrained text anywhere in the studio. A slot carries
   * one size and one y, so a headline needing three lines where the layout
   * budgeted two grew downward and printed over its own subline. On the
   * Megaphone style — Archivo Black, set 1.14x and in capitals — five of the
   * first twelve designs on screen collided with their body copy.
   *
   * A plain design is still a design. Overlapping text is a defect, and it was
   * the first thing anyone saw of the library.
   */
  const slot = (over: Partial<SlotSpec> = {}): SlotSpec => ({
    role: 'headline', x: 0.08, y: 0.4, w: 0.84, size: 0.11, font: 'heavy', ...over,
  } as SlotSpec);

  it('shrinks a long headline and leaves a short one alone', () => {
    const short = fittedTypePx('Sale', slot(), 1080, 1080);
    const long = fittedTypePx(
      'Our biggest end of season clearance event starts this Friday morning',
      slot(), 1080, 1080,
    );
    expect(short).toBe(typePx(0.11, 1080, 1080));
    expect(long).toBeLessThan(short);
  });

  it('never shrinks a display face into a caption', () => {
    // Below ~62% a display face stops being one; the honest answer then is that
    // the headline is too long for that layout, not a 20px headline.
    const base = typePx(0.11, 1080, 1080);
    const absurd = fittedTypePx('x'.repeat(600), slot(), 1080, 1080);
    expect(absurd).toBeGreaterThanOrEqual(Math.round(base * 0.6));
  });

  it('accounts for how wide the face actually is', () => {
    /*
     * Archivo Black is nearly half again the width of Bebas Neue at the same
     * size. A fit that ignored the face would pass one and overflow the other,
     * which is exactly how this shipped.
     */
    const text = 'Your headline here, announcing the thing';
    const wide = fittedTypePx(text, slot({ font: 'heavy' }), 1080, 1080);
    const narrow = fittedTypePx(text, slot({ font: 'condensed' }), 1080, 1080);
    expect(wide).toBeLessThan(narrow);
  });

  it('accounts for tracking, which widens every character', () => {
    const text = 'Your headline here, announcing the thing';
    const tight = fittedTypePx(text, slot({ tracking: -0.03 }), 1080, 1080);
    const loose = fittedTypePx(text, slot({ tracking: 0.08 }), 1080, 1080);
    expect(loose).toBeLessThanOrEqual(tight);
  });

  it('takes its line budget from the slot beneath, not from a constant', () => {
    /*
     * THE SECOND ATTEMPT AT THIS BUG, and why a constant could never work.
     *
     * The first fix capped every headline at three lines. "Your headline here"
     * is two, so nothing shrank and the gallery collided exactly as before. The
     * budget was never a number of lines: it is the gap between this slot and
     * whatever the template puts under it.
     */
    const headline = slot({ y: 0.40, size: 0.11 });
    const tight = [headline, slot({ role: 'subline', y: 0.52, size: 0.03 } as Partial<SlotSpec>)];
    const roomy = [headline, slot({ role: 'subline', y: 0.85, size: 0.03 } as Partial<SlotSpec>)];
    const text = 'Your headline here';

    const squeezed = fitSlotSize(headline, tight as SlotSpec[], text, 1080, 1080);
    const relaxed = fitSlotSize(headline, roomy as SlotSpec[], text, 1080, 1080);
    expect(squeezed).toBeLessThan(relaxed);
  });

  it('is not constrained by a slot that sits beside it rather than below', () => {
    // A caption in a right-hand column cannot be collided with by a headline on
    // the left, so it must not shrink one.
    const headline = slot({ x: 0.06, w: 0.44, y: 0.4, size: 0.11 });
    const beside = slot({ role: 'meta', x: 0.56, w: 0.38, y: 0.45, size: 0.03 } as Partial<SlotSpec>);
    const alone = fitSlotSize(headline, [headline] as SlotSpec[], 'Your headline here', 1080, 1080);
    const withNeighbour = fitSlotSize(headline, [headline, beside] as SlotSpec[], 'Your headline here', 1080, 1080);
    expect(withNeighbour).toBe(alone);
  });

  it('is deterministic, so the PNG matches the preview', () => {
    /*
     * The DOM preview and the canvas exporter both call this. If it were not
     * pure — if it measured real glyphs in one of the two — the exported file
     * would not be the design the owner edited.
     */
    const text = 'Our biggest end of season clearance event starts Friday';
    const a = fittedTypePx(text, slot(), 1080, 1350);
    const b = fittedTypePx(text, slot(), 1080, 1350);
    expect(a).toBe(b);
  });

  it('handles nothing at all without dividing by zero', () => {
    expect(fittedTypePx(undefined, slot(), 1080, 1080)).toBe(typePx(0.11, 1080, 1080));
    expect(fittedTypePx('   ', slot(), 1080, 1080)).toBe(typePx(0.11, 1080, 1080));
  });
});
