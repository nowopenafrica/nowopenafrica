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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { codepointsOf, missingFrom } from '../../fontCoverage';
import { GLYPH_FALLBACK, typefaceOf, type Typeface } from '../../typefaces';

const onDisk = (publicPath: string): string => join(process.cwd(), 'public', publicPath);

/** A public path, read from the repository's public/ folder. */
export const readPublic = (publicPath: string): Buffer => readFileSync(onDisk(publicPath));

/** Whether a public path really exists in public/. */
export const publicFileExists = (publicPath: string): boolean => existsSync(onDisk(publicPath));

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
    fallbackSet = new Set(src.weights
      .filter((w) => publicFileExists(src.files[w]))
      .flatMap((w) => [...codepointsAt(src.files[w])]).filter(inFallbackRange));
  }
  return fallbackSet;
}

/** Everything a face's fallback can draw for it. A latin-basic face is held to its own glyphs. */
export function fallbackCodepoints(face: Typeface): Set<number> {
  return face.glyphFallback && face.coverage !== 'latin-basic' ? fallbackCodepointsAll() : new Set();
}

/**
 * What the face cannot draw, even with its fallback, from `chars`.
 * A file that is missing draws nothing; faceProblems reports it, so this
 * returns '' for it rather than throwing.
 */
export function gapsOf(face: Typeface, weight: number, chars: string): string {
  if (!publicFileExists(face.files[weight] ?? '')) return '';
  const fb = fallbackCodepoints(face);
  return [...missingFrom(codepointsAt(face.files[weight]), chars)]
    .filter((ch) => !fb.has(ch.codePointAt(0) as number))
    .join('');
}

/** Why a face cannot be shipped at all: not self-hosted, a file missing, or no licence. */
export function faceProblems(face: Typeface): string[] {
  const out: string[] = [];
  if (!face.licence) out.push(`${face.label} has no licence`);
  for (const w of face.weights) {
    const path = face.files[w];
    if (!path || !path.startsWith('/fonts/')) out.push(`${face.label} ${w} is not self-hosted (${path ?? 'no file'})`);
    else if (!publicFileExists(path)) out.push(`${face.label} ${w} file ${path} is missing from public/`);
  }
  return out;
}
