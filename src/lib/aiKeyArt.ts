// Client for the `generate-image` edge function.
//
// Turns a storyboard into one generated still per scene, which renderVideo
// already knows how to film over (RenderOptions.aiImages — Ken Burns + grade,
// caption on top). That support existed for the Pollinations integration and
// was left stranded when Pollinations started returning 401.
//
// The provider and its key live server-side; this module only ever talks to the
// Supabase function, so adding or swapping a model needs no CSP change and no
// client deploy.

import type { DirectorScene } from './creativeDirector';
import { aiPromptForScene, aiSeedFor, aspectDimensions } from './pollinations';
import type { RenderAspect } from './renderVideo';

export type KeyArtReason = 'no_provider' | 'rate_limited' | 'auth' | 'loading' | 'error';

export interface KeyArtOutcome {
  /** One entry per scene, aligned by index. null where generation failed. */
  images: (string | null)[];
  /** Set when at least one scene failed, so the UI can explain it once. */
  reason?: KeyArtReason;
  generated: number;
}

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export interface KeyArtRequest {
  businessName: string;
  industryLabel: string;
  directionLabel: string;
  scenes: DirectorScene[];
  aspect: RenderAspect;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

async function generateOne(
  prompt: string,
  width: number,
  height: number,
  seed: number,
  signal?: AbortSignal,
): Promise<{ dataUrl?: string; reason?: KeyArtReason }> {
  const res = await fetch(`${FUNCTIONS_BASE}/generate-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ prompt, width, height, seed }),
    signal,
  });

  const body = await res.json().catch(() => null);
  if (!body) return { reason: 'error' };
  return body.ok ? { dataUrl: body.dataUrl } : { reason: body.reason ?? 'error' };
}

/**
 * Generate key art for a storyboard, one scene at a time.
 *
 * Sequential on purpose. Free inference tiers rate-limit hard, and firing five
 * requests at once is the reliable way to get four of them refused — which the
 * owner would see as a video that is mostly gradients. Slower and complete
 * beats faster and patchy.
 *
 * A scene that fails yields null rather than aborting: renderVideo already
 * falls back to the gradient for any scene without an image, so a partial
 * result still produces a finished video.
 */
export async function generateKeyArt({
  businessName, industryLabel, directionLabel, scenes, aspect, signal, onProgress,
}: KeyArtRequest): Promise<KeyArtOutcome> {
  const { width, height } = aspectDimensions(aspect, 768);
  const images: (string | null)[] = [];
  let reason: KeyArtReason | undefined;
  let generated = 0;

  for (let i = 0; i < scenes.length; i++) {
    if (signal?.aborted) break;

    const prompt = aiPromptForScene({
      businessName, industryLabel, directionLabel, scene: scenes[i], index: i,
    });

    try {
      const out = await generateOne(prompt, width, height, aiSeedFor(businessName, directionLabel, i), signal);
      images.push(out.dataUrl ?? null);
      if (out.dataUrl) generated++;
      // Keep the FIRST reason: "no key configured" explains the whole run,
      // whereas a later per-scene blip would misdescribe it.
      else if (!reason) reason = out.reason;

      // No point asking for four more images when there's no model at all.
      if (out.reason === 'no_provider' || out.reason === 'auth') {
        while (images.length < scenes.length) images.push(null);
        break;
      }
    } catch {
      images.push(null);
      if (!reason) reason = 'error';
    }

    onProgress?.(images.length, scenes.length);
  }

  while (images.length < scenes.length) images.push(null);
  return { images, reason, generated };
}

/** What to tell the owner when generation didn't fully work. */
export function keyArtMessage(reason: KeyArtReason, generated: number, total: number): string {
  if (reason === 'no_provider') {
    return 'No image model is connected yet, so the video will use designed graphics instead of generated key art.';
  }
  if (reason === 'auth') {
    return 'The image model rejected its API key. The video will use designed graphics instead.';
  }
  if (reason === 'rate_limited') {
    return `The image model is busy — ${generated} of ${total} scenes got key art. The rest use designed graphics.`;
  }
  if (reason === 'loading') {
    return 'The image model is warming up (this happens on the free tier after it has been idle). Try again in about a minute.';
  }
  return `${generated} of ${total} scenes got key art; the rest use designed graphics.`;
}
