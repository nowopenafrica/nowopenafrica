/**
 * The automated half of the quality score (spec §9.2): at most 59 of 100.
 *
 * Every criterion is measured, never asserted, and scales linearly with its
 * measured margin. Each non-zero criterion writes one line of evidence saying
 * what was measured. The other 41 points are the reviewer's (Task 7's ledger).
 *
 * NODE ONLY for the same reason as critical.ts: the licensing line reads the
 * typeface registry, and C3's helpers are shared.
 */
import { MIN_TYPE_PX, fitSlotSize, typePx, type DesignTemplate, type SlotSpec } from '../../designTemplates';
import { subcategoryFor } from '../../create/catalogueTaxonomy';
import { DESIGN_FORMATS } from '../../../data/studioPresets';
import { formatOf } from '../formats';
import { resolveLook, slotFace } from '../look';
import { TYPEFACES, TYPE_PAIRINGS, typefaceOf } from '../typefaces';
import { deliveredDpiOf, exportCeilingDpi, exportPixelRatio } from '../printSpec';
import type { AssetManifest } from '../assetManifestTypes';
import { assetMetadataGaps, assetRefs, isRaster } from './checks/assets';
import { LONG_BRAND, LONG_HEADLINE, copyFor, pagesOf, slotText } from './checks/copy';
import { faceProblems } from './checks/glyphs';
import {
  NAME_ROLES, atFloor, belowMinimum, canvasDpi, clipped, essentialRoles, canvasFor, fits, formatFor, isTextRole, minTextPx, ratioError, safeBreaches, slotCount,
} from './checks/geometry';
import { brandTrials, contrastUnderStyles } from './checks/styled';
import type { QualityOptions } from './critical';

export const AUTO_MAX = {
  typography: 5, relevance: 4, image: 5, editability: 10, dimensions: 10,
  exportReady: 10, access: 7, licensing: 5, mobile: 3,
} as const;

export type Criterion = keyof typeof AUTO_MAX;

export const AUTO_TOTAL = Object.values(AUTO_MAX).reduce((a, b) => a + b, 0);

export interface AutoScore {
  typography: number; relevance: number; image: number; editability: number; dimensions: number;
  exportReady: number; access: number; licensing: number; mobile: number;
  total: number;
  evidence: Record<string, string>;
}

/** 0..1, linear between `zero` (no points) and `full` (all points). */
const lerp = (value: number, zero: number, full: number): number =>
  Math.max(0, Math.min(1, (value - zero) / (full - zero)));

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const fmt1 = (x: number): string => x.toFixed(1);

interface Part { points: number; evidence: string }

/* ── typography: 5 (registry pairing 2, scale steps 1.5, line length 1.5) ── */

/** Headline at least this many times the next text size counts as a clear step. */
const STEP_FULL = 1.5;
/** Characters per line of the supporting copy: full marks up to 75, none past 110. */
const LINE_FULL = 75;
const LINE_ZERO = 110;
/** Average advance as a share of the type size, for a characters-per-line estimate. */
const AVG_ADVANCE = 0.5;

function typography(tpl: DesignTemplate): Part {
  const notes: string[] = [];
  let points = 0;

  const pairing = tpl.look ? TYPE_PAIRINGS.find((p) => p.key === tpl.look?.type) : undefined;
  const canvas = canvasFor(tpl);
  const resolved = resolveLook(tpl, { accent: '#2563eb', width: canvas.w, height: canvas.h });
  const faces = new Set(pagesOf(tpl).flatMap((p) => p.slots.map((s) => slotFace(tpl, s, resolved))));
  const registered = [...faces].every((f) => TYPEFACES.some((t) => t.key === f));
  if (pairing) { points += 2; notes.push(`pairing ${pairing.key}`); }
  else if (registered) { points += 1; notes.push('own faces, no registry pairing'); }
  else notes.push('unregistered face');

  const text = tpl.slots.filter((s) => isTextRole(s.role));
  const head = text.find((s) => s.role === 'headline');
  const rest = text.filter((s) => s !== head).map((s) => s.size ?? 0.05);
  if (head && rest.length) {
    const step = (head.size ?? 0.05) / Math.max(...rest);
    const p = 1.5 * lerp(step, 1, STEP_FULL);
    points += p;
    notes.push(`headline ${fmt1(step)}x the next size`);
  } else if (head) {
    points += 1.5;
    notes.push('headline is the only text');
  } else notes.push('no headline');

  const sub = tpl.slots.find((s) => s.role === 'subline');
  if (sub) {
    const px = typePx(sub.size, canvas.w, canvas.h);
    const perLine = (sub.w * canvas.w) / Math.max(1, px * AVG_ADVANCE);
    points += 1.5 * (1 - lerp(perLine, LINE_FULL, LINE_ZERO));
    notes.push(`supporting line ~${Math.round(perLine)} characters a line`);
  } else {
    points += 1.5;
    notes.push('no long copy');
  }
  return { points, evidence: notes.join('; ') };
}

