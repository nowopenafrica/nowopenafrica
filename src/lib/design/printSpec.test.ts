import { describe, expect, it } from 'vitest';

import { DESIGN_FORMATS } from '../../data/studioPresets';
import { PRESETS, presetPixels } from '../studio/formats';
import {
  BLEED_MM,
  EXPORT_MAX_EDGE,
  EXPORT_MAX_RATIO,
  LARGE_FORMAT,
  OFFICE_DPI,
  PHYSICAL,
  PRESS_DPI,
  belowPressFormats,
  canvasDpiOf,
  deliveredDpiOf,
  exportCeilingDpi,
  exportPixelRatio,
  pressCanvasFor,
  printNoteFor,
  specFor,
} from './printSpec';

describe('physical sizes line up with the formats they describe', () => {
  it('names a format that exists', () => {
    const keys = new Set(DESIGN_FORMATS.map((f) => f.key));
    for (const key of Object.keys(PHYSICAL)) {
      expect(keys.has(key), `PHYSICAL has "${key}" but DESIGN_FORMATS does not`).toBe(true);
    }
    for (const key of LARGE_FORMAT) {
      expect(keys.has(key), `LARGE_FORMAT has "${key}" but DESIGN_FORMATS does not`).toBe(true);
    }
  });

  /*
   * A format whose pixel aspect does not match the paper it claims will
   * print with white down one edge or lose a strip off another. Half a
   * percent is the tolerance for rounding a millimetre into whole pixels.
   */
  it('matches the paper aspect it claims', () => {
    for (const [key, mm] of Object.entries(PHYSICAL)) {
      const f = DESIGN_FORMATS.find((x) => x.key === key)!;
      const paper = mm.widthMm / mm.heightMm;
      const pixels = f.w / f.h;
      expect(Math.abs(paper - pixels) / paper, key).toBeLessThan(0.005);
    }
  });

  /*
   * ── THE TWO REGISTRIES ───────────────────────────────────────────────
   *
   * `formats.ts` declares A4 in millimetres at PRINT_DPI and gets
   * 2480x3508. `DESIGN_FORMATS` declares it in pixels and gets 1240x1754.
   * Same sheet of paper, half the resolution, and the Studio and Create
   * Media each use a different one. Pinned so the gap cannot widen
   * unnoticed, and so closing it is a deliberate act.
   */
  it('records that the Studio and Create Media disagree about A4', () => {
    const studio = presetPixels(PRESETS.find((p) => p.id === 'a4')!);
    const createMedia = DESIGN_FORMATS.find((f) => f.key === 'a4')!;
    expect(studio).toEqual({ width: 2480, height: 3508 });
    expect([createMedia.w, createMedia.h]).toEqual([1240, 1754]);
    expect(canvasDpiOf('a4')).toBe(Math.round(PRESS_DPI / 2));
  });
});

describe('the canvas is not the file', () => {
  it('renders a small canvas up, and a large one at 1:1', () => {
    /* Under half the cap: limited by the 2x ratio, not by the edge. */
    expect(exportPixelRatio(1000)).toBe(EXPORT_MAX_RATIO);
    /* In range: scaled to land exactly on the cap. */
    expect(exportPixelRatio(2000)).toBeCloseTo(EXPORT_MAX_EDGE / 2000, 6);
    /* Already larger: never shrunk, or a billboard would lose detail. */
    expect(exportPixelRatio(4500)).toBe(1);
    expect(exportPixelRatio(0)).toBe(1);
  });

  /*
   * Measured 2026-10-20. Pinned so a change to the canvas or to the export
   * cap shows up as a failing test with the real customer-facing number in
   * it, rather than silently moving what people download.
   */
  const DELIVERED: Record<string, { canvas: number; delivered: number }> = {
    a4: { canvas: 150, delivered: 205 },
    a3: { canvas: 121, delivered: 145 },
    letter: { canvas: 150, delivered: 218 },
    'half-a4': { canvas: 150, delivered: 290 },
    'business-card': { canvas: 300, delivered: 600 },
    'business-card-portrait': { canvas: 300, delivered: 600 },
    letterhead: { canvas: 300, delivered: 300 },
    'compliment-slip': { canvas: 300, delivered: 300 },
    postcard: { canvas: 300, delivered: 412 },
  };

  it('reports both the canvas and the downloaded resolution', () => {
    for (const [key, want] of Object.entries(DELIVERED)) {
      expect(canvasDpiOf(key), `${key} canvas`).toBe(want.canvas);
      expect(deliveredDpiOf(key), `${key} delivered`).toBe(want.delivered);
    }
  });

  it('never delivers less than the canvas', () => {
    for (const key of Object.keys(PHYSICAL)) {
      expect(deliveredDpiOf(key)!, key).toBeGreaterThanOrEqual(canvasDpiOf(key)!);
    }
  });

  it('has no resolution for a format with no physical size', () => {
    for (const key of ['instagram-post', 'billboard', 'not-a-format']) {
      expect(canvasDpiOf(key), key).toBeNull();
      expect(deliveredDpiOf(key), key).toBeNull();
    }
  });
});

