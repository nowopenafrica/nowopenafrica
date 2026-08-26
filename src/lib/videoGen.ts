// NowOpen Studio — AI video generation tiers (free / paid).
//
// When a studio films over generated clips instead of the free canvas, the
// owner picks a tier — Free (open-weight models, no cost) or Paid (premium
// closed-source models billed per render). The tier only decides which model
// the per-scene clip request goes to; the renderer films the same way either
// way, and any clip that fails to load falls back to the designed graphics.
//
// Clips are generated through the `generate-image` edge function, which holds
// the Pollinations key as a Supabase secret — the browser never talks to a
// model host directly, so no provider host needs adding to the CSP.
// `planAiVideoClips` is the deterministic request plan (same brief + settings
// always requests the same clips); `resolveAiVideoClips` turns it into real
// clips, one per scene, quietly skipping any that fail. No network happens in
// `planAiVideoClips`, so it is safe to unit-test; `resolveAiVideoClips` only
// fetches when a plan asks for it.

import type { DirectorScene } from './creativeDirector';
import type { RenderAspect } from './renderVideo';
import {
  aspectDimensions, aiPromptForScene, aiSeedFor,
  type AiVideoModel,
} from './pollinations';
import type { StockClip } from './stockFootage';
import { dataUrlToBlob } from './studio';

export type VideoGenTier = 'free' | 'paid';

export interface AiVideoGenModel {
  key: AiVideoModel;
  label: string;
  maker: string;
  tier: VideoGenTier;
  note: string;
}

/**
 * The models a studio can render AI clips from, grouped by licence tier.
 *
 * 'free' means OPEN-WEIGHT, not free to call. Every clip here is generated
 * through Replicate or Pollinations, and both bill for it — there is no free
 * hosted text-to-video anywhere in this pipeline, and the image side's genuinely
 * free provider (Cloudflare Workers AI) has no video model at all.
 *
 * The note used to read "Open-source, no cost", which is the kind of claim a
 * business owner budgets around. Open weights and a free API are different
 * things and only one of them is true here.
 */
export const AI_VIDEO_GEN_MODELS: AiVideoGenModel[] = [
  { key: 'wan', label: 'Wan 2.x', maker: 'Alibaba Cloud', tier: 'free', note: 'Open-weight — free to self-host, billed through this pipeline' },
  { key: 'seedance', label: 'Seedance 2.5', maker: 'ByteDance', tier: 'paid', note: 'The quality bar — closed-source, billed per render' },
  { key: 'veo', label: 'Veo', maker: 'Google', tier: 'paid', note: 'Cinematic, slower — closed-source, billed per render' },
];

export const VIDEO_GEN_TIERS: { key: VideoGenTier; label: string; desc: string }[] = [
  { key: 'free', label: 'Open-weight', desc: 'Open licence you could self-host — still billed through our renderer' },
  { key: 'paid', label: 'Premium', desc: 'Closed-source models, billed per render' },
];

export const videoGenModelsForTier = (tier: VideoGenTier): AiVideoGenModel[] =>
  AI_VIDEO_GEN_MODELS.filter((m) => m.tier === tier);

export const videoGenModelByKey = (key: string): AiVideoGenModel | undefined =>
  AI_VIDEO_GEN_MODELS.find((m) => m.key === key);

/** Human-readable why for the picker and the export record. */
export function videoGenReason(tier: VideoGenTier, model: AiVideoGenModel): string {
  return tier === 'free'
    ? `${model.label} (${model.maker}) is open-weight — the same family the studio auto-picks. Generating through NowOpen still costs per clip; the licence is what is free. Clips that fail to load fall back to designed graphics.`
    : `${model.label} (${model.maker}) is a closed-source premium model — billed per render. Clips that fail to load fall back to designed graphics.`;
}

export interface BuildAiClipsOptions {
  businessName: string;
  /** Seen by the clip prompt as the industry behind the commercial. */
  industryLabel: string;
  directionLabel: string;
  scenes: DirectorScene[];
  model: AiVideoModel;
  aspect: RenderAspect;
}

/** One deterministic clip generation request per scene. */
export interface AiVideoClipRequest {
  sceneIndex: number;
  prompt: string;
  model: AiVideoModel;
  width: number;
  height: number;
  seed: number;
  duration: number;
}

/**
 * Plan the per-scene clip requests. Pure and deterministic — the same brief
 * always maps to the same requests, so the choice is safe to put in a pack or
 * an export record.
 */
