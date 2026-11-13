/**
 * The designed no-photo state (Task 18c, S1), resolved once for both
 * renderers.
 *
 * Ruling AH makes a photo subject the pool cannot supply a null photo, so a
 * photo-led design is often shown with no photograph at all, and eight of the
 * ten photo-led pilots were an empty plane of ground colour where the picture
 * should be. A premium design has to look intentional without its photo
 * (premium-design-brief checklist item 15), so a template may say what fills
 * its photo box when there is none: a fill, a pattern clipped to the box,
 * flat geometry, a keyline, and the business name's initial (Ruling AP).
 *
 * Everything here is pixels on the canvas, computed from the template and the
 * resolved palette roles. TemplateSurface turns it into absolutely positioned
 * divs inside a clipped box; drawTemplate paints it inside a clip. Neither
 * computes a position of its own, so the preview and the export agree.
 *
 * Shown only when there is no media. It never counts as image share
 * (composition.ts keeps describing the photo the design is built for), and it
 * invents nothing: no picture is implied, and the only letter it sets is the
 * owner's own.
 */
import {
  hexAlpha, photoBoxPx, shapeGeometry, unitOf,
  type DesignTemplate, type FallbackLayer, type FallbackTone, type PhotoBoxPx, type ShapeSpec,
} from '../designTemplates';
import type { PaletteRole } from './palettes';
import { patternSvg } from './patterns';
import { fontStack } from './typefaces';
import { isSampleText } from '../create/sampleCopy';

export interface FallbackStop { at: number; color: string }

export type ResolvedFallbackLayer = (
  | { kind: 'flat'; color: string }
  /** Angle as CSS measures it, across the box. */
  | { kind: 'linear'; angle: number; stops: FallbackStop[] }
  /** Centre and radius in pixels, relative to the box's top-left corner. */
  | { kind: 'radial'; cx: number; cy: number; r: number; stops: FallbackStop[] }
) & {
  /** Paints something besides the ground (S1b): a non-ground role at alpha 0.05 or more. */
  strong: boolean;
};

/** The weakest alpha that still counts as drawing something (S1b). */
export const VISIBLE_ALPHA = 0.05;

const toneStrong = (t: FallbackTone): boolean => t.role !== 'ground' && (t.alpha ?? 1) >= VISIBLE_ALPHA;
const layerStrong = (l: FallbackLayer): boolean =>
  (l.kind === 'flat' ? [l.tone] : l.stops).some(toneStrong);
/** A shape counts only where it shows: visible, not ground-toned, and over the photo box. */
function shapeStrong(sh: ShapeSpec, box: PhotoBoxPx, w: number, h: number): boolean {
  if (sh.tone === 'base' || (sh.alpha ?? 1) < VISIBLE_ALPHA) return false;
  const g = shapeGeometry(sh, w, h);
  const b = g.kind === 'polygon'
    ? (() => {
        const xs = g.points.map((p) => p[0]);
        const ys = g.points.map((p) => p[1]);
        return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      })()
    : g.kind === 'rect' ? { x0: g.x, y0: g.y, x1: g.x + g.w, y1: g.y + g.h }
      : { x0: g.cx - g.r, y0: g.cy - g.r, x1: g.cx + g.r, y1: g.cy + g.r };
  return Math.min(b.x1, box.x + box.w) > Math.max(b.x0, box.x) && Math.min(b.y1, box.y + box.h) > Math.max(b.y0, box.y);
}

export interface ResolvedFallback {
  box: PhotoBoxPx;
  layers: ResolvedFallbackLayer[];
  /** A canvas-sized pattern SVG; the renderer shows only the box's part of it. */
  pattern: { svg: string; opacity: number; strong: boolean } | null;
  /** Canvas-fraction shapes, painted clipped to the box. */
  shapes: ShapeSpec[];
  shapesStrong: boolean;
  /** Canvas pixels. */
  keyline: { x: number; y: number; w: number; h: number; width: number; color: string; strong: boolean } | null;
  /** Canvas pixels; the glyph's em box is centred on (cx, cy). */
  monogram: { char: string; sizePx: number; color: string; family: string; weight: number; cx: number; cy: number; strong: boolean } | null;
}

const toneColour = (t: FallbackTone, roles: Record<PaletteRole, string>): string =>
  t.alpha === undefined || t.alpha >= 1 ? roles[t.role] : hexAlpha(roles[t.role], Math.max(0, t.alpha));

const evenStops = (tones: FallbackTone[], roles: Record<PaletteRole, string>): FallbackStop[] =>
  tones.map((t, i) => ({ at: tones.length === 1 ? 0 : i / (tones.length - 1), color: toneColour(t, roles) }));

function resolveLayer(l: FallbackLayer, box: PhotoBoxPx, roles: Record<PaletteRole, string>): ResolvedFallbackLayer {
  const strong = layerStrong(l);
  if (l.kind === 'flat') return { kind: 'flat', color: toneColour(l.tone, roles), strong };
  if (l.kind === 'linear') return { kind: 'linear', angle: l.angle, stops: evenStops(l.stops, roles), strong };
  return {
    strong,
    kind: 'radial',
    cx: l.cx * box.w,
    cy: l.cy * box.h,
    r: Math.max(1, l.r * Math.max(box.w, box.h)),
    stops: evenStops(l.stops, roles),
  };
}

