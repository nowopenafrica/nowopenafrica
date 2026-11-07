/**
 * Brand palettes and Remix: the two ways a Look is made from something other
 * than a hand-written template.
 *
 * brandPalette() turns ONE colour the customer typed into a full five-role
 * palette; remixLook() reshuffles a Look's parts from the curated libraries.
 * Both are held to the readability rule palettes.ts holds the curated sets to,
 * because the contrast suite runs their output across every template.
 *
 * The rule, in one place (`roleReadable`): on every TEXT_ROLES colour the
 * better of white / near-black must reach 4.5:1, except primary and highlight,
 * which may sit at 3:1 and are then display-only.
 *
 * TEXT NEEDS. The rule above only guarantees that INK can sit on a colour, not
 * that the colour is visible on the ground it is set against. A template whose
 * eyebrow is `tone: 'accent'` sets primary text on the ground, and on a pastel
 * palette that is 1.9:1. `textNeeds(template)` lists the pairs a template
 * really sets text on; remixLook() and brandPalette() take that list and
 * refuse (or nudge) any palette that would fail it. A caller that passes none
 * gets the original behaviour.
 *
 * No hex literals live here (they belong in palettes.ts): every colour is
 * computed from the one the caller supplied.
 */
import {
  PALETTES, TEXT_ROLES, displayOnlyRoles, paletteOf, readableInk,
  type Palette, type PaletteRole,
} from './palettes';
import type { GradientSpec, Look, LookPart, PatternSpec } from './look';
import {
  isListRole, lineHeightFor, shapeGeometry, slotBox, typePx,
  type DesignTemplate, type ShapeSpec, type SlotSpec,
} from '../designTemplates';
import { PATTERNS } from './patterns';
import { contrastRatio, normaliseHex, relativeLuminance, shade, tint, towardLuma } from './styles';
import { TYPE_PAIRINGS } from './typefaces';

export type Harmony = 'analogous' | 'complementary' | 'split';

/* ---- colour plumbing ------------------------------------------------------ */

// normaliseHex() quietly falls back to a default brand for junk, which is right
// for rendering and wrong here: "red" must be REFUSED, not turned into blue.
const STRICT_HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

const toHsl = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
};

const fromHsl = (h: number, s: number, l: number): string => {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x]
      : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
};

const readableRatio = (hex: string): number => contrastRatio(readableInk(hex), hex);

/** The Task 1 rule for a single text role. */
const roleReadable = (role: PaletteRole, hex: string): boolean => {
  const r = readableRatio(hex);
  return r >= 4.5 || ((role === 'primary' || role === 'highlight') && r >= 3);
};

const textRolesReadable = (colours: Record<PaletteRole, string>): boolean =>
  TEXT_ROLES.every((role) => roleReadable(role, colours[role]));

/**
 * Push a colour away from the mid-tones, where neither white nor near-black
 * reads, until `ok` passes. Steps of 0.04, at most 12. The direction is the one
 * the better ink already points: white is winning -> go darker, which only
 * helps it. Returns null when it never gets there, so the caller can fall back
 * to a tint of the ground.
 */
function nudge(hex: string, ok: (c: string) => boolean): string | null {
  if (ok(hex)) return hex;
  const whiteWins = readableInk(hex) === readableInk(shade(hex, 1));
  let out = hex;
  for (let i = 0; i < 12; i += 1) {
    out = whiteWins ? shade(out, 0.04) : tint(out, 0.04);
    if (ok(out)) return out;
  }
  return null;
}

/* ---- text needs ----------------------------------------------------------- */

/**
 * The colour a piece of text is set in: a palette role (`ink` is the palette's
 * own ink, what a plain slot on the ground uses) or `ink-on:<role>`, the
 * white / near-black measured for text set ON that role.
 */
export type TextFg = PaletteRole | `ink-on:${PaletteRole}`;

