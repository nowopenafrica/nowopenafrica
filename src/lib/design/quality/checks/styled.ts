/**
 * Contrast under the eleven styles and under brand colours: how the gallery,
 * the customiser and the editor actually dress a template.
 *
 * Every page is measured at the template's own canvas. A looked template keeps
 * its look's colours under any style (applyStyle); a template without one
 * takes the style's ground and the brand accent from styleColours, exactly as
 * the gallery card does.
 */
import type { DesignTemplate } from '../../../designTemplates';
import { DESIGN_STYLES, applyStyle, styleColours, type DesignStyle } from '../../styles';
import { brandPaletteFor } from '../../lookParam';
import { pagesOf } from './copy';
import { canvasFor } from './geometry';
import { measureContrast, type ContrastResult } from './contrast';

/** The accent the gallery and these suites use when no brand is given. */
export const GALLERY_ACCENT = '#2563eb';

/** Brand colours editability is tried with: pale, near-black, saturated, white. */
export const BRAND_TRIALS = ['#facc15', '#0b1220', '#e11d48', '#ffffff'] as const;

/** One dressing of the template, measured over every page. */
function dressed(tpl: DesignTemplate, style: DesignStyle, accent: string): ContrastResult {
  const styled = applyStyle(tpl, style);
  const c = canvasFor(tpl);
  const formats: [string, number, number][] = [[c.name, c.w, c.h]];
  const tone = styleColours(style, accent, styled.scheme);
  const out: ContrastResult = { failures: [], worstMargin: Infinity };
  for (const page of pagesOf(styled)) {
    const onPage = { ...styled, slots: page.slots };
    const r = styled.look
      ? measureContrast(onPage, styled.look, { formats, accent })
      : measureContrast(onPage, undefined, { formats, accent: tone.accent, base: tone.base, styleKey: style.key });
    out.failures.push(...r.failures.map((f) => (page.name === 'front' ? f : `${page.name}: ${f}`)));
    out.worstMargin = Math.min(out.worstMargin, r.worstMargin);
  }
  if (!Number.isFinite(out.worstMargin)) out.worstMargin = 1;
  return out;
}

export interface StyleContrast extends ContrastResult { style: string }

const STYLE_CACHE = new WeakMap<DesignTemplate, Map<string, StyleContrast[]>>();

/** Contrast under each of the eleven styles. Cached per template object and canvas. */
export function contrastUnderStyles(tpl: DesignTemplate): StyleContrast[] {
  const canvas = canvasFor(tpl);
  const key = `${canvas.w}x${canvas.h}`;
  let byCanvas = STYLE_CACHE.get(tpl);
  const hit = byCanvas?.get(key);
  if (hit) return hit;
  const result = DESIGN_STYLES.map((style) => ({ style: style.key, ...dressed(tpl, style, GALLERY_ACCENT) }));
  if (!byCanvas) { byCanvas = new Map(); STYLE_CACHE.set(tpl, byCanvas); }
  byCanvas.set(key, result);
  return result;
}

export interface BrandTrial { brand: string; ok: boolean; detail: string }

/**
 * Whether the template stays readable on each trial brand colour.
 *
 * Looked: the customiser's brand palette for that colour (null = it cannot
 * build one that reads, which is a failure). Not looked: the default style
 * with that colour as the accent.
 */
export function brandTrials(tpl: DesignTemplate): BrandTrial[] {
  const c = canvasFor(tpl);
  const formats: [string, number, number][] = [[c.name, c.w, c.h]];
  return BRAND_TRIALS.map((brand) => {
    let failures: string[];
    if (tpl.look) {
      const pal = brandPaletteFor(tpl, { primary: brand, harmony: 'analogous' }, tpl.look.gradient);
      if (!pal) return { brand, ok: false, detail: 'no readable brand palette' };
      failures = pagesOf(tpl).flatMap((p) => measureContrast({ ...tpl, slots: p.slots }, tpl.look, { formats, brand: pal }).failures);
    } else {
      failures = dressed(tpl, DESIGN_STYLES[0], brand).failures;
    }
    return { brand, ok: failures.length === 0, detail: failures[0] ?? 'readable' };
  });
}