/**
 * The first letter or digit of a business name, in capitals, with any
 * combining marks it carries; '' when there is none. Composed first (NFC),
 * so a decomposed É is one letter. A letter whose capital is more than one
 * character (ß is SS, the ligature ﬁ is FI) keeps its own form: a monogram
 * is one glyph. Modifier letters such as the apostrophe-like ʼ are skipped.
 */
export function initialOf(name: string | undefined): string {
  const m = (name ?? '').normalize('NFC').match(/[\p{Lu}\p{Ll}\p{Lt}\p{Lo}\p{N}]\p{M}*/u);
  if (!m) return '';
  const upper = m[0].toUpperCase();
  const base = [...m[0].replace(/\p{M}+$/u, '')];
  const upBase = [...upper.replace(/\p{M}+$/u, '')];
  return upBase.length > base.length ? m[0] : upper.normalize('NFC');
}

/**
 * The monogram letter for a name, or '' (Ruling AW): only an owner's real
 * name earns one. The gallery's sample words ("Your brand") draw none.
 */
export function monogramLetter(name: string | undefined): string {
  return isSampleText(name, ['brand']) ? '' : initialOf(name);
}

/**
 * The no-photo state for a template on a w x h canvas, or null when it has
 * none to draw. Callers draw it only when there is no media.
 */
export function resolveFallback(
  tpl: Pick<DesignTemplate, 'photo' | 'photoLed'>,
  roles: Record<PaletteRole, string>,
  w: number,
  h: number,
  brand?: string,
): ResolvedFallback | null {
  const fb = tpl.photo?.fallback;
  if (!tpl.photoLed || !fb) return null;
  const box = photoBoxPx(tpl, w, h);
  if (box.w <= 0 || box.h <= 0) return null;
  const u = unitOf(w, h);

  const pattern = fb.pattern
    ? {
        svg: patternSvg({ key: fb.pattern.key, role: fb.pattern.role, opacity: fb.pattern.opacity, scale: fb.pattern.scale, zone: 'full' }, w, h, roles[fb.pattern.role]),
        opacity: fb.pattern.opacity,
        strong: fb.pattern.opacity >= VISIBLE_ALPHA,
      }
    : null;

  const keyline = fb.keyline
    ? (() => {
        const inset = fb.keyline.inset * u;
        const width = Math.max(1, (fb.keyline.width ?? 0.002) * u);
        return {
          x: box.x + inset, y: box.y + inset, w: Math.max(0, box.w - inset * 2), h: Math.max(0, box.h - inset * 2),
          width, color: toneColour(fb.keyline.tone, roles), strong: toneStrong(fb.keyline.tone),
        };
      })()
    : null;

  const char = fb.monogram ? monogramLetter(brand) : '';
  const monogram = fb.monogram && char
    ? {
        char,
        sizePx: Math.round(fb.monogram.size * u),
        color: toneColour(fb.monogram.tone, roles),
        family: fontStack(fb.monogram.font),
        weight: fb.monogram.weight ?? 400,
        cx: (fb.monogram.cx ?? (box.x + box.w / 2) / w) * w,
        cy: (fb.monogram.cy ?? (box.y + box.h / 2) / h) * h,
        strong: toneStrong(fb.monogram.tone),
      }
    : null;

  return {
    box,
    layers: fb.layers.map((l) => resolveLayer(l, box, roles)),
    pattern,
    shapes: fb.shapes ?? [],
    shapesStrong: (fb.shapes ?? []).some((sh) => shapeStrong(sh, box, w, h)),
    keyline,
    monogram,
  };
}

/** A resolved layer as a CSS background for a div that covers the box. */
export function fallbackLayerCss(l: ResolvedFallbackLayer): string {
  if (l.kind === 'flat') return l.color;
  const stops = l.stops.map((s) => `${s.color} ${Math.round(s.at * 100)}%`).join(', ');
  if (l.kind === 'linear') return `linear-gradient(${l.angle}deg, ${stops})`;
  return `radial-gradient(circle ${Math.round(l.r)}px at ${Math.round(l.cx)}px ${Math.round(l.cy)}px, ${stops})`;
}

/**
 * Why a photo-led design would show an empty plane with no photograph, or []
 * (S1b). A directed photo-led design must carry a no-photo state, and that
 * state must draw something besides one flat field of ground.
 */
export function fallbackProblems(tpl: DesignTemplate, w = 1000, h = 1000): string[] {
  if (!tpl.photoLed || !tpl.direction) return [];
  const fb = tpl.photo?.fallback;
  if (!fb) return ['photo-led with no designed no-photo state: it shows an empty plane when there is no photograph'];
  if (fb.layers.length === 0) return ['the no-photo state has no fill'];
  /*
   * Something must show besides the ground: a non-ground layer, a pattern, a
   * shape, a keyline or a monogram, at alpha 0.05 or more. A tint at alpha 0
   * is an untreated field however many layers it is written as.
   */
  const strong = fb.layers.some(layerStrong)
    || (!!fb.pattern && fb.pattern.opacity >= VISIBLE_ALPHA)
    || (fb.shapes ?? []).some((sh) => shapeStrong(sh, photoBoxPx(tpl, w, h), w, h))
    || (!!fb.keyline && toneStrong(fb.keyline.tone))
    || (!!fb.monogram && toneStrong(fb.monogram.tone));
  return strong ? [] : ['the no-photo state is an untreated flat field of ground'];
}
