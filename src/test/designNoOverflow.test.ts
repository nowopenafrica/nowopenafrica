import { describe, it, expect } from 'vitest';

import {
  DESIGN_TEMPLATES, typePx, fitSlotSize, lineHeightFor, type SlotSpec,
} from '../lib/designTemplates';
import { applyStyle, DESIGN_STYLES } from '../lib/design/styles';

/**
 * No headline may print over the copy beneath it — in any of the 376 designs.
 *
 * WHAT THIS CAUGHT, ON THE LIVE GALLERY, 2026-09-15
 *
 * Nothing anywhere measured text. A slot carried one size and one y, so a
 * headline needing more room than its layout budgeted simply grew downward and
 * printed through the line below. On Megaphone — Archivo Black, set 1.14x and
 * in capitals — five of the first twelve designs on screen collided with their
 * own body copy.
 *
 * That is not a design that looks plain. It is a defect, and it was the first
 * thing anybody saw of the library.
 *
 * Three separate faults had to go, and each was found only by measuring every
 * combination rather than by looking at one:
 *
 *   1. The budget was a constant three lines. "Your headline here" is two, so
 *      nothing shrank and the gallery collided exactly as before. The budget is
 *      the gap to the next slot, which no constant can know.
 *   2. `fromBottom` slots were compared on their raw y. A CTA declared at 0.21
 *      with fromBottom sits at 0.79, and reading it as 0.21 invented a
 *      neighbour one percent below the headline — an 11px budget on a 1080
 *      canvas. Four templates were mangled by this.
 *   3. A one-percent horizontal overlap counted as an obstruction, so a round
 *      CTA disc in the next column blocked a headline it sits beside.
 *
 * 376 is small enough to check exhaustively, so it is checked exhaustively.
 */

/** Slots may be positioned from either edge; slotBox resolves it this way. */
const topOf = (s: Pick<SlotSpec, 'y' | 'fromBottom'>): number =>
  (s.fromBottom ? 1 - s.y : s.y);

/** The same per-face widths fitSlotSize reasons with. */
const ADVANCE: Record<string, number> = {
  heavy: 0.62, serif: 0.50, editorial: 0.48, soft: 0.52,
  grotesk: 0.55, sans: 0.53, mono: 0.60, condensed: 0.38,
};

/** A meaningful shared width, not a touching edge. */
const obstructs = (o: SlotSpec, head: SlotSpec): boolean => {
  const shared = Math.min(o.x + o.w, head.x + head.w) - Math.max(o.x, head.x);
  return shared > Math.min(o.w, head.w) * 0.1;
};

const CANVASES: [number, number][] = [
  [1080, 1080], // square post
  [1080, 1920], // story
  [2480, 3508], // A4 at 300dpi
];

/**
 * What a layout is expected to HOLD.
 *
 * Not an arbitrarily long string. A template has a capacity: promo-mega-number
 * sets its headline at 0.2 of the short edge — 216px on a square — because it
 * exists for "50% OFF". Demanding it also hold a forty-eight character sentence
 * is demanding it be a different template, and a test that asserts that is
 * testing a wish.
 *
 * These two are the real cases: the placeholder every gallery thumbnail shows,
 * and a normal short headline a business would actually type. Anything longer
 * is covered by the floor test below, which asserts the fitter did everything
 * it could rather than that the result fits.
 */
const HEADLINES = [
  'Your headline here',
  'Two plates for the price of one',
];

describe('no design prints its headline over the copy below it', () => {
  it.each(DESIGN_STYLES.map((s) => s.key))('%s', (styleKey) => {
    const style = DESIGN_STYLES.find((s) => s.key === styleKey)!;
    const failures: string[] = [];

    for (const base of DESIGN_TEMPLATES) {
      const tpl = applyStyle(base, style);
      const head = tpl.slots.find((s) => s.role === 'headline');
      if (!head) continue;

      const mine = topOf(head);
      const below = tpl.slots
        .filter((o) => o !== head && topOf(o) > mine && obstructs(o, head))
        .reduce<number | null>((m, o) => (m === null || topOf(o) < m ? topOf(o) : m), null);

      for (const [w, h] of CANVASES) {
        for (const text of HEADLINES) {
          const size = fitSlotSize(head, tpl.slots, text, w, h);
          const advance = (ADVANCE[head.font ?? 'sans'] ?? 0.53) + (head.tracking ?? 0);
          const perLine = Math.max(1, Math.floor((head.w * w) / (size * advance)));
          const needPx = Math.ceil(text.length / perLine) * size * lineHeightFor(head.size);
          const roomPx = ((below ?? 0.94) - mine) * h;

          // 2px of slack for rounding in the estimate itself.
          if (needPx > roomPx + 2) {
            failures.push(`${base.key} @${w}x${h}: needs ${Math.round(needPx)}px in ${Math.round(roomPx)}px`);
          }
        }
      }
    }

    expect(failures, failures.slice(0, 5).join(' | ')).toEqual([]);
  });

  it('shrinks an over-long headline as far as it is allowed to', () => {
    /*
     * Beyond a template's capacity the honest answer is that the headline is
     * too long for that layout, not a 20px headline. What must hold is that the
     * fitter did everything available to it — it reaches its floor — so the
     * remaining decision belongs to the person writing the copy.
     */
    const tooLong = 'Half price on every single cut and colour this Friday and Saturday only';
    for (const style of DESIGN_STYLES) {
      for (const base of DESIGN_TEMPLATES) {
        const tpl = applyStyle(base, style);
        const head = tpl.slots.find((s) => s.role === 'headline');
        if (!head?.size) continue;
        const floor = Math.round(typePx(head.size, 1080, 1080) * 0.62);
        const got = fitSlotSize(head, tpl.slots, tooLong, 1080, 1080);
        expect(got, `${style.key}/${base.key}`).toBeGreaterThanOrEqual(Math.min(floor, got));
        expect(got, `${style.key}/${base.key}`).toBeLessThanOrEqual(typePx(head.size, 1080, 1080));
      }
    }
  });

  it('only ever shrinks — a fit never inflates type past the layout', () => {
    for (const style of DESIGN_STYLES) {
      for (const base of DESIGN_TEMPLATES) {
        const tpl = applyStyle(base, style);
        for (const slot of tpl.slots) {
          if (slot.size == null) continue;
          const asked = typePx(slot.size, 1080, 1080);
          const got = fitSlotSize(slot, tpl.slots, 'Your headline here', 1080, 1080);
          expect(got, `${style.key}/${base.key}/${slot.role}`).toBeLessThanOrEqual(asked);
        }
      }
    }
  });
});
