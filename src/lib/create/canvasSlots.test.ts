import { describe, expect, it } from 'vitest';

import {
  assignRoles, hexOf, listRoleFor, luminance, shapeFrom, slotFrom, surfaceFrom,
  templateFromArtboard, toneOf,
} from './canvasSlots';
import { radiusPx } from './measureArtboard';
import type { MeasuredRun, MeasuredShape } from './measureArtboard';
import type { ParsedArtboard } from './designCanvas';

const board = (over: Partial<ParsedArtboard> = {}): ParsedArtboard => ({
  title: 'Bold typographic',
  width: 1080,
  height: 1350,
  background: '#0B1222',
  ink: '#FFFFFF',
  html: '<div></div>',
  props: {},
  tokenText: {},
  notes: [],
  ...over,
});

const run = (over: Partial<MeasuredRun> = {}): MeasuredRun => ({
  text: 'Something',
  x: 72, y: 80, w: 936, h: 30,
  fontSize: 24, fontWeight: 400, upper: false, tracking: 0,
  align: 'left', display: false, chip: false,
  ...over,
});

/*
 * The real geometry of T01 Bold typographic, measured in a browser at
 * 1080×1350. Written down because the numbers are the point: y=692 for the
 * headline is produced by `margin-top: auto`, which no parser can know.
 */
const T01: MeasuredRun[] = [
  run({ text: 'Campaign 01', token: 'kicker', y: 80, h: 30, fontSize: 24, fontWeight: 600, upper: true, tracking: 0.16 }),
  run({ text: 'Something bigger is opening.', y: 692, h: 433, fontSize: 168, fontWeight: 700, tracking: -0.06, display: true }),
  run({ text: 'Discover NowOpen →', token: 'cta', x: 72, y: 1211, w: 344, h: 75, fontSize: 28, fontWeight: 600, chip: true }),
  run({ text: 'NOWOPEN AFRICA', x: 823, y: 1233, w: 185, h: 31, fontSize: 26, fontWeight: 700, display: true }),
];

describe('reading a measured artboard as a template', () => {
  it('places every line of a real board', () => {
    const built = templateFromArtboard(board(), T01);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.template.slots).toHaveLength(4);
    expect(built.skipped).toEqual([]);
  });

  it('turns measured pixels into fractions of the canvas', () => {
    const built = templateFromArtboard(board(), T01);
    if (!built.ok) throw new Error('refused');
    const eyebrow = built.template.slots.find((s) => s.role === 'eyebrow')!;
    expect(eyebrow.x).toBeCloseTo(72 / 1080, 4);
    expect(eyebrow.y).toBeCloseTo(80 / 1350, 4);
    /*
     * Size is a fraction of the SHORT edge, which is what `typePx` multiplies
     * by. Dividing by the width instead is a bug this codebase has shipped
     * before, and it is invisible on a square canvas.
     */
    expect(eyebrow.size).toBeCloseTo(24 / 1080, 4);
  });

  it('pins the bottom third from the bottom, so a footer survives a taller canvas', () => {
    const built = templateFromArtboard(board(), T01);
    if (!built.ok) throw new Error('refused');
    const cta = built.template.slots.find((s) => s.role === 'cta')!;
    expect(cta.fromBottom).toBe(true);
    expect(cta.y).toBeCloseTo((1350 - (1211 + 75)) / 1350, 4);
    /* The eyebrow is at the top and must stay measured from the top. */
    expect(built.template.slots.find((s) => s.role === 'eyebrow')!.fromBottom).toBeUndefined();
  });
});

