import { describe, it, expect } from 'vitest';
import {
  createLayer, addLayer, updateLayer, moveLayer, resizeLayer, removeLayer,
  duplicateLayer, reorderLayer, findLayer, layerAt, newLayerId,
  initHistory, pushHistory, undo, redo, canUndo, canRedo, HISTORY_LIMIT,
  docFromSlots, MIN_SIZE,
  type CanvasDoc,
} from './canvasDoc';

const blank = (): CanvasDoc => ({ width: 1000, height: 1000, layers: [] });

function withTwo(): CanvasDoc {
  let d = blank();
  d = addLayer(d, createLayer(d, 'text', { id: 'a', name: 'A', x: 10, y: 10, w: 100, h: 50 }));
  d = addLayer(d, createLayer(d, 'text', { id: 'b', name: 'B', x: 200, y: 200, w: 100, h: 50 }));
  return d;
}

describe('layer ids', () => {
  it('never collides with an existing id', () => {
    const d = addLayer(blank(), createLayer(blank(), 'text', { id: 'text-1' }));
    expect(newLayerId(d, 'text')).toBe('text-2');
  });
});

describe('geometry', () => {
  it('moves a layer', () => {
    const d = moveLayer(withTwo(), 'a', 15, 25);
    expect(findLayer(d, 'a')).toMatchObject({ x: 25, y: 35 });
  });

  it('keeps a layer on canvas instead of losing it off the edge', () => {
    const d = moveLayer(withTwo(), 'a', 99999, 99999);
    const l = findLayer(d, 'a')!;
    expect(l.x).toBe(1000 - l.w);
    expect(l.y).toBe(1000 - l.h);
    const d2 = moveLayer(d, 'a', -99999, -99999);
    expect(findLayer(d2, 'a')).toMatchObject({ x: 0, y: 0 });
  });

  it('refuses to move or resize a locked layer', () => {
    const locked = updateLayer(withTwo(), 'a', { locked: true });
    expect(moveLayer(locked, 'a', 50, 50)).toBe(locked);
    expect(resizeLayer(locked, 'a', 50, 50)).toBe(locked);
  });

  it('will not resize below the minimum tap size', () => {
    const d = resizeLayer(withTwo(), 'a', -9999, -9999);
    expect(findLayer(d, 'a')).toMatchObject({ w: MIN_SIZE, h: MIN_SIZE });
  });

  it('will not resize past the canvas edge', () => {
    const d = resizeLayer(withTwo(), 'a', 9999, 9999);
    const l = findLayer(d, 'a')!;
    expect(l.x + l.w).toBeLessThanOrEqual(1000);
    expect(l.y + l.h).toBeLessThanOrEqual(1000);
  });

  it('cannot have its id or kind overwritten by a patch', () => {
    const d = updateLayer(withTwo(), 'a', { id: 'hacked', kind: 'image' } as never);
    expect(findLayer(d, 'a')?.kind).toBe('text');
    expect(findLayer(d, 'hacked')).toBeUndefined();
  });
});

describe('hit testing', () => {
  it('returns the topmost layer under the point', () => {
    let d = withTwo();
    d = addLayer(d, createLayer(d, 'shape', { id: 'top', x: 0, y: 0, w: 500, h: 500 }));
    expect(layerAt(d, 20, 20)?.id).toBe('top');
  });

  it('ignores hidden and locked layers', () => {
    let d = withTwo();
    d = addLayer(d, createLayer(d, 'shape', { id: 'ghost', x: 0, y: 0, w: 500, h: 500, hidden: true }));
    expect(layerAt(d, 20, 20)?.id).toBe('a');
    d = updateLayer(d, 'a', { locked: true });
    expect(layerAt(d, 20, 20)).toBeUndefined();
  });

  it('returns nothing for empty space', () => {
    expect(layerAt(withTwo(), 900, 900)).toBeUndefined();
  });
});

