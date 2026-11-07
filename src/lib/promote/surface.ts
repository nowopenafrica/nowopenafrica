/**
 * Putting artwork onto an advertising surface, in perspective.
 *
 * ── THE PROBLEM ──────────────────────────────────────────────────────────
 *
 * A billboard photographed from the pavement is not a rectangle on screen —
 * it is a quadrilateral, and its far edge is shorter than its near one. An
 * artwork pasted into a bounding box over it looks pasted. Scaling and
 * skewing it does not help either: an affine transform keeps parallel lines
 * parallel, and the whole point of a receding surface is that they do not.
 *
 * What is needed is a PROJECTIVE transform — a homography — which is the
 * one linear map that takes the unit square to an arbitrary convex
 * quadrilateral. The browser can apply one directly through `matrix3d`, so
 * there is no canvas, no WebGL and no new dependency: the artwork stays a
 * live DOM element that can still be dragged, scaled and re-fitted.
 *
 * ── WHY NOT A 3D ENGINE ──────────────────────────────────────────────────
 *
 * Because a 2D billboard does not need one, and shipping one to preview a
 * poster costs every visitor the download. The brief says so too.
 */

/** A corner, as a fraction of the scene's width and height. */
export interface Corner {
  x: number;
  y: number;
}

/** The four corners of an advertising surface, clockwise from top-left. */
export interface Quad {
  tl: Corner;
  tr: Corner;
  br: Corner;
  bl: Corner;
}

/* ── homography ───────────────────────────────────────────────────────── */

/**
 * Solve a small dense linear system by Gaussian elimination with partial
 * pivoting. Eight unknowns, so nothing clever is warranted.
 *
 * Returns null when the system is singular, which is what a degenerate
 * quadrilateral produces — three corners in a line has no transform, and
 * returning NaNs would paint an invisible element nobody could debug.
 */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-10) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const f = m[row][col] / m[col][col];
      for (let k = col; k <= n; k += 1) m[row][k] -= f * m[col][k];
    }
  }

  return m.map((row, i) => row[n] / row[i]);
}

/**
 * The homography taking the rectangle (0,0)–(w,h) to `quad`, in pixels.
 *
 * Eight unknowns and eight equations — two per corner. The ninth element is
 * fixed at 1, which is the usual normalisation and is why the system is
 * solvable at all.
 */
export function homography(w: number, h: number, quad: Quad, sceneW: number, sceneH: number): number[] | null {
  if (w <= 0 || h <= 0) return null;

  const src: [number, number][] = [[0, 0], [w, 0], [w, h], [0, h]];
  const dst: [number, number][] = [
    [quad.tl.x * sceneW, quad.tl.y * sceneH],
    [quad.tr.x * sceneW, quad.tr.y * sceneH],
    [quad.br.x * sceneW, quad.br.y * sceneH],
    [quad.bl.x * sceneW, quad.bl.y * sceneH],
  ];

  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const [sx, sy] = src[i];
    const [dx, dy] = dst[i];
    a.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    b.push(dx);
    a.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    b.push(dy);
  }

  const solved = solve(a, b);
  if (!solved || solved.some((v) => !Number.isFinite(v))) return null;
  return [...solved, 1];
}

/**
 * The same transform as a CSS `matrix3d`.
 *
 * CSS takes a 4×4 in COLUMN-major order, and a 2D homography sits inside it
 * at the corners: the third row and column are the identity because nothing
 * moves in z. Getting this ordering wrong is the classic failure — it
 * produces a plausible-looking but subtly sheared result, which is worse
 * than an obviously broken one.
 */
export function matrix3dFor(w: number, h: number, quad: Quad, sceneW: number, sceneH: number): string | null {
  const t = homography(w, h, quad, sceneW, sceneH);
  if (!t) return null;
  const [a, b, c, d, e, f, g, i] = t;
  const m = [
    a, d, 0, g,
    b, e, 0, i,
    0, 0, 1, 0,
    c, f, 0, 1,
  ];
  return `matrix3d(${m.map((v) => Number(v.toFixed(6))).join(', ')})`;
}

