// NowOpen Studio — AI Design Inspiration.
//
// Upload a design you like; get an editable NowOpen design in YOUR brand.
//
// WHAT THIS DOES, EXACTLY
// Reads the uploaded image's pixels and derives two things that are genuinely
// measurable without a vision model:
//   1. a colour palette (via studioBrand.paletteFromPixels)
//   2. a composition archetype — where the visual weight sits (top / centre /
//      split / bottom / framed), from an ink-density grid
// It then picks the closest existing NowOpen layout, applies the business's own
// brand, and hands the result to the normal smart-slot editor.
//
// WHAT IT DELIBERATELY DOES NOT DO
// No OCR, no logo/QR/icon detection, no typography identification, no object
// recognition. Those need a vision model, and none is wired up (only the
// chatbot and translate-caption functions reach a model). Rather than animate a
// fake "✓ Reading text…" checklist, the UI reports only the steps that ran.
//
// COPYRIGHT
// The uploaded file is never reproduced or redistributed. Nothing from it
// reaches the output except a four-colour palette and one of five composition
// labels — facts about the image, not the artwork. The design that comes out is
// a NowOpen layout carrying the merchant's own logo, colours and copy. Keep it
// that way: if a future version starts copying glyphs, images or exact
// geometry, it stops being inspiration and becomes reproduction.
//
// UPGRADE PATH
// analyseInspiration() returns an `evidence` list naming what each conclusion
// came from. When a vision model is added, extra analysers append to that list
// (extracted headline, detected logo box, …) without changing the contract, and
// the UI keeps showing only what actually ran.

import { paletteFromPixels, type BrandPalette } from './studioBrand';
import { STUDIO_LAYOUTS } from '../data/studioPresets';

/** Where the visual weight of a design sits. */
export type CompositionArchetype = 'top-heavy' | 'centred' | 'split' | 'bottom-heavy' | 'framed';

export interface InspirationAnalysis {
  palette: BrandPalette;
  archetype: CompositionArchetype;
  /** 0–1 mean luminance. Drives whether we suggest a light or dark layout. */
  brightness: number;
  /** 0–1 spread of luminance — low means flat, high means punchy. */
  contrast: number;
  /** 0–1 share of cells carrying detail; a rough proxy for how busy it is. */
  density: number;
  aspect: number;
  /** Human-readable record of what each conclusion was derived from. */
  evidence: string[];
}

const GRID = 6;

function luma(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Ink density per grid cell. "Ink" means local deviation from the image's mean
 * luminance — a cheap stand-in for "something is happening here" that works on
 * both dark-on-light and light-on-dark designs.
 */
export function densityGrid(data: Uint8ClampedArray, width: number, height: number, grid = GRID): number[][] {
  const cells: number[][] = Array.from({ length: grid }, () => Array(grid).fill(0));
  const counts: number[][] = Array.from({ length: grid }, () => Array(grid).fill(0));

  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += luma(data[i], data[i + 1], data[i + 2]);
    n++;
  }
  const mean = n ? sum / n : 0;

  for (let y = 0; y < height; y++) {
    const gy = Math.min(grid - 1, Math.floor((y / height) * grid));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(grid - 1, Math.floor((x / width) * grid));
      const i = (y * width + x) * 4;
      cells[gy][gx] += Math.abs(luma(data[i], data[i + 1], data[i + 2]) - mean);
      counts[gy][gx]++;
    }
  }
  return cells.map((row, y) => row.map((v, x) => (counts[y][x] ? v / counts[y][x] : 0)));
}

/** Mean luminance per grid cell. */
export function luminanceGrid(data: Uint8ClampedArray, width: number, height: number, grid = GRID): number[][] {
  const cells: number[][] = Array.from({ length: grid }, () => Array(grid).fill(0));
  const counts: number[][] = Array.from({ length: grid }, () => Array(grid).fill(0));
  for (let y = 0; y < height; y++) {
    const gy = Math.min(grid - 1, Math.floor((y / height) * grid));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(grid - 1, Math.floor((x / width) * grid));
      const i = (y * width + x) * 4;
      cells[gy][gx] += luma(data[i], data[i + 1], data[i + 2]);
      counts[gy][gx]++;
    }
  }
  return cells.map((row, y) => row.map((v, x) => (counts[y][x] ? v / counts[y][x] : 0)));
}

