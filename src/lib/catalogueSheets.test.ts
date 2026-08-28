import { describe, it, expect } from 'vitest';

import {
  CATALOGUE_LAYOUTS, catalogueLayout, suggestLayout, paginate, pageCount,
  priceLabel, productToSheetItem, buildSheetItems, sheetFileName, catalogueShareText,
  type SheetItem, type ProductRow,
} from './catalogueSheets';
import { createCatalogueItem } from './catalogue';

const sheet = (over: Partial<SheetItem> = {}): SheetItem => ({
  id: 'i1', name: 'Item', description: '', price: 'Ask', imageUrl: null, featured: false, ...over,
});

describe('CATALOGUE_LAYOUTS', () => {
  it('gives every layout a distinct id, a size and a page capacity', () => {
    const ids = CATALOGUE_LAYOUTS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of CATALOGUE_LAYOUTS) {
      expect(l.width).toBeGreaterThan(0);
      expect(l.height).toBeGreaterThan(0);
      expect(l.perPage).toBeGreaterThan(0);
      expect(l.paper.widthMm).toBeGreaterThan(0);
    }
  });

  it('keeps the print sheets at A4 proportions', () => {
    for (const id of ['grid', 'lookbook', 'linesheet', 'menu'] as const) {
      const l = catalogueLayout(id);
      expect(l.paper.widthMm).toBe(210);
      expect(l.paper.heightMm).toBe(297);
      // 794x1123 is A4 at 96dpi; the drawn sheet must match the paper or the
      // PDF stretches it.
      expect(l.width / l.height).toBeCloseTo(210 / 297, 2);
    }
  });

  it('makes the social sheets the shapes those platforms actually take', () => {
    expect(catalogueLayout('social').width / catalogueLayout('social').height).toBe(1);
    expect(catalogueLayout('story').width / catalogueLayout('story').height).toBeCloseTo(9 / 16, 5);
  });

  it('resolves an unknown id rather than returning undefined', () => {
    expect(catalogueLayout('nonsense').id).toBe('grid');
    expect(catalogueLayout(null).id).toBe('grid');
  });
});

describe('priceLabel', () => {
  it('shows the price exactly as the business wrote it', () => {
    expect(priceLabel('From ₦200/day')).toBe('From ₦200/day');
    expect(priceLabel('  ₦12,000 ')).toBe('₦12,000');
  });

  it('says Ask rather than inventing ₦0', () => {
    expect(priceLabel('')).toBe('Ask');
    expect(priceLabel(null)).toBe('Ask');
    expect(priceLabel(undefined)).toBe('Ask');
  });
});

describe('productToSheetItem', () => {
  it('carries a real product across intact', () => {
    const row: ProductRow = {
      id: 'p1', name: ' Ankara wrap ', description: ' 100% cotton ',
      price: '₦12,000', image_url: 'https://x/y.jpg', is_featured: true,
    };
    expect(productToSheetItem(row)).toEqual({
      id: 'p1', name: 'Ankara wrap', description: '100% cotton',
      price: '₦12,000', imageUrl: 'https://x/y.jpg', featured: true,
    });
  });

  it('never renders a nameless row as a blank slot', () => {
    expect(productToSheetItem({ id: 'p', name: '   ' }).name).toBe('Untitled');
  });

  it('treats an empty image url as no image, not as a broken one', () => {
    expect(productToSheetItem({ id: 'p', name: 'x', image_url: '' }).imageUrl).toBeNull();
  });
});

