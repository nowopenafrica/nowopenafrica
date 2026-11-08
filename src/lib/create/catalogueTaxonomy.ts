import { type DesignTemplate, type SlotRole } from '../designTemplates';
import { deliverableFor } from '../design/deliverables';
import { NEEDS, type NeedSlug } from './needs';

/**
 * The catalogue's one taxonomy: the founder's categories A to H, the
 * subcategories (the products) inside them, and the facets a template can be
 * found by.
 *
 * -- HOW THIS RELATES TO THE OLD SYSTEMS --
 *
 * The nine needs (needs.ts) and the seven `DeliverableCategory` values
 * (deliverables.ts) are still live and untouched; they retire in Phase 5.
 * Subcategory keys REUSE the deliverable slugs from NEEDS, so a need maps onto
 * subcategories almost one for one (`needToSubcategories`). This file is
 * separate from design/taxonomy.ts, which is the search helper.
 *
 * -- NO PADDING --
 *
 * A subcategory exists here only if a template belongs to it or it is a pilot
 * target (business-card, instagram-post, billboard-48-sheet). Packaging, decks
 * and the like arrive in P4 with their work. A category with no subcategory
 * yet (production) is still named, but nothing is shown for it: see
 * `shownSubcategories`, which needs at least four directions of work.
 */

export type CategoryKey =
  | 'brand' | 'social' | 'advertising' | 'print'
  | 'presentations' | 'events' | 'product' | 'production';

export interface Subcategory {
  key: string;
  name: string;
  category: CategoryKey;
  /** FORMATS keys this product is made on. */
  formats: string[];
  /** Slots a layout must carry to count as this product. */
  requiredRoles: SlotRole[];
  sides: 'single' | 'front-back';
}

export const CATEGORIES: { key: CategoryKey; name: string; blurb: string }[] = [
  { key: 'brand', name: 'Brand identity & corporate', blurb: 'Cards, stationery, guidelines and the front of a brand.' },
  { key: 'social', name: 'Social & digital marketing', blurb: 'Posts, stories, covers, thumbnails and sale posts.' },
  { key: 'advertising', name: 'Advertising', blurb: 'Display ads, billboards, banners and signs.' },
  { key: 'print', name: 'Print & publishing', blurb: 'Flyers, posters, menus, price lists and vouchers.' },
  { key: 'presentations', name: 'Presentations & documents', blurb: 'Profiles, proposals, reports and certificates.' },
  { key: 'events', name: 'Events & entertainment', blurb: 'Event posters, tickets, speakers and invitations.' },
  { key: 'product', name: 'Product, packaging & merch', blurb: 'Labels, tags and merchandise.' },
  { key: 'production', name: 'Photo, video & production', blurb: 'Shoots and video. Nothing here is listed until it holds real work.' },
];

const HEAD: SlotRole[] = ['headline'];

const sub = (
  key: string, name: string, category: CategoryKey, formats: string[],
  requiredRoles: SlotRole[] = HEAD, sides: Subcategory['sides'] = 'single',
): Subcategory => ({ key, name, category, formats, requiredRoles, sides });

