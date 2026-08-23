import { describe, it, expect } from 'vitest';
import {
  DESIGN_TEMPLATES, templateByKey, slotOf, slotBox, typePx, unitOf,
  motionAt, settleTime, surfaceLayers, hexAlpha, inkFor, SETTLED,
  type SlotSpec,
} from './designTemplates';

// Formats a template must survive unchanged — the point of fractional geometry.
const FORMATS: [string, number, number][] = [
  ['square post', 1080, 1080],
  ['story', 1080, 1920],
  ['landscape', 1920, 1080],
  ['A3 poster', 2480, 3508],
  ['thumbnail preview', 240, 240],
];

describe('catalogue integrity', () => {
  it('has unique keys', () => {
    const keys = DESIGN_TEMPLATES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every template a headline — without one there is no design', () => {
    for (const t of DESIGN_TEMPLATES) expect(slotOf(t, 'headline')).toBeTruthy();
  });

  it('falls back to a real template for an unknown key', () => {
    expect(templateByKey('does-not-exist')).toBe(DESIGN_TEMPLATES[0]);
    expect(templateByKey('statement').key).toBe('statement');
  });

  it('never places a slot outside the canvas, at any format', () => {
    for (const t of DESIGN_TEMPLATES) {
      for (const [name, w, h] of FORMATS) {
        for (const s of t.slots) {
          const b = slotBox(s, w, h);
          expect(b.left, `${t.key}/${s.role} @ ${name}`).toBeGreaterThanOrEqual(0);
          expect(b.left + b.width, `${t.key}/${s.role} @ ${name}`).toBeLessThanOrEqual(w + 0.5);
          expect(b.top, `${t.key}/${s.role} @ ${name}`).toBeGreaterThanOrEqual(0);
          expect(b.top, `${t.key}/${s.role} @ ${name}`).toBeLessThanOrEqual(h);
        }
      }
    }
  });

  it('clamps a template authored with bad geometry rather than losing content', () => {
    // Off-canvas content is silently lost in a flat export, so a clamp turns an
    // authoring mistake into a visible squeeze instead of a missing headline.
    const bad: SlotSpec = { role: 'headline', x: 2, y: 5, w: 3 };
    const b = slotBox(bad, 1000, 1000);
    expect(b.left).toBe(0);
    expect(b.width).toBe(1000);
    expect(b.top).toBeLessThanOrEqual(1000);
  });
});

describe('type scale', () => {
  it('scales with the short edge, so a story is not bigger than a square', () => {
    expect(unitOf(1080, 1920)).toBe(1080);
    expect(typePx(0.09, 1080, 1080)).toBe(typePx(0.09, 1080, 1920));
  });

  it('grows for print', () => {
    expect(typePx(0.09, 2480, 3508)).toBeGreaterThan(typePx(0.09, 1080, 1080));
  });

  it('keeps the smallest type legible even on a preview thumbnail', () => {
    // 240px preview: metadata at 0.02 is ~5px. Small, but it must not round to 0
    // or the slot vanishes from the preview and reappears on export.
    for (const t of DESIGN_TEMPLATES) {
      for (const s of t.slots) {
        if (s.role === 'qr') continue;
        expect(typePx(s.size, 240, 240), `${t.key}/${s.role}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('motion', () => {
  const slot: SlotSpec = { role: 'headline', x: 0.1, y: 0.4, w: 0.8, motion: { in: 'rise', at: 0.5, dur: 0.5 } };

  it('is absent before its cue and settled after', () => {
    expect(motionAt(slot, 0, 1080, 1080).opacity).toBe(0);
    expect(motionAt(slot, 0.5, 1080, 1080).opacity).toBe(0);
    expect(motionAt(slot, 1.0, 1080, 1080)).toEqual(SETTLED);
    expect(motionAt(slot, 99, 1080, 1080)).toEqual(SETTLED);
  });

  it('interpolates monotonically in between', () => {
    const a = motionAt(slot, 0.6, 1080, 1080);
    const b = motionAt(slot, 0.8, 1080, 1080);
    expect(a.opacity).toBeGreaterThan(0);
    expect(b.opacity).toBeGreaterThan(a.opacity);
    // Travel shrinks as it arrives.
    expect(Math.abs(b.dy)).toBeLessThan(Math.abs(a.dy));
  });

  it('treats a slot with no motion as always settled, so stills need no special case', () => {
    expect(motionAt({ role: 'brand', x: 0, y: 0, w: 1 }, 0, 100, 100)).toEqual(SETTLED);
  });

  // The guarantee the still renderer depends on: resolving at settleTime()
  // must give the animation's exact final frame, for every slot.
  it('settles every slot of every template by settleTime()', () => {
    for (const t of DESIGN_TEMPLATES) {
      const end = settleTime(t);
      expect(end, t.key).toBeGreaterThan(0);
      for (const s of t.slots) {
        expect(motionAt(s, end, 1080, 1080), `${t.key}/${s.role}`).toEqual(SETTLED);
      }
    }
  });

  it('reveals a wipe by geometry, not opacity', () => {
    const wipe: SlotSpec = { role: 'eyebrow', x: 0, y: 0, w: 1, motion: { in: 'wipe', at: 0, dur: 1 } };
    const mid = motionAt(wipe, 0.5, 1080, 1080);
    expect(mid.opacity).toBe(1);
    expect(mid.clip).not.toBeNull();
    expect(mid.clip![1]).toBeGreaterThan(0);
    expect(mid.clip![1]).toBeLessThan(100);
  });

  it('scales travel with the canvas, so motion reads the same at any size', () => {
    const small = motionAt(slot, 0.5, 240, 240).dy;
    const large = motionAt(slot, 0.5, 2400, 2400).dy;
    expect(large).toBeGreaterThan(small);
  });
});

describe('surface', () => {
  it('always paints something, so text never lands on transparency', () => {
    for (const t of DESIGN_TEMPLATES) {
      const layers = surfaceLayers(t, '#9a3412', '#0b1220');
      expect(layers.length, t.key).toBeGreaterThan(0);
      for (const l of layers) expect(l).toMatch(/gradient/);
    }
  });

  it('adds a vignette layer only where the template asks for one', () => {
    const withV = DESIGN_TEMPLATES.find(t => t.surface.vignette)!;
    const noV = DESIGN_TEMPLATES.find(t => !t.surface.vignette)!;
    expect(surfaceLayers(withV, '#fff', '#000').some(l => l.includes('rgba(0, 0, 0'))).toBe(true);
    expect(surfaceLayers(noV, '#fff', '#000').length).toBe(1);
  });

  it('pairs light ink with dark surfaces and vice versa', () => {
    for (const t of DESIGN_TEMPLATES) {
      expect(inkFor(t)).toBe(t.scheme === 'dark' ? '#ffffff' : '#0b1220');
    }
  });
});

describe('hexAlpha', () => {
  it('handles long, short and hash-less hex', () => {
    expect(hexAlpha('#ffffff', 1)).toBe('rgba(255, 255, 255, 1)');
    expect(hexAlpha('fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(hexAlpha('#000', 0)).toBe('rgba(0, 0, 0, 0)');
  });

  it('clamps alpha and survives junk instead of emitting invalid CSS', () => {
    // A broken colour must not produce "rgba(NaN…)", which browsers drop
    // entirely — that is how a background silently disappears.
    expect(hexAlpha('#ffffff', 5)).toBe('rgba(255, 255, 255, 1)');
    expect(hexAlpha('', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(hexAlpha('not-a-colour', 0.5)).not.toContain('NaN');
  });
});
