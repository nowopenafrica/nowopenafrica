// NowOpen Studio — AI Art Director (Pollinations, free & keyless).
//
// The AI Creative Director now generates REAL media from open-weight models
// through the free Pollinations endpoint (no account, no API key):
//   • Images  — Flux Schnell (open-weight) and friends, one key frame per scene.
//   • Videos  — Wan 2.x (open-source, the same model Auto picks) and other
//               T2V models, one clip per scene that the renderer films over.
//   • Motion  — the canvas animator layers Ken Burns camera moves, animated
//               captions and transitions on top of the AI key art.
//
// Everything is deterministic: prompts and seeds are derived from the brief, so
// the same brief + settings always request the same media. `fetchAiImage` is the
// only network call and is guarded so importing this module never needs a real
// browser or network; failures return null and the pipeline falls back to the
// gradient / Pexels renderer.

import type { DirectorScene } from './creativeDirector';
import { renderSeed } from './renderVideo';
import type { RenderAspect } from './renderVideo';

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

const POLLINATIONS_BASE = 'https://gen.pollinations.ai/image';

/** Map a render aspect to generation pixels (kept under `maxSide`). */
export function aspectDimensions(aspect: RenderAspect, maxSide = 1024): { width: number; height: number } {
  if (aspect === 'Vertical') {
    return { width: Math.round((maxSide * 9) / 16), height: maxSide };
  }
  if (aspect === 'Landscape') {
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

export function pollinationsImageUrl(opts: {
  prompt: string;
  model: AiImageModel;
  width: number;
  height: number;
  seed: number;
}): string {
  const p = new URLSearchParams({
    model: opts.model,
    width: String(opts.width),
    height: String(opts.height),
    seed: String(opts.seed),
  });
  return `${POLLINATIONS_BASE}/${encodeURIComponent(opts.prompt)}?${p.toString()}`;
}

export function pollinationsVideoUrl(opts: {
  prompt: string;
  model: AiVideoModel;
  width: number;
  height: number;
  seed: number;
  duration: number;
}): string {
  const p = new URLSearchParams({
    model: opts.model,
    width: String(opts.width),
    height: String(opts.height),
    seed: String(opts.seed),
    duration: String(opts.duration),
  });
  return `${POLLINATIONS_BASE}/${encodeURIComponent(opts.prompt)}?${p.toString()}`;
}

// --- Network (guarded, cached) -------------------------------------------------

const aiImageCache = new Map<string, string>();

/**
 * Fetch a generated image and return a same-origin object URL (so the canvas
 * renderer is never tainted). Returns null on any failure — callers fall back
 * to the gradient/stock renderer. Cached by URL so deterministic prompts are
 * fetched once per session.
 */
export async function fetchAiImage(url: string, signal?: AbortSignal): Promise<string | null> {
  const hit = aiImageCache.get(url);
  if (hit) return hit;
  // Blob object URLs are what keep the canvas untainted; without support (e.g.
  // jsdom) we skip the network entirely so tests stay hermetic.
  if (typeof fetch === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    const objectUrl = URL.createObjectURL(blob);
    aiImageCache.set(url, objectUrl);
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
