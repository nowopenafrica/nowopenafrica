import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));

import { clipTransitionLook, cssFilter, effectiveEffects, FILTER_PRESETS, NEUTRAL_LOOK, textAnimAt, transitionAt, TRANSITION_LABELS } from './videoEffects';
import { blankVideoDocument, readVideoDocument, TRANSITION_TYPES, TEXT_ANIMS_IN, type MediaClip, type VideoDocument } from './videoDocument';
import { setClipSpeed, splitClip, trimClip } from './videoEdit';
import { sourceSecondsAt } from './videoCompositor';
import { bitrateFor, checkExport, estimateBytes, outputSize, type ExportOptions } from './videoExport';

describe('filters', () => {
  it('turns adjustments into a canvas filter, leaving neutral values out', () => {
    expect(cssFilter(undefined, 1080)).toBe('none');
    expect(cssFilter({ brightness: 100, contrast: 100 }, 1080)).toBe('none');
    expect(cssFilter({ brightness: 120, saturation: 50, hue: 30, blur: 0.01 }, 1000)).toBe('brightness(120%) saturate(50%) hue-rotate(30deg) blur(10px)');
  });

  it('applies a preset under the sliders; a slider wins', () => {
    expect(effectiveEffects({ preset: 'mono' })).toEqual({ grayscale: 100, contrast: 110 });
    expect(effectiveEffects({ preset: 'mono', contrast: 150 })).toEqual({ grayscale: 100, contrast: 150 });
    for (const p of Object.values(FILTER_PRESETS)) expect(p.label).toBeTruthy();
  });
});

describe('transitions', () => {
  it('every type has a label and settles to no change at the end', () => {
    for (const t of TRANSITION_TYPES) {
      expect(TRANSITION_LABELS[t]).toBeTruthy();
      const settled = transitionAt(t, 1);
      expect(settled.alpha).toBeCloseTo(1);
      expect(settled.dx).toBeCloseTo(0);
      expect(settled.scale).toBeCloseTo(1);
      expect(settled.overlay?.alpha ?? 0).toBeCloseTo(0);
    }
  });

  it('starts hidden or off-frame', () => {
    expect(transitionAt('fade', 0).alpha).toBe(0);
    expect(transitionAt('slide', 0).dx).toBe(1);
    expect(transitionAt('slide-left', 0).dx).toBe(-1);
    expect(transitionAt('wipe-left', 0).reveal).toEqual({ kind: 'rect', x: 0, y: 0, w: 0, h: 1 });
    expect(transitionAt('circle', 0).reveal).toEqual({ kind: 'circle', r: 0 });
    expect(transitionAt('dip-black', 0).overlay).toEqual({ color: '#000000', alpha: 1 });
  });

  it('an exit plays at the end of the clip, an entrance at the start', () => {
    const clip = { durationMs: 4000, transitionIn: { type: 'fade' as const, ms: 1000 }, transitionOut: { type: 'fade' as const, ms: 1000 } };
    expect(clipTransitionLook(clip, 0).alpha).toBe(0);
    expect(clipTransitionLook(clip, 500).alpha).toBeCloseTo(0.5);
    expect(clipTransitionLook(clip, 2000)).toEqual(NEUTRAL_LOOK);
    expect(clipTransitionLook(clip, 3500).alpha).toBeCloseTo(0.5);
  });
});

describe('text animation', () => {
  it('typewriter reveals characters over its length', () => {
    expect(textAnimAt({ in: { type: 'typewriter', ms: 1000 } }, 3000, 0, 10).visibleChars).toBe(0);
    expect(textAnimAt({ in: { type: 'typewriter', ms: 1000 } }, 3000, 500, 10).visibleChars).toBe(5);
    expect(textAnimAt({ in: { type: 'typewriter', ms: 1000 } }, 3000, 2000, 10).visibleChars).toBe(Infinity);
  });

  it('letter animations stagger: the first letter leads the last', () => {
    const f = textAnimAt({ in: { type: 'letters-fade', ms: 1000 } }, 3000, 300, 10);
    expect(f.perChar!(0, 10).alpha).toBeGreaterThan(f.perChar!(9, 10).alpha);
  });

  it('every entrance ends fully shown', () => {
    for (const t of TEXT_ANIMS_IN) {
      const f = textAnimAt(t === 'none' ? undefined : { in: { type: t, ms: 500 } }, 3000, 600, 8);
      expect(f.block.alpha).toBeCloseTo(1);
      expect(f.visibleChars).toBe(Infinity);
    }
  });

  it('an exit hides the words by the end; loops keep moving', () => {
    expect(textAnimAt({ out: { type: 'fade', ms: 500 } }, 3000, 3000, 8).block.alpha).toBe(0);
    const a = textAnimAt({ loop: 'float' }, 3000, 500, 8).block.dy;
    const b = textAnimAt({ loop: 'float' }, 3000, 1500, 8).block.dy;
    expect(a).not.toBeCloseTo(b);
  });
});