describe('duplicate and delete', () => {
  it('offsets a duplicate so it is visibly separate', () => {
    const { doc, id } = duplicateLayer(withTwo(), 'a');
    const copy = findLayer(doc, id!)!;
    expect(copy.x).toBe(26);
    expect(copy.name).toBe('A copy');
    expect(doc.layers).toHaveLength(3);
  });

  it('is a no-op for an unknown id', () => {
    const d = withTwo();
    expect(duplicateLayer(d, 'nope')).toEqual({ doc: d, id: null });
    expect(removeLayer(d, 'nope').layers).toHaveLength(2);
  });

  it('removes a layer', () => {
    expect(removeLayer(withTwo(), 'a').layers.map((l) => l.id)).toEqual(['b']);
  });
});

describe('z-order', () => {
  const ids = (d: CanvasDoc) => d.layers.map((l) => l.id);

  it('brings to front and sends to back', () => {
    expect(ids(reorderLayer(withTwo(), 'a', 'front'))).toEqual(['b', 'a']);
    expect(ids(reorderLayer(withTwo(), 'b', 'back'))).toEqual(['b', 'a']);
  });

  it('steps forward and backward one place', () => {
    expect(ids(reorderLayer(withTwo(), 'a', 'forward'))).toEqual(['b', 'a']);
    expect(ids(reorderLayer(withTwo(), 'b', 'backward'))).toEqual(['b', 'a']);
  });

  it('clamps at the ends rather than wrapping', () => {
    expect(ids(reorderLayer(withTwo(), 'a', 'backward'))).toEqual(['a', 'b']);
    expect(ids(reorderLayer(withTwo(), 'b', 'forward'))).toEqual(['a', 'b']);
  });
});

describe('history', () => {
  it('undoes and redoes', () => {
    let h = initHistory(1);
    h = pushHistory(h, 2);
    h = pushHistory(h, 3);
    expect(h.present).toBe(3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(h.present).toBe(2);
  });

  it('drops the redo stack once a new edit lands', () => {
    let h = pushHistory(pushHistory(initHistory(1), 2), 3);
    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = pushHistory(h, 99);
    expect(canRedo(h)).toBe(false);
    expect(h.present).toBe(99);
  });

  it('ignores a push of the identical state', () => {
    const h = initHistory({ a: 1 });
    expect(pushHistory(h, h.present)).toBe(h);
  });

  it('is bounded so a long session cannot grow without limit', () => {
    let h = initHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 25; i++) h = pushHistory(h, i);
    expect(h.past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
  });

  it('undo/redo on an empty stack is a no-op, not a crash', () => {
    const h = initHistory('x');
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });
});

describe('docFromSlots', () => {
  const seed = {
    width: 1080, height: 1920,
    headline: 'Weekend Specials', subline: 'This weekend only', badge: 'BOOK NOW',
    accent: '#dc2626', logoUrl: 'blob:logo', qrDataUrl: 'data:image/png;base64,xx',
  };

  it('seeds a layer per populated slot', () => {
    const doc = docFromSlots(seed);
    expect(doc.layers.map((l) => l.name)).toEqual(['Logo', 'Badge', 'Headline', 'Subtext', 'QR code']);
    expect(doc.width).toBe(1080);
  });

  it('skips slots the design does not use', () => {
    const doc = docFromSlots({ ...seed, badge: '  ', subline: '', logoUrl: null, qrDataUrl: null });
    expect(doc.layers.map((l) => l.name)).toEqual(['Headline']);
  });

  it('keeps every seeded layer inside the canvas', () => {
    const doc = docFromSlots(seed);
    for (const l of doc.layers) {
      expect(l.x, l.name).toBeGreaterThanOrEqual(0);
      expect(l.y, l.name).toBeGreaterThanOrEqual(0);
      expect(l.x + l.w, l.name).toBeLessThanOrEqual(doc.width);
      expect(l.y + l.h, l.name).toBeLessThanOrEqual(doc.height);
    }
  });

  it('gives every layer a unique id', () => {
    const ids = docFromSlots(seed).layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries the accent onto the badge', () => {
    const badge = docFromSlots(seed).layers.find((l) => l.name === 'Badge')!;
    expect(badge.fill).toBe('#dc2626');
  });
});
