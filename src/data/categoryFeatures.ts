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

/*
 * ── FIVE MORE MODULE SHAPES ────────────────────────────────────────────────
 *
 * Every one of these reduces to the flags CategoryFeatureConfig already has,
 * so BookingModal renders them with no changes — a "module type" here is a
 * PRESET, not a new engine. That is why the platform can afford a dozen of
 * them: the cost is a line of data, not a component.
 *
 * They exist because 140 of the 250 categories had no module at all, and the
 * reason was always the same: what they need is not a dated appointment. A
 * consultancy takes an enquiry. A school takes an application. A barber takes
 * a place in the queue. A cinema sells seats for a night. A gym sells a plan.
 */

/** A question, not a slot. No date, because there is nothing to schedule yet. */
const enquiry = (overrides: Partial<CategoryFeatureConfig> & Pick<CategoryFeatureConfig, 'key' | 'ctaLabel'>): CategoryFeatureConfig => ({
  tabLabel: 'Enquiries',
  itemSource: 'service',
  itemLabel: 'Service',
  showDate: false,
  showTime: false,
  showQuantity: false,
  ...overrides,
});

/** An application against a programme, a role or a facility. */
const apply = (overrides: Partial<CategoryFeatureConfig> & Pick<CategoryFeatureConfig, 'key' | 'ctaLabel'>): CategoryFeatureConfig => ({
  tabLabel: 'Applications',
  itemSource: 'service',
  itemLabel: 'Option',
  showDate: false,
  showTime: false,
  showQuantity: false,
  ...overrides,
});

/**
 * A place in line, for a walk-in trade.
 *
 * No date and no time on purpose: a barber's customer is not booking Tuesday
 * at three, they are asking how long the wait is and putting their name down.
 * Forcing a time slot on that is how a booking form goes unused.
 */
const queue = (overrides: Partial<CategoryFeatureConfig> & Pick<CategoryFeatureConfig, 'key' | 'ctaLabel'>): CategoryFeatureConfig => ({
  tabLabel: 'Queue',
  itemSource: 'service',
  itemLabel: 'Service',
  showDate: false,
  showTime: false,
  showQuantity: false,
  ...overrides,
});

/** Seats for a dated event. Quantity is the whole point. */
const ticket = (overrides: Partial<CategoryFeatureConfig> & Pick<CategoryFeatureConfig, 'key' | 'ctaLabel'>): CategoryFeatureConfig => ({
  tabLabel: 'Tickets',
  itemSource: 'service',
  itemLabel: 'Ticket',
  showDate: true,
  showTime: true,
  showQuantity: true,
  quantityLabel: 'Tickets',
  ...overrides,
});

/** A recurring plan — a membership, a retainer, a standing order. */
const subscribe = (overrides: Partial<CategoryFeatureConfig> & Pick<CategoryFeatureConfig, 'key' | 'ctaLabel'>): CategoryFeatureConfig => ({
  tabLabel: 'Plans',
  itemSource: 'service',
  itemLabel: 'Plan',
  showDate: false,
  showTime: false,
  showQuantity: false,
  ...overrides,
});

