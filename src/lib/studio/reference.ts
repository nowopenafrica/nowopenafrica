/**
 * Recreating a design from a picture of one.
 *
 * ── WHAT THIS DOES, AND WHAT IT REFUSES TO PRETEND ───────────────────────
 *
 * A flattened JPG does not contain the layers that made it. Nothing can
 * recover them. What CAN be recovered, from the pixels alone and with no
 * model involved, is the shape of the thing: its proportions, its background,
 * the colours it is built from, and WHERE the busy areas sit — the places a
 * headline, a logo or a block of small print occupy.
 *
 * So that is exactly what this produces: an editable document with the
 * reference kept as a locked layer underneath, the page in the right
 * proportions, the palette pulled out ready to use, and an editable text
 * block over each busy region waiting for the words.
 *
 * It does NOT read the words. There is no OCR here, and a model that guessed
 * them would produce a flyer that looks right and says something the business
 * never said — which is worse than an empty box, because an empty box is
 * obviously empty. Every detected area carries a confidence, and the text
 * placed in it says what it is rather than inventing content.
 *
 * ── WHY THE MATHS IS HERE AND NOT IN A COMPONENT ─────────────────────────
 *
 * Every function below takes a plain {width, height, data} — the shape of an
 * ImageData — so the analysis can be checked against pictures built in a test
 * rather than by uploading a flyer and squinting at the result.
 */

import { blankDocument, objectId, type DesignDocument, type ImageObject, type TextObject } from './designDocument';
import { clampPageSize } from './formats';

export interface Bitmap {
  width: number;
  height: number;
  /** RGBA, four bytes per pixel, exactly as ImageData carries it. */
  data: Uint8ClampedArray | number[];
}

export interface Swatch {
  hex: string;
  /** Share of the sampled pixels, 0..1. */
  weight: number;
}

export interface Region {
  /** Normalised 0..1, the same space the document uses. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0..1 — how strongly this area stood out as detail rather than flat colour. */
  confidence: number;
}

export interface ReferencePlan {
  width: number;
  height: number;
  background: string;
  palette: Swatch[];
  regions: Region[];
  /** True when the reference reads as light text on a dark ground. */
  dark: boolean;
}

const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)));

