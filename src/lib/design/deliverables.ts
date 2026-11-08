import { DESIGN_TEMPLATES, type DesignTemplate } from '../designTemplates';
import type { NeedSlug } from '../create/needs';

/**
 * What each layout actually makes, in the words a business owner uses.
 *
 * ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────
 *
 * The library was discovered by STYLE: "Editorial Split", "Quiet Luxe",
 * "Half Photo", "Statement". Those are accurate names for what a designer
 * chose, and useless to a restaurant owner who thinks "I need a menu".
 *
 * People search for the deliverable and explore style afterwards. So every
 * layout now carries the thing it produces — Menu, Business Card, Event
 * Ticket, Price List — and the style name becomes secondary description.
 *
 * ── WHY THIS IS A TABLE AND NOT A GUESS ──────────────────────────────────
 *
 * It would be easy to infer the category from tags. It would also be wrong
 * often enough to matter: `price-block` is tagged "price/offer/cost" and is
 * an offer poster, while `price-list` is tagged "menu/price list/rates" and
 * is a price list. One is a campaign, the other is a document, and no
 * keyword rule separates them reliably. Each line below was read off the
 * layout's own slots and tags.
 *
 * ── CATEGORIES ONLY EXIST IF THEY HAVE WORK IN THEM ──────────────────────
 *
 * Packaging, signage, video and product photography are real categories a
 * creative studio should have, and this library has no layouts for them. They
 * are therefore ABSENT rather than listed and empty: a category that opens
 * onto nothing is a promise the product does not keep.
 */

export type DeliverableCategory =
  | 'flyers' | 'social' | 'campaigns' | 'events' | 'branding' | 'documents' | 'menus';

export const DELIVERABLE_CATEGORIES: { id: DeliverableCategory; label: string; blurb: string }[] = [
  { id: 'flyers', label: 'Flyers & posters', blurb: 'Announcements, openings, property, delivery — anything handed out or put on a wall.' },
  { id: 'campaigns', label: 'Offers & campaigns', blurb: 'Sales, discounts, bundles and launches.' },
  { id: 'social', label: 'Social media', blurb: 'Posts, stories, statuses, quotes and reviews.' },
  { id: 'events', label: 'Events & tickets', blurb: 'Line-ups, speakers, admission tickets.' },
  { id: 'branding', label: 'Branding & cards', blurb: 'Business cards, covers and the front of a brand.' },
  { id: 'documents', label: 'Business documents', blurb: 'Profiles, proposals, reports, certificates, hours, vacancies.' },
  { id: 'menus', label: 'Menus & price lists', blurb: 'What you sell and what it costs.' },
];

export interface Deliverable {
  category: DeliverableCategory;
  /** What this makes, named as a customer would ask for it. */
  name: string;
  /**
   * The THING, when several layouts are variants of one deliverable.
   *
   * Seven layouts are all business cards. Someone asking for "a business
   * card" wants to see the seven and choose, not to be handed whichever one
   * sorted first — so they share a slug and the gallery can show the
   * collection. Without it, a request for a card lands on a category that
   * also holds portfolio covers.
   */
  slug?: string;
  /**
   * The canvas this thing belongs on, as a DESIGN_FORMATS key.
   *
   * A business card that opens on a 1080x1080 social canvas is a card in
   * name only — the document has to BE the size, or every export is wrong.
   */
  format?: string;
  /**
   * The customer's need this is filed under (see create/needs.ts), and the
   * deliverable within it. Required on every code template; optional here
   * because uploaded rows only know their database `category`.
   */
  need?: NeedSlug;
  deliverable?: string;
  /**
   * The subcategory in create/catalogueTaxonomy.ts this belongs to. Typed as a
   * string because that file imports this one; a test checks every value
   * resolves. Required on code templates, optional on uploaded rows.
   */
  subcategory?: string;
}

/** A code template always says which need and deliverable it serves. */
export type CodeDeliverable = Deliverable & { need: NeedSlug; deliverable: string; subcategory: string };

/**
 * Every layout, by key.
 *
 * Read from each layout's own slots and tags — see the note above on why a
 * keyword rule is not good enough.
 */