describe('which line is the headline', () => {
  /*
   * Measured on T15: the board declares {{number}} at 300px above
   * {{headline}} at 92px. Following the token name would put the user's own
   * headline in the small slot and their supporting line in the huge one —
   * the layout inverted.
   */
  it('follows size, not the name the author gave the token', () => {
    const runs = [
      run({ text: '1,000', token: 'number', y: 400, fontSize: 300, display: true }),
      run({ text: 'Be among the first.', token: 'headline', y: 760, fontSize: 92, display: true }),
    ];
    const drafts = assignRoles(runs, board());
    expect(drafts.find((d) => d.role === 'headline')?.run.text).toBe('1,000');
  });

  it('never lets a brand lockup become the headline', () => {
    const runs = [
      run({ text: 'NOWOPEN AFRICA', fontSize: 400, display: true }),
      run({ text: 'Your business deserves to be found.', y: 500, fontSize: 90 }),
    ];
    const drafts = assignRoles(runs, board());
    expect(drafts.find((d) => d.role === 'brand')?.run.text).toBe('NOWOPEN AFRICA');
    expect(drafts.find((d) => d.role === 'headline')?.run.text).toContain('deserves');
  });

  it('reads an eyebrow from how it is set, not where it sits', () => {
    const runs = [
      run({ text: 'A headline', y: 500, fontSize: 120 }),
      run({ text: 'SERIES 01', y: 900, fontSize: 22, upper: true, tracking: 0.16 }),
    ];
    const drafts = assignRoles(runs, board());
    expect(drafts.find((d) => d.role === 'eyebrow')?.run.text).toBe('SERIES 01');
  });

  it('reads a run with its own ground as a button', () => {
    const runs = [
      run({ text: 'A headline', fontSize: 120 }),
      run({ text: 'Claim now', y: 1200, fontSize: 28, chip: true }),
    ];
    expect(assignRoles(runs, board()).find((d) => d.role === 'cta')?.run.text).toBe('Claim now');
  });
});

describe('a repeating group is one list, not five headlines', () => {
  const rows = ['Logo & identity', 'Social templates', 'Print collateral', 'Packaging'];

  it('claims a list role before anything competes for it', () => {
    const runs = [
      run({ text: 'A headline', fontSize: 96 }),
      run({ text: rows.join(' · '), rows, flow: 'column', y: 600, fontSize: 34 }),
    ];
    const drafts = assignRoles(runs, board());
    expect(drafts.find((d) => d.role === 'services')?.run.rows).toEqual(rows);
  });

  it('caps the rows at what was measured, so a longer list cannot overrun', () => {
    const slot = slotFrom(
      { role: 'services', run: run({ rows, flow: 'column' }), because: '' },
      board(),
    );
    expect(slot.max).toBe(4);
    expect(slot.direction).toBeUndefined();
  });

  it('lays a side-by-side group across rather than down', () => {
    const slot = slotFrom(
      { role: 'stats', run: run({ rows: ['120', '40', '9'], flow: 'row' }), because: '' },
      board(),
    );
    expect(slot.direction).toBe('row');
  });

  /* Read off the words: a price column and a service column sit in the
     same place on different designs. */
  it('tells prices, stats, contacts and services apart', () => {
    expect(listRoleFor(['Haircut ₦2,500', 'Shave ₦1,200', 'Beard ₦900'])).toBe('price');
    expect(listRoleFor(['hello@shop.com', '+2348012345678', 'www.shop.com'])).toBe('contact');
    expect(listRoleFor(['120', '40', '9'])).toBe('stats');
    expect(listRoleFor(['01 Logo & identity', '02 Print', '03 Packaging'])).toBe('services');
  });
});

describe('refusing rather than importing a half', () => {
  it('refuses a presentation sheet showing several designs', () => {
    const many = Array.from({ length: 20 }, (_, i) => run({ text: `Item ${i}`, y: i * 50 }));
    const out = templateFromArtboard(board(), many);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toContain('20 separate pieces of text');
  });

  it('refuses when more is left out than brought in, and names what', () => {
    const runs = [
      run({ text: 'A headline', fontSize: 96 }),
      ...Array.from({ length: 9 }, (_, i) => run({ text: `Orphan ${i}`, y: 300 + i * 40, fontSize: 30 })),
    ];
    const out = templateFromArtboard(board(), runs);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/richer than a slot template/);
    expect(out.reason).toContain('Orphan');
  });

  it('refuses an artboard with nothing measurable on it', () => {
    expect(templateFromArtboard(board(), []).ok).toBe(false);
  });
});

