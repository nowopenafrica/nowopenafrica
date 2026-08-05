// Maps a business category to the customer-facing "request" module(s) it
// gets on top of the generic Services/Products/Gallery/Reviews/Enquiries
// tabs — e.g. Hotel & Lodging gets room bookings, Restaurant gets BOTH table
// reservations and food ordering, Retail Store gets a cart. All modules run
// on the same underlying engine (the business_bookings table + BookingModal
// / CartModal); this config only controls labels, which fields are shown,
// and — via `key` — which module a booking/order belongs to. A category can
// have more than one module at once. Adding a new category's module(s) is a
// config-only change — no migration or new component needed.

import { BUSINESS_CATEGORIES } from './categories';

export interface CategoryFeatureConfig {
  /** Stable per-module identifier, stored as business_bookings.module_key — lets a category run more than one module without them cross-contaminating */
  key: string;
  /** Dashboard tab label, e.g. "Bookings" / "Reservations" / "Orders" */
  tabLabel: string;
  /** Public-facing CTA text, e.g. "Book a Room" */
  ctaLabel: string;
  /** What the customer is picking from, if anything */
  itemSource: 'service' | 'product' | 'none';
  /** Label for the item picker, e.g. "Room" / "Package" / "Product" */
  itemLabel?: string;
  showDate: boolean;
  /** Only true for date-range categories (e.g. Hotel & Lodging check-in/out) */
  showDateRange?: boolean;
  showTime: boolean;
  showQuantity: boolean;
  /** Label for the quantity field, e.g. "Guests" / "Party size" */
  quantityLabel?: string;
  /** True only for cart()-style modules — multi-item checkout via CartModal, not a single-pick BookingModal request (even when itemSource is 'product', e.g. a Real Estate "Book a Viewing" module is itemSource:'product' but NOT a cart) */
  cart?: boolean;
}

const booking = (overrides: Partial<CategoryFeatureConfig> & Pick<CategoryFeatureConfig, 'key' | 'ctaLabel'>): CategoryFeatureConfig => ({
  tabLabel: 'Bookings',
  itemSource: 'service',
  itemLabel: 'Service',
  showDate: true,
  showTime: true,
  showQuantity: false,
  ...overrides,
});

const reservation = (key = 'reservations'): CategoryFeatureConfig => ({
  key,
  tabLabel: 'Reservations',
  ctaLabel: 'Reserve a Table',
  itemSource: 'none',
  showDate: true,
  showTime: true,
  showQuantity: true,
  quantityLabel: 'Party size',
});

// Cart-style module: multiple products + quantities in one submission (see
// CartModal.tsx). Per-line quantity lives in business_bookings.items, so
// showQuantity stays false here — there's no single top-level quantity.
const cart = (key = 'orders'): CategoryFeatureConfig => ({
  key,
  tabLabel: 'Orders',
  ctaLabel: 'Add to Cart',
  itemSource: 'product',
  itemLabel: 'Product',
  showDate: false,
  showTime: false,
  showQuantity: false,
  cart: true,
});

