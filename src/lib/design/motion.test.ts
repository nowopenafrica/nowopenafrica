import { describe, it, expect } from 'vitest';

import {
  CAMERA_STILL, DESIGN_TEMPLATES, EASINGS, cameraAt, motionAt, settleTime,
  type EaseKey, type MotionIn, type SlotSpec,
} from '../designTemplates';

const W = 1080;
const H = 1920;

const slot = (kind: MotionIn, ease?: EaseKey): SlotSpec => ({
  role: 'headline', x: 0.1, y: 0.4, w: 0.8,
  motion: { in: kind, at: 1, dur: 1, ease },
});

const KINDS: MotionIn[] = [
  'fade', 'rise', 'drop', 'wipe', 'pop', 'blur',
  'slide-left', 'slide-right', 'mask-up', 'scale-out',
];

describe('easing curves', () => {
  it('all start at 0 and end at exactly 1', () => {
    // The end matters more than it looks: a spring that finishes at 1.002 makes
    // the exported PNG a fraction larger than the video's last frame, and
    // nobody would ever work out why.
    for (const [key, ease] of Object.entries(EASINGS)) {
      expect(ease(0), `${key} at 0`).toBeCloseTo(0, 5);
      expect(ease(1), `${key} at 1`).toBe(1);
    }
  });

  it('are monotonic where they claim to be, and overshoot only where intended', () => {
    for (const key of ['linear', 'in', 'out', 'inOut'] as EaseKey[]) {
      let last = -1;
      for (let p = 0; p <= 1.0001; p += 0.05) {
        const v = EASINGS[key](Math.min(p, 1));
        expect(v, `${key} @ ${p.toFixed(2)}`).toBeGreaterThanOrEqual(last - 1e-9);
        expect(v, `${key} range @ ${p.toFixed(2)}`).toBeLessThanOrEqual(1.0001);
        last = v;
      }
    }
    // Spring and elastic are allowed past 1 in the middle — that IS the effect.
    const peak = Math.max(...Array.from({ length: 40 }, (_, i) => EASINGS.spring(i / 40)));
    expect(peak).toBeGreaterThan(1);
  });

  it('defaults to the old single curve, so nothing already authored shifts', () => {
    const withDefault = motionAt(slot('rise'), 1.5, W, H);
    const explicit = motionAt(slot('rise', 'out'), 1.5, W, H);
    expect(withDefault).toEqual(explicit);
  });
});

