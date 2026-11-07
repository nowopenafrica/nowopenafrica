import { describe, expect, it } from 'vitest';

import type { DesignPage } from './designDocument';
import {
  DROPPABLE_TYPES,
  dragHasImage,
  dropHint,
  imageFilesFrom,
  placeDroppedImage,
  replaceTargetId,
} from './dropImage';

const PAGE = { width: 1080, height: 1080 };

const base = {
  rotation: 0, opacity: 1, visible: true, locked: false,
};

function page(objects: DesignPage['objects']): DesignPage {
  return { id: 'p', name: 'Page 1', width: 1080, height: 1080, objects };
}

const image = (id: string, box: { x: number; y: number; w: number; h: number }, extra = {}) => ({
  id, type: 'image' as const, name: id, ...box, ...base, z: 1, assetId: 'a/b.png', fit: 'cover' as const, ...extra,
});

const text = (id: string, box: { x: number; y: number; w: number; h: number }) => ({
  id, type: 'text' as const, name: id, ...box, ...base, z: 2, text: 'Hello', size: 0.05,
});

describe('what a drag is carrying', () => {
  it('accepts a dragged picture of a type the picker accepts', () => {
    for (const type of DROPPABLE_TYPES) {
      expect(dragHasImage([{ kind: 'file', type }]), type).toBe(true);
    }
  });

  /*
   * A folder arrives with an empty type and a dragged link arrives as a
   * string. Both look like a drop and neither is one.
   */
  it('refuses a folder, a link, and a type we cannot store', () => {
    expect(dragHasImage([{ kind: 'file', type: '' }])).toBe(false);
    expect(dragHasImage([{ kind: 'string', type: 'text/uri-list' }])).toBe(false);
    expect(dragHasImage([{ kind: 'file', type: 'image/heic' }])).toBe(false);
    expect(dragHasImage([])).toBe(false);
  });

  it('keeps only the usable files out of a mixed drop', () => {
    const f = (name: string, type: string) => new File([new Uint8Array([1])], name, { type });
    const kept = imageFilesFrom([
      f('a.png', 'image/png'),
      f('notes.pdf', 'application/pdf'),
      f('b.webp', 'image/webp'),
      f('folder', ''),
    ]);
    expect(kept.map((x) => x.name)).toEqual(['a.png', 'b.webp']);
  });
});

describe('dropping onto something, or onto nothing', () => {
  const doc = page([
    image('photo', { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }),
    text('headline', { x: 0.5, y: 0.5, w: 0.4, h: 0.1 }),
    image('locked', { x: 0.1, y: 0.6, w: 0.2, h: 0.2 }, { locked: true }),
    image('hidden', { x: 0.6, y: 0.1, w: 0.2, h: 0.2 }, { visible: false }),
  ]);

  it('replaces the picture under the pointer', () => {
    expect(replaceTargetId(doc, 0.2, 0.2)).toBe('photo');
  });

  it('adds rather than replaces over empty canvas', () => {
    expect(replaceTargetId(doc, 0.9, 0.9)).toBeNull();
  });

  /*
   * Dropping on a headline is not a request to turn the headline into a
   * photograph. Guessing here destroys something visible in response to a
   * gesture that never said so.
   */
  it('never turns a text object into a picture', () => {
    expect(replaceTargetId(doc, 0.6, 0.52)).toBeNull();
  });

  it('leaves a locked or hidden picture alone', () => {
    expect(replaceTargetId(doc, 0.15, 0.65)).toBeNull();
    expect(replaceTargetId(doc, 0.65, 0.15)).toBeNull();
  });

  it('describes what will happen before the drop lands', () => {
    expect(dropHint(doc, { x: 0.2, y: 0.2 }, true)).toEqual({ kind: 'replace', id: 'photo' });
    expect(dropHint(doc, { x: 0.9, y: 0.9 }, true)).toEqual({ kind: 'add' });
    expect(dropHint(doc, { x: 0.2, y: 0.2 }, false)).toEqual({ kind: 'reject' });
    /* Over the canvas but not yet positioned: still an add, not a reject. */
    expect(dropHint(doc, null, true)).toEqual({ kind: 'add' });
  });
});

describe('where an added picture lands', () => {
  it('centres on the pointer', () => {
    const box = placeDroppedImage({ width: 1000, height: 1000 }, PAGE, { x: 0.5, y: 0.5 });
    expect(box.x + box.w / 2).toBeCloseTo(0.5, 6);
    expect(box.y + box.h / 2).toBeCloseTo(0.5, 6);
  });

  it('keeps the picture on the page when dropped near an edge', () => {
    for (const at of [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0.02, y: 0.98 }]) {
      const box = placeDroppedImage({ width: 1600, height: 900 }, PAGE, at);
      expect(box.x, JSON.stringify(at)).toBeGreaterThanOrEqual(0);
      expect(box.y, JSON.stringify(at)).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w, JSON.stringify(at)).toBeLessThanOrEqual(1 + 1e-9);
      expect(box.y + box.h, JSON.stringify(at)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  /*
   * A stretched photo of someone's shop is the first thing they notice and
   * the last thing they forgive.
   */
  it('never changes the picture\'s proportions', () => {
    const page16x9 = { width: 1920, height: 1080 };
    const box = placeDroppedImage({ width: 1000, height: 500 }, page16x9, { x: 0.5, y: 0.5 });
    const drawnRatio = (box.w * page16x9.width) / (box.h * page16x9.height);
    expect(drawnRatio).toBeCloseTo(2, 6);
  });

  it('survives a nonsense natural size without collapsing', () => {
    const box = placeDroppedImage({ width: 0, height: 0 }, PAGE, { x: NaN, y: NaN });
    expect(box.w).toBeGreaterThan(0);
    expect(box.h).toBeGreaterThan(0);
    expect(box.x).toBeGreaterThanOrEqual(0);
  });
});
