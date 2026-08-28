// Laying a business's products out as a catalogue people can actually hold.
//
// The Studio already had a "Digital Catalogue", but it was a separate list the
// owner retyped by hand with an emoji standing in for each product, and its one
// export was a .txt file. Meanwhile the real products — with real photographs
// and real prices — sat in business_products, unused by it.
//
// This module is the layout half: it takes whatever a business already has and
// paginates it into sheets that a design can draw. Everything here is pure, so
// the pagination and the fitting rules are testable without a DOM.
//
// WHY SEVERAL LAYOUTS
//
// A catalogue is not one document. A boutique wants two big photographs a page;
// a wholesaler wants twelve rows with thumbnails and codes; a buka wants a menu
// with no photographs at all; and all of them also want something square to put
// on Instagram. The same products, laid out for the errand at hand.

import { Business } from '../types';
import { formatCataloguePrice, type CatalogueItem } from './catalogue';

/** One entry on a sheet, whatever it was built from. */
export interface SheetItem {
  id: string;
  name: string;
  description: string;
  /** Shown exactly as the business wrote it. See priceLabel. */
  price: string;
  imageUrl: string | null;
  featured: boolean;
}

/** A row as it comes out of business_products. */
export interface ProductRow {
  id: string;
  name: string;
  description?: string | null;
  price?: string | null;
  image_url?: string | null;
  is_featured?: boolean | null;
}

/**
 * The price line.
 *
 * business_products.price is free text — "₦12,000", "From ₦200/day",
 * "Contact us" — so it is shown as written rather than parsed and reformatted.
 * A blank one becomes "Ask", which is what a shop would say, rather than "₦0",
 * which is a claim the business never made.
 */
export function priceLabel(price: string | null | undefined): string {
  const trimmed = (price || '').trim();
  return trimmed || 'Ask';
}

export const productToSheetItem = (row: ProductRow): SheetItem => ({
  id: row.id,
  name: (row.name || '').trim() || 'Untitled',
  description: (row.description || '').trim(),
  price: priceLabel(row.price),
  imageUrl: (row.image_url || '').trim() || null,
  featured: !!row.is_featured,
});

/** A hand-entered Studio catalogue item, so both sources can share a sheet. */
export const catalogueItemToSheetItem = (item: CatalogueItem): SheetItem => ({
  id: item.id,
  name: item.name,
  description: item.description,
  price: formatCataloguePrice(item.price),
  imageUrl: null,
  featured: item.featured,
});

/**
 * Merge the two sources without duplicating anything.
 *
 * Real products win on a name collision: they carry a photograph and a price
 * the rest of the app already shows, so a hand-typed placeholder for the same
 * thing is the copy to drop. Featured items lead, because a catalogue's first
 * page is the one that gets looked at.
 */
export function buildSheetItems(products: ProductRow[], manual: CatalogueItem[] = []): SheetItem[] {
  const fromProducts = (products || []).map(productToSheetItem);
  const taken = new Set(fromProducts.map((i) => i.name.trim().toLowerCase()));
  const fromManual = (manual || [])
    .map(catalogueItemToSheetItem)
    .filter((i) => !taken.has(i.name.trim().toLowerCase()));

  const all = [...fromProducts, ...fromManual];
  // Stable within each band: a business that ordered its products deliberately
  // should not have that order shuffled by the sort.
  return [...all.filter((i) => i.featured), ...all.filter((i) => !i.featured)];
}

// --- The layouts --------------------------------------------------------------

export type CatalogueLayoutId = 'grid' | 'lookbook' | 'linesheet' | 'menu' | 'social' | 'story';

export interface CatalogueLayout {
  id: CatalogueLayoutId;
  label: string;
  blurb: string;
  /** Sheet size in CSS px. A4 at 96dpi is 794x1123. */
  width: number;
  height: number;
  perPage: number;
  /** Printed sheets go in the PDF at real paper size; social ones do not. */
  paper: { widthMm: number; heightMm: number };
  /** True when the design leans on photographs and looks thin without them. */
  needsImages: boolean;
}

const A4 = { widthMm: 210, heightMm: 297 };

