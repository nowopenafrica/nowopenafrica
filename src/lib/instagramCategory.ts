/**
 * The category a business gives itself, in its own words.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────
 *
 * MEASURED 2026-10-09: of the businesses on NowOpen holding an Instagram
 * handle, 108 sit in "Other" — the largest single bucket, and larger than
 * any real category. Wikidata imports arrive with a category; an Instagram
 * extraction never set one, because `CandidateRow` had no `category` field at
 * all. So every account filed from Instagram landed uncategorised and stayed
 * there, invisible to every category filter and every category page.
 *
 * "Other" is not a neutral absence. It is a classification, it is almost
 * always wrong, and it is the one that keeps a business out of the listing
 * its customers actually browse.
 *
 * ── WHAT THIS IS ALLOWED TO DO ───────────────────────────────────────────
 *
 * Match phrases the business WROTE ABOUT ITSELF against NowOpen's category
 * list. Nothing here reasons about a trade, reads an image, or completes a
 * thought. Grounded in the real bios on file, which say things like
 * "Cleaning Service Company", "a top-tier Nigerian law firm", "Towing,
 * Recovery, Mechanical and Body shop", "Premium Men's Wear" — businesses
 * describe themselves plainly, and that is all this reads.
 *
 * ── THE TWO RULES THAT KEEP IT HONEST ────────────────────────────────────
 *
 * 1. NO MATCH MEANS NO CATEGORY. It returns null and the caller leaves the
 *    field alone for a reviewer. A guessed category is worse than "Other",
 *    because "Other" is visibly unknown and a wrong category is not.
 *
 * 2. AMBIGUITY MEANS NO CATEGORY. A bio naming both a restaurant and a hotel
 *    scores both equally, and picking one arbitrarily would be inventing a
 *    fact about a real business. A tie returns null.
 */

import { BUSINESS_CATEGORIES } from '../data/categories';

/**
 * Phrases a business uses for itself, and the NowOpen category each implies.
 *
 * Multi-word wherever possible, because single words are where false matches
 * live: "tax" appears in "tax-free delivery", "property" in "intellectual
 * property". Every value must exist in BUSINESS_CATEGORIES — the test file
 * asserts it, so a renamed category fails the build rather than silently
 * filing businesses under a category that no longer exists.
 */
