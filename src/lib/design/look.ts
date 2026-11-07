// The Look model: palette + gradient + pattern + type, chosen together, and ONE
// resolver every renderer calls.
//
// WHY ONE RESOLVER: the DOM painter, the canvas painter and the PPTX exporter
// each used to work out their own colours. A preview that differs from the
// export is the most damaging bug a design tool can have, so they all ask here.
//
// A template WITHOUT a `look` takes the fallback path, which reproduces today's
// colours exactly: callers have already run styleColours/applyStyle, so the
// accent and base they hand us are taken as given.

import {
  hexAlpha,
  inkFor,
  surfaceSpecLayers,
  type DesignTemplate,
  type SurfaceLayer,
} from '../designTemplates';
import { styleOf } from './styles';
import { TYPE_PAIRINGS, pairingOf, type TypePairing } from './typefaces';
import { paletteOf, readableInk, type Palette, type PaletteRole } from './palettes';
import { patternSvg } from './patterns';

export interface GradientSpec {
  kind: 'linear' | 'radial' | 'mesh';
  /** 2 to 4 palette roles, in order. */
  stops: PaletteRole[];
  angle?: number;
}

/** Drawn by patterns.ts; the union lives here so a Look can name them. */
export type PatternKey =
  | 'step' | 'chevron' | 'resist-dots' | 'mud-marks' | 'diamond-weave' | 'sun-rays'
  | 'grain' | 'dots' | 'halftone' | 'grid' | 'waves' | 'topography' | 'diagonal'
  | 'rings' | 'confetti' | 'squiggle' | 'blocks' | 'arches' | 'cross-hatch' | 'scales';

export interface PatternSpec {
  key: PatternKey;
  role: PaletteRole;
  opacity: number;
  scale: number;
  zone?: 'full' | 'top' | 'bottom' | 'left' | 'right' | 'band';
}

export interface Look {
  /** A PALETTES key. */
  palette: string;
  gradient?: GradientSpec;
  pattern?: PatternSpec;
  duotone?: [PaletteRole, PaletteRole];
  /** A TYPE_PAIRINGS key. */
  type: string;
  headlineGradient?: boolean;
}

export type LookPart = 'palette' | 'gradient' | 'pattern' | 'type';

export interface ResolvedLook {
  roles: Record<PaletteRole, string>;
  /** The text colour that reads on each role. */
  inkOn: Record<PaletteRole, string>;
  groundLayers: SurfaceLayer[];
  pattern: { svg: string; opacity: number; zone: PatternSpec['zone'] } | null;
  duotone: [string, string] | null;
  pairing: TypePairing;
  headlineGradient: string | null;
  scheme: 'dark' | 'light';
  source: 'look' | 'fallback';
}

export interface ResolveOptions {
  override?: Partial<Look>;
  brandPalette?: Palette;
  accent: string;
  base?: string;
  styleKey?: string;
  width: number;
  height: number;
}

const ROLES: PaletteRole[] = ['ground', 'ink', 'primary', 'secondary', 'highlight'];

const inkTable = (roles: Record<PaletteRole, string>): Record<PaletteRole, string> =>
  Object.fromEntries(ROLES.map((r) => [r, readableInk(roles[r])])) as Record<PaletteRole, string>;

/**
 * Duotone as ONE feColorMatrix: each output channel is dark + luma x (light -
 * dark), using Rec. 709 luma weights. A single primitive rather than a
 * greyscale-then-componentTransfer chain, so there is less for a rasteriser to
 * get wrong. Filtered in sRGB so the two endpoints land on the palette hexes
 * exactly instead of being shifted by linear-light interpolation. Shared by
 * TemplateSurface and the editor's DesignSurface, so the two draw one photo.
 */
export function duotoneMatrix(dark: string, light: string): string {
  const ch = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const d = ch(dark);
  const l = ch(light);
  const f = (x: number) => x.toFixed(4);
  const rows = [0, 1, 2].map((c) => {
    const span = l[c] - d[c];
    return [span * 0.2126, span * 0.7152, span * 0.0722, 0, d[c]].map(f).join(' ');
  });
  return `${rows.join(' ')} 0 0 0 1 0`;
}

/** CSS for a gradient spec, using resolved role colours. */
export function gradientCss(g: GradientSpec, roles: Record<PaletteRole, string>): string {
  const colours = g.stops.map((r) => roles[r]);
  if (g.kind === 'linear') return `linear-gradient(${g.angle ?? 180}deg, ${colours.join(', ')})`;
  return `radial-gradient(circle at 30% 20%, ${colours.join(', ')})`;
}

