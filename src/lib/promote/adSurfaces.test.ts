import { describe, expect, it } from 'vitest';

import {
  DEFAULT_QUAD, isPublishable, isStale, quadColumns, toSurface, type SurfaceRow,
} from './adSurfaces';
import { isUsableQuad, matrix3dFor, type Quad } from './surface';

const row = (over: Partial<SurfaceRow> = {}): SurfaceRow => ({
  id: 'surface-1',
  advert_id: 'advert-1',
  image_url: 'https://example.test/board.jpg',
  tl_x: 0.18, tl_y: 0.26,
  tr_x: 0.82, tr_y: 0.14,
  br_x: 0.82, br_y: 0.54,
  bl_x: 0.18, bl_y: 0.52,
  note: null,
  status: 'published',
  ...over,
});

describe('a row becomes the same Quad the drawn scenes use', () => {
  /*
   * The point of storing four fractions rather than a crop: the renderer
   * does not change. A surface marked on a photograph and a surface drawn
   * in code go through one homography, so the two cannot drift apart.
   */
  it('reads into a quad a transform can be solved from', () => {
    const surface = toSurface(row());
    expect(surface.quad.tl).toEqual({ x: 0.18, y: 0.26 });
    expect(isUsableQuad(surface.quad)).toBe(true);
    expect(matrix3dFor(1000, 500, surface.quad, 1000, 1000)).not.toBeNull();
  });

  /* Postgres numerics arrive as strings through PostgREST often enough. */
  it('survives numbers that arrive as text', () => {
    const surface = toSurface(row({ tl_x: '0.18' as unknown as number }));
    expect(surface.quad.tl.x).toBe(0.18);
  });

  it('round-trips through the flat columns', () => {
    const quad: Quad = toSurface(row()).quad;
    expect(quadColumns(quad)).toEqual({
      tl_x: 0.18, tl_y: 0.26, tr_x: 0.82, tr_y: 0.14,
      br_x: 0.82, br_y: 0.54, bl_x: 0.18, bl_y: 0.52,
    });
  });
});

describe('corners belong to one photograph', () => {
  /*
   * A media owner replacing the advert's picture does not touch this table.
   * The only way to notice is to compare — and corners marked on a
   * different picture are somebody's advert on the wrong wall.
   */
  it('notices when the placement photo has changed underneath', () => {
    const surface = toSurface(row());
    expect(isStale(surface, 'https://example.test/board.jpg')).toBe(false);
    expect(isStale(surface, 'https://example.test/a-different-board.jpg')).toBe(true);
  });

  it('does not call it stale when there is nothing to compare', () => {
    expect(isStale(toSurface(row()), null)).toBe(false);
  });
});

describe('what may be published', () => {
  it('accepts a proper quadrilateral', () => {
    expect(isPublishable(toSurface(row()).quad).ok).toBe(true);
    expect(isPublishable(DEFAULT_QUAD).ok).toBe(true);
  });

  /*
   * Nearly right is the one outcome worse than none: an advert across a
   * lamppost looks deliberate.
   */
  it('refuses corners that cross over each other', () => {
    const bowtie: Quad = {
      tl: { x: 0.2, y: 0.2 }, tr: { x: 0.8, y: 0.2 },
      br: { x: 0.2, y: 0.6 }, bl: { x: 0.8, y: 0.6 },
    };
    const out = isPublishable(bowtie);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.why).toMatch(/cross over/);
  });

  it('refuses a surface too small to be a board', () => {
    const speck: Quad = {
      tl: { x: 0.50, y: 0.50 }, tr: { x: 0.56, y: 0.50 },
      br: { x: 0.56, y: 0.54 }, bl: { x: 0.50, y: 0.54 },
    };
    const out = isPublishable(speck);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.why).toMatch(/tiny/);
  });
});
