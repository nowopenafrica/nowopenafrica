import { describe, it, expect } from 'vitest';

import {
  detectRegions, documentFromReference, estimateBackground, luminance, pickAccent,
  planReconstruction, regionLabel, regionTextSize, samplePalette, toHex, type Bitmap,
} from './reference';

/** A blank picture of one colour. */
function canvas(width: number, height: number, rgb: [number, number, number]): Bitmap {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** Paint a rectangle, in pixels. */
function paint(img: Bitmap, x: number, y: number, w: number, h: number, rgb: [number, number, number]) {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      const i = (py * img.width + px) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
    }
  }
}

/** Stripes, which is what a line of type looks like to a variance test. */
function stripes(img: Bitmap, x: number, y: number, w: number, h: number, rgb: [number, number, number]) {
  for (let py = y; py < y + h; py += 2) paint(img, x, py, w, 1, rgb);
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];
const BRAND: [number, number, number] = [10, 125, 75];

describe('colour basics', () => {
  it('writes hex', () => {
    expect(toHex(255, 255, 255)).toBe('#ffffff');
    expect(toHex(10, 125, 75)).toBe('#0a7d4b');
    expect(toHex(-5, 300, 75)).toBe('#00ff4b');
  });

  it('knows light from dark', () => {
    expect(luminance(255, 255, 255)).toBeCloseTo(1, 3);
    expect(luminance(0, 0, 0)).toBe(0);
    expect(luminance(0, 255, 0)).toBeGreaterThan(luminance(0, 0, 255));
  });
});

describe('the palette', () => {
  it('puts the commonest colour first', () => {
    const img = canvas(80, 80, WHITE);
    paint(img, 0, 0, 80, 20, BRAND);
    const palette = samplePalette(img);
    expect(palette[0].hex).toBe('#ffffff');
    expect(palette.some((s) => s.hex.startsWith('#0'))).toBe(true);
  });

  it('reports each colour as a share of the picture', () => {
    const img = canvas(80, 80, WHITE);
    paint(img, 0, 0, 80, 40, BLACK);
    const palette = samplePalette(img);
    const total = palette.reduce((sum, s) => sum + s.weight, 0);
    expect(total).toBeGreaterThan(0.9);
    expect(palette[0].weight).toBeGreaterThan(0.4);
  });

  /* A photograph holds thousands of near-identical blues; a palette of thousands is not one. */
  it('merges colours that are nearly the same', () => {
    const img = canvas(60, 60, [100, 100, 100]);
    for (let y = 0; y < 60; y += 1) paint(img, 0, y, 60, 1, [100 + (y % 3), 100, 100]);
    expect(samplePalette(img).length).toBeLessThanOrEqual(2);
  });

  it('copes with an empty picture', () => {
    expect(samplePalette({ width: 0, height: 0, data: [] })).toEqual([]);
  });
});

describe('the background', () => {
  /*
   * Taken from the EDGES. The commonest colour overall would call a big
   * photograph the background and paint the whole page with it.
   */
  it('comes from the border, not from the biggest thing in the middle', () => {
    const img = canvas(100, 100, WHITE);
    paint(img, 10, 10, 80, 80, BLACK); // a large central photo
    expect(estimateBackground(img)).toBe('#ffffff');
  });

  it('finds a dark ground', () => {
    const img = canvas(100, 100, BLACK);
    paint(img, 20, 20, 60, 60, WHITE);
    expect(estimateBackground(img)).toBe('#000000');
  });

  it('never returns nothing', () => {
    expect(estimateBackground({ width: 0, height: 0, data: [] })).toBe('#ffffff');
  });
});

