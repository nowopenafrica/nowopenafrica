import { describe, expect, it } from 'vitest';

import type { DesignPage, ShapeObject } from './designDocument';
import {
  MAX_STROKE, SHAPE_CHOICES, clampRadius, clampStroke, newShape, supportsRadius,
} from './shapes';

const page = (objects: DesignPage['objects'] = []): DesignPage => ({
  id: 'p', name: 'Page 1', width: 1080, height: 1080, objects,
});

describe('the shapes on offer', () => {
  it('offers a rectangle, a rounded one, a circle and a line', () => {
    expect(SHAPE_CHOICES.map((c) => c.kind)).toEqual(['rect', 'rounded', 'circle', 'line']);
    for (const c of SHAPE_CHOICES) {
      expect(c.label, c.kind).toBeTruthy();
      expect(c.hint, c.kind).toBeTruthy();
    }
  });

  /*
   * Nothing is offered that the renderer cannot draw. DesignSurface turns a
   * shape into a div — ellipse is a 50% radius, rect takes its own radius,
   * polygon a clip-path. A star would need real geometry, so it is absent
   * rather than offered and broken.
   */
  it('only produces shapes the renderer understands', () => {
    for (const c of SHAPE_CHOICES) {
      expect(['rect', 'ellipse'], c.kind).toContain(newShape(c.kind, page()).shape);
    }
  });
});

describe('a new shape', () => {
  it('lands in the middle of the page', () => {
    for (const c of SHAPE_CHOICES) {
      const s = newShape(c.kind, page());
      expect(s.x + s.w / 2, c.kind).toBeCloseTo(0.5, 6);
      expect(s.y + s.h / 2, c.kind).toBeCloseTo(0.5, 6);
    }
  });

  it('sits above whatever is already there', () => {
    const existing: ShapeObject = {
      id: 'old', type: 'shape', shape: 'rect', name: 'Band',
      x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1, visible: true, locked: false, z: 7,
    };
    expect(newShape('rect', page([existing])).z).toBeGreaterThan(7);
  });

  it('gives every shape its own id', () => {
    const a = newShape('rect', page());
    const b = newShape('rect', page());
    expect(a.id).not.toBe(b.id);
  });

  /* A circle must be a circle, not whatever oval a default box produced. */
  it('starts a circle square', () => {
    const c = newShape('circle', page());
    expect(c.shape).toBe('ellipse');
    expect(c.w).toBeCloseTo(c.h, 6);
  });

  /*
   * Every shape used to arrive with a 2% radius, so a sharp corner was not
   * drawable at all. A rectangle now has none.
   */
  it('gives a plain rectangle sharp corners and a rounded one soft ones', () => {
    expect(newShape('rect', page()).radius).toBe(0);
    expect(newShape('rounded', page()).radius).toBeGreaterThan(0);
  });

  it('makes a line thin and round-ended', () => {
    const line = newShape('line', page());
    expect(line.h).toBeLessThan(0.02);
    expect(line.w).toBeGreaterThan(line.h * 10);
    expect(line.radius).toBe(0.5);
  });

  it('takes the fill it is given', () => {
    expect(newShape('rect', page(), '#dc2626').fill).toBe('#dc2626');
  });
});

describe('what the properties panel may offer', () => {
  /* An ellipse is already 50% round; a slider that changes nothing is worse
     than no slider. */
  it('hides the corner radius on an ellipse', () => {
    expect(supportsRadius(newShape('circle', page()))).toBe(false);
    expect(supportsRadius(newShape('rect', page()))).toBe(true);
    expect(supportsRadius(newShape('line', page()))).toBe(true);
  });

  it('clamps a stroke to something drawable', () => {
    expect(clampStroke(-1)).toBe(0);
    expect(clampStroke(5)).toBe(MAX_STROKE);
    expect(clampStroke(Number.NaN)).toBe(0);
    expect(clampStroke(0.004)).toBe(0.004);
  });

  it('clamps a radius to half, which is already fully round', () => {
    expect(clampRadius(-0.2)).toBe(0);
    expect(clampRadius(9)).toBe(0.5);
    expect(clampRadius(Number.NaN)).toBe(0);
  });
});
