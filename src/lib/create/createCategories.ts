/**
 * "What are you creating today?" — the thirteen things customers come for.
 *
 * ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────
 *
 * Create Media browsed by STYLE and by individual design output: "Signature",
 * "Press", "Announcement flyer", "Quote post". Those are a designer's words.
 * A business owner arrives wanting packaging for a sauce, a billboard for a
 * launch, or T-shirts for their staff, and none of those were a thing you
 * could click.
 *
 * ── WHY THIS IS A THIRD TAXONOMY, AND WHY THAT IS CORRECT ────────────────
 *
 * Two already exist and both are right for their job:
 *
 *   design/deliverables.ts  which LAYOUT belongs to which deliverable —
 *                           what the template library can actually draw.
 *   public.services         which SERVICE can be bought, and at what price.
 *
 * Neither is a customer's mental model. "Packaging & Labels" spans template
 * layouts we have none of AND a real priced service; "Social Media" is almost
 * all templates and barely a service. So this layer maps one customer
 * intention onto both, and — the important part — tells the truth about what
 * is behind each card.
 *
 * ── THE RULE THAT KEEPS IT HONEST ────────────────────────────────────────
 *
 * A card never implies more than exists. `offers` is computed from real data,
 * never written down:
 *
 *   templates  there are editable layouts, and the count is counted.
 *   service    no layouts, but a real catalogue service to request.
 *   elsewhere  neither — this belongs to another part of the product.
 *
 * Billboard is the case that matters most. NowOpen really does sell outdoor
 * placements, but that lives in Promote/Adverts and is an inventory booking,
 * not a design file. A card that quietly mixed the two would have somebody
 * believing they had booked a billboard because they downloaded a JPEG.
 */

import { DELIVERABLE_CATEGORIES, type DeliverableCategory } from '../design/deliverables';

export type CreateCategorySlug =
  | 'branding' | 'social' | 'outdoor' | 'events' | 'packaging' | 'print'
  | 'campaigns' | 'photography' | 'video' | 'artwork' | 'merchandise'
  | 'documents' | 'signage';

export interface CreateCategory {
  slug: CreateCategorySlug;
  title: string;
  blurb: string;
  /** The examples line, in the customer's words. */
  examples: string[];
  /**
   * Which deliverable categories supply this card's editable templates.
   * Empty means there are none — which the card then says.
   */
  deliverables: DeliverableCategory[];
  /** Catalogue category slugs (public.service_categories) to offer under it. */
  serviceCategories: string[];
  /**
   * Where this belongs when it is not a design file at all.
   *
   * Only outdoor advertising has one today: the placement is inventory sold
   * in Promote, and conflating it with artwork is the single most expensive
   * misunderstanding this page could create.
   */
  elsewhere?: { label: string; to: string; note: string };
}

/**
 * The founder's launch order: the first six make the breadth of Create Media
 * legible to a business owner, and the rest follow in the same system.
 */
export const CREATE_CATEGORIES: CreateCategory[] = [
  {
    slug: 'branding',
    title: 'Corporate Branding',
    blurb: 'Logos, identity systems, stationery and brand guides.',
    examples: ['Brand identity kit', 'Logo design', 'Business cards'],
    deliverables: ['branding'],
    serviceCategories: ['branding-identity'],
  },
  {
    slug: 'social',
    title: 'Social Media',
    blurb: 'Posts, stories, reels covers, carousels and more.',
    examples: ['Social post', 'Content pack', 'Story'],
    deliverables: ['social'],
    serviceCategories: ['design-studio'],
  },
  {
    slug: 'outdoor',
    title: 'Billboard & Outdoor',
    blurb: 'Billboards, LED screens, lampposts and outdoor displays.',
    examples: ['Billboard artwork', 'Roll-up banner', 'Outdoor campaign'],
    /* No outdoor layouts exist. The card says so rather than showing flyers. */
    deliverables: [],
    serviceCategories: ['print-packaging', 'print-production'],
    elsewhere: {
      label: 'Book a placement',
      to: '/adverts',
      note: 'Buying the site is a placement, not a design — that lives in Promote.',
    },
  },
  {
    slug: 'events',
    title: 'Events & Entertainment',
    blurb: 'Event posters, tickets, programmes and invitations.',
    examples: ['Event flyer', 'Invitation', 'Ticket design'],
    deliverables: ['events'],
    serviceCategories: ['design-studio'],
  },
  {
    slug: 'packaging',
    title: 'Packaging & Labels',
    blurb: 'Product packaging, labels, wraps, pouches and boxes.',
    examples: ['Product label', 'Packaging design', 'Box artwork'],
    deliverables: [],
    serviceCategories: ['print-packaging'],
  },
  {
    slug: 'print',
    title: 'Flyers, Posters & Print',
    blurb: 'Flyers, posters, brochures, menus and stationery.',
    examples: ['Sales flyer', 'Product poster', 'Restaurant menu'],
    deliverables: ['flyers', 'menus'],
    serviceCategories: ['design-studio', 'print-production'],
  },
  {
    slug: 'campaigns',
    title: 'Campaigns & Promotions',
    blurb: 'Product launches, seasonal offers and brand campaigns.',
    examples: ['Campaign key visual', 'Flash sale', 'Launch campaign'],
    deliverables: ['campaigns'],
    serviceCategories: ['marketing-campaigns'],
  },
  {
    slug: 'documents',
    title: 'Business Documents',
    blurb: 'Proposals, reports, profiles and presentations.',
    examples: ['Company profile', 'Pitch deck', 'Proposal'],
    deliverables: ['documents'],
    serviceCategories: ['business-digital'],
  },
  {
    slug: 'video',
    title: 'Videography & Motion',
    blurb: 'Videos, animations, reels and motion graphics.',
    examples: ['Brand video', 'Reel edit', 'Animated logo'],
    deliverables: [],
    serviceCategories: ['video-motion'],
  },
  {
    slug: 'photography',
    title: 'Photography',
    blurb: 'Product, lifestyle, corporate and editorial photos.',
    examples: ['Product shoot', 'Portrait session', 'Image editing'],
    deliverables: [],
    serviceCategories: ['creative-services'],
  },
  {
    slug: 'merchandise',
    title: 'Merchandise & T-shirts',
    blurb: 'T-shirts, caps, mugs and promotional items.',
    examples: ['T-shirt design', 'Uniform branding', 'Merchandise set'],
    deliverables: [],
    serviceCategories: ['print-packaging', 'print-production'],
  },
  {
    slug: 'signage',
    title: 'Retail & Signage',
    blurb: 'Shop signs, window graphics and display boards.',
    examples: ['Storefront sign', 'Display board', 'Office signage'],
    deliverables: [],
    serviceCategories: ['print-packaging', 'print-production'],
  },
  {
    slug: 'artwork',
    title: 'Artwork & Wall Frames',
    blurb: 'Art prints, posters, wall décor and illustrations.',
    examples: ['Art print', 'Framed portrait', 'Wall canvas'],
    deliverables: [],
    serviceCategories: ['creative-services'],
  },
];

