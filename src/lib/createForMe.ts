import { BUSINESS_CATEGORY_GROUPS } from '../data/categories';

/**
 * "Create for my business" — what this business should make next.
 *
 * Studio has 24 tools and 62 panels. An owner who opens it is not short of
 * capability; they are short of a first move. This decides the first move.
 *
 * TWO INPUTS, IN THIS ORDER:
 *
 *   1. What the profile is MISSING. A restaurant with no logo does not need a
 *      reel — every asset it makes will carry the gap. Fixing the foundation
 *      outranks anything decorative.
 *   2. What its TRADE actually sells. A laundry needs a price list; a tailor
 *      needs a catalogue; a mechanic needs a service menu. Offering all three
 *      to all three is what makes a creative tool feel like a blank canvas
 *      with a logo on it.
 *
 * The point of (2) is that NowOpen already knows the business — name, category,
 * colours, logo, location, WhatsApp, hours, products. Every recommendation
 * names what it will use, because "use my brand automatically" is only a
 * promise worth making if it can be shown.
 *
 * PURE AND DETERMINISTIC. No model, no network, no randomness — the same
 * business always gets the same advice, which is what makes it testable and
 * what stops it drifting into horoscope.
 */

/** What Studio tab a recommendation opens. Must exist in src/pages/Studio.tsx. */
export type StudioTab =
  | 'brand-kit' | 'design' | 'video' | 'card' | 'catalogues'
  | 'live-promo' | 'social' | 'landing' | 'quotations' | 'media';

export interface CreateSuggestion {
  key: string;
  label: string;
  /** Why this business, now. Never generic encouragement. */
  why: string;
  tab: StudioTab;
  /** Profile fields this will pull in automatically. */
  uses: string[];
  /** Foundation work outranks everything, then trade, then growth. */
  priority: 'foundation' | 'trade' | 'growth';
}

/** The subset of a business this needs. Mapped by the caller from a row. */
export interface CreateProfile {
  name?: string | null;
  category?: string | null;
  logo_url?: string | null;
  image_url?: string | null;
  description?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  location?: string | null;
  opening_hours?: string | null;
  hours?: string | null;
  /** Counts the caller supplies; zero is meaningful, undefined is unknown. */
  products?: number;
  offers?: number;
}

const has = (v: unknown): boolean =>
  typeof v === 'string' ? v.trim().length > 0 : typeof v === 'number' ? v > 0 : !!v;

/** Which of the twelve real groups a category belongs to. */
export function groupFor(category: string | null | undefined): string | null {
  if (!category) return null;
  const needle = category.trim().toLowerCase();
  for (const g of BUSINESS_CATEGORY_GROUPS) {
    if (g.items.some((i) => i.toLowerCase() === needle)) return g.group;
  }
  return null;
}

/**
 * What each trade should make, in its own words.
 *
 * Keyed on the twelve BUSINESS_CATEGORY_GROUPS rather than on 100+ individual
 * categories: twelve lists can be kept true, and a hundred would quietly rot.
 * A category with no group falls through to the universal set, which is a
 * weaker answer but never a wrong one.
 */
