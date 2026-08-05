// Shared business category list — used by the add-business form and anywhere
// categories are offered as options. Grouped for a nicer dropdown.
//
// Adding a category here is enough to get it into the add-business form, the
// Businesses directory filters and global search. To give it booking/order
// modules or custom tab vocabulary, also add it to categoryFeatures.ts and/or
// categoryTabLabels.ts (both validate their keys against this list in DEV).

export const BUSINESS_CATEGORY_GROUPS: { group: string; items: string[] }[] = [
  {
    group: 'Food & Hospitality',
    items: ['Restaurant', 'Fast Food', 'Café & Bakery', 'Bar & Lounge', 'Catering', 'Hotel & Lodging', 'Guesthouse & Short-let / B&B', 'Event Planning', 'Local Food Vendor', 'Food Truck', 'Suya & Grill', 'Shawarma & Kebab', 'Bakery & Pastry', 'Frozen Food Store', 'Meat & Poultry Shop', 'Produce / Fruit & Veg Market'],
  },
  {
    group: 'Retail & Commerce',
    items: ['Retail Store', 'Supermarket', 'Grocery / Mini-Mart', 'Fashion & Apparel', 'Electronics', 'Jewelry & Accessories', 'Furniture & Home', 'Online Store / E-commerce', 'Boutique', 'Phone & Gadget Store', 'Bookstore & Stationery', 'Cosmetics & Beauty Supply', 'Gift & Souvenir Shop', 'Spare Parts Store'],
  },
  {
    group: 'Technology & Media',
    items: ['Software & IT', 'Telecommunications', 'Digital Marketing', 'Media & Publishing', 'Photography & Video', 'Web & App Development', 'Cybersecurity', 'IT Support & Services'],
  },
  {
    group: 'Health & Wellness',
    items: ['Hospital & Clinic', 'Pharmacy', 'Dental Care', 'Veterinary Services', 'Fitness & Gym', 'Spa & Beauty', 'Salon / Barber', 'Wellness & Therapy', 'Medical Laboratory', 'Optician', 'Physiotherapy & Rehab', 'Nutrition & Diet Consultation'],
  },
  {
    group: 'Professional Services',
    items: ['Legal Services', 'Accounting & Tax', 'Consulting', 'Financial Services', 'Money Transfer / Mobile Money Agent', 'Insurance', 'Real Estate', 'Recruitment & HR', 'Business Coaching', 'Microfinance & SACCO'],
  },
  {
    group: 'Trades & Industry',
    items: ['Construction', 'Manufacturing', 'Automotive', 'Car Dealership', 'Gadget & Device Repair', 'Logistics & Transport', 'Import/Export & Trading', 'Agriculture', 'Energy & Utilities', 'Cleaning Services', 'Car Wash & Detailing', 'Auto Electrician & Panel Beating', 'Tyre & Vulcanizer', 'Towing & Recovery', 'Car Rental', 'Welders & Fabrication', 'Roofing & Building Works', 'Generator Sales & Repair'],
  },
  {
    group: 'Home & Personal Services',
    items: ['Laundry & Dry Cleaning', 'House Cleaning', 'Fumigation & Pest Control', 'Interior Decoration', 'Furniture Maker / Carpentry', 'Painting & POP Ceiling', 'Tiling & Flooring', 'Electrical Services', 'Plumbing Services', 'CCTV & Security Installation', 'Solar Installation', 'Appliance Repair'],
  },
  {
    group: 'Education & Community',
    items: ['School & Education', 'Training & Tutoring', 'Childcare', 'Non-profit & NGO', 'Religious Organization', 'Computer & Tech Training', 'Music School', 'Language School', 'Driving School'],
  },
  {
    group: 'Arts & Entertainment',
    items: ['Entertainment', 'Music & Nightlife', 'Sports & Recreation', 'Art & Design', 'Travel & Tourism', 'DJ & MC', 'Event Rentals & Equipment'],
  },
  {
    group: 'Fashion & Beauty',
    items: ['Tailor & Fashion Designer', 'Fabric Store', 'Footwear & Bags', 'Wig & Hair Extensions', 'Nail Studio', 'Perfume & Cosmetics Store'],
  },
  {
    group: 'Local & Everyday Business',
    items: ['Hair Braiding Studio', 'Key Cutting & Locksmith', 'Watch & Jewellery Repair', 'Motorcycle & Bicycle Repair', 'Palm Oil & Local Produce Seller', 'Firewood & Charcoal Supply', 'Gas Refill Station'],
  },
  {
    group: 'Logistics & Mobility',
    items: ['Courier & Dispatch', 'Moving & Haulage'],
  },
];

// Flat list (e.g. for validation or filters)
export const BUSINESS_CATEGORIES: string[] = BUSINESS_CATEGORY_GROUPS.flatMap(g => g.items);

// A business's full category set: the primary plus any secondary categories.
// Used by directory filters, search and group counts so multi-service
// businesses (e.g. a tailor who also sells fabric) are discoverable under
// every category they serve.
export type Categorised = { category?: string; secondary_categories?: string[] | null };

export function businessCategories(b: Categorised): string[] {
  const set = new Set<string>();
  if (b.category) set.add(b.category);
  for (const c of b.secondary_categories ?? []) if (c) set.add(c);
  return [...set];
}

/** True when `category` is the primary or one of the secondary categories. */
export function matchesCategory(b: Categorised, category: string): boolean {
  return businessCategories(b).includes(category);
}
