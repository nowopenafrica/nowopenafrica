/**
 * The surface, the geometry and the colours — carried into the editor.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────
 *
 * `documentFromTemplate` converted six text roles and nothing else. Not the
 * surface, not a single shape, not the style's colours, not even a slot's
 * alignment or its tone. So a design that appeared on the gallery as a dark
 * gradient with an accent wedge and white type opened in the Studio as black
 * text on a white page.
 *
 * That is the worst possible place for a gap, because it sits exactly where
 * somebody has just decided they like something: they press Customise and the
 * thing they chose is gone.
 *
 * ── WHY NOTHING HERE IS NEW MATHS ────────────────────────────────────────
 *
 * `surfaceLayers()` and `shapeGeometry()` in designTemplates.ts already exist
 * and are already shared by the DOM renderer and the canvas painter, with a
 * comment saying so. A third implementation would be a third thing to keep in
 * step. Everything below calls them and converts their output into document
 * objects.
 *
 * ── THE ONE THING THAT COULD NOT BE CARRIED ──────────────────────────────
 *
 * The document model draws rectangles, ellipses and lines. A wedge, a skewed
 * panel and a rotated stripe are polygons. Rather than drop them — which is
 * what losing the diagonal out of "Diagonal Cut" would mean — the model gains
 * a `polygon` shape, which the renderer draws with `clip-path`. That is the
 * same mechanism TemplateSurface already uses, so the two agree by
 * construction.
 */

import {
  applyStyle, styleColours, styleOf,
} from '../design/styles';
import {
  inkFor, shapeColor, shapeGeometry, surfaceLayers,
  type DesignTemplate, type SlotSpec,
} from '../designTemplates';
import type { ShapeObject } from './designDocument';
import { objectId } from './designDocument';

export interface Dressing {
  /** The styled template — fonts and tones resolved. Use THIS for the slots. */
  template: DesignTemplate;
  /** A CSS background value for the page. */
  background: string;
  /** The decorative geometry, in paint order, beneath the type. */
  shapes: ShapeObject[];
  base: string;
  accent: string;
  ink: string;
}

/** The ground a scheme sits on, matching TemplateSurface's own default. */
const groundFor = (scheme: string): string => (scheme === 'dark' ? '#0b1220' : '#f7f7f5');

/**
 * Dress a template: resolve its style, its surface and its shapes.
 *
 * `width` and `height` are the real page size because shape geometry is not
 * separable into x and y — a circle's radius is a fraction of the SHORT edge,
 * so on a 1080×1350 page it covers a different share of each axis. Resolving
 * in pixels and normalising afterwards keeps the circle round.
 */
export function dressTemplate(
  template: DesignTemplate,
  opts: { width: number; height: number; styleKey?: string; accent?: string },
): Dressing {
  const accent = opts.accent ?? '#4f46e5';
  const style = opts.styleKey ? styleOf(opts.styleKey) : null;
  const styled = style ? applyStyle(template, style) : template;

  const colours = style
    ? styleColours(style, accent, styled.scheme === 'dark' ? 'dark' : 'light')
    : { base: groundFor(styled.scheme), accent, ink: inkFor(styled) };

  const base = colours.base || groundFor(styled.scheme);
  const ink = colours.ink || inkFor(styled);

  /*
   * Layers are listed back-to-front by surfaceLayers, which is also the order
   * CSS paints a comma-separated `background` — first value on top. The base
   * colour goes last so it fills whatever the gradients leave.
   */
  const layers = surfaceLayers(styled, colours.accent, base);
  const background = layers.length ? `${layers.join(', ')}, ${base}` : base;

  const shapes: ShapeObject[] = (styled.shapes ?? []).map((spec, i) => {
    const geom = shapeGeometry(spec, opts.width, opts.height);
    const fill = shapeColor(spec.tone, colours.accent, ink, base);
    const common = {
      id: objectId('s'),
      type: 'shape' as const,
      name: `${spec.kind.charAt(0).toUpperCase()}${spec.kind.slice(1)}`,
      rotation: 0,
      opacity: spec.alpha ?? 1,
      visible: true,
      locked: false,
      /*
       * Beneath every text object. The template paints geometry between the
       * surface and the type, and a wedge drawn over a headline is not a
       * decoration, it is a redaction.
       */
      z: i + 1,
      fill,
    };

    const nx = (v: number) => v / opts.width;
    const ny = (v: number) => v / opts.height;

    if (geom.kind === 'rect') {
      return {
        ...common,
        shape: 'rect',
        x: nx(geom.x), y: ny(geom.y), w: nx(geom.w), h: ny(geom.h),
        radius: geom.w > 0 ? geom.radius / geom.w : 0,
      };
    }

    if (geom.kind === 'circle' || geom.kind === 'ring') {
      const d = geom.r * 2;
      return {
        ...common,
        shape: 'ellipse',
        x: nx(geom.cx - geom.r), y: ny(geom.cy - geom.r),
        w: nx(d), h: ny(d),
        /* A ring is an outline: no fill, a stroke of its own thickness. */
        ...(geom.kind === 'ring'
          ? { fill: 'transparent', stroke: fill, strokeWidth: nx(geom.thickness) }
          : {}),
      };
    }

    /*
     * A polygon. Its points are kept relative to its own bounding box, so the
     * object can be selected, moved and resized like anything else rather
     * than being a page-sized hit target that swallows every click.
     */
    const xs = geom.points.map((p) => p[0]);
    const ys = geom.points.map((p) => p[1]);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const boxW = Math.max(...xs) - left;
    const boxH = Math.max(...ys) - top;

    return {
      ...common,
      shape: 'polygon',
      x: nx(left), y: ny(top), w: nx(boxW), h: ny(boxH),
      points: geom.points.map(([px, py]): [number, number] => [
        boxW > 0 ? (px - left) / boxW : 0,
        boxH > 0 ? (py - top) / boxH : 0,
      ]),
    };
  });

  return { template: styled, background, shapes, base, accent: colours.accent, ink };
}

/**
 * The colour a slot's tone resolves to.
 *
 * Slots carry a tone, never a colour, so that one layout works in eleven
 * styles. Dropping the tone — which the converter did — left every line of
 * type at the renderer's near-black default, including the ones meant to be
 * white on a dark ground and the ones meant to be the brand colour.
 */
export function toneColour(
  tone: SlotSpec['tone'],
  d: Pick<Dressing, 'ink' | 'accent'>,
): string {
  // Role tones (primary/secondary/highlight) resolve through resolveLook in the
  // renderers; this legacy path has only the accent, so they map to it.
  if (tone === 'accent' || tone === 'primary' || tone === 'secondary' || tone === 'highlight') return d.accent;
  /* Muted is the ink held back, not a separate grey that fights the palette. */
  if (tone === 'muted') return `${d.ink}b3`.length === 9 ? `${d.ink}b3` : d.ink;
  return d.ink;
}
