import type { LucideIcon } from 'lucide-react';

import { INDUSTRIES } from '../data/industrySystems';
import { CATEGORY_FEATURES, type CategoryFeatureConfig } from '../data/categoryFeatures';

/**
 * What an industry's page looks like — without inventing a business.
 *
 * ── THE PROBLEM ───────────────────────────────────────────────────────────
 *
 * The directory holds two businesses. Both are real and both are claimed, and
 * a grid of two makes a purpose-built platform look like a dead one. A visitor
 * deciding whether to send us their restaurant cannot see what a restaurant
 * page would even be.
 *
 * ── THE THREE WAYS TO FILL IT, AND WHY ONLY ONE IS ALLOWED ────────────────
 *
 * 1. INVENT BUSINESSES. Names, addresses, phone numbers. This is what was
 *    already built once and then deleted — thirty seeded profiles that a
 *    customer could tap, ring and find nothing behind. Prohibited, permanently.
 *
 * 2. SHOW REAL UNCLAIMED LISTINGS. Honest, and the right answer eventually:
 *    imported authorised data, badged "Unclaimed", claimable by the owner. But
 *    there is none. The synthetic seeds that used to stand in for it were
 *    removed precisely because they were not real.
 *
 * 3. SHOW THE PAGE, NOT A BUSINESS. That is this file.
 *
 * ── WHY THIS IS NOT FABRICATION ───────────────────────────────────────────
 *
 * An example here is named after the INDUSTRY — "Restaurants", "Real Estate" —
 * never after a business. There is no "Mama's Kitchen, Lekki" to be mistaken
 * for a place you could ring, because no business is described at all. What is
 * described is the software: the modules a restaurant profile actually runs and
 * the features it actually carries.
 *
 * And none of it is written here. Every module comes from CATEGORY_FEATURES —
 * the same config that drives live profiles — and every feature comes from the
 * industry's own entry in INDUSTRIES, which /platform already publishes. If a
 * module is not shipped, it cannot appear in an example. That is the whole
 * guarantee: an example cannot promise anything the product does not do,
 * because it is generated from what the product does.
 *
 * ── THE RULES THAT MUST HOLD WHEREVER THESE ARE RENDERED ──────────────────
 *
 * - Never counted. "2 businesses are listed" must stay 2.
 * - Never mixed into the same grid as real listings. A separate, labelled
 *   block, because interleaving is exactly how "example" becomes "listing" in
 *   a reader's head.
 * - Never routable as a profile. No /:username, no claim button, no contact.
 * - No phone, no address, no email, no rating, no review, no opening hours.
 */

export interface IndustryExample {
  slug: string;
  /** The INDUSTRY name. Never a business name — that is the point. */
  name: string;
  icon: LucideIcon;
  accent: string;
  tagline: string;
  /**
   * The category the modules were read from.
   *
   * Surfaced rather than hidden: "Restaurants" powers eleven categories, and
   * the modules shown are the ones this specific category runs. Saying which
   * keeps the example from implying every category in the industry is identical.
   */
  category: string | null;
  /** Live modules, straight from CATEGORY_FEATURES. */
  modules: CategoryFeatureConfig[];
  /** Features from the industry's own /platform entry, capped for a card. */
  highlights: string[];
  /** A live demo profile for this industry, if one exists. */
  demo: string | null;
}

/** How many feature lines a card can show before it stops being scannable. */
const HIGHLIGHT_CAP = 6;

/**
 * The first of an industry's categories that actually runs modules.
 *
 * Deliberately not "the first category": Real Estate lists 'Real Estate' and
 * 'Surveying & Valuation', and only one of them has a booking module wired. An
 * example showing no modules for an industry that has them would understate
 * the product; one showing modules the category does not run would overstate
 * it. So the search is for the first category with a real entry.
 */
function representativeCategory(categories: string[]): string | null {
  return categories.find((c) => (CATEGORY_FEATURES[c]?.length ?? 0) > 0) ?? null;
}

/* ── the live demo profile, where one exists ───────────────────────────────── */

/**
 * Industry -> an existing curated demo profile.
 *
 * ── WHY THIS BEATS THE WIREFRAME ──────────────────────────────────────────
 *
 * The wireframe shows the SHAPE of a page. What somebody actually asked to see
 * is the page: the real profile renderer, running the real industry modules,
 * with a real menu or a real room list in it. That already exists — /platform's
 * "See live examples" section has been linking to these for months, and
 * BusinessDetail renders them from in-memory records with no database row. So
 * the honest answer is not to build a third preview, it is to point at the one
 * the platform page already trusts.
 *
 * ── A STATIC MAP, NOT A LOOKUP ────────────────────────────────────────────
 *
 * Matching an industry to a card at runtime would mean importing osShowcase,
 * which imports thirty-three sample-data files. This module is loaded by the
 * HOMEPAGE, so that would drag every demo record into the first bundle a
 * visitor downloads. The pairing is therefore written down, and a test imports
 * the heavy module to prove every entry still resolves and still belongs to
 * that industry. Cheap at runtime, verified at build.
 *
 * ── WHAT IS DELIBERATELY ABSENT ───────────────────────────────────────────
 *
 * Six industries have no demo profile, and they get no invented one. They keep
 * the wireframe, which is honest about being a wireframe.
 */
