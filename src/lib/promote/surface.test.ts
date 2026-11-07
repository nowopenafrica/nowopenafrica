import { describe, expect, it } from 'vitest';

import {
  checkResolution, clipPathFor, fitArtwork, homography, isUsableQuad, matrix3dFor,
  type Quad,
} from './surface';

/** Apply a 3×3 homography to a point, the way the browser will. */
const apply = (t: number[], x: number, y: number) => {
  const [a, b, c, d, e, f, g, h, i] = t;
  const w = g * x + h * y + i;
  return { x: (a * x + b * y + c) / w, y: (d * x + e * y + f) / w };
};

const RECT: Quad = {
  tl: { x: 0.2, y: 0.2 }, tr: { x: 0.8, y: 0.2 },
  br: { x: 0.8, y: 0.6 }, bl: { x: 0.2, y: 0.6 },
};

/* A billboard seen from the pavement: the far edge is shorter. */
const PERSPECTIVE: Quad = {
  tl: { x: 0.18, y: 0.26 }, tr: { x: 0.82, y: 0.14 },
  br: { x: 0.82, y: 0.54 }, bl: { x: 0.18, y: 0.52 },
};

describe('the transform lands the artwork exactly on the surface', () => {
  it('takes each corner of the artwork to its corner of the quad', () => {
    const t = homography(400, 200, PERSPECTIVE, 1000, 600)!;
    expect(t).not.toBeNull();

    const corners: [number, number, { x: number; y: number }][] = [
      [0, 0, PERSPECTIVE.tl], [400, 0, PERSPECTIVE.tr],
      [400, 200, PERSPECTIVE.br], [0, 200, PERSPECTIVE.bl],
    ];
    for (const [x, y, want] of corners) {
      const got = apply(t, x, y);
      expect(got.x).toBeCloseTo(want.x * 1000, 4);
      expect(got.y).toBeCloseTo(want.y * 600, 4);
    }
  });

  /*
   * The whole reason an affine transform will not do. On a receding
   * surface the midpoint of the artwork does NOT land at the midpoint of
   * the quad's diagonals — it lands nearer the far edge, which is exactly
   * what makes a perspective preview look real.
   */
  it('is projective, not merely a scale and a skew', () => {
    const t = homography(400, 200, PERSPECTIVE, 1000, 600)!;
    const centre = apply(t, 200, 100);
    const naive = {
      x: ((PERSPECTIVE.tl.x + PERSPECTIVE.br.x) / 2) * 1000,
      y: ((PERSPECTIVE.tl.y + PERSPECTIVE.br.y) / 2) * 600,
    };
    expect(Math.abs(centre.y - naive.y)).toBeGreaterThan(0.5);
  });

  it('degenerates to a plain rectangle when the quad is one', () => {
    const t = homography(400, 200, RECT, 1000, 600)!;
    const centre = apply(t, 200, 100);
    expect(centre.x).toBeCloseTo(0.5 * 1000, 4);
    expect(centre.y).toBeCloseTo(0.4 * 600, 4);
  });

  it('refuses a quad with no area rather than returning NaNs', () => {
    const flat: Quad = {
      tl: { x: 0.2, y: 0.2 }, tr: { x: 0.8, y: 0.2 },
      br: { x: 0.8, y: 0.2 }, bl: { x: 0.2, y: 0.2 },
    };
    expect(homography(400, 200, flat, 1000, 600)).toBeNull();
    expect(matrix3dFor(400, 200, flat, 1000, 600)).toBeNull();
    expect(homography(0, 200, RECT, 1000, 600)).toBeNull();
  });
});

