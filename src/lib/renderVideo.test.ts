import { describe, it, expect } from 'vitest';
import {
  renderSeed, sceneRenderPlan, buildRenderTimeline, timelineAt,
  pickRenderMime, renderTotalSeconds, renderSceneStill, RENDER_DIMENSIONS, RENDER_FPS,
  RENDER_MIME_CANDIDATES, type RenderOptions, type SceneFrameOptions,
} from './renderVideo';
import type { DirectorScene } from './creativeDirector';

const base: RenderOptions = {
  businessName: 'Meat Club',
  directionLabel: 'Commercial',
  grade: 'Crisp, brand-accurate, product-lit',
  hook: 'The offer you have been waiting for.',
  cta: 'Order on WhatsApp now',
  aspect: 'Vertical',
  fps: RENDER_FPS,
};

const opts = (): SceneFrameOptions => ({ ...base, scenesCount: 3 });

function scene(over: Partial<DirectorScene> = {}): DirectorScene {
  return {
    id: 's-1',
    order: 1,
    seconds: 4,
    text: 'Smoked to perfection',
    direction: 'Product hero shots',
    camera: 'Punch-in zoom',
    voiceover: 'Fresh off the grill.',
    transition: 'Cut',
    grading: 'Crisp',
    motion: 'Bold titles',
    ...over,
  };
}

const scenes: DirectorScene[] = [
  scene({ id: 's1', order: 1, seconds: 4 }),
  scene({ id: 's2', order: 2, seconds: 3, text: 'Made for you' }),
  scene({ id: 's3', order: 3, seconds: 3, text: 'Order now', transition: 'Fade', motion: 'Logo end card' }),
];

describe('renderVideo — seeds', () => {
  it('is deterministic and sensitive to every part', () => {
    expect(renderSeed('Meat Club', 'Commercial', 1, 'text')).toBe(renderSeed('Meat Club', 'Commercial', 1, 'text'));
    expect(renderSeed('Meat Club', 'Commercial', 1, 'text')).not.toBe(renderSeed('Meat Club', 'Commercial', 2, 'text'));
    expect(renderSeed('Meat Club', 'Commercial', 1, 'text')).not.toBe(renderSeed('Meat Club', 'Funny', 1, 'text'));
  });
});

describe('renderVideo — scene plans', () => {
  it('builds a deterministic plan per scene with palette and motion', () => {
    const a = sceneRenderPlan(opts(), scene(), 0);
    const b = sceneRenderPlan(opts(), scene(), 0);
    expect(a).toEqual(b);
    expect(a.gradient).toHaveLength(3);
    expect(a.zoomIn).toBeGreaterThan(0.9);
    expect(a.zoomOut).toBeGreaterThan(0.9);
    expect(a.textColor).toBe('#ffffff');
    expect(a.accentColor.length).toBeGreaterThan(0);
  });

  it('maps transitions: Fade means a real crossfade window, Cut means none', () => {
    const fade = sceneRenderPlan(opts(), scene({ transition: 'Fade' }), 0);
    const cut = sceneRenderPlan(opts(), scene({ transition: 'Cut' }), 0);
    expect(fade.transition).toBe('fade');
    expect(fade.transitionFrames).toBe(Math.round(RENDER_FPS * 0.5));
    expect(cut.transition).toBe('cut');
    expect(cut.transitionFrames).toBe(0);
  });

  it('varies the look across scenes from the same brief', () => {
    const p0 = sceneRenderPlan(opts(), scenes[0], 0);
    const p1 = sceneRenderPlan(opts(), scenes[1], 1);
    expect(p0.seed).not.toBe(p1.seed);
    expect(p0.gradient).not.toEqual(p1.gradient);
  });
});

describe('renderVideo — timeline math', () => {
  it('sizes frames from scene seconds and accumulates start frames', () => {
    const tl = buildRenderTimeline(scenes, opts());
    expect(tl.fps).toBe(RENDER_FPS);
    expect(tl.scenes).toHaveLength(3);
    expect(tl.scenes[0].frames).toBe(4 * RENDER_FPS);
    expect(tl.scenes[1].startFrame).toBe(4 * RENDER_FPS);
    expect(tl.scenes[2].startFrame).toBe(7 * RENDER_FPS);
    expect(tl.totalFrames).toBe(10 * RENDER_FPS);
    expect(tl.totalSeconds).toBe(10);
  });

  it('never produces a sub-second scene', () => {
    const tl = buildRenderTimeline([scene({ seconds: 0.2 })], opts());
    expect(tl.scenes[0].frames).toBe(RENDER_FPS);
    expect(tl.scenes[0].seconds).toBe(1);
  });

  it('matches renderTotalSeconds', () => {
    expect(renderTotalSeconds(scenes)).toBe(10);
    expect(renderTotalSeconds(scenes)).toBe(buildRenderTimeline(scenes, opts()).totalSeconds);
  });

  it('timelineAt finds the right scene and local progress', () => {
    const tl = buildRenderTimeline(scenes, opts());
    const atStart = timelineAt(tl, 0);
    expect(atStart.scene.index).toBe(0);
    expect(atStart.t).toBe(0);

    const midScene2 = timelineAt(tl, 4 * RENDER_FPS + Math.round(1.5 * RENDER_FPS));
    expect(midScene2.scene.index).toBe(1);
    expect(midScene2.t).toBeCloseTo(0.5, 1);

    const last = timelineAt(tl, tl.totalFrames);
    expect(last.scene.index).toBe(2);
    expect(last.t).toBeGreaterThan(0.98);
  });

  it('clamps out-of-range frames', () => {
    const tl = buildRenderTimeline(scenes, opts());
    expect(timelineAt(tl, -100).scene.index).toBe(0);
    expect(timelineAt(tl, -100).t).toBe(0);
  });
});

describe('renderVideo — mime selection', () => {
  it('picks the first supported candidate', () => {
    const supported = (t: string) => t === 'video/webm;codecs=vp8';
    expect(pickRenderMime(RENDER_MIME_CANDIDATES, supported)).toBe('video/webm;codecs=vp8');
  });

  it('returns null when nothing is supported', () => {
    expect(pickRenderMime(RENDER_MIME_CANDIDATES, () => false)).toBeNull();
  });

  it('always has a sane candidate list ending in a generic fallback', () => {
    expect(RENDER_MIME_CANDIDATES).toContain('video/webm');
  });
});

describe('renderVideo — scene stills', () => {
  it('returns null gracefully when the canvas 2D context is unavailable (jsdom)', () => {
    expect(renderSceneStill(opts(), scenes[0], 0)).toBeNull();
  });
});

describe('renderVideo — dimensions', () => {
  it('exposes correct aspect ratios', () => {
    expect(RENDER_DIMENSIONS.Vertical.width).toBe(1080);
    expect(RENDER_DIMENSIONS.Vertical.height).toBe(1920);
    expect(RENDER_DIMENSIONS.Square.width).toBe(RENDER_DIMENSIONS.Square.height);
    expect(RENDER_DIMENSIONS.Landscape.width).toBe(1920);
    expect(RENDER_DIMENSIONS.Landscape.height).toBe(1080);
  });
});