/**
 * One photograph per category, showing the work itself.
 *
 * ── WHY A MAP AND NOT THE EXISTING POOL ──────────────────────────────────
 *
 * `previewPhotoFor` hashes a key across eight generic images covering five
 * subjects. That is right for a template preview, where the picture is
 * furniture behind placeholder copy. It is wrong here: on a category card the
 * photograph is the only thing saying what the category IS, and hashing gave
 * outdoor, merchandise and signage the same retail photo while packaging drew
 * a plate of food.
 *
 * So each category names its own image. Every one was searched for by subject
 * and LOOKED AT before being written down — business cards for branding, a
 * billboard for outdoor, jars for packaging, a framed print for artwork.
 *
 * ── LICENCE ──────────────────────────────────────────────────────────────
 *
 * Pexels, the same source and licence the gallery already relies on:
 * commercial use and modification permitted, no attribution required. Nothing
 * here was taken from Canva, Freepik or another design tool's library, and
 * `images.pexels.com` is already allowed by the Content-Security-Policy.
 *
 * These are category ILLUSTRATIONS. They are not templates, not a customer's
 * work, and never attached to a real business — the label under each card is
 * what says whether there is something to edit or someone to brief.
 */
const PEXELS = (id: number): string =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=600`;

export const CATEGORY_PHOTO: Record<CreateCategorySlug, string> = {
  branding: PEXELS(5706020),      // blank business cards on a desk
  social: PEXELS(15226551),       // a phone showing a social feed
  outdoor: PEXELS(14780175),      // lit billboards over a city street
  events: PEXELS(13230484),       // a lit stage above a crowd
  packaging: PEXELS(36792536),    // labelled jars on a shelf
  print: PEXELS(7648516),         // a printed brochure, held
  campaigns: PEXELS(29501720),    // a wall of campaign posters
  documents: PEXELS(7580792),     // printed charts and a report
  video: PEXELS(19623305),        // a video camera on a shoot
  photography: PEXELS(33273434),  // a photographer behind a camera
  merchandise: PEXELS(6312178),   // blank branded mugs
  signage: PEXELS(5691036),       // a hanging shopfront sign
  artwork: PEXELS(8843986),       // framed prints on a wall
};

export type Offer =
  | { kind: 'templates'; count: number }
  | { kind: 'service' }
  | { kind: 'elsewhere' };

/**
 * What is really behind a card.
 *
 * COUNTED, never declared. The brief is explicit that counts must come from
 * the actual library, and a card promising "24 designs" that opens on four is
 * the fastest way to lose somebody on their first visit.
 */
export function offerFor(
  category: CreateCategory,
  templateCounts: Partial<Record<DeliverableCategory, number>>,
  availableServiceCategories: ReadonlySet<string>,
): Offer {
  const count = category.deliverables.reduce((n, d) => n + (templateCounts[d] ?? 0), 0);
  if (count > 0) return { kind: 'templates', count };
  if (category.serviceCategories.some((s) => availableServiceCategories.has(s))) {
    return { kind: 'service' };
  }
  return { kind: 'elsewhere' };
}

/** The words on the card's action, matching what will actually happen. */
export function offerLabel(offer: Offer): string {
  switch (offer.kind) {
    case 'templates':
      return offer.count === 1 ? '1 design to edit' : `${offer.count} designs to edit`;
    case 'service':
      return 'Request a price';
    default:
      return 'See where this lives';
  }
}

/** Every deliverable category a set of cards claims — for a completeness check. */
export const claimedDeliverables = (): DeliverableCategory[] =>
  [...new Set(CREATE_CATEGORIES.flatMap((c) => c.deliverables))];

/**
 * Deliverable categories no card points at.
 *
 * A layout the library can draw but no card reaches is a design nobody will
 * ever find. The test asserts this is empty.
 */
export const unreachableDeliverables = (): DeliverableCategory[] => {
  const claimed = new Set<string>(claimedDeliverables());
  return DELIVERABLE_CATEGORIES.map((c) => c.id).filter((id) => !claimed.has(id));
};
