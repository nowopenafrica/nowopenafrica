import { describe, it, expect } from 'vitest';
import type { DirectorScene } from './creativeDirector';
import {
  AI_VIDEO_GEN_MODELS, VIDEO_GEN_TIERS, videoGenModelsForTier, videoGenModelByKey,
  videoGenReason, buildAiVideoClips,
} from './videoGen';

const scenes: DirectorScene[] = [
  { id: 's0', order: 0, seconds: 3, text: 'NOWOPEN', direction: 'Opening card', camera: 'Static tripod', voiceover: 'A brand card', transition: 'fade', grading: 'Warm daylight', motion: 'Steady' },
  { id: 's1', order: 1, seconds: 3, text: 'EVERY BUSINESS OPEN', direction: 'Headline card', camera: 'Slow push-in', voiceover: 'Open to the world', transition: 'fade', grading: 'Warm daylight', motion: 'Gentle' },
  { id: 's2', order: 2, seconds: 4, text: 'OPEN NOW', direction: 'Call to action', camera: 'Punch-in zoom', voiceover: 'Find yours today', transition: 'cut', grading: 'Warm daylight', motion: 'Energetic' },
];

describe('videoGen — free/paid model tiers', () => {
  it('splits the registry into free and paid tiers', () => {
    const free = videoGenModelsForTier('free');
    const paid = videoGenModelsForTier('paid');
    expect(free.length).toBeGreaterThan(0);
    expect(paid.length).toBeGreaterThan(0);
    expect(free.every((m) => m.tier === 'free')).toBe(true);
    expect(paid.every((m) => m.tier === 'paid')).toBe(true);
    expect(free.some((m) => m.key === 'wan')).toBe(true);
    expect(paid.some((m) => m.key === 'seedance')).toBe(true);
    expect(paid.some((m) => m.key === 'veo')).toBe(true);
  });

  it('has unique keys and complete model cards', () => {
    const keys = new Set(AI_VIDEO_GEN_MODELS.map((m) => m.key));
    expect(keys.size).toBe(AI_VIDEO_GEN_MODELS.length);
    for (const m of AI_VIDEO_GEN_MODELS) {
      expect(m.label.trim().length).toBeGreaterThan(0);
      expect(m.maker.trim().length).toBeGreaterThan(0);
      expect(m.note.trim().length).toBeGreaterThan(0);
    }
  });

  it('looks models up by key and explains the tier cost', () => {
    expect(videoGenModelByKey('wan')?.tier).toBe('free');
    expect(videoGenReason('free', videoGenModelByKey('wan')!)).toContain('free');
    expect(videoGenReason('paid', videoGenModelByKey('seedance')!)).toContain('paid');
  });

  it('offers the tier toggle choices', () => {
    expect(VIDEO_GEN_TIERS.map((t) => t.key)).toEqual(['free', 'paid']);
  });
});

describe('videoGen — clip planning', () => {
  const base = {
    businessName: 'Meat Club',
    industryLabel: 'Restaurant',
    directionLabel: 'Commercial',
    scenes,
    model: 'wan' as const,
    aspect: 'Vertical' as const,
  };

  it('plans one deterministic clip per scene', () => {
    const clips = buildAiVideoClips(base);
    expect(Object.keys(clips)).toHaveLength(scenes.length);
    expect(buildAiVideoClips(base)).toEqual(clips);
  });

  it('targets the generated model on the media endpoint', () => {
    const clips = buildAiVideoClips(base);
    const url = clips[0].url;
    expect(url).toContain('gen.pollinations.ai');
    expect(url).toContain('model=wan');
  });

  it('sizes clips to the aspect and clamps clip duration', () => {
    const clips = buildAiVideoClips({ ...base, aspect: 'Square' });
    for (const c of Object.values(clips)) {
      expect(c.width).toBe(c.height);
      expect(c.duration).toBeGreaterThanOrEqual(3);
      expect(c.duration).toBeLessThanOrEqual(6);
    }
  });

  it('changes the requested model when the paid tier is chosen', () => {
    const freeClips = buildAiVideoClips(base);
    const paidClips = buildAiVideoClips({ ...base, model: 'seedance' });
    expect(freeClips[0].url).not.toBe(paidClips[0].url);
    expect(paidClips[0].url).toContain('model=seedance');
  });
});
