// Per-category display-label overrides for the generic Services/Products/
// Gallery/Enquiries tabs, so each vertical sees its own vocabulary — a Law
// Firm sees "Practice Areas" instead of "Services", a Restaurant sees "Menu"
// instead of "Products". This is display-only: the underlying tables and
// data are unchanged, only the label shown in the dashboard and on the
// public profile differs. Kept separate from categoryFeatures.ts because
// labels apply to categories that have no booking/order module at all
// (e.g. Legal Services, Real Estate, Art & Design).

import { BUSINESS_CATEGORIES } from './categories';

export interface TabLabelOverrides {
  services?: string;
  products?: string;
  gallery?: string;
  enquiries?: string;
  /** Past work. See PORTFOLIO_WORD below for how the default is chosen. */
  portfolio?: string;
}

export const CATEGORY_TAB_LABELS: Record<string, TabLabelOverrides> = {
  'Legal Services': { services: 'Practice Areas', enquiries: 'Consultation Requests' },
  // Stand-in for "Creative Agency" — no exact category exists; this is the closest fit.
  'Art & Design': { services: 'Packages', gallery: 'Portfolio', enquiries: 'Quote Requests' },
  'Real Estate': { products: 'Property Listings' },
  'Event Planning': { services: 'Packages' },
  'Automotive': { enquiries: 'Request a Quote' },
  'Salon / Barber': { services: 'Pricing' },

  'Restaurant': { products: 'Menu' },
  'Fast Food': { products: 'Menu' },
  'Café & Bakery': { products: 'Menu' },
  'Bar & Lounge': { products: 'Menu' },
  'Catering': { products: 'Menu' },

  'Retail Store': { products: 'Inventory' },
  'Supermarket': { products: 'Inventory' },
  'Grocery / Mini-Mart': { products: 'Inventory' },
  'Fashion & Apparel': { products: 'Inventory' },
  'Electronics': { products: 'Inventory' },
  'Jewelry & Accessories': { products: 'Inventory' },
  'Furniture & Home': { products: 'Inventory' },
  'Online Store / E-commerce': { products: 'Inventory' },

  // Menu vocabulary for takeaway / food-service categories
  'Local Food Vendor': { products: 'Menu' },
  'Food Truck': { products: 'Menu' },
  'Suya & Grill': { products: 'Menu' },
  'Shawarma & Kebab': { products: 'Menu' },
  'Bakery & Pastry': { products: 'Menu' },

  // Catalogue vocabulary for specialty retail
  'Frozen Food Store': { products: 'Inventory' },
  'Meat & Poultry Shop': { products: 'Inventory' },
  'Produce / Fruit & Veg Market': { products: 'Inventory' },
  'Boutique': { products: 'Inventory' },
  'Phone & Gadget Store': { products: 'Inventory' },
  'Bookstore & Stationery': { products: 'Inventory' },
  'Cosmetics & Beauty Supply': { products: 'Inventory' },
  'Gift & Souvenir Shop': { products: 'Inventory' },
  'Spare Parts Store': { products: 'Inventory' },

  // Tailors and home services speak their own language
  'Tailor & Fashion Designer': { products: 'Custom Orders', gallery: 'Portfolio' },
  'Laundry & Dry Cleaning': { products: 'Price List' },
  'Car Wash & Detailing': { services: 'Pricing' },
  'Car Rental': { products: 'Vehicles' },
  'Medical Laboratory': { services: 'Tests & Packages' },
};

export function getTabLabel(
  category: string | undefined | null,
  tab: keyof TabLabelOverrides,
  fallback: string
): string {
  if (!category) return fallback;
  return CATEGORY_TAB_LABELS[category]?.[tab] ?? fallback;
}

if (import.meta.env.DEV) {
  for (const key of Object.keys(CATEGORY_TAB_LABELS)) {
    if (!BUSINESS_CATEGORIES.includes(key)) {
      // eslint-disable-next-line no-console
      console.warn(`categoryTabLabels.ts: "${key}" is not a valid business category — check data/categories.ts stayed in sync.`);
    }
  }
}

/* ── PAST WORK: "Portfolio" or "Projects"? ────────────────────────────────
 *
 * Every profile gets a tab for work already done, and the word for it is not
 * the same in every trade. A photographer has a PORTFOLIO. A builder has
 * PROJECTS. Calling a builder's finished estate a portfolio sounds like an
 * investment product, and calling a makeup artist's work a project sounds
 * like paperwork.
 *
 * So the two words are chosen by what the work IS, not by taste:
 *
 *   Portfolio — the work is the artefact, and the pictures are the point.
 *               Design, photography, tailoring, hair, makeup, art.
 *   Projects  — the work is a job with a start, an end and a site or client.
 *               Building, engineering, software, events, consulting.
 *
 * Everything else gets "Projects", which is the more universal of the two:
 * a caterer's wedding and a logistics firm's contract are both projects,
 * while neither is a portfolio.
 */
const PORTFOLIO_CATEGORIES = new Set<string>([
  'Art & Design',
  'Art Gallery',
  'Architecture & Design',
  'Interior Decoration',
  'Photography & Video',
  'Film & Video Production',
  'Animation & Motion Graphics',
  'Printing & Signage',
  'Tailor & Fashion Designer',
  'Makeup Artist',
  'Salon / Barber',
  'Bridal & Wedding Services',
  'Furniture Maker / Carpentry',
  'Media & Publishing',
]);

/**
 * The word this business uses for its past work.
 *
 * Kept separate from CATEGORY_TAB_LABELS because it is a RULE over a set,
 * not a per-category override — listing fourteen categories as
 * `{ portfolio: 'Portfolio' }` would say the same thing fourteen times and
 * drift the fifteenth time somebody added one.
 *
 * An explicit override in CATEGORY_TAB_LABELS still wins, so a single
 * category can say something else entirely without touching this.
 */
export function portfolioLabel(category: string | undefined | null): string {
  const override = category ? CATEGORY_TAB_LABELS[category]?.portfolio : undefined;
  if (override) return override;
  return category && PORTFOLIO_CATEGORIES.has(category) ? 'Portfolio' : 'Projects';
}