const BY_GROUP: Record<string, CreateSuggestion[]> = {
  'Food & Hospitality': [
    { key: 'menu', label: 'Digital menu', why: 'Customers decide on the menu before they decide on you.', tab: 'catalogues', uses: ['products', 'prices', 'logo', 'brand colours'], priority: 'trade' },
    { key: 'todays-offer', label: "Today's offer", why: 'A dish and a price, posted before the lunch rush.', tab: 'live-promo', uses: ['logo', 'brand colours', 'WhatsApp'], priority: 'trade' },
    { key: 'food-reel', label: 'Food reel', why: 'Food sells on motion. A still photograph of a plate does half the work.', tab: 'video', uses: ['photos', 'logo', 'business name'], priority: 'growth' },
  ],
  'Fashion & Beauty': [
    { key: 'lookbook', label: 'Collection catalogue', why: 'A collection people can scroll is worth more than a folder of photos.', tab: 'catalogues', uses: ['photos', 'products', 'prices'], priority: 'trade' },
    { key: 'price-list', label: 'Price list', why: 'The question you answer most often, answered once.', tab: 'design', uses: ['services', 'prices', 'brand colours'], priority: 'trade' },
    { key: 'new-arrival', label: 'New arrival post', why: 'New stock is the reason a past customer comes back.', tab: 'design', uses: ['photos', 'logo', 'WhatsApp'], priority: 'growth' },
  ],
  'Home & Personal Services': [
    { key: 'service-menu', label: 'Service list with prices', why: 'Most enquiries are really a question about price.', tab: 'catalogues', uses: ['services', 'prices', 'logo'], priority: 'trade' },
    { key: 'pickup-flyer', label: 'Pickup & delivery flyer', why: 'The thing that wins the job is convenience, so say it on paper.', tab: 'design', uses: ['location', 'phone', 'WhatsApp', 'hours'], priority: 'trade' },
    { key: 'loyalty', label: 'Loyalty card', why: 'This trade lives on repeat custom more than on new custom.', tab: 'design', uses: ['logo', 'brand colours'], priority: 'growth' },
  ],
  'Trades & Industry': [
    { key: 'service-menu', label: 'Service menu', why: 'Customers cannot tell your work apart from anyone else’s until you list it.', tab: 'catalogues', uses: ['services', 'prices'], priority: 'trade' },
    { key: 'workshop-banner', label: 'Workshop banner', why: 'Passing trade is real trade when the sign is readable from the road.', tab: 'design', uses: ['business name', 'logo', 'phone'], priority: 'trade' },
    { key: 'reminder', label: 'Service reminder', why: 'The cheapest job you will win this month is one you already did last year.', tab: 'social', uses: ['customers', 'WhatsApp'], priority: 'growth' },
  ],
  'Health & Wellness': [
    { key: 'service-menu', label: 'Treatment list', why: 'People compare treatments and hours before they call.', tab: 'catalogues', uses: ['services', 'prices', 'hours'], priority: 'trade' },
    { key: 'hours-card', label: 'Opening hours card', why: 'For this trade, "are you open now" is most of the enquiry.', tab: 'design', uses: ['hours', 'location', 'phone'], priority: 'trade' },
  ],
  'Professional Services': [
    { key: 'quote', label: 'Quote template', why: 'A proposal that looks the part closes work a message never will.', tab: 'quotations', uses: ['logo', 'brand colours', 'business name'], priority: 'trade' },
    { key: 'profile-onepager', label: 'Company one-pager', why: 'Clients ask for something to forward internally. Give them it.', tab: 'landing', uses: ['description', 'services', 'logo'], priority: 'trade' },
  ],
  'Retail & Commerce': [
    { key: 'catalogue', label: 'Product catalogue', why: 'A shareable catalogue is a shop that stays open on WhatsApp.', tab: 'catalogues', uses: ['products', 'prices', 'photos'], priority: 'trade' },
    { key: 'promo', label: 'Promotion', why: 'Retail moves on a reason to buy this week rather than next.', tab: 'live-promo', uses: ['products', 'logo'], priority: 'growth' },
  ],
  'Logistics & Mobility': [
    { key: 'rate-card', label: 'Rate card', why: 'Routes and rates are the whole conversation.', tab: 'design', uses: ['services', 'prices', 'location'], priority: 'trade' },
    { key: 'booking-card', label: 'Booking card', why: 'One card with your number that a customer keeps in the vehicle.', tab: 'card', uses: ['phone', 'WhatsApp', 'logo'], priority: 'trade' },
  ],
  'Education & Community': [
    { key: 'programme', label: 'Programme or timetable', why: 'Parents and members plan around dates, so publish them.', tab: 'catalogues', uses: ['services', 'hours'], priority: 'trade' },
    { key: 'enrolment', label: 'Enrolment flyer', why: 'Intake has a season, and the flyer has to exist before it starts.', tab: 'design', uses: ['logo', 'location', 'phone'], priority: 'trade' },
  ],
  'Arts & Entertainment': [
    { key: 'event-promo', label: 'Event promo', why: 'An event with no poster is a private event.', tab: 'design', uses: ['photos', 'logo', 'location'], priority: 'trade' },
    { key: 'showreel', label: 'Showreel', why: 'This trade is judged on the work, so lead with the work.', tab: 'video', uses: ['photos', 'business name'], priority: 'growth' },
  ],
  'Technology & Media': [
    { key: 'profile-onepager', label: 'Service one-pager', why: 'Buyers forward a link, not a chat thread.', tab: 'landing', uses: ['description', 'services', 'logo'], priority: 'trade' },
    { key: 'case-post', label: 'Work showcase', why: 'Proof of past work is the only portfolio that converts.', tab: 'design', uses: ['photos', 'brand colours'], priority: 'growth' },
  ],
  'Local & Everyday Business': [
    { key: 'price-list', label: 'Price list', why: 'The question customers ask before they walk in.', tab: 'design', uses: ['products', 'prices'], priority: 'trade' },
    { key: 'hours-card', label: 'Opening hours card', why: 'Everyday trade turns on whether you are open right now.', tab: 'design', uses: ['hours', 'location'], priority: 'trade' },
  ],
};

