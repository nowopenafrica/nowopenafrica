import { describe, it, expect } from 'vitest';
import {
  motionScenesFromJob, motionTotalSeconds, MOTION_SECONDS, MOTION_SCENE_COUNTS,
  applyMotionTimeline, emptyMotionTimeline, timelineMoveClip, timelineSetSeconds,
  timelineResetSeconds, timelineDuplicate, timelineSplit, timelineRemove,
  timelineSetElement, timelineResetElement, timelineAppendClip,
  type MotionConfig, type MotionTimeline,
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

describe('motionGraphics — editor timeline overlay', () => {
  const scenes = motionScenesFromJob(base); // logo-reveal → 3 cards @ 3s

  it('no timeline leaves the generated storyboard untouched', () => {
    expect(applyMotionTimeline(scenes, undefined)).toEqual(scenes);
    expect(applyMotionTimeline(scenes, emptyMotionTimeline(scenes))).toEqual(scenes);
  });

  it('reorders clips by id and keeps every scene', () => {
    const tl = timelineMoveClip(emptyMotionTimeline(scenes), scenes[2].id, 0);
    const out = applyMotionTimeline(scenes, tl);
    expect(out.map((s) => s.id)).toEqual([scenes[2].id, scenes[0].id, scenes[1].id]);
    expect(out).toHaveLength(3);
    // Order is renumbered so the render uses the new sequence.
    expect(out.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it('trims a clip and clamps to the allowed range', () => {
    let tl = timelineSetSeconds(emptyMotionTimeline(scenes), scenes[0].id, 4.4);
    tl = timelineSetSeconds(tl, scenes[1].id, 99);
    const out = applyMotionTimeline(scenes, tl);
    expect(out[0].seconds).toBe(4.4);
    expect(out[1].seconds).toBe(12); // CLIP_SECONDS_MAX
    expect(out[2].seconds).toBe(scenes[2].seconds); // untouched
  });

  it('resets a single trim', () => {
    let tl = timelineSetSeconds(emptyMotionTimeline(scenes), scenes[0].id, 4);
    tl = timelineResetSeconds(tl, scenes[0].id);
    expect(applyMotionTimeline(scenes, tl)[0].seconds).toBe(scenes[0].seconds);
  });

  it('duplicates a clip with its duration, inserted right after the source', () => {
    const tl = timelineDuplicate(scenes, emptyMotionTimeline(scenes), scenes[1].id);
    const out = applyMotionTimeline(scenes, tl);
    expect(out.map((s) => s.id)).toEqual([scenes[0].id, scenes[1].id, expect.stringMatching(/^motion-1:copy-/), scenes[2].id]);
    expect(out[2].text).toBe(scenes[1].text);
    expect(out[2].seconds).toBe(scenes[1].seconds);
    expect(out[2].id).not.toBe(scenes[1].id);
  });

  it('splits a clip into two halves that keep the total time', () => {
    const tl = timelineSplit(scenes, emptyMotionTimeline(scenes), scenes[0].id, 2);
    const out = applyMotionTimeline(scenes, tl);
    expect(out.map((s) => s.id)).toEqual([scenes[0].id, expect.stringMatching(/^motion-0:split-/), scenes[1].id, scenes[2].id]);
    expect(out[0].seconds).toBe(2);
    expect(out[1].seconds).toBe(1);
    expect(out[0].seconds + out[1].seconds).toBe(scenes[0].seconds);
  });

  it('rejects an out-of-range split and removes a clip', () => {
    expect(timelineSplit(scenes, emptyMotionTimeline(scenes), scenes[0].id, 3)).toEqual(emptyMotionTimeline(scenes));
    const tl = timelineRemove(emptyMotionTimeline(scenes), scenes[0].id);
    const out = applyMotionTimeline(scenes, tl);
    expect(out.map((s) => s.id)).toEqual([scenes[1].id, scenes[2].id]);
    // The base scene reappears after a timeline reset.
    expect(applyMotionTimeline(scenes, undefined)).toHaveLength(3);
  });

  it('appends brief scenes that a stale timeline does not know about', () => {
    const tl: MotionTimeline = { order: ['ghost-1'], seconds: {}, custom: {}, removed: [] };
    const out = applyMotionTimeline(scenes, tl);
    expect(out.map((s) => s.id)).toEqual(scenes.map((s) => s.id)); // ghost skipped, all base kept
  });

  it('overrides and resets a caption element per clip', () => {
    let tl = emptyMotionTimeline(scenes);
    tl = timelineSetElement(tl, scenes[0].id, 'title', { text: 'Custom headline', color: '#fde047' });
    tl = timelineSetElement(tl, scenes[0].id, 'title', { scale: 1.4 });
    const out = applyMotionTimeline(scenes, tl);
    expect(out[0].elements?.title).toMatchObject({ text: 'Custom headline', color: '#fde047', scale: 1.4 });
    expect(out[1].elements?.title).toBeUndefined(); // other clips untouched
    const reset = timelineResetElement(tl, scenes[0].id, 'title');
    expect(applyMotionTimeline(scenes, reset)[0].elements).toBeUndefined();
  });

  it('hides an element and drops its overlay when the clip is removed', () => {
    let tl = timelineSetElement(emptyMotionTimeline(scenes), scenes[0].id, 'cta', { hidden: true });
    expect(applyMotionTimeline(scenes, tl)[0].elements?.cta?.hidden).toBe(true);
    tl = timelineRemove(tl, scenes[0].id);
    expect(tl.elements?.[scenes[0].id]).toBeUndefined();
  });

  it('appends a brand-new clip cloned from a base scene', () => {
    const tl = timelineAppendClip(emptyMotionTimeline(scenes), scenes[0]);
    const out = applyMotionTimeline(scenes, tl);
    expect(out).toHaveLength(scenes.length + 1);
    const added = out[out.length - 1];
    expect(added.id).not.toBe(scenes[0].id);
    expect(added.text).toBe(scenes[0].text);
    expect(added.transition).toBe('fade');
  });
});
