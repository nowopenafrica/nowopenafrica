import { describe, it, expect } from 'vitest';
import {
  densityGrid, luminanceGrid, archetypeFromGrid, analysePixels, inspirationPlan,
  type CompositionArchetype,
} from './designInspiration';
import { STUDIO_LAYOUTS } from '../data/studioPresets';

const W = 60;
const H = 60;

/**
 * Build an RGBA buffer. `ink(x, y)` returns true where a dark mark sits on an
 * otherwise white canvas — enough to drive the ink-density grid.
 */
function image(ink: (x: number, y: number) => boolean, w = W, h = H): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dark = ink(x, y);
      data[i] = data[i + 1] = data[i + 2] = dark ? 10 : 245;
      data[i + 3] = 255;
    }
  }
  return data;
}

// Mirrors what analysePixels does, so the tests cover the real code path.
const detect = (ink: (x: number, y: number) => boolean): CompositionArchetype => {
  const data = image(ink);
  return archetypeFromGrid(densityGrid(data, W, H), luminanceGrid(data, W, H));
};

describe('composition detection', () => {
  it('reads a mark in the upper third as top-heavy', () => {
    expect(detect((_, y) => y < H / 3)).toBe('top-heavy');
  });

  it('reads a mark in the lower third as bottom-heavy', () => {
    expect(detect((_, y) => y > (H * 2) / 3)).toBe('bottom-heavy');
  });

  it('reads one loaded half as split', () => {
    expect(detect((x) => x < W / 2)).toBe('split');
  });

  it('reads a border as framed', () => {
    const edge = 6;
    expect(detect((x, y) => x < edge || y < edge || x > W - edge || y > H - edge)).toBe('framed');
  });

  it('falls back to centred for a middle block', () => {
    expect(detect((x, y) => x > W * 0.3 && x < W * 0.7 && y > H * 0.35 && y < H * 0.65)).toBe('centred');
  });

  it('treats a blank canvas as centred rather than throwing', () => {
    expect(detect(() => false)).toBe('centred');
  });
});

describe('analysePixels', () => {
  const mostlyDark = image((_, y) => y < H * 0.9);
  const mostlyLight = image(() => false);

  it('reports brightness that tracks the image', () => {
    const dark = analysePixels(mostlyDark, W, H)!;
    const light = analysePixels(mostlyLight, W, H)!;
    expect(dark.brightness).toBeLessThan(light.brightness);
    expect(light.brightness).toBeGreaterThan(0.9);
  });

  it('derives a four-colour palette', () => {
    const a = analysePixels(image((x) => x < W / 2), W, H)!;
    for (const key of ['primary', 'secondary', 'accent', 'neutral'] as const) {
      expect(a.palette[key], key).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('records evidence for every conclusion it draws', () => {
    const a = analysePixels(image((_, y) => y < H / 3), W, H)!;
    expect(a.evidence.length).toBeGreaterThanOrEqual(4);
    expect(a.evidence.join(' ')).toMatch(/palette from \d+ sampled pixels/);
    expect(a.evidence.join(' ')).toMatch(/ink-density grid/);
  });

  it('reports the true aspect ratio', () => {
    const wide = analysePixels(image(() => false, 120, 60), 120, 60)!;
    expect(wide.aspect).toBeCloseTo(2, 1);
  });

  it('returns null for an empty buffer instead of throwing', () => {
    expect(analysePixels(new Uint8ClampedArray(0), 0, 0)).toBeNull();
  });
});

describe('inspirationPlan', () => {
  const analysisFor = (ink: (x: number, y: number) => boolean) =>
    analysePixels(image(ink), W, H)!;

  it('always picks a layout that exists', () => {
    const keys = new Set(STUDIO_LAYOUTS.map((l) => l.key));
    const shapes: ((x: number, y: number) => boolean)[] = [
      (_, y) => y < H / 3,
      (_, y) => y > (H * 2) / 3,
      (x) => x < W / 2,
      (x, y) => x < 6 || y < 6 || x > W - 6 || y > H - 6,
      (x, y) => x > W * 0.3 && x < W * 0.7 && y > H * 0.35 && y < H * 0.65,
    ];
    for (const s of shapes) {
      expect(keys.has(inspirationPlan(analysisFor(s)).layoutKey)).toBe(true);
    }
  });

  it("prefers the merchant's brand colour over the sampled one", () => {
    const a = analysisFor((x) => x < W / 2);
    const plan = inspirationPlan(a, '#7c3aed');
    expect(plan.accent).toBe('#7c3aed');
    expect(plan.brandApplied).toBe(true);
    expect(plan.notes.join(' ')).toMatch(/your saved brand colour/i);
  });

  it('falls back to the sampled accent and says so', () => {
    const a = analysisFor((x) => x < W / 2);
    const plan = inspirationPlan(a);
    expect(plan.accent).toBe(a.palette.accent);
    expect(plan.brandApplied).toBe(false);
    expect(plan.notes.join(' ')).toMatch(/Brand OS/);
  });

  it('ignores a blank brand colour', () => {
    const plan = inspirationPlan(analysisFor((x) => x < W / 2), '   ');
    expect(plan.brandApplied).toBe(false);
  });

  it('only imposes a background when the source is genuinely dark', () => {
    const dark = analysePixels(image((_, y) => y < H * 0.95), W, H)!;
    const light = analysePixels(image(() => false), W, H)!;
    expect(inspirationPlan(dark).bgColor).not.toBeNull();
    expect(inspirationPlan(light).bgColor).toBeNull();
  });

  it('always states that nothing from the upload is reproduced', () => {
    // The copyright promise is part of the contract, so it is asserted.
    const plan = inspirationPlan(analysisFor((x) => x < W / 2), '#7c3aed');
    expect(plan.notes.join(' ')).toMatch(/nothing from the uploaded file is reproduced/i);
  });

  it('never claims to have read text, logos or fonts', () => {
    const a = analysisFor((x) => x < W / 2);
    const words = [...a.evidence, ...inspirationPlan(a).notes].join(' ').toLowerCase();
    for (const forbidden of ['read the text', 'detected logo', 'detected font', 'typography', 'ocr']) {
      expect(words, forbidden).not.toContain(forbidden);
    }
  });
});
