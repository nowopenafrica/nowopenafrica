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