export const DEMO_PROFILES: Record<string, string> = {
  'real-estate': 'lagos-prime-realty', // Real Estate
  'restaurants': 'lagos-flavors-kitchen', // Restaurant
  'hotels': 'grand-savanna-hotel', // Hotel & Lodging
  'car-dealers': 'ace-auto-motors', // Car Dealership
  'hospitals': 'lifeline-medical-centre', // Hospital & Clinic
  'pharmacy': 'wellcare-pharmacy', // Pharmacy
  'beauty-salon': 'zenith-wellness-spa', // Spa & Beauty
  'barbers': 'glow-beauty-lounge', // Salon / Barber
  'fashion': 'zuri-couture', // Fashion & Apparel
  'retail': 'prime-cuts-butchery', // Grocery / Mini-Mart
  'creative-agencies': 'apex-digital-agency', // Digital Marketing
  'designers': 'pixelforge-design-studio', // Art & Design
  'photographers': 'lens-luxe-studios', // Photography & Video
  'videographers': 'lens-luxe-studios', // Photography & Video
  'musicians': 'afrobeat-live-entertainment', // Music & Nightlife
  'event-vendors': 'grand-celebration-events', // Event Planning
  'transport': 'swift-movers-transit', // Logistics & Transport
  'travel-agencies': 'wanderlust-travels', // Travel & Tourism
  'schools': 'bright-minds-academy', // School & Education
  'lawyers': 'apex-legal-partners', // Legal Services
  'construction': 'buildwell-construction', // Construction
  'agriculture': 'green-harvest-farms', // Agriculture
  'manufacturing': 'nova-foods-manufacturing', // Manufacturing
  'fitness': 'pulse-fitness-club', // Fitness & Gym
  'finance': 'zenith-microfinance', // Financial Services
  'government': 'grace-community', // Religious Organization
  'service-providers': 'sparkle-home-services', // Cleaning Services
  'repairs': 'gadgetmedic-repairs', // Gadget & Device Repair
  'food-vendors': 'golden-crust-bakery', // Bakery & Pastry
  'software-it': 'stackforge-technologies', // Software & IT
  'event-entertainment': 'afrobeat-live-entertainment', // Music & Nightlife
  'veterinary': 'pawvet-clinic', // Veterinary Services
  'spa-wellness': 'zenith-wellness-spa', // Spa & Beauty
  'religious-organizations': 'grace-community', // Religious Organization
  'bakeries': 'golden-crust-bakery', // Bakery & Pastry
  'bars-lounges': 'tipsy-terrace', // Bar & Lounge
};

/** The live demo profile for an industry, if it has one. */
export const demoUsernameFor = (slug: string): string | null =>
  DEMO_PROFILES[slug] ?? null;

/**
 * Where the live demo lives.
 *
 * /business/<username> — the real profile route, because it IS a real rendered
 * profile. That is the one case where the business namespace is right: nothing
 * is being invented here that /platform has not been showing all along.
 */
export const demoPath = (slug: string): string | null => {
  const username = demoUsernameFor(slug);
  return username ? `/business/${username}` : null;
};

export const INDUSTRY_EXAMPLES: IndustryExample[] = INDUSTRIES.map((industry) => {
  const category = representativeCategory(industry.categories);
  return {
    slug: industry.slug,
    name: industry.name,
    icon: industry.icon,
    accent: industry.accent,
    tagline: industry.tagline,
    category,
    modules: category ? CATEGORY_FEATURES[category] : [],
    // Flattened in the order the industry declares its groups: 'Core' first,
    // which is where the features a visitor recognises actually live.
    highlights: industry.groups.flatMap((g) => g.features).slice(0, HIGHLIGHT_CAP),
    demo: DEMO_PROFILES[industry.slug] ?? null,
  };
});

const BY_SLUG = new Map(INDUSTRY_EXAMPLES.map((e) => [e.slug, e]));

export const exampleBySlug = (slug: string): IndustryExample | undefined => BY_SLUG.get(slug);

/**
 * Examples that can show a live module, first.
 *
 * An example whose industry has no wired module is still worth showing — the
 * feature list is real and the page exists — but it is a weaker demonstration,
 * so it should not be what somebody sees first.
 */
export const orderedExamples = (): IndustryExample[] =>
  [...INDUSTRY_EXAMPLES].sort((a, b) => (b.modules.length ? 1 : 0) - (a.modules.length ? 1 : 0));

/**
 * What the example is allowed to say about content.
 *
 * Placeholders, and obviously so. "Your menu" cannot be mistaken for a menu;
 * "Suya ₦2,500" can.
 */
export const EXAMPLE_PLACEHOLDERS: Record<string, string> = {
  service: 'Your services',
  product: 'Your products',
  none: 'Your details',
};

export const placeholderFor = (module: CategoryFeatureConfig): string =>
  EXAMPLE_PLACEHOLDERS[module.itemSource] ?? EXAMPLE_PLACEHOLDERS.none;

/** Never counted as inventory. Stated as a function so nothing can forget. */
export const countsAsListing = (): false => false;

/**
 * The linkable page for an industry example.
 *
 * A real URL, deliberately — "see live preview" used to open a panel that
 * closed, and what was wanted was a page you can send somebody. `/example/` is
 * in the path rather than looking like a profile URL: a reference page has to
 * be unmistakable in the address bar too, not only once you are reading it.
 *
 * It is NOT /business/<something>. That namespace belongs to real businesses,
 * and putting an example in it would make an invented company one URL away
 * from looking real — which is the whole failure this module exists to avoid.
 */
export const examplePath = (slug: string): string => `/example/${slug}`;
