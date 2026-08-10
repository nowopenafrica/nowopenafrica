import { describe, it, expect } from 'vitest';
import {
  renderSeed, sceneRenderPlan, buildRenderTimeline, timelineAt,
  pickRenderMime, renderTotalSeconds, renderSceneStill, RENDER_DIMENSIONS, RENDER_FPS,
  RENDER_MIME_CANDIDATES, type RenderOptions, type SceneFrameOptions, pickRecorderMime, RENDER_MIME_CANDIDATES_WITH_AUDIO, footageIsEnabled, RENDER_PALETTES,
  sceneLayout, sceneElementRegions, resolveSource, elementEntrance, sceneLayerRegions, type MotionLayer } from './renderVideo';
import type { DirectorScene } from './creativeDirector';
import { TEXT_ANIMATIONS, TEXT_EFFECTS } from './creativeDirector';

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

  it('honours an explicit palette for every scene', () => {
    const pinned: [string, string, string] = ['#450a0a', '#dc2626', '#fbbf24'];
    const p0 = sceneRenderPlan({ ...opts(), palette: pinned }, scenes[0], 0);
    const p1 = sceneRenderPlan({ ...opts(), palette: pinned }, scenes[1], 1);
    expect(p0.gradient).toEqual(pinned);
    expect(p1.gradient).toEqual(pinned);
  });

  it('exposes the selectable palettes', () => {
    expect(RENDER_PALETTES.length).toBeGreaterThan(0);
    RENDER_PALETTES.forEach((p) => expect(p).toHaveLength(3));
  });

  it('seeds the visual treatment into every plan', () => {
    const plan = sceneRenderPlan(opts(), scene(), 0);
    expect(plan.treatment).toBe('default');
    const led = sceneRenderPlan({ ...opts(), treatment: 'led' }, scene(), 0);
    expect(led.treatment).toBe('led');
    // Switching treatment genuinely re-plans the scene (different seed → look).
    expect(led.seed).not.toBe(plan.seed);
  });
});

describe('renderVideo — layout & editable regions', () => {
  it('lays out both aspects with sane, ordered geometry', () => {
    for (const aspect of ['Vertical', 'Landscape', 'Ratio4x5', 'Ratio16x9'] as const) {
      const { width: w, height: h } = RENDER_DIMENSIONS[aspect];
      const L = sceneLayout(w, h, aspect);
      expect(L.minDim).toBe(Math.min(w, h));
      expect(L.baseTitle).toBeGreaterThan(20);
      expect(L.brandTop).toBeGreaterThan(0);
      expect(L.titleBlockTop).toBeGreaterThan(L.brandBottom);
      expect(L.titleBlockH).toBeGreaterThan(0);
      expect(L.ctaY).toBeGreaterThan(L.titleBlockTop + L.titleBlockH);
      expect(L.chipY).toBeGreaterThan(L.ctaY);
      expect(L.voBlockTop).toBeGreaterThan(0);
      expect(L.voBlockH).toBeGreaterThan(0);
    }
  });

  it('returns normalised regions with the CTA only on the final card', () => {
    const last = scenes.length - 1;
    for (const index of [0, last]) {
      const regions = sceneElementRegions(opts(), scenes[index], index);
      const keys = new Set(regions.map((r) => r.key));
      for (const r of regions) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
        expect(r.x + r.w).toBeLessThanOrEqual(1.001);
        expect(r.y + r.h).toBeLessThanOrEqual(1.001);
      }
      expect(keys.has('brand')).toBe(true);
      expect(keys.has('title')).toBe(true);
      expect(keys.has('subline')).toBe(true);
      expect(keys.has('cta')).toBe(index === last);
    }
  });

  it('shifts the region boxes with the format so hit-testing matches each size', () => {
    const vertical = sceneElementRegions(opts(), scenes[scenes.length - 1], scenes.length - 1);
    const landscape = sceneElementRegions({ ...opts(), aspect: 'Landscape' }, scenes[scenes.length - 1], scenes.length - 1);
    expect(vertical).not.toEqual(landscape);
  });

  it('honours per-clip element overrides when hit-testing', () => {
    const scene = scenes[0];
    const hidden = sceneElementRegions(opts(), { ...scene, elements: { subline: { hidden: true } } }, 0);
    expect(hidden.some((r) => r.key === 'subline')).toBe(false);
    const base = sceneElementRegions(opts(), scene, 0).find((r) => r.key === 'title');
    const moved = sceneElementRegions(opts(), { ...scene, elements: { title: { dx: 0.1, dy: -0.2 } } }, 0)
      .find((r) => r.key === 'title');
    expect(base).toBeTruthy();
    expect(moved).toBeTruthy();
    if (base && moved) {
      expect(moved.x - base.x).toBeCloseTo(0.1, 5);
      expect(moved.y - base.y).toBeCloseTo(-0.2, 5);
    }
  });
});

