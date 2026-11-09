import { describe, expect, it } from 'vitest';

import { templateByKey, type DesignTemplate } from '../../../designTemplates';
import { sampleFor } from '../../../create/sampleCopy';
import { PILOT_TEMPLATES } from '../../pilotTemplates';
import { billboardProblems, textOverlaps, textRects } from './flow';
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

describe('text overlap (S4b)', () => {
  it('catches the bb-contemporary headline running into its handle, as it shipped', () => {
    const found = textOverlaps(BB_CONTEMPORARY_BEFORE, sampleFor(BB_CONTEMPORARY_BEFORE), BOARD.w, BOARD.h);
    expect(found.join('\n')).toMatch(/front\.headline runs into front\.contact/);
  });

  it('wraps word by word: YOUR CAMPAIGN LINE is three lines in that column, not two', () => {
    const r = textRects(BB_CONTEMPORARY_BEFORE, sampleFor(BB_CONTEMPORARY_BEFORE), BOARD.w, BOARD.h)
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
    const found = billboardProblems(BB_CONTEMPORARY_BEFORE, sampleFor(BB_CONTEMPORARY_BEFORE), BOARD.w, BOARD.h);
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
    const copy = { ...sampleFor(wordy), eyebrow: 'one two three four five' };
    // Headline 3 words + eyebrow 5 = 8.
    expect(billboardProblems(wordy, copy, BOARD.w, BOARD.h).join('\n')).toMatch(/8 words/);
    expect(billboardProblems(BB_CONTEMPORARY_BEFORE, sampleFor(BB_CONTEMPORARY_BEFORE), BOARD.w, BOARD.h).join('\n'))
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
    const copy = { ...sampleFor(tpl), contact: ['@yourhandle', 'call us now', 'visit our shop'] };
    expect(billboardProblems(tpl, copy, BOARD.w, BOARD.h).join('\n')).toMatch(/9 words/);
    expect(billboardProblems(tpl, { ...copy, contact: ['@yourhandle'] }, BOARD.w, BOARD.h).join('\n')).not.toMatch(/words/);
  });
});