export function planAiVideoClips(opts: BuildAiClipsOptions): AiVideoClipRequest[] {
  const dims = aspectDimensions(opts.aspect);
  return opts.scenes.map((scene, i) => ({
    sceneIndex: i,
    prompt: aiPromptForScene({
      businessName: opts.businessName,
      industryLabel: opts.industryLabel,
      directionLabel: opts.directionLabel,
      scene,
      index: i,
      forVideo: true,
    }),
    model: opts.model,
    width: dims.width,
    height: dims.height,
    seed: aiSeedFor(opts.businessName, opts.directionLabel, i),
    duration: Math.min(6, Math.max(3, Math.round(scene.seconds))),
  }));
}

// --- Network ----------------------------------------------------------------

/**
 * Generated clips, keyed by the deterministic request.
 *
 * Bounded on purpose: the values are base64 data URLs of whole videos, several
 * megabytes each before base64 inflates them by a third. Unbounded, a long
 * session in the Motion Studio — where every prompt tweak is a fresh key —
 * grew until the tab was killed. Insertion order is eviction order, which is
 * the right policy here: a re-render of the same storyboard re-requests the
 * most recent keys, not the oldest.
 */
const clipCache = new Map<string, string>();
const CLIP_CACHE_MAX = 12;

/** Generate one clip via the edge function; null on any failure. Cached by plan. */
async function generateClip(req: AiVideoClipRequest, signal?: AbortSignal): Promise<string | null> {
  const cacheKey = `${req.model}|${req.prompt}|${req.width}|${req.height}|${req.seed}|${req.duration}`;
  const hit = clipCache.get(cacheKey);
  if (hit) return hit;
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        prompt: req.prompt,
        width: req.width,
        height: req.height,
        seed: req.seed,
        duration: req.duration,
        kind: 'video',
        model: `pollinations:${req.model}`,
      }),
      signal,
    });
    const body = await res.json().catch(() => null);
    if (!body?.ok || typeof body.dataUrl !== 'string') return null;

    // Reject a still that came back for a clip request.
    //
    // This is not hypothetical: a deployment whose configured provider has no
    // text-to-video model can answer a kind:'video' request with a PNG and
    // ok:true. The renderer then builds a <video> around a still, which never
    // becomes ready, and the owner is told AI video was generated while every
    // frame quietly falls back to designed graphics. Failing here makes it an
    // honest "no clip" instead.
    if (!/^data:video\//i.test(body.dataUrl)) return null;
    if (clipCache.size >= CLIP_CACHE_MAX) {
      const oldest = clipCache.keys().next();
      if (!oldest.done) clipCache.delete(oldest.value);
    }
    clipCache.set(cacheKey, body.dataUrl);
    return body.dataUrl;
  } catch {
    return null;
  }
}

export interface ResolveAiClipsOptions extends BuildAiClipsOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Generate a real clip per scene and return the footage map for the renderer.
 *
 * Sequential on purpose — a paid clip is expensive and the provider rate-limits,
 * so firing them all at once is how a storyboard gets partially refused. A scene
 * that fails is left out; renderVideo already falls back to designed graphics
 * for any scene without a clip, so a partial result still produces a finished
 * video. Returns an empty map when nothing could be generated.
 */
export async function resolveAiVideoClips(opts: ResolveAiClipsOptions): Promise<Record<number, StockClip>> {
  const plan = planAiVideoClips(opts);
  const out: Record<number, StockClip> = {};
  for (let i = 0; i < plan.length; i++) {
    if (opts.signal?.aborted) break;
    const req = plan[i];
    const dataUrl = await generateClip(req, opts.signal);
    // Blob URLs keep the canvas untainted and media-src clean in prod (data:
    // is not in media-src). jsdom has no createObjectURL, so fall back to the
    // data URL there — fine for tests, and still valid in a <video>.
    const url = dataUrl && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(dataUrlToBlob(dataUrl))
      : dataUrl ?? '';
    if (url) {
      out[req.sceneIndex] = {
        id: req.sceneIndex + 1,
        url,
        preview: url,
        width: req.width,
        height: req.height,
        duration: req.duration,
      };
    }
    opts.onProgress?.(i + 1, plan.length);
  }
  return out;
}

/**
 * Revoke the object URLs a `resolveAiVideoClips` result owns.
 *
 * Every call mints a fresh blob URL per scene — including on a cache hit — and
 * each one pins a whole video in memory until it is revoked. Callers must run
 * this once the render that used the footage has finished. Remote stock URLs
 * (http/https) are left alone, so a mixed footage map is safe to pass in.
 */
export function releaseAiVideoClips(footage: Record<number, StockClip>): void {
  if (typeof URL.revokeObjectURL !== 'function') return;
  Object.values(footage).forEach((clip) => {
    if (clip?.url?.startsWith('blob:')) {
      try { URL.revokeObjectURL(clip.url); } catch { /* already revoked */ }
    }
  });
}

export function clearAiClipCache(): void {
  clipCache.clear();
}
