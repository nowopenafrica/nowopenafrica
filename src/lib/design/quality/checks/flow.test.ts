import { describe, expect, it } from 'vitest';

import { templateByKey, type DesignTemplate } from '../../../designTemplates';
import { sampleFor } from '../../../create/sampleCopy';
import { PILOT_TEMPLATES } from '../../pilotTemplates';
import { billboardProblems, instagramCropProblems, shapeEdgeCrossings, textOverlaps, textRects } from './flow';
import { canvasFor } from './geometry';

const BOARD = { w: 3600, h: 1800 };

/**
 * bb-contemporary as it shipped at b2ec329, before Task 18c-1: a 0.3
 * headline in Bebas over a 0.55 column, the handle on the foot band beneath.
 * Kept here verbatim so the check is proved against the real collision.
 */
const BB_CONTEMPORARY_BEFORE: DesignTemplate = {
  ...templateByKey('pilot-bb-contemporary'),
  photo: undefined,
  shapes: [
    { kind: 'rect', x: 0, y: 0.78, w: 1, h: 0.22, tone: 'base' },
    { kind: 'rect', x: 0, y: 0.78, w: 0.03, h: 0.22, tone: 'secondary' },
  ],
  slots: [
    { role: 'headline', x: 0.4, y: 0.08, w: 0.55, size: 0.3, weight: 700, upper: true, align: 'right', font: 'condensed' },
    { role: 'brand', x: 0.05, y: 0.84, w: 0.5, size: 0.06, weight: 700, upper: true, tracking: 0.1 },
    { role: 'contact', x: 0.58, y: 0.84, w: 0.37, size: 0.06, weight: 700, direction: 'row', max: 1, tone: 'accent' },
  ],
};

/** Its copy at b2ec329, before the finished lines of Task 18c-2 (D1). */
const BEFORE_COPY = { ...sampleFor(BB_CONTEMPORARY_BEFORE), headline: 'Your campaign line', contact: ['@yourhandle'] };

describe('text overlap (S4b)', () => {
  it('catches the bb-contemporary headline running into its handle, as it shipped', () => {
    const found = textOverlaps(BB_CONTEMPORARY_BEFORE, BEFORE_COPY, BOARD.w, BOARD.h);
    expect(found.join('\n')).toMatch(/front\.headline runs into front\.contact/);
  });

  it('wraps word by word: YOUR CAMPAIGN LINE is three lines in that column, not two', () => {
    const r = textRects(BB_CONTEMPORARY_BEFORE, BEFORE_COPY, BOARD.w, BOARD.h)
      .find((x) => x.role === 'headline')!;
    // Three lines of 540 px type at 1.03 leading.
    expect(r.h).toBeGreaterThan(540 * 1.03 * 2.5);
  });

  it('finds no collision on any pilot, on any page, with the demo copy', () => {
    const found: string[] = [];
    for (const t of PILOT_TEMPLATES) {
      const { w, h } = canvasFor(t);
      for (const o of textOverlaps(t, sampleFor(t), w, h)) found.push(`${t.key}: ${o}`);
    }
    expect(found).toEqual([]);
  });
});

