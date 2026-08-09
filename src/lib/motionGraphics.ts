// Motion Graphics Studio — the motion scene builder.
//
// The render engine (lib/renderVideo.ts) films a storyboard of DirectorScene
// title cards onto a canvas: gradient/backdrop, a big headline, an accent
// underline, the brand lockup, a voiceover strip and a call-to-action end
// card. That IS motion graphics — it just needed motion-shaped inputs.
//
// This module turns a motion job (logo reveal, motion poster, kinetic type,
// countdown, billboard LED, Apple TV key art, glassmorphic, isometric 3D, …)
// into those scenes. Pure, so every mapping is unit-testable:
// the same config always builds the same storyboard, and the render then
// films it the same way every time.

import type { DirectorScene } from './creativeDirector';
import type { RenderAspect } from './renderVideo';

export type MotionStyle =
  | 'logo-reveal'
  | 'motion-poster'
  | 'kinetic-type'
  | 'lower-third'
  | 'countdown'
  | 'badge'
  | 'reveal-title'
  | 'billboard-led'
  | 'premium-keyart'
  | 'glassmorphic'
  | 'isometric-3d';

export type MotionDuration = 'short' | 'medium' | 'long' | 'extended' | 'cinematic';

export interface MotionConfig {
  business: string;
  headline: string;
  subhead: string;
  cta: string;
  logoEmoji: string;
  aspect: RenderAspect;
  duration: MotionDuration;
  style: MotionStyle;
}

/** Seconds per card scene for the chosen pacing. */
export const MOTION_SECONDS: Record<MotionDuration, number> = {
  short: 2,
  medium: 3,
  long: 4,
  extended: 5,
  cinematic: 6,
};

const CAMERAS = ['Punch-in zoom', 'Slow push-in', 'Tracking shot', 'Rack focus', 'Static tripod'];
const MOTIONS = ['Energetic', 'Steady', 'Gentle', 'Hold'];

/** How many cards each job type produces for its arc. */
export const MOTION_SCENE_COUNTS: Record<MotionStyle, number> = {
  'logo-reveal': 3,
  'motion-poster': 3,
  'kinetic-type': 4,
  'lower-third': 2,
  countdown: 4,
  badge: 2,
  'reveal-title': 2,
  'billboard-led': 4,
  'premium-keyart': 3,
  glassmorphic: 3,
  'isometric-3d': 4,
};

function card(i: number, text: string, voiceover: string, seconds: number, total: number): DirectorScene {
  return {
    id: `motion-${i}`,
    order: i,
    seconds: Math.max(1, Math.round(seconds)),
    text,
    direction: voiceover,
    camera: CAMERAS[i % CAMERAS.length],
    voiceover,
    // The final card holds so the call to action reads; earlier cards blend.
    transition: i === total - 1 ? 'cut' : 'fade',
    grading: 'Warm daylight',
    motion: MOTIONS[i % MOTIONS.length],
  };
}

/** Kinetic type always fills its full 4-beat arc: the headline's own words, padded from a fallback pool. */
function kineticWords(headline: string): string[] {
  const words = headline.trim().split(/\s+/).filter((w) => w.length > 0);
  const out = [...words];
  if (out.length < 4) {
    for (const w of KINETIC_POOL) {
      if (out.length >= 4) break;
      if (!out.includes(w)) out.push(w);
    }
  }
  return out.slice(0, 4);
}

const KINETIC_POOL = ['Make', 'it', 'local', 'today'];

/**
 * The storyboard for a motion job. Scene count and card text follow the job
 * type (MOTION_SCENE_COUNTS); pacing comes from `duration`.
 */
export function motionScenesFromJob(cfg: MotionConfig): DirectorScene[] {
  const seconds = MOTION_SECONDS[cfg.duration];
  const total = MOTION_SCENE_COUNTS[cfg.style];
  const lines: { text: string; vo: string }[] = [];

  switch (cfg.style) {
    case 'logo-reveal':
      lines.push({ text: `${cfg.logoEmoji} ${cfg.business.toUpperCase()}`, vo: 'A NowOpen business' });
      lines.push({ text: cfg.headline, vo: cfg.subhead });
      lines.push({ text: 'OPEN NOW', vo: cfg.cta });
      break;
    case 'motion-poster':
      lines.push({ text: cfg.headline, vo: cfg.subhead });
      lines.push({ text: cfg.subhead, vo: cfg.headline });
      lines.push({ text: 'SAVE YOUR SPOT', vo: cfg.cta });
      break;
    case 'kinetic-type':
      kineticWords(cfg.headline).forEach((w, i) => {
        lines.push({ text: w.toUpperCase(), vo: i === 0 ? cfg.subhead : cfg.cta });
      });
      break;
    case 'lower-third':
      lines.push({ text: cfg.business.toUpperCase(), vo: cfg.headline });
      lines.push({ text: cfg.headline, vo: cfg.subhead });
      break;
    case 'countdown':
      lines.push({ text: '3', vo: 'Get ready' });
      lines.push({ text: '2', vo: 'Almost there' });
      lines.push({ text: '1', vo: 'Final call' });
      lines.push({ text: 'GO!', vo: cfg.cta });
      break;
    case 'badge':
      lines.push({ text: cfg.headline, vo: cfg.subhead });
      lines.push({ text: `${cfg.logoEmoji} ${cfg.business.toUpperCase()}`, vo: cfg.cta });
      break;
    case 'reveal-title':
      lines.push({ text: cfg.headline, vo: cfg.subhead });
      lines.push({ text: cfg.business.toUpperCase(), vo: cfg.cta });
      break;
    case 'billboard-led':
      lines.push({ text: cfg.headline, vo: cfg.business });
      lines.push({ text: cfg.subhead, vo: 'Open for business' });
      lines.push({ text: cfg.business.toUpperCase(), vo: cfg.headline });
      lines.push({ text: 'ACT NOW', vo: cfg.cta });
      break;
    case 'premium-keyart':
      lines.push({ text: cfg.headline, vo: cfg.subhead });
      lines.push({ text: cfg.business.toUpperCase(), vo: cfg.headline });
      lines.push({ text: 'OPEN NOW', vo: cfg.cta });
      break;
    case 'glassmorphic':
      lines.push({ text: cfg.headline, vo: cfg.subhead });
      lines.push({ text: cfg.subhead, vo: cfg.business });
      lines.push({ text: `${cfg.logoEmoji} ${cfg.business.toUpperCase()}`, vo: cfg.cta });
      break;
    case 'isometric-3d':
      lines.push({ text: cfg.headline, vo: cfg.subhead });
      lines.push({ text: cfg.subhead, vo: cfg.headline });
      lines.push({ text: cfg.business.toUpperCase(), vo: cfg.cta });
      lines.push({ text: 'SHOP NOW', vo: cfg.cta });
      break;
  }

  // Guard every card so an empty field never films a blank frame — the brand
  // name is the ultimate fallback.
  const fallback = cfg.business.trim() || 'NowOpen';
  return lines.slice(0, total).map((l, i) => card(i, l.text.trim() || fallback, l.vo.trim() || fallback, seconds, total));
}

export function motionTotalSeconds(cfg: MotionConfig): number {
  return motionScenesFromJob(cfg).reduce((s, x) => s + x.seconds, 0);
}
