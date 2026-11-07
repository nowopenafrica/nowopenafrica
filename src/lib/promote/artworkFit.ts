/**
 * Does this artwork have the shape of the placement it is going on?
 *
 * Shape only. A size is never guessed: a placement whose size cannot be read
 * (a duration, a bare count, a described coverage) comes back `unknown`.
 */
import { readAdDimensions, ratioOf } from './adDimensions';

export const SIZE_TO_CONFIRM = 'Size to confirm with the media owner';

export type ArtworkFit =
  | { verdict: 'match' }
  | { verdict: 'mismatch'; message: string }
  | { verdict: 'unknown'; message: string };

const SQUARE_TOLERANCE = 0.03;
const NAMED_TOLERANCE = 0.03;
const FIT_TOLERANCE = 0.05;
const STUDIO_LONG_EDGE = 2400;

const NAMED_SHAPES: { name: string; ratio: number }[] = [
  ['2:1', 2], ['3:1', 3], ['16:9', 16 / 9], ['4:3', 4 / 3], ['3:2', 3 / 2], ['5:4', 5 / 4],
  ['4:5', 4 / 5], ['2:3', 2 / 3], ['3:4', 3 / 4], ['9:16', 9 / 16], ['1:2', 1 / 2], ['1:3', 1 / 3],
].map(([name, ratio]) => ({ name: name as string, ratio: ratio as number }));

/** "square", a common ratio name, or "W:H" with one decimal on the long side. */
export function describeShape(width: number, height: number): string {
  const ratio = width / height;
  if (Math.abs(ratio - 1) <= SQUARE_TOLERANCE) return 'square';

  let best: { name: string; diff: number } | null = null;
  for (const s of NAMED_SHAPES) {
    const diff = Math.abs(ratio / s.ratio - 1);
    if (diff <= NAMED_TOLERANCE && (!best || diff < best.diff)) best = { name: s.name, diff };
  }
  if (best) return best.name;

  const long = Number((Math.max(width, height) / Math.min(width, height)).toFixed(1));
  return width >= height ? `${long}:1` : `1:${long}`;
}

export function checkArtworkFit(
  artwork: { width: number; height: number },
  placementDimensions: string | null,
): ArtworkFit {
  const dims = readAdDimensions(placementDimensions);
  const placement = ratioOf(dims);
  if (dims.kind !== 'size' || placement == null) {
    return { verdict: 'unknown', message: SIZE_TO_CONFIRM };
  }
  const art = artwork.width / artwork.height;
  if (Math.abs(art / placement - 1) <= FIT_TOLERANCE) return { verdict: 'match' };
  return {
    verdict: 'mismatch',
    message: `This is ${describeShape(artwork.width, artwork.height)}; the placement is ${describeShape(dims.width, dims.height)}.`,
  };
}

/** The placement's ratio on a canvas with a 2400px long edge; null when unknown. */
export function studioSizeFor(placementDimensions: string | null): { w: number; h: number } | null {
  const ratio = ratioOf(readAdDimensions(placementDimensions));
  if (ratio == null || !(ratio > 0)) return null;
  return ratio >= 1
    ? { w: STUDIO_LONG_EDGE, h: Math.round(STUDIO_LONG_EDGE / ratio) }
    : { w: Math.round(STUDIO_LONG_EDGE * ratio), h: STUDIO_LONG_EDGE };
}