/**
 * Classify where the weight sits.
 *
 * Takes the ink grid plus, optionally, the luminance grid. Both are needed:
 * ink is |luma − mean|, which finds sparse marks on a background but is blind to
 * a two-tone split — a half-dark image deviates from the mean equally on both
 * sides and would read as centred. Luminance asymmetry catches exactly that.
 */
export function archetypeFromGrid(gridCells: number[][], lumaCells?: number[][]): CompositionArchetype {
  const g = gridCells.length;
  const band = (from: number, to: number) => {
    let s = 0;
    let c = 0;
    for (let y = from; y < to; y++) for (let x = 0; x < g; x++) { s += gridCells[y][x]; c++; }
    return c ? s / c : 0;
  };
  const third = Math.max(1, Math.round(g / 3));
  const top = band(0, third);
  const middle = band(third, g - third);
  const bottom = band(g - third, g);

  // Edge vs centre, for the framed case.
  let edge = 0, edgeN = 0, core = 0, coreN = 0;
  for (let y = 0; y < g; y++) {
    for (let x = 0; x < g; x++) {
      const onEdge = y === 0 || x === 0 || y === g - 1 || x === g - 1;
      if (onEdge) { edge += gridCells[y][x]; edgeN++; } else { core += gridCells[y][x]; coreN++; }
    }
  }
  const edgeAvg = edgeN ? edge / edgeN : 0;
  const coreAvg = coreN ? core / coreN : 0;

  // Left vs right halves, for the split case. Measured on luminance when we
  // have it, since ink is blind to a two-tone split (see the doc comment).
  const splitSource = lumaCells ?? gridCells;
  let left = 0, leftN = 0, right = 0, rightN = 0;
  const half = Math.floor(g / 2);
  for (let y = 0; y < g; y++) {
    for (let x = 0; x < g; x++) {
      if (x < half) { left += splitSource[y][x]; leftN++; } else { right += splitSource[y][x]; rightN++; }
    }
  }
  const leftAvg = leftN ? left / leftN : 0;
  const rightAvg = rightN ? right / rightN : 0;

  const rel = (a: number, b: number) => (b === 0 ? 0 : (a - b) / Math.max(a, b));

  if (edgeAvg > 0 && rel(edgeAvg, coreAvg) > 0.35) return 'framed';
  if (Math.abs(rel(leftAvg, rightAvg)) > 0.4) return 'split';
  if (rel(top, Math.max(middle, bottom)) > 0.2) return 'top-heavy';
  if (rel(bottom, Math.max(middle, top)) > 0.2) return 'bottom-heavy';
  return 'centred';
}

/** Analyse a decoded pixel buffer. Pure, so it's testable without a browser. */
export function analysePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): InspirationAnalysis | null {
  const palette = paletteFromPixels(data);
  if (!palette) return null;

  const cells = densityGrid(data, width, height);
  const archetype = archetypeFromGrid(cells, luminanceGrid(data, width, height));

  let sum = 0;
  let n = 0;
  let min = 1;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const l = luma(data[i], data[i + 1], data[i + 2]);
    sum += l; n++;
    if (l < min) min = l;
    if (l > max) max = l;
  }
  const brightness = n ? sum / n : 0;
  const contrast = Math.max(0, max - min);

  const flat = cells.flat();
  const cellMax = Math.max(...flat, 0.0001);
  const density = flat.filter((v) => v > cellMax * 0.35).length / flat.length;

  return {
    palette,
    archetype,
    brightness,
    contrast,
    density,
    aspect: height === 0 ? 1 : width / height,
    evidence: [
      `palette from ${Math.round(data.length / 4)} sampled pixels`,
      `composition from a ${GRID}×${GRID} ink-density grid → ${archetype}`,
      `brightness ${(brightness * 100).toFixed(0)}% · contrast ${(contrast * 100).toFixed(0)}%`,
      `busyness ${(density * 100).toFixed(0)}% of cells carry detail`,
    ],
  };
}

