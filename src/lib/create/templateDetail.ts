import { isListRole, type DesignTemplate, type SlotRole, type SlotSpec } from '../designTemplates';
import { formatForTemplate } from '../design/deliverables';
import { directionOf, type Direction } from '../design/directions';
import { formatOf, type Format } from '../design/formats';
import { assetById, templateAssetIds, type ManifestAsset } from '../design/assetManifest';
import { resolveLook, slotFace } from '../design/look';
import { typefaceOf, type Typeface } from '../design/typefaces';
import { subcategoryFor, type Subcategory } from './catalogueTaxonomy';
import { CUSTOMISER_TEXT_FIELDS, isCustomiserTextRole } from './customiserFields';

/**
 * The facts the template detail page (/media/templates/:key) states about one
 * design. Pure and browser-safe: it reads the same registries the quality
 * scorer does, but never imports quality/critical.ts or score.ts (Node-only).
 *
 * Every line here is derived from the template or a registry. Nothing is
 * written down per template, so nothing can drift from what renders.
 */

/** One page or side, as the customiser names it: "Front", then `extraPages`. */
export interface DetailPage { name: string; slots: SlotSpec[] }

export function detailPages(tpl: DesignTemplate): DetailPage[] {
  return [{ name: 'Front', slots: tpl.slots }, ...(tpl.extraPages ?? [])];
}

/** The canvas the design is made on, from the one format registry. */
export interface DetailCanvas {
  formatKey: string | null;
  label: string;
  w: number;
  h: number;
  mm: { w: number; h: number } | null;
  format: Format | null;
}

const SQUARE = 1080;

export function canvasOf(tpl: DesignTemplate): DetailCanvas {
  const key = formatForTemplate(tpl);
  const format = key ? formatOf(key) : null;
  if (!format) return { formatKey: key, label: 'Square', w: SQUARE, h: SQUARE, mm: null, format: null };
  return { formatKey: key, label: format.label, w: format.w, h: format.h, mm: format.mm ?? null, format };
}

/**
 * The export formats that work today, and where.
 *
 * The Create customiser downloads a PNG (TemplateCustomiser's "Download PNG");
 * Studio's editor writes a PDF (lib/studio/exportDesign.ts `pdfPlan`). Nothing
 * else is offered, so nothing else is listed: no SVG, no JPG, and no
 * "print-ready" until bleed PDFs exist (spec §10, Phase 6).
 */
export const EXPORT_FORMATS: { key: 'png' | 'pdf'; label: string; where: string }[] = [
  { key: 'png', label: 'PNG', where: 'Download from the customiser. Free, no account.' },
  { key: 'pdf', label: 'PDF', where: 'Export from Studio.' },
];

/* Mirrors quality/checks/geometry.ts `isTextRole` (a single-line text role). */
const isTextRole = (role: SlotRole): boolean => !isListRole(role) && role !== 'qr';

const OTHER_LABELS: Partial<Record<SlotRole, string>> = {
  meta: 'Small print line',
  qr: 'QR code',
  services: 'Services list',
  stats: 'Figures',
  contact: 'Contact details',
  price: 'Price list',
};

export type ElementStatus = 'editable' | 'fixed' | 'sample';

export interface DetailElement {
  role: SlotRole;
  label: string;
  /** The pages or sides it appears on. */
  pages: string[];
  /**
   * editable: the customiser has a field for it.
   * fixed: shown, but the customiser sets it and offers no field (meta, qr).
   * sample: a list drawn from the template's own sample rows.
   */
  status: ElementStatus;
}

/** Every slot role the design shows, in first-seen order, with how it can be changed. */
export function detailElements(tpl: DesignTemplate): DetailElement[] {
  const byRole = new Map<SlotRole, DetailElement>();
  for (const page of detailPages(tpl)) {
    for (const slot of page.slots) {
      const found = byRole.get(slot.role);
      if (found) {
        if (!found.pages.includes(page.name)) found.pages.push(page.name);
        continue;
      }
      const editable = isCustomiserTextRole(slot.role);
      byRole.set(slot.role, {
        role: slot.role,
        label: editable ? CUSTOMISER_TEXT_FIELDS[slot.role as keyof typeof CUSTOMISER_TEXT_FIELDS] : OTHER_LABELS[slot.role] ?? slot.role,
        pages: [page.name],
        status: editable ? 'editable' : isListRole(slot.role) ? 'sample' : 'fixed',
      });
    }
  }
  return [...byRole.values()];
}

