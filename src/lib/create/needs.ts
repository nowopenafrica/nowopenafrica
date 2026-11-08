import { DESIGN_TEMPLATES, type DesignTemplate } from '../designTemplates';
import { deliverableFor } from '../design/deliverables';
import { gate } from '../design/quality/gate';
import { GATED_SUBCATEGORIES, REVIEWS, type Review } from '../design/quality/ledger';
import { localDateISO } from '../dates';

/**
 * The one answer to "what do you need?".
 *
 * ── WHY NINE NEEDS REPLACE THREE CATEGORY SYSTEMS ────────────────────────
 *
 * The Create page used to carry thirteen disciplines (how a studio thinks),
 * seven gallery categories (how the library grew) and a service catalogue.
 * A business owner thinks "I need a business card" or "I need something for
 * the weekend sale" — a NEED, with a handful of things that satisfy it. This
 * file is that taxonomy and nothing else: the request box, the tiles, the
 * gallery and search all read it, so typing "business card" and tapping the
 * tile land in the same place.
 *
 * The database `category` column and `DeliverableCategory` are NOT touched;
 * every template additionally names a need and a deliverable in
 * `deliverables.ts`, and this file reads that.
 */

export type NeedSlug =
  | 'stationery' | 'brand' | 'social' | 'promotions' | 'flyers'
  | 'events' | 'menus' | 'outdoor' | 'documents';

export interface Need {
  slug: NeedSlug;
  title: string;
  blurb: string;
  deliverables: { slug: string; name: string }[];
}

export const NEEDS: Need[] = [
  {
    slug: 'stationery',
    title: 'Business cards & stationery',
    blurb: 'Cards, letterheads, invoices and the small print that carries your name.',
    deliverables: [
      { slug: 'business-card', name: 'Business card' },
      { slug: 'letterhead', name: 'Letterhead' },
      { slug: 'email-signature', name: 'Email signature' },
      { slug: 'invoice', name: 'Invoice' },
      { slug: 'compliment-slip', name: 'Compliment slip' },
    ],
  },
  {
    slug: 'brand',
    title: 'Brand & packaging',
    blurb: 'Launch your brand and dress your products.',
    deliverables: [
      { slug: 'brand-launch', name: 'Brand launch post' },
      { slug: 'brand-guidelines', name: 'Brand guidelines' },
      { slug: 'product-label', name: 'Product label' },
      { slug: 'hang-tag', name: 'Hang tag' },
      { slug: 'packaging', name: 'Packaging' },
      { slug: 'merch', name: 'Merch' },
    ],
  },
  {
    slug: 'social',
    title: 'Social media',
    blurb: 'Posts, stories, statuses, covers and thumbnails.',
    deliverables: [
      { slug: 'instagram-post', name: 'Post' },
      { slug: 'story', name: 'Story / WhatsApp status' },
      { slug: 'carousel', name: 'Carousel' },
      { slug: 'reels-cover', name: 'Reels cover' },
      { slug: 'page-banner', name: 'Page & profile banner' },
      { slug: 'youtube-thumbnail', name: 'YouTube thumbnail' },
    ],
  },
  {
    slug: 'promotions',
    title: 'Promotions & sales',
    blurb: 'Sales, offers, vouchers and ads.',
    deliverables: [
      { slug: 'sale-post', name: 'Sale post' },
      { slug: 'offer-flyer', name: 'Offer flyer' },
      { slug: 'gift-voucher', name: 'Gift voucher' },
      { slug: 'display-ad', name: 'Display ad' },
    ],
  },
  {
    slug: 'flyers',
    title: 'Flyers & posters',
    blurb: 'Anything handed out or put on a wall.',
    deliverables: [
      { slug: 'flyer', name: 'Flyer' },
      { slug: 'poster', name: 'Poster' },
      { slug: 'notice', name: 'Notice' },
    ],
  },
  {
    slug: 'events',
    title: 'Events & invitations',
    blurb: 'Posters, tickets, speakers and invitations.',
    deliverables: [
      { slug: 'event-poster', name: 'Event poster' },
      { slug: 'ticket', name: 'Ticket' },
      { slug: 'speaker-card', name: 'Speaker card' },
      { slug: 'invitation', name: 'Invitation' },
    ],
  },
  {
    slug: 'menus',
    title: 'Menus & price lists',
    blurb: 'What you sell and what it costs.',
    deliverables: [
      { slug: 'menu', name: 'Menu' },
      { slug: 'price-list', name: 'Price list' },
      { slug: 'rate-card', name: 'Rate card' },
    ],
  },
  {
    slug: 'outdoor',
    title: 'Signs & outdoor',
    blurb: 'Shopfronts, roll-ups, billboards and banners.',
    deliverables: [
      { slug: 'shopfront-sign', name: 'Shopfront sign' },
      { slug: 'roll-up', name: 'Roll-up banner' },
      { slug: 'billboard', name: 'Billboard' },
      { slug: 'banner', name: 'Banner' },
    ],
  },
  {
    slug: 'documents',
    title: 'Documents & presentations',
    blurb: 'Profiles, proposals, certificates and covers.',
    deliverables: [
      { slug: 'company-profile', name: 'Company profile' },
      { slug: 'proposal', name: 'Proposal' },
      { slug: 'certificate', name: 'Certificate' },
      { slug: 'report-cover', name: 'Report cover' },
      { slug: 'deck-cover', name: 'Deck cover' },
    ],
  },
];

