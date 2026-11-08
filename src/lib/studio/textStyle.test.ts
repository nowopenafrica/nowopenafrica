import { describe, it, expect } from 'vitest';

import {
  clampLineHeight, clampOpacity, clampTextSize, clampTracking, FONT_CHOICES, MAX_TEXT_SIZE,
  MIN_TEXT_SIZE, NOT_YET_OFFERED, opacityToPercent, percentToOpacity, percentToSize, resolveWeight, safeColour,
  sizeToPercent, weightsFor,
} from './textStyle';
import { FONT_STACKS, TYPEFACES } from '../design/typefaces';

describe('the faces on offer', () => {
  it('offers every typeface the product actually ships, except those held back', () => {
    expect(FONT_CHOICES).toHaveLength(TYPEFACES.length - NOT_YET_OFFERED.size);
    for (const key of NOT_YET_OFFERED) expect(FONT_CHOICES.map((c) => c.key)).not.toContain(key);
    for (const choice of FONT_CHOICES) {
      expect(FONT_STACKS[choice.key], choice.key).toBeTruthy();
    }
  });

  it('calls them by the names a designer would recognise', () => {
    const labels = FONT_CHOICES.map((c) => c.label);
    expect(labels).toContain('Playfair Display');
    expect(labels).toContain('Space Mono');
    /* Not the internal role names. */
    expect(labels).not.toContain('serif');
  });

  it('explains what each one is for', () => {
    for (const choice of FONT_CHOICES) expect(choice.voice.length, choice.key).toBeGreaterThan(10);
  });
});

describe('weights', () => {
  /*
   * Asking a browser for a weight a face does not ship gets a synthesised
   * fake: smeared on screen, and different again in an export. Each face
   * offers its own.
   */
  it('offers only the weights the chosen face really has', () => {
    for (const face of TYPEFACES) {
      expect(weightsFor(face.key), face.key).toEqual(face.weights);
    }
  });

  it('snaps a weight from an older document to one that exists', () => {
    const heavy = TYPEFACES.find((f) => f.weights.length === 1);
    if (heavy) expect(resolveWeight(heavy.key, 300)).toBe(heavy.weights[0]);
    expect(weightsFor('sans')).toContain(resolveWeight('sans', 450));
  });

  it('copes with nonsense', () => {
    expect(Number.isFinite(resolveWeight('sans', Number.NaN))).toBe(true);
    expect(weightsFor(undefined).length).toBeGreaterThan(0);
  });
});

describe('bounds that keep an object visible', () => {
  /*
   * A size of zero is not an unusual design. It is an object that has
   * vanished, with nothing on screen to say why.
   */
  it('keeps text big enough to see and small enough to fit', () => {
    expect(clampTextSize(0)).toBe(MIN_TEXT_SIZE);
    expect(clampTextSize(-4)).toBe(MIN_TEXT_SIZE);
    expect(clampTextSize(99)).toBe(MAX_TEXT_SIZE);
    expect(clampTextSize(0.06)).toBe(0.06);
    expect(clampTextSize(Number.NaN)).toBe(0.05);
  });

  it('keeps opacity between invisible and solid', () => {
    expect(clampOpacity(-1)).toBe(0);
    expect(clampOpacity(40)).toBe(1);
    expect(clampOpacity(0.35)).toBe(0.35);
    expect(clampOpacity(Number.NaN)).toBe(1);
  });

  /* Fully transparent is allowed; the layers list is how it is found again. */
  it('allows fully transparent', () => {
    expect(clampOpacity(0)).toBe(0);
  });

  it('keeps tracking and line height inside what is still readable', () => {
    expect(clampTracking(-5)).toBe(-0.1);
    expect(clampTracking(5)).toBe(0.5);
    expect(clampLineHeight(0)).toBe(0.7);
    expect(clampLineHeight(99)).toBe(3);
    expect(clampLineHeight(Number.NaN)).toBe(1.1);
  });
});

describe('what the sliders show', () => {
  it('shows a size as a percentage of the page', () => {
    expect(sizeToPercent(0.05)).toBe(5);
    expect(percentToSize(5)).toBeCloseTo(0.05, 6);
  });

  it('shows opacity as a percentage', () => {
    expect(opacityToPercent(0.35)).toBe(35);
    expect(percentToOpacity(35)).toBeCloseTo(0.35, 6);
  });

  it('round-trips without drifting', () => {
    for (const size of [0.01, 0.05, 0.12, 0.3]) {
      expect(percentToSize(sizeToPercent(size))).toBeCloseTo(size, 3);
    }
    for (const o of [0, 0.25, 0.5, 1]) {
      expect(percentToOpacity(opacityToPercent(o))).toBeCloseTo(o, 6);
    }
  });

  it('never shows NaN from an empty field', () => {
    expect(Number.isFinite(percentToSize(Number.NaN))).toBe(true);
    expect(Number.isFinite(percentToOpacity(Number.NaN))).toBe(true);
  });
});

describe('colours', () => {
  it('accepts what a colour input produces', () => {
    expect(safeColour('#0a7d4b')).toBe('#0a7d4b');
    expect(safeColour('#FFF')).toBe('#ffffff');
  });

  /*
   * An unparseable colour returns undefined so the renderer falls back to its
   * default. Writing the bad value into the style instead loses the text.
   */
  it('refuses anything it cannot be sure of', () => {
    for (const bad of ['red; background:url(x)', 'rgb(1,2,3)', 'nonsense', '', undefined]) {
      expect(safeColour(bad as string), String(bad)).toBeUndefined();
    }
  });
});