describe('the CSS the browser is handed', () => {
  /*
   * CSS takes a 4×4 in COLUMN-major order and a 2D homography sits at its
   * corners. Getting the ordering wrong produces a plausible-looking but
   * subtly sheared result, which is worse than an obviously broken one.
   */
  it('emits a 16-value matrix3d in column-major order', () => {
    const css = matrix3dFor(400, 200, PERSPECTIVE, 1000, 600)!;
    const values = css.replace(/^matrix3d\(|\)$/g, '').split(',').map(Number);
    expect(values).toHaveLength(16);
    expect(values.every(Number.isFinite)).toBe(true);

    const t = homography(400, 200, PERSPECTIVE, 1000, 600)!;
    /* m[0]=a, m[1]=d, m[3]=g — the first COLUMN, not the first row. */
    expect(values[0]).toBeCloseTo(t[0], 5);
    expect(values[1]).toBeCloseTo(t[3], 5);
    expect(values[3]).toBeCloseTo(t[6], 5);
    /* z is untouched. */
    expect(values[10]).toBe(1);
  });

  it('clips to the surface so artwork cannot spill onto the scene', () => {
    const clip = clipPathFor(RECT);
    expect(clip).toBe('polygon(20.000% 20.000%, 80.000% 20.000%, 80.000% 60.000%, 20.000% 60.000%)');
  });

  it('rejects a self-crossing quad', () => {
    expect(isUsableQuad(PERSPECTIVE)).toBe(true);
    const bowtie: Quad = {
      tl: { x: 0.2, y: 0.2 }, tr: { x: 0.8, y: 0.2 },
      br: { x: 0.2, y: 0.6 }, bl: { x: 0.8, y: 0.6 },
    };
    expect(isUsableQuad(bowtie)).toBe(false);
  });
});

describe('fitting artwork somebody actually uploaded', () => {
  const surface = { width: 1200, height: 600 };

  it('contains a tall artwork without cropping it', () => {
    const fit = fitArtwork({ width: 1080, height: 1350 }, surface, 'contain');
    expect(fit.height).toBeCloseTo(600, 3);
    expect(fit.cropped).toBe(false);
    /* Centred, so the surface shows the artwork rather than its corner. */
    expect(fit.left).toBeGreaterThan(0);
  });

  it('covers the surface and says that it had to crop', () => {
    const fit = fitArtwork({ width: 1080, height: 1350 }, surface, 'cover');
    expect(fit.width).toBeGreaterThanOrEqual(surface.width - 0.5);
    expect(fit.cropped).toBe(true);
  });

  /*
   * Distorting somebody's logo to fill a billboard is the commonest way a
   * preview lies about what will be printed, so it is never the default.
   */
  it('only stretches when asked', () => {
    const honest = fitArtwork({ width: 1000, height: 1000 }, surface);
    expect(honest.width).not.toBeCloseTo(surface.width, 1);
    const stretched = fitArtwork({ width: 1000, height: 1000 }, surface, 'stretch');
    expect(stretched.width).toBe(surface.width);
    expect(stretched.height).toBe(surface.height);
  });

  it('survives an artwork with no size', () => {
    expect(fitArtwork({ width: 0, height: 0 }, surface).width).toBe(0);
  });
});

describe('whether the file is good enough to print', () => {
  it('passes artwork with the pixels the surface needs', () => {
    expect(checkResolution({ width: 4800, height: 2400 }, { width: 4800, height: 2400 }).verdict).toBe('ok');
  });

  it('warns rather than refuses when it is close', () => {
    const check = checkResolution({ width: 3600, height: 1800 }, { width: 4800, height: 2400 });
    expect(check.verdict).toBe('tight');
    expect(check.message).toContain('4800 × 2400px');
  });

  it('says plainly when it is too small', () => {
    expect(checkResolution({ width: 600, height: 300 }, { width: 4800, height: 2400 }).verdict).toBe('short');
  });

  /*
   * A warning computed from a size nobody verified is a warning about
   * nothing, and a reassurance would be worse.
   */
  it('gives no verdict when the real size was never confirmed', () => {
    const check = checkResolution({ width: 600, height: 300 }, null);
    expect(check.verdict).toBe('unknown');
    expect(check.message).toMatch(/confirmed with the media owner/);
  });
});
