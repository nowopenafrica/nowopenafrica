/**
 * The automated critical checks (spec §9.1). Any one failure blocks
 * publication, whatever the score.
 *
 * NODE ONLY: C3 reads the shipped font files (see checks/glyphs.ts). This runs
 * in tests and in the quality audit, never in the browser bundle.
 *
 * Pure apart from reading those files: no rendering. C6 (broken preview)
 * needs a DOM and lives in preview.tsx as `previewCriticals`. C10 (invented
 * claims) is reviewer-only. C8 (corrupted export) is not checked until P6
 * (Ruling E) and is listed in NOT_CHECKED so the report can say so.
 */
import type { DesignTemplate } from '../../designTemplates';
import { subcategoryFor } from '../../create/catalogueTaxonomy';
import { isCustomiserTextRole } from '../../create/customiserFields';
import { deliverableFor } from '../deliverables';
import { directionProblems } from '../directions';
import { directionOverflow, distinctnessIssues } from '../composition';
import { SUPPORTED_CHARS, UPSTREAM_GAPS } from '../fontCoverage';
import { formatOf } from '../formats';
import { resolveLook, slotFace } from '../look';
import { DESIGN_STYLES, applyStyle } from '../styles';
import { typefaceOf, type TypefaceKey } from '../typefaces';
import type { AssetManifest } from '../assetManifestTypes';
import type { TemplateContent } from '../../../components/studio/TemplateSurface';
import { assetRefs, externalUrls, iconRefs } from './checks/assets';
import { LONG_BRAND, LONG_HEADLINE, copyFor, pagesOf, placeholderProblems, slotText } from './checks/copy';
import { billboardProblems, instagramCropProblems, isBillboard, shapeEdgeCrossings, textOverlaps } from './checks/flow';
import { faceProblems, gapsOf } from './checks/glyphs';
import { initialOf } from '../photoFallback';
import { iconProblems, iconSetsAllowed, slotIconSets } from './checks/icons';
import {
  NAME_ROLES, atFloor, belowMinimum, canvasFor, clipped, essentialRoles, fits, formatFor, isTextRole, minTextPx, ratioError, safeBreaches,
} from './checks/geometry';
import { contrastUnderStyles } from './checks/styled';

export type CriticalCode = `C${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13}`;

export interface CriticalFailure { code: CriticalCode; detail: string }

/** Codes the automation does not check yet. C8 needs the P6 export comparison. */
export const NOT_CHECKED: readonly CriticalCode[] = ['C8'];

/** Codes only a reviewer can judge. */
export const REVIEWER_ONLY: readonly CriticalCode[] = ['C10'];

export interface QualityOptions {
  /** The copy to measure. Defaults to the template's demo copy (sampleCopy.ts). */
  copy?: TemplateContent;
}

/** Ratio tolerance for C4: 1%. */
const RATIO_TOLERANCE = 0.01;

/* ── C1 ─────────────────────────────────────────────────────────────────── */

function c1(tpl: DesignTemplate, manifest: AssetManifest): string[] {
  const out = externalUrls(tpl).map((u) => `external image URL at ${u.where}: ${u.value}`);
  for (const r of assetRefs(tpl, manifest)) if (!r.asset) out.push(`asset:${r.id} at ${r.where} is not in the manifest`);
  return out;
}

/* ── C2 ─────────────────────────────────────────────────────────────────── */

function c2(tpl: DesignTemplate, manifest: AssetManifest): string[] {
  const out: string[] = [];
  if (!subcategoryFor(tpl)) out.push('no subcategory');
  const fmt = deliverableFor(tpl)?.format;
  if (!fmt) out.push('no format');
  else if (!formatOf(fmt)) out.push(`format "${fmt}" does not resolve`);
  if (!tpl.direction) out.push('no direction');
  out.push(...directionProblems(tpl));
  const usesIcons = iconRefs(assetRefs(tpl, manifest)).length > 0 || slotIconSets(tpl).size > 0;
  if (usesIcons && !tpl.iconSet) out.push('uses icons but declares no iconSet');
  return out;
}

/* ── C3 ─────────────────────────────────────────────────────────────────── */

/** Which face draws which words: as authored, and under every style. */
function wordsByFace(tpl: DesignTemplate, content: TemplateContent): Map<TypefaceKey, Set<string>> {
  const canvas = canvasFor(tpl);
  const out = new Map<TypefaceKey, Set<string>>();
  for (const dressed of [tpl, ...DESIGN_STYLES.map((s) => applyStyle(tpl, s))]) {
    const resolved = resolveLook(dressed, { accent: '#2563eb', width: canvas.w, height: canvas.h });
    for (const page of pagesOf(dressed)) {
      for (const slot of page.slots) {
        const face = slotFace(dressed, slot, resolved);
        const set = out.get(face) ?? new Set<string>();
        for (const t of slotText(slot, content)) set.add(t);
        out.set(face, set);
      }
    }
  }
  // The no-photo monogram (S1) sets the name's initial in a face of its own.
  const mono = tpl.photoLed ? tpl.photo?.fallback?.monogram : undefined;
  const initial = initialOf(content.brand);
  if (mono && initial) {
    const set = out.get(mono.font) ?? new Set<string>();
    set.add(initial);
    out.set(mono.font, set);
  }
  return out;
}