describe('billboard checks (S5)', () => {
  it('flags the shipped board: a 0.06 brand and handle', () => {
    const found = billboardProblems(BB_CONTEMPORARY_BEFORE, BEFORE_COPY, BOARD.w, BOARD.h);
    expect(found.join('\n')).toMatch(/front\.brand is 0\.06\d* of the board's height, below 0\.08/);
    expect(found.join('\n')).toMatch(/front\.contact is 0\.06\d* of the board's height, below 0\.07/);
  });

  it('counts words across the slots, leaving out the name and one action line', () => {
    const wordy: DesignTemplate = {
      ...BB_CONTEMPORARY_BEFORE,
      slots: [
        ...BB_CONTEMPORARY_BEFORE.slots,
        { role: 'eyebrow', x: 0.05, y: 0.02, w: 0.5, size: 0.08 },
      ],
    };
    const copy = { ...BEFORE_COPY, eyebrow: 'one two three four five' };
    // Headline 3 words + eyebrow 5 = 8.
    expect(billboardProblems(wordy, copy, BOARD.w, BOARD.h).join('\n')).toMatch(/8 words/);
    expect(billboardProblems(BB_CONTEMPORARY_BEFORE, BEFORE_COPY, BOARD.w, BOARD.h).join('\n'))
      .not.toMatch(/words/);
  });

  it('passes every pilot billboard', () => {
    const found = PILOT_TEMPLATES.filter((t) => t.key.startsWith('pilot-bb'))
      .flatMap((t) => billboardProblems(t, sampleFor(t), BOARD.w, BOARD.h).map((p) => `${t.key}: ${p}`));
    expect(found).toEqual([]);
  });
});

describe('fix round 1: the action line is one line', () => {
  it('counts every contact row after the first', () => {
    const tpl: DesignTemplate = {
      ...BB_CONTEMPORARY_BEFORE,
      slots: BB_CONTEMPORARY_BEFORE.slots.map((s) => (s.role === 'contact' ? { ...s, max: 3, size: 0.08 } : { ...s, size: Math.max(0.08, s.size ?? 0) })),
    };
    // Headline 3 + rows two and three (3 + 3) = 9; the first row is the action line.
    const copy = { ...BEFORE_COPY, contact: ['@yourhandle', 'call us now', 'visit our shop'] };
    expect(billboardProblems(tpl, copy, BOARD.w, BOARD.h).join('\n')).toMatch(/9 words/);
    expect(billboardProblems(tpl, { ...copy, contact: ['@yourhandle'] }, BOARD.w, BOARD.h).join('\n')).not.toMatch(/words/);
  });
});

describe('Task 18c-2: words across a shape edge (S4b, second half)', () => {
  it('catches a line set on the yellow that runs up into the red band', () => {
    const card = templateByKey('pilot-card-bold');
    // The band ends at 0.58; the house's name (set on the ground) moved to 0.56 straddles its foot.
    const straddling: DesignTemplate = {
      ...card,
      slots: card.slots.map((s) => (s.role === 'brand' ? { ...s, y: 0.56 } : s)),
    };
    const { w, h } = canvasFor(card);
    expect(shapeEdgeCrossings(straddling, sampleFor(card), w, h).join('\n'))
      .toMatch(/front\.brand runs across the edge of a primary rect/);
    expect(shapeEdgeCrossings(card, sampleFor(card), w, h)).toEqual([]);
  });

  it('reads the ground round a photo box as one shape, so its inner seams are not edges', () => {
    const t = templateByKey('pilot-ig-contemporary');
    expect(shapeEdgeCrossings(t, sampleFor(t), 1080, 1350)).toEqual([]);
  });

  it('finds no crossing on any pilot', () => {
    const found = PILOT_TEMPLATES.flatMap((t) => {
      const { w, h } = canvasFor(t);
      return shapeEdgeCrossings(t, sampleFor(t), w, h).map((x) => `${t.key}: ${x}`);
    });
    expect(found).toEqual([]);
  });
});

describe('Task 18c-2: the Instagram crops (S13, Ruling AN)', () => {
  it('flags words outside the 3:4 profile crop, and a headline in the square crop band', () => {
    const t = templateByKey('pilot-ig-bold');
    const wide: DesignTemplate = {
      ...t,
      slots: t.slots.map((s) => (s.role === 'brand' ? { ...s, x: 0.01 } : s.role === 'headline' ? { ...s, y: 0.05 } : s)),
    };
    const found = instagramCropProblems(wide, sampleFor(t), 1080, 1350).join('\n');
    expect(found).toMatch(/front\.brand reaches outside the 3:4 profile crop/);
    expect(found).toMatch(/front\.headline reaches outside the square crop band/);
  });

  it('passes every pilot post', () => {
    const found = PILOT_TEMPLATES.filter((t) => t.key.startsWith('pilot-ig'))
      .flatMap((t) => instagramCropProblems(t, sampleFor(t), 1080, 1350).map((x) => `${t.key}: ${x}`));
    expect(found).toEqual([]);
  });
});

describe('Task 18c-2 fix round 1: the edge check (Ruling AX2) and hairlines', () => {
  const card = templateByKey('pilot-card-bold');
  const { w, h } = canvasFor(card);

  it('flags a line set on the band that runs off its foot', () => {
    // The headline is `on: primary`; the band ends at 0.58. At 0.5 its two lines hang below the band.
    const off: DesignTemplate = { ...card, slots: card.slots.map((s) => (s.role === 'headline' ? { ...s, y: 0.5 } : s)) };
    expect(shapeEdgeCrossings(off, sampleFor(card), w, h).join('\n'))
      .toMatch(/front\.headline runs across the primary it is set on/);
    expect(shapeEdgeCrossings(card, sampleFor(card), w, h)).toEqual([]);
  });

  it('flags a rule drawn through the words, however thin', () => {
    const struck: DesignTemplate = {
      ...card,
      shapes: [...(card.shapes ?? []), { kind: 'rect', x: 0.05, y: 0.2, w: 0.9, h: 0.004, tone: 'ink' }],
    };
    expect(shapeEdgeCrossings(struck, sampleFor(card), w, h).join('\n'))
      .toMatch(/front\.headline runs across the edge of a ink rect \(a rule through the words\)/);
  });

  it('counts a pill by its chrome, not just its words', () => {
    const t = templateByKey('pilot-bb-industry');
    const r = textRects(t, sampleFor(t), 3600, 1800).find((x) => x.role === 'cta')!;
    const slot = t.slots.find((s) => s.role === 'cta')!;
    // The pill starts at the slot's top and is padded beyond the words.
    expect(r.y).toBeCloseTo(slot.y * 1800, 6);
    const brand = textRects(t, sampleFor(t), 3600, 1800).find((x) => x.role === 'brand')!;
    // At least 0.04 of the height clear between the pill and the name (the screenshot finding).
    expect(brand.y - (r.y + r.h)).toBeGreaterThanOrEqual(0.04 * 1800);
  });
});