/* ── relevance: 4, the share of required roles present ─────────────────── */

function relevance(tpl: DesignTemplate): Part {
  const sub = subcategoryFor(tpl);
  if (!sub) return { points: 0, evidence: 'no subcategory' };
  const roles = new Set(pagesOf(tpl).flatMap((p) => p.slots.map((s) => s.role)));
  const have = sub.requiredRoles.filter((r) => roles.has(r));
  const missing = sub.requiredRoles.filter((r) => !roles.has(r));
  return {
    points: AUTO_MAX.relevance * (have.length / sub.requiredRoles.length),
    evidence: `${have.length}/${sub.requiredRoles.length} ${sub.key} roles${missing.length ? `, missing ${missing.join(', ')}` : ''}`,
  };
}

/* ── image: 5, source pixels against placed size × export scale ────────── */

function image(tpl: DesignTemplate, manifest: AssetManifest): Part {
  const raster = assetRefs(tpl, manifest).filter((r) => !r.asset || isRaster(r.asset));
  if (raster.length === 0) {
    return {
      points: AUTO_MAX.image,
      evidence: tpl.photoLed
        ? 'no raster stored on the template (the gallery supplies its preview photo at render time)'
        : 'no raster image',
    };
  }
  // Templates do not yet say how large an image is placed, so it is taken as
  // filling the canvas: the strictest placement.
  const c = canvasFor(tpl);
  const scale = exportPixelRatio(Math.max(c.w, c.h));
  const needW = c.w * scale;
  const needH = c.h * scale;
  let worst = 1;
  let note = '';
  for (const r of raster) {
    if (!r.asset) { worst = 0; note = `asset:${r.id} not in the manifest`; break; }
    if (r.asset.w <= 0 || r.asset.h <= 0) { worst = 0; note = `asset:${r.id} has no pixel size (${r.asset.w}x${r.asset.h})`; break; }
    const share = Math.min(1, r.asset.w / needW, r.asset.h / needH);
    if (share <= worst) { worst = share; note = `asset:${r.id} ${r.asset.w}x${r.asset.h} for ${Math.round(needW)}x${Math.round(needH)} placed`; }
  }
  return { points: AUTO_MAX.image * worst, evidence: `${pct(worst)} of needed pixels; ${note}` };
}

/* ── editability: 10 (styles 3, brand colour 2, long name 3, empty field 2) ── */


function editability(tpl: DesignTemplate, opts: QualityOptions): Part {
  const styles = contrastUnderStyles(tpl);
  const stylesOk = styles.filter((s) => s.failures.length === 0).length;
  const brands = brandTrials(tpl);
  const brandsOk = brands.filter((b) => b.ok).length;

  const { w, h } = canvasFor(tpl);
  const min = minTextPx(formatFor(tpl));
  const content = copyFor(tpl, opts.copy);
  const named = fits(tpl, { ...content, brand: LONG_BRAND, headline: LONG_HEADLINE }, w, h, NAME_ROLES);
  const nameOk = named.filter((f) => !atFloor(f) && !clipped(f)).length;
  const nameShare = named.length ? nameOk / named.length : 1;

  /*
   * Every optional text role (any text role that is not one of the product's
   * required roles) emptied: each required role must still be on the design,
   * carry words, and fit (at or above the format's minimum, not squeezed to
   * the floor, not cut off). Measured per required role.
   */
  const essentials = essentialRoles(tpl);
  const present = new Set(pagesOf(tpl).flatMap((p) => p.slots.map((sl) => sl.role)));
  const optional = [...present].filter((r) => isTextRole(r) && !essentials.includes(r));
  const emptied = { ...content, ...Object.fromEntries(optional.map((k) => [k, ''])) };
  const fitted = fits(tpl, emptied, w, h, essentials);
  const keptRoles = essentials.filter((role) => {
    const mine = fitted.filter((f) => f.role === role);
    return mine.length > 0 && mine.every((f) => !belowMinimum(f, min) && !atFloor(f) && !clipped(f));
  });
  const emptyShare = essentials.length ? keptRoles.length / essentials.length : 1;

  const points = 3 * (stylesOk / styles.length) + 2 * (brandsOk / brands.length) + 3 * nameShare + 2 * emptyShare;
  return {
    points,
    evidence: `${stylesOk}/${styles.length} styles readable; ${brandsOk}/${brands.length} brand colours; `
      + `${nameOk}/${named.length} name slots hold a ${LONG_BRAND.length}-character name or ${LONG_HEADLINE.length}-character headline; `
      + `with ${optional.length} optional field(s) empty, ${keptRoles.length}/${essentials.length} required roles (${essentials.join(', ')}) present and fitting`,
  };
}