const SUPPORTED = [...new Set([...Object.values(SUPPORTED_CHARS).join('')])]
  .filter((ch) => !UPSTREAM_GAPS.includes(ch)).join('');

const SUPPORT_GAPS = new Map<TypefaceKey, string[]>();

/** A full-coverage face against every supported language, once per face. */
function supportGaps(key: TypefaceKey): string[] {
  let hit = SUPPORT_GAPS.get(key);
  if (!hit) {
    const face = typefaceOf(key);
    hit = face.coverage === 'latin-basic'
      ? []
      : face.weights.flatMap((w) => { const g = gapsOf(face, w, SUPPORTED); return g ? [`${face.label} ${w} lacks supported ${g}`] : []; });
    SUPPORT_GAPS.set(key, hit);
  }
  return hit;
}

function c3(tpl: DesignTemplate, content: TemplateContent): string[] {
  const out: string[] = [];
  for (const [key, words] of wordsByFace(tpl, content)) {
    const face = typefaceOf(key);
    out.push(...faceProblems(face));
    const text = [...words].join('');
    for (const w of face.weights) {
      const gaps = gapsOf(face, w, text);
      if (gaps) out.push(`${face.label} ${w} cannot draw ${gaps} used in the copy`);
    }
    out.push(...supportGaps(key));
  }
  return [...new Set(out)];
}

/* ── C4 ─────────────────────────────────────────────────────────────────── */

function c4(tpl: DesignTemplate): string[] {
  const out: string[] = [];
  const sub = subcategoryFor(tpl);
  const f = formatFor(tpl);
  if (sub && f) {
    const ratio = f.w / f.h;
    const best = Math.min(...sub.formats.map((k) => {
      const g = formatOf(k);
      return g ? ratioError(ratio, g.w / g.h) : Infinity;
    }));
    if (!(best <= RATIO_TOLERANCE)) {
      out.push(`${f.key} canvas (${f.w}x${f.h}) is ${(best * 100).toFixed(1)}% off every ${sub.key} format (${sub.formats.join(', ')})`);
    }
  }
  if (sub?.sides === 'front-back' && !(tpl.extraPages && tpl.extraPages.length > 0)) {
    out.push(`${sub.key} is two-sided and the template has no back`);
  }
  return out;
}

/* ── C5 ─────────────────────────────────────────────────────────────────── */

function c5(tpl: DesignTemplate, content: TemplateContent): string[] {
  const out: string[] = [];
  for (const s of contrastUnderStyles(tpl)) {
    if (s.failures.length) out.push(`under ${s.style}: ${s.failures[0]}${s.failures.length > 1 ? ` (+${s.failures.length - 1} more)` : ''}`);
  }
  /*
   * Essentials are the product's required roles: each must be at least the
   * format's minimum (6 pt at print size, else MIN_TYPE_PX). Those and the
   * name roles must not be squeezed to the floor, and the one-line name must
   * not be cut off, with the demo copy and with long real-world copy
   * (LONG_BRAND in the brand, LONG_HEADLINE in the headline).
   */
  const { w, h } = canvasFor(tpl);
  const min = minTextPx(formatFor(tpl));
  const essentials = essentialRoles(tpl);
  const long = { ...content, brand: LONG_BRAND, headline: LONG_HEADLINE };
  for (const [label, copy] of [['copy', content], ['long copy', long]] as const) {
    for (const f of fits(tpl, copy, w, h, [...new Set([...essentials, ...NAME_ROLES])])) {
      if (essentials.includes(f.role) && belowMinimum(f, min)) out.push(`${f.where} with ${label} is ${f.fitted}px, below the format's ${min.toFixed(1)}px minimum`);
      if (atFloor(f)) out.push(`${f.where} with ${label} is at MIN_TYPE_PX (${f.fitted}px, designed ${f.natural}px)`);
      if (clipped(f)) out.push(`${f.where} with ${label} is clipped: it needs ${f.lines} lines and is set on one`);
    }
    // S4b: words wrapped word by word must not run into each other on any page.
    for (const o of textOverlaps(tpl, copy, w, h)) out.push(`${o} with ${label}`);
  }
  /*
   * S4b: words must not straddle the edge of a shape they are not set on.
   * Looked templates only: `on` is how a look says which colour a slot
   * sits on, and the older look-less layouts never declare it.
   */
  if (tpl.look) for (const c of shapeEdgeCrossings(tpl, content, w, h)) out.push(c);
  // S13: a 4:5 post is seen through the 3:4 profile grid (Ruling AN).
  if (subcategoryFor(tpl)?.key === 'instagram-post') {
    for (const p of instagramCropProblems(tpl, content, w, h)) out.push(`instagram: ${p}`);
  }
  // S5: a roadside board is read at speed, so it has floors of its own.
  if (isBillboard(subcategoryFor(tpl)?.key)) {
    for (const p of billboardProblems(tpl, content, w, h)) out.push(`billboard: ${p}`);
  }
  return [...new Set(out)];
}