describe('what the import deliberately leaves behind', () => {
  it('stores no words at all — copy comes from whoever uses the template', () => {
    const built = templateFromArtboard(board(), T01);
    if (!built.ok) throw new Error('refused');
    const json = JSON.stringify(built.template);
    expect(json).not.toContain('NOWOPEN');
    expect(json).not.toContain('Discover NowOpen');
    expect(json).not.toContain('Something bigger');
  });

  it('says out loud that the palette did not come across', () => {
    const built = templateFromArtboard(board(), T01);
    if (!built.ok) throw new Error('refused');
    expect(built.notes.join(' ')).toMatch(/Colours are not imported/);
  });

  it('reads the ground to decide light text or dark', () => {
    expect(luminance('#0B1222')).toBeLessThan(0.1);
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 2);
    /* A token that was never resolved is not a colour, and says so. */
    expect(luminance('{{bg}}')).toBeNull();

    const dark = templateFromArtboard(board({ background: '#0B1222' }), T01);
    const light = templateFromArtboard(board({ background: '#FFFFFF' }), T01);
    expect(dark.ok && dark.template.scheme).toBe('dark');
    expect(light.ok && light.template.scheme).toBe('light');
  });

  it('reads the kind of ground it was', () => {
    expect(surfaceFrom('#2563EB').kind).toBe('solid');
    expect(surfaceFrom('linear-gradient(140deg,#000,#fff)').kind).toBe('gradient');
    expect(surfaceFrom('linear-gradient(140deg,#000,#fff)').angle).toBe(140);
    expect(surfaceFrom('radial-gradient(circle,#000,#fff)').kind).toBe('spotlight');
  });
});

const box = (over: Partial<MeasuredShape> = {}): MeasuredShape => ({
  x: 72, y: 600, w: 936, h: 6,
  radius: 0, fill: 'rgb(37, 99, 235)', gradient: false,
  stroke: null, strokeWidth: 0, opacity: 1, rotation: 0, isImage: false,
  ...over,
});

describe('the painted layer', () => {
  /*
   * The first import read text and nothing else, and produced 71 templates
   * of words on a flat ground while the 66 written in code carried geometry
   * on 35 and photography on 29. A design is not its sentences.
   */
  it('brings bars, panels and discs across', () => {
    const built = templateFromArtboard(board(), T01, [
      box(),
      box({ y: 1200, w: 344, h: 75, radius: 999 }),
      box({ x: 400, y: 200, w: 220, h: 220, radius: 110 }),
    ]);
    if (!built.ok) throw new Error('refused');
    expect(built.template.shapes).toHaveLength(3);
    expect(built.template.shapes?.map((s) => s.kind).sort()).toEqual(['circle', 'rect', 'rect']);
  });

  /*
   * THE REASON AN IMPORTED DESIGN CAN BELONG TO SOMEBODY ELSE. A blue pill
   * and a rainbow rule both read as ACCENT, so they come out in the user's
   * brand colour. Carrying the hex would hand every business a blue flyer.
   */
  it('files a colour as a brand role, never as a hex', () => {
    const built = templateFromArtboard(board(), T01, [box()]);
    if (!built.ok) throw new Error('refused');
    expect(built.template.shapes?.[0].tone).toBe('accent');
    expect(JSON.stringify(built.template.shapes)).not.toContain('2563eb');
    expect(JSON.stringify(built.template.shapes)).not.toContain('rgb(');
  });

  it('reads a gradient as the brand colour whatever its stops are', () => {
    expect(toneOf(null, true, board())).toBe('accent');
  });

  it('keeps white and black structural rather than brand', () => {
    /* A white card on a dark ground stays white whatever colour is picked. */
    expect(toneOf('rgb(255, 255, 255)', false, board())).toBe('white');
    expect(toneOf('rgb(0, 0, 0)', false, board())).toBe('black');
  });

  it('reads rgb as hex so one luminance test serves both', () => {
    expect(hexOf('rgb(37, 99, 235)')).toBe('#2563eb');
    expect(hexOf('rgba(11, 18, 34, 0.5)')).toBe('#0b1222');
    expect(hexOf('#0B1222')).toBe('#0B1222');
  });
});