describe('readiness judges the file, not the canvas', () => {
  it('calls 300dpi delivered press, and nothing else', () => {
    for (const key of Object.keys(PHYSICAL)) {
      const spec = specFor(key);
      if (spec.readiness === 'press') expect(spec.deliveredDpi, key).toBeGreaterThanOrEqual(PRESS_DPI);
      else expect(spec.deliveredDpi, key).toBeLessThan(PRESS_DPI);
    }
  });

  /*
   * A4's canvas is 150dpi and its file is 205dpi. Judging the canvas would
   * tell a customer their flyer is worse than it is — the opposite error to
   * the one this module exists to prevent, and just as wrong.
   */
  it('does not understate a format the export path improves', () => {
    const a4 = specFor('a4');
    expect(a4.canvasDpi).toBe(150);
    expect(a4.deliveredDpi).toBe(205);
    expect(a4.readiness).toBe('office');
    expect(printNoteFor('a4')).toContain('205dpi');
    expect(printNoteFor('a4')).not.toContain('150dpi');
  });

  it('still refuses A3, which arrives below print even after scaling', () => {
    const a3 = specFor('a3');
    expect(a3.deliveredDpi).toBeLessThan(OFFICE_DPI);
    expect(a3.readiness).toBe('below-print');
  });

  it('refuses to quote a resolution for large format', () => {
    for (const key of LARGE_FORMAT) {
      const spec = specFor(key);
      expect(spec.readiness, key).toBe('large-format');
      expect(spec.deliveredDpi, key).toBeNull();
    }
  });

  it('treats a social canvas as a screen format with nothing to say', () => {
    expect(specFor('instagram-post').readiness).toBe('screen');
    expect(printNoteFor('instagram-post')).toBeNull();
  });
});

describe('bleed and safe area are offered only where they mean something', () => {
  it('gives press formats a bleed in the delivered pixels', () => {
    const card = specFor('business-card');
    expect(card.readiness).toBe('press');
    /* 3mm at the delivered 600dpi, not at the 300dpi canvas. */
    expect(card.bleedPx).toBe(Math.round((BLEED_MM * 600) / 25.4));
    expect(card.safePx).toBeGreaterThan(card.bleedPx!);
  });

  it('withholds bleed from anything not press-ready', () => {
    for (const key of ['a4', 'a3', 'letter', 'half-a4', 'instagram-post', 'billboard']) {
      expect(specFor(key).bleedPx, key).toBeNull();
      expect(specFor(key).safePx, key).toBeNull();
    }
  });
});

describe('the note never overclaims', () => {
  it('says print-ready only when the delivered file is', () => {
    for (const f of DESIGN_FORMATS) {
      const note = printNoteFor(f.key);
      if (note && /print-ready/i.test(note)) {
        expect(specFor(f.key).readiness, f.key).toBe('press');
      }
    }
  });

  it('tells a customer plainly when a format should not be printed', () => {
    const note = printNoteFor('a3')!;
    expect(note).toContain('145dpi');
    expect(note).toMatch(/should not go to a printer/i);
  });

  /*
   * These three were MEASURED by driving the real download in a browser and
   * reading the resulting PNG, not computed and hoped for. The rasteriser
   * truncates, so rounding was wrong by a pixel on two of them.
   */
  it('quotes the pixel size of the file they will actually get', () => {
    expect(printNoteFor('a4')).toContain('1696×2400');
    expect(printNoteFor('a3')).toContain('1696×2400');
    expect(printNoteFor('postcard')).toContain('2400×1702');
    expect(printNoteFor('letterhead')).toContain('2480×3508');
  });
});

describe('the cost of fixing a format is a number, not a guess', () => {
  it('reports the press canvas and how much bigger it is', () => {
    const a4 = pressCanvasFor('a4')!;
    expect([a4.w, a4.h]).toEqual([2480, 3508]);
    /* A4 at press is exactly the letterhead canvas, which already ships. */
    const letterhead = DESIGN_FORMATS.find((f) => f.key === 'letterhead')!;
    expect([a4.w, a4.h]).toEqual([letterhead.w, letterhead.h]);
    expect(pressCanvasFor('a3')).toEqual({ w: 3508, h: 4961, growth: 6.2 });
  });

  /*
   * A3 at 300dpi is 4961px on the long edge, and `exportDesign.ts` caps a
   * canvas at 4096 per side because beyond it iOS Safari returns a blank
   * image rather than an error. So A3 cannot be made press-ready in a
   * browser at all — its ceiling is lower, and that is a fact about the
   * platform rather than a choice anybody gets to make.
   */
  it('shows that A3 cannot reach press resolution in a browser', () => {
    expect(pressCanvasFor('a3')!.h).toBeGreaterThan(4096);
    expect(exportCeilingDpi('a3')).toBe(247);
    expect(exportCeilingDpi('a3')!).toBeLessThan(PRESS_DPI);
    /* A4 has room to spare. */
    expect(pressCanvasFor('a4')!.h).toBeLessThan(4096);
    expect(exportCeilingDpi('a4')!).toBeGreaterThanOrEqual(PRESS_DPI);
  });

  it('lists every format that claims paper but does not arrive press-ready', () => {
    expect(belowPressFormats().map((s) => s.key)).toEqual(['a3', 'a4', 'letter', 'half-a4']);
  });
});