export const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((n) => clamp255(n).toString(16).padStart(2, '0')).join('')}`;

/** Perceived brightness, 0..1. The usual weighting: green carries most of it. */
export const luminance = (r: number, g: number, b: number): number =>
  (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

const at = (img: Bitmap, x: number, y: number): [number, number, number] => {
  const i = (y * img.width + x) * 4;
  return [img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0];
};

/**
 * The colours the picture is actually made of.
 *
 * Quantised to a coarse grid before counting, because a photograph contains
 * thousands of near-identical blues and a palette of thousands is not a
 * palette. Sorted by how much of the image each one covers, so the first
 * swatch is the one a viewer would call "the colour of it".
 */
export function samplePalette(img: Bitmap, limit = 6, step = 4): Swatch[] {
  if (img.width <= 0 || img.height <= 0) return [];
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  let total = 0;

  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      const [r, g, b] = at(img, x, y);
      /* 32-level buckets: close enough to merge, far enough to stay distinct. */
      const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
      const bucket = buckets.get(key);
      if (bucket) { bucket.r += r; bucket.g += g; bucket.b += b; bucket.n += 1; }
      else buckets.set(key, { r, g, b, n: 1 });
      total += 1;
    }
  }

  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map((bucket) => ({
      hex: toHex(bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n),
      weight: total > 0 ? bucket.n / total : 0,
    }));
}

/**
 * The background, taken from the EDGES.
 *
 * A design's border is almost always its ground: the subject sits in the
 * middle and the margins are the paper. Taking the commonest colour overall
 * would call a large photograph the background and paint the page with it.
 */
export function estimateBackground(img: Bitmap): string {
  if (img.width <= 0 || img.height <= 0) return '#ffffff';
  const counts = new Map<string, { r: number; g: number; b: number; n: number }>();
  const step = Math.max(1, Math.floor(Math.min(img.width, img.height) / 64));

  const add = (x: number, y: number) => {
    const [r, g, b] = at(img, x, y);
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const bucket = counts.get(key);
    if (bucket) { bucket.r += r; bucket.g += g; bucket.b += b; bucket.n += 1; }
    else counts.set(key, { r, g, b, n: 1 });
  };

  for (let x = 0; x < img.width; x += step) { add(x, 0); add(x, img.height - 1); }
  for (let y = 0; y < img.height; y += step) { add(0, y); add(img.width - 1, y); }

  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return best ? toHex(best.r / best.n, best.g / best.n, best.b / best.n) : '#ffffff';
}

/**
 * Where the picture is busy.
 *
 * The image is divided into a grid and each cell scored by how much its
 * brightness varies. Flat paper varies almost not at all; a line of type
 * varies enormously. Neighbouring busy cells are joined into rectangles,
 * which is what a block of text looks like from far enough away.
 *
 * This finds WHERE content is, never what it says.
 */
export function detectRegions(img: Bitmap, cols = 16, rows = 16, threshold = 0.055): Region[] {
  if (img.width < cols || img.height < rows) return [];

  const cellW = Math.floor(img.width / cols);
  const cellH = Math.floor(img.height / rows);
  const score: number[][] = [];

  for (let row = 0; row < rows; row += 1) {
    score[row] = [];
    for (let col = 0; col < cols; col += 1) {
      let sum = 0;
      let sumSq = 0;
      let n = 0;
      const stepX = Math.max(1, Math.floor(cellW / 12));
      const stepY = Math.max(1, Math.floor(cellH / 12));
      for (let y = row * cellH; y < (row + 1) * cellH; y += stepY) {
        for (let x = col * cellW; x < (col + 1) * cellW; x += stepX) {
          const [r, g, b] = at(img, x, y);
          const l = luminance(r, g, b);
          sum += l; sumSq += l * l; n += 1;
        }
      }
      const mean = n > 0 ? sum / n : 0;
      /* Standard deviation of brightness: the measure of "busy". */
      score[row][col] = n > 0 ? Math.sqrt(Math.max(0, sumSq / n - mean * mean)) : 0;
    }
  }

  /* Join touching busy cells — a text block is several cells wide. */
  const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
  const regions: Region[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (seen[row][col] || score[row][col] < threshold) continue;
      let minR = row; let maxR = row; let minC = col; let maxC = col;
      let peak = 0;
      const queue = [[row, col]];
      seen[row][col] = true;

      while (queue.length) {
        const [r, c] = queue.pop()!;
        peak = Math.max(peak, score[r][c]);
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr; const nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          if (seen[nr][nc] || score[nr][nc] < threshold) continue;
          seen[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }

      regions.push({
        x: minC / cols,
        y: minR / rows,
        w: (maxC - minC + 1) / cols,
        h: (maxR - minR + 1) / rows,
        confidence: Math.min(1, peak / 0.25),
      });
    }
  }

  /*
   * Biggest first, and only a handful. Twenty slivers of noise is not a
   * reconstruction; it is a mess the user has to clear up before starting.
   */
  return regions
    .filter((r) => r.w * r.h >= (1 / cols) * (1 / rows) * 1.5)
    .sort((a, b) => b.w * b.h - a.w * a.h)
    .slice(0, 8);
}

/** Everything the editor needs to build a document from a reference. */
export function planReconstruction(img: Bitmap): ReferencePlan {
  const background = estimateBackground(img);
  const r = parseInt(background.slice(1, 3), 16);
  const g = parseInt(background.slice(3, 5), 16);
  const b = parseInt(background.slice(5, 7), 16);
  return {
    width: img.width,
    height: img.height,
    background,
    palette: samplePalette(img),
    regions: detectRegions(img),
    dark: luminance(r, g, b) < 0.5,
  };
}

/**
 * What a detected area is called in the layers list.
 *
 * It says it is a detected area, and how sure the detection was. Calling it
 * "Headline" would be a guess presented as a fact — the analysis knows where
 * the ink is, not what the ink says.
 */
export function regionLabel(region: Region, index: number): string {
  const sure = region.confidence >= 0.6 ? 'clear' : region.confidence >= 0.3 ? 'likely' : 'faint';
  return `Text area ${index + 1} (${sure})`;
}

/**
 * The accent to work with: the most colourful thing in the picture.
 *
 * Not the commonest — that is nearly always the paper. A design's accent is
 * the colour it uses sparingly and deliberately, which is the one furthest
 * from grey.
 */
export function pickAccent(palette: Swatch[], fallback = '#4f46e5'): string {
  let best = fallback;
  let bestChroma = 0.08;
  for (const swatch of palette) {
    const r = parseInt(swatch.hex.slice(1, 3), 16) / 255;
    const g = parseInt(swatch.hex.slice(3, 5), 16) / 255;
    const b = parseInt(swatch.hex.slice(5, 7), 16) / 255;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma > bestChroma) { bestChroma = chroma; best = swatch.hex; }
  }
  return best;
}

/**
 * The editable document a reference becomes.
 *
 * The reference itself is kept as the bottom layer and LOCKED: it is the
 * thing being worked from, and a user who drags it by accident loses their
 * alignment with no obvious way back. It can be hidden from the layers list
 * once the rebuild is done.
 *
 * Each detected area becomes a real text object the user types into. The
 * placeholder says what it is — these words were never read from the picture,
 * and writing a guess here would produce a flyer that looks right and says
 * something the business never said.
 */
/**
 * How big the placeholder text in a detected area should be.
 *
 * ── WHY THIS IS NOT JUST THE REGION'S HEIGHT ─────────────────────────────
 *
 * It was `region.h * 0.6`, and that is wrong twice over.
 *
 * First, `region.h` is a fraction of the page HEIGHT while `size` is a
 * fraction of the page WIDTH. On a portrait page those are not the same unit,
 * so the text came out about 1.4x too large on an A4 flyer and more than that
 * on a story.
 *
 * Second, it ignored the region's width entirely. A tall narrow area — a
 * price down the side of a poster, the strip beside a photograph — got text
 * sized for its height and then overflowed its box sideways, which is how a
 * reconstruction opens looking broken.
 *
 * Second, it ignored the region's width entirely, and with it the fact that
 * the placeholder WRAPS. A nineteen-character string in a wide band was sized
 * at six-tenths of the band's height, took three lines to say itself, and
 * spilled out of the box — which is how a reconstruction opens looking
 * broken.
 *
 * So the size is chosen the way a person would: try it on one line, then two,
 * then three, and keep the largest that fits the area both across and down.
 */
const AVG_CHAR_EM = 0.5;
/** Matches the canvas default in DesignSurface. */
const LINE_HEIGHT = 1.1;
const PLACEHOLDER = 'Type the words here';

export function regionTextSize(
  region: Region,
  pageWidth: number,
  pageHeight: number,
  chars = PLACEHOLDER.length,
): number {
  /* Both axes in the same unit — fractions of the page WIDTH, which is what
   * `size` means. */
  const aspect = pageWidth > 0 ? pageHeight / pageWidth : 1;
  const tall = region.h * aspect;
  const wide = Math.max(region.w, 0.001);

  let best = 0;
  for (let lines = 1; lines <= 4; lines += 1) {
    const fitsDown = tall / (LINE_HEIGHT * lines);
    const fitsAcross = (lines * wide) / (chars * AVG_CHAR_EM);
    best = Math.max(best, Math.min(fitsDown, fitsAcross));
  }
  return Math.max(0.02, Math.min(0.12, best));
}

export function documentFromReference(
  plan: ReferencePlan,
  assetId: string,
  title = 'Recreated design',
): DesignDocument {
  const size = clampPageSize(plan.width, plan.height);
  const doc = blankDocument(size.width, size.height, title);
  const page = doc.pages[0];
  page.background = plan.background;
  doc.accent = pickAccent(plan.palette);

  const reference: ImageObject = {
    id: objectId('i'), type: 'image', name: 'Reference (locked)',
    x: 0, y: 0, w: 1, h: 1,
    rotation: 0, opacity: 1, visible: true, locked: true, z: 1,
    assetId, fit: 'cover',
  };

  const blocks: TextObject[] = plan.regions.map((region, i) => ({
    id: objectId('t'),
    type: 'text',
    name: regionLabel(region, i),
    x: region.x,
    y: region.y,
    w: region.w,
    h: region.h,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    z: i + 2,
    text: 'Type the words here',
    /* Sized to the area it was found in, so it reads at roughly the right scale. */
    size: regionTextSize(region, size.width, size.height),
    weight: 600,
    colour: plan.dark ? '#ffffff' : '#111827',
  }));

  page.objects = [reference, ...blocks];
  return doc;
}