export const CATEGORY_FEATURES: Record<string, CategoryFeatureConfig[]> = {
  // Booking / appointment style
  'Hotel & Lodging': [booking({
    key: 'rooms', ctaLabel: 'Book a Room', itemLabel: 'Room', showTime: false, showDateRange: true,
    showQuantity: true, quantityLabel: 'Guests',
  }), booking({ key: 'events', tabLabel: 'Events', ctaLabel: 'Enquire About an Event', itemLabel: 'Space', showTime: false, showQuantity: true, quantityLabel: 'Guests' })],
  'Guesthouse & Short-let / B&B': [booking({
    key: 'rooms', ctaLabel: 'Book a Stay', itemLabel: 'Room', showTime: false, showDateRange: true,
    showQuantity: true, quantityLabel: 'Guests',
  }), enquiry({ key: 'long-stay', tabLabel: 'Long Stay', ctaLabel: 'Ask About Monthly Rates' })],
  'Photography & Video': [booking({ key: 'sessions', ctaLabel: 'Book a Session', itemLabel: 'Package' }), booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Package', showTime: false })],
  'Event Planning': [booking({ key: 'events', ctaLabel: 'Book Now', itemLabel: 'Package', showQuantity: true, quantityLabel: 'Guests' }), booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Package', showTime: false })],
  'Travel & Tourism': [booking({ key: 'trips', ctaLabel: 'Book a Trip', itemLabel: 'Package', showQuantity: true, quantityLabel: 'Travelers' }), enquiry({ key: 'enquiries', ctaLabel: 'Ask About a Trip' })],
  'Music & Nightlife': [booking({ key: 'performances', tabLabel: 'Bookings', ctaLabel: 'Book a Performance', itemLabel: 'Act' }), ticket({ key: 'tickets', ctaLabel: 'Get Tickets' })],
  'Art & Design': [booking({ key: 'projects', tabLabel: 'Services', ctaLabel: 'Start a Project', itemLabel: 'Service', showTime: false })],
  'Spa & Beauty': [booking({ key: 'appointments', ctaLabel: 'Book an Appointment' }), cart('orders')],
  'Wellness & Therapy': [booking({ key: 'appointments', ctaLabel: 'Book a Session' })],
  'Fitness & Gym': [booking({ key: 'classes', ctaLabel: 'Book a Class' }), subscribe({ key: 'plans', ctaLabel: 'Choose a Membership' })],
  'Hospital & Clinic': [booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book an Appointment' }), enquiry({ key: 'enquiries', ctaLabel: 'Ask a Question' })],
  'Dental Care': [booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book an Appointment' }), enquiry({ key: 'enquiries', ctaLabel: 'Ask a Question' })],
  'Veterinary Services': [booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book an Appointment' }), booking({ key: 'home-visits', tabLabel: 'Home Visits', ctaLabel: 'Request a Home Visit', itemLabel: 'Service' })],
  'Automotive': [booking({ key: 'service', ctaLabel: 'Book a Service' })],
  'Cleaning Services': [booking({ key: 'service', ctaLabel: 'Book a Service' }), subscribe({ key: 'plans', ctaLabel: 'Set Up Regular Cleaning' })],
  'Training & Tutoring': [booking({ key: 'classes', ctaLabel: 'Book a Class' })],
  'School & Education': [booking({ key: 'admissions', tabLabel: 'Admissions', ctaLabel: 'Apply Now', itemLabel: 'Programme' }), booking({ key: 'tours', tabLabel: 'Tours', ctaLabel: 'Book a School Visit', itemLabel: 'Visit' })],
  'Logistics & Transport': [booking({
    key: 'trips', tabLabel: 'Trips', ctaLabel: 'Book a Seat', itemLabel: 'Route',
    showQuantity: true, quantityLabel: 'Seats',
  }), enquiry({ key: 'tracking', tabLabel: 'Status', ctaLabel: 'Ask About a Shipment' })],
  'Childcare': [booking({ key: 'care', ctaLabel: 'Book Care' })],
  'Salon / Barber': [booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book an Appointment' }), queue({ key: 'queue', ctaLabel: 'Join the Queue' }), cart('orders')],
  'Legal Services': [booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Consultation', itemLabel: 'Practice Area' }), enquiry({ key: 'enquiries', ctaLabel: 'Describe Your Matter' })],
  'Financial Services': [booking({ key: 'applications', tabLabel: 'Products', ctaLabel: 'Apply', itemLabel: 'Product', showTime: false })],
  'Insurance': [booking({ key: 'quotes', tabLabel: 'Products', ctaLabel: 'Get a Quote', itemLabel: 'Policy', showTime: false })],
  'Accounting & Tax': [booking({ key: 'consultations', tabLabel: 'Services', ctaLabel: 'Book a Consultation', itemLabel: 'Service' })],
  'Digital Marketing': [booking({ key: 'projects', tabLabel: 'Services', ctaLabel: 'Start a Campaign', itemLabel: 'Service', showTime: false }), subscribe({ key: 'retainer', tabLabel: 'Retainers', ctaLabel: 'Ask About a Retainer' })],
  'Money Transfer / Mobile Money Agent': [booking({ key: 'requests', tabLabel: 'Services', ctaLabel: 'Get Started', itemLabel: 'Service', showTime: false })],
  'Software & IT': [booking({ key: 'projects', tabLabel: 'Services', ctaLabel: 'Start a Project', itemLabel: 'Service', showTime: false }), subscribe({ key: 'plans', ctaLabel: 'Compare Plans' })],
  'Gadget & Device Repair': [booking({ key: 'repairs', tabLabel: 'Repairs', ctaLabel: 'Book a Repair', itemLabel: 'Repair', showTime: false }), booking({ key: 'pickup', tabLabel: 'Pickups', ctaLabel: 'Request a Pickup', itemLabel: 'Device', showTime: false })],
  'Construction': [booking({ key: 'projects', tabLabel: 'Services', ctaLabel: 'Request a Quote', itemLabel: 'Service', showTime: false }), booking({ key: 'site-visits', tabLabel: 'Site Visits', ctaLabel: 'Book a Site Visit', itemLabel: 'Visit', showTime: false })],
  // Property tours/inspections — a single-pick booking against a listing
  // (business_products), NOT a cart: cart defaults to falsy here.
  'Real Estate': [booking({
    key: 'viewings', tabLabel: 'Viewings', ctaLabel: 'Book a Viewing',
    itemSource: 'product', itemLabel: 'Property',
  }), booking({ key: 'valuation', tabLabel: 'Valuation', ctaLabel: 'Request a Valuation', itemLabel: 'Property', showTime: false })],
  // Car dealership inventory — test drive booked against a single vehicle
  // (business_products), like Real Estate viewings (not a cart).
  'Car Dealership': [booking({
    key: 'test-drive', tabLabel: 'Test Drives', ctaLabel: 'Book a Test Drive',
    itemSource: 'product', itemLabel: 'Vehicle', showTime: true,
  }), booking({ key: 'valuation', tabLabel: 'Trade-in', ctaLabel: 'Value My Car', itemLabel: 'Vehicle', showTime: false })],

  // Reservation + cart (dine-in food categories get both — a table AND food ordering)
  'Restaurant': [reservation(), cart()],
  'Fast Food': [reservation(), cart()],
  'Café & Bakery': [reservation(), cart()],
  'Bar & Lounge': [reservation(), cart()],
  // Off-premises catering — no table to reserve, just the order
  'Catering': [cart()],

  // Cart-only (shop-and-buy-multiple-things categories)
  'Pharmacy': [cart(), booking({ key: 'deliveries', tabLabel: 'Deliveries', ctaLabel: 'Request Delivery', itemLabel: 'Order', showTime: false })],
  'Agriculture': [cart(), enquiry({ key: 'offtake', tabLabel: 'Off-take', ctaLabel: 'Discuss an Off-take Contract' })],
  'Manufacturing': [cart(), enquiry({ key: 'contract', tabLabel: 'Contract', ctaLabel: 'Discuss Contract Manufacturing' })],
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
  }), enquiry({ key: 'corporate', tabLabel: 'Corporate', ctaLabel: 'Ask About Corporate Hire' })],
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

  /*
   * ── EVERY REMAINING CATEGORY ───────────────────────────────────────────
   *
   * 140 of the 250 categories reached here with no module at all, so their
   * profiles had a Contact button and nothing to do. The reason was almost
   * always that the trade does not take a dated appointment: a consultancy
   * takes an enquiry, a school takes an application, a barber takes a place
   * in the queue, a cinema sells seats, a gym sells a plan.
   *
   * Each entry below is chosen for the trade, not filled in for coverage —
   * and several carry two or three, because a real business does. A block
   * industry sells blocks AND delivers them. A car dealer sells, values a
   * trade-in, and books test drives.
   */
  'Buka / Local Eatery': [cart('orders'), reservation()],
  'Small Chops & Snacks': [cart('orders'), booking({ key: 'catering', tabLabel: 'Catering', ctaLabel: 'Order a Tray', itemLabel: 'Tray', showTime: false, showQuantity: true, quantityLabel: 'Trays' })],
  'Ice Cream & Desserts': [cart('orders')],
  'Juice & Smoothie Bar': [cart('orders')],
  'Water Factory & Sachet Water': [cart('orders'), booking({ key: 'deliveries', tabLabel: 'Deliveries', ctaLabel: 'Request Delivery', itemLabel: 'Load', showTime: false })],
  'Wine & Spirits Shop': [cart('orders'), booking({ key: 'deliveries', tabLabel: 'Deliveries', ctaLabel: 'Request Delivery', itemLabel: 'Order', showTime: false })],
  'Serviced Apartments': [booking({ key: 'rooms', ctaLabel: 'Book a Stay', itemLabel: 'Apartment', showTime: false, showDateRange: true, showQuantity: true, quantityLabel: 'Guests' }), enquiry({ key: 'long-stay', tabLabel: 'Long Stay', ctaLabel: 'Ask About Monthly Rates' })],
  'Resort': [booking({ key: 'rooms', ctaLabel: 'Book a Room', itemLabel: 'Room', showTime: false, showDateRange: true, showQuantity: true, quantityLabel: 'Guests' }), booking({ key: 'events', tabLabel: 'Events', ctaLabel: 'Enquire About an Event', itemLabel: 'Package', showTime: false, showQuantity: true, quantityLabel: 'Guests' }), booking({ key: 'daypass', tabLabel: 'Day Pass', ctaLabel: 'Book a Day Pass', itemLabel: 'Pass', showTime: false, showQuantity: true, quantityLabel: 'Guests' })],
  'Canteen & Cafeteria': [cart('orders'), subscribe({ key: 'plans', ctaLabel: 'Set Up a Meal Plan' })],
  'Cold Room & Fish Depot': [cart('orders'), enquiry({ key: 'wholesale', tabLabel: 'Wholesale', ctaLabel: 'Ask for Trade Prices' })],
  'Building Materials Store': [cart('orders'), booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Material', showTime: false }), booking({ key: 'deliveries', tabLabel: 'Deliveries', ctaLabel: 'Request Delivery', itemLabel: 'Load', showTime: false })],
  'Provision Store': [cart('orders'), booking({ key: 'deliveries', tabLabel: 'Deliveries', ctaLabel: 'Request Delivery', itemLabel: 'Order', showTime: false })],
  'Toy & Baby Store': [cart('orders')],
  'Sports & Fitness Equipment': [cart('orders'), booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Equipment', showTime: false })],
  'Musical Instruments': [cart('orders'), booking({ key: 'rentals', tabLabel: 'Rentals', ctaLabel: 'Rent an Instrument', itemLabel: 'Instrument', showTime: false }), booking({ key: 'repairs', tabLabel: 'Repairs', ctaLabel: 'Book a Repair', itemLabel: 'Instrument', showTime: false })],
  'Pet Shop & Supplies': [cart('orders'), booking({ key: 'grooming', tabLabel: 'Grooming', ctaLabel: 'Book Grooming', itemLabel: 'Service' })],
  'Hardware Store': [cart('orders'), booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Item', showTime: false })],
  'Plastics & Household Goods': [cart('orders'), enquiry({ key: 'wholesale', tabLabel: 'Wholesale', ctaLabel: 'Ask for Trade Prices' })],
  'Thrift & Second-hand (Okrika)': [cart('orders'), enquiry({ key: 'bale', tabLabel: 'Bales', ctaLabel: 'Ask About a Bale' })],
  'Wholesale & Distribution': [enquiry({ key: 'wholesale', tabLabel: 'Trade Enquiries', ctaLabel: 'Open a Trade Account' }), booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Product', showTime: false })],
  'Duty-Free & Travel Retail': [cart('orders')],
  'Agro Inputs & Seedlings': [cart('orders'), enquiry({ key: 'agronomy', tabLabel: 'Advice', ctaLabel: 'Ask an Agronomist' })],
  'Telecommunications': [subscribe({ key: 'plans', ctaLabel: 'Choose a Plan' }), enquiry({ key: 'support', tabLabel: 'Support', ctaLabel: 'Report a Fault' }), booking({ key: 'installation', tabLabel: 'Installation', ctaLabel: 'Book an Installation', itemLabel: 'Service', showTime: false })],
  'Media & Publishing': [enquiry({ key: 'enquiries', ctaLabel: 'Send an Enquiry' }), booking({ key: 'advertising', tabLabel: 'Advertising', ctaLabel: 'Book Ad Space', itemLabel: 'Placement', showTime: false })],
  'Web & App Development': [enquiry({ key: 'projects', tabLabel: 'Projects', ctaLabel: 'Start a Project' }), booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Consultation' }), subscribe({ key: 'retainer', tabLabel: 'Retainers', ctaLabel: 'Ask About a Retainer' })],
  'Fintech & Payments': [subscribe({ key: 'plans', ctaLabel: 'Compare Plans' }), enquiry({ key: 'integration', tabLabel: 'Integrate', ctaLabel: 'Talk to Sales' }), apply({ key: 'onboarding', tabLabel: 'Get Started', ctaLabel: 'Open an Account' })],
  'Cloud & Hosting Services': [subscribe({ key: 'plans', ctaLabel: 'Choose a Plan' }), enquiry({ key: 'migration', tabLabel: 'Migration', ctaLabel: 'Ask About Migration' })],
  'Data & Analytics': [enquiry({ key: 'projects', tabLabel: 'Projects', ctaLabel: 'Discuss a Project' }), booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Consultation' })],
  'AI & Automation Services': [enquiry({ key: 'projects', tabLabel: 'Projects', ctaLabel: 'Discuss a Project' }), booking({ key: 'demos', tabLabel: 'Demos', ctaLabel: 'Book a Demo' })],
  'Cyber Café & Business Centre': [queue({ key: 'queue', ctaLabel: 'Join the Queue' }), cart('orders'), enquiry({ key: 'bulk', tabLabel: 'Bulk Jobs', ctaLabel: 'Ask About a Bulk Job' })],
  'Printing & Signage': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Job', showTime: false }), cart('orders'), booking({ key: 'artwork', tabLabel: 'Artwork', ctaLabel: 'Send Artwork', itemLabel: 'Job', showTime: false })],
  'Animation & Motion Graphics': [enquiry({ key: 'projects', tabLabel: 'Projects', ctaLabel: 'Start a Project' }), booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Call' })],
  'Podcast & Audio Production': [booking({ key: 'studio', tabLabel: 'Studio', ctaLabel: 'Book Studio Time', itemLabel: 'Studio' }), enquiry({ key: 'projects', tabLabel: 'Projects', ctaLabel: 'Discuss a Project' })],
  'Game Development': [enquiry({ key: 'projects', tabLabel: 'Projects', ctaLabel: 'Discuss a Project' })],
  'Drone Services': [booking({ key: 'flights', tabLabel: 'Shoots', ctaLabel: 'Book a Shoot', itemLabel: 'Package' }), booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Survey', showTime: false })],
  'Broadcasting & Radio': [booking({ key: 'advertising', tabLabel: 'Advertising', ctaLabel: 'Book Airtime', itemLabel: 'Slot', showTime: false }), enquiry({ key: 'guest', tabLabel: 'Be a Guest', ctaLabel: 'Pitch a Guest' })],
  'Call Centre & BPO': [enquiry({ key: 'enquiries', ctaLabel: 'Talk to Sales' }), subscribe({ key: 'plans', ctaLabel: 'Compare Plans' })],
  'Maternity & Birth Centre': [booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book an Appointment' }), booking({ key: 'tours', tabLabel: 'Tours', ctaLabel: 'Book a Tour', itemLabel: 'Tour', showTime: true }), subscribe({ key: 'packages', tabLabel: 'Packages', ctaLabel: 'Ask About a Package' })],
  'Eye Clinic': [booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book an Eye Test' }), cart('orders')],
  'Diagnostic Imaging': [booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book a Scan', itemLabel: 'Scan' }), enquiry({ key: 'results', tabLabel: 'Results', ctaLabel: 'Ask About Results' })],
  'Mental Health & Counselling': [booking({ key: 'sessions', tabLabel: 'Sessions', ctaLabel: 'Book a Session', itemLabel: 'Session' }), enquiry({ key: 'enquiries', ctaLabel: 'Ask a Question' })],
  'Herbal & Traditional Medicine': [booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Consultation' }), cart('orders')],
  'Home Care & Nursing': [booking({ key: 'home-visits', tabLabel: 'Home Visits', ctaLabel: 'Request a Home Visit', itemLabel: 'Service' }), subscribe({ key: 'plans', ctaLabel: 'Ask About a Care Plan' })],
  'Ambulance & Emergency Services': [enquiry({ key: 'dispatch', tabLabel: 'Dispatch', ctaLabel: 'Request an Ambulance', itemSource: 'none' }), subscribe({ key: 'cover', tabLabel: 'Cover', ctaLabel: 'Ask About Cover' })],
  'Dialysis Centre': [booking({ key: 'sessions', tabLabel: 'Sessions', ctaLabel: 'Book a Session', itemLabel: 'Session' }), subscribe({ key: 'plans', ctaLabel: 'Ask About a Plan' })],
  'Medical Equipment Supplier': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Equipment', showTime: false }), cart('orders'), booking({ key: 'servicing', tabLabel: 'Servicing', ctaLabel: 'Book Servicing', itemLabel: 'Equipment', showTime: false })],
  'Chiropractic & Osteopathy': [booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book an Appointment' })],
  'Consulting': [enquiry({ key: 'enquiries', ctaLabel: 'Send a Brief' }), booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Consultation' }), subscribe({ key: 'retainer', tabLabel: 'Retainers', ctaLabel: 'Ask About a Retainer' })],
  'Recruitment & HR': [apply({ key: 'applications', ctaLabel: 'Submit Your CV', itemLabel: 'Role' }), enquiry({ key: 'hiring', tabLabel: 'Hiring', ctaLabel: 'Hire Through Us' })],
  'Immigration & Visa Services': [booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Consultation' }), apply({ key: 'applications', ctaLabel: 'Start an Application', itemLabel: 'Route' })],
  'Translation & Interpretation': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Language pair', showTime: false }), booking({ key: 'interpreting', tabLabel: 'Interpreting', ctaLabel: 'Book an Interpreter', itemLabel: 'Language' })],
  'Notary & Documentation': [booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book an Appointment' }), enquiry({ key: 'enquiries', ctaLabel: 'Ask What You Need' })],
  'Auditing Services': [enquiry({ key: 'enquiries', ctaLabel: 'Request a Proposal' }), booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Meeting' })],
  'Market Research': [enquiry({ key: 'projects', tabLabel: 'Projects', ctaLabel: 'Brief a Study' }), booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Call' })],
  'Public Relations': [enquiry({ key: 'enquiries', ctaLabel: 'Send a Brief' }), subscribe({ key: 'retainer', tabLabel: 'Retainers', ctaLabel: 'Ask About a Retainer' })],
  'Architecture & Design': [enquiry({ key: 'projects', tabLabel: 'Projects', ctaLabel: 'Discuss a Project' }), booking({ key: 'site-visits', tabLabel: 'Site Visits', ctaLabel: 'Book a Site Visit', itemLabel: 'Service', showTime: false })],
  'Surveying & Valuation': [booking({ key: 'valuation', tabLabel: 'Valuation', ctaLabel: 'Request a Valuation', itemLabel: 'Asset', showTime: false }), booking({ key: 'site-visits', tabLabel: 'Site Visits', ctaLabel: 'Book a Survey', itemLabel: 'Survey', showTime: false })],
  'Procurement & Supply': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Item', showTime: false }), enquiry({ key: 'tender', tabLabel: 'Tenders', ctaLabel: 'Invite Us to Tender' })],
  'Customs Brokerage & Clearing': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Clearing Quote', itemLabel: 'Shipment', showTime: false }), enquiry({ key: 'tracking', tabLabel: 'Status', ctaLabel: 'Ask About a Shipment' })],
  'Investment & Wealth Management': [booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Consultation' }), subscribe({ key: 'plans', ctaLabel: 'Compare Plans' })],
  'Trademark & IP Services': [apply({ key: 'applications', ctaLabel: 'Start a Filing', itemLabel: 'Filing' }), booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Consultation' })],
  'Import/Export & Trading': [enquiry({ key: 'enquiries', ctaLabel: 'Send an Enquiry' }), booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Consignment', showTime: false })],
  'Energy & Utilities': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'System', showTime: false }), booking({ key: 'site-visits', tabLabel: 'Site Visits', ctaLabel: 'Book a Site Survey', itemLabel: 'Survey', showTime: false }), subscribe({ key: 'maintenance', tabLabel: 'Maintenance', ctaLabel: 'Ask About Maintenance' })],
  'Borehole Drilling & Water Works': [booking({ key: 'site-visits', tabLabel: 'Site Visits', ctaLabel: 'Book a Site Survey', itemLabel: 'Survey', showTime: false }), booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Job', showTime: false })],
  'Block Industry & Cement': [cart('orders'), booking({ key: 'deliveries', tabLabel: 'Deliveries', ctaLabel: 'Request Delivery', itemLabel: 'Load', showTime: false })],
  'Steel & Metal Works': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Job', showTime: false }), enquiry({ key: 'fabrication', tabLabel: 'Fabrication', ctaLabel: 'Send a Drawing' })],
  'Printing Press': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Job', showTime: false }), cart('orders')],
  'Packaging & Labelling': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Packaging', showTime: false }), enquiry({ key: 'samples', tabLabel: 'Samples', ctaLabel: 'Request a Sample' })],
  'Textile Manufacturing': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Fabric', showTime: false }), enquiry({ key: 'samples', tabLabel: 'Samples', ctaLabel: 'Request a Swatch' })],
  'Food Processing': [enquiry({ key: 'contract', tabLabel: 'Contract', ctaLabel: 'Discuss Contract Manufacturing' }), booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Product', showTime: false })],
  'Chemical & Industrial Supplies': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Product', showTime: false }), cart('orders')],
  'Mining & Quarry': [enquiry({ key: 'enquiries', ctaLabel: 'Send an Enquiry' }), booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Material', showTime: false })],
  'Oil & Gas Services': [enquiry({ key: 'enquiries', ctaLabel: 'Send an Enquiry' }), booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Service', showTime: false })],
  'Recycling & Waste Management': [booking({ key: 'pickup', tabLabel: 'Pickups', ctaLabel: 'Request a Pickup', itemLabel: 'Waste type', showTime: false }), subscribe({ key: 'plans', ctaLabel: 'Set Up Collection' })],
  'Aluminium & Glass Works': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Job', showTime: false }), booking({ key: 'site-visits', tabLabel: 'Site Visits', ctaLabel: 'Book a Measurement Visit', itemLabel: 'Visit', showTime: false })],
  'Aluminium Windows & Doors': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Job', showTime: false }), booking({ key: 'site-visits', tabLabel: 'Site Visits', ctaLabel: 'Book a Measurement Visit', itemLabel: 'Visit', showTime: false })],
  'Curtains & Blinds': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Room', showTime: false }), booking({ key: 'home-visits', tabLabel: 'Home Visits', ctaLabel: 'Book a Measurement Visit', itemLabel: 'Visit', showTime: false })],
  'Landscaping & Gardening': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Job', showTime: false }), subscribe({ key: 'plans', ctaLabel: 'Set Up Regular Upkeep' })],
  'Swimming Pool Services': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Job', showTime: false }), subscribe({ key: 'plans', ctaLabel: 'Set Up Servicing' })],
  'Home Renovation': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Job', showTime: false }), booking({ key: 'site-visits', tabLabel: 'Site Visits', ctaLabel: 'Book a Site Visit', itemLabel: 'Visit', showTime: false })],
  'Upholstery & Refurbishing': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Item', showTime: false }), booking({ key: 'pickup', tabLabel: 'Pickups', ctaLabel: 'Request a Pickup', itemLabel: 'Item', showTime: false })],
  'Water Treatment & Purification': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'System', showTime: false }), booking({ key: 'site-visits', tabLabel: 'Site Visits', ctaLabel: 'Book a Water Test', itemLabel: 'Test', showTime: false })],
  'Inverter & Battery Services': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'System', showTime: false }), booking({ key: 'repairs', tabLabel: 'Repairs', ctaLabel: 'Book a Repair', itemLabel: 'Fault', showTime: false }), cart('orders')],
  'Air Conditioning & Refrigeration': [booking({ key: 'repairs', tabLabel: 'Repairs', ctaLabel: 'Book a Repair', itemLabel: 'Fault', showTime: false }), booking({ key: 'installation', tabLabel: 'Installation', ctaLabel: 'Book an Installation', itemLabel: 'Unit', showTime: false }), subscribe({ key: 'plans', ctaLabel: 'Set Up Servicing' })],
  'Satellite & Cable Installation': [booking({ key: 'installation', tabLabel: 'Installation', ctaLabel: 'Book an Installation', itemLabel: 'Package', showTime: false }), subscribe({ key: 'plans', ctaLabel: 'Choose a Package' })],
  'Non-profit & NGO': [enquiry({ key: 'enquiries', ctaLabel: 'Get in Touch' }), apply({ key: 'volunteer', tabLabel: 'Volunteer', ctaLabel: 'Volunteer With Us', itemLabel: 'Programme' })],
  'Religious Organization': [enquiry({ key: 'enquiries', ctaLabel: 'Get in Touch' }), booking({ key: 'ceremonies', tabLabel: 'Ceremonies', ctaLabel: 'Book a Ceremony', itemLabel: 'Ceremony', showTime: true }), apply({ key: 'volunteer', tabLabel: 'Serve', ctaLabel: 'Join a Team', itemLabel: 'Team' })],
  'International School': [apply({ key: 'admissions', tabLabel: 'Admissions', ctaLabel: 'Apply for Admission', itemLabel: 'Year group' }), booking({ key: 'tours', tabLabel: 'Tours', ctaLabel: 'Book a Tour', itemLabel: 'Tour' })],
  'University & College': [apply({ key: 'admissions', tabLabel: 'Admissions', ctaLabel: 'Apply for Admission', itemLabel: 'Programme' }), booking({ key: 'tours', tabLabel: 'Tours', ctaLabel: 'Book a Campus Tour', itemLabel: 'Tour' }), enquiry({ key: 'enquiries', ctaLabel: 'Ask Admissions' })],
  'Vocational & Skills Training': [apply({ key: 'enrolment', tabLabel: 'Enrolment', ctaLabel: 'Enrol on a Course', itemLabel: 'Course' }), enquiry({ key: 'enquiries', ctaLabel: 'Ask About a Course' })],
  'Exam Preparation Centre': [apply({ key: 'enrolment', tabLabel: 'Enrolment', ctaLabel: 'Register for a Class', itemLabel: 'Class' }), booking({ key: 'mock', tabLabel: 'Mock Exams', ctaLabel: 'Book a Mock Exam', itemLabel: 'Exam' })],
  'Library & Study Centre': [subscribe({ key: 'plans', ctaLabel: 'Get a Membership' }), booking({ key: 'desk', tabLabel: 'Study Desk', ctaLabel: 'Reserve a Desk', itemLabel: 'Desk' })],
  'Special Needs Education': [enquiry({ key: 'enquiries', ctaLabel: 'Talk to Us First' }), booking({ key: 'assessment', tabLabel: 'Assessment', ctaLabel: 'Book an Assessment', itemLabel: 'Assessment' }), booking({ key: 'tours', tabLabel: 'Tours', ctaLabel: 'Book a Visit', itemLabel: 'Visit' })],
  'Study Abroad & Scholarships': [booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Counselling Session' }), apply({ key: 'applications', ctaLabel: 'Start an Application', itemLabel: 'Destination' })],
  'Community Association': [enquiry({ key: 'enquiries', ctaLabel: 'Get in Touch' }), apply({ key: 'membership', tabLabel: 'Membership', ctaLabel: 'Join the Association', itemLabel: 'Membership' })],
  'Cooperative Society': [apply({ key: 'membership', tabLabel: 'Membership', ctaLabel: 'Join the Cooperative', itemLabel: 'Membership' }), enquiry({ key: 'loans', tabLabel: 'Loans', ctaLabel: 'Ask About a Loan' })],
  'Sports Academy': [apply({ key: 'trials', tabLabel: 'Trials', ctaLabel: 'Register for Trials', itemLabel: 'Age group' }), subscribe({ key: 'plans', ctaLabel: 'Join the Academy' }), booking({ key: 'sessions', tabLabel: 'Sessions', ctaLabel: 'Book a Session', itemLabel: 'Session' })],
  'Entertainment': [enquiry({ key: 'enquiries', ctaLabel: 'Send an Enquiry' }), booking({ key: 'bookings', ctaLabel: 'Book an Act', itemLabel: 'Act' })],
  'Sports & Recreation': [booking({ key: 'pitch', tabLabel: 'Bookings', ctaLabel: 'Book a Pitch', itemLabel: 'Pitch', showQuantity: true, quantityLabel: 'Players' }), subscribe({ key: 'plans', ctaLabel: 'Get a Membership' })],
  'Cinema & Theatre': [ticket({ key: 'tickets', ctaLabel: 'Get Tickets' }), enquiry({ key: 'private', tabLabel: 'Private Hire', ctaLabel: 'Hire a Screen' })],
  'Event Venue & Hall': [booking({ key: 'venue', tabLabel: 'Bookings', ctaLabel: 'Check Availability', itemLabel: 'Hall', showTime: false, showQuantity: true, quantityLabel: 'Guests' }), booking({ key: 'tours', tabLabel: 'Tours', ctaLabel: 'Book a Viewing', itemLabel: 'Viewing' })],
  'Comedy & Live Performance': [ticket({ key: 'tickets', ctaLabel: 'Get Tickets' }), booking({ key: 'bookings', ctaLabel: 'Book the Act', itemLabel: 'Act', showTime: false })],
  'Gaming & Esports Centre': [booking({ key: 'station', tabLabel: 'Bookings', ctaLabel: 'Book a Station', itemLabel: 'Station', showQuantity: true, quantityLabel: 'Players' }), ticket({ key: 'tournaments', tabLabel: 'Tournaments', ctaLabel: 'Enter a Tournament', itemLabel: 'Tournament' }), subscribe({ key: 'plans', ctaLabel: 'Get a Pass' })],
  'Betting & Lottery': [enquiry({ key: 'enquiries', ctaLabel: 'Ask a Question' })],
  'Football Viewing Centre': [ticket({ key: 'seats', tabLabel: 'Seats', ctaLabel: 'Reserve a Seat', itemLabel: 'Match' }), enquiry({ key: 'private', tabLabel: 'Private Hire', ctaLabel: 'Book the Centre' })],
  'Amusement Park & Play Centre': [ticket({ key: 'tickets', ctaLabel: 'Get Tickets' }), booking({ key: 'parties', tabLabel: 'Parties', ctaLabel: 'Book a Party', itemLabel: 'Package', showQuantity: true, quantityLabel: 'Children' })],
  'Art Gallery': [cart('orders'), booking({ key: 'viewing', tabLabel: 'Viewings', ctaLabel: 'Book a Private Viewing', itemLabel: 'Viewing' })],
  'Museum & Heritage Site': [ticket({ key: 'tickets', ctaLabel: 'Get Tickets' }), booking({ key: 'tours', tabLabel: 'Guided Tours', ctaLabel: 'Book a Guided Tour', itemLabel: 'Tour', showQuantity: true, quantityLabel: 'Visitors' })],
  'Talent & Modelling Agency': [apply({ key: 'casting', tabLabel: 'Casting', ctaLabel: 'Submit a Portfolio', itemLabel: 'Category' }), enquiry({ key: 'booking', tabLabel: 'Book Talent', ctaLabel: 'Book Talent' })],
  'Film & Video Production': [enquiry({ key: 'projects', tabLabel: 'Projects', ctaLabel: 'Discuss a Project' }), booking({ key: 'crew', tabLabel: 'Crew & Kit', ctaLabel: 'Book Crew or Kit', itemLabel: 'Package', showTime: false })],
  'Makeup Artist': [booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book a Session', itemLabel: 'Look' }), booking({ key: 'home-visits', tabLabel: 'Home Visits', ctaLabel: 'Book a Home Visit', itemLabel: 'Look' })],
  'Gele & Aso-Oke Styling': [booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book a Styling', itemLabel: 'Style' }), cart('orders')],
  'Bridal & Wedding Services': [booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Consultation' }), booking({ key: 'fittings', tabLabel: 'Fittings', ctaLabel: 'Book a Fitting', itemLabel: 'Fitting', showTime: false }), booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Package', showTime: false })],
  'Shoe Repair & Cobbler': [booking({ key: 'repairs', tabLabel: 'Repairs', ctaLabel: 'Book a Repair', itemLabel: 'Repair', showTime: false }), booking({ key: 'pickup', tabLabel: 'Pickups', ctaLabel: 'Request a Pickup', itemLabel: 'Item', showTime: false })],
  'Leather Works': [cart('orders'), booking({ key: 'bespoke', tabLabel: 'Bespoke', ctaLabel: 'Order Something Bespoke', itemLabel: 'Item', showTime: false })],
  'Uniform & Corporate Wear': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Uniform', showTime: false }), booking({ key: 'fittings', tabLabel: 'Fittings', ctaLabel: 'Book Measurements', itemLabel: 'Fitting', showTime: false })],
  'Skincare Clinic': [booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book a Treatment', itemLabel: 'Treatment' }), booking({ key: 'consultations', tabLabel: 'Consultations', ctaLabel: 'Book a Skin Consultation' }), cart('orders')],
  'Jewellery Making': [cart('orders'), booking({ key: 'bespoke', tabLabel: 'Bespoke', ctaLabel: 'Commission a Piece', itemLabel: 'Piece', showTime: false }), booking({ key: 'repairs', tabLabel: 'Repairs', ctaLabel: 'Book a Repair', itemLabel: 'Repair', showTime: false })],
  'Personal Styling & Shopping': [booking({ key: 'sessions', tabLabel: 'Sessions', ctaLabel: 'Book a Styling Session', itemLabel: 'Session' }), subscribe({ key: 'plans', ctaLabel: 'Ask About a Package' })],
  'POS & Agent Banking': [enquiry({ key: 'enquiries', ctaLabel: 'Ask a Question', itemSource: 'none' }), apply({ key: 'agent', tabLabel: 'Become an Agent', ctaLabel: 'Apply to Be an Agent', itemLabel: 'Route' })],
  'Bureau de Change': [enquiry({ key: 'rates', tabLabel: 'Rates', ctaLabel: 'Ask Today\u2019s Rate', itemSource: 'none' })],
  'Recharge Card & Data Vendor': [cart('orders'), enquiry({ key: 'bulk', tabLabel: 'Bulk', ctaLabel: 'Ask About Bulk Pricing' })],
  'Photocopy & Printing Kiosk': [queue({ key: 'queue', ctaLabel: 'Send a Job Ahead' }), booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Ask for a Price', itemLabel: 'Job', showTime: false })],
  'Local Market Stall': [cart('orders'), enquiry({ key: 'enquiries', ctaLabel: 'Ask What Is Available' })],
  'Water Vendor': [booking({ key: 'deliveries', tabLabel: 'Deliveries', ctaLabel: 'Request Water', itemLabel: 'Load', showTime: false, showQuantity: true, quantityLabel: 'Jerrycans' }), subscribe({ key: 'plans', ctaLabel: 'Set Up Regular Delivery' })],
  'Roadside Mechanic': [queue({ key: 'queue', ctaLabel: 'Tell Us You Are Coming' }), booking({ key: 'roadside', tabLabel: 'Roadside', ctaLabel: 'Call Me Out', itemLabel: 'Fault', showTime: false })],
  'Sewing & Alterations': [booking({ key: 'fittings', tabLabel: 'Fittings', ctaLabel: 'Book a Fitting', itemLabel: 'Garment', showTime: false }), booking({ key: 'pickup', tabLabel: 'Pickups', ctaLabel: 'Request a Pickup', itemLabel: 'Garment', showTime: false })],
  'Barbing Kiosk': [queue({ key: 'queue', ctaLabel: 'Join the Queue' }), booking({ key: 'appointments', tabLabel: 'Appointments', ctaLabel: 'Book a Time', itemLabel: 'Cut' })],
  'Laundry Kiosk': [booking({ key: 'pickup', tabLabel: 'Pickups', ctaLabel: 'Request a Pickup', itemLabel: 'Load', showTime: false }), subscribe({ key: 'plans', ctaLabel: 'Set Up Weekly Laundry' })],
  'Freight Forwarding': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Freight Quote', itemLabel: 'Shipment', showTime: false }), enquiry({ key: 'tracking', tabLabel: 'Status', ctaLabel: 'Ask About a Shipment' })],
  'Shipping & Customs Agency': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Shipment', showTime: false }), enquiry({ key: 'clearing', tabLabel: 'Clearing', ctaLabel: 'Ask About Clearing' })],
  'Airline & Flight Booking': [enquiry({ key: 'enquiries', ctaLabel: 'Ask About a Fare' }), booking({ key: 'trips', tabLabel: 'Trips', ctaLabel: 'Request a Booking', itemLabel: 'Route', showTime: false, showQuantity: true, quantityLabel: 'Passengers' })],
  'Ride-Hailing & Taxi': [booking({ key: 'rides', tabLabel: 'Rides', ctaLabel: 'Request a Ride', itemLabel: 'Vehicle', showQuantity: true, quantityLabel: 'Passengers' }), booking({ key: 'airport', tabLabel: 'Airport', ctaLabel: 'Book an Airport Run', itemLabel: 'Route' }), subscribe({ key: 'plans', ctaLabel: 'Ask About a Monthly Driver' })],
  'Keke & Okada Services': [booking({ key: 'rides', tabLabel: 'Rides', ctaLabel: 'Request a Ride', itemLabel: 'Trip', showTime: false }), subscribe({ key: 'plans', ctaLabel: 'Set Up a Daily Run' })],
  'Truck & Heavy Haulage': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Haulage Quote', itemLabel: 'Load', showTime: false }), booking({ key: 'rentals', tabLabel: 'Hire', ctaLabel: 'Hire a Truck', itemLabel: 'Truck', showTime: false })],
  'Warehousing & Storage': [enquiry({ key: 'enquiries', ctaLabel: 'Ask About Space' }), booking({ key: 'tours', tabLabel: 'Tours', ctaLabel: 'Book a Site Visit', itemLabel: 'Visit', showTime: false }), subscribe({ key: 'plans', ctaLabel: 'Take Monthly Space' })],
  'Last-Mile Delivery': [booking({ key: 'deliveries', tabLabel: 'Deliveries', ctaLabel: 'Book a Delivery', itemLabel: 'Package', showTime: false }), subscribe({ key: 'plans', ctaLabel: 'Set Up Daily Dispatch' }), enquiry({ key: 'tracking', tabLabel: 'Status', ctaLabel: 'Ask About a Delivery' })],
  'Bus & Interstate Transport': [ticket({ key: 'seats', tabLabel: 'Seats', ctaLabel: 'Book a Seat', itemLabel: 'Route', quantityLabel: 'Seats' }), enquiry({ key: 'charter', tabLabel: 'Charter', ctaLabel: 'Charter a Bus' })],
  'Cold Chain Logistics': [booking({ key: 'quotes', tabLabel: 'Estimates', ctaLabel: 'Request a Quote', itemLabel: 'Consignment', showTime: false }), enquiry({ key: 'enquiries', ctaLabel: 'Ask About Capacity' })],
  'Vehicle Tracking & Telematics': [booking({ key: 'installation', tabLabel: 'Installation', ctaLabel: 'Book an Installation', itemLabel: 'Vehicle', showTime: false }), subscribe({ key: 'plans', ctaLabel: 'Choose a Plan' })],
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
  { ...enquiry({ key: 'enquiries', ctaLabel: 'Send an Enquiry' }), name: 'Enquiries', desc: 'Take a question about a service, with no date to pick.' },
  { ...enquiry({ key: 'callback', tabLabel: 'Call Back', ctaLabel: 'Request a Call Back', itemSource: 'none' }), name: 'Call Back', desc: 'Customers ask to be phoned, with nothing else to fill in.' },
  { ...apply({ key: 'applications', ctaLabel: 'Apply Now' }), name: 'Applications', desc: 'Applications for a programme, a role or a place.' },
  { ...queue({ key: 'queue', ctaLabel: 'Join the Queue' }), name: 'Walk-in Queue', desc: 'A place in line for a walk-in trade — no time slot.' },
  { ...ticket({ key: 'tickets', ctaLabel: 'Get Tickets' }), name: 'Tickets', desc: 'Seats for a dated event, with a ticket count.' },
  { ...subscribe({ key: 'plans', ctaLabel: 'Choose a Plan' }), name: 'Plans & Memberships', desc: 'A recurring plan, membership or standing order.' },
  { ...booking({ key: 'site-visits', tabLabel: 'Site Visits', ctaLabel: 'Book a Site Visit', itemLabel: 'Service', showTime: false }), name: 'Site Visits', desc: 'A visit to a site, plot or premises.' },
  { ...booking({ key: 'valuation', tabLabel: 'Valuation', ctaLabel: 'Request a Valuation', itemLabel: 'Asset', showTime: false }), name: 'Valuation', desc: 'A written valuation of an asset or property.' },
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