/**
 * One pair a template sets text on. `bgs` are the roles that can be beneath
 * the words (the ground, plus any gradient stops, are expanded at check time).
 * `min` is 4.5 for body and 3 for display type. `alpha`, when below 1, is the
 * opacity every renderer draws the words at (muted 0.72, a stat's label 0.7):
 * the colour is composited over each background before it is measured, since a
 * line drawn at 0.72 is not the line its full ink would be.
 */
export interface TextNeed { fg: TextFg; bgs: PaletteRole[]; min: number; alpha?: number }

/** The alpha TemplateSurface, drawTemplate and the editor draw a muted slot at. */
export const MUTED_ALPHA = 0.72;
/** The alpha a stat's label is drawn at. */
export const STAT_LABEL_ALPHA = 0.7;

const channels = (hex: string): number[] => {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** `top` painted at `alpha` over the opaque `under`: what the eye actually sees. */
export function compositeOver(top: string, under: string, alpha: number): string {
  const a = channels(top);
  const b = channels(under);
  return `#${[0, 1, 2].map((i) => Math.round(a[i] * alpha + b[i] * (1 - alpha))
    .toString(16).padStart(2, '0')).join('')}`;
}

const colourOfFg = (colours: Record<PaletteRole, string>, fg: TextFg): string =>
  fg.startsWith('ink-on:')
    ? readableInk(colours[fg.slice(7) as PaletteRole])
    : colours[fg as PaletteRole];

/** The colour a need's words show as over `bg`, translucency included. */
const shownFg = (colours: Record<PaletteRole, string>, n: TextNeed, bg: string): string => {
  const fg = colourOfFg(colours, n.fg);
  return n.alpha !== undefined && n.alpha < 1 ? compositeOver(fg, bg, n.alpha) : fg;
};

// The formats designTemplates.test.ts holds every template to. Geometry that
// depends on the short edge (a circle's radius) can put a shape under a slot at
// one format and not another, so needs are gathered at all of them.
const NEED_FORMATS: [number, number][] = [
  [1080, 1080], [1080, 1920], [1920, 1080], [2480, 3508], [240, 240],
];

/** The palette role a shape paints in, when it paints in one. */
const shapeRole = (shape: ShapeSpec): PaletteRole | null => {
  switch (shape.tone) {
    case 'accent': case 'primary': return 'primary';
    case 'secondary': case 'highlight': case 'ink': return shape.tone;
    case 'base': return 'ground';
    default: return null; // white / black are literal colours, not roles
  }
};

const isOpaque = (shape: ShapeSpec): boolean =>
  shape.kind !== 'ring' && (shape.alpha ?? 1) >= 0.85;

function insidePolygon(x: number, y: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Roles painted at (x, y) by the topmost opaque shape there; the ground if none. */
function rolesAt(shapes: ShapeSpec[], x: number, y: number, w: number, h: number): PaletteRole[] {
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    const shape = shapes[i];
    if (!isOpaque(shape)) continue;
    const g = shapeGeometry(shape, w, h);
    const hit =
      g.kind === 'polygon' ? insidePolygon(x, y, g.points)
      : g.kind === 'circle' ? (x - g.cx) ** 2 + (y - g.cy) ** 2 <= g.r ** 2
      : g.kind === 'rect' ? x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h
      : false;
    if (!hit) continue;
    const fill = (shape.kind === 'rect' || shape.kind === 'circle') ? shape.fill : undefined;
    if (fill) return [...fill.stops];
    const role = shapeRole(shape);
    return role ? [role] : [];
  }
  return ['ground'];
}

/**
 * What a text slot looks like to the contrast checks: the box its words can
 * occupy and the lines of colour set in it. A list slot is a row of cells, each
 * a big value over a small label; every other slot is measured as ONE line,
 * which is where a headline starts and the part that is always drawn.
 */
export interface TextSlotBox { x: number; y: number; w: number; h: number }

export function textSlotBox(slot: SlotSpec, w: number, h: number): TextSlotBox {
  const box = slotBox(slot, w, h);
  const px = typePx(slot.size, w, h);
  const rowBased = isListRole(slot.role);
  const height = rowBased ? px * 3.1 : px * lineHeightFor(slot.size);
  // fromBottom measures the text's BOTTOM edge from the foot of the canvas.
  const top = slot.fromBottom ? box.top - height : box.top;
  return { x: box.left, y: top, w: box.width, h: height };
}

/** Nine samples across a box, so a shape clipping its corner is still noticed. */
export function sampleBox(b: TextSlotBox): [number, number][] {
  const pts: [number, number][] = [];
  for (const fy of [0.15, 0.5, 0.85]) for (const fx of [0.1, 0.5, 0.9]) pts.push([b.x + b.w * fx, b.y + b.h * fy]);
  return pts;
}

const toneRoleOf = (tone: SlotSpec['tone']): PaletteRole | null =>
  tone === 'accent' || tone === 'primary' ? 'primary'
    : tone === 'secondary' || tone === 'highlight' ? tone : null;

/**
 * Every (colour, beneath, minimum) a LOOKED template sets text on, at every
 * format. Mirrors what TemplateSurface draws: a role-toned slot is that role's
 * colour, a plain or muted one is the ink for the role it says it sits `on`
 * (muted is that ink at 0.72 alpha, and carries the alpha so it is measured
 * as drawn), a stat's value takes the slot's role or primary (the muted ink on
 * a muted stat) over a label in the ink at 0.7, and a price's value is always
 * the slot's role or primary.
 */
export function textNeeds(tpl: DesignTemplate): TextNeed[] {
  if (!tpl.look) return [];
  const found = new Map<string, TextNeed>();
  const add = (fg: TextFg, bgs: PaletteRole[], min: number, alpha?: number) => {
    if (bgs.length === 0) return;
    const key = `${fg}|${alpha ?? 1}|${[...bgs].sort().join(',')}`;
    const had = found.get(key);
    if (!had || had.min < min) found.set(key, { fg, bgs: [...bgs], min, ...(alpha !== undefined ? { alpha } : {}) });
  };

  for (const [w, h] of NEED_FORMATS) {
    for (const slot of tpl.slots) {
      if (slot.role === 'qr') continue;
      const onRole = slot.on ?? 'ground';
      const plain: TextFg = onRole === 'ground' ? 'ink' : `ink-on:${onRole}`;
      const toned = toneRoleOf(slot.tone);
      const bgs = new Set<PaletteRole>();
      for (const [x, y] of sampleBox(textSlotBox(slot, w, h))) {
        for (const r of rolesAt(tpl.shapes ?? [], x, y, w, h)) bgs.add(r);
      }
      const size = slot.size ?? 0.05;
      const body = size >= 0.06 ? 3 : 4.5;
      const muted = !toned && slot.tone === 'muted' ? MUTED_ALPHA : undefined;
      if (isListRole(slot.role)) {
        if (slot.role === 'stats') {
          const valueMin = size * 1.55 >= 0.06 ? 3 : 4.5;
          if (muted) add(plain, [...bgs], valueMin, muted);
          else add(toned ?? 'primary', [...bgs], valueMin);
          add(plain, [...bgs], 4.5, STAT_LABEL_ALPHA);
        } else {
          add(toned ?? plain, [...bgs], body, muted);
          // A price's value is the slot's role or primary in every renderer, never muted.
          if (slot.role === 'price') add(toned ?? 'primary', [...bgs], body);
        }
      } else if (slot.treatment === 'disc' && toned) {
        add(`ink-on:${toned}`, [toned], body);
      } else {
        add(toned ?? plain, [...bgs], body, muted);
      }
    }
  }
  return [...found.values()];
}

/** Ground roles, expanded with the gradient stops the ground is painted from. */
const withGroundStops = (bgs: PaletteRole[], stops: readonly PaletteRole[]): PaletteRole[] =>
  bgs.includes('ground') ? [...new Set([...bgs, ...stops])] : bgs;

/** Does this colour set satisfy every need, given the gradient under the ground? */
export function needsMet(
  colours: Record<PaletteRole, string>,
  needs: readonly TextNeed[] | undefined,
  gradientStops: readonly PaletteRole[] = [],
): boolean {
  return (needs ?? []).every((n) =>
    withGroundStops(n.bgs, gradientStops).every(
      (bg) => contrastRatio(shownFg(colours, n, colours[bg]), colours[bg]) >= n.min,
    ));
}

/**
 * Can this palette carry this template's words? Every text need met under the
 * ground's gradient stops, and no body-size slot set ON (or as a disc of) a
 * role the palette only reaches 3:1 on. The check the contrast suite holds the
 * shipped looks to, for the doors a look can arrive through untested: an
 * upload, a stored row, a pasted link.
 */
export function paletteCarries(
  tpl: DesignTemplate,
  palette: Palette,
  gradientStops: readonly PaletteRole[] = [],
): boolean {
  if (!needsMet(palette.colours, textNeeds(tpl), gradientStops)) return false;
  const displayOnly = new Set<PaletteRole>(displayOnlyRoles(palette));
  if (displayOnly.size === 0) return true;
  return tpl.slots.every((slot) => {
    if (slot.role === 'qr' || (slot.size ?? 0.05) >= 0.06) return true;
    const toned = toneRoleOf(slot.tone);
    return !displayOnly.has(slot.on ?? 'ground')
      && !(slot.treatment === 'disc' && toned && displayOnly.has(toned));
  });
}

/**
 * Like nudge(), but steered by the GROUND rather than by the colour's own ink:
 * first away from the ground (the way a colour has to travel to be SEEN on it),
 * then toward it (the way a gradient stop has to travel to carry ink). Longer
 * (25 steps) because it may have to cross the whole range.
 */
function nudgeByGround(hex: string, ground: string, ok: (c: string) => boolean): string | null {
  const groundIsDark = relativeLuminance(ground) < 0.18; // 0.18: white and black read equally
  for (const lighter of [groundIsDark, !groundIsDark]) {
    let out = hex;
    for (let i = 0; i < 25; i += 1) {
      out = lighter ? tint(out, 0.04) : shade(out, 0.04);
      if (ok(out)) return out;
    }
  }
  return null;
}

/* ---- brand palette -------------------------------------------------------- */

// [secondary, highlight] hue offsets from the brand hue.
const HARMONY_OFFSETS: Record<Harmony, [number, number]> = {
  analogous: [30, -30],
  complementary: [180, 210],
  split: [150, 210],
};

export function brandPalette(input: {
  primary: string;
  secondary?: string;
  harmony?: Harmony;
  scheme: 'dark' | 'light';
  /** From textNeeds(template): pairs this palette must keep readable. */
  needs?: readonly TextNeed[];
  /** The ground gradient's stops the template will paint, so needs on the ground cover them. */
  gradientStops?: readonly PaletteRole[];
}): Palette | null {
  if (!STRICT_HEX.test((input.primary ?? '').trim())) return null;
  const brand = normaliseHex(input.primary);
  const secondaryIn = input.secondary && STRICT_HEX.test(input.secondary.trim())
    ? normaliseHex(input.secondary) : null;
  const { scheme } = input;
  const harmony = input.harmony ?? 'analogous';

  // The ground carries the brand's hue at a fixed, extreme luminance, so the
  // whole palette feels like the brand without the brand colour ever being
  // asked to be a background.
  const ground = towardLuma(brand, scheme === 'dark' ? 0.06 : 0.8);
  const inkCandidate = scheme === 'dark' ? tint(ground, 0.9) : shade(ground, 0.88);
  const ink = contrastRatio(inkCandidate, ground) >= 7 ? inkCandidate : readableInk(ground);
  // Last resort for a role that cannot be nudged into readability: a tint of
  // the ground itself, which is readable by construction.
  const groundTint = scheme === 'dark' ? tint(ground, 0.3) : shade(ground, 0.3);

  const [h, s] = toHsl(brand);
  const grey = s < 0.08; // keep greys grey: a black brand should not sprout a red accent
  const sat = grey ? 0 : Math.min(0.9, Math.max(0.45, s));
  const [secOff, hiOff] = HARMONY_OFFSETS[harmony];
  const lSecondary = scheme === 'dark' ? 0.62 : 0.38;
  const lHighlight = scheme === 'dark' ? 0.72 : 0.45;

  const needs = input.needs ?? [];
  const stops = input.gradientStops ?? [];
  const settle = (role: PaletteRole, hex: string): string =>
    nudge(hex, (c) => roleReadable(role, c)) ?? groundTint;

  // A need involves a role when its text IS that role, sits ON it, or is set
  // on the ground and the role is one of the gradient stops under the ground.
  const involving = (role: PaletteRole): TextNeed[] =>
    needs.filter((n) =>
      n.fg === role || n.fg === `ink-on:${role}`
      || withGroundStops(n.bgs, stops).includes(role));
  const colours: Record<PaletteRole, string> = {
    ground,
    ink,
    primary: settle('primary', brand),
    secondary: settle('secondary', secondaryIn ?? fromHsl(h + secOff, sat, lSecondary)),
    highlight: settle('highlight', fromHsl(h + hiOff, sat, lHighlight)),
  };
  // Only when a template asks. A role that already meets its needs is left
  // alone, so the customer's own colour survives wherever it can carry type.
  for (const role of ['primary', 'secondary', 'highlight'] as PaletteRole[]) {
    const mine = involving(role);
    if (mine.length === 0) continue;
    const ok = (c: string) =>
      roleReadable(role, c) && needsMet({ ...colours, [role]: c }, mine, stops);
    if (ok(colours[role])) continue;
    colours[role] = nudgeByGround(colours[role], ground, ok) ?? colours[role];
  }
  // Roles can pin each other: a primary that must be light to be seen on a dark
  // ground cannot also be dark enough for the white ink a ribbon painted from
  // it and a dark secondary calls for. When one-at-a-time failed, walk every
  // involved role away from the ground together.
  if (needs.length > 0 && !needsMet(colours, needs, stops)) {
    const involved = (['primary', 'secondary', 'highlight'] as PaletteRole[])
      .filter((role) => involving(role).length > 0);
    const lighter = relativeLuminance(ground) < 0.18;
    for (let step = 1; step <= 25; step += 1) {
      const trial = { ...colours };
      for (const role of involved) {
        trial[role] = lighter ? tint(colours[role], 0.04 * step) : shade(colours[role], 0.04 * step);
      }
      if (involved.every((role) => roleReadable(role, trial[role])) && needsMet(trial, needs, stops)) {
        Object.assign(colours, trial);
        break;
      }
    }
  }

  return {
    // The key says whether the colours were steered by a template's needs, so
    // two palettes with different colours never share one.
    key: `brand-${brand.slice(1)}-${harmony}-${scheme}${needs.length > 0 ? '-t' : ''}`,
    name: 'Your brand',
    family: grey ? 'mono' : 'bold',
    scheme,
    colours,
  };
}

/* ---- remix ---------------------------------------------------------------- */

/** FNV-1a: a stable 32-bit hash of a string. */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32, the generator patterns.ts uses. */
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

const pickFrom = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

/**
 * Each part draws from its OWN stream (seed mixed with the part's name), so
 * locking one part never changes what another part becomes for the same seed:
 * pressing Remix with "type" locked gives the same palette as without.
 */
const streamFor = (seed: number, part: LookPart): (() => number) => rng((seed ^ seedFrom(part)) >>> 0);

/**
 * `stops` are the ground gradient this palette will be painted under (the base
 * look's own, when the gradient is locked). Filtering the pool rather than
 * drawing until one passes: with a template's needs applied only a handful of
 * light palettes qualify, and twenty random draws could miss all of them.
 */
function remixPalette(
  base: Look, r: () => number, scheme: 'dark' | 'light',
  needs: readonly TextNeed[] | undefined, stops: readonly PaletteRole[],
): string {
  const pool = PALETTES.filter((p) =>
    p.scheme === scheme
    && textRolesReadable(p.colours)
    && stops.every((role) => contrastRatio(p.colours.ink, p.colours[role]) >= 4.5)
    && needsMet(p.colours, needs, stops));
  return pool.length > 0 ? pickFrom(r, pool).key : base.palette;
}

function remixGradient(
  base: Look, palette: Palette | null, r: () => number, needs?: readonly TextNeed[],
): GradientSpec | undefined {
  // Without a palette to measure against we cannot promise readable ground
  // layers, so keep what the template had.
  if (!palette) return base.gradient;
  if (r() < 0.3) return undefined;
  // A gradient is painted BEHIND the type, so every stop must still carry the
  // palette's ink, and every role-coloured word the template sets on the ground
  // too. Roles that cannot are not offered.
  const usable = (['secondary', 'primary', 'highlight'] as PaletteRole[])
    .filter((role) => contrastRatio(palette.colours.ink, palette.colours[role]) >= 4.5
      && needsMet(palette.colours, needs, [role]));
  if (usable.length === 0) return undefined;
  const kind = pickFrom(r, ['linear', 'radial', 'mesh'] as const);
  const count = Math.min(usable.length, 1 + Math.floor(r() * 3));
  const chosen = [...usable].sort(() => r() - 0.5).slice(0, count);
  const spec: GradientSpec = { kind, stops: ['ground', ...chosen] };
  if (kind === 'linear') spec.angle = pickFrom(r, [135, 160, 180, 200, 225]);
  return spec;
}

function remixPattern(r: () => number): PatternSpec | undefined {
  if (r() < 0.35) return undefined;
  const key = pickFrom(r, PATTERNS).key;
  // Never `ground`: a ground-coloured pattern on the ground is invisible.
  const role = pickFrom(r, ['primary', 'secondary', 'highlight', 'ink'] as PaletteRole[]);
  // 0.04 to 0.12: patterns sit behind text, and 0.12 is the ceiling.
  const opacity = Math.round((0.04 + r() * 0.08) * 100) / 100;
  const scale = Math.round((0.06 + r() * 0.14) * 100) / 100;
  return { key, role, opacity, scale };
}

export function remixLook(
  base: Look,
  seed: number,
  locks: ReadonlySet<LookPart>,
  scheme: 'dark' | 'light',
  /** From textNeeds(template). Without it a remix only promises the Task 1 rule. */
  needs?: readonly TextNeed[],
): Look {
  const out: Look = { ...base };

  if (!locks.has('palette')) {
    const keptStops = locks.has('gradient') ? (base.gradient?.stops ?? []) : [];
    out.palette = remixPalette(base, streamFor(seed, 'palette'), scheme, needs, keptStops);
  }

  if (!locks.has('gradient')) {
    const g = remixGradient(base, paletteOf(out.palette), streamFor(seed, 'gradient'), needs);
    if (g) out.gradient = g; else delete out.gradient;
  }

  if (!locks.has('pattern')) {
    const p = remixPattern(streamFor(seed, 'pattern'));
    if (p) out.pattern = p; else delete out.pattern;
  }

  if (!locks.has('type')) out.type = pickFrom(streamFor(seed, 'type'), TYPE_PAIRINGS).key;

  return out;
}
