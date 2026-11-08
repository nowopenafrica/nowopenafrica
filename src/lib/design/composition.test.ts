import { describe, expect, it } from 'vitest';
import { DESIGN_TEMPLATES, templateByKey, type DesignTemplate } from '../designTemplates';
import type { DirectionKey } from './directions';
import { describe as describeTpl, directionOverflow, distance, distinctnessIssues, type Descriptor } from './composition';

// Real keys that all belong to the 'flyer' subcategory, so clones group together.
const FLYER_KEYS = ['editorial-split', 'photo-foot', 'grid-baseline', 'before-after', 'property-listing'];

const clone = (key: string, direction: DirectionKey, patch: Partial<DesignTemplate> = {}): DesignTemplate => ({
  ...templateByKey('editorial-split'),
  key,
  direction,
  ...patch,
});

describe('composition descriptor', () => {
  it('describes editorial-split (anchor checked by hand)', () => {
    // Headline: x 0.08, w 0.84 -> centre 0.50 -> middle column 'c'.
    // y 0.44 is in the middle third (0.333..0.667) -> row 'm'. So 'mc'.
    // Headline size 0.092 is 0.092 of the short edge; the step is its index
    // among the library's distinct headline sizes.
    // Photo-led and only a 1.4%-wide rail covers it -> over 60% -> 3.
    // Slots: brand, eyebrow, headline, subline, meta = 5 text blocks (qr is not text).
    // No slot sets align, so all five are left -> 'left'.
    // The rail is a rect but does not reach the headline -> container false.
    expect(describeTpl(templateByKey('editorial-split'))).toMatchInlineSnapshot(`
      {
        "align": "left",
        "anchor": "mc",
        "container": false,
        "headlineStep": 20,
        "imageShare": 3,
        "pattern": "none",
        "textBlocks": 5,
      }
    `);
  });

  it('puts distance 0 between a descriptor and itself, and 1 for align alone', () => {
    const d = describeTpl(templateByKey('editorial-split'));
    expect(distance(d, d)).toBe(0);
    const other: Descriptor = { ...d, align: 'center' };
    expect(distance(d, other)).toBe(1);
  });

  it('gives a photoLed full-bleed template imageShare 3, and no photo 0', () => {
    expect(describeTpl(templateByKey('editorial-split')).imageShare).toBe(3);
    expect(describeTpl({ ...templateByKey('editorial-split'), photoLed: false }).imageShare).toBe(0);
  });

  it('buckets a photo half hidden by an opaque panel as 25-60%', () => {
    const t = {
      ...templateByKey('editorial-split'),
      shapes: [{ kind: 'rect' as const, x: 0, y: 0.5, w: 1, h: 0.5, tone: 'base' as const }],
    };
    expect(describeTpl(t).imageShare).toBe(2);
  });

  it('flags two same-slot templates that differ only in palette', () => {
    const a = clone(FLYER_KEYS[0], 'luxury');
    const b = clone(FLYER_KEYS[1], 'bold', { look: { palette: 'other', type: 'editorial' } });
    const issues = distinctnessIssues([a, b]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ subcategory: 'flyer', a: FLYER_KEYS[0], b: FLYER_KEYS[1], distance: 0 });
  });

  it('does not flag templates that differ in 3 or more features', () => {
    const a = clone(FLYER_KEYS[0], 'luxury');
    const b = clone(FLYER_KEYS[1], 'bold', {
      photoLed: false,
      slots: a.slots.map((s) => (s.role === 'headline' ? { ...s, y: 0.1, x: 0.7, w: 0.3 } : s)).map((s) => ({ ...s, align: 'center' as const })),
    });
    expect(distinctnessIssues([a, b])).toEqual([]);
  });

  it('flags three of one direction in one subcategory', () => {
    const ts = FLYER_KEYS.slice(0, 3).map((k) => clone(k, 'bold'));
    expect(directionOverflow(ts)).toEqual([{ subcategory: 'flyer', direction: 'bold', keys: FLYER_KEYS.slice(0, 3) }]);
    expect(directionOverflow(ts.slice(0, 2))).toEqual([]);
  });

  it('compares only templates with a direction, so today both return []', () => {
    expect(distinctnessIssues(DESIGN_TEMPLATES)).toEqual([]);
    expect(directionOverflow(DESIGN_TEMPLATES)).toEqual([]);
  });
});
