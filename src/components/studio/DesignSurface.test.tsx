import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import DesignSurface from './DesignSurface';
import type { DesignPage, TextObject } from '../../lib/studio/designDocument';

const text = (over: Partial<TextObject> = {}): TextObject => ({
  id: 't1', type: 'text', name: 'Address',
  x: 0.1, y: 0.1, w: 0.8, h: 0.3,
  rotation: 0, opacity: 1, visible: true, locked: false, z: 1,
  text: 'Doors at seven\nKitchen until ten',
  size: 0.05,
  ...over,
});

const page = (objects: TextObject[]): DesignPage => ({
  id: 'p1', name: 'Page 1', width: 1080, height: 1080, objects,
});

const surfaceFor = (object: TextObject) => {
  const { container } = render(<DesignSurface page={page([object])} accent="#4f46e5" />);
  return container.querySelector('[data-object-id="t1"]') as HTMLElement;
};

describe('a line break the user typed', () => {
  /*
   * ── FOUND BY IMPORTING A POWERPOINT DECK ─────────────────────────────
   *
   * The properties panel has always offered a <textarea>, so a break could
   * always be entered — and HTML treats a newline as a space, so a two-line
   * address came out as one run. The export matched the canvas, so there was
   * nothing to notice except that it looked wrong.
   */
  it('stays a line break on the canvas', () => {
    expect(surfaceFor(text()).style.whiteSpace).toBe('pre-wrap');
  });

  it('keeps the words themselves intact', () => {
    expect(surfaceFor(text()).textContent).toBe('Doors at seven\nKitchen until ten');
  });

  /* pre-wrap, not pre: a long line must still wrap inside its box. */
  it('still wraps a long line', () => {
    const el = surfaceFor(text({ text: 'a'.repeat(400) }));
    expect(el.style.whiteSpace).toBe('pre-wrap');
  });
});

describe("a look's pattern on a page", () => {
  /*
   * Over the ground, under every object, and part of the node the exporter
   * rasterises — so the downloaded file has the pattern the editor shows.
   */
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"></svg>';
  const withPattern = (zone?: 'bottom' | 'right'): DesignPage => ({
    id: 'p1', name: 'Page 1', width: 1080, height: 1350,
    background: 'linear-gradient(160deg, #000000 0%, #111111 100%), #000000',
    pattern: { svg, opacity: 0.08, zone },
    objects: [text()],
  });

  it('draws the pattern beneath the objects, at its own opacity', () => {
    const { container } = render(<DesignSurface page={withPattern('bottom')} accent="#4f46e5" />);
    const root = container.firstElementChild as HTMLElement;
    const kids = [...root.children] as HTMLElement[];
    const at = kids.findIndex((k) => k.dataset.lookPattern !== undefined);
    const objectAt = kids.findIndex((k) => k.dataset.objectId === 't1');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(objectAt);
    const layer = kids[at];
    expect(layer.style.opacity).toBe('0.08');
    expect(layer.style.backgroundImage).toContain('data:image/svg+xml');
    expect(layer.style.backgroundImage).toContain(encodeURIComponent('<svg'));
  });

  it("clips the pattern to its zone and lines the drawing up with it", () => {
    const { container } = render(<DesignSurface page={withPattern('right')} accent="#4f46e5" />);
    const layer = container.querySelector('[data-look-pattern]') as HTMLElement;
    /* right zone: x from 0.6 of the width, full height. */
    expect(layer.style.left).toBe('60%');
    expect(layer.style.width).toBe('40%');
    expect(layer.style.backgroundSize).toBe('250% 100%');
    expect(layer.style.backgroundPosition).toBe('100% 0%');
  });

  it('draws nothing extra on a page without one', () => {
    const { container } = render(<DesignSurface page={page([text()])} accent="#4f46e5" />);
    expect(container.querySelector('[data-look-pattern]')).toBeNull();
  });
});

describe('a duotone on a page', () => {
  /*
   * The same single feColorMatrix TemplateSurface draws: Rec. 709 luma mapped
   * from the dark colour to the light one, filtered in sRGB.
   */
  const withMedia = (over: Partial<DesignPage> = {}): DesignPage => ({
    ...page([]),
    backgroundMedia: { assetId: 'https://example.com/photo.jpg', kind: 'image', fit: 'cover' },
    ...over,
  });

  it('filters the background photograph through the duotone matrix', () => {
    const { container } = render(<DesignSurface page={withMedia({ duotone: ['#101010', '#f0e0c0'] })} accent="#4f46e5" />);
    const img = container.querySelector('img') as HTMLImageElement;
    const filter = container.querySelector('filter');
    expect(filter).not.toBeNull();
    const id = filter?.getAttribute('id') ?? '';
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    // jsdom serialises url(#x) as url("#x"); either is the same reference.
    expect(img.style.filter.replace(/"/g, '')).toBe(`url(#${id})`);
    expect(filter?.getAttribute('color-interpolation-filters') ?? filter?.getAttribute('colorInterpolationFilters')).toBe('sRGB');
    const values = (container.querySelector('feColorMatrix')?.getAttribute('values') ?? '').split(' ').map(Number);
    expect(values).toHaveLength(20);
    // Red row: span x luma weights, then the dark colour's red as the offset.
    const span = (0xf0 - 0x10) / 255;
    expect(values[0]).toBeCloseTo(span * 0.2126, 4);
    expect(values[1]).toBeCloseTo(span * 0.7152, 4);
    expect(values[4]).toBeCloseTo(0x10 / 255, 4);
  });

  it('leaves a page without one, or without media, unfiltered', () => {
    const plain = render(<DesignSurface page={withMedia()} accent="#4f46e5" />);
    expect(plain.container.querySelector('filter')).toBeNull();
    expect((plain.container.querySelector('img') as HTMLImageElement).style.filter).toBe('');
    const bare = render(<DesignSurface page={{ ...page([]), duotone: ['#101010', '#f0e0c0'] }} accent="#4f46e5" />);
    expect(bare.container.querySelector('filter')).toBeNull();
  });
});
