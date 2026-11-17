import {
  slotBox, typePx, isListRole, listRowBoxes, fontStack, nearestWeight, shapeGeometry,
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
  kind: 'cut' | 'too-wide' | 'overlap' | 'off-canvas' | 'on-shape';
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

      // A list row is one line. The renderer cuts a label that is too long
      // rather than wrapping it, so a long row is a cut row.
      const face = slot.font ?? tpl.font;
      const rowFont = (weight: number) => `${nearestWeight(face, weight)} ${size}px ${fontStack(face)}`;
      const labels: { text: string; room: number }[] = [];
      if (slot.role === 'price') {
        for (const [i, item] of (content.price ?? []).slice(0, count).entries()) {
          const priceW = measure(item.price, rowFont(800), 0);
          const wasW = item.was ? measure(item.was, rowFont(800), 0) + size * 0.5 : 0;
          labels.push({ text: slot.upper ? item.label.toUpperCase() : item.label, room: rows[i].w - priceW - wasW - size * 0.8 });
        }
      } else if (slot.role === 'services' || slot.role === 'contact') {
        const indent = !slot.bullet || slot.bullet === 'none' ? 0 : size * (slot.bullet === 'number' ? 1.7 : 0.95);
        const list = (slot.role === 'services' ? content.services : content.contact) ?? [];
        for (const [i, text] of list.slice(0, count).entries()) {
          labels.push({ text: slot.upper ? text.toUpperCase() : text, room: rows[i].w - indent });
        }
      }
      for (const label of labels) {
        if (measure(label.text, rowFont(slot.weight ?? 600), 0) > label.room) {
          issues.push({ kind: 'cut', slot: slot.role, detail: `"${label.text}" is cut short with an ellipsis` });
        }
      }
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
  // Type sitting on a rule or a solid block. Only shapes whose bounds are their
  // real extent are checked: a rotated stripe or a corner wedge has a bounding
  // box far larger than its ink, and would report text that is nowhere near it.
  for (const shape of tpl.shapes ?? []) {
    if ((shape.alpha ?? 1) < 0.6 || shape.tone === 'base') continue;
    if (shape.kind !== 'rect' && shape.kind !== 'circle') continue;
    if (shape.kind === 'rect' && shape.skew) continue;
    const g = shapeGeometry(shape, w, h);
    const s0 = g.kind === 'circle'
      ? { x0: g.cx - g.r, x1: g.cx + g.r, y0: g.cy - g.r, y1: g.cy + g.r }
      : g.kind === 'rect' ? { x0: g.x, x1: g.x + g.w, y0: g.y, y1: g.y + g.h } : null;
    if (!s0) continue;
    for (const b of blocks) {
      if (b.x0 < s0.x1 && b.x1 > s0.x0 && b.y0 < s0.y1 && b.y1 > s0.y0) {
        issues.push({ kind: 'on-shape', slot: b.slot, detail: `${b.slot} sits on a solid ${shape.kind}` });
      }
    }
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
