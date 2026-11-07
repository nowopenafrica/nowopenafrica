// The pattern library: twenty original vector patterns drawn in ONE palette colour.
//
// WHY STRINGS, NOT COMPONENTS: the gallery, the editor export and the canvas
// painter all draw the same SVG (the canvas painter rasterises it as an image),
// so a pattern has to be a self-contained, dependency-free string that comes
// out byte-identical every time it is asked for.
//
// OPACITY IS NOT BAKED IN. The SVG is fully opaque in its colour; the renderer
// applies `PatternSpec.opacity` (a CSS opacity, a canvas globalAlpha, a PPTX
// transparency). Keeping it out of the markup means one SVG serves every
// renderer and the "pattern under text stays <= 0.12" rule is enforced in
// exactly one place.
//
// GEOMETRY: every motif is drawn on a 100 x 100 tile and the <pattern>'s
// viewBox scales the tile (strokes included) to `scale x min(w, h)`. Motifs that
// cross a tile edge are repeated one tile over (see `wrap`) so the seams close.
// The heritage entries are our own constructions in the spirit of a tradition,
// never a copy of any particular cloth, and their names say "inspired".

import type { PatternKey, PatternSpec } from './look';

export type PatternFamily = 'heritage' | 'texture' | 'geometric' | 'playful';

export const PATTERNS: { key: PatternKey; name: string; family: PatternFamily }[] = [
  { key: 'step', name: 'Step (kente-inspired)', family: 'heritage' },
  { key: 'chevron', name: 'Chevron', family: 'heritage' },
  { key: 'resist-dots', name: 'Resist dots (adire-inspired)', family: 'heritage' },
  { key: 'mud-marks', name: 'Marks (mudcloth-inspired)', family: 'heritage' },
  { key: 'diamond-weave', name: 'Diamond weave', family: 'heritage' },
  { key: 'sun-rays', name: 'Sun rays', family: 'heritage' },
  { key: 'grain', name: 'Grain', family: 'texture' },
  { key: 'halftone', name: 'Halftone', family: 'texture' },
  { key: 'topography', name: 'Topography', family: 'texture' },
  { key: 'cross-hatch', name: 'Cross hatch', family: 'texture' },
  { key: 'grid', name: 'Grid', family: 'geometric' },
  { key: 'diagonal', name: 'Diagonal', family: 'geometric' },
  { key: 'rings', name: 'Rings', family: 'geometric' },
  { key: 'blocks', name: 'Blocks', family: 'geometric' },
  { key: 'arches', name: 'Arches', family: 'geometric' },
  { key: 'scales', name: 'Scales', family: 'geometric' },
  { key: 'dots', name: 'Dots', family: 'playful' },
  { key: 'waves', name: 'Waves', family: 'playful' },
  { key: 'confetti', name: 'Confetti', family: 'playful' },
  { key: 'squiggle', name: 'Squiggle', family: 'playful' },
];

export interface ZoneBox { x: number; y: number; w: number; h: number }

/** The rectangle of the canvas a pattern is allowed to cover. */
export function patternZoneBox(zone: PatternSpec['zone'], w: number, h: number): ZoneBox {
  const r = Math.round;
  switch (zone ?? 'full') {
    case 'top': return { x: 0, y: 0, w, h: r(h * 0.35) };
    case 'bottom': return { x: 0, y: r(h * 0.65), w, h: h - r(h * 0.65) };
    case 'left': return { x: 0, y: 0, w: r(w * 0.4), h };
    case 'right': return { x: r(w * 0.6), y: 0, w: w - r(w * 0.6), h };
    case 'band': return { x: 0, y: r(h * 0.38), w, h: r(h * 0.24) };
    default: return { x: 0, y: 0, w, h };
  }
}

// ---- helpers --------------------------------------------------------------

const n = (x: number): number => Math.round(x * 100) / 100;

/** Stroked group. */
const line = (c: string, sw: number, body: string, extra = ''): string =>
  `<g fill="none" stroke="${c}" stroke-width="${sw}"${extra}>${body}</g>`;
/** Filled group. */
const solid = (c: string, body: string): string => `<g fill="${c}">${body}</g>`;