/**
 * The single-line text roles the customiser cannot change (C7). A template
 * with any is "Preview only": opening it would show words the visitor cannot
 * edit, so the page offers no "Use this template".
 */
export function uneditableTextRoles(tpl: DesignTemplate): SlotRole[] {
  const out = new Set<SlotRole>();
  for (const page of detailPages(tpl)) {
    for (const slot of page.slots) {
      if (isTextRole(slot.role) && !isCustomiserTextRole(slot.role)) out.add(slot.role);
    }
  }
  return [...out];
}

export const isPreviewOnly = (tpl: DesignTemplate): boolean => uneditableTextRoles(tpl).length > 0;

/** The faces that actually render the design's slots, once each. */
export function detailFonts(tpl: DesignTemplate): Typeface[] {
  const canvas = canvasOf(tpl);
  const resolved = resolveLook(tpl, { accent: '#2563eb', width: canvas.w, height: canvas.h });
  const keys = new Set(detailPages(tpl).flatMap((p) => p.slots.map((s) => slotFace(tpl, s, resolved))));
  return [...keys].map((k) => typefaceOf(k));
}

/** Library assets the design references; `asset` is null when the manifest has no record. */
export function detailAssets(tpl: DesignTemplate): { id: string; asset: ManifestAsset | null }[] {
  return templateAssetIds(tpl).map((id) => ({ id, asset: assetById(id) }));
}

/**
 * Related designs: the same subcategory, other directions first, at most six,
 * never this one. `listed` must already be what the gallery lists (isListed),
 * so a related card never leads to a design the catalogue holds back.
 *
 * No template carries a direction yet, so today this is the subcategory in
 * catalogue order. Once directions exist, a different direction outranks the
 * same one, and each direction is offered once before any repeats.
 */
export function relatedTemplates(tpl: DesignTemplate, listed: DesignTemplate[], max = 6): DesignTemplate[] {
  const sub = subcategoryFor(tpl);
  if (!sub) return [];
  const pool = listed.filter((t) => t.key !== tpl.key && subcategoryFor(t)?.key === sub.key);
  const seen = new Set<string>();
  const first: DesignTemplate[] = [];
  const rest: DesignTemplate[] = [];
  for (const t of pool) {
    const dir = t.direction;
    if (dir && dir !== tpl.direction && !seen.has(dir)) { seen.add(dir); first.push(t); } else rest.push(t);
  }
  /* Same-direction and direction-less designs come after every other direction. */
  rest.sort((a, b) => Number(Boolean(a.direction) && a.direction === tpl.direction)
    - Number(Boolean(b.direction) && b.direction === tpl.direction));
  return [...first, ...rest].slice(0, max);
}

/**
 * A mockup scene for the detail page's mockup view. Task 16 supplies the real
 * type and `scenesFor`; until then there are none and no mockup is shown.
 */
export interface MockupScene { id: string; label: string }

const NO_SCENES: MockupScene[] = [];

/**
 * TASK 16 SEAM: the mockup scenes whose ratio matches this design's format.
 * Replace the body with `scenesFor(template)` once it exists. Empty today.
 */
export function useMockupScenes(_template: DesignTemplate | null): MockupScene[] {
  return NO_SCENES;
}

/** Everything the page shows, in one read. */
export interface TemplateDetailFacts {
  canvas: DetailCanvas;
  subcategory: Subcategory | null;
  direction: Direction | null;
  pages: DetailPage[];
  elements: DetailElement[];
  previewOnly: boolean;
  fonts: Typeface[];
  assets: { id: string; asset: ManifestAsset | null }[];
}

export function templateDetailFacts(tpl: DesignTemplate): TemplateDetailFacts {
  return {
    canvas: canvasOf(tpl),
    subcategory: subcategoryFor(tpl),
    direction: directionOf(tpl.direction),
    pages: detailPages(tpl),
    elements: detailElements(tpl),
    previewOnly: isPreviewOnly(tpl),
    fonts: detailFonts(tpl),
    assets: detailAssets(tpl),
  };
}

/** "1011 × 638 px" and "85.6 × 54 mm". */
export const pxText = (c: Pick<DetailCanvas, 'w' | 'h'>): string => `${c.w} × ${c.h} px`;
export const mmText = (mm: { w: number; h: number }): string => `${mm.w} × ${mm.h} mm`;
