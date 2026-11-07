import { describe, it, expect } from 'vitest';

import {
  CARD_MM, clampPageSize, describeSize, dpiOf, fromPixels, MAX_PAGE_PX, MIN_PAGE_PX, PRESET_GROUPS, PRESETS,
  presetPixels, printedPixels, PRINT_DPI, ratioForDpi, refitPage, shapeChangesMuch, toPixels,
} from './formats';
import type { DesignObject, DesignPage } from './designDocument';

const obj = (id: string, x: number, y: number, w: number, h: number): DesignObject => ({
  id, type: 'shape', shape: 'rect', name: id, x, y, w, h,
  rotation: 0, opacity: 1, visible: true, locked: false, z: 1,
} as DesignObject);

const page = (width: number, height: number, objects: DesignObject[] = []): DesignPage =>
  ({ id: 'p', name: 'Page 1', width, height, objects });

describe('the catalogue', () => {
  it('covers every group it advertises', () => {
    for (const group of PRESET_GROUPS) {
      expect(PRESETS.some((p) => p.group === group), group).toBe(true);
    }
  });

  it('has no duplicate ids', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });

  it('gives every preset a usable pixel size', () => {
    for (const preset of PRESETS) {
      const size = presetPixels(preset);
      expect(size.width, preset.id).toBeGreaterThanOrEqual(MIN_PAGE_PX);
      expect(size.height, preset.id).toBeGreaterThanOrEqual(MIN_PAGE_PX);
      expect(size.width, preset.id).toBeLessThanOrEqual(MAX_PAGE_PX);
    }
  });

  it('keeps physical sizes in millimetres, so the paper size is the truth', () => {
    const a4 = PRESETS.find((p) => p.id === 'a4')!;
    expect(a4.unit).toBe('mm');
    expect(a4.width).toBe(210);
    /* 210mm at 300dpi */
    expect(presetPixels(a4).width).toBe(2480);
    expect(presetPixels(a4).height).toBe(3508);
  });

  it('warns where a size needs care rather than leaving it to be discovered', () => {
    expect(PRESETS.find((p) => p.id === 'business-card')?.note).toMatch(/edge|trim/i);
  });
});

describe('units', () => {
  it('converts millimetres at the print resolution', () => {
    expect(toPixels(25.4, 'mm', 300)).toBe(300);
    expect(toPixels(1, 'in', 300)).toBe(300);
    expect(toPixels(2.54, 'cm', 300)).toBe(300);
    expect(toPixels(500, 'px')).toBe(500);
  });

  it('comes back to where it started', () => {
    for (const unit of ['mm', 'cm', 'in'] as const) {
      const pixels = toPixels(100, unit, PRINT_DPI);
      expect(fromPixels(pixels, unit, PRINT_DPI)).toBeCloseTo(100, 1);
    }
  });

  it('refuses nonsense instead of producing NaN', () => {
    for (const bad of [0, -5, Number.NaN, Infinity]) {
      expect(toPixels(bad, 'mm'), String(bad)).toBe(0);
      expect(fromPixels(bad, 'mm'), String(bad)).toBe(0);
    }
  });

  it('describes a physical size in both the unit and the pixels', () => {
    expect(describeSize(1080, 1080)).toBe('1080 × 1080 px');
    expect(describeSize(2480, 3508, 'mm')).toMatch(/210 × 297 mm/);
  });
});

describe('page limits', () => {
  it('keeps a page inside what can be rendered', () => {
    expect(clampPageSize(1, 1)).toEqual({ width: MIN_PAGE_PX, height: MIN_PAGE_PX });
    expect(clampPageSize(999999, 999999)).toEqual({ width: MAX_PAGE_PX, height: MAX_PAGE_PX });
  });

  it('never returns NaN from a blank field', () => {
    const r = clampPageSize(Number.NaN, Number.NaN);
    expect(Number.isFinite(r.width) && Number.isFinite(r.height)).toBe(true);
  });

  it('rounds to whole pixels', () => {
    expect(clampPageSize(100.6, 200.4)).toEqual({ width: 101, height: 200 });
  });
});

