/**
 * What a face, with its glyph fallback, can draw. C3's evidence.
 *
 * NODE ONLY, like fontCoverage.ts: it reads the shipped WOFF2 files from
 * public/. Shared with fontCoverage.test.ts so the rule "a character counts as
 * covered if the face OR the NowOpen Glyph Fallback draws it, when the face
 * names the fallback" is written once.
 *
 * Each file is read and parsed once per process.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { codepointsOf, missingFrom } from '../../fontCoverage';
import { GLYPH_FALLBACK, typefaceOf, type Typeface } from '../../typefaces';

/** A public path, read from the repository's public/ folder. */
export const readPublic = (publicPath: string): Buffer => readFileSync(join(process.cwd(), 'public', publicPath));

const CACHE = new Map<string, Set<number>>();

/** Code points the file at this public path maps, read once. */
export function codepointsAt(publicPath: string): Set<number> {
  let set = CACHE.get(publicPath);
  if (!set) {
    set = codepointsOf(readPublic(publicPath));
    CACHE.set(publicPath, set);
  }
  return set;
}

/** GLYPH_FALLBACK's unicode-range, as [first, last] pairs. */
const FALLBACK_RANGES = GLYPH_FALLBACK.unicodeRange.map((r) => {
  const [a, z] = r.replace('U+', '').split('-');
  return [parseInt(a, 16), parseInt(z ?? a, 16)] as const;
});

export const inFallbackRange = (c: number): boolean => FALLBACK_RANGES.some(([a, z]) => c >= a && c <= z);

let fallbackSet: Set<number> | null = null;

/** What the glyph fallback can draw: its source files, inside its unicode-range only. */
export function fallbackCodepointsAll(): Set<number> {
  if (!fallbackSet) {
    const src = typefaceOf(GLYPH_FALLBACK.source);
    fallbackSet = new Set(src.weights.flatMap((w) => [...codepointsAt(src.files[w])]).filter(inFallbackRange));
  }
  return fallbackSet;
}

/** Everything a face's fallback can draw for it. A latin-basic face is held to its own glyphs. */
export function fallbackCodepoints(face: Typeface): Set<number> {
  return face.glyphFallback && face.coverage !== 'latin-basic' ? fallbackCodepointsAll() : new Set();
}

/** What the face cannot draw, even with its fallback, from `chars`. */
export function gapsOf(face: Typeface, weight: number, chars: string): string {
  const fb = fallbackCodepoints(face);
  return [...missingFrom(codepointsAt(face.files[weight]), chars)]
    .filter((ch) => !fb.has(ch.codePointAt(0) as number))
    .join('');
}

/** Why a face cannot be shipped at all: not self-hosted, or no licence. */
export function faceProblems(face: Typeface): string[] {
  const out: string[] = [];
  if (!face.licence) out.push(`${face.label} has no licence`);
  for (const w of face.weights) {
    const path = face.files[w];
    if (!path || !path.startsWith('/fonts/')) out.push(`${face.label} ${w} is not self-hosted (${path ?? 'no file'})`);
  }
  return out;
}
