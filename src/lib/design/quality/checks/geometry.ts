/**
 * Canvas, sizes and margins: the measured inputs to C4, C5 (sizes), C12 and
 * the dimensions, access and mobile scores.
 */
import {
  MIN_TYPE_PX, estimateLines, fitSlotSize, isListRole, typePx,
  type DesignTemplate, type SlotRole, type SlotSpec,
} from '../../../designTemplates';
import { deliverableFor } from '../../deliverables';
import { formatOf, type Format } from '../../formats';
import { textSlotBox } from '../../remix';
import type { TemplateContent } from '../../../../components/studio/TemplateSurface';
import { pagesOf, slotText } from './copy';

const MM_PER_INCH = 25.4;

/** The template's own canvas: its deliverable's format, or null when it names none that resolves. */
export function formatFor(tpl: DesignTemplate): Format | null {
  const key = deliverableFor(tpl)?.format;
  return key ? formatOf(key) : null;
}

/** Where a check measures: the format's canvas, else the 1080 square the customiser falls back to. */
export function canvasFor(tpl: DesignTemplate): { name: string; w: number; h: number } {
  const f = formatFor(tpl);
  return f ? { name: f.key, w: f.w, h: f.h } : { name: 'instagram-post (fallback)', w: 1080, h: 1080 };
}

/** Relative difference between two ratios (0 = identical). */
export const ratioError = (a: number, b: number): number => Math.abs(a - b) / Math.max(a, b);

/** Single-line text roles. List roles and the QR code are not "a line of text". */
export const isTextRole = (role: SlotRole): boolean => !isListRole(role) && role !== 'qr';

/** The roles that carry a name: what a long real-world name is put into. */
export const NAME_ROLES: readonly SlotRole[] = ['brand', 'headline'];

export interface Fit {
  where: string;
  role: SlotRole;
  natural: number;
  fitted: number;
  /** Lines the text takes at the fitted size, by the renderers' own estimate. */
  lines: number;
}

/** Each single-line text slot's fitted pixel size, on every page, for this copy. */
export function fits(tpl: DesignTemplate, content: TemplateContent, w: number, h: number, roles?: readonly SlotRole[]): Fit[] {
  const out: Fit[] = [];
  for (const page of pagesOf(tpl)) {
    for (const slot of page.slots) {
      if (!isTextRole(slot.role) || (roles && !roles.includes(slot.role))) continue;
      const text = slotText(slot, content).join(' ');
      if (!text) continue;
      const fitted = fitSlotSize(slot, page.slots, text, w, h);
      out.push({
        where: `${page.name}.${slot.role}`,
        role: slot.role,
        natural: typePx(slot.size, w, h),
        fitted,
        lines: estimateLines(text, slot, fitted, w),
      });
    }
  }
  return out;
}

/**
 * Text that has hit the floor: designed below MIN_TYPE_PX, or squeezed down to
 * it by its copy. fitSlotSize never returns less than the floor, so landing ON
 * it is where words stop shrinking and start overrunning.
 */
export const atFloor = (f: Fit): boolean =>
  f.natural < MIN_TYPE_PX || (f.fitted <= MIN_TYPE_PX && f.natural > MIN_TYPE_PX);

/**
 * The name line is set on one line with an ellipsis (TemplateSurface:
 * whiteSpace nowrap), so a name that needs a second line is cut off.
 */
export const clipped = (f: Fit): boolean => f.role === 'brand' && f.lines > 1;

/** Physical dpi of the editable canvas, when the format is a real object. */
export function canvasDpi(f: Format): number | null {
  if (!f.mm) return null;
  return Math.min(f.w / (f.mm.w / MM_PER_INCH), f.h / (f.mm.h / MM_PER_INCH));
}

/** The smallest text this format should carry: the floor, or 6 pt at its print size. */
export function minTextPx(f: Format | null): number {
  const dpi = f ? canvasDpi(f) : null;
  return dpi ? Math.max(MIN_TYPE_PX, (6 / 72) * dpi) : MIN_TYPE_PX;
}

export interface SafeBreach { where: string; mm: number }

/** A slot's drawn box in pixels: the text line, or the square a QR code fills. */
function boxOf(slot: SlotSpec, w: number, h: number) {
  const b = textSlotBox(slot, w, h);
  if (slot.role !== 'qr') return b;
  const side = slot.w * w;
  return { x: b.x, y: slot.fromBottom ? b.y + b.h - side : b.y, w: side, h: side };
}

/**
 * Slots closer to the trim than the format's safe margin, with how far in they
 * reach (mm). Empty for a format without a physical size or a safe margin.
 */
export function safeBreaches(tpl: DesignTemplate, f: Format): SafeBreach[] {
  if (!f.mm || !(f.safeMm > 0)) return [];
  const pxPerMmX = f.w / f.mm.w;
  const pxPerMmY = f.h / f.mm.h;
  const out: SafeBreach[] = [];
  for (const page of pagesOf(tpl)) {
    for (const slot of page.slots) {
      const b = boxOf(slot, f.w, f.h);
      const edge = Math.min(
        b.x / pxPerMmX, (f.w - (b.x + b.w)) / pxPerMmX,
        b.y / pxPerMmY, (f.h - (b.y + b.h)) / pxPerMmY,
      );
      if (edge < f.safeMm - 1e-9) out.push({ where: `${page.name}.${slot.role}`, mm: Math.max(0, edge) });
    }
  }
  return out;
}

/** How many slots a format's safe area is measured over. */
export const slotCount = (tpl: DesignTemplate): number =>
  pagesOf(tpl).reduce((n, p) => n + p.slots.length, 0);
