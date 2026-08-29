// NowOpen Studio — AI Art Director (Pollinations).
//
// The AI Creative Director generates media from open-weight models via
// Pollinations:
//   • Images  — Flux Schnell (open-weight) and friends, one key frame per scene.
//   • Videos  — Wan 2.x (open-source, the same model Auto picks) and other
//               T2V models, one clip per scene that the renderer films over.
//   • Motion  — the canvas animator layers Ken Burns camera moves, animated
//               captions and transitions on top of the AI key art.
//
// Everything is deterministic: prompts and seeds are derived from the brief, so
// the same brief + settings always request the same media.
//
// ⚠️ KEYED NOW — Pollinations stopped being keyless on 2026-08-05 (401 without
// an API key). The key must NOT be a VITE_ var (it would ship in the bundle,
// the same mistake as VITE_PEXELS_API_KEY), so `fetchAiImage` no longer talks
// to gen.pollinations.ai at all — it posts to the `generate-image` Supabase
// edge function, which holds `POLLINATIONS_API_KEY` as a secret and returns a
// data: URL. Same for clips (`videoGen.resolveAiVideoClips`). Failures return
// null and the pipeline falls back to the gradient / Pexels renderer, and
// `fetchAiImage` is guarded so importing this module never needs a real
// browser or network.

import type { DirectorScene } from './creativeDirector';
import { renderSeed } from './renderVideo';
import type { RenderAspect } from './renderVideo';
import { dataUrlToBlob } from './studio';

export type AiImageModel = 'flux' | 'turbo' | 'zimage' | 'seedream';
export type AiVideoModel = 'wan' | 'veo' | 'seedance';

export const AI_IMAGE_MODELS: { key: AiImageModel; label: string; note: string }[] = [
  { key: 'flux', label: 'Flux Schnell', note: 'Open-weight, high quality, fast — recommended' },
  { key: 'turbo', label: 'Turbo', note: 'Speed-optimised Flux variant' },
  { key: 'zimage', label: 'Z-Image', note: 'Pollinations current default' },
  { key: 'seedream', label: 'Seedream', note: 'ByteDance image model' },
];

export const AI_VIDEO_MODELS: { key: AiVideoModel; label: string; note: string }[] = [
  { key: 'wan', label: 'Wan 2.x', note: 'Open-source Alibaba Wan — matches the studio auto-pick' },
  { key: 'veo', label: 'Veo', note: 'Google Veo — cinematic, slower' },
  { key: 'seedance', label: 'Seedance', note: 'ByteDance Seedance — the quality bar' },
];

/** Map a render aspect to generation pixels (kept under `maxSide`). */
export function aspectDimensions(aspect: RenderAspect, maxSide = 1024): { width: number; height: number } {
  if (aspect === 'Vertical') {
    return { width: Math.round((maxSide * 9) / 16), height: maxSide };
  }
  if (aspect === 'Ratio4x5') {
    return { width: Math.round((maxSide * 4) / 5), height: maxSide };
  }
  if (aspect === 'Landscape' || aspect === 'Ratio16x9') {
    return { width: maxSide, height: Math.round((maxSide * 9) / 16) };
  }
  return { width: maxSide, height: maxSide };
}

export interface ScenePromptInput {
  businessName: string;
  industryLabel: string;
  directionLabel: string;
  scene: DirectorScene;
  index: number;
  /** Include motion language for T2V prompts. */
  forVideo?: boolean;
}

/**
 * Deterministic cinematic brief for one scene. Same inputs always produce the
 * same prompt (which, with the fixed seed, always requests the same media).
 */
export function aiPromptForScene({
  businessName, industryLabel, directionLabel, scene, index, forVideo = false,
}: ScenePromptInput): string {
  const subject = scene.text.trim() || scene.direction.trim();
  const motion = forVideo
    ? ' Cinematic video: smooth dynamic camera movement, natural motion, film-grade 24fps.'
    : ' Photorealistic still, cinematic lighting, shallow depth of field, rich color grade.';
  return [
    `${subject} — ${industryLabel} commercial for ${businessName}.`,
    `Scene ${index + 1}: ${scene.direction.trim()} ${scene.camera.trim()}.`,
    `${directionLabel} advertising style.${motion}`,
    'Clean, no text, no watermark, no captions.',
  ].join(' ');
}

/** Deterministic seed per brief + scene so regenerating requests the same media. */
export function aiSeedFor(businessName: string, directionLabel: string, index: number): number {
  return renderSeed('ai-media', businessName, directionLabel, index) >>> 0;
}

export interface AiImageFetchOptions {
  prompt: string;
  model: AiImageModel;
  width: number;
  height: number;
  seed: number;
  signal?: AbortSignal;
}

// --- Network (guarded, cached) -------------------------------------------------

/**
 * Key frames already generated this session, keyed by the deterministic
 * request. Bounded, and the evicted entry's object URL is revoked with it —
 * each value pins a full-resolution image in memory, so an unbounded map made
 * a long styling session grow without limit.
 */
const aiImageCache = new Map<string, string>();
const AI_IMAGE_CACHE_MAX = 24;

/**
 * Generate one key-art frame through the `generate-image` edge function and
 * return a blob object URL (so the canvas renderer is never tainted). Returns
 * null on any failure — callers fall back to the gradient/stock renderer.
 * Cached by the deterministic request so the same brief is fetched once per
 * session. The Pollinations key stays a Supabase secret; this module never
 * talks to a provider host.
 */
export async function fetchAiImage(opts: AiImageFetchOptions): Promise<string | null> {
  const cacheKey = `${opts.model}|${opts.prompt}|${opts.width}|${opts.height}|${opts.seed}`;
  const hit = aiImageCache.get(cacheKey);
  if (hit) return hit;
  // Blob object URLs are what keep the canvas untainted; without support (e.g.
  // jsdom) we skip the network entirely so tests stay hermetic.
  if (typeof fetch === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        prompt: opts.prompt,
        width: opts.width,
        height: opts.height,
        seed: opts.seed,
        kind: 'image',
        model: `pollinations:${opts.model}`,
      }),
      signal: opts.signal,
    });
    const body = await res.json().catch(() => null);
    if (!body?.ok || typeof body.dataUrl !== 'string') return null;
    const blob = dataUrlToBlob(body.dataUrl);
    if (!blob.size) return null;
    const objectUrl = URL.createObjectURL(blob);
    if (aiImageCache.size >= AI_IMAGE_CACHE_MAX) {
      const oldest = aiImageCache.keys().next();
      if (!oldest.done) {
        const stale = aiImageCache.get(oldest.value);
        aiImageCache.delete(oldest.value);
        if (stale?.startsWith('blob:')) {
          try { URL.revokeObjectURL(stale); } catch { /* already revoked */ }
        }
      }
    }
    aiImageCache.set(cacheKey, objectUrl);
    return objectUrl;
  } catch {
    return null;
  }
}

export function clearAiImageCache(): void {
  aiImageCache.forEach((url) => {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  });
  aiImageCache.clear();
}
