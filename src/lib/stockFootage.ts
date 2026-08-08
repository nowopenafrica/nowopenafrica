// NowOpen Studio — real stock footage source for the AI video generator.
//
// The AI Creative Director's brief is executed against REAL film clips instead
// of generated graphics. This module plans a Pexels search per storyboard
// scene from the business's industry (setting / close-up / focus / stock
// phrases), fetches the free Pexels video API, then deterministically picks
// one clip per scene so the same brief always maps to the same footage.
//
// Requires a free Pexels API key (pexels.com/api). The platform's key lives on
// the server as a Supabase Edge Function secret (`PEXELS_API_KEY`), never in
// the browser bundle — searches go through the stock-footage proxy. A key the
// owner pastes in the studio is stored only in localStorage and sent only to
// Pexels. Every function here is safe to import in jsdom; network calls only
// happen inside `fetchStockVideos` / `resolveFootage`.
//
// CORS note: Pexels serves its API and video CDN with permissive CORS headers,
// so clips can be drawn into the render canvas with `crossOrigin="anonymous"`.
// If a clip fails to load, the renderer falls back to generated graphics for
// that scene — nothing breaks.

import type { DirectorScene } from './creativeDirector';
import { VideoIndustry, hashString, mulberry32, pick } from './videoCreator';

export type FootageAspect = 'Square' | 'Vertical' | 'Landscape';

export interface StockClip {
  id: number;
  /** Best matching mp4 file for the target aspect. */
  url: string;
  /** Poster / thumbnail jpg from Pexels. */
  preview: string;
  width: number;
  height: number;
  duration: number;
}

export interface FootagePlan {
  sceneIndex: number;
  query: string;
  clip: StockClip;
}

const KEY_LOCAL = 'nowopen_pexels_key';

// --- API key ---------------------------------------------------------------

export function getStockApiKey(): string {
  try {
    return localStorage.getItem(KEY_LOCAL) || '';
  } catch {
    return '';
  }
}

export const hasStockApiKey = (): boolean => getStockApiKey().trim().length > 0;

export function setStockApiKey(key: string): void {
  try { localStorage.setItem(KEY_LOCAL, key.trim()); } catch { /* private mode */ }
}

// --- Pure planning ---------------------------------------------------------

export function orientationForAspect(aspect: FootageAspect): 'landscape' | 'portrait' | 'square' {
  if (aspect === 'Vertical') return 'portrait';
  if (aspect === 'Landscape') return 'landscape';
  return 'square';
}

/**
 * Deterministic Pexels search phrase for a storyboard scene. Built from the
 * industry's curated `stock` phrases (first) plus its setting / close-up /
 * focus / promise, flavoured by the scene seed. Same brief → same query.
 */
export function footageQueryForScene(
  industry: VideoIndustry,
  scene: DirectorScene,
  index: number,
  directionLabel: string,
): string {
  const primary = industry.stock[index % industry.stock.length] || `${industry.setting} b-roll`;
  const rng = mulberry32(hashString(`${industry.key}|${scene.id}|${scene.text}|${index}|${directionLabel}`));
  const secondary = pick(rng, [
    `${industry.setting} video`,
    `${industry.closeup} close up`,
    industry.focus,
    industry.promise,
    `${industry.label.toLowerCase()} business`,
  ]);
  return index % 2 === 0 ? primary : `${primary}, ${secondary}`;
}

export interface PexelsVideoFile {
  id: number;
  quality?: string;
  file_type?: string;
  width?: number;
  height?: number;
  link?: string;
}

export interface PexelsVideo {
  id: number;
  image?: string;
  duration?: number;
  width?: number;
  height?: number;
  video_files?: PexelsVideoFile[];
}

/** Best mp4 file for the target aspect: prefer the aspect, then the highest width. */
export function bestMp4ForAspect(files: PexelsVideoFile[] | undefined, aspect: FootageAspect): string {
  const mp4 = (files ?? []).filter(
    (f) => f.file_type && f.file_type.startsWith('video/mp4') && f.link && f.width && f.height && f.quality !== 'hls',
  );
  if (!mp4.length) return '';
  const target = orientationForAspect(aspect);
  const isTarget = (f: PexelsVideoFile) =>
    (target === 'portrait' && (f.height ?? 0) > (f.width ?? 0))
    || (target === 'landscape' && (f.width ?? 0) > (f.height ?? 0))
    || (target === 'square' && Math.abs((f.width ?? 0) - (f.height ?? 0)) < 40);
  const pool = mp4.some(isTarget) ? mp4.filter(isTarget) : mp4;
  return [...pool].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0].link ?? '';
}