export const SUBCATEGORIES: Subcategory[] = [
  // A. Brand identity & corporate
  sub('business-card', 'Business card', 'brand', ['business-card'], ['brand', 'headline', 'contact'], 'front-back'),
  sub('letterhead', 'Letterhead', 'brand', ['letterhead']),
  sub('email-signature', 'Email signature', 'brand', ['email-header']),
  sub('invoice', 'Invoice', 'brand', ['a4']),
  sub('brand-launch', 'Brand launch post', 'brand', ['instagram-portrait']),
  sub('brand-guidelines', 'Brand guidelines', 'brand', ['x-post']),

  // B. Social & digital marketing
  sub('instagram-post', 'Social post', 'social', ['instagram-portrait', 'instagram-post']),
  sub('story', 'Story / WhatsApp status', 'social', ['story']),
  sub('carousel', 'Carousel', 'social', ['instagram-portrait']),
  sub('reels-cover', 'Reels cover', 'social', ['story']),
  sub('page-banner', 'Page & profile banner', 'social', ['facebook-cover', 'linkedin-cover']),
  sub('youtube-thumbnail', 'YouTube thumbnail', 'social', ['youtube-thumbnail']),
  sub('sale-post', 'Sale post', 'social', ['instagram-portrait', 'instagram-post']),

  // C. Advertising
  sub('display-ad', 'Display ad', 'advertising', ['display-leaderboard', 'display-mpu', 'website-banner']),
  sub('billboard', 'Billboard', 'advertising', ['billboard', 'led']),
  sub('billboard-48-sheet', '48-sheet billboard', 'advertising', ['board-48-sheet']),
  sub('roll-up', 'Roll-up banner', 'advertising', ['rollup']),
  sub('banner', 'Banner', 'advertising', ['backdrop']),
  sub('shopfront-sign', 'Shopfront sign', 'advertising', ['street', 'a4']),

  // D. Print & publishing
  sub('flyer', 'Flyer', 'print', ['a5', 'a4']),
  sub('offer-flyer', 'Offer flyer', 'print', ['a5', 'a4']),
  sub('poster', 'Poster', 'print', ['a4', 'a3']),
  sub('notice', 'Notice', 'print', ['a4']),
  sub('menu', 'Menu', 'print', ['a4', 'a5', 'x-post']),
  sub('price-list', 'Price list', 'print', ['a4']),
  sub('rate-card', 'Rate card', 'print', ['a4']),
  sub('gift-voucher', 'Gift voucher', 'print', ['compliment-slip']),

  // E. Presentations & documents
  sub('company-profile', 'Company profile', 'presentations', ['a4']),
  sub('proposal', 'Proposal', 'presentations', ['a4']),
  sub('report-cover', 'Report cover', 'presentations', ['a4']),
  sub('certificate', 'Certificate', 'presentations', ['half-a4', 'a4']),

  // F. Events & entertainment
  sub('event-poster', 'Event poster', 'events', ['a4', 'a3']),
  sub('ticket', 'Ticket', 'events', ['a5']),
  sub('speaker-card', 'Speaker card', 'events', ['instagram-post']),
  sub('invitation', 'Invitation', 'events', ['a5']),

  // G. Product, packaging & merch
  sub('product-label', 'Product label', 'product', ['postcard', 'square']),
  sub('hang-tag', 'Hang tag', 'product', ['business-card-portrait']),
  sub('merch', 'Merch', 'product', ['square']),

  // H. Photo, video & production: no subcategory holds work yet.
];

/** Occasion facet, from the spec. Kebab-case keys. */
export const OCCASIONS: string[] = [
  'sale', 'launch', 'opening', 'holiday', 'wedding', 'church-and-community', 'sport',
];

const BY_KEY = new Map(SUBCATEGORIES.map((s) => [s.key, s]));

/**
 * The subcategory a template belongs to, or null.
 *
 * Code templates always have one (a test enforces it). An uploaded template has
 * one only if its row named it, so this returns null for the rest.
 */
export function subcategoryFor(tpl: Pick<DesignTemplate, 'key'>): Subcategory | null {
  const key = deliverableFor(tpl)?.subcategory;
  return key ? BY_KEY.get(key) ?? null : null;
}

/**
 * The subcategories behind one of the nine needs, so the need tiles keep
 * working. A deliverable slug with no subcategory yet (no template, not a
 * pilot) is skipped.
 */
export function needToSubcategories(need: NeedSlug): string[] {
  const found = NEEDS.find((n) => n.slug === need);
  if (!found) return [];
  return found.deliverables.map((d) => d.slug).filter((slug) => BY_KEY.has(slug));
}

/** A subcategory is shown only when its listed work spans this many directions. */
export const MIN_DIRECTIONS = 4;

/**
 * Subcategories worth showing: those whose listed templates span at least four
 * distinct directions. No template carries a direction yet, so today this is
 * empty on purpose.
 */
export function shownSubcategories(listed: DesignTemplate[]): Subcategory[] {
  const directions = new Map<string, Set<string>>();
  for (const tpl of listed) {
    const s = subcategoryFor(tpl);
    if (!s || !tpl.direction) continue;
    const set = directions.get(s.key) ?? new Set<string>();
    set.add(tpl.direction);
    directions.set(s.key, set);
  }
  return SUBCATEGORIES.filter((s) => (directions.get(s.key)?.size ?? 0) >= MIN_DIRECTIONS);
}
