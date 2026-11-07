import { describe, expect, it } from 'vitest';

import type { DesignPage, TextObject, ShapeObject } from './designDocument';
import { applyPatch, normaliseColour, type PatchOp } from './designPatch';

const base = { rotation: 0, opacity: 1, visible: true, locked: false };

const text = (id: string, extra: Partial<TextObject> = {}): TextObject => ({
  id, type: 'text', name: id, x: 0.1, y: 0.1, w: 0.6, h: 0.1, z: 1, ...base,
  text: 'Your business', size: 0.06, ...extra,
});

const shape = (id: string, extra: Partial<ShapeObject> = {}): ShapeObject => ({
  id, type: 'shape', name: id, x: 0, y: 0, w: 1, h: 0.3, z: 0, ...base,
  shape: 'rect', fill: '#2563eb', ...extra,
});

const page = (objects: DesignPage['objects']): DesignPage => ({
  id: 'p', name: 'Page 1', width: 1080, height: 1080, background: '#ffffff', objects,
});

const run = (p: DesignPage, ...ops: PatchOp[]) => applyPatch(p, ops);
const textIn = (p: DesignPage, id: string) => p.objects.find((o) => o.id === id) as TextObject;

describe('colours are validated, not passed through', () => {
  it('accepts hex in both lengths and a short list of names', () => {
    expect(normaliseColour('#fff')).toBe('#ffffff');
    expect(normaliseColour('2563EB')).toBe('#2563eb');
    expect(normaliseColour('  White ')).toBe('#ffffff');
  });

  /*
   * A document is rendered into the page's own DOM, so an unvalidated colour
   * string is a hole rather than a convenience: CSS colours can carry
   * url(...) and var(...).
   */
  it('refuses anything that is not plainly a colour', () => {
    for (const bad of ['url(javascript:alert(1))', 'var(--x)', 'rgb(1,2,3)', '', '#12345', 'chartreuse']) {
      expect(normaliseColour(bad), bad).toBeNull();
    }
  });
});

describe('a patch changes what it names and nothing else', () => {
  const start = page([text('head'), text('sub', { y: 0.4, text: 'Sub' }), shape('band')]);

  it('leaves every other object identical by reference', () => {
    const { page: next } = run(start, { op: 'setText', id: 'head', text: 'Open today' });
    expect(textIn(next, 'head').text).toBe('Open today');
    /* Not merely equal — the same object, so React re-renders only one. */
    expect(next.objects.find((o) => o.id === 'sub')).toBe(start.objects.find((o) => o.id === 'sub'));
    expect(next.objects.find((o) => o.id === 'band')).toBe(start.objects.find((o) => o.id === 'band'));
  });

  it('never mutates the page it was given', () => {
    const before = JSON.stringify(start);
    run(start, { op: 'setText', id: 'head', text: 'Changed' }, { op: 'setBackground', colour: 'black' });
    expect(JSON.stringify(start)).toBe(before);
  });

  it('applies operations in order, each seeing the last', () => {
    const { page: next, applied } = run(
      start,
      { op: 'scaleText', id: 'head', factor: 2 },
      { op: 'scaleText', id: 'head', factor: 2 },
    );
    expect(applied).toHaveLength(2);
    expect(textIn(next, 'head').size).toBeCloseTo(0.24, 6);
  });
});

describe('every number is clamped rather than trusted', () => {
  const start = page([text('head')]);

  it('will not let type grow or shrink without limit', () => {
    expect(textIn(run(start, { op: 'scaleText', id: 'head', factor: 1000 }).page, 'head').size)
      .toBeLessThanOrEqual(0.4);
    expect(textIn(run(start, { op: 'scaleText', id: 'head', factor: 0.00001 }).page, 'head').size)
      .toBeGreaterThanOrEqual(0.004);
  });

  it('refuses a nonsense number instead of writing NaN into the design', () => {
    for (const factor of [Number.NaN, Infinity, -1, 0]) {
      const out = run(start, { op: 'scaleText', id: 'head', factor });
      expect(out.applied, String(factor)).toHaveLength(0);
      expect(out.rejected[0].why).toBeTruthy();
    }
  });

  /* An object nudged off the edge is gone from a flat export, and "it
     disappeared" is the worst outcome of a tidy-up. */
  it('keeps a nudged object reachable on the page', () => {
    const { page: next } = run(start, { op: 'nudge', id: 'head', dx: 5, dy: 5 });
    const moved = next.objects[0];
    expect(moved.x).toBeLessThanOrEqual(1);
    expect(moved.y).toBeLessThanOrEqual(1);
    expect(moved.x).toBeGreaterThanOrEqual(-0.05);
  });

  it('rounds a weight to a real one', () => {
    expect(textIn(run(page([text('head')]), { op: 'setWeight', id: 'head', weight: 740 }).page, 'head').weight)
      .toBe(700);
    expect(textIn(run(page([text('head')]), { op: 'setWeight', id: 'head', weight: 5000 }).page, 'head').weight)
      .toBe(900);
  });
});

describe('refusals are explained, never silent', () => {
  const start = page([
    text('head'),
    text('locked', { locked: true }),
    shape('band'),
  ]);

  it('names a missing object rather than doing nothing', () => {
    const out = run(start, { op: 'setText', id: 'ghost', text: 'Hi' });
    expect(out.applied).toHaveLength(0);
    expect(out.rejected[0].why).toMatch(/not on this page/);
  });

  it('will not touch a locked object', () => {
    const out = run(start, { op: 'setText', id: 'locked', text: 'Hi' });
    expect(out.rejected[0].why).toMatch(/locked/i);
  });

  it('will not colour a shape as if it were text, or vice versa', () => {
    expect(run(start, { op: 'setColour', id: 'band', colour: 'white' }).rejected[0].why).toMatch(/not text/);
    expect(run(start, { op: 'setFill', id: 'head', fill: 'white' }).rejected[0].why).toMatch(/not a shape/);
  });

  /*
   * The vocabulary is closed on purpose. A rule parser writes these today
   * and something else may write them later; neither gets to invent an
   * operation that reaches further into the document.
   */
  it('refuses an operation outside the vocabulary', () => {
    const out = applyPatch(start, [{ op: 'deleteEverything', id: 'head' } as unknown as PatchOp]);
    expect(out.applied).toHaveLength(0);
    expect(out.rejected[0].why).toMatch(/not something I can do/);
    expect(out.page).toBe(start);
  });

  it('says so when a change would be no change', () => {
    const out = run(start, { op: 'setText', id: 'head', text: 'Your business' });
    expect(out.applied).toHaveLength(0);
    expect(out.rejected[0].why).toMatch(/already/);
  });

  it('applies the ones it can and reports the ones it cannot', () => {
    const out = run(
      start,
      { op: 'setText', id: 'head', text: 'Open late' },
      { op: 'setText', id: 'ghost', text: 'Nope' },
      { op: 'setBackground', colour: 'navy' },
    );
    expect(out.applied).toHaveLength(2);
    expect(out.rejected).toHaveLength(1);
    expect(textIn(out.page, 'head').text).toBe('Open late');
    expect(out.page.background).toBe('#1e3a8a');
  });

  it('refuses empty text rather than leaving an invisible object behind', () => {
    expect(run(start, { op: 'setText', id: 'head', text: '   ' }).rejected[0].why).toMatch(/empty/);
  });
});