/* ── C7 ─────────────────────────────────────────────────────────────────── */

/*
 * The customiser edits by ROLE, generically: one field per role in
 * CUSTOMISER_TEXT_FIELDS, whatever the template. So C7 checks that every
 * single-line text role a template shows has a field. Colour and background
 * are always offered and are not template-specific; list roles are set from
 * the template's own sample rows and are out of scope here.
 */
function c7(tpl: DesignTemplate): string[] {
  const out: string[] = [];
  for (const page of pagesOf(tpl)) {
    for (const slot of page.slots) {
      if (!isTextRole(slot.role)) continue;
      if (!isCustomiserTextRole(slot.role)) out.push(`${page.name}.${slot.role} has no customiser field`);
    }
  }
  return [...new Set(out)];
}

/* ── C9 ─────────────────────────────────────────────────────────────────── */

function c9(tpl: DesignTemplate, content: TemplateContent): string[] {
  const out: string[] = [];
  for (const page of pagesOf(tpl)) {
    for (const slot of page.slots) {
      for (const text of slotText(slot, content)) {
        for (const p of placeholderProblems(text)) out.push(`${page.name}.${slot.role}: ${p}`);
      }
    }
  }
  return [...new Set(out)];
}

/* ── C11 ────────────────────────────────────────────────────────────────── */

const c11 = (tpl: DesignTemplate, manifest: AssetManifest): string[] =>
  assetRefs(tpl, manifest)
    .filter((r) => r.asset?.kind === 'mockup_scene')
    .map((r) => `mockup_scene asset:${r.id} baked in at ${r.where}`);

/* ── C12 ────────────────────────────────────────────────────────────────── */

function c12(tpl: DesignTemplate): string[] {
  const f = formatFor(tpl);
  if (!f || f.medium !== 'press') return [];
  const out: string[] = [];
  if (!(f.bleedMm > 0)) out.push(`${f.key} is a press format with no bleed`);
  for (const b of safeBreaches(tpl, f)) {
    out.push(`${b.where} is ${b.mm.toFixed(1)} mm from the trim, inside the ${f.safeMm} mm safe margin`);
  }
  return out;
}

/* ── C13 ────────────────────────────────────────────────────────────────── */

/*
 * One icon style per design, from the library or from code (design/icons.ts),
 * with one allowed pair: Lucide beside platform marks, which are trademarks
 * set beside a handle rather than a second style of icon. Every code icon
 * must also keep its drawing rules (checks/icons.ts).
 */
function c13(tpl: DesignTemplate, siblings: DesignTemplate[], manifest: AssetManifest, content: TemplateContent): string[] {
  const out: string[] = [];
  const sets = new Set<string>(iconRefs(assetRefs(tpl, manifest)).map((r) => r.asset.iconSet ?? '(none)'));
  for (const s of slotIconSets(tpl)) sets.add(s);
  if (tpl.iconSet && sets.size > 0) sets.add(tpl.iconSet);
  if (!iconSetsAllowed(sets)) out.push(`mixes icon sets: ${[...sets].sort().join(', ')}`);
  const { w, h } = canvasFor(tpl);
  out.push(...iconProblems(tpl, content, w, h, minTextPx(formatFor(tpl))));
  const group = [...siblings.filter((s) => s.key !== tpl.key), tpl];
  for (const i of distinctnessIssues(group)) {
    if (i.a !== tpl.key && i.b !== tpl.key) continue;
    const other = i.a === tpl.key ? i.b : i.a;
    out.push(`too close to ${other} in ${i.subcategory}: distance ${i.distance}`);
  }
  for (const o of directionOverflow(group)) {
    if (o.keys.includes(tpl.key)) out.push(`${o.direction} appears ${o.keys.length} times in ${o.subcategory}`);
  }
  return out;
}

/**
 * Every automated critical failure (all of §9.1 except C6, C8 and C10).
 *
 * `siblings` is the listed catalogue the template is compared against for C13;
 * it may include the template itself. `manifest` is the approved-asset list.
 */
export function automatedCriticals(
  tpl: DesignTemplate,
  siblings: DesignTemplate[],
  manifest: AssetManifest,
  opts: QualityOptions = {},
): CriticalFailure[] {
  const content = copyFor(tpl, opts.copy);
  const found: [CriticalCode, string[]][] = [
    ['C1', c1(tpl, manifest)],
    ['C2', c2(tpl, manifest)],
    ['C3', c3(tpl, content)],
    ['C4', c4(tpl)],
    ['C5', c5(tpl, content)],
    ['C7', c7(tpl)],
    ['C9', c9(tpl, content)],
    ['C11', c11(tpl, manifest)],
    ['C12', c12(tpl)],
    ['C13', c13(tpl, siblings, manifest, content)],
  ];
  return found.flatMap(([code, details]) => details.map((detail) => ({ code, detail })));
}