describe('finding where the content is', () => {
  it('finds nothing on a blank page', () => {
    expect(detectRegions(canvas(160, 160, WHITE))).toEqual([]);
  });

  it('finds a block of type and places it where it actually is', () => {
    const img = canvas(160, 160, WHITE);
    stripes(img, 16, 96, 128, 32, BLACK); // a paragraph in the lower half
    const regions = detectRegions(img);
    expect(regions.length).toBeGreaterThan(0);
    const found = regions[0];
    expect(found.y).toBeGreaterThan(0.45);
    expect(found.y + found.h).toBeLessThanOrEqual(1.0001);
    expect(found.x).toBeLessThan(0.3);
    expect(found.w).toBeGreaterThan(0.5);
  });

  it('keeps two separated blocks separate', () => {
    const img = canvas(160, 160, WHITE);
    stripes(img, 16, 16, 128, 24, BLACK);
    stripes(img, 16, 120, 128, 24, BLACK);
    const regions = detectRegions(img);
    expect(regions.length).toBeGreaterThanOrEqual(2);
  });

  /* A flat colour block is not text, however large. */
  it('ignores a flat area of solid colour', () => {
    const img = canvas(160, 160, WHITE);
    paint(img, 20, 20, 120, 60, BRAND);
    const regions = detectRegions(img);
    const insideBlock = regions.filter((r) => r.y > 0.1 && r.y < 0.45 && r.w > 0.5);
    expect(insideBlock.length).toBe(0);
  });

  it('returns a handful at most, not a field of noise', () => {
    const img = canvas(200, 200, WHITE);
    for (let i = 0; i < 20; i += 1) stripes(img, 5 + (i % 5) * 38, 5 + Math.floor(i / 5) * 48, 30, 20, BLACK);
    expect(detectRegions(img).length).toBeLessThanOrEqual(8);
  });

  it('keeps every region inside the page', () => {
    const img = canvas(160, 160, WHITE);
    stripes(img, 0, 0, 160, 160, BLACK);
    for (const r of detectRegions(img)) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(1.0001);
      expect(r.y + r.h).toBeLessThanOrEqual(1.0001);
    }
  });

  it('declines a picture too small to divide', () => {
    expect(detectRegions(canvas(8, 8, WHITE))).toEqual([]);
  });
});

describe('the whole plan', () => {
  it('carries the size, the ground, the palette and the areas', () => {
    const img = canvas(200, 300, WHITE);
    stripes(img, 20, 200, 160, 40, BLACK);
    const plan = planReconstruction(img);
    expect(plan.width).toBe(200);
    expect(plan.height).toBe(300);
    expect(plan.background).toBe('#ffffff');
    expect(plan.dark).toBe(false);
    expect(plan.palette.length).toBeGreaterThan(0);
    expect(plan.regions.length).toBeGreaterThan(0);
  });

  it('knows when the reference is light type on a dark ground', () => {
    const img = canvas(200, 200, BLACK);
    stripes(img, 20, 100, 160, 40, WHITE);
    expect(planReconstruction(img).dark).toBe(true);
  });
});

describe('what a detected area is called', () => {
  /*
   * It says it is a DETECTED AREA and how sure the detection was. Calling it
   * "Headline" would be a guess presented as a fact: the analysis knows where
   * the ink is, never what it says.
   */
  it('names the certainty and never the content', () => {
    expect(regionLabel({ x: 0, y: 0, w: 1, h: 1, confidence: 0.9 }, 0)).toBe('Text area 1 (clear)');
    expect(regionLabel({ x: 0, y: 0, w: 1, h: 1, confidence: 0.4 }, 1)).toBe('Text area 2 (likely)');
    expect(regionLabel({ x: 0, y: 0, w: 1, h: 1, confidence: 0.1 }, 2)).toBe('Text area 3 (faint)');
  });
});

describe('the accent it works with', () => {
  /* Not the commonest colour — that is nearly always the paper. */
  it('picks the most colourful swatch, not the biggest', () => {
    expect(pickAccent([
      { hex: '#ffffff', weight: 0.8 },
      { hex: '#0a7d4b', weight: 0.2 },
    ])).toBe('#0a7d4b');
  });

  it('falls back when everything is grey', () => {
    expect(pickAccent([{ hex: '#eeeeee', weight: 1 }])).toBe('#4f46e5');
    expect(pickAccent([])).toBe('#4f46e5');
  });
});