describe('buildSheetItems', () => {
  const manual = [
    createCatalogueItem({ name: 'Ankara wrap', description: 'typed by hand', price: 0, category: 'products', emoji: '👗', featured: false }),
    createCatalogueItem({ name: 'Gele', description: '', price: 3000, category: 'products', emoji: '🧣', featured: false }),
  ];

  it('drops a hand-typed duplicate in favour of the real product', () => {
    // The real row has the photograph and the price the rest of the app shows.
    const out = buildSheetItems([{ id: 'p1', name: 'Ankara wrap', image_url: 'https://x/y.jpg' }], manual);
    expect(out).toHaveLength(2);
    expect(out.find((i) => i.name === 'Ankara wrap')?.imageUrl).toBe('https://x/y.jpg');
    expect(out.map((i) => i.name)).toContain('Gele');
  });

  it('matches duplicates regardless of spacing or case', () => {
    const out = buildSheetItems([{ id: 'p1', name: '  ANKARA WRAP  ' }], manual);
    expect(out.filter((i) => i.name.toLowerCase().includes('ankara'))).toHaveLength(1);
  });

  it('puts featured items first, keeping each band in its original order', () => {
    const out = buildSheetItems([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', is_featured: true },
      { id: 'c', name: 'C' },
      { id: 'd', name: 'D', is_featured: true },
    ]);
    expect(out.map((i) => i.name)).toEqual(['B', 'D', 'A', 'C']);
  });

  it('copes with either source being absent', () => {
    expect(buildSheetItems([], [])).toEqual([]);
    expect(buildSheetItems([{ id: 'a', name: 'A' }])).toHaveLength(1);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 10 }, (_, i) => sheet({ id: `i${i}`, name: `Item ${i}` }));

  it('fills pages to capacity and leaves the remainder on the last', () => {
    const pages = paginate(items, 4);
    expect(pages.map((p) => p.length)).toEqual([4, 4, 2]);
  });

  it('loses nothing and keeps the order', () => {
    const flat = paginate(items, 3).flat();
    expect(flat.map((i) => i.id)).toEqual(items.map((i) => i.id));
  });

  it('returns one empty page for an empty catalogue, not zero pages', () => {
    // The preview has to render something; a branded empty sheet reads as
    // "add your products", a blank panel reads as broken.
    expect(paginate([], 9)).toEqual([[]]);
  });

  it('does not divide by zero or spin on a nonsense page size', () => {
    expect(paginate(items, 0).length).toBe(10);
    expect(paginate(items, -5).length).toBe(10);
    expect(paginate(items, 2.7).map((p) => p.length)).toEqual([2, 2, 2, 2, 2]);
  });
});

describe('pageCount', () => {
  it('agrees with paginate', () => {
    for (const [total, per] of [[10, 4], [9, 9], [1, 9], [0, 9], [13, 3]] as const) {
      const items = Array.from({ length: total }, (_, i) => sheet({ id: `${i}` }));
      expect(pageCount(total, per)).toBe(paginate(items, per).length);
    }
  });
});

describe('suggestLayout', () => {
  const withPhotos = (n: number, total: number) =>
    Array.from({ length: total }, (_, i) => sheet({ id: `${i}`, imageUrl: i < n ? 'https://x/y.jpg' : null }));

  it('gives a buka with no photographs the menu it actually hands out', () => {
    expect(suggestLayout('Restaurant', withPhotos(0, 8)).id).toBe('menu');
  });

  it('but gives a restaurant that photographed its food a layout that shows them', () => {
    expect(suggestLayout('Restaurant', withPhotos(8, 8)).id).not.toBe('menu');
  });

  it('gives a boutique with photographs the lookbook', () => {
    expect(suggestLayout('Fashion & Apparel', withPhotos(6, 6)).id).toBe('lookbook');
  });

  it('gives a parts dealer the line sheet', () => {
    expect(suggestLayout('Spare Parts Store', withPhotos(0, 20)).id).toBe('linesheet');
  });

  it('falls back to the everyday grid', () => {
    expect(suggestLayout('Consulting', withPhotos(2, 4)).id).toBe('grid');
    expect(suggestLayout(null, []).id).toBe('grid');
  });
});

describe('sheetFileName', () => {
  it('drops the page suffix for a one-page catalogue', () => {
    expect(sheetFileName('mama-put', 'grid', 1, 1, 'png')).toBe('mama-put-catalogue-grid.png');
  });

  it('pads page numbers so a folder of them sorts correctly', () => {
    // Plain numbering puts page-10 before page-2.
    expect(sheetFileName('x', 'grid', 2, 12, 'png')).toBe('x-catalogue-grid-page-02.png');
    expect(sheetFileName('x', 'grid', 10, 12, 'png')).toBe('x-catalogue-grid-page-10.png');
    const names = [2, 10].map((p) => sheetFileName('x', 'grid', p, 12, 'png'));
    expect([...names].sort()).toEqual(names);
  });
});

describe('catalogueShareText', () => {
  it('says how much is in it and ends on the link', () => {
    const text = catalogueShareText({ name: 'Mama Put' }, 12, 'https://nowopenafrica.com/mamaput');
    expect(text).toContain('12 items');
    expect(text.trim().endsWith('https://nowopenafrica.com/mamaput')).toBe(true);
  });

  it('does not say "1 items"', () => {
    expect(catalogueShareText({ name: 'X' }, 1, 'u')).toContain('1 item)');
  });
});