export const SELF_DESCRIPTION_CATEGORY: Record<string, string> = {
  // ── Trades and industry ────────────────────────────────────────────────
  'cleaning service': 'Cleaning Services',
  'cleaning company': 'Cleaning Services',
  janitorial: 'Cleaning Services',
  'deep cleaning': 'Cleaning Services',
  'post construction cleaning': 'Cleaning Services',
  fumigation: 'Fumigation & Pest Control',
  'pest control': 'Fumigation & Pest Control',
  'dry cleaning': 'Laundry & Dry Cleaning',
  'laundry service': 'Laundry & Dry Cleaning',
  'solar installation': 'Solar Installation',
  'solar energy': 'Solar Installation',
  'borehole drilling': 'Borehole Drilling & Water Works',
  'generator repair': 'Generator Sales & Repair',
  'interior decoration': 'Interior Decoration',
  'interior design': 'Interior Decoration',
  'construction company': 'Construction',
  'civil engineering': 'Construction',
  'architecture firm': 'Architecture & Design',

  // ── Automotive ─────────────────────────────────────────────────────────
  'panel beating': 'Auto Electrician & Panel Beating',
  towing: 'Towing & Recovery',
  'car wash': 'Car Wash & Detailing',
  'auto detailing': 'Car Wash & Detailing',
  'car rental': 'Car Rental',
  'car dealership': 'Car Dealership',
  'auto repair': 'Automotive',
  'body shop': 'Automotive',

  // ── Logistics ──────────────────────────────────────────────────────────
  'freight forwarding': 'Freight Forwarding',
  'last-mile delivery': 'Last-Mile Delivery',
  'last mile delivery': 'Last-Mile Delivery',
  'logistics services': 'Logistics & Transport',
  'logistics company': 'Logistics & Transport',
  'courier service': 'Courier & Dispatch',
  'dispatch rider': 'Courier & Dispatch',
  haulage: 'Moving & Haulage',

  // ── Professional ───────────────────────────────────────────────────────
  'law firm': 'Legal Services',
  'legal services': 'Legal Services',
  'legal practitioners': 'Legal Services',
  'recruitment solutions': 'Recruitment & HR',
  'recruitment agency': 'Recruitment & HR',
  'human capital': 'Recruitment & HR',
  'hr consulting': 'Recruitment & HR',
  'accounting firm': 'Accounting & Tax',
  'tax consultancy': 'Accounting & Tax',
  'business consulting': 'Consulting',
  'management consulting': 'Consulting',
  'real estate': 'Real Estate',
  'insurance company': 'Insurance',
  'public relations': 'Public Relations',

  // ── Technology and media ───────────────────────────────────────────────
  'digital marketing': 'Digital Marketing',
  'marketing agency': 'Digital Marketing',
  'social media agency': 'Digital Marketing',
  'web development': 'Web & App Development',
  'app development': 'Web & App Development',
  'software company': 'Software & IT',
  'it services': 'IT Support & Services',
  cybersecurity: 'Cybersecurity',
  fintech: 'Fintech & Payments',
  photography: 'Photography & Video',
  photographer: 'Photography & Video',
  videographer: 'Photography & Video',
  'film production': 'Film & Video Production',
  'printing press': 'Printing Press',
  signage: 'Printing & Signage',

  // ── Food ───────────────────────────────────────────────────────────────
  restaurant: 'Restaurant',
  eatery: 'Restaurant',
  'fast food': 'Fast Food',
  qsr: 'Fast Food',
  catering: 'Catering',
  bakery: 'Bakery & Pastry',
  pastries: 'Bakery & Pastry',
  'cake shop': 'Bakery & Pastry',
  suya: 'Suya & Grill',
  shawarma: 'Shawarma & Kebab',
  'small chops': 'Small Chops & Snacks',
  'meat distribution': 'Meat & Poultry Shop',
  'fresh meat': 'Meat & Poultry Shop',
  'cold room': 'Cold Room & Fish Depot',

  // ── Retail ─────────────────────────────────────────────────────────────
  'online store': 'Online Store / E-commerce',
  'e-commerce': 'Online Store / E-commerce',
  ecommerce: 'Online Store / E-commerce',
  'shopping destination': 'Online Store / E-commerce',
  supermarket: 'Supermarket',
  'mini-mart': 'Grocery / Mini-Mart',
  furniture: 'Furniture & Home',
  'phone accessories': 'Phone & Gadget Store',
  bookstore: 'Bookstore & Stationery',
  pharmacy: 'Pharmacy',

  // ── Fashion and beauty ─────────────────────────────────────────────────
  menswear: 'Fashion & Apparel',
  "men's wear": 'Fashion & Apparel',
  'ready to wear': 'Fashion & Apparel',
  'clothing brand': 'Fashion & Apparel',
  'fashion designer': 'Tailor & Fashion Designer',
  tailoring: 'Tailor & Fashion Designer',
  'fabric store': 'Fabric Store',
  footwear: 'Footwear & Bags',
  'shoe brand': 'Footwear & Bags',
  wigs: 'Wig & Hair Extensions',
  'hair extensions': 'Wig & Hair Extensions',
  'hair styling': 'Salon / Barber',
  'hair salon': 'Salon / Barber',
  barbing: 'Salon / Barber',
  'makeup artist': 'Makeup Artist',
  'nail studio': 'Nail Studio',
  'bridal services': 'Bridal & Wedding Services',
  'gele styling': 'Gele & Aso-Oke Styling',

  // ── Health ─────────────────────────────────────────────────────────────
  hospital: 'Hospital & Clinic',
  clinic: 'Hospital & Clinic',
  'dental care': 'Dental Care',
  'dental clinic': 'Dental Care',
  optician: 'Optician',
  physiotherapy: 'Physiotherapy & Rehab',
  'veterinary clinic': 'Veterinary Services',
  'medical laboratory': 'Medical Laboratory',
  'fitness centre': 'Fitness & Gym',
  'fitness center': 'Fitness & Gym',
  gym: 'Fitness & Gym',
  'spa and wellness': 'Spa & Beauty',

  // ── Education and community ────────────────────────────────────────────
  'secondary school': 'School & Education',
  'primary school': 'School & Education',
  'international school': 'International School',
  'driving school': 'Driving School',
  'music school': 'Music School',
  'tutoring centre': 'Training & Tutoring',
  'skills training': 'Vocational & Skills Training',
  'non-profit': 'Non-profit & NGO',
  ngo: 'Non-profit & NGO',

  // ── Events ─────────────────────────────────────────────────────────────
  'event planning': 'Event Planning',
  'event planner': 'Event Planning',
  'event rentals': 'Event Rentals & Equipment',
  'event venue': 'Event Venue & Hall',

  // ── Everyday ───────────────────────────────────────────────────────────
  'agent banking': 'POS & Agent Banking',
  'bureau de change': 'Bureau de Change',
  'gas refill': 'Gas Refill Station',
};

