/**
 * The automated critical checks (spec §9.1). Any one failure blocks
 * publication, whatever the score.
 *
 * NODE ONLY: C3 reads the shipped font files (see checks/glyphs.ts). This runs
 * in tests and in the quality audit, never in the browser bundle. Every other
 * automated check lives in criticalCore.ts, which is browser-safe and is what
 * the Template Manager runs on uploads.
 *
 * Pure apart from reading those files: no rendering. C6 (broken preview)
 * needs a DOM and lives in preview.tsx as `previewCriticals`. C10 (invented
 * claims) is reviewer-only. C8 (corrupted export) is not checked until P6
 * (Ruling E) and is listed in NOT_CHECKED so the report can say so.
 */
import type { DesignTemplate } from '../../designTemplates';
import { SUPPORTED_CHARS, UPSTREAM_GAPS } from '../fontCoverage';
import { resolveLook, slotFace } from '../look';
import { DESIGN_STYLES, applyStyle } from '../styles';
import { typefaceOf, type TypefaceKey } from '../typefaces';
import type { AssetManifest } from '../assetManifestTypes';
import type { TemplateContent } from '../../../components/studio/TemplateSurface';
import { copyFor, pagesOf, slotText } from './checks/copy';
import { faceProblems, gapsOf } from './checks/glyphs';
import { canvasFor } from './checks/geometry';
import { initialOf } from '../photoFallback';
import {
  coreCriticalsByCode,
  type CriticalCode, type CriticalFailure, type QualityOptions,
} from './criticalCore';

export {
  NOT_CHECKED, REVIEWER_ONLY,
  type CriticalCode, type CriticalFailure, type QualityOptions,
} from './criticalCore';

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
  const core = coreCriticalsByCode(tpl, siblings, manifest, opts);
  const found: [CriticalCode, string[]][] = [
    ['C1', core.C1],
    ['C2', core.C2],
    ['C3', c3(tpl, content)],
    ['C4', core.C4],
    ['C5', core.C5],
    ['C7', core.C7],
    ['C9', core.C9],
    ['C11', core.C11],
    ['C12', core.C12],
    ['C13', core.C13],
  ];
  return found.flatMap(([code, details]) => details.map((detail) => ({ code, detail })));
}