describe('entrances', () => {
  it('are fully absent before their start and exactly settled after their end', () => {
    // The second half is what lets the still renderer reuse motionAt: resolve
    // at settleTime and every slot is final, so a still cannot drift from the
    // animation's last frame.
    for (const kind of KINDS) {
      const before = motionAt(slot(kind), 0.5, W, H);
      const after = motionAt(slot(kind), 2.5, W, H);
      if (kind === 'wipe' || kind === 'mask-up') {
        // These hide via the clip, not via opacity.
        expect(before.clip, kind).not.toBeNull();
      } else {
        expect(before.opacity, kind).toBe(0);
      }
      expect(after, `${kind} settled`).toEqual({
        opacity: 1, dx: 0, dy: 0, scale: 1, blurPx: 0, clip: null,
      });
    }
  });

  it('never lets opacity leave 0..1, whatever curve is on it', () => {
    // A spring on a fade would flash past fully opaque and back, which reads as
    // a dropped frame rather than as a bounce.
    for (const kind of KINDS) {
      for (const ease of Object.keys(EASINGS) as EaseKey[]) {
        for (let t = 1; t <= 2; t += 0.05) {
          const m = motionAt(slot(kind, ease), t, W, H);
          expect(m.opacity, `${kind}/${ease} @ ${t.toFixed(2)}`).toBeGreaterThanOrEqual(0);
          expect(m.opacity, `${kind}/${ease} @ ${t.toFixed(2)}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('travels horizontally for the slides, and from opposite sides', () => {
    const left = motionAt(slot('slide-left'), 1, W, H);
    const right = motionAt(slot('slide-right'), 1, W, H);
    expect(left.dx).toBeGreaterThan(0);
    expect(right.dx).toBeLessThan(0);
    expect(left.dy).toBe(0);
  });

  it('scales down into place for scale-out, and up for pop', () => {
    expect(motionAt(slot('scale-out'), 1, W, H).scale).toBeGreaterThan(1);
    expect(motionAt(slot('pop'), 1, W, H).scale).toBeLessThan(1);
  });

  it('reveals mask-up from the baseline, not from the side', () => {
    const m = motionAt(slot('mask-up'), 1.2, W, H);
    expect(m.clip?.[0]).toBeGreaterThan(0);   // inset from the top
    expect(m.clip?.[1]).toBe(0);              // nothing from the right
  });

  it('has no motion at all without a motion spec', () => {
    expect(motionAt({ role: 'headline', x: 0, y: 0, w: 1 }, 5, W, H)).toEqual({
      opacity: 1, dx: 0, dy: 0, scale: 1, blurPx: 0, clip: null,
    });
  });
});

describe('the camera', () => {
  it('does nothing without a spec, or without a duration', () => {
    // A still is one instant. A guessed duration would put a half-finished
    // push on every exported PNG.
    expect(cameraAt(undefined, 1, 5, W, H)).toEqual(CAMERA_STILL);
    expect(cameraAt({ move: 'push' }, 1, 0, W, H)).toEqual(CAMERA_STILL);
    expect(cameraAt({ move: 'none' }, 1, 5, W, H)).toEqual(CAMERA_STILL);
  });

  it('never drops below scale 1, at any point of any move', () => {
    // Below 1 the frame edges come into shot, which looks like a bug and cannot
    // be fixed in the edit.
    for (const move of ['push', 'pull', 'pan-left', 'pan-right', 'drift'] as const) {
      for (let t = 0; t <= 5; t += 0.25) {
        expect(cameraAt({ move }, t, 5, W, H).scale, `${move} @ ${t}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('pushes in and pulls out', () => {
    const push = [0, 5].map((t) => cameraAt({ move: 'push' }, t, 5, W, H).scale);
    const pull = [0, 5].map((t) => cameraAt({ move: 'pull' }, t, 5, W, H).scale);
    expect(push[1]).toBeGreaterThan(push[0]);
    expect(pull[1]).toBeLessThan(pull[0]);
    // A pull must land exactly at 1, or the last frame is bigger than the still.
    expect(pull[1]).toBe(1);
  });

  it('pans in opposite directions and keeps the frame covered while it does', () => {
    const l = cameraAt({ move: 'pan-left' }, 2.5, 5, W, H);
    const r = cameraAt({ move: 'pan-right' }, 2.5, 5, W, H);
    expect(l.dx).toBeLessThan(0);
    expect(r.dx).toBeGreaterThan(0);
    expect(l.scale).toBeGreaterThan(1);
  });

  it('is clamped outside the scene rather than running away', () => {
    const past = cameraAt({ move: 'push' }, 99, 5, W, H);
    const end = cameraAt({ move: 'push' }, 5, 5, W, H);
    expect(past).toEqual(end);
    expect(cameraAt({ move: 'push' }, -3, 5, W, H).scale).toBe(1);
  });

  it('moves by a fraction nobody consciously notices', () => {
    // A push you can SEE happening draws attention to the camera instead of
    // the subject. 12% is already too much.
    for (const tpl of DESIGN_TEMPLATES) {
      if (!tpl.camera) continue;
      expect(tpl.camera.amount ?? 0.04, tpl.key).toBeLessThanOrEqual(0.08);
    }
  });

  it('is scoped to the templates that suit one', () => {
    const withCamera = DESIGN_TEMPLATES.filter((t) => t.camera);
    expect(withCamera.length).toBeGreaterThan(0);
    // Not every layout: a price list that drifts is a price list you cannot read.
    expect(withCamera.length).toBeLessThan(DESIGN_TEMPLATES.length / 2);
  });
});

describe('scene length', () => {
  it('every template settles in a workable clip length', () => {
    for (const tpl of DESIGN_TEMPLATES) {
      const settle = settleTime(tpl);
      expect(settle, tpl.key).toBeGreaterThan(0);
      // Longer than about two seconds and the last line of a five-scene advert
      // arrives after the scene has cut.
      expect(settle, `${tpl.key} settles too late`).toBeLessThanOrEqual(2.2);
    }
  });
});
