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
    items: ['Restaurant', 'Fast Food', 'Café & Bakery', 'Bar & Lounge', 'Catering', 'Hotel & Lodging', 'Guesthouse & Short-let / B&B', 'Event Planning', 'Local Food Vendor', 'Food Truck', 'Suya & Grill', 'Shawarma & Kebab', 'Bakery & Pastry', 'Frozen Food Store', 'Meat & Poultry Shop', 'Produce / Fruit & Veg Market', 'Buka / Local Eatery', 'Small Chops & Snacks', 'Ice Cream & Desserts', 'Juice & Smoothie Bar', 'Water Factory & Sachet Water', 'Wine & Spirits Shop', 'Serviced Apartments', 'Resort', 'Canteen & Cafeteria', 'Cold Room & Fish Depot'],
  },
  {
    group: 'Retail & Commerce',
    items: ['Retail Store', 'Supermarket', 'Grocery / Mini-Mart', 'Fashion & Apparel', 'Electronics', 'Jewelry & Accessories', 'Furniture & Home', 'Online Store / E-commerce', 'Boutique', 'Phone & Gadget Store', 'Bookstore & Stationery', 'Cosmetics & Beauty Supply', 'Gift & Souvenir Shop', 'Spare Parts Store', 'Building Materials Store', 'Provision Store', 'Toy & Baby Store', 'Sports & Fitness Equipment', 'Musical Instruments', 'Pet Shop & Supplies', 'Hardware Store', 'Plastics & Household Goods', 'Thrift & Second-hand (Okrika)', 'Wholesale & Distribution', 'Duty-Free & Travel Retail', 'Agro Inputs & Seedlings'],
  },
  {
    group: 'Technology & Media',
    items: ['Software & IT', 'Telecommunications', 'Digital Marketing', 'Media & Publishing', 'Photography & Video', 'Web & App Development', 'Cybersecurity', 'IT Support & Services', 'Fintech & Payments', 'Cloud & Hosting Services', 'Data & Analytics', 'AI & Automation Services', 'Cyber Café & Business Centre', 'Printing & Signage', 'Animation & Motion Graphics', 'Podcast & Audio Production', 'Game Development', 'Drone Services', 'Broadcasting & Radio', 'Call Centre & BPO'],
  },
  {
    group: 'Health & Wellness',
    items: ['Hospital & Clinic', 'Pharmacy', 'Dental Care', 'Veterinary Services', 'Fitness & Gym', 'Spa & Beauty', 'Salon / Barber', 'Wellness & Therapy', 'Medical Laboratory', 'Optician', 'Physiotherapy & Rehab', 'Nutrition & Diet Consultation', 'Maternity & Birth Centre', 'Eye Clinic', 'Diagnostic Imaging', 'Mental Health & Counselling', 'Herbal & Traditional Medicine', 'Home Care & Nursing', 'Ambulance & Emergency Services', 'Dialysis Centre', 'Medical Equipment Supplier', 'Chiropractic & Osteopathy'],
  },
  {
    group: 'Professional Services',
    items: ['Legal Services', 'Accounting & Tax', 'Consulting', 'Financial Services', 'Money Transfer / Mobile Money Agent', 'Insurance', 'Real Estate', 'Recruitment & HR', 'Business Coaching', 'Microfinance & SACCO', 'Immigration & Visa Services', 'Translation & Interpretation', 'Notary & Documentation', 'Auditing Services', 'Market Research', 'Public Relations', 'Architecture & Design', 'Surveying & Valuation', 'Procurement & Supply', 'Customs Brokerage & Clearing', 'Investment & Wealth Management', 'Trademark & IP Services'],
  },
  {
    group: 'Trades & Industry',
    items: ['Construction', 'Manufacturing', 'Automotive', 'Car Dealership', 'Gadget & Device Repair', 'Logistics & Transport', 'Import/Export & Trading', 'Agriculture', 'Energy & Utilities', 'Cleaning Services', 'Car Wash & Detailing', 'Auto Electrician & Panel Beating', 'Tyre & Vulcanizer', 'Towing & Recovery', 'Car Rental', 'Welders & Fabrication', 'Roofing & Building Works', 'Generator Sales & Repair', 'Borehole Drilling & Water Works', 'Block Industry & Cement', 'Steel & Metal Works', 'Printing Press', 'Packaging & Labelling', 'Textile Manufacturing', 'Food Processing', 'Chemical & Industrial Supplies', 'Mining & Quarry', 'Oil & Gas Services', 'Recycling & Waste Management', 'Aluminium & Glass Works'],
  },
  {
    group: 'Home & Personal Services',
    items: ['Laundry & Dry Cleaning', 'House Cleaning', 'Fumigation & Pest Control', 'Interior Decoration', 'Furniture Maker / Carpentry', 'Painting & POP Ceiling', 'Tiling & Flooring', 'Electrical Services', 'Plumbing Services', 'CCTV & Security Installation', 'Solar Installation', 'Appliance Repair', 'Aluminium Windows & Doors', 'Curtains & Blinds', 'Landscaping & Gardening', 'Swimming Pool Services', 'Home Renovation', 'Upholstery & Refurbishing', 'Water Treatment & Purification', 'Inverter & Battery Services', 'Air Conditioning & Refrigeration', 'Satellite & Cable Installation'],
  },
  {
    group: 'Education & Community',
    items: ['School & Education', 'Training & Tutoring', 'Childcare', 'Non-profit & NGO', 'Religious Organization', 'Computer & Tech Training', 'Music School', 'Language School', 'Driving School', 'International School', 'University & College', 'Vocational & Skills Training', 'Exam Preparation Centre', 'Library & Study Centre', 'Special Needs Education', 'Study Abroad & Scholarships', 'Community Association', 'Cooperative Society', 'Sports Academy'],
  },
  {
    group: 'Arts & Entertainment',
    items: ['Entertainment', 'Music & Nightlife', 'Sports & Recreation', 'Art & Design', 'Travel & Tourism', 'DJ & MC', 'Event Rentals & Equipment', 'Cinema & Theatre', 'Event Venue & Hall', 'Comedy & Live Performance', 'Gaming & Esports Centre', 'Betting & Lottery', 'Football Viewing Centre', 'Amusement Park & Play Centre', 'Art Gallery', 'Museum & Heritage Site', 'Talent & Modelling Agency', 'Film & Video Production'],
  },
  {
    group: 'Fashion & Beauty',
    items: ['Tailor & Fashion Designer', 'Fabric Store', 'Footwear & Bags', 'Wig & Hair Extensions', 'Nail Studio', 'Perfume & Cosmetics Store', 'Makeup Artist', 'Gele & Aso-Oke Styling', 'Bridal & Wedding Services', 'Shoe Repair & Cobbler', 'Leather Works', 'Uniform & Corporate Wear', 'Skincare Clinic', 'Jewellery Making', 'Personal Styling & Shopping'],
  },
  {
    group: 'Local & Everyday Business',
    items: ['Hair Braiding Studio', 'Key Cutting & Locksmith', 'Watch & Jewellery Repair', 'Motorcycle & Bicycle Repair', 'Palm Oil & Local Produce Seller', 'Firewood & Charcoal Supply', 'Gas Refill Station', 'POS & Agent Banking', 'Bureau de Change', 'Recharge Card & Data Vendor', 'Photocopy & Printing Kiosk', 'Local Market Stall', 'Water Vendor', 'Roadside Mechanic', 'Sewing & Alterations', 'Barbing Kiosk', 'Laundry Kiosk'],
  },
  {
    group: 'Logistics & Mobility',
    items: ['Courier & Dispatch', 'Moving & Haulage', 'Freight Forwarding', 'Shipping & Customs Agency', 'Airline & Flight Booking', 'Ride-Hailing & Taxi', 'Keke & Okada Services', 'Truck & Heavy Haulage', 'Warehousing & Storage', 'Last-Mile Delivery', 'Bus & Interstate Transport', 'Cold Chain Logistics', 'Vehicle Tracking & Telematics'],
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