/** Popular now — exactly six, one tap each, in this order. */
export const POPULAR: { need: NeedSlug; deliverable: string; label: string }[] = [
  { need: 'stationery', deliverable: 'business-card', label: 'Business card' },
  { need: 'flyers', deliverable: 'flyer', label: 'Flyer' },
  { need: 'social', deliverable: 'instagram-post', label: 'Instagram post' },
  { need: 'social', deliverable: 'story', label: 'WhatsApp status' },
  { need: 'menus', deliverable: 'menu', label: 'Menu' },
  { need: 'events', deliverable: 'invitation', label: 'Invitation' },
];

/** A need is shown on the page only when it has at least this many listed templates. */
export const MIN_LISTED = 6;

/**
 * Listing rule: a template is listed only when it has a hero `look`.
 * A lookless template is still reachable by a direct `?template=` link, so
 * nothing already saved breaks; it just is not offered.
 */
export const isListed = (t: Pick<DesignTemplate, 'look'>): boolean => isListedWith(t);

/**
 * The review gate's inputs. Injected so tests never mutate module constants;
 * production uses the ledger's own REVIEWS and GATED_SUBCATEGORIES (both empty
 * today, so the look rule above is the whole rule).
 */
export interface ListingRule {
  gated: ReadonlySet<string>;
  reviews: readonly Review[];
  today: string;
  all: DesignTemplate[];
}

/**
 * In a gated subcategory a template is listed only when it passes the review
 * gate (a current human review, 85 or more, no critical). Elsewhere: the look
 * rule. Uploaded rows have no subcategory unless one was registered for them,
 * so they follow the look rule until they are given a gated one, and are
 * never listed there without a passing review.
 *
 * The subcategory is read from `deliverableFor`, the source `subcategoryFor`
 * uses, so this file does not import catalogueTaxonomy (which imports this).
 *
 * Single-argument `isListed` stays safe to pass to `.filter()`; this is the
 * seam that takes the rule.
 */
export function isListedWith(
  t: Pick<DesignTemplate, 'look'>,
  rule?: ListingRule,
): boolean {
  const gated = rule?.gated ?? GATED_SUBCATEGORIES;
  if (gated.size > 0 && 'key' in t) {
    const sub = deliverableFor(t as DesignTemplate)?.subcategory;
    if (sub && gated.has(sub)) {
      const full = t as DesignTemplate;
      return gate(full, rule?.all ?? DESIGN_TEMPLATES, rule?.today ?? localDateISO(), rule?.reviews ?? REVIEWS).listed;
    }
  }
  return Boolean(t.look);
}

export const needFor = (t: Pick<DesignTemplate, 'key'>): NeedSlug | null =>
  deliverableFor(t)?.need ?? null;

export const deliverableSlugFor = (t: Pick<DesignTemplate, 'key'>): string | null =>
  deliverableFor(t)?.deliverable ?? null;

export const listedIn = (
  need: NeedSlug,
  from: DesignTemplate[] = DESIGN_TEMPLATES,
  rule?: ListingRule,
): DesignTemplate[] => from.filter((t) => isListedWith(t, rule) && needFor(t) === need);

export const listedFor = (
  deliverable: string,
  from: DesignTemplate[] = DESIGN_TEMPLATES,
  rule?: ListingRule,
): DesignTemplate[] => from.filter((t) => isListedWith(t, rule) && deliverableSlugFor(t) === deliverable);

/** Needs that have enough listed templates to be worth showing. */
export const shownNeeds = (from: DesignTemplate[] = DESIGN_TEMPLATES, rule?: ListingRule): Need[] =>
  NEEDS.filter((n) => listedIn(n.slug, from, rule).length >= MIN_LISTED);

/**
 * Old URLs: the 13 disciplines and the 7 gallery categories.
 *
 * Business cards sit under `branding` in the old system and resolve to
 * `stationery` through their deliverable, not through this coarse map.
 * video and photography have no matching need and return null.
 */
const LEGACY: Record<string, NeedSlug | null> = {
  // 13 disciplines
  branding: 'brand', social: 'social', outdoor: 'outdoor', events: 'events',
  packaging: 'brand', print: 'flyers', campaigns: 'promotions', documents: 'documents',
  video: null, photography: null, merchandise: 'brand', signage: 'outdoor', artwork: 'brand',
  // gallery categories not already named above
  flyers: 'flyers', menus: 'menus',
};

export const needFromLegacy = (slug: string): NeedSlug | null =>
  Object.prototype.hasOwnProperty.call(LEGACY, slug) ? LEGACY[slug] : null;