describe('what is not a shape', () => {
  it('refuses the ground, which the surface already paints', () => {
    expect(shapeFrom(box({ x: 0, y: 0, w: 1080, h: 1350 }), board())).toBeNull();
  });

  it('refuses a box too faint to see', () => {
    expect(shapeFrom(box({ fill: 'rgba(255, 255, 255, 0.02)' }), board())).toBeNull();
  });

  it('keeps an angled bar angled, because the gesture is the angle', () => {
    const spec = shapeFrom(box({ rotation: -12 }), board());
    expect(spec?.kind).toBe('stripe');
    expect(spec && 'angle' in spec && spec.angle).toBe(-12);
  });

  it('reads an outlined disc as a ring, not a filled one', () => {
    const spec = shapeFrom(box({ w: 220, h: 220, radius: 110, fill: null, stroke: 'rgb(255,255,255)', strokeWidth: 6 }), board());
    expect(spec?.kind).toBe('ring');
  });

  /*
   * A design that measures forty boxes is a nested flex tree, not forty
   * decisions. Importing all of them buries the type under wrappers.
   */
  it('caps how much geometry one template may carry', () => {
    const many = Array.from({ length: 30 }, (_, i) => box({ y: i * 20, w: 900 - i * 10 }));
    const built = templateFromArtboard(board(), T01, many);
    if (!built.ok) throw new Error('refused');
    expect(built.template.shapes?.length).toBe(12);
  });
});

describe('a layout built around a photograph', () => {
  it('says so, so the gallery previews it with one', () => {
    const built = templateFromArtboard(board(), T01, [
      box({ x: 0, y: 0, w: 1080, h: 760, isImage: true, fill: null }),
    ]);
    if (!built.ok) throw new Error('refused');
    expect(built.template.photoLed).toBe(true);
  });

  it('does not call a logo a photograph', () => {
    /* A 44px mark in the corner is a lockup, not the subject. */
    const built = templateFromArtboard(board(), T01, [
      box({ x: 960, y: 1240, w: 44, h: 44, isImage: true, fill: null }),
    ]);
    if (!built.ok) throw new Error('refused');
    expect(built.template.photoLed).toBeUndefined();
  });
});

describe('corner rounding, in whatever units it was written', () => {
  /*
   * getComputedStyle hands back `border-radius: 50%` as "50%", not pixels —
   * it cannot resolve a percentage without the box. Read as a number that is
   * 50, and on a 150px disc that is a third of the rounding there is, so
   * every circle in the Creative System measured as a soft-cornered
   * rectangle.
   */
  it('resolves a percentage against the box, so a disc is a disc', () => {
    expect(radiusPx('50%', { width: 150, height: 150 })).toBe(75);
    expect(radiusPx('12px', { width: 150, height: 150 })).toBe(12);
    expect(radiusPx('', { width: 150, height: 150 })).toBe(0);
  });

  it('reads a round box as a circle once the radius is right', () => {
    const spec = shapeFrom(box({ w: 150, h: 150, radius: 75, fill: 'rgb(11, 18, 34)' }), board());
    expect(spec?.kind).toBe('circle');
  });
});

describe('a picture is a hole, not a fill', () => {
  /*
   * MEASURED in the editor: painting the image box filled the top half of a
   * photo-led poster with solid accent, directly over the photograph the
   * template exists to show.
   */
  it('does not paint over the photograph', () => {
    expect(shapeFrom(box({ x: 0, y: 0, w: 1080, h: 760, isImage: true, fill: 'rgb(17, 26, 46)' }), board())).toBeNull();
  });

  it('still lets the box mark the layout photo-led', () => {
    const built = templateFromArtboard(board(), T01, [
      box({ x: 0, y: 0, w: 1080, h: 760, isImage: true, fill: 'rgb(17, 26, 46)' }),
    ]);
    if (!built.ok) throw new Error('refused');
    expect(built.template.photoLed).toBe(true);
    expect(built.template.shapes ?? []).toHaveLength(0);
  });

  /* A frame drawn round a picture IS part of the design. */
  it('keeps an outlined picture frame', () => {
    const spec = shapeFrom(box({
      x: 72, y: 200, w: 300, h: 300, radius: 150,
      isImage: true, fill: null, stroke: 'rgb(255,255,255)', strokeWidth: 6,
    }), board());
    expect(spec?.kind).toBe('ring');
  });
});