export const CATEGORY_FEATURES: Record<string, CategoryFeatureConfig[]> = {
  // Booking / appointment style
  'Hotel & Lodging': [booking({
    key: 'rooms', ctaLabel: 'Book a Room', itemLabel: 'Room', showTime: false, showDateRange: true,
    showQuantity: true, quantityLabel: 'Guests',
  })],
  'Guesthouse & Short-let / B&B': [booking({
    key: 'rooms', ctaLabel: 'Book a Stay', itemLabel: 'Room', showTime: false, showDateRange: true,
    showQuantity: true, quantityLabel: 'Guests',
  })],
  'Photography & Video': [booking({ key: 'sessions', ctaLabel: 'Book a Session', itemLabel: 'Package' })],
  'Event Planning': [booking({ key: 'events', ctaLabel: 'Book Now', itemLabel: 'Package', showQuantity: true, quantityLabel: 'Guests' })],
  'Travel & Tourism': [booking({ key: 'trips', ctaLabel: 'Book a Trip', itemLabel: 'Package', showQuantity: true, quantityLabel: 'Travelers' })],
  'Music & Nightlife': [booking({ key: 'performances', tabLabel: 'Bookings', ctaLabel: 'Book a Performance', itemLabel: 'Act' })],
  'Art & Design': [booking({ key: 'projects', tabLabel: 'Services', ctaLabel: 'Start a Project', itemLabel: 'Service', showTime: false })],
  'Spa & Beauty': [booking({ key: 'appointments', ctaLabel: 'Book an Appointment' })],
  'Wellness & Therapy': [booking({ key: 'appointments', ctaLabel: 'Book a Session' })],
  'Fitness & Gym': [booking({ key: 'classes', ctaLabel: 'Book a Class' })],
  'Hospital & Clinic': [booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book an Appointment' })],
  'Dental Care': [booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book an Appointment' })],
  'Veterinary Services': [booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book an Appointment' })],
  'Automotive': [booking({ key: 'service', ctaLabel: 'Book a Service' })],
  'Cleaning Services': [booking({ key: 'service', ctaLabel: 'Book a Service' })],
  'Training & Tutoring': [booking({ key: 'classes', ctaLabel: 'Book a Class' })],
  'School & Education': [booking({ key: 'admissions', tabLabel: 'Admissions', ctaLabel: 'Apply Now', itemLabel: 'Programme' })],
  'Logistics & Transport': [booking({
    key: 'trips', tabLabel: 'Trips', ctaLabel: 'Book a Seat', itemLabel: 'Route',
    showQuantity: true, quantityLabel: 'Seats',
  })],
  'Childcare': [booking({ key: 'care', ctaLabel: 'Book Care' })],
  'Salon / Barber': [booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book an Appointment' })],
  'Legal Services': [booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Consultation', itemLabel: 'Practice Area' })],
  'Financial Services': [booking({ key: 'applications', tabLabel: 'Products', ctaLabel: 'Apply', itemLabel: 'Product', showTime: false })],
  'Insurance': [booking({ key: 'quotes', tabLabel: 'Products', ctaLabel: 'Get a Quote', itemLabel: 'Policy', showTime: false })],
  'Accounting & Tax': [booking({ key: 'consultations', tabLabel: 'Services', ctaLabel: 'Book a Consultation', itemLabel: 'Service' })],
  'Digital Marketing': [booking({ key: 'projects', tabLabel: 'Services', ctaLabel: 'Start a Campaign', itemLabel: 'Service', showTime: false })],
  'Money Transfer / Mobile Money Agent': [booking({ key: 'requests', tabLabel: 'Services', ctaLabel: 'Get Started', itemLabel: 'Service', showTime: false })],
  'Software & IT': [booking({ key: 'projects', tabLabel: 'Services', ctaLabel: 'Start a Project', itemLabel: 'Service', showTime: false })],
  'Gadget & Device Repair': [booking({ key: 'repairs', tabLabel: 'Repairs', ctaLabel: 'Book a Repair', itemLabel: 'Repair', showTime: false })],
  'Construction': [booking({ key: 'projects', tabLabel: 'Services', ctaLabel: 'Request a Quote', itemLabel: 'Service', showTime: false })],
  // Property tours/inspections — a single-pick booking against a listing
  // (business_products), NOT a cart: cart defaults to falsy here.
  'Real Estate': [booking({
    key: 'viewings', tabLabel: 'Viewings', ctaLabel: 'Book a Viewing',
    itemSource: 'product', itemLabel: 'Property',
  })],
  // Car dealership inventory — test drive booked against a single vehicle
  // (business_products), like Real Estate viewings (not a cart).
  'Car Dealership': [booking({
    key: 'test-drive', tabLabel: 'Test Drives', ctaLabel: 'Book a Test Drive',
    itemSource: 'product', itemLabel: 'Vehicle', showTime: true,
  })],

  // Reservation + cart (dine-in food categories get both — a table AND food ordering)
  'Restaurant': [reservation(), cart()],
  'Fast Food': [reservation(), cart()],
  'Café & Bakery': [reservation(), cart()],
  'Bar & Lounge': [reservation(), cart()],
  // Off-premises catering — no table to reserve, just the order
  'Catering': [cart()],

  // Cart-only (shop-and-buy-multiple-things categories)
  'Pharmacy': [cart()],
  'Agriculture': [cart()],
  'Manufacturing': [cart()],
  'Retail Store': [cart()],
  'Supermarket': [cart()],
  'Grocery / Mini-Mart': [cart()],
  'Fashion & Apparel': [cart()],
  'Electronics': [cart()],
  'Jewelry & Accessories': [cart()],
  'Furniture & Home': [cart()],
  'Online Store / E-commerce': [cart()],

  // ---------------------------------------------------------------------------
  // Food & Hospitality — everyday food vendors and specialists
  // ---------------------------------------------------------------------------
  'Local Food Vendor': [cart()],
  'Food Truck': [cart()],
  'Suya & Grill': [reservation(), cart()],
  'Shawarma & Kebab': [reservation(), cart()],
  'Bakery & Pastry': [cart()],
  'Frozen Food Store': [cart()],
  'Meat & Poultry Shop': [cart()],
  'Produce / Fruit & Veg Market': [cart()],

  // ---------------------------------------------------------------------------
  // Retail & Commerce — specialty shops buy from a catalogue like other retail
  // ---------------------------------------------------------------------------
  'Boutique': [cart()],
  'Phone & Gadget Store': [cart()],
  'Bookstore & Stationery': [cart()],
  'Cosmetics & Beauty Supply': [cart()],
  'Gift & Souvenir Shop': [cart()],
  'Spare Parts Store': [cart()],

  // ---------------------------------------------------------------------------
  // Technology & Media — consulting-style engagements
  // ---------------------------------------------------------------------------
  'Cybersecurity': [booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Consultation', itemLabel: 'Service', showTime: false })],
  'IT Support & Services': [booking({ key: 'support', tabLabel: 'Support', ctaLabel: 'Request Support', itemLabel: 'Service', showTime: false })],

  // ---------------------------------------------------------------------------
  // Health & Wellness — clinical appointments and tests
  // ---------------------------------------------------------------------------
  'Medical Laboratory': [booking({ key: 'tests', tabLabel: 'Tests', ctaLabel: 'Book a Test', itemLabel: 'Test', showTime: false })],
  'Optician': [booking({ key: 'eye-tests', tabLabel: 'Appointments', ctaLabel: 'Book an Eye Test', itemLabel: 'Test', showTime: false })],
  'Physiotherapy & Rehab': [booking({ key: 'appointments', ctaLabel: 'Book a Session' })],
  'Nutrition & Diet Consultation': [booking({ key: 'consultations', ctaLabel: 'Book a Consultation' })],

  // ---------------------------------------------------------------------------
  // Professional Services — coaching and financial products
  // ---------------------------------------------------------------------------
  'Business Coaching': [booking({ key: 'sessions', ctaLabel: 'Book a Session', itemLabel: 'Package' })],
  'Microfinance & SACCO': [booking({ key: 'applications', tabLabel: 'Products', ctaLabel: 'Apply', itemLabel: 'Product', showTime: false })],

  // ---------------------------------------------------------------------------
  // Trades & Industry — vehicle services, fabrication and repair
  // ---------------------------------------------------------------------------
  'Car Wash & Detailing': [booking({ key: 'car-wash', ctaLabel: 'Book a Wash', itemLabel: 'Package', showTime: false })],
  'Auto Electrician & Panel Beating': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Service', showTime: false })],
  'Tyre & Vulcanizer': [booking({ key: 'service', ctaLabel: 'Book a Service' })],
  'Towing & Recovery': [booking({ key: 'towing', tabLabel: 'Tows', ctaLabel: 'Request a Tow', itemLabel: 'Service', showTime: false })],
  'Car Rental': [booking({
    key: 'rentals', tabLabel: 'Rentals', ctaLabel: 'Rent a Car', itemLabel: 'Vehicle',
    showTime: false, showDateRange: true, showQuantity: true, quantityLabel: 'Days',
  })],
  'Welders & Fabrication': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Service', showTime: false })],
  'Roofing & Building Works': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Service', showTime: false })],
  'Generator Sales & Repair': [booking({ key: 'repairs', tabLabel: 'Repairs', ctaLabel: 'Book a Repair', itemLabel: 'Repair', showTime: false })],

  // ---------------------------------------------------------------------------
  // Home & Personal Services — estimates, visits and pickups
  // ---------------------------------------------------------------------------
  'Laundry & Dry Cleaning': [booking({ key: 'pickup', tabLabel: 'Pickups', ctaLabel: 'Request Pickup', itemLabel: 'Service', showTime: false })],
  'House Cleaning': [booking({ key: 'service', ctaLabel: 'Book a Service' })],
  'Fumigation & Pest Control': [booking({ key: 'service', ctaLabel: 'Book a Service' })],
  'Interior Decoration': [booking({ key: 'projects', tabLabel: 'Services', ctaLabel: 'Start a Project', itemLabel: 'Service', showTime: false })],
  'Furniture Maker / Carpentry': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Service', showTime: false })],
  'Painting & POP Ceiling': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Service', showTime: false })],
  'Tiling & Flooring': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Service', showTime: false })],
  'Electrical Services': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Service', showTime: false })],
  'Plumbing Services': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Service', showTime: false })],
  'CCTV & Security Installation': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Service', showTime: false })],
  'Solar Installation': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Service', showTime: false })],
  'Appliance Repair': [booking({ key: 'repairs', tabLabel: 'Repairs', ctaLabel: 'Book a Repair', itemLabel: 'Repair', showTime: false })],

  // ---------------------------------------------------------------------------
  // Education — lessons and classes
  // ---------------------------------------------------------------------------
  'Computer & Tech Training': [booking({ key: 'classes', ctaLabel: 'Book a Class' })],
  'Music School': [booking({ key: 'lessons', tabLabel: 'Lessons', ctaLabel: 'Book a Lesson', itemLabel: 'Instrument' })],
  'Language School': [booking({ key: 'classes', ctaLabel: 'Book a Class' })],
  'Driving School': [booking({ key: 'lessons', tabLabel: 'Lessons', ctaLabel: 'Book a Lesson', itemLabel: 'Vehicle' })],

  // ---------------------------------------------------------------------------
  // Arts & Entertainment — bookings for hire and equipment
  // ---------------------------------------------------------------------------
  'DJ & MC': [booking({ key: 'performances', tabLabel: 'Bookings', ctaLabel: 'Book a DJ / MC', itemLabel: 'Act' })],
  'Event Rentals & Equipment': [booking({ key: 'rentals', tabLabel: 'Rentals', ctaLabel: 'Rent Equipment', itemLabel: 'Item', showTime: false })],

  // ---------------------------------------------------------------------------
  // Fashion & Beauty — fittings plus shop
  // ---------------------------------------------------------------------------
  'Tailor & Fashion Designer': [booking({ key: 'fittings', tabLabel: 'Fittings', ctaLabel: 'Book a Fitting', itemLabel: 'Style', showTime: false }), cart()],
  'Fabric Store': [cart()],
  'Footwear & Bags': [cart()],
  'Wig & Hair Extensions': [cart()],
  'Nail Studio': [booking({ key: 'appointments', ctaLabel: 'Book an Appointment' })],
  'Perfume & Cosmetics Store': [cart()],

  // ---------------------------------------------------------------------------
  // Local & Everyday Business — the neighbourhood economy
  // ---------------------------------------------------------------------------
  'Hair Braiding Studio': [booking({ key: 'appointments', ctaLabel: 'Book an Appointment' })],
  'Key Cutting & Locksmith': [booking({ key: 'service', ctaLabel: 'Book a Service' })],
  'Watch & Jewellery Repair': [booking({ key: 'repairs', tabLabel: 'Repairs', ctaLabel: 'Book a Repair', itemLabel: 'Repair', showTime: false })],
  'Motorcycle & Bicycle Repair': [booking({ key: 'repairs', tabLabel: 'Repairs', ctaLabel: 'Book a Repair', itemLabel: 'Repair', showTime: false })],
  'Palm Oil & Local Produce Seller': [cart()],
  'Firewood & Charcoal Supply': [cart()],
  'Gas Refill Station': [cart()],

  // ---------------------------------------------------------------------------
  // Logistics — pickups, quotes and haulage
  // ---------------------------------------------------------------------------
  'Courier & Dispatch': [booking({ key: 'pickup', tabLabel: 'Pickups', ctaLabel: 'Request Pickup', itemLabel: 'Service', showTime: false })],
  'Moving & Haulage': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Service', showTime: false })],
};

export function getCategoryFeatures(category: string | undefined | null): CategoryFeatureConfig[] {
  if (!category) return [];
  return CATEGORY_FEATURES[category] ?? [];
}

// ---------------------------------------------------------------------------
// Add-on module library
// ---------------------------------------------------------------------------
// A curated set of standalone booking/order modules ANY business can add to
// its profile on top of the ones its category ships with — e.g. a salon that
// also wants to sell products (Orders), or a restaurant that wants to take
// appointments. Keyed by the same module `key` stored in enabled_modules /
// business_bookings.module_key, so an added module runs on the exact same
// engine (BookingModal / CartModal) with no new code. `name`/`desc` are only
// used by the picker in the business form.
export interface ModuleLibraryEntry extends CategoryFeatureConfig {
  name: string;
  desc: string;
}

export const MODULE_LIBRARY: ModuleLibraryEntry[] = [
  { ...booking({ key: 'bookings', ctaLabel: 'Book Now' }), name: 'Bookings', desc: 'Take service bookings with a date & time.' },
  { ...booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book an Appointment' }), name: 'Appointments', desc: 'Appointment scheduling with date & time.' },
  { ...reservation(), name: 'Table Reservations', desc: 'Reserve a table with a party size.' },
  { ...cart(), name: 'Orders / Shop', desc: 'Sell products with an add-to-cart checkout.' },
  {
    ...booking({ key: 'rooms', ctaLabel: 'Book a Room', itemLabel: 'Room', showTime: false, showDateRange: true, showQuantity: true, quantityLabel: 'Guests' }),
    name: 'Room Bookings', desc: 'Check-in / check-out room reservations.',
  },
  { ...booking({ key: 'sessions', ctaLabel: 'Book a Session', itemLabel: 'Package' }), name: 'Sessions', desc: 'Book a session or package.' },
  { ...booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Consultation' }), name: 'Consultations', desc: 'Book a consultation slot.' },
  {
    ...booking({ key: 'events', ctaLabel: 'Book Now', itemLabel: 'Package', showQuantity: true, quantityLabel: 'Guests' }),
    name: 'Event Booking', desc: 'Take event bookings with guest counts.',
  },
  { ...booking({ key: 'deliveries', tabLabel: 'Deliveries', ctaLabel: 'Request Delivery', itemLabel: 'Service', showTime: false }), name: 'Delivery Requests', desc: 'Let customers request a delivery.' },
  { ...booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Service', showTime: false }), name: 'Quotes & Estimates', desc: 'Take quote/estimate requests with a service picker.' },
  { ...booking({ key: 'home-visits', tabLabel: 'Home Visits', ctaLabel: 'Request a Home Visit', itemLabel: 'Service' }), name: 'Home Visits', desc: 'Customers request a visit to their home or site.' },
  { ...booking({ key: 'pickup', tabLabel: 'Pickups', ctaLabel: 'Request Pickup', itemLabel: 'Service', showTime: false }), name: 'Pickup & Collection', desc: 'Let customers request a pickup or collection.' },
  { ...booking({ key: 'rentals', tabLabel: 'Rentals', ctaLabel: 'Rent Now', itemLabel: 'Item', showTime: false }), name: 'Rentals & Hire', desc: 'Take rental requests for items, equipment or vehicles.' },
  { ...booking({ key: 'fittings', tabLabel: 'Fittings', ctaLabel: 'Book a Fitting', itemLabel: 'Style', showTime: false }), name: 'Fittings & Measurements', desc: 'Customers book a fitting or measurements session.' },
  { ...booking({ key: 'lessons', tabLabel: 'Lessons', ctaLabel: 'Book a Lesson', itemLabel: 'Lesson' }), name: 'Book a Lesson', desc: 'Take one-off or recurring lesson bookings.' },
];

const MODULE_BY_KEY: Record<string, CategoryFeatureConfig> =
  Object.fromEntries(MODULE_LIBRARY.map((m) => [m.key, m]));

/** Resolve any known module key (category or add-on library) to its config. */
export function getModuleByKey(key: string): CategoryFeatureConfig | undefined {
  return MODULE_BY_KEY[key];
}

// The modules a specific business actually exposes: the category's modules,
// narrowed to the owner's selection when they've made one.
//   enabledModules null/undefined → all of the category's modules (default)
//   enabledModules []             → none (owner turned every module off)
//   enabledModules ['rooms', …]   → only those keys
export function getActiveFeatures(
  category: string | undefined | null,
  enabledModules?: string[] | null,
): CategoryFeatureConfig[] {
  const all = getCategoryFeatures(category);
  if (!enabledModules) return all;
  const categoryKeys = new Set(all.map((f) => f.key));
  const fromCategory = all.filter((f) => enabledModules.includes(f.key));
  // Modules the owner added that aren't part of the category — resolve them
  // from the add-on library so they render and work on the same engine.
  const added = enabledModules
    .filter((k) => !categoryKeys.has(k))
    .map((k) => MODULE_BY_KEY[k])
    .filter((m): m is CategoryFeatureConfig => Boolean(m));
  return [...fromCategory, ...added];
}

if (import.meta.env.DEV) {
  for (const key of Object.keys(CATEGORY_FEATURES)) {
    if (!BUSINESS_CATEGORIES.includes(key)) {
      // eslint-disable-next-line no-console
      console.warn(`categoryFeatures.ts: "${key}" is not a valid business category — check data/categories.ts stayed in sync.`);
    }
  }
}