describe('the document a reference becomes', () => {
  const planFor = () => {
    const img = canvas(200, 300, WHITE);
    stripes(img, 20, 40, 160, 40, BLACK);
    stripes(img, 20, 200, 160, 30, BLACK);
    return planReconstruction(img);
  };

  it('is the size and colour of the reference', () => {
    const doc = documentFromReference(planFor(), 'u/studio/ref.png');
    expect(doc.pages[0].width).toBe(200);
    expect(doc.pages[0].height).toBe(300);
    expect(doc.pages[0].background).toBe('#ffffff');
  });

  /*
   * The reference is the thing being worked from. Unlocked, one stray drag
   * destroys the alignment with no obvious way back.
   */
  it('keeps the reference as a locked bottom layer', () => {
    const doc = documentFromReference(planFor(), 'u/studio/ref.png');
    const reference = doc.pages[0].objects[0];
    expect(reference.type).toBe('image');
    expect(reference.locked).toBe(true);
    expect(reference.z).toBe(1);
    expect((reference as { assetId?: string }).assetId).toBe('u/studio/ref.png');
  });

  it('puts a real editable text object over every detected area', () => {
    const plan = planFor();
    const doc = documentFromReference(plan, 'ref');
    const texts = doc.pages[0].objects.filter((o) => o.type === 'text');
    expect(texts).toHaveLength(plan.regions.length);
    for (const t of texts) expect(t.locked).toBe(false);
  });

  /*
   * ── THE REFUSAL ──────────────────────────────────────────────────────
   *
   * No OCR ran. Placing invented words here would produce a design that
   * looks right and says something the business never said.
   */
  it('never invents the words, and says the area is only detected', () => {
    const doc = documentFromReference(planFor(), 'ref');
    for (const o of doc.pages[0].objects.filter((x) => x.type === 'text')) {
      expect((o as { text: string }).text).toMatch(/type the words/i);
      expect(o.name).toMatch(/text area \d+ \((clear|likely|faint)\)/i);
    }
  });

  it('writes light text when the reference is dark', () => {
    const img = canvas(200, 200, BLACK);
    stripes(img, 20, 100, 160, 40, WHITE);
    const doc = documentFromReference(planReconstruction(img), 'ref');
    const text = doc.pages[0].objects.find((o) => o.type === 'text');
    expect((text as { colour?: string })?.colour).toBe('#ffffff');
  });
});

describe('how big the placeholder text is', () => {
  const CHARS = 'Type the words here'.length;
  /* The box the text has to live in, in the units `size` is measured in. */
  const fits = (size: number, region: { w: number; h: number }, w: number, h: number) => {
    const lines = Math.ceil((CHARS * 0.5 * size) / region.w);
    return lines * 1.1 * size <= region.h * (h / w) + 1e-9;
  };

  /*
   * ── FOUND BY OPENING A PDF ───────────────────────────────────────────
   *
   * Two mistakes in one expression. `region.h` is a fraction of the page
   * HEIGHT while `size` is a fraction of the page WIDTH, so a portrait page
   * came out over-sized by its own aspect ratio; and the region's width was
   * ignored, so a nineteen-character placeholder wrapped to three lines and
   * spilled out of the box it was meant to label.
   */
  it('fits the area it was found in, across and down', () => {
    const band = { x: 0.1, y: 0.4, w: 0.8, h: 0.14, confidence: 0.9 };
    const size = regionTextSize(band, 1131, 1600);
    expect(fits(size, band, 1131, 1600)).toBe(true);
  });

  it('does not size a tall narrow area by its height alone', () => {
    const narrow = { x: 0.1, y: 0.1, w: 0.06, h: 0.4, confidence: 0.9 };
    const size = regionTextSize(narrow, 1000, 1000);
    expect(fits(size, narrow, 1000, 1000)).toBe(true);
    /* The old rule returned 0.24 here — four times the area's whole width. */
    expect(size).toBeLessThan(narrow.w);
  });

  it('uses the room a wider area gives it', () => {
    const narrow = { x: 0, y: 0, w: 0.2, h: 0.3, confidence: 1 };
    const wide = { x: 0, y: 0, w: 0.8, h: 0.3, confidence: 1 };
    expect(regionTextSize(wide, 1000, 1000)).toBeGreaterThan(regionTextSize(narrow, 1000, 1000));
  });

  it('stays within readable bounds whatever the area', () => {
    expect(regionTextSize({ x: 0, y: 0, w: 1, h: 1, confidence: 1 }, 1000, 1000)).toBeLessThanOrEqual(0.12);
    expect(regionTextSize({ x: 0, y: 0, w: 0.001, h: 0.001, confidence: 1 }, 1000, 1000)).toBeGreaterThanOrEqual(0.02);
  });

  it('survives a page with no width', () => {
    expect(Number.isFinite(regionTextSize({ x: 0, y: 0, w: 0.5, h: 0.5, confidence: 1 }, 0, 0))).toBe(true);
  });
});