/**
 * A gradient spec as the structured layers both painters already understand.
 * Mesh is a flat first-stop ground with a soft light of each later stop in a
 * different corner.
 */
function gradientLayers(g: GradientSpec, roles: Record<PaletteRole, string>): SurfaceLayer[] {
  const colours = g.stops.map((r) => roles[r]);
  const even = (cs: string[]) =>
    cs.map((color, i) => ({ at: cs.length === 1 ? 0 : i / (cs.length - 1), color }));
  if (g.kind === 'linear') return [{ kind: 'linear', angle: g.angle ?? 180, stops: even(colours) }];
  if (g.kind === 'radial') {
    return [{ kind: 'radial', cx: 0.3, cy: 0.2, r: 1.1, stops: even(colours) }];
  }
  const corners: [number, number][] = [[0.15, 0.15], [0.9, 0.2], [0.8, 0.95], [0.1, 0.85]];
  const layers: SurfaceLayer[] = [
    { kind: 'linear', angle: 180, stops: even([colours[0], colours[0]]) },
  ];
  colours.slice(1).forEach((c, i) => {
    const [cx, cy] = corners[i % corners.length];
    layers.push({
      kind: 'radial', cx, cy, r: 0.75,
      stops: [{ at: 0, color: hexAlpha(c, 0.9) }, { at: 1, color: hexAlpha(c, 0) }],
    });
  });
  return layers;
}

export function resolveLook(tpl: DesignTemplate, opts: ResolveOptions): ResolvedLook {
  // An explicit `undefined` in the override must not clobber a template field.
  const override = Object.fromEntries(
    Object.entries(opts.override ?? {}).filter(([, v]) => v !== undefined),
  ) as Partial<Look>;
  const look: Look | undefined = tpl.look ? { ...tpl.look, ...override } : undefined;
  const palette = opts.brandPalette ?? paletteOf(look?.palette);

  if (!look || !palette) {
    // Today's path. A look that names a palette that does not exist lands here
    // too: a stale key must degrade to the old design, never to a blank one.
    const ground = opts.base ?? (tpl.scheme === 'dark' ? '#0b1220' : '#f7f7f5');
    const ink = inkFor(tpl);
    const roles: Record<PaletteRole, string> = {
      ground, ink, primary: opts.accent, secondary: opts.accent, highlight: opts.accent,
    };
    const inkOn = inkTable(roles);
    // Today's text colour on the ground is the template's own, not a re-measure.
    inkOn.ground = ink;
    return {
      roles,
      inkOn,
      groundLayers: surfaceSpecLayers(tpl, opts.accent, ground),
      pattern: null,
      duotone: null,
      pairing: opts.styleKey ? pairingOf(styleOf(opts.styleKey).pairing) : pairingOf('modern'),
      headlineGradient: null,
      scheme: tpl.scheme,
      source: 'fallback',
    };
  }

  const roles: Record<PaletteRole, string> = { ...palette.colours };
  const pairing = TYPE_PAIRINGS.find((p) => p.key === look.type) ?? pairingOf('modern');
  // Text on the ground uses the palette's own designed ink: palettes.test holds
  // it to 4.5:1 there, and it carries the palette's tint where a measured
  // white/near-black would not. Every other role is measured.
  const inkOn = inkTable(roles);
  inkOn.ground = roles.ink;
  return {
    roles,
    inkOn,
    groundLayers: look.gradient
      ? gradientLayers(look.gradient, roles)
      : [{ kind: 'linear', angle: 180, stops: [{ at: 0, color: roles.ground }, { at: 1, color: roles.ground }] }],
    pattern: look.pattern
      ? {
          svg: patternSvg(look.pattern, opts.width, opts.height, roles[look.pattern.role]),
          opacity: look.pattern.opacity,
          zone: look.pattern.zone ?? 'full',
        }
      : null,
    duotone: look.duotone ? [roles[look.duotone[0]], roles[look.duotone[1]]] : null,
    pairing,
    headlineGradient: look.headlineGradient
      ? gradientCss({ kind: 'linear', stops: ['primary', 'secondary'], angle: 90 }, roles)
      : null,
    scheme: palette.scheme,
    source: 'look',
  };
}