export const CATALOGUE_LAYOUTS: CatalogueLayout[] = [
  {
    id: 'grid',
    label: 'Product grid',
    blurb: 'Nine to a page with photo, name and price. The everyday catalogue.',
    width: 794, height: 1123, perPage: 9, paper: A4, needsImages: true,
  },
  {
    id: 'lookbook',
    label: 'Lookbook',
    blurb: 'Two large photographs a page. For pieces that sell on how they look.',
    width: 794, height: 1123, perPage: 2, paper: A4, needsImages: true,
  },
  {
    id: 'linesheet',
    label: 'Line sheet',
    blurb: 'Twelve dense rows with thumbnails and codes — the wholesale sheet.',
    width: 794, height: 1123, perPage: 12, paper: A4, needsImages: false,
  },
  {
    id: 'menu',
    label: 'Menu',
    blurb: 'Two columns of names, dots and prices. No photographs needed.',
    width: 794, height: 1123, perPage: 18, paper: A4, needsImages: false,
  },
  {
    id: 'social',
    label: 'Social square',
    blurb: 'Four to a 1080 square, sized for a feed post.',
    width: 1080, height: 1080, perPage: 4, paper: { widthMm: 200, heightMm: 200 }, needsImages: true,
  },
  {
    id: 'story',
    label: 'Story / status',
    blurb: 'Three to a 9:16 frame, for WhatsApp status and Stories.',
    width: 1080, height: 1920, perPage: 3, paper: { widthMm: 120, heightMm: 213 }, needsImages: true,
  },
];

export function catalogueLayout(id: string | null | undefined): CatalogueLayout {
  return CATALOGUE_LAYOUTS.find((l) => l.id === id) || CATALOGUE_LAYOUTS[0];
}

/**
 * Which layout to open on, given what the business sells and what it has.
 *
 * A menu is offered to food businesses because that is the document they
 * actually hand out — but only when their products have no photographs, since
 * a business that went to the trouble of photographing its food should get the
 * layout that shows them.
 */
export function suggestLayout(category: string | null | undefined, items: SheetItem[]): CatalogueLayout {
  const cat = (category || '').toLowerCase();
  const withPhotos = (items || []).filter((i) => i.imageUrl).length;
  const mostlyPhotos = items.length > 0 && withPhotos >= items.length / 2;

  const food = /restaurant|food|caf|bakery|bar|grill|kebab|catering|lounge/.test(cat);
  if (food && !mostlyPhotos) return catalogueLayout('menu');

  const visual = /fashion|apparel|boutique|jewel|furniture|art|design|footwear|bags|cosmetic|wig|fabric/.test(cat);
  if (visual && mostlyPhotos) return catalogueLayout('lookbook');

  const wholesale = /spare parts|supermarket|import|export|trading|manufactur|agricultur|electronics/.test(cat);
  if (wholesale) return catalogueLayout('linesheet');

  return catalogueLayout('grid');
}

/**
 * Split the items into sheets.
 *
 * Always returns at least one page, even for an empty catalogue: the preview
 * has to render something, and an empty sheet showing the business's branding
 * is a clearer "add your products" than a blank panel.
 */
export function paginate(items: SheetItem[], perPage: number): SheetItem[][] {
  const size = Math.max(1, Math.floor(perPage) || 1);
  const list = items || [];
  if (list.length === 0) return [[]];
  const pages: SheetItem[][] = [];
  for (let i = 0; i < list.length; i += size) pages.push(list.slice(i, i + size));
  return pages;
}

/** Page count without building the pages, for a label. */
export const pageCount = (total: number, perPage: number): number =>
  Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, perPage)));

// --- Naming and sharing -------------------------------------------------------

/**
 * File name for one sheet.
 *
 * Page numbers are padded so a folder of them sorts correctly — `page-02` after
 * `page-01` and before `page-10`, which plain numbering gets wrong at ten
 * pages. A single-page catalogue gets no page suffix at all.
 */
export function sheetFileName(slug: string, layout: CatalogueLayoutId, page: number, total: number, ext: string): string {
  const base = `${slug}-catalogue-${layout}`;
  if (total <= 1) return `${base}.${ext}`;
  const width = String(total).length;
  return `${base}-page-${String(page).padStart(width, '0')}.${ext}`;
}

/** The message a catalogue travels with. */
export function catalogueShareText(business: Pick<Business, 'name'>, count: number, url: string): string {
  const what = count === 1 ? '1 item' : `${count} items`;
  return `${business.name} — full catalogue (${what})\n\nOrder or ask about anything here:\n${url}`;
}