/* ── dimensions: 10 (format match 4, safe area 3, pages and sides 3) ────── */

/** Ratio error at which format match reaches zero. */
const RATIO_ZERO = 0.05;

function dimensions(tpl: DesignTemplate): Part {
  const notes: string[] = [];
  let points = 0;
  const sub = subcategoryFor(tpl);
  const f = formatFor(tpl);

  if (sub && f) {
    const err = Math.min(...sub.formats.map((k) => { const g = formatOf(k); return g ? ratioError(f.w / f.h, g.w / g.h) : Infinity; }));
    points += 4 * (1 - lerp(err, 0, RATIO_ZERO));
    notes.push(`${f.key} ${pct(err)} off its product's nearest format`);
  } else notes.push(f ? 'no subcategory to match' : 'no format');

  if (f?.mm && f.safeMm > 0) {
    const n = slotCount(tpl);
    const inside = n - safeBreaches(tpl, f).length;
    points += 3 * (n ? inside / n : 1);
    notes.push(`${inside}/${n} slots inside the ${f.safeMm} mm safe area`);
  } else if (f) {
    points += 3;
    notes.push('screen format: no safe margin to keep');
  } else notes.push('safe area unmeasurable without a format');

  if (sub?.sides === 'front-back') {
    const backs = tpl.extraPages?.length ?? 0;
    if (backs > 0) points += 3;
    notes.push(backs > 0 ? 'front and back present' : 'two-sided, back missing');
  } else {
    points += 3;
    notes.push(`${pagesOf(tpl).length} page(s) for a single-sided product`);
  }
  return { points, evidence: notes.join('; ') };
}

/* ── exportReady: 10, reaching the format's dpi under the export cap ───── */

function exportReady(tpl: DesignTemplate): Part {
  const f = formatFor(tpl);
  if (!f) return { points: 0, evidence: 'no format: the customiser falls back to a 1080 square' };
  if (!DESIGN_FORMATS.some((d) => d.key === f.key)) {
    return { points: 0, evidence: `${f.key} is not offered by the customiser, so it exports another size` };
  }
  const scale = exportPixelRatio(Math.max(f.w, f.h));
  const outW = Math.floor(f.w * scale);
  const outH = Math.floor(f.h * scale);
  if (!f.targetDpi) {
    return { points: AUTO_MAX.exportReady, evidence: `screen format exports ${outW}x${outH} from a ${f.w}x${f.h} canvas` };
  }
  const delivered = deliveredDpiOf(f.key) ?? (() => { const d = canvasDpi(f); return d === null ? null : Math.floor(d * scale); })();
  if (delivered === null) return { points: 0, evidence: `${f.key} has a target dpi but no physical size` };
  const ceiling = exportCeilingDpi(f.key);
  const share = Math.min(1, delivered / f.targetDpi);
  return {
    points: AUTO_MAX.exportReady * share,
    evidence: `${delivered} dpi delivered of ${f.targetDpi} target (${outW}x${outH})`
      + (ceiling !== null && ceiling < f.targetDpi ? `; the browser cap allows ${ceiling} at most` : ''),
  };
}

/* ── access: 7 (contrast margin 4, minimum sizes 3) ─────────────────────── */

/** Margin over the required contrast at which the contrast line is full: 1.5x AA. */
const MARGIN_FULL = 1.5;

