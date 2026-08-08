import { describe, it, expect } from 'vitest';
import { directorScenesFromReel, directorSceneFromReel, voiceoverScript, shotList } from './reelRender';
import { generateReel, REEL_FORMATS, totalDuration } from './video';
import { buildRenderTimeline, renderTotalSeconds } from './renderVideo';
import type { Business } from '../types';

// The adapter is the join between two modules that were built separately, so
// what's worth testing is that the render engine can actually consume what the
// script generator produces — not just that fields got copied across.

const business = {
  id: 'b1',
  name: 'Mama Put Kitchen',
  category: 'Restaurant',
  location: 'Lagos, Nigeria',
  description: 'Home-style Nigerian cooking, served fast.',
} as unknown as Business;

describe('directorSceneFromReel', () => {
  const reel = generateReel(business, '15s Reel');

  it('maps every reel scene into a scene the renderer understands', () => {
    const scenes = directorScenesFromReel(reel);
    expect(scenes).toHaveLength(reel.scenes.length);

    scenes.forEach((s, i) => {
      expect(s.text).toBe(reel.scenes[i].caption);
      expect(s.voiceover).toBe(reel.scenes[i].voiceover);
      expect(s.direction).toBe(reel.scenes[i].direction);
      expect(s.order).toBe(i);
      // Fields the renderer reads but a reel script has no concept of.
      expect(s.camera).toBeTruthy();
      expect(s.grading).toBeTruthy();
      expect(s.motion).toBeTruthy();
    });
  });

  it('holds the last scene on a cut so the call to action stays readable', () => {
    const scenes = directorScenesFromReel(reel);
    expect(scenes[scenes.length - 1].transition).toBe('cut');
    expect(scenes.slice(0, -1).every((s) => s.transition === 'fade')).toBe(true);
  });

  it('is a pure mapping — the same script always yields the same scenes', () => {
    expect(directorScenesFromReel(reel)).toEqual(directorScenesFromReel(reel));
  });

  it('gives the same film treatment when a script is regenerated', () => {
    // generateReel stamps a fresh uid() per scene, so ids legitimately differ
    // between runs. Everything that decides how the video LOOKS must not.
    const treatment = (s: ReturnType<typeof directorScenesFromReel>) =>
      s.map(({ id: _id, ...rest }) => rest);

    expect(treatment(directorScenesFromReel(reel)))
      .toEqual(treatment(directorScenesFromReel(generateReel(business, '15s Reel'))));
  });

  it('never emits a zero-length scene, which would divide by zero in the timeline', () => {
    const scene = directorSceneFromReel(
      { id: 's', duration: 0, caption: 'x', direction: 'd', voiceover: 'v' },
      0,
      1,
    );
    expect(scene.seconds).toBeGreaterThanOrEqual(1);
  });
});

describe('every reel format survives the round trip', () => {
  // A format that produces scenes the renderer chokes on would only show up as
  // a failed export, after the owner has already written their script.
  for (const format of REEL_FORMATS) {
    it(`renders a timeline for "${format.key}"`, () => {
      const script = generateReel(business, format.key);
      const scenes = directorScenesFromReel(script);

      expect(scenes.length).toBeGreaterThan(0);
      const timeline = buildRenderTimeline(scenes, {
        businessName: business.name,
        directionLabel: 'Promo',
        aspect: 'Vertical',
      });

      expect(timeline.totalFrames).toBeGreaterThan(0);
      expect(timeline.scenes).toHaveLength(scenes.length);
      // The rendered length must match the script the owner was shown.
      expect(renderTotalSeconds(scenes)).toBe(totalDuration(script));
    });
  }
});

describe('paper deliverables', () => {
  const reel = generateReel(business, 'Promo Video');

  it('numbers voiceover lines with a running clock', () => {
    const text = voiceoverScript(reel);
    expect(text).toContain('1. [0s–');
    expect(text.split('\n').filter((l) => /^\d+\. \[/.test(l))).toHaveLength(reel.scenes.length);
  });

  it('puts the on-screen caption next to each shot', () => {
    const text = shotList(reel);
    expect(text).toContain('On screen:');
    expect(text).toContain(reel.scenes[0].direction);
  });
});