describe('carrying a design into a new size', () => {
  const square = () => page(1000, 1000, [obj('a', 0.1, 0.1, 0.2, 0.2), obj('b', 0.5, 0.5, 0.4, 0.1)]);

  it('changes the page size', () => {
    const r = refitPage(square(), 1080, 1920, 'stretch');
    expect(r.width).toBe(1080);
    expect(r.height).toBe(1920);
  });

  it('is identity when the size has not changed', () => {
    const p = square();
    expect(refitPage(p, 1000, 1000, 'fit')).toBe(p);
  });

  /* Stretch keeps each object's SHARE of the page, which is the point of it. */
  it('stretch keeps every object in the same share of the page', () => {
    const r = refitPage(square(), 1080, 1920, 'stretch');
    expect(r.objects[0]).toMatchObject({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  });

  /*
   * ── THE ONE THAT MATTERS ─────────────────────────────────────────────
   *
   * A square taken to a story by stretching turns a round logo into an oval,
   * because 20% of the width and 20% of the height are no longer the same
   * number of pixels. `fit` must leave every object the shape it was.
   */
  it('fit leaves every object undistorted', () => {
    const before = square();
    const after = refitPage(before, 1080, 1920, 'fit');
    for (const o of before.objects) {
      const now = after.objects.find((n) => n.id === o.id)!;
      const aspectBefore = (o.w * before.width) / (o.h * before.height);
      const aspectAfter = (now.w * after.width) / (now.h * after.height);
      expect(aspectAfter, o.id).toBeCloseTo(aspectBefore, 6);
    }
  });

  it('fit centres the design in the new page', () => {
    const after = refitPage(page(1000, 1000, [obj('a', 0, 0, 1, 1)]), 1000, 2000, 'fit');
    const a = after.objects[0];
    /* The full-page object now occupies the middle half, with equal margins. */
    expect(a.y).toBeCloseTo(0.25, 6);
    expect(a.h).toBeCloseTo(0.5, 6);
    expect(a.x).toBeCloseTo(0, 6);
    expect(a.w).toBeCloseTo(1, 6);
  });

  it('fit keeps everything on the page', () => {
    const after = refitPage(square(), 1920, 1080, 'fit');
    for (const o of after.objects) {
      expect(o.x).toBeGreaterThanOrEqual(-1e-9);
      expect(o.y).toBeGreaterThanOrEqual(-1e-9);
      expect(o.x + o.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(o.y + o.h).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('copes with an empty page', () => {
    const r = refitPage(page(1000, 1000), 500, 700, 'fit');
    expect(r.width).toBe(500);
    expect(r.objects).toHaveLength(0);
  });

  it('clamps an absurd size instead of making an unrenderable page', () => {
    expect(refitPage(square(), 0, 0, 'fit').width).toBe(MIN_PAGE_PX);
  });
});

describe('when the choice is worth offering', () => {
  it('says yes for a real change of shape', () => {
    expect(shapeChangesMuch(page(1080, 1080), 1080, 1920)).toBe(true);
    expect(shapeChangesMuch(page(1920, 1080), 1080, 1920)).toBe(true);
  });

  /* Nobody needs a dialogue about distortion to nudge a page by 2%. */
  it('says no for a small adjustment', () => {
    expect(shapeChangesMuch(page(1000, 1000), 1020, 1000)).toBe(false);
    expect(shapeChangesMuch(page(1080, 1350), 1080, 1350)).toBe(false);
  });

  it('does not divide by a zero-sized page', () => {
    expect(shapeChangesMuch(page(0, 0), 100, 100)).toBe(false);
  });
});

describe('printed assets come out at a stated resolution', () => {
  /*
   * A multiplier answers "how many times bigger than the preview", which is a
   * question about the screen. A printer asks "how many dots per inch", which
   * is a question about the paper. The same card was captured at 2 in one
   * place and 3 in another, with no resolution stated behind either.
   */
  it('derives the capture ratio from the physical size', () => {
    const ratio = ratioForDpi(640, CARD_MM.width, 300);
    expect(Math.round(640 * ratio)).toBe(1011);
    expect(dpiOf(640 * ratio, CARD_MM.width)).toBe(300);
  });

  it('hits the resolution it was asked for, at any design width', () => {
    for (const design of [320, 640, 1080]) {
      for (const dpi of [150, 300, 600]) {
        const px = design * ratioForDpi(design, CARD_MM.width, dpi);
        expect(dpiOf(px, CARD_MM.width), ).toBe(dpi);
      }
    }
  });

  it('reports the pixels a card will actually measure', () => {
    expect(printedPixels(CARD_MM, 300)).toEqual({ width: 1011, height: 638 });
    expect(printedPixels(CARD_MM, 600)).toEqual({ width: 2022, height: 1276 });
  });

  /*
   * ID-1: what every card printer and wallet expects.
   *
   * Asserted to WHOLE PIXELS, because that is all a raster can hold: 54mm at
   * 300dpi is 637.795 dots, so the height is 638 and the ratio is out by
   * 0.03% — a third of a pixel on a card, and nothing a printer can resolve.
   * A tighter assertion would only be testing that rounding does not happen.
   */
  it('keeps the card at the standard proportions, to the nearest pixel', () => {
    const p = printedPixels(CARD_MM, 300);
    expect(p.width).toBe(Math.round((85.6 / 25.4) * 300));
    expect(p.height).toBe(Math.round((54 / 25.4) * 300));
    expect(p.width / p.height).toBeCloseTo(85.6 / 54, 2);
    /* and the error really is sub-pixel */
    expect(Math.abs(p.height - (p.width * 54) / 85.6)).toBeLessThan(1);
  });

  it('never divides by zero', () => {
    expect(ratioForDpi(0, 85.6)).toBe(1);
    expect(ratioForDpi(640, 0)).toBe(1);
    expect(dpiOf(100, 0)).toBe(0);
  });
});