function access(tpl: DesignTemplate, opts: QualityOptions): Part {
  const worst = Math.min(...contrastUnderStyles(tpl).map((s) => s.worstMargin));
  const contrast = 4 * lerp(worst, 1, MARGIN_FULL);

  const f = formatFor(tpl);
  const { w, h } = canvasFor(tpl);
  // The same format-aware floor C5 holds the essentials to.
  const all = fits(tpl, copyFor(tpl, opts.copy), w, h);
  const smallest = all.length ? Math.min(...all.map((x) => x.fitted)) : Infinity;
  const min = minTextPx(f);
  const sizes = Number.isFinite(smallest) ? 3 * lerp(smallest / min, 1, 2) : 3;
  return {
    points: contrast + sizes,
    evidence: `worst contrast ${fmt1(worst)}x its minimum across 11 styles; smallest text ${Math.round(smallest)}px against a ${fmt1(min)}px minimum`,
  };
}

/* ── licensing: 5, every asset and face fully recorded ──────────────────── */

function licensing(tpl: DesignTemplate, manifest: AssetManifest): Part {
  const refs = assetRefs(tpl, manifest);
  const canvas = canvasFor(tpl);
  const resolved = resolveLook(tpl, { accent: '#2563eb', width: canvas.w, height: canvas.h });
  const faces = [...new Set(pagesOf(tpl).flatMap((p) => p.slots.map((s) => slotFace(tpl, s, resolved))))].map((k) => typefaceOf(k));
  const gaps: string[] = [];
  let complete = 0;
  for (const r of refs) {
    const g = r.asset ? assetMetadataGaps(r.asset) : ['not in the manifest'];
    if (g.length) gaps.push(`asset:${r.id} ${g.join(', ')}`); else complete += 1;
  }
  for (const face of faces) {
    const g = faceProblems(face);
    if (!face.source) g.push(`${face.label} has no source`);
    if (g.length) gaps.push(...g); else complete += 1;
  }
  const n = refs.length + faces.length;
  return {
    points: AUTO_MAX.licensing * (n ? complete / n : 1),
    evidence: `${complete}/${n} assets and faces fully recorded${gaps.length ? `; ${gaps[0]}` : ''}`,
  };
}

/* ── mobile: 3, the card's headline at 160 px wide ──────────────────────── */

/** The gallery lays a card out in a 1080 square; a phone shows it 160 px wide. */
const CARD = 1080;
const PHONE_CARD = 160;

function mobile(tpl: DesignTemplate, opts: QualityOptions): Part {
  const c = canvasFor(tpl);
  const k = CARD / Math.max(c.w, c.h);
  const pw = Math.round(c.w * k);
  const ph = Math.round(c.h * k);
  const content = copyFor(tpl, opts.copy);
  const text = tpl.slots.filter((s) => isTextRole(s.role) && slotText(s, content).length);
  const head: SlotSpec | undefined = text.find((s) => s.role === 'headline')
    ?? [...text].sort((a, b) => (b.size ?? 0.05) - (a.size ?? 0.05))[0];
  if (!head) return { points: 0, evidence: '' };
  // fitSlotSize is the renderers' own estimate, not a browser layout: jsdom lays nothing out.
  const px = fitSlotSize(head, tpl.slots, slotText(head, content).join(' '), pw, ph) * (PHONE_CARD / CARD);
  return {
    points: AUTO_MAX.mobile * Math.min(1, px / MIN_TYPE_PX),
    evidence: `${head.role} ${fmt1(px)} px on a 160 px card (needs ${MIN_TYPE_PX})`,
  };
}

/**
 * The automated score. `siblings` is accepted for symmetry with
 * automatedCriticals; distinctness is a critical (C13), not a score line.
 */
export function automatedScore(
  tpl: DesignTemplate,
  _siblings: DesignTemplate[],
  manifest: AssetManifest,
  opts: QualityOptions = {},
): AutoScore {
  const parts: Record<Criterion, Part> = {
    typography: typography(tpl),
    relevance: relevance(tpl),
    image: image(tpl, manifest),
    editability: editability(tpl, opts),
    dimensions: dimensions(tpl),
    exportReady: exportReady(tpl),
    access: access(tpl, opts),
    licensing: licensing(tpl, manifest),
    mobile: mobile(tpl, opts),
  };
  const score = { evidence: {} as Record<string, string> } as AutoScore;
  let total = 0;
  for (const key of Object.keys(AUTO_MAX) as Criterion[]) {
    const points = Math.max(0, Math.min(AUTO_MAX[key], parts[key].points));
    score[key] = points;
    total += points;
    if (parts[key].evidence) score.evidence[key] = parts[key].evidence;
  }
  score.total = total;
  return score;
}