/** The motif repeated one tile over in every direction, so edge crossings close. */
const wrap = (body: string): string => {
  let out = '';
  for (const dx of [-100, 0, 100]) {
    for (const dy of [-100, 0, 100]) {
      out += dx === 0 && dy === 0 ? body : `<g transform="translate(${dx} ${dy})">${body}</g>`;
    }
  }
  return out;
};

/** Small seeded generator (mulberry32): deterministic scatter, never Math.random. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const polar = (cx: number, cy: number, r: number, deg: number): string => {
  const a = (deg * Math.PI) / 180;
  return `${n(cx + r * Math.cos(a))} ${n(cy + r * Math.sin(a))}`;
};

const arc = (cx: number, cy: number, r: number): string =>
  `M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}`;

/** A closed, smoothed blob around (cx, cy): midpoint-quadratic through wobbly radii. */
function blob(cx: number, cy: number, R: number, wob: [number, number, number], pts = 24): string {
  const p: [number, number][] = [];
  for (let i = 0; i < pts; i++) {
    const th = (i / pts) * Math.PI * 2;
    const r = R * (1 + wob[0] * Math.sin(2 * th + wob[2]) + wob[1] * Math.sin(3 * th + 2 * wob[2]));
    p.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]);
  }
  const mid = (a: [number, number], b: [number, number]) => `${n((a[0] + b[0]) / 2)} ${n((a[1] + b[1]) / 2)}`;
  let d = `M${mid(p[pts - 1], p[0])}`;
  for (let i = 0; i < pts; i++) d += `Q${n(p[i][0])} ${n(p[i][1])} ${mid(p[i], p[(i + 1) % pts])}`;
  return `${d}Z`;
}

// ---- the twenty tiles (100 x 100 units) ----------------------------------

