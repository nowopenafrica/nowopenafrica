import {
  slotBox, typePx, isListRole, listRowBoxes, fontStack, nearestWeight,
  type DesignTemplate, type SlotSpec,
} from '../designTemplates';
import { wrapLines } from '../drawTemplate';
import type { BankSample } from './package';

/**
 * Does the copy actually fit the layout?
 *
 * The structural gate in schema.ts checks where slots start. It cannot see
 * text: a headline that wraps to three lines and lands on the subline passes
 * it, and so does a line the renderer quietly cut with an ellipsis. Both are
 * invisible in the data and obvious in the export.
 *
 * This lays the content out with the renderer's own wrapping rules and reports
 * what a person would see. Measuring is injected because only a real canvas
 * with the faces loaded knows how wide a word is; jsdom does not.
 */

export type Measure = (text: string, font: string, letterSpacingPx: number) => number;

export interface FitIssue {
  kind: 'cut' | 'too-wide' | 'overlap' | 'off-canvas';
  slot: string;
  detail: string;
}

interface Block { slot: string; x0: number; x1: number; y0: number; y1: number }

const maxLinesFor = (role: SlotSpec['role']): number =>
  role === 'headline' ? 3 : role === 'subline' ? 2 : 1;

const textOf = (c: BankSample, role: SlotSpec['role']): string => {
  switch (role) {
    case 'brand': return c.brand ?? '';
    case 'eyebrow': return c.eyebrow ?? '';
    case 'headline': return c.headline ?? '';
    case 'subline': return c.subline ?? '';
    case 'meta': return c.meta ?? '';
    case 'cta': return c.cta ?? '';
    default: return '';
  }
};

const listLength = (c: BankSample, slot: SlotSpec): number => {
  const n = slot.role === 'services' ? c.services?.length
    : slot.role === 'stats' ? c.stats?.length
      : slot.role === 'contact' ? c.contact?.length
        : slot.role === 'price' ? c.price?.length : 0;
  return Math.min(n ?? 0, slot.max ?? Infinity);
};

export function auditFit(
  tpl: DesignTemplate,
  content: BankSample,
  w: number,
  h: number,
  measure: Measure,
): FitIssue[] {
  const issues: FitIssue[] = [];
  const blocks: Block[] = [];

  for (const slot of tpl.slots) {
    if (slot.role === 'qr') continue;
    const box = slotBox(slot, w, h);
    const size = typePx(slot.size, w, h);

    if (isListRole(slot.role)) {
      const count = listLength(content, slot);
      if (!count) continue;
      const rows = listRowBoxes(slot, w, h, count);
      const last = rows[rows.length - 1];
      const rowHeight = slot.role === 'stats' ? size * 2.4 : size * 1.3;
      blocks.push({ slot: slot.role, x0: box.left, x1: box.left + box.width, y0: box.top, y1: last.y + rowHeight });
      continue;
    }

    const value = textOf(content, slot.role);
    if (!value) continue;
    const shown = slot.upper ? value.toUpperCase() : value;
    const face = slot.font ?? tpl.font;
    const font = `${nearestWeight(face, slot.weight ?? 600)} ${size}px ${fontStack(face)}`;
    const spacing = (slot.tracking ?? 0) * size;
    const width = (s: string) => measure(s, font, spacing);

    const lines = wrapLines(width, shown, box.width, maxLinesFor(slot.role));
    if (lines.some((l) => l.endsWith('…')) && !shown.endsWith('…')) {
      issues.push({ kind: 'cut', slot: slot.role, detail: `"${value}" is cut short with an ellipsis` });
    }
    const widest = lines.reduce((mx, l) => Math.max(mx, width(l)), 0);
    if (widest > box.width * 1.01) {
      issues.push({ kind: 'too-wide', slot: slot.role, detail: `a word is ${Math.round((widest / box.width - 1) * 100)}% wider than its box` });
    }

    const lineHeight = size * ((slot.size ?? 0.05) > 0.07 ? 1.06 : 1.28);
    const height = slot.treatment === 'disc' ? Math.max(box.width, lines.length * lineHeight) : lines.length * lineHeight;
    const span = slot.treatment === 'disc' ? box.width : Math.min(widest, box.width);
    const x0 = box.textAlign === 'center' ? box.left + (box.width - span) / 2
      : box.textAlign === 'right' ? box.left + box.width - span : box.left;
    blocks.push({ slot: slot.role, x0, x1: x0 + span, y0: box.top, y1: box.top + height });
  }

  for (const b of blocks) {
    if (b.y1 > h + 1 || b.y0 < -1) issues.push({ kind: 'off-canvas', slot: b.slot, detail: 'runs off the canvas' });
  }
  // A hair of tolerance: glyph boxes are taller than the ink inside them, so
  // two lines that merely share a pixel row do not read as touching.
  const slack = Math.min(w, h) * 0.004;
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i];
      const b = blocks[j];
      if (a.x0 < b.x1 - slack && a.x1 > b.x0 + slack && a.y0 < b.y1 - slack && a.y1 > b.y0 + slack) {
        issues.push({ kind: 'overlap', slot: a.slot, detail: `${a.slot} and ${b.slot} overlap` });
      }
    }
  }
  return issues;
}
