import { describe, it, expect } from 'vitest';
import {
  aspectDimensions, aiPromptForScene, aiSeedFor,
  pollinationsImageUrl, pollinationsVideoUrl, clearAiImageCache,
} from './pollinations';
import type { DirectorScene } from './creativeDirector';

function scene(over: Partial<DirectorScene> = {}): DirectorScene {
  return {
    id: 's1',
    order: 1,
    seconds: 4,
    text: 'Smoked to perfection',
    direction: 'Wide shot of the kitchen at peak service.',
    camera: 'Punch-in zoom',
    voiceover: 'Fresh off the grill.',
    transition: 'Cut',
    grading: 'Crisp',
    motion: 'Bold titles',
    ...over,
  };
}

describe('pollinations — aspectDimensions', () => {
  it('maps each render aspect to generation pixels under the max side', () => {
    expect(aspectDimensions('Square')).toEqual({ width: 1024, height: 1024 });
    const v = aspectDimensions('Vertical');
    expect(v.height).toBe(1024);
    expect(v.width).toBe(Math.round((1024 * 9) / 16));
    const l = aspectDimensions('Landscape');
    expect(l.width).toBe(1024);
    expect(l.height).toBe(Math.round((1024 * 9) / 16));
  });
});

describe('pollinations — prompts', () => {
  it('is deterministic and includes industry + scene text + direction', () => {
    const input = {
      businessName: 'Meat Club',
      industryLabel: 'Restaurant',
      directionLabel: 'Commercial',
      scene: scene(),
      index: 0,
    };
    const a = aiPromptForScene(input);
    const b = aiPromptForScene(input);
    expect(a).toBe(b);
    expect(a).toContain('Meat Club');
    expect(a).toContain('Restaurant');
    expect(a).toContain('Smoked to perfection');
    expect(a).toContain('Commercial');
  });

  it('varies across scenes from the same brief', () => {
    const base = { businessName: 'Meat Club', industryLabel: 'Restaurant', directionLabel: 'Commercial' };
    const p0 = aiPromptForScene({ ...base, scene: scene(), index: 0 });
    const p1 = aiPromptForScene({ ...base, scene: scene({ text: 'Made for you' }), index: 1 });
    expect(p0).not.toBe(p1);
    expect(p1).toContain('Scene 2');
  });

  it('adds motion language for video prompts', () => {
    const p = aiPromptForScene({
      businessName: 'B', industryLabel: 'I', directionLabel: 'D', scene: scene(), index: 0, forVideo: true,
    });
    expect(p).toContain('Cinematic video');
    expect(p).toContain('camera movement');
  });

  it('forbids baked-in text and watermarks', () => {
    const p = aiPromptForScene({
      businessName: 'B', industryLabel: 'I', directionLabel: 'D', scene: scene(), index: 0,
    });
    expect(p.toLowerCase()).toContain('no text');
    expect(p.toLowerCase()).toContain('no watermark');
  });
});

describe('pollinations — urls & seeds', () => {
  it('builds a deterministic image URL with model, pixels and seed', () => {
    const a = pollinationsImageUrl({ prompt: 'steak close-up', model: 'flux', width: 1024, height: 576, seed: 42 });
    const b = pollinationsImageUrl({ prompt: 'steak close-up', model: 'flux', width: 1024, height: 576, seed: 42 });
    expect(a).toBe(b);
    expect(a).toContain('gen.pollinations.ai/image/steak%20close-up');
    expect(a).toContain('model=flux');
    expect(a).toContain('width=1024');
    expect(a).toContain('height=576');
    expect(a).toContain('seed=42');
  });

  it('changes with the model or seed', () => {
    // `model` belongs in the base: without it the seed assertions below were
    // building URLs with no model at all, which isn't what this test claims to
    // check (the model cases override it explicitly).
    const base = { prompt: 'p', width: 1024, height: 1024, seed: 1, model: 'flux' as const };
    expect(pollinationsImageUrl({ ...base, model: 'turbo' })).not.toBe(pollinationsImageUrl({ ...base, model: 'flux' }));
    expect(pollinationsImageUrl({ ...base, seed: 2 })).not.toBe(pollinationsImageUrl({ ...base, seed: 1 }));
  });

  it('builds a video URL with a duration', () => {
    const url = pollinationsVideoUrl({ prompt: 'p', model: 'wan', width: 1024, height: 576, seed: 7, duration: 5 });
    expect(url).toContain('model=wan');
    expect(url).toContain('duration=5');
    expect(url).toContain('seed=7');
  });

  it('derives a stable, non-negative seed per scene', () => {
    const a = aiSeedFor('Meat Club', 'Commercial', 0);
    const b = aiSeedFor('Meat Club', 'Commercial', 0);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(aiSeedFor('Meat Club', 'Commercial', 1)).not.toBe(a);
  });

  it('clearing the image cache does not throw', () => {
    expect(() => clearAiImageCache()).not.toThrow();
  });
});