describe('renderVideo — uploaded layer priority', () => {
  const fakeVideo = (ready: boolean): HTMLVideoElement =>
    ({ readyState: ready ? 4 : 0, videoWidth: ready ? 1920 : 0, videoHeight: ready ? 1080 : 0 }) as unknown as HTMLVideoElement;
  const fakeImage = (ready: boolean): HTMLImageElement =>
    ({ complete: ready, naturalWidth: ready ? 1920 : 0, naturalHeight: ready ? 1080 : 0 }) as unknown as HTMLImageElement;

  const layersImage: MotionLayer[] = [{ kind: 'image', url: 'blob:img', image: fakeImage(true) }];
  const layersVideo: MotionLayer[] = [{ kind: 'video', url: 'blob:vid', video: fakeVideo(true) }];

  it('shows the base uploaded layer instead of the gradient', () => {
    expect(resolveSource(null, null, layersImage).kind).toBe('image');
    expect(resolveSource(null, null, layersVideo).kind).toBe('video');
  });

  it('keeps a not-yet-loaded layer falling back to the gradient', () => {
    expect(resolveSource(null, null, [{ kind: 'image', url: 'blob:img', image: fakeImage(false) }]).kind).toBe('gradient');
    expect(resolveSource(null, null, [{ kind: 'video', url: 'blob:vid', video: fakeVideo(false) }]).kind).toBe('gradient');
  });

  it('lets AI footage and key art cover the base layer (never overrides the film)', () => {
    expect(resolveSource(fakeVideo(true), null, layersImage).kind).toBe('video');
    expect(resolveSource(null, fakeImage(true), layersImage).kind).toBe('image');
    expect(resolveSource(null, null, undefined).kind).toBe('gradient');
  });

  it('keeps the first layer as the base when extra layers stack on top', () => {
    const stacked: MotionLayer[] = [
      { kind: 'image', url: 'blob:bg', image: fakeImage(true) },
      { kind: 'video', url: 'blob:overlay', video: fakeVideo(true) },
    ];
    expect(resolveSource(null, null, stacked).kind).toBe('image');
  });
});