/** Worth making whatever the trade. Only ever offered after the gaps are named. */
const UNIVERSAL: CreateSuggestion[] = [
  { key: 'digital-card', label: 'Digital business card', why: 'One link with a live QR that always points at your profile.', tab: 'card', uses: ['logo', 'phone', 'WhatsApp', 'business name'], priority: 'growth' },
  { key: 'whatsapp-status', label: 'WhatsApp status graphic', why: 'The channel your customers actually open.', tab: 'design', uses: ['logo', 'brand colours'], priority: 'growth' },
];

/**
 * The gaps worth fixing before making anything decorative.
 *
 * Ordered deliberately: a logo affects every asset, a description affects
 * whether anybody finds the business at all, and a way to be reached is what
 * turns all of it into a customer.
 */
function foundations(p: CreateProfile): CreateSuggestion[] {
  const out: CreateSuggestion[] = [];
  if (!has(p.logo_url)) {
    out.push({
      key: 'logo', label: 'Logo and brand kit', tab: 'brand-kit',
      why: 'You have no logo yet, and every flyer, card and reel you make will carry that gap.',
      uses: ['business name', 'category'], priority: 'foundation',
    });
  }
  if (!has(p.image_url)) {
    out.push({
      key: 'cover', label: 'Cover photo', tab: 'media',
      why: 'A profile with no picture is skipped, however good the information is.',
      uses: ['photos'], priority: 'foundation',
    });
  }
  if (!has(p.description)) {
    out.push({
      key: 'description', label: 'Business description', tab: 'brand-kit',
      why: 'Without a description nobody can find you by what you actually do.',
      uses: ['business name', 'category', 'location'], priority: 'foundation',
    });
  }
  if (!has(p.whatsapp) && !has(p.phone)) {
    out.push({
      key: 'contact', label: 'Add a way to be reached', tab: 'brand-kit',
      why: 'Everything else on this list produces enquiries you would have no way to answer.',
      uses: ['phone', 'WhatsApp'], priority: 'foundation',
    });
  }
  if (!has(p.opening_hours) && !has(p.hours)) {
    out.push({
      key: 'hours', label: 'Set your opening hours', tab: 'brand-kit',
      why: 'No hours means you never appear under Open Now — the thing the name promises.',
      uses: ['hours'], priority: 'foundation',
    });
  }
  return out;
}

/**
 * What this business should create next, best first.
 *
 * Foundations, then the trade's own staples, then growth. Capped, because a
 * list of twenty is the same problem as a Studio of sixty-two.
 */
export function createForMe(p: CreateProfile, limit = 6): CreateSuggestion[] {
  const group = groupFor(p.category);
  const trade = group ? BY_GROUP[group] ?? [] : [];

  // A catalogue suggestion is noise for a business that already has one.
  const usable = trade.filter((s) => !(s.tab === 'catalogues' && has(p.products)));

  const seen = new Set<string>();
  const out: CreateSuggestion[] = [];
  for (const s of [...foundations(p), ...usable, ...UNIVERSAL]) {
    if (seen.has(s.key)) continue;
    seen.add(s.key);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * One line for the top of the panel.
 *
 * Says what NowOpen already knows, because that is the entire proposition: the
 * owner should not be filling in a blank canvas with details the platform has.
 */
export function knownFacts(p: CreateProfile): string[] {
  const facts: string[] = [];
  if (has(p.name)) facts.push('your business name');
  if (has(p.logo_url)) facts.push('your logo');
  if (has(p.category)) facts.push('your category');
  if (has(p.location)) facts.push('your location');
  if (has(p.whatsapp) || has(p.phone)) facts.push('your contact');
  if (has(p.products)) facts.push('your products');
  return facts;
}
