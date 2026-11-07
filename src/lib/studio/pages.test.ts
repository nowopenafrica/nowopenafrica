import { describe, it, expect } from 'vitest';

import {
  addPage, canRemovePage, clampPageIndex, duplicatePage, movePage, pageLabel, removePage,
  variantPage,
} from './pages';
import { blankDocument, readDocument, type DesignDocument, type DesignObject } from './designDocument';

const obj = (id: string): DesignObject => ({
  id, type: 'text', name: 'Headline', text: 'Hello',
  x: 0.1, y: 0.1, w: 0.5, h: 0.2,
  rotation: 0, opacity: 1, visible: true, locked: false, z: 1,
} as DesignObject);

const doc = (): DesignDocument => {
  const d = blankDocument(1080, 1350, 'Flyer');
  d.pages[0].objects = [obj('a'), obj('b')];
  return d;
};

describe('adding a page', () => {
  it('inserts after the current one', () => {
    const d = addPage(doc(), 0);
    expect(d.pages).toHaveLength(2);
    expect(d.pages[1].objects).toHaveLength(0);
  });

  it('matches the size of the page it follows', () => {
    const d = addPage(doc(), 0);
    expect(d.pages[1].width).toBe(1080);
    expect(d.pages[1].height).toBe(1350);
  });

  it('gives it an id of its own', () => {
    const d = addPage(doc(), 0);
    expect(d.pages[1].id).not.toBe(d.pages[0].id);
  });

  it('copes with an index past the end', () => {
    expect(addPage(doc(), 99).pages).toHaveLength(2);
  });
});

describe('duplicating a page', () => {
  /*
   * ── THE RULE THAT MATTERS ────────────────────────────────────────────
   *
   * Two objects with one id means selecting one selects both, editing one
   * edits both, and undo restores the wrong one. Copying ids verbatim is the
   * obvious implementation and it is wrong.
   */
  it('gives every copied object a new id', () => {
    const d = duplicatePage(doc(), 0);
    const first = d.pages[0].objects.map((o) => o.id);
    const second = d.pages[1].objects.map((o) => o.id);
    expect(second).toHaveLength(2);
    for (const id of second) expect(first).not.toContain(id);
    expect(new Set([...first, ...second]).size).toBe(4);
  });

  it('keeps everything else about the objects', () => {
    const d = duplicatePage(doc(), 0);
    const [a] = d.pages[1].objects;
    expect(a).toMatchObject({ text: 'Hello', x: 0.1, w: 0.5, name: 'Headline' });
  });

  it('sits immediately after its source and is named as a copy', () => {
    const d = duplicatePage(addPage(doc(), 0), 0);
    expect(d.pages).toHaveLength(3);
    expect(d.pages[1].name).toMatch(/copy/i);
  });

  it('leaves the source untouched', () => {
    const before = doc();
    const after = duplicatePage(before, 0);
    expect(after.pages[0]).toEqual(before.pages[0]);
  });

  it('is identity for a page that is not there', () => {
    const d = doc();
    expect(duplicatePage(d, 7)).toBe(d);
  });
});

describe('removing a page', () => {
  /*
   * readDocument refuses a document with no pages, so deleting the last one
   * would save a project that can never be opened again.
   */
  it('refuses to remove the only page', () => {
    const d = doc();
    expect(removePage(d, 0)).toBe(d);
    expect(canRemovePage(d, 0)).toBe(false);
  });

  it('removes the right one when there are several', () => {
    const d = addPage(addPage(doc(), 0), 1);
    expect(d.pages).toHaveLength(3);
    const kept = removePage(d, 1);
    expect(kept.pages).toHaveLength(2);
    expect(kept.pages.map((p) => p.id)).toEqual([d.pages[0].id, d.pages[2].id]);
  });

  it('leaves a document that is still openable', () => {
    const d = removePage(addPage(doc(), 0), 1);
    expect(readDocument(d).ok).toBe(true);
  });

  it('is identity for a page that is not there', () => {
    const d = addPage(doc(), 0);
    expect(removePage(d, 9)).toBe(d);
  });
});

describe('reordering pages', () => {
  const three = () => addPage(addPage(doc(), 0), 1);

  it('moves a page to a new position', () => {
    const d = three();
    const ids = d.pages.map((p) => p.id);
    const moved = movePage(d, 0, 2);
    expect(moved.pages.map((p) => p.id)).toEqual([ids[1], ids[2], ids[0]]);
  });

  it('is identity when it would change nothing', () => {
    const d = three();
    expect(movePage(d, 1, 1)).toBe(d);
    expect(movePage(d, 0, 9)).toBe(d);
    expect(movePage(d, 9, 0)).toBe(d);
  });
});

describe('keeping the selected page in range', () => {
  /*
   * Undo can restore a document with fewer pages than the screen is showing.
   * An index past the end renders nothing, with no error — which reads as the
   * project having been lost.
   */
  it('pulls an index back inside the document', () => {
    const d = doc();
    expect(clampPageIndex(d, 5)).toBe(0);
    expect(clampPageIndex(addPage(d, 0), 5)).toBe(1);
  });

  it('copes with no document and with negatives', () => {
    expect(clampPageIndex(null, 3)).toBe(0);
    expect(clampPageIndex(doc(), -2)).toBe(0);
  });
});

describe('what a page is called', () => {
  it('uses its name, or its position', () => {
    const d = doc();
    expect(pageLabel({ ...d.pages[0], name: 'Cover' }, 0)).toBe('Cover');
    expect(pageLabel({ ...d.pages[0], name: '  ' }, 2)).toBe('Page 3');
  });
});

describe('the same design at another size, beside the original', () => {
  const square = (): DesignDocument => ({
    schemaVersion: 1,
    title: 'Promo',
    pages: [{
      id: 'p1', name: 'Page 1', width: 1080, height: 1080, background: '#ffffff',
      objects: [{
        id: 'a', type: 'shape', name: 'Disc', shape: 'ellipse',
        x: 0.4, y: 0.4, w: 0.2, h: 0.2,
        rotation: 0, opacity: 1, visible: true, locked: false, z: 1, fill: '#2563eb',
      }],
    }],
  });

  it('keeps the original page untouched', () => {
    const doc = square();
    const next = variantPage(doc, 0, 1080, 1920, 'Story');
    expect(next.pages).toHaveLength(2);
    expect(next.pages[0]).toEqual(doc.pages[0]);
    expect(next.pages[1].width).toBe(1080);
    expect(next.pages[1].height).toBe(1920);
    expect(next.pages[1].name).toBe('Story');
  });

  /*
   * Two objects with one id means selecting one selects both and undo puts
   * back the wrong one — the rule stated at the top of pages.ts.
   */
  it('gives the copy fresh ids', () => {
    const next = variantPage(square(), 0, 1080, 1920, 'Story');
    expect(next.pages[1].objects[0].id).not.toBe(next.pages[0].objects[0].id);
    expect(next.pages[1].id).not.toBe(next.pages[0].id);
  });

  /*
   * Square to story is a big change of shape, so it fits rather than
   * stretches: a round disc must not arrive as an oval.
   */
  it('does not distort when the proportions change a lot', () => {
    const next = variantPage(square(), 0, 1080, 1920, 'Story');
    const disc = next.pages[1].objects[0];
    const drawnRatio = (disc.w * 1080) / (disc.h * 1920);
    expect(drawnRatio).toBeCloseTo(1, 2);
  });

  it('leaves a missing page alone', () => {
    const doc = square();
    expect(variantPage(doc, 9, 1080, 1920, 'Story')).toBe(doc);
  });
});
