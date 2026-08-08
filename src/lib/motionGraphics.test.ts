import { describe, it, expect } from 'vitest';
import {
  motionScenesFromJob, motionTotalSeconds, MOTION_SECONDS, MOTION_SCENE_COUNTS,
  type MotionConfig,
} from './motionGraphics';

const base: MotionConfig = {
  business: 'Meat Club',
  headline: 'Smoked to perfection',
  subhead: 'Bold flavours, low prices',
  cta: 'Order on WhatsApp now',
  logoEmoji: '🔥',
  aspect: 'Vertical',
  duration: 'medium',
  style: 'logo-reveal',
};

describe('motionGraphics — storyboard builder', () => {
  it('builds the right number of cards per job type', () => {
    (Object.keys(MOTION_SCENE_COUNTS) as (keyof typeof MOTION_SCENE_COUNTS)[]).forEach((style) => {
      const scenes = motionScenesFromJob({ ...base, style });
      expect(scenes, style).toHaveLength(MOTION_SCENE_COUNTS[style]);
    });
  });

  it('is deterministic for the same config', () => {
    expect(motionScenesFromJob(base)).toEqual(motionScenesFromJob(base));
  });

  it('applies the pacing from duration to every card', () => {
    const short = motionScenesFromJob({ ...base, duration: 'short' });
    const long = motionScenesFromJob({ ...base, duration: 'long' });
    short.forEach((s) => expect(s.seconds).toBe(MOTION_SECONDS.short));
    long.forEach((s) => expect(s.seconds).toBe(MOTION_SECONDS.long));
    expect(motionTotalSeconds({ ...base, duration: 'short' })).toBe(MOTION_SECONDS.short * MOTION_SCENE_COUNTS[base.style]);
  });

  it('writes an arc: final card cuts so the call to action holds', () => {
    const scenes = motionScenesFromJob(base);
    scenes.slice(0, -1).forEach((s) => expect(s.transition).toBe('fade'));
    expect(scenes[scenes.length - 1].transition).toBe('cut');
  });

  it('brands the reveal and carries the cta onto the final card', () => {
    const scenes = motionScenesFromJob(base);
    expect(scenes[0].text).toContain(base.business.toUpperCase());
    expect(scenes[scenes.length - 1].voiceover).toBe(base.cta);
  });

  it('spreads kinetic type across one word per card', () => {
    const scenes = motionScenesFromJob({ ...base, style: 'kinetic-type', headline: 'Smoked to perfection daily' });
    expect(scenes).toHaveLength(4);
    scenes.forEach((s, i) => {
      const words = 'Smoked to perfection daily'.trim().split(/\s+/);
      expect(s.text).toBe(words[i].toUpperCase());
    });
  });

  it('counts down before the reveal', () => {
    const scenes = motionScenesFromJob({ ...base, style: 'countdown' });
    expect(scenes.map((s) => s.text)).toEqual(['3', '2', '1', 'GO!']);
  });

  it('never emits an empty card', () => {
    const styles = Object.keys(MOTION_SCENE_COUNTS) as MotionConfig['style'][];
    styles.forEach((style) => {
      motionScenesFromJob({ ...base, style, headline: '', subhead: '', cta: '' })
        .forEach((s) => expect(s.text.trim().length).toBeGreaterThan(0));
    });
  });
});