describe('renderVideo — editable layer regions & transforms', () => {
  const fakeImage = (ready: boolean): HTMLImageElement =>
    ({ complete: ready, naturalWidth: ready ? 1920 : 0, naturalHeight: ready ? 1080 : 0 }) as unknown as HTMLImageElement;
  const layer = (over: Partial<MotionLayer> = {}): MotionLayer => ({ kind: 'image', url: 'blob:img', image: fakeImage(true), ...over });

  it('starts every visible layer full-canvas and centred', () => {
    const r = sceneLayerRegions(opts(), [layer()]);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ index: 0, x: 0, y: 0, w: 1, h: 1 });
  });

  it('scales the cover rect up around the canvas centre', () => {
    const r = sceneLayerRegions(opts(), [layer({ scale: 2 })]);
    expect(r[0].x).toBeCloseTo(-0.5, 5);
    expect(r[0].y).toBeCloseTo(-0.5, 5);
    expect(r[0].w).toBeCloseTo(2, 5);
    expect(r[0].h).toBeCloseTo(2, 5);
  });

  it('moves the rect by dx/dy in canvas units', () => {
    const r = sceneLayerRegions(opts(), [layer({ dx: 0.25, dy: -0.25 })]);
    expect(r[0].x).toBeCloseTo(0.25, 5);
    expect(r[0].y).toBeCloseTo(-0.25, 5);
    expect(r[0].w).toBeCloseTo(1, 5);
  });

  it('combines offset and scale into the cover-fit region', () => {
    const r = sceneLayerRegions(opts(), [layer({ dx: 0.1, dy: 0.2, scale: 1.5 })]);
    expect(r[0].x).toBeCloseTo(-0.15, 5);
    expect(r[0].y).toBeCloseTo(-0.05, 5);
    expect(r[0].w).toBeCloseTo(1.5, 5);
  });

  it('drops invisible (opacity 0) layers but keeps the indices of the rest', () => {
    const r = sceneLayerRegions(opts(), [layer({ opacity: 0 }), layer({ scale: 2 })]);
    expect(r).toHaveLength(1);
    expect(r[0].index).toBe(1);
  });

  it('returns nothing when there are no layers', () => {
    expect(sceneLayerRegions(opts())).toEqual([]);
    expect(sceneLayerRegions(opts(), [])).toEqual([]);
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

describe('renderVideo — footage gating', () => {
  const clip = { id: 1, url: 'https://videos.pexels.com/a.mp4', preview: '', width: 1080, height: 1920, duration: 12 };

  // The regression: Video Studio passed a full footage map without the extra
  // flag, so the render silently produced gradients and said nothing. Clips
  // supplied must mean clips used.
  it('films supplied clips without needing a second opt-in flag', () => {
    expect(footageIsEnabled({ footage: { 0: clip } })).toBe(true);
  });

  it('still allows an explicit opt-out', () => {
    expect(footageIsEnabled({ footage: { 0: clip }, footageEnabled: false })).toBe(false);
  });

  it('is off when there are no clips, so an empty search falls back to graphics', () => {
    expect(footageIsEnabled({})).toBe(false);
    expect(footageIsEnabled({ footage: {} })).toBe(false);
    expect(footageIsEnabled({ footage: {}, footageEnabled: true })).toBe(false);
  });
});

describe('renderVideo — dimensions', () => {
  it('exposes correct aspect ratios', () => {
    expect(RENDER_DIMENSIONS.Vertical.width).toBe(1080);
    expect(RENDER_DIMENSIONS.Vertical.height).toBe(1920);
    expect(RENDER_DIMENSIONS.Square.width).toBe(RENDER_DIMENSIONS.Square.height);
    expect(RENDER_DIMENSIONS.Landscape.width).toBe(1920);
    expect(RENDER_DIMENSIONS.Landscape.height).toBe(1080);
    expect(RENDER_DIMENSIONS.Ratio4x5.width).toBe(1080);
    expect(RENDER_DIMENSIONS.Ratio4x5.height).toBe(1350);
    expect(RENDER_DIMENSIONS.Ratio16x9.width).toBe(1920);
    expect(RENDER_DIMENSIONS.Ratio16x9.height).toBe(1080);
  });
});

describe('renderVideo — text animation & effect presets', () => {
  it('exposes every entrance animation and effect with a label', () => {
    expect(TEXT_ANIMATIONS.map((a) => a.key)).toEqual(['pop', 'rise', 'slide', 'fade', 'letters', 'zoom']);
    expect(TEXT_EFFECTS.map((f) => f.key)).toEqual(['glow', 'shadow', 'outline', 'neon', 'sparkle']);
    for (const a of TEXT_ANIMATIONS) expect(a.label.length).toBeGreaterThan(0);
    for (const f of TEXT_EFFECTS) expect(f.label.length).toBeGreaterThan(0);
  });

  it('settles instantly when no animation is keyed', () => {
    const st = elementEntrance(undefined, 0, 1080, 1920);
    expect(st.alpha).toBe(1);
    expect(st.dx).toBe(0);
    expect(st.dy).toBe(0);
    expect(st.scale).toBe(1);
    expect(st.letters).toBe(0);
  });

  it('plays rise from hidden below to settled on screen', () => {
    const start = elementEntrance('rise', 0, 1080, 1920);
    expect(start.alpha).toBe(0);
    expect(start.dy).toBeGreaterThan(0);
    const end = elementEntrance('rise', 1, 1080, 1920);
    expect(end.alpha).toBe(1);
    expect(end.dy).toBe(0);
  });

  it('pops in with an overshooting scale and settles to 1', () => {
    const start = elementEntrance('pop', 0, 1080, 1920);
    expect(start.scale).toBeLessThan(1);
    expect(start.alpha).toBe(1);
    const end = elementEntrance('pop', 1, 1080, 1920);
    expect(end.scale).toBe(1);
  });

  it('spreads letter-spacing on the letters entrance', () => {
    const start = elementEntrance('letters', 0, 1080, 1920);
    expect(start.letters).toBeGreaterThan(0);
    expect(elementEntrance('letters', 1, 1080, 1920).letters).toBe(0);
  });

  it('keeps animated elements hit-testable in their settled place', () => {
    const regions = sceneElementRegions(opts(), {
      ...scenes[0],
      elements: { title: { animation: 'pop', effect: 'neon' }, subline: { animation: 'rise' } },
    }, 0);
    const keys = new Set(regions.map((r) => r.key));
    expect(keys.has('title')).toBe(true);
    expect(keys.has('subline')).toBe(true);
  });
});

describe('recorder mime selection with audio', () => {
  // Reproduces the reported failure: Firefox accepts
  // isTypeSupported('video/webm;codecs=vp8') but then MediaRecorder.start()
  // throws "An audio track cannot be recorded: video/webm;codecs=vp8 indicates
  // an unsupported codec" once the stream carries audio.
  const firefoxIsh = (t: string) =>
    ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm',
     'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'].includes(t);

  it('never picks a video-only codec string for a stream with audio', () => {
    const mime = pickRecorderMime(true, firefoxIsh)!;
    expect(mime).toBeTruthy();
    // If a codecs= list is present it must declare an audio codec too.
    if (/codecs=/.test(mime)) {
      expect(mime, mime).toMatch(/opus|mp4a/);
    }
  });

  it('picks the audio-capable webm on a Firefox-like browser', () => {
    expect(pickRecorderMime(true, firefoxIsh)).toBe('video/webm;codecs=vp9,opus');
  });

  it('still uses the video-only list when there is no audio track', () => {
    expect(pickRecorderMime(false, firefoxIsh)).toBe('video/webm;codecs=vp9');
  });

  it('prefers mp4 with an audio codec where supported', () => {
    const safariIsh = (t: string) => t.startsWith('video/mp4');
    expect(pickRecorderMime(true, safariIsh)).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2');
  });

  it('falls back to a bare type, which lets the browser choose both codecs', () => {
    const bareOnly = (t: string) => t === 'video/webm';
    expect(pickRecorderMime(true, bareOnly)).toBe('video/webm');
  });

  it('returns null when nothing is supported, so the caller omits mimeType', () => {
    expect(pickRecorderMime(true, () => false)).toBeNull();
    expect(pickRecorderMime(false, () => false)).toBeNull();
  });

  it('offers an audio-capable option for every codec family it lists', () => {
    const withAudio = RENDER_MIME_CANDIDATES_WITH_AUDIO.filter((m) => /codecs=/.test(m));
    expect(withAudio.length).toBeGreaterThan(0);
    for (const m of withAudio) expect(m, m).toMatch(/opus|mp4a/);
  });
});