export const DELIVERABLES: Record<string, CodeDeliverable> = {
  // ── Flyers & posters ──────────────────────────────────────────────────
  'editorial-split': { category: 'flyers', name: 'Announcement flyer', need: 'flyers', deliverable: 'flyer', subcategory: 'flyer' },
  'street-poster': { category: 'flyers', name: 'Event poster', need: 'events', deliverable: 'event-poster', subcategory: 'event-poster' },
  'gallery-serif': { category: 'flyers', name: 'Exhibition poster', need: 'events', deliverable: 'event-poster', subcategory: 'event-poster' },
  'band-poster': { category: 'flyers', name: 'Bold event poster', need: 'events', deliverable: 'event-poster', subcategory: 'event-poster' },
  'promo-frame': { category: 'flyers', name: 'Notice poster', need: 'flyers', deliverable: 'notice', subcategory: 'notice' },
  'corner-anchor': { category: 'flyers', name: 'Minimal promo poster', need: 'flyers', deliverable: 'poster', subcategory: 'poster' },
  'photo-foot': { category: 'flyers', name: 'Photo promo flyer', need: 'flyers', deliverable: 'flyer', subcategory: 'flyer' },
  'grid-baseline': { category: 'flyers', name: 'Corporate flyer', need: 'flyers', deliverable: 'flyer', subcategory: 'flyer' },
  'coming-soon': { category: 'flyers', name: 'Coming soon flyer', need: 'flyers', deliverable: 'poster', subcategory: 'poster' },
  'before-after': { category: 'flyers', name: 'Before & after flyer', need: 'flyers', deliverable: 'flyer', subcategory: 'flyer' },
  'property-listing': { category: 'flyers', name: 'Property listing flyer', need: 'flyers', deliverable: 'flyer', subcategory: 'flyer' },
  'order-delivery': { category: 'flyers', name: 'Delivery & orders flyer', need: 'flyers', deliverable: 'flyer', subcategory: 'flyer' },
  'promo-half-photo': { category: 'flyers', name: 'Product promo flyer', need: 'flyers', deliverable: 'flyer', subcategory: 'flyer' },

  // ── Offers & campaigns ────────────────────────────────────────────────
  'warm-offer': { category: 'campaigns', name: 'Weekend offer', need: 'promotions', deliverable: 'offer-flyer', subcategory: 'offer-flyer' },
  'price-block': { category: 'campaigns', name: 'Offer poster', need: 'promotions', deliverable: 'offer-flyer', subcategory: 'offer-flyer' },
  'promo-burst': { category: 'campaigns', name: 'Sale burst poster', need: 'promotions', deliverable: 'sale-post', subcategory: 'sale-post' },
  'flash-sale': { category: 'campaigns', name: 'Flash sale poster', need: 'promotions', deliverable: 'sale-post', subcategory: 'sale-post' },
  'price-drop': { category: 'campaigns', name: 'Price drop post', need: 'promotions', deliverable: 'sale-post', subcategory: 'sale-post' },
  'promo-mega-number': { category: 'campaigns', name: 'Big discount poster', need: 'promotions', deliverable: 'sale-post', subcategory: 'sale-post' },
  'promo-diagonal': { category: 'campaigns', name: 'Sale poster', need: 'promotions', deliverable: 'sale-post', subcategory: 'sale-post' },
  'promo-sticker': { category: 'campaigns', name: 'Today-only sticker', need: 'promotions', deliverable: 'sale-post', subcategory: 'sale-post' },
  'promo-stack': { category: 'campaigns', name: 'Bundle or plan offer', need: 'promotions', deliverable: 'offer-flyer', subcategory: 'offer-flyer' },
  'promo-ticker': { category: 'campaigns', name: 'Sale banner', need: 'promotions', deliverable: 'display-ad', subcategory: 'display-ad' },
  'promo-two-for': { category: 'campaigns', name: 'Two-for-one offer', need: 'promotions', deliverable: 'sale-post', subcategory: 'sale-post' },
  'offer-price': { category: 'campaigns', name: 'Price offer flyer', need: 'promotions', deliverable: 'offer-flyer', subcategory: 'offer-flyer' },
  'product-grid': { category: 'campaigns', name: 'New arrivals catalogue', need: 'promotions', deliverable: 'offer-flyer', subcategory: 'offer-flyer' },

  // ── Social media ──────────────────────────────────────────────────────
  statement: { category: 'social', name: 'Quote post', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'soft-glass': { category: 'social', name: 'App launch post', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'mesh-accent': { category: 'social', name: 'Launch post', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'story-caption': { category: 'social', name: 'WhatsApp status / story', need: 'social', deliverable: 'story', subcategory: 'story' },
  'pull-quote': { category: 'social', name: 'Scripture or quote post', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'quote-frame': { category: 'social', name: 'Testimonial post', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'ultra-stack': { category: 'social', name: 'Statement post', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'story-steps': { category: 'social', name: 'Story in three steps', need: 'social', deliverable: 'story', subcategory: 'story' },
  'giveaway-steps': { category: 'social', name: 'Giveaway post', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'testimonial-card': { category: 'social', name: 'Customer review post', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'countdown-post': { category: 'social', name: 'Countdown post', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },

  // ── Events & tickets ──────────────────────────────────────────────────
  ticket: { category: 'events', name: 'Event ticket', need: 'events', deliverable: 'ticket', subcategory: 'ticket' },
  'ticket-stub': { category: 'events', name: 'Admission ticket', need: 'events', deliverable: 'ticket', subcategory: 'ticket' },
  'speaker-card': { category: 'events', name: 'Speaker card', need: 'events', deliverable: 'speaker-card', subcategory: 'speaker-card' },
  'event-lineup': { category: 'events', name: 'Event line-up', need: 'events', deliverable: 'event-poster', subcategory: 'event-poster' },

  // ── Branding & cards ──────────────────────────────────────────────────
  'card-front': { category: 'branding', name: 'Business card', slug: 'business-card', format: 'business-card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'card-minimal': { category: 'branding', name: 'Minimal corporate card', slug: 'business-card', format: 'business-card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'card-centred': { category: 'branding', name: 'Clean centred card', slug: 'business-card', format: 'business-card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'card-luxe-dark': { category: 'branding', name: 'Luxury dark card', slug: 'business-card', format: 'business-card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'card-type-led': { category: 'branding', name: 'Typography card', slug: 'business-card', format: 'business-card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'card-logo-led': { category: 'branding', name: 'Logo-led card', slug: 'business-card', format: 'business-card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'card-colour-block': { category: 'branding', name: 'Colour block card', slug: 'business-card', format: 'business-card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'card-qr': { category: 'branding', name: 'QR contact card', slug: 'business-card', format: 'business-card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'quiet-luxe': { category: 'branding', name: 'Premium brand card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'swiss-grid': { category: 'branding', name: 'Studio portfolio cover', need: 'documents', deliverable: 'company-profile', subcategory: 'company-profile' },
  'minimal-grid': { category: 'branding', name: 'Corporate cover', need: 'documents', deliverable: 'report-cover', subcategory: 'report-cover' },

  // ── Business documents ────────────────────────────────────────────────
  'agency-services': { category: 'documents', name: 'Services one-pager', need: 'documents', deliverable: 'company-profile', subcategory: 'company-profile' },
  'why-choose-us': { category: 'documents', name: 'Why choose us sheet', need: 'documents', deliverable: 'company-profile', subcategory: 'company-profile' },
  'proof-points': { category: 'documents', name: 'Results sheet', need: 'documents', deliverable: 'company-profile', subcategory: 'company-profile' },
  'numbered-services': { category: 'documents', name: 'Process steps sheet', need: 'documents', deliverable: 'company-profile', subcategory: 'company-profile' },
  'consulting-clean': { category: 'documents', name: 'Proposal cover', need: 'documents', deliverable: 'proposal', subcategory: 'proposal' },
  'report-cover': { category: 'documents', name: 'Report cover', need: 'documents', deliverable: 'report-cover', subcategory: 'report-cover' },
  'company-profile': { category: 'documents', name: 'Company profile cover', need: 'documents', deliverable: 'company-profile', subcategory: 'company-profile' },
  certificate: { category: 'documents', name: 'Certificate', need: 'documents', deliverable: 'certificate', subcategory: 'certificate' },
  'team-intro': { category: 'documents', name: 'Team introduction', need: 'documents', deliverable: 'company-profile', subcategory: 'company-profile' },
  vacancy: { category: 'documents', name: 'Job vacancy notice', need: 'flyers', deliverable: 'notice', subcategory: 'notice' },
  'stat-strip': { category: 'documents', name: 'Results strip', need: 'documents', deliverable: 'company-profile', subcategory: 'company-profile' },
  'opening-hours': { category: 'documents', name: 'Opening hours card', need: 'flyers', deliverable: 'notice', subcategory: 'notice' },

  // ── Menus & price lists ───────────────────────────────────────────────
  'price-list': { category: 'menus', name: 'Price list', need: 'menus', deliverable: 'price-list', subcategory: 'price-list' },
  'menu-column': { category: 'menus', name: 'Menu', need: 'menus', deliverable: 'menu', subcategory: 'menu' },

  /*
   * ── THE TEMPLATE CATALOGUE (catalogueTemplates.ts) ───────────────────
   *
   * Every one names its canvas. These are print pieces, banners and fixed
   * ad sizes, and a letterhead or a 728x90 that opens on the square default
   * is wrong in every file it exports.
   */
  'brand-intro-reveal': { category: 'branding', name: 'Brand launch post', format: 'instagram-portrait', need: 'brand', deliverable: 'brand-launch', subcategory: 'brand-launch' },
  'brand-guidelines-cover': { category: 'branding', name: 'Brand guidelines cover', format: 'x-post', need: 'brand', deliverable: 'brand-guidelines', subcategory: 'brand-guidelines' },
  'letterhead-edge': { category: 'branding', name: 'Letterhead', format: 'letterhead', need: 'stationery', deliverable: 'letterhead', subcategory: 'letterhead' },
  'email-signature-bar': { category: 'branding', name: 'Email signature', format: 'email-header', need: 'stationery', deliverable: 'email-signature', subcategory: 'email-signature' },
  'shopfront-fascia': { category: 'branding', name: 'Shopfront sign', format: 'street', need: 'outdoor', deliverable: 'shopfront-sign', subcategory: 'shopfront-sign' },
  'product-label-arch': { category: 'branding', name: 'Product label', format: 'postcard', need: 'brand', deliverable: 'product-label', subcategory: 'product-label' },
  'hang-tag': { category: 'branding', name: 'Clothing hang tag', format: 'business-card-portrait', need: 'brand', deliverable: 'hang-tag', subcategory: 'hang-tag' },
  'merch-slogan': { category: 'branding', name: 'T-shirt artwork', format: 'square', need: 'brand', deliverable: 'merch', subcategory: 'merch' },
  'profile-banner': { category: 'branding', name: 'LinkedIn banner', format: 'linkedin-cover', need: 'social', deliverable: 'page-banner', subcategory: 'page-banner' },

  'campaign-key-visual': { category: 'campaigns', name: 'Campaign key visual', format: 'instagram-portrait', need: 'promotions', deliverable: 'sale-post', subcategory: 'sale-post' },
  'launch-split-wide': { category: 'campaigns', name: 'Product launch banner', format: 'x-post', need: 'promotions', deliverable: 'display-ad', subcategory: 'display-ad' },
  'tiered-sale': { category: 'campaigns', name: 'Tiered sale post', format: 'instagram-portrait', need: 'promotions', deliverable: 'sale-post', subcategory: 'sale-post' },
  'app-download': { category: 'campaigns', name: 'App download post', format: 'instagram-post', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'donation-appeal': { category: 'campaigns', name: 'Donation appeal', format: 'instagram-portrait', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'hotel-stay': { category: 'campaigns', name: 'Hotel stay offer', format: 'instagram-portrait', need: 'promotions', deliverable: 'sale-post', subcategory: 'sale-post' },
  'shop-product-card': { category: 'campaigns', name: 'Online store product post', format: 'instagram-post', need: 'promotions', deliverable: 'sale-post', subcategory: 'sale-post' },
  'gift-voucher': { category: 'campaigns', name: 'Gift voucher', format: 'compliment-slip', need: 'promotions', deliverable: 'gift-voucher', subcategory: 'gift-voucher' },

  'carousel-cover-number': { category: 'social', name: 'Carousel cover slide', format: 'instagram-portrait', need: 'social', deliverable: 'carousel', subcategory: 'carousel' },
  'insight-stat': { category: 'social', name: 'Insight stat post', format: 'instagram-portrait', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'reels-cover-centre': { category: 'social', name: 'Reels cover', format: 'story', need: 'social', deliverable: 'reels-cover', subcategory: 'reels-cover' },
  'status-order': { category: 'social', name: 'Order-now WhatsApp status', format: 'story', need: 'social', deliverable: 'story', subcategory: 'story' },
  'thumbnail-split': { category: 'social', name: 'YouTube thumbnail', format: 'youtube-thumbnail', need: 'social', deliverable: 'youtube-thumbnail', subcategory: 'youtube-thumbnail' },
  'pin-checklist': { category: 'social', name: 'Pinterest checklist pin', format: 'pinterest', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'class-timetable': { category: 'social', name: 'Class timetable', format: 'instagram-portrait', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'facebook-cover-clean': { category: 'social', name: 'Facebook page cover', format: 'facebook-cover', need: 'social', deliverable: 'page-banner', subcategory: 'page-banner' },

  'web-hero': { category: 'flyers', name: 'Website hero banner', format: 'website-banner', need: 'promotions', deliverable: 'display-ad', subcategory: 'display-ad' },
  'leaderboard-ad': { category: 'flyers', name: 'Leaderboard display ad', format: 'display-leaderboard', need: 'promotions', deliverable: 'display-ad', subcategory: 'display-ad' },
  'mpu-ad': { category: 'flyers', name: 'MPU display ad', format: 'display-mpu', need: 'promotions', deliverable: 'display-ad', subcategory: 'display-ad' },
  'rollup-clean': { category: 'flyers', name: 'Roll-up banner', format: 'rollup', need: 'outdoor', deliverable: 'roll-up', subcategory: 'roll-up' },
  'billboard-statement': { category: 'flyers', name: 'Billboard', format: 'billboard', need: 'outdoor', deliverable: 'billboard', subcategory: 'billboard' },
  'flyer-services-photo': { category: 'flyers', name: 'A5 services flyer', format: 'a5', need: 'flyers', deliverable: 'flyer', subcategory: 'flyer' },
  'property-feature-wide': { category: 'flyers', name: 'Property feature banner', format: 'x-post', need: 'promotions', deliverable: 'display-ad', subcategory: 'display-ad' },

  'swiss-event-poster': { category: 'events', name: 'A4 event poster', format: 'a4', need: 'events', deliverable: 'event-poster', subcategory: 'event-poster' },
  'wedding-invite': { category: 'events', name: 'Wedding invitation', format: 'a5', need: 'events', deliverable: 'invitation', subcategory: 'invitation' },

  'invoice-modern': { category: 'documents', name: 'Invoice', format: 'a4', need: 'stationery', deliverable: 'invoice', subcategory: 'invoice' },
  'certificate-modern': { category: 'documents', name: 'Landscape certificate', format: 'half-a4', need: 'documents', deliverable: 'certificate', subcategory: 'certificate' },

  'menu-modern': { category: 'menus', name: 'A4 menu', format: 'a4', need: 'menus', deliverable: 'menu', subcategory: 'menu' },
  'rate-card': { category: 'menus', name: 'Rate card', format: 'a4', need: 'menus', deliverable: 'rate-card', subcategory: 'rate-card' },
  'drinks-menu': { category: 'menus', name: 'Drinks menu', format: 'a5', need: 'menus', deliverable: 'menu', subcategory: 'menu' },
  'menu-board': { category: 'menus', name: 'TV menu board', format: 'x-post', need: 'menus', deliverable: 'menu', subcategory: 'menu' },
  'event-backdrop': { category: 'events', name: 'Event backdrop', format: 'backdrop', need: 'outdoor', deliverable: 'banner', subcategory: 'banner' },
  'led-screen-ad': { category: 'flyers', name: 'LED screen ad', format: 'led', need: 'outdoor', deliverable: 'billboard', subcategory: 'billboard' },
  'pavement-sign': { category: 'flyers', name: 'Pavement A-board', format: 'a4', need: 'outdoor', deliverable: 'shopfront-sign', subcategory: 'shopfront-sign' },
  'round-sticker': { category: 'branding', name: 'Round sticker label', format: 'square', need: 'brand', deliverable: 'product-label', subcategory: 'product-label' },
  /*
   * ── THE PILOT COLLECTION (pilotTemplates.ts) ─────────────────────────
   *
   * Directed designs for the three products the catalogue gate pilots on.
   * The cards join the business-card collection, so their palettes are held
   * apart from the existing eight by libraryVariety.test.ts.
   */
  'pilot-card-luxury': { category: 'branding', name: 'Luxury business card', slug: 'business-card', format: 'business-card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'pilot-card-minimal': { category: 'branding', name: 'Minimal business card', slug: 'business-card', format: 'business-card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'pilot-card-corporate': { category: 'branding', name: 'Corporate business card', slug: 'business-card', format: 'business-card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'pilot-card-editorial': { category: 'branding', name: 'Editorial business card', slug: 'business-card', format: 'business-card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'pilot-card-bold': { category: 'branding', name: 'Bold business card', slug: 'business-card', format: 'business-card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'pilot-card-contemporary': { category: 'branding', name: 'Contemporary business card with QR code', slug: 'business-card', format: 'business-card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'pilot-card-playful': { category: 'branding', name: 'Playful business card', slug: 'business-card', format: 'business-card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'pilot-card-industry': { category: 'branding', name: 'Clinic appointment card', slug: 'business-card', format: 'business-card', need: 'stationery', deliverable: 'business-card', subcategory: 'business-card' },
  'pilot-ig-luxury': { category: 'social', name: 'Collection launch post', format: 'instagram-portrait', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'pilot-ig-editorial': { category: 'social', name: 'Feature post', format: 'instagram-portrait', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'pilot-ig-bold': { category: 'social', name: 'Big news post', format: 'instagram-portrait', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'pilot-ig-contemporary': { category: 'social', name: 'Booking post', format: 'instagram-portrait', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'pilot-ig-industry': { category: 'social', name: 'Dish of the day post', format: 'instagram-portrait', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'pilot-ig-minimal': { category: 'social', name: 'Photo caption post', format: 'instagram-portrait', need: 'social', deliverable: 'instagram-post', subcategory: 'instagram-post' },
  'pilot-bb-bold': { category: 'flyers', name: 'Bold 48-sheet billboard', format: 'board-48-sheet', need: 'outdoor', deliverable: 'billboard-48-sheet', subcategory: 'billboard-48-sheet' },
  'pilot-bb-minimal': { category: 'flyers', name: 'One-line 48-sheet billboard', format: 'board-48-sheet', need: 'outdoor', deliverable: 'billboard-48-sheet', subcategory: 'billboard-48-sheet' },
  'pilot-bb-luxury': { category: 'flyers', name: 'Hotel or property 48-sheet billboard', format: 'board-48-sheet', need: 'outdoor', deliverable: 'billboard-48-sheet', subcategory: 'billboard-48-sheet' },
  'pilot-bb-contemporary': { category: 'flyers', name: 'Campaign 48-sheet billboard', format: 'board-48-sheet', need: 'outdoor', deliverable: 'billboard-48-sheet', subcategory: 'billboard-48-sheet' },
  'pilot-bb-industry': { category: 'flyers', name: 'Delivery service 48-sheet billboard', format: 'board-48-sheet', need: 'outdoor', deliverable: 'billboard-48-sheet', subcategory: 'billboard-48-sheet' },
  'pilot-bb-editorial': { category: 'flyers', name: 'Season or exhibition 48-sheet billboard', format: 'board-48-sheet', need: 'outdoor', deliverable: 'billboard-48-sheet', subcategory: 'billboard-48-sheet' },
};

/**
 * Classifications for UPLOADED templates, registered at runtime.
 *
 * ── WHY AN OVERLAY AND NOT A MUTATION ────────────────────────────────────
 *
 * `DELIVERABLES` is the one table seven functions in this file read, and it
 * is written by hand from each layout's own slots. An uploaded template is
 * not in it, so without this it would be invisible to every category count,
 * every category filter and every collection — it would appear in the
 * gallery's "Everything" shelf and nowhere else, which looks like a bug and
 * is one.
 *
 * Pushing uploaded rows into `DELIVERABLES` itself would work and would make
 * a hand-written table silently mutable from the network. This is the same
 * effect, named, clearable, and with the code half winning every lookup.
 */
const UPLOADED: Record<string, Deliverable> = {};

/** Replace the uploaded classifications. Called by the catalogue reader. */
export function registerUploadedDeliverables(map: Record<string, Deliverable>): void {
  for (const key of Object.keys(UPLOADED)) delete UPLOADED[key];
  for (const [key, value] of Object.entries(map)) {
    /* A code template's classification is never overridden from a row. */
    if (!(key in DELIVERABLES)) UPLOADED[key] = value;
  }
}

/**
 * Add ONE classification without disturbing the rest.
 *
 * Opening a template by link reads a single row and never goes through the
 * catalogue, so it has one classification to contribute and must not wipe
 * the others to do it.
 */
export function registerUploadedDeliverable(key: string, value: Deliverable): void {
  if (!(key in DELIVERABLES)) UPLOADED[key] = value;
}

/** For tests, and for a sign-out that should not leave a catalogue behind. */
export function clearUploadedDeliverables(): void {
  registerUploadedDeliverables({});
}

/** The one lookup. Code templates win; uploaded rows fill the rest. */
const classOf = (key: string): Deliverable | null =>
  DELIVERABLES[key] ?? UPLOADED[key] ?? null;

/** What a layout makes. Null when it has not been classified yet. */
export const deliverableFor = (template: Pick<DesignTemplate, 'key'>): Deliverable | null =>
  classOf(template.key);

/** The name to show on a card: the deliverable, falling back to the layout. */
/** The canvas a template should open on, when its deliverable names one. */
export const formatForTemplate = (template: Pick<DesignTemplate, 'key'>): string | null =>
  classOf(template.key)?.format ?? null;

export const cardTitle = (template: Pick<DesignTemplate, 'key' | 'label'>): string =>
  classOf(template.key)?.name ?? template.label;

/**
 * How many layouts each category really has.
 *
 * Counted from the library, never written down. A number typed into the copy
 * is a number that goes stale the first time somebody adds a layout.
 */
export function categoryCounts(from: DesignTemplate[] = DESIGN_TEMPLATES): Record<DeliverableCategory, number> {
  const counts = Object.fromEntries(
    DELIVERABLE_CATEGORIES.map((c) => [c.id, 0]),
  ) as Record<DeliverableCategory, number>;
  for (const template of from) {
    const d = classOf(template.key);
    if (d) counts[d.category] += 1;
  }
  return counts;
}

/** The layouts in a category, in catalogue order. */
export const templatesIn = (
  category: DeliverableCategory,
  from: DesignTemplate[] = DESIGN_TEMPLATES,
): DesignTemplate[] => from.filter((t) => classOf(t.key)?.category === category);

/** Layouts that are variants of the same thing, in catalogue order. */
export const variantsOf = (
  slug: string,
  from: DesignTemplate[] = DESIGN_TEMPLATES,
): DesignTemplate[] => from.filter((t) => classOf(t.key)?.slug === slug);

/**
 * The deliverables that have more than one layout behind them.
 *
 * Used to answer "show me business cards" with a collection rather than a
 * category. Counted, so the number is always what the library really holds.
 */
export function collections(from: DesignTemplate[] = DESIGN_TEMPLATES): { slug: string; name: string; count: number }[] {
  const seen = new Map<string, { slug: string; name: string; count: number }>();
  for (const template of from) {
    const d = classOf(template.key);
    if (!d?.slug) continue;
    const row = seen.get(d.slug);
    if (row) row.count += 1;
    else seen.set(d.slug, { slug: d.slug, name: COLLECTION_NAMES[d.slug] ?? d.name, count: 1 });
  }
  return [...seen.values()].filter((r) => r.count > 1);
}

/** What a collection is called, when its name is not just the first variant's. */
const COLLECTION_NAMES: Record<string, string> = {
  'business-card': 'Business cards',
};