/** Escape a phrase for use inside a RegExp. */
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Words that turn the one before them into part of an address.
 *
 * MEASURED 2026-10-09, on a real listing. "Odanye Mary Adetoun" was filed
 * under Hospital & Clinic because its bio lists three Ibadan addresses and
 * one of them reads "No 4, new adeoyo hospital road off ringroad". The word
 * "hospital" was in a STREET NAME.
 *
 * This is the precise failure a keyword reader is prone to, and it does real
 * damage: a person's page filed as a hospital is wrong in a way that looks
 * entirely plausible in a list. A trade word immediately followed by one of
 * these is naming a place, not a business.
 */
const ADDRESS_WORD = /^(?:road|rd|street|st|avenue|ave|close|crescent|lane|drive|way|estate|junction|roundabout|bus\s*stop)\b/i;

export interface CategoryMatch {
  category: string;
  /** The phrases that produced it, so a reviewer can see the evidence. */
  matched: string[];
}

/**
 * The category implied by what a business wrote about itself, or null.
 *
 * null is returned for both "nothing matched" and "two categories matched
 * equally". Both mean the same thing to the caller: we do not know, and
 * saying so is the honest answer.
 */
export function categoryFromSelfDescription(...texts: Array<string | null | undefined>): CategoryMatch | null {
  /*
   * Curly apostrophes normalised to straight ones.
   *
   * MEASURED: the real bio reads "Premium Men’s Wear" with U+2019, and the
   * phrase table holds "men's wear" with U+0027. They are the same words and
   * matched nothing — a business filed as uncategorised over a typographic
   * character nobody can see.
   */
  const hay = texts.filter(Boolean).join(' \n ').toLowerCase().replace(/[‘’ʼ]/g, "'");
  if (!hay.trim()) return null;

  /** category -> the phrases that hit it */
  const hits = new Map<string, string[]>();

  for (const [phrase, category] of Object.entries(SELF_DESCRIPTION_CATEGORY)) {
    /*
     * Word boundaries on both ends, so "gym" does not match "gymnasium
     * equipment supplier" halfway through a longer word, and "ngo" does not
     * match "Ngozi". Hyphens and apostrophes inside a phrase are literal.
     */
    const re = new RegExp(`(?<![a-z0-9])${escape(phrase)}(?![a-z0-9])`, 'gi');
    for (const m of hay.matchAll(re)) {
      /*
       * Skip a match that is naming a street rather than a trade — see
       * ADDRESS_WORD. The text immediately after the match decides it.
       */
      const after = hay.slice(m.index + m[0].length).trimStart();
      if (ADDRESS_WORD.test(after)) continue;
      hits.set(category, [...(hits.get(category) ?? []), phrase]);
      break;  // one hit per phrase; repeats are not extra evidence
    }
  }

  if (hits.size === 0) return null;

  /*
   * Rank by how many distinct phrases pointed at the category. Nothing else.
   *
   * An earlier version broke ties on the length of the matched phrase, and
   * it was quietly arbitrary: "Towing, Recovery, Mechanical and Body shop"
   * resolved to Automotive, because "body shop" has two more characters than
   * "towing". Phrase length is not evidence about a business.
   */
  const ranked = [...hits.entries()]
    .map(([category, matched]) => ({ category, matched, score: matched.length }))
    .sort((a, b) => b.score - a.score);

  const [best, runnerUp] = ranked;
  /*
   * A tie is not a coin toss. "We are a cleaning, janitorial service and
   * fumigation services company" names two trades with equal weight, and so
   * does a bio offering a restaurant and a hair salon. Picking one would be
   * asserting something about a real company that it did not say.
   *
   * This is why the function may return null on a bio that plainly describes
   * a business: multi-trade accounts go to a reviewer, which is the correct
   * destination for a judgement rather than a reading.
   */
  if (runnerUp && runnerUp.score === best.score) return null;

  return { category: best.category, matched: best.matched.sort() };
}

/** Every category this module can emit actually exists. Used by the test. */
export function emittedCategories(): string[] {
  return [...new Set(Object.values(SELF_DESCRIPTION_CATEGORY))].sort();
}

/** True when `category` is one NowOpen actually offers. */
export function isRealCategory(category: string): boolean {
  return BUSINESS_CATEGORIES.includes(category);
}