const TILES: Record<PatternKey, (c: string) => string> = {
  // A diagonal staircase with a fine echo line beside it.
  step: (c) => {
    const d = 'M0 100H20V80H40V60H60V40H80V20H100V0';
    return wrap(line(c, 5, `<path d="${d}"/>`, ' stroke-linejoin="miter"'))
      + wrap(line(c, 1.5, `<path d="${d}" transform="translate(-9 -9)"/>`));
  },

  // Rows of broad chevrons, overshooting the tile edge so the points meet.
  chevron: (c) => {
    const row = (y: number) => `<path d="M-10 ${y - 6}L0 ${y}L50 ${y + 30}L100 ${y}L110 ${y - 6}"/>`;
    return line(c, 4.5, row(8) + row(58), ' stroke-linejoin="miter"');
  },

  // Staggered resist dots: a large ringed dot and a small one, in alternation.
  'resist-dots': (c) =>
    solid(c, '<circle cx="25" cy="25" r="6.5"/><circle cx="75" cy="75" r="6.5"/><circle cx="75" cy="25" r="3"/><circle cx="25" cy="75" r="3"/>')
    + line(c, 1.3, '<circle cx="25" cy="25" r="12"/><circle cx="75" cy="75" r="12"/>'),

  // Bold bars, crosses, ticks and a zigzag: hand-stamped marks in a loose grid.
  'mud-marks': (c) =>
    solid(c, '<rect x="8" y="14" width="34" height="6"/><circle cx="82" cy="42" r="4"/>')
    + line(c, 5, '<path d="M62 12v22M51 23h22"/>')
    + line(c, 4, '<path d="M10 56v24M20 56v24M30 56v24"/>')
    + line(c, 3.5, '<path d="M54 80l6.5-14 6.5 14 6.5-14 6.5 14 6.5-14"/>', ' stroke-linejoin="miter"'),

  // Nested diamonds with a solid core and small diamonds at the tile corners.
  'diamond-weave': (c) =>
    line(c, 2.5, '<path d="M50 4L96 50L50 96L4 50Z"/>', ' stroke-linejoin="miter"')
    + solid(c, '<path d="M50 28L72 50L50 72L28 50Z"/>')
    + solid(c, '<path d="M0-9L9 0L0 9L-9 0ZM100-9L109 0L100 9L91 0ZM0 91L9 100L0 109L-9 100ZM100 91L109 100L100 109L91 100Z"/>'),

  // A sun: tapered rays alternating long and short around a ringed core.
  'sun-rays': (c) => {
    let d = '';
    for (let i = 0; i < 12; i++) {
      const a = i * 30;
      const long = i % 2 === 0;
      d += `M${polar(50, 50, 14, a - 6)}L${polar(50, 50, long ? 45 : 33, a)}L${polar(50, 50, 14, a + 6)}Z`;
    }
    return solid(c, `<path d="${d}"/><circle cx="50" cy="50" r="5"/>`)
      + line(c, 1.2, '<circle cx="50" cy="50" r="9"/>');
  },

  // Fine seeded speckle.
  grain: (c) => {
    const r = rng(7);
    let out = '';
    for (let i = 0; i < 70; i++) {
      out += `<circle cx="${n(2 + r() * 96)}" cy="${n(2 + r() * 96)}" r="${n(0.45 + r() * 0.7)}"/>`;
    }
    return solid(c, out);
  },

  // A dot field whose dots swell and shrink diagonally.
  halftone: (c) => {
    const radii = [1.3, 2.9, 4.6, 2.9, 1.3];
    let out = '';
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) out += `<circle cx="${10 + 20 * i}" cy="${10 + 20 * j}" r="${radii[(i + j) % 5]}"/>`;
    }
    return solid(c, out);
  },

  // Contour lines: concentric wobbly rings and a small echo in each corner.
  topography: (c) => {
    let centre = '';
    [10, 19, 28, 37].forEach((R, k) => { centre += `<path d="${blob(50, 50, R, [0.1, 0.06, k * 0.9 + 0.4])}"/>`; });
    const corner = `<path d="${blob(0, 0, 9, [0.12, 0.05, 1.2], 16)}"/><path d="${blob(0, 0, 17, [0.1, 0.06, 2.1], 16)}"/>`;
    return line(c, 1.4, centre
      + corner
      + `<g transform="translate(100 0)">${corner}</g><g transform="translate(0 100)">${corner}</g><g transform="translate(100 100)">${corner}</g>`);
  },

  // Two families of fine diagonals crossing.
  'cross-hatch': (c) =>
    line(c, 1.3, [
      'M-6 6L6-6', 'M-6 56L56-6', 'M-6 106L106-6', 'M44 106L106 44', 'M94 106L106 94',
      'M-6-6L106 106', 'M44-6L106 56', 'M94-6L106 6', 'M-6 44L56 106', 'M-6 94L6 106',
    ].map((d) => `<path d="${d}"/>`).join('')),

  // A quiet architectural grid: strong edges, a fine inner grid.
  grid: (c) =>
    line(c, 1.6, '<path d="M0 0H100M0 100H100M0 0V100M100 0V100"/>')
    + line(c, 0.8, '<path d="M0 25H100M0 50H100M0 75H100M25 0V100M50 0V100M75 0V100"/>'),

  // Alternating thick and thin 45-degree lines.
  diagonal: (c) =>
    line(c, 5, '<path d="M-6 106L106-6M-6 6L6-6M94 106L106 94"/>')
    + line(c, 1.5, '<path d="M-6 56L56-6M44 106L106 44"/>'),

  // Concentric rings with a solid core, and a ringed echo on each corner.
  rings: (c) =>
    solid(c, '<circle cx="50" cy="50" r="5"/>')
    + line(c, 2.6, '<circle cx="50" cy="50" r="15"/><circle cx="50" cy="50" r="31"/>')
    + line(c, 1.2, '<circle cx="50" cy="50" r="23"/><circle cx="50" cy="50" r="43"/>')
    + line(c, 2.6, '<circle cx="0" cy="0" r="9"/><circle cx="100" cy="0" r="9"/><circle cx="0" cy="100" r="9"/><circle cx="100" cy="100" r="9"/>'),

  // Colour-blocking: a solid, two outlines and a cluster of small squares.
  blocks: (c) =>
    solid(c, '<rect x="6" y="6" width="38" height="38" rx="3"/><rect x="56" y="56" width="15" height="15" rx="2"/><rect x="79" y="56" width="15" height="15" rx="2"/><rect x="56" y="79" width="15" height="15" rx="2"/><rect x="79" y="79" width="15" height="15" rx="2"/>')
    + line(c, 2.6, '<rect x="57" y="7" width="36" height="36" rx="3"/><rect x="7" y="57" width="36" height="36" rx="3"/>'),

  // Rainbow arches in a brick-bond layout.
  arches: (c) => {
    let d = '';
    for (const [cx, cy] of [[50, 100], [0, 50], [100, 50]]) {
      for (const r of [40, 28, 16]) d += `<path d="${arc(cx, cy, r)}"/>`;
    }
    return line(c, 3.4, d)
      + solid(c, '<path d="M44 100A6 6 0 0 1 56 100Z"/><path d="M-6 50A6 6 0 0 1 6 50Z"/><path d="M94 50A6 6 0 0 1 106 50Z"/>');
  },

  // Interlocking fish scales, each with a fine inner arc.
  scales: (c) => {
    const rows: [number, number[]][] = [[0, [0, 50, 100]], [25, [25, 75]], [50, [0, 50, 100]], [75, [25, 75]]];
    let outer = '';
    let inner = '';
    for (const [cy, xs] of rows) {
      for (const cx of xs) {
        outer += `<path d="M${cx - 25} ${cy}A25 25 0 0 0 ${cx + 25} ${cy}"/>`;
        inner += `<path d="M${cx - 15} ${cy}A15 15 0 0 0 ${cx + 15} ${cy}"/>`;
      }
    }
    return line(c, 2, outer) + line(c, 1, inner);
  },

  // Staggered dots, evenly packed.
  dots: (c) =>
    solid(c, '<circle cx="25" cy="25" r="5.5"/><circle cx="75" cy="25" r="5.5"/><circle cx="0" cy="75" r="5.5"/><circle cx="50" cy="75" r="5.5"/><circle cx="100" cy="75" r="5.5"/>'),

  // Smooth sine rows in parallel.
  waves: (c) => {
    const w = (y: number) => `<path d="M0 ${y + 25}C12.5 ${y + 5} 37.5 ${y + 5} 50 ${y + 25}S87.5 ${y + 45} 100 ${y + 25}"/>`;
    return line(c, 2.6, [-25, 0, 25, 50, 75].map(w).join(''), ' stroke-linecap="round"');
  },

  // Seeded scatter of little bars, dots and triangles, one per jittered cell.
  confetti: (c) => {
    const r = rng(23);
    let out = '';
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = n(12.5 + 25 * i + (r() - 0.5) * 12);
        const y = n(12.5 + 25 * j + (r() - 0.5) * 12);
        const rot = Math.round(r() * 180);
        const kind = (i * 4 + j) % 3;
        if (kind === 0) out += `<rect x="-4.5" y="-1.4" width="9" height="2.8" rx="1.4" transform="translate(${x} ${y}) rotate(${rot})"/>`;
        else if (kind === 1) out += `<circle cx="${x}" cy="${y}" r="2.4"/>`;
        else out += `<path d="M0-3.6L3.4 2.6H-3.4Z" transform="translate(${x} ${y}) rotate(${rot})"/>`;
      }
    }
    return solid(c, out);
  },

  // Playful wavy lines in two rows, set half a wave apart.
  squiggle: (c) => {
    const seg = (x: number, y: number, count: number) => `M${x} ${y}q6.25-12 12.5 0${'t12.5 0'.repeat(count - 1)}`;
    return line(c, 3, `<path d="${seg(0, 22, 8)}"/><path d="${seg(-12.5, 72, 9)}"/>`, ' stroke-linecap="round" stroke-linejoin="round"');
  },
};

const safe = (s: string): string => s.replace(/[^A-Za-z0-9#(),.%\s-]/g, '');

/**
 * A complete, self-contained SVG: the canvas-sized rectangle of `zone`, filled
 * with the tile. Colour only: opacity is the renderer's job (see the header).
 */
export function patternSvg(spec: PatternSpec, w: number, h: number, colour: string): string {
  const c = safe(colour);
  const tile = Math.max(8, n(spec.scale * Math.min(w, h)));
  const id = `lp-${spec.key}-${String(tile).replace('.', '_')}-${c.replace(/[^A-Za-z0-9]/g, '')}`;
  const z = patternZoneBox(spec.zone, w, h);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<defs><pattern id="${id}" width="${tile}" height="${tile}" viewBox="0 0 100 100" patternUnits="userSpaceOnUse">`
    + TILES[spec.key](c)
    + '</pattern></defs>'
    + `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="url(#${id})"/>`
    + '</svg>'
  );
}
