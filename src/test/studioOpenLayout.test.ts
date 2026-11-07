import { describe, expect, it } from 'vitest';

import { DESIGN_TEMPLATES } from '../lib/designTemplates';
import { sampleFor } from '../lib/create/sampleCopy';
import { documentFromTemplate } from '../lib/studio/designDocument';
import { DESIGN_STYLES } from '../lib/design/styles';

/**
 * What "Open in Studio" hands the editor.
 *
 * ── THE COMPLAINT THIS ENCODES ───────────────────────────────────────────
 *
 * "Open in Studio still scatters the layout." It did, and the cause was not
 * the editor: it was the geometry of the document the editor was given.
 *
 * `documentFromTemplate` sized every text box at 1.55 line-heights — a
 * fourth copy of a number whose own definition carries the comment "Three
 * copies of one number is how a preview stops matching an export".
 * `lineHeightFor` is 1.03 for display type and 1.25 for body, so every box
 * stood 24-50% taller than the words in it. Two further faults compounded
 * it: the fitter refused to shrink past 62% of nominal however little room
 * there was, and it did not know about the extra gap a multi-line list is
 * set with.
 *
 * MEASURED BEFORE: 21 layouts had text boxes overlapping by more than 20%,
 * six of them by 100% — one box entirely inside another. In a gallery card
 * that reads as crowding. In an editor it means clicking a headline selects
 * and drags something else, which is exactly what "scattered" looked like.
 * Four more boxes hung off the bottom of the page, where an exported image
 * does not clip them, it loses them.
 *
 * MEASURED AFTER: zero of each.
 */

const PAGES = [
  { label: 'square', width: 1080, height: 1080 },
  { label: 'story', width: 1080, height: 1920 },
  { label: 'landscape', width: 1920, height: 1080 },
];

type Box = { x: number; y: number; w: number; h: number; slotRole?: string };

const textBoxes = (
  t: (typeof DESIGN_TEMPLATES)[number],
  page: { width: number; height: number },
  styleKey: string,
): Box[] =>
  documentFromTemplate(t, sampleFor(t), { ...page, styleKey, accent: '#2563eb' })
    .pages[0].objects.filter((o) => o.type === 'text') as Box[];

describe('a template opened in the editor is laid out, not scattered', () => {
  it('keeps every text box on the page', () => {
    for (const page of PAGES) {
      for (const t of DESIGN_TEMPLATES) {
        for (const b of textBoxes(t, page, 'signature')) {
          const over = Math.max(-b.x, -b.y, b.x + b.w - 1, b.y + b.h - 1);
          expect(over, `${t.key} ${b.slotRole} on ${page.label}`).toBeLessThanOrEqual(0.005);
        }
      }
    }
  });

  /*
   * Boxes may touch and may share a little space — a pill CTA sitting under a
   * price is fine. What is never fine is one box swallowing another, because
   * then the only way to select the one underneath is to move the one on top.
   */
  it('never puts one text box on top of another', () => {
    const offenders: string[] = [];
    for (const page of PAGES) {
      for (const t of DESIGN_TEMPLATES) {
        const boxes = textBoxes(t, page, 'signature');
        for (let i = 0; i < boxes.length; i += 1) {
          for (let j = i + 1; j < boxes.length; j += 1) {
            const a = boxes[i];
            const b = boxes[j];
            const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            if (ox <= 0 || oy <= 0) continue;
            const share = (ox * oy) / Math.min(a.w * a.h, b.w * b.h);
            if (share < 0.2) continue;
            offenders.push(`${t.key}/${page.label}: ${a.slotRole} x ${b.slotRole} ${(share * 100).toFixed(0)}%`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /*
   * The style is a decision the person made on the Create screen. Every one
   * of them has to survive the trip, or the editor silently throws it away —
   * which is the other half of "it changes completely when I open it".
   */
  it('carries the chosen style and brand colour into the document', () => {
    const t = DESIGN_TEMPLATES[0];
    for (const style of DESIGN_STYLES) {
      const doc = documentFromTemplate(t, sampleFor(t), {
        width: 1080, height: 1080, styleKey: style.key, accent: '#16a34a',
      });
      expect(doc.styleKey, style.key).toBe(style.key);
      expect(doc.accent, style.key).toBe('#16a34a');
      /* And it is dressed: a ground to stand on, not a white page. */
      expect(doc.pages[0].background, style.key).toBeTruthy();
    }
  });

  /* Every layout arrives with its shapes, or "rich" is just a word. */
  it('brings the layout its shapes as real objects', () => {
    let withShapes = 0;
    for (const t of DESIGN_TEMPLATES) {
      const page = documentFromTemplate(t, sampleFor(t), {
        width: 1080, height: 1080, styleKey: 'signature', accent: '#2563eb',
      }).pages[0];
      if (page.objects.some((o) => o.type === 'shape')) withShapes += 1;
    }
    expect(withShapes).toBe(DESIGN_TEMPLATES.length);
  });
});
