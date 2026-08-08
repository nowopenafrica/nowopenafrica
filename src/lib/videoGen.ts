// NowOpen Studio — AI video generation tiers (free / paid).
//
// When a studio films over generated clips instead of the free canvas, the
// owner picks a tier — Free (open-weight models, no cost) or Paid (premium
// closed-source models billed per render). The tier only decides which model
// the per-scene clip request goes to; the renderer films the same way either
// way, and any clip that fails to load falls back to the designed graphics.
//
// Pure and deterministic: the same scenes + settings always request the same
// clips (stable prompts and seeds), so the choice is safe to put in a pack or
// an export record. No network happens here — only the URL plan.

import type { DirectorScene } from './creativeDirector';
import type { RenderAspect } from './renderVideo';
import {
  aspectDimensions, aiPromptForScene, aiSeedFor, pollinationsVideoUrl,
  type AiVideoModel,
} from './pollinations';
import type { StockClip } from './stockFootage';

export type VideoGenTier = 'free' | 'paid';

export interface AiVideoGenModel {
  key: AiVideoModel;
  label: string;
  maker: string;
  tier: VideoGenTier;
  note: string;
}

/** The models a studio can render AI clips from, grouped by cost tier. */
export const AI_VIDEO_GEN_MODELS: AiVideoGenModel[] = [
  { key: 'wan', label: 'Wan 2.x', maker: 'Alibaba Cloud', tier: 'free', note: 'Open-source, no cost — matches the studio auto-pick' },
  { key: 'seedance', label: 'Seedance 2.5', maker: 'ByteDance', tier: 'paid', note: 'The quality bar — billed per render' },
  { key: 'veo', label: 'Veo', maker: 'Google', tier: 'paid', note: 'Cinematic, slower — billed per render' },
];

export const VIDEO_GEN_TIERS: { key: VideoGenTier; label: string; desc: string }[] = [
  { key: 'free', label: 'Free', desc: 'Open-weight models, no cost' },
  { key: 'paid', label: 'Paid', desc: 'Premium models, billed per render' },
];

export const videoGenModelsForTier = (tier: VideoGenTier): AiVideoGenModel[] =>
  AI_VIDEO_GEN_MODELS.filter((m) => m.tier === tier);

export const videoGenModelByKey = (key: string): AiVideoGenModel | undefined =>
  AI_VIDEO_GEN_MODELS.find((m) => m.key === key);

/** Human-readable why for the picker and the export record. */
export function videoGenReason(tier: VideoGenTier, model: AiVideoGenModel): string {
  return tier === 'free'
    ? `${model.label} (${model.maker}) is free and open-weight — the same family the studio auto-picks. Clips that fail to load fall back to designed graphics.`
    : `${model.label} (${model.maker}) is a paid premium model — billed per render. Clips that fail to load fall back to designed graphics.`;
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

/** One generated clip request per scene — same brief always maps to the same clips. */
export function buildAiVideoClips(opts: BuildAiClipsOptions): Record<number, StockClip> {
  const dims = aspectDimensions(opts.aspect);
  const clips: Record<number, StockClip> = {};
  for (let i = 0; i < opts.scenes.length; i++) {
    const prompt = aiPromptForScene({
      businessName: opts.businessName,
      industryLabel: opts.industryLabel,
      directionLabel: opts.directionLabel,
      scene: opts.scenes[i],
      index: i,
      forVideo: true,
    });
    const duration = Math.min(6, Math.max(3, Math.round(opts.scenes[i].seconds)));
    const url = pollinationsVideoUrl({
      prompt,
      model: opts.model,
      width: dims.width,
      height: dims.height,
      seed: aiSeedFor(opts.businessName, opts.directionLabel, i),
      duration,
    });
    clips[i] = { id: i + 1, url, preview: url, width: dims.width, height: dims.height, duration };
  }
  return clips;
}