/** Decode an image URL and analyse it. Returns null where canvas is unavailable. */
export function analyseInspiration(url: string, sample = 96): Promise<InspirationAnalysis | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ratio = img.naturalHeight === 0 ? 1 : img.naturalWidth / img.naturalHeight;
        const w = ratio >= 1 ? sample : Math.max(1, Math.round(sample * ratio));
        const h = ratio >= 1 ? Math.max(1, Math.round(sample / ratio)) : sample;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        const res = analysePixels(data, w, h);
        // Report the true aspect, not the downsampled one.
        resolve(res ? { ...res, aspect: ratio } : null);
      } catch {
        // Tainted canvas (cross-origin without CORS) lands here.
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Turning an analysis into an editable NowOpen design
// ---------------------------------------------------------------------------

/**
 * Which of the existing layouts best carries each composition. Mapped to real
 * STUDIO_LAYOUTS keys with a fallback, so a renamed layout degrades to a valid
 * design instead of a blank one.
 */
const ARCHETYPE_LAYOUTS: Record<CompositionArchetype, string[]> = {
  'top-heavy': ['editorial', 'newspaper', 'classic'],
  centred: ['bold-center', 'spotlight', 'punch'],
  split: ['split', 'diagonal', 'offset'],
  'bottom-heavy': ['card', 'framed', 'classic'],
  framed: ['framed', 'ribbons', 'vintage'],
};

export interface InspirationPlan {
  layoutKey: string;
  /** Accent to apply — the business's brand colour wins when it has one. */
  accent: string;
  /** Background colour, or null to keep the layout's own default. */
  bgColor: string | null;
  archetype: CompositionArchetype;
  /** What we changed and why, shown to the merchant. */
  notes: string[];
  /** True when the merchant's brand colour replaced the sampled accent. */
  brandApplied: boolean;
}

/**
 * Build the plan. `brandAccent` is the merchant's saved brand colour; when set
 * it always beats the sampled one — the point is a design in THEIR brand, not a
 * recreation of someone else's.
 */
export function inspirationPlan(
  analysis: InspirationAnalysis,
  brandAccent?: string,
): InspirationPlan {
  const valid = new Set(STUDIO_LAYOUTS.map((l) => l.key));
  const layoutKey = ARCHETYPE_LAYOUTS[analysis.archetype].find((k) => valid.has(k))
    ?? STUDIO_LAYOUTS[0].key;

  const brandApplied = !!brandAccent?.trim();
  const accent = brandApplied ? brandAccent!.trim() : analysis.palette.accent;

  // Only impose a background when the source was clearly dark; otherwise let
  // the layout's own default stand rather than guessing.
  const bgColor = analysis.brightness < 0.35 ? analysis.palette.primary : null;

  const notes: string[] = [
    `Composition read as ${analysis.archetype} — using the “${STUDIO_LAYOUTS.find((l) => l.key === layoutKey)?.label ?? layoutKey}” layout.`,
    brandApplied
      ? 'Applied your saved brand colour, not the colour from the upload.'
      : `Sampled ${analysis.palette.accent} as the accent — set a brand colour in Brand OS to use yours instead.`,
  ];
  if (bgColor) notes.push('Source was dark, so the background follows its dominant tone.');
  if (analysis.density > 0.6) notes.push('The original is busy — keep your copy short so it still reads.');
  if (analysis.contrast < 0.35) notes.push('Low contrast in the original; the layout raises it for legibility.');
  notes.push('Your text, logo and QR are used — nothing from the uploaded file is reproduced.');

  return { layoutKey, accent, bgColor, archetype: analysis.archetype, notes, brandApplied };
}