/**
 * The surface as a CSS `clip-path`, so artwork cannot spill past its edges.
 *
 * The transform alone is not enough: a rectangular artwork mapped onto a
 * quadrilateral fills it exactly, but a user who has scaled their artwork up
 * to crop it would otherwise paint over the scene around the billboard.
 */
export const clipPathFor = (quad: Quad): string =>
  `polygon(${[quad.tl, quad.tr, quad.br, quad.bl]
    .map((c) => `${(c.x * 100).toFixed(3)}% ${(c.y * 100).toFixed(3)}%`)
    .join(', ')})`;

/** Is this four corners of a real convex shape, or nonsense? */
export function isUsableQuad(quad: Quad): boolean {
  const pts = [quad.tl, quad.tr, quad.br, quad.bl];
  if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;

  /* Cross products of consecutive edges must share a sign throughout. */
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const c = pts[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/* ── fitting artwork to a surface ─────────────────────────────────────── */

export type Fit = 'contain' | 'cover' | 'stretch';

export interface Fitted {
  /** The artwork's drawn size, in surface units. */
  width: number;
  height: number;
  /** Offset within the surface, so the result sits centred. */
  left: number;
  top: number;
  /** True when `cover` has pushed part of the artwork outside the surface. */
  cropped: boolean;
}

/**
 * Fit artwork of one shape into a surface of another.
 *
 * `stretch` is offered and is never the default. Distorting somebody's logo
 * to fill a billboard is the single most common way a preview lies about
 * what will be printed.
 */
export function fitArtwork(
  art: { width: number; height: number },
  surface: { width: number; height: number },
  fit: Fit = 'contain',
  scale = 1,
): Fitted {
  if (art.width <= 0 || art.height <= 0 || surface.width <= 0 || surface.height <= 0) {
    return { width: 0, height: 0, left: 0, top: 0, cropped: false };
  }

  if (fit === 'stretch') {
    return { width: surface.width * scale, height: surface.height * scale, left: 0, top: 0, cropped: scale > 1 };
  }

  const byWidth = surface.width / art.width;
  const byHeight = surface.height / art.height;
  const factor = (fit === 'cover' ? Math.max(byWidth, byHeight) : Math.min(byWidth, byHeight)) * scale;

  const width = art.width * factor;
  const height = art.height * factor;

  return {
    width,
    height,
    left: (surface.width - width) / 2,
    top: (surface.height - height) / 2,
    cropped: width > surface.width + 0.5 || height > surface.height + 0.5,
  };
}

/* ── is the artwork good enough to print? ─────────────────────────────── */

export type Sufficiency = 'ok' | 'tight' | 'short' | 'unknown';

export interface ResolutionCheck {
  verdict: Sufficiency;
  /** What it says to the person, in their terms. Never a bare ratio. */
  message: string;
}

/**
 * Does the uploaded file carry enough pixels for the real surface?
 *
 * Returns `unknown` rather than a verdict when the placement's size has not
 * been confirmed — a warning computed from a size nobody verified is a
 * warning about nothing, and a reassurance would be worse.
 */
export function checkResolution(
  art: { width: number; height: number } | null,
  required: { width: number; height: number } | null,
): ResolutionCheck {
  if (!art || !required) {
    return { verdict: 'unknown', message: 'Artwork requirements will be confirmed with the media owner.' };
  }

  const ratio = Math.min(art.width / required.width, art.height / required.height);
  if (ratio >= 1) {
    return { verdict: 'ok', message: `Enough detail for the full ${required.width} × ${required.height}px artwork.` };
  }
  if (ratio >= 0.6) {
    return {
      verdict: 'tight',
      message: `Usable, but ${required.width} × ${required.height}px is recommended — yours is ${art.width} × ${art.height}px.`,
    };
  }
  return {
    verdict: 'short',
    message: `Too small to print at this size: ${required.width} × ${required.height}px is needed and yours is ${art.width} × ${art.height}px.`,
  };
}