describe('speed', () => {
  const doc = (): VideoDocument => {
    const d = blankVideoDocument(1080, 1920);
    d.assets.v = { kind: 'video', path: 'u/studio/video-1-a.mp4', durationMs: 20_000 };
    d.tracks[0].clips = [
      { id: 'a', type: 'media', assetId: 'v', startMs: 0, durationMs: 4000, inMs: 1000, transform: { x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1 } },
      { id: 'b', type: 'media', assetId: 'v', startMs: 10_000, durationMs: 2000, inMs: 0, transform: { x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1 } },
    ];
    return d;
  };
  const clipA = (d: VideoDocument) => d.tracks[0].clips[0] as MediaClip;

  it('2x halves the clip; 0.5x doubles it but stops at the next clip', () => {
    expect(clipA(setClipSpeed(doc(), 'a', 2))).toMatchObject({ speed: 2, durationMs: 2000 });
    expect(clipA(setClipSpeed(doc(), 'a', 0.5))).toMatchObject({ speed: 0.5, durationMs: 8000 });
    expect(clipA(setClipSpeed(doc(), 'a', 0.25)).durationMs).toBe(10_000);
    expect(clipA(setClipSpeed(setClipSpeed(doc(), 'a', 2), 'a', 1)).speed).toBeUndefined();
  });

  it('source time runs at the clip speed, through split and trim too', () => {
    const d = setClipSpeed(doc(), 'a', 2);
    expect(sourceSecondsAt(clipA(d), 1000)).toBe(3);
    const split = splitClip(d, 'a', 1000, 'r');
    const right = split.tracks[0].clips.find((c) => c.id === 'r') as MediaClip;
    expect(right.inMs).toBe(3000);
    const trimmed = clipA(trimClip(d, 'a', 'start', 500));
    expect(trimmed.inMs).toBe(2000);
  });

  it('a speed outside 0.25..4 is refused on load', () => {
    const d = doc();
    (d.tracks[0].clips[0] as MediaClip).speed = 8;
    expect(readVideoDocument(d)).toMatchObject({ ok: false });
  });
});

describe('export sizing and checks', () => {
  const base = (): ExportOptions => ({ format: 'mp4', shortSide: 0, fps: 30, quality: 'standard', includeAudio: true });

  it('keeps the project shape at the chosen size, even numbers, capped', () => {
    expect(outputSize({ width: 1080, height: 1920 }, 0)).toEqual({ width: 1080, height: 1920 });
    expect(outputSize({ width: 1080, height: 1920 }, 720)).toEqual({ width: 720, height: 1280 });
    expect(outputSize({ width: 1920, height: 1080 }, 2160)).toEqual({ width: 3840, height: 2160 });
    expect(outputSize({ width: 1001, height: 1001 }, 0)).toEqual({ width: 1002, height: 1002 });
    expect(outputSize({ width: 1080, height: 1920 }, 2160, 1080).height).toBe(1080);
  });

  it('bitrate grows with quality and is bounded', () => {
    expect(bitrateFor(1080, 1920, 30, 'high')).toBeGreaterThan(bitrateFor(1080, 1920, 30, 'standard'));
    expect(bitrateFor(16, 16, 10, 'small')).toBe(500_000);
    expect(estimateBytes(base(), { width: 1080, height: 1920 }, 10_000)).toBeGreaterThan(1_000_000);
  });

  it('warns about platform videos and blocks link-only files and unsupported browsers', () => {
    const d = blankVideoDocument();
    d.assets.y = { kind: 'video', link: { url: 'https://youtu.be/aaaaaaaaaaa', platform: 'youtube', embedId: 'aaaaaaaaaaa' } };
    d.assets.l = { kind: 'video', link: { url: 'https://x.org/a.mp4' } };
    d.tracks[0].clips = [
      { id: 'a', type: 'media', assetId: 'y', startMs: 0, durationMs: 1000, inMs: 0, transform: { x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1 } },
      { id: 'b', type: 'media', assetId: 'l', startMs: 1000, durationMs: 1000, inMs: 0, transform: { x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1 } },
    ];
    const p = checkExport(d, base(), { webCodecs: false, mediaRecorder: true });
    expect(p.warnings.join(' ')).toMatch(/platform videos/);
    expect(p.blocking.join(' ')).toMatch(/another site’s link/);
    expect(p.blocking.join(' ')).toMatch(/cannot make MP4/);
    expect(checkExport(blankVideoDocument(), base(), { webCodecs: true, mediaRecorder: true }).blocking).toEqual(['The timeline is empty.']);
  });
});
