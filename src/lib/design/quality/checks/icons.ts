/**
 * Icons a template draws from code (design/icons.ts): which sets it uses, and
 * whether each icon keeps the rules (C2 and C13).
 *
 * Library icons (`asset:<id>` of kind icon) are found by assets.ts; these are
 * the per-row icons on slots, Lucide outlines and platform marks.
 */
import { estimateLines, fitSlotSize, isListRole, typePx, type DesignTemplate, type SlotSpec } from '../../../designTemplates';
import type { TemplateContent } from '../../../../components/studio/TemplateSurface';
import { ICON_EM, ICON_GAP_EM, glyphOf, iconIndent, isProfilePointer, mayCarryIcon, type IconSetKey, type SlotIcon } from '../../icons';
import { pagesOf } from './copy';

/** Icon sets that may be used together: the general set beside platform marks. */
const PAIRS: readonly (readonly string[])[] = [['lucide', 'platform']];

/** Whether a set of icon-set keys is allowed together: one set, or an approved pair. */
export function iconSetsAllowed(sets: Iterable<string>): boolean {
  const list = [...new Set(sets)].sort();
  if (list.length <= 1) return true;
  return PAIRS.some((p) => p.length === list.length && [...p].sort().every((k, i) => k === list[i]));
}

export interface PlacedIcon {
  where: string;
  slot: SlotSpec;
  /** All slots on the icon's page, for the fitter. */
  page: SlotSpec[];
  index: number;
  icon: SlotIcon;
}

/** Every icon on every page of a template. */
export function slotIcons(tpl: DesignTemplate): PlacedIcon[] {
  const out: PlacedIcon[] = [];
  for (const page of pagesOf(tpl)) {
    for (const slot of page.slots) {
      (slot.icons ?? []).forEach((icon, index) => {
        if (icon) out.push({ where: `${page.name}.${slot.role}[${index}]`, slot, page: page.slots, index, icon });
      });
    }
  }
  return out;
}

/** The icon sets a template's own slots draw from. */
export const slotIconSets = (tpl: DesignTemplate): Set<IconSetKey> =>
  new Set(slotIcons(tpl).map((p) => p.icon.set));

/** The words on the row an icon leads, as the visitor writes them (before capitals). */
function rowWords(p: PlacedIcon, content: TemplateContent): string {
  const { slot, index } = p;
  if (slot.role === 'contact') return (content.contact ?? [])[index] ?? '';
  if (slot.role === 'services') return (content.services ?? [])[index] ?? '';
  return index === 0 ? String(content[slot.role as keyof TemplateContent] ?? '') : '';
}

/**
 * Each icon that breaks a rule, measured with this copy at the template's canvas.
 *
 * - it must name a known icon, on a row that may carry one, within the
 *   slot's row cap, on a row that has words;
 * - a platform mark must stand beside a handle or profile pointer;
 * - the icon box (ICON_EM of the row's type) must be at least the format's
 *   minimum text size, and at least the words' cap height;
 * - a one-line slot must still hold its words on one line beside it.
 */
export function iconProblems(
  tpl: DesignTemplate, content: TemplateContent, w: number, h: number, minPx: number,
): string[] {
  const out: string[] = [];
  for (const p of slotIcons(tpl)) {
    const { slot, index, icon, where } = p;
    if (!glyphOf(icon)) { out.push(`${where}: no ${icon.set} icon named "${icon.name}"`); continue; }
    if (!mayCarryIcon(slot)) { out.push(`${where}: a ${slot.role} slot${slot.treatment === 'disc' ? ' in a disc' : ''} may not carry an icon`); continue; }
    const list = isListRole(slot.role);
    if (!list && index > 0) { out.push(`${where}: a text slot has one row`); continue; }
    if (list && slot.max !== undefined && index >= slot.max) { out.push(`${where}: beyond the slot's ${slot.max} rows`); continue; }
    const words = rowWords(p, content);
    if (!words.trim()) { out.push(`${where}: leads a row with no words`); continue; }
    if (icon.set === 'platform' && !isProfilePointer(words)) {
      out.push(`${where}: a platform mark beside "${words}", which is not a handle or profile pointer`);
    }
    const textPx = list ? typePx(slot.size, w, h) : fitSlotSize(slot, p.page, words, w, h);
    const iconPx = textPx * ICON_EM;
    if (iconPx < minPx - 1e-9) out.push(`${where}: icon is ${iconPx.toFixed(1)}px, below the format's ${minPx.toFixed(1)}px minimum`);
    if (iconPx < textPx * 0.7) out.push(`${where}: icon is smaller than its words' cap height`);
    if (ICON_GAP_EM * textPx < iconPx / 4) out.push(`${where}: less than a quarter of the icon's height of clear space`);
    if (!list) {
      const room = { ...slot, w: Math.max(0, slot.w - iconIndent(textPx) / w) };
      if (estimateLines(slot.upper ? words.toUpperCase() : words, room, textPx, w) > 1) {
        out.push(`${where}: the words no longer fit on one line beside the icon`);
      }
    }
  }
  return out;
}
