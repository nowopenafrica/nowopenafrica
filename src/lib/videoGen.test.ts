import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DirectorScene } from './creativeDirector';
import {
  AI_VIDEO_GEN_MODELS, VIDEO_GEN_TIERS, videoGenModelsForTier, videoGenModelByKey,
  videoGenReason, planAiVideoClips, resolveAiVideoClips, clearAiClipCache,
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

  it('plans one deterministic clip request per scene', () => {
    const plan = planAiVideoClips(base);
    expect(plan).toHaveLength(scenes.length);
    expect(planAiVideoClips(base)).toEqual(plan);
  });

  it('targets the generated model with video prompt, pixels, seed and duration', () => {
    const plan = planAiVideoClips(base);
    expect(plan[0].model).toBe('wan');
    expect(plan[0].width).toBeGreaterThan(0);
    expect(plan[0].height).toBeGreaterThan(0);
    expect(plan[0].seed).toBeGreaterThanOrEqual(0);
    expect(plan[0].prompt).toContain('Cinematic video');
  });

  it('sizes clips to the aspect and clamps clip duration', () => {
    const plan = planAiVideoClips({ ...base, aspect: 'Square' });
    for (const r of plan) {
      expect(r.width).toBe(r.height);
      expect(r.duration).toBeGreaterThanOrEqual(3);
      expect(r.duration).toBeLessThanOrEqual(6);
    }
  });

  it('changes the requested model when the paid tier is chosen', () => {
    const free = planAiVideoClips(base);
    const paid = planAiVideoClips({ ...base, model: 'seedance' });
    expect(free[0].model).toBe('wan');
    expect(paid[0].model).toBe('seedance');
  });
});

describe('videoGen — clip generation through the edge function', () => {
  const base = {
    businessName: 'Meat Club',
    industryLabel: 'Restaurant',
    directionLabel: 'Commercial',
    scenes,
    model: 'wan' as const,
    aspect: 'Vertical' as const,
  };

  beforeEach(() => clearAiClipCache());

  it('generates one clip per scene through generate-image, keyed to Pollinations', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, dataUrl: 'data:video/mp4;base64,AAAA' }),
    }) as any));

    const map = await resolveAiVideoClips(base);
    expect(Object.keys(map)).toHaveLength(scenes.length);

    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(String(url)).toContain('/functions/v1/generate-image');
    expect(JSON.parse(init.body)).toMatchObject({
      kind: 'video',
      model: 'pollinations:wan',
      duration: expect.any(Number),
    });
    // The Pollinations key must never be in a browser request — it stays a
    // Supabase secret and the proxy is the only caller.
    expect(JSON.stringify(init.headers)).not.toContain('sk_');
    vi.unstubAllGlobals();
  });

  it('drops scenes the provider rejects, keeping the rest', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => (calls === 1 ? { ok: false, reason: 'rate_limited' } : { ok: true, dataUrl: 'data:video/mp4;base64,BBBB' }),
      } as any;
    }));

    const map = await resolveAiVideoClips(base);
    expect(map[0]).toBeUndefined();
    expect(Object.keys(map)).toHaveLength(scenes.length - 1);
    vi.unstubAllGlobals();
  });

  it('returns an empty map when nothing can be generated', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: false, reason: 'no_provider' }),
    }) as any));

    const map = await resolveAiVideoClips(base);
    expect(map).toEqual({});
    vi.unstubAllGlobals();
  });
});