/** Deterministic clip choice from a result set — same scene always picks the same slot. */
export function pickClipForScene(clips: StockClip[], scene: DirectorScene, index: number): StockClip {
  if (!clips.length) throw new Error('no stock clips to pick from');
  const rng = mulberry32(hashString(`${scene.id}|${scene.text}|${index}`));
  return clips[Math.floor(rng() * clips.length)];
}

// --- Network ---------------------------------------------------------------

export interface FetchStockOptions {
  orientation?: 'landscape' | 'portrait' | 'square';
  perPage?: number;
  signal?: AbortSignal;
}

/**
 * Search Pexels for clips.
 *
 * Prefers the `stock-footage` edge function, which holds the API key as a
 * Supabase secret. The direct-from-browser path is kept only for an owner who
 * pasted their own key into the Studio, because that key is theirs and never
 * leaves their machine — the platform's key was removed from the bundle
 * entirely (it used to ship as `VITE_PEXELS_API_KEY`, inlined by Vite).
 *
 * Only the search is proxied. The clip URLs it returns are public, so the
 * browser still streams video straight from videos.pexels.com to the canvas.
 */
export async function fetchStockVideos(query: string, opts: FetchStockOptions = {}): Promise<StockClip[]> {
  const orientation = opts.orientation ?? 'portrait';
  const perPage = opts.perPage ?? 8;
  const key = getStockApiKey();

  let data: { videos?: PexelsVideo[] };

  if (key) {
    const params = new URLSearchParams({ query, orientation, per_page: String(perPage), size: 'medium' });
    const res = await fetch(`https://api.pexels.com/videos/search?${params.toString()}`, {
      headers: { Authorization: key },
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(`Pexels search failed (${res.status})`);
    data = (await res.json()) as { videos?: PexelsVideo[] };
  } else {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stock-footage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ query, orientation, perPage }),
      signal: opts.signal,
    });
    if (!res.ok) return [];
    const body = await res.json().catch(() => null);
    // No key on the server either — an empty list, not an exception, so the
    // renderer simply falls back to designed graphics for every scene.
    if (!body?.ok) return [];
    data = body as { videos?: PexelsVideo[] };
  }

  const aspect = orientation === 'portrait' ? 'Vertical' : orientation === 'landscape' ? 'Landscape' : 'Square';
  return (data.videos ?? [])
    .map((v) => ({
      id: v.id,
      url: bestMp4ForAspect(v.video_files, aspect),
      preview: v.image ?? '',
      width: v.width ?? 0,
      height: v.height ?? 0,
      duration: v.duration ?? 0,
    }))
    .filter((c) => c.url);
}

const footageCache = new Map<string, StockClip[]>();

export interface ResolveFootageOptions {
  industry: VideoIndustry;
  scenes: DirectorScene[];
  directionLabel: string;
  aspect: FootageAspect;
  perScene?: number;
  signal?: AbortSignal;
}

/**
 * Fetch footage for every scene and map it deterministically. Query results
 * are cached per aspect+query so re-generating the same brief is instant.
 * Returns an empty map (no throw) when there is no key or no clips match.
 */
export async function resolveFootage(opts: ResolveFootageOptions): Promise<Record<number, StockClip>> {
  const out: Record<number, StockClip> = {};
  // No early return on a missing client key any more: the platform's key now
  // lives on the server, so footage can be available with nothing set locally.
  // fetchStockVideos returns [] when neither has one, which lands here as an
  // empty map — the same outcome, reached honestly.
  const queries = opts.scenes.map((s, i) => footageQueryForScene(opts.industry, s, i, opts.directionLabel));
  const orientation = orientationForAspect(opts.aspect);
  const results = new Map<string, StockClip[]>();
  for (const q of new Set(queries)) {
    const cacheKey = `${orientation}|${q}`;
    let clips = footageCache.get(cacheKey);
    if (!clips) {
      clips = await fetchStockVideos(q, { orientation, perPage: opts.perScene ?? 8, signal: opts.signal });
      footageCache.set(cacheKey, clips);
    }
    results.set(q, clips);
  }

  opts.scenes.forEach((scene, i) => {
    const clips = results.get(queries[i]) ?? [];
    if (clips.length) out[i] = pickClipForScene(clips, scene, i);
  });
  return out;
}

export function clearFootageCache(): void {
  footageCache.clear();
}
