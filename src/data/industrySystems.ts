// The NowOpen "industry operating systems" taxonomy — the source of truth for
// the /platform page and a reference map for building per-industry features.
//
// The thesis: NowOpen isn't one generic business profile. Each category gets a
// tailored system of features so it feels purpose-built for that industry —
// which is what makes the platform hard to replicate. This file captures the
// full feature map; the live product ships these progressively (see
// data/categoryFeatures.ts for the modules already wired into profiles).
//
// Each industry lists the BUSINESS_CATEGORIES (data/categories.ts) its system
// powers. Both directions are validated in DEV + tests, so the platform page
// can never drift from the categories the product actually ships.

import type { LucideIcon } from 'lucide-react';
import {
  Building2, UtensilsCrossed, BedDouble, Car, CarFront, Stethoscope, Pill, Smile,
  Sparkles, Scissors, Shirt, ShoppingBag, Clapperboard, PenTool, Camera, Video,
  Music, PartyPopper, Bus, Plane, GraduationCap, BookOpen, Scale, HardHat,
  Sprout, Factory, Dumbbell, Landmark, Building, Wrench,
  Radio, CalendarCheck, Megaphone, BadgeCheck, MessagesSquare, Store, BarChart3,
  Network, Palette, Home, Truck, Laptop,
} from 'lucide-react';
import { BUSINESS_CATEGORIES } from './categories';

/* ------------------------------------------------ the 10 NowOpen pillars ---- */

export interface Pillar {
  name: string;
  tagline: string;
  icon: LucideIcon;
  /** One-line outcome for businesses — shown on the /platform pillar deep-dive. */
  benefit: string;
  /** What the engine actually does — the feature list behind each capability. */
  features: string[];
}

export const PILLARS: Pillar[] = [
  {
    name: 'NowOpen Live', icon: Radio,
    tagline: 'Livestream launches, tours, demos, classes, worship and events straight from a profile.',
    benefit: 'Broadcast live to customers with zero extra software — launches, tours, classes and worship go out straight from a profile.',
    features: ['Profile livestream', 'Live launches & tours', 'Live classes & worship', 'Replay & archive', 'Viewer engagement', 'Live selling'],
  },
  {
    name: 'NowOpen Book', icon: CalendarCheck,
    tagline: 'One booking engine for appointments, reservations, consultations, inspections and rentals.',
    benefit: 'One booking engine powers every industry — appointments, reservations, inspections and rentals, with reminders built in.',
    features: ['Appointments', 'Reservations', 'Inspections & viewings', 'Rentals & date ranges', 'Class & session signup', 'Reminders & rescheduling'],
  },
  {
    name: 'NowOpen Promote', icon: Megaphone,
    tagline: 'Book billboards, screens, radio, TV, influencers and creative production from one dashboard.',
    benefit: 'Advertise across billboards, screens, radio, TV and social from one dashboard — no media agency needed.',
    features: ['Billboard & OOH', 'Digital screens', 'Radio & TV', 'Influencer booking', 'Creative production', 'Campaign analytics'],
  },
  {
    name: 'NowOpen Verify', icon: BadgeCheck,
    tagline: 'Multi-level verification for businesses, properties, professionals, documents and ad inventory.',
    benefit: 'Multi-level verification builds the trust that turns visitors into paying customers.',
    features: ['Verified businesses', 'Verified professionals', 'Verified properties', 'Document verification', 'Ad inventory checks', 'Trust badges'],
  },
  {
    name: 'NowOpen Connect', icon: MessagesSquare,
    tagline: 'Secure messaging, enquiries, quotations, file sharing and negotiation between buyer and seller.',
    benefit: 'Buyers and sellers talk securely — enquiries, quotes, files and negotiation without leaving the platform.',
    features: ['Secure messaging', 'Enquiries & leads', 'Quotes & proposals', 'File sharing', 'Negotiation', 'In-app notifications'],
  },
  {
    name: 'NowOpen AI', icon: Sparkles,
    tagline: 'AI search, recommendations, a business assistant, quote drafting and content generation.',
    benefit: 'AI works the platform for you — search, recommendations, a business assistant and content that writes itself.',
    features: ['AI search', 'Smart recommendations', 'Business assistant', 'Quote drafting', 'Content generation', 'AI analytics'],
  },
  {
    name: 'NowOpen Marketplace', icon: Store,
    tagline: 'Sell products, services, digital assets, event tickets and subscriptions from one storefront.',
    benefit: 'Sell products, services, tickets and subscriptions from one storefront with payments built in.',
    features: ['Product storefront', 'Services & packages', 'Event tickets', 'Subscriptions', 'Payments', 'Digital downloads'],
  },
  {
    name: 'NowOpen Insights', icon: BarChart3,
    tagline: 'Views, enquiries, bookings, campaign performance, demographics and conversion metrics.',
    benefit: 'Know exactly what works — every view, enquiry and booking is measured automatically.',
    features: ['Profile analytics', 'Enquiry tracking', 'Booking metrics', 'Campaign performance', 'Demographics', 'Conversion funnel'],
  },
  {
    name: 'NowOpen Network', icon: Network,
    tagline: 'B2B discovery, partnerships, supplier matching and referral opportunities.',
    benefit: 'Find partners, suppliers and referrals — the platform doubles as your business network.',
    features: ['B2B discovery', 'Partnership matching', 'Supplier matching', 'Referrals', 'Collaboration', 'Wholesale leads'],
  },
  {
    name: 'NowOpen Studio', icon: Palette,
    tagline: 'Order branding, design, motion, photography, video and advertising directly on the platform.',
    benefit: 'Order branding, design and production directly on the platform — or generate it yourself in seconds.',
    features: ['Brand kits', 'Graphic design', 'Motion & video', 'Photography', 'Advertising creative', 'On-platform ordering'],
  },
];

/* ---------------------------------------------------- per-industry systems -- */

export interface FeatureGroup {
  label: string;
  features: string[];
}

export interface IndustrySystem {
  slug: string;
  name: string;
  icon: LucideIcon;
  accent: string; // tailwind gradient stops, e.g. "from-blue-500 to-indigo-600"
  tagline: string;
  groups: FeatureGroup[];
  /** BUSINESS_CATEGORIES this industry system powers (validated in DEV + tests) */
  categories: string[];
}

export const INDUSTRIES: IndustrySystem[] = [
  {
    slug: 'real-estate', name: 'Real Estate', icon: Building2, accent: 'from-blue-500 to-indigo-600',
    tagline: 'A full property portal on every agent’s profile.',
    categories: ['Real Estate', 'Surveying & Valuation'],
    groups: [
      { label: 'Core', features: ['Property listings', 'Featured properties', 'Virtual tours', '360° walkthrough', 'Video tours', 'Property gallery', 'Floor plans', 'Mortgage calculator', 'Property map', 'Nearby schools', 'Nearby hospitals', 'Nearby businesses'] },
      { label: 'Booking', features: ['Book inspection', 'Schedule viewing', 'WhatsApp agent', 'Live video viewing', 'Apply for rent', 'Reserve property'] },
      { label: 'Trust', features: ['Verified agent', 'Verified property', 'Ownership documents', 'Property history', 'Recently sold', 'Similar properties'] },
      { label: 'Premium', features: ['Drone videos', 'Live open house', 'Investment calculator', 'Rental yield calculator'] },
    ],
  },
  {
    slug: 'restaurants', name: 'Restaurants', icon: UtensilsCrossed, accent: 'from-orange-500 to-red-600',
    tagline: 'Menu, ordering, reservations and a live kitchen — in one place.',
    categories: ['Restaurant', 'Fast Food', 'Café & Bakery', 'Bar & Lounge', 'Catering', 'Juice & Smoothie Bar', 'Canteen & Cafeteria'],
    groups: [
      { label: 'Menu', features: ['Digital menu', 'Categories', 'Daily specials', 'Recommended meals', 'Drinks', 'Desserts'] },
      { label: 'Ordering', features: ['Add to cart', 'Delivery', 'Pickup', 'Reserve table', 'Book event', 'Catering request', 'Bulk / wholesale orders'] },
      { label: 'Customer', features: ['Reviews', 'Ratings', 'Wait time', 'Live queue', 'Loyalty points'] },
      { label: 'Premium', features: ['Kitchen live stream', 'Chef stories', 'Daily live cooking'] },
    ],
  },
  {
    slug: 'hotels', name: 'Hotels', icon: BedDouble, accent: 'from-teal-500 to-cyan-600',
    tagline: 'Rooms, availability and amenities with instant booking.',
    categories: ['Hotel & Lodging', 'Guesthouse & Short-let / B&B', 'Serviced Apartments', 'Resort'],
    groups: [
      { label: 'Rooms', features: ['Available rooms', 'Room types', 'Prices', 'Amenities', 'Photos', '360° tour'] },
      { label: 'Booking', features: ['Instant booking', 'Check availability', 'Airport pickup', 'Event hall booking', 'Restaurant reservation'] },
      { label: 'Extras', features: ['Spa', 'Gym', 'Swimming pool', 'Conference rooms'] },
    ],
  },
  {
    slug: 'car-dealers', name: 'Car Dealers', icon: Car, accent: 'from-slate-600 to-gray-800',
    tagline: 'Full inventory with the details buyers actually ask for.',
    categories: ['Car Dealership'],
    groups: [
      { label: 'Inventory', features: ['Cars', 'Bikes', 'Trucks'] },
      { label: 'Details', features: ['Mileage', 'Accident history', 'VIN', 'Fuel', 'Transmission', 'Engine'] },
      { label: 'Customer', features: ['Book test drive', 'Trade-in', 'Finance calculator'] },
    ],
  },
  {
    slug: 'car-rentals', name: 'Car Rentals', icon: CarFront, accent: 'from-emerald-500 to-teal-600',
    tagline: 'Book a car in minutes — driver, insurance and live tracking included.',
    categories: ['Car Rental'],
    groups: [
      { label: 'Fleet & booking', features: ['Available cars', 'Instant booking', 'Date-range rentals', 'Driver included', 'Airport pickup', 'Insurance', 'GPS', 'Live tracking'] },
    ],
  },
  {
    slug: 'hospitals', name: 'Hospitals & Clinics', icon: Stethoscope, accent: 'from-sky-500 to-blue-600',
    tagline: 'Departments, doctors and appointments with telemedicine built in.',
    categories: ['Hospital & Clinic', 'Dental Care', 'Veterinary Services', 'Medical Laboratory', 'Optician', 'Physiotherapy & Rehab', 'Nutrition & Diet Consultation', 'Wellness & Therapy', 'Maternity & Birth Centre', 'Eye Clinic', 'Diagnostic Imaging', 'Mental Health & Counselling', 'Home Care & Nursing', 'Ambulance & Emergency Services', 'Dialysis Centre'],
    groups: [
      { label: 'Services', features: ['Departments', 'Doctors', 'Specialists', 'Veterinary care', 'Emergency'] },
      { label: 'Booking', features: ['Book appointment', 'Book a test', 'Eye tests', 'Telemedicine', 'Video consultation', 'Home visits'] },
      { label: 'Patients', features: ['Laboratory', 'Scan results', 'Pharmacy', 'Physiotherapy & rehab', 'Nutrition plans', 'Wellness & therapy', 'Health packages'] },
    ],
  },
  {
    slug: 'pharmacy', name: 'Pharmacy', icon: Pill, accent: 'from-green-500 to-emerald-600',
    tagline: 'Prescriptions, delivery and a pharmacist a tap away.',
    categories: ['Pharmacy', 'Herbal & Traditional Medicine', 'Medical Equipment Supplier'],
    groups: [
      { label: 'Core', features: ['Medicines', 'Prescription upload', 'Delivery', 'Refill reminder', 'Pharmacist chat'] },
    ],
  },
  {
    slug: 'dental', name: 'Dental Clinics', icon: Smile, accent: 'from-cyan-500 to-sky-600',
    tagline: 'From cleanings to cosmetics, booked online with a smile gallery.',
    categories: ['Dental Care'],
    groups: [
      { label: 'Core', features: ['Book cleaning', 'Cosmetic dentistry', 'Braces', 'Implants', 'Smile gallery'] },
    ],
  },
  {
    slug: 'beauty-salon', name: 'Beauty Salon', icon: Sparkles, accent: 'from-pink-500 to-rose-600',
    tagline: 'Styles, stylists and prices — book or request home service.',
    categories: ['Spa & Beauty', 'Nail Studio', 'Wig & Hair Extensions', 'Perfume & Cosmetics Store', 'Cosmetics & Beauty Supply', 'Makeup Artist', 'Gele & Aso-Oke Styling', 'Skincare Clinic'],
    groups: [
      { label: 'Showcase', features: ['Hairstyles', 'Nails', 'Wigs & extensions', 'Perfume & cosmetics', 'Gallery', 'Price list', 'Stylists'] },
      { label: 'Booking', features: ['Choose stylist', 'Book appointment', 'Home visits'] },
    ],
  },
  {
    slug: 'barbers', name: 'Barbers', icon: Scissors, accent: 'from-zinc-600 to-neutral-800',
    tagline: 'Cuts, queue status and walk-in availability in real time.',
    categories: ['Salon / Barber', 'Hair Braiding Studio', 'Barbing Kiosk'],
    groups: [
      { label: 'Core', features: ['Haircuts', 'Beard', 'Braids', 'VIP lounge', 'Queue status', 'Walk-in available'] },
    ],
  },
  {
    slug: 'fashion', name: 'Fashion', icon: Shirt, accent: 'from-fuchsia-500 to-purple-600',
    tagline: 'Catalog, custom measurement and live runway shows.',
    categories: ['Fashion & Apparel', 'Tailor & Fashion Designer', 'Jewellery Making', 'Personal Styling & Shopping'],
    groups: [
      { label: 'Catalog', features: ['Catalog', 'Size guide', 'Fabric types', 'Custom measurement', 'New collection'] },
      { label: 'Booking & live', features: ['Book fitting', 'Fittings & measurements', 'Bespoke orders', 'Fashion show live'] },
    ],
  },
  {
    slug: 'retail', name: 'Retail Shops', icon: ShoppingBag, accent: 'from-amber-500 to-orange-600',
    tagline: 'A storefront with inventory, flash sales and same-day delivery.',
    categories: ['Retail Store', 'Supermarket', 'Grocery / Mini-Mart', 'Electronics', 'Jewelry & Accessories', 'Furniture & Home', 'Online Store / E-commerce', 'Boutique', 'Phone & Gadget Store', 'Bookstore & Stationery', 'Gift & Souvenir Shop', 'Spare Parts Store', 'Provision Store', 'Toy & Baby Store', 'Sports & Fitness Equipment', 'Musical Instruments', 'Pet Shop & Supplies', 'Hardware Store', 'Plastics & Household Goods', 'Thrift & Second-hand (Okrika)', 'Wholesale & Distribution', 'Duty-Free & Travel Retail', 'Local Market Stall'],
    groups: [
      { label: 'Core', features: ['Products', 'Inventory', 'Coupons', 'Flash sales', 'Same-day delivery', 'Wishlist'] },
    ],
  },
  {
    slug: 'creative-agencies', name: 'Creative Agencies', icon: Clapperboard, accent: 'from-violet-500 to-indigo-600',
    tagline: 'Where NowOpen is truly unique — portfolio, briefs and live production.',
    categories: ['Digital Marketing', 'Media & Publishing', 'Web & App Development', 'Printing & Signage', 'Animation & Motion Graphics', 'Podcast & Audio Production', 'Broadcasting & Radio', 'Public Relations', 'Talent & Modelling Agency'],
    groups: [
      { label: 'Portfolio', features: ['Motion graphics', 'Branding', 'UI design', 'Photography', 'Animation', 'Commercials'] },
      { label: 'Services', features: ['Instant quote', 'Book discovery call', 'Upload brief', 'Timeline', 'Team members'] },
      { label: 'Media', features: ['Live production', 'Behind the scenes', 'Case studies'] },
    ],
  },
  {
    slug: 'designers', name: 'Designers', icon: PenTool, accent: 'from-rose-500 to-pink-600',
    tagline: 'Portfolios that plug into Behance, Dribbble and Figma.',
    categories: ['Art & Design', 'Art Gallery'],
    groups: [
      { label: 'Core', features: ['Portfolio', 'Behance', 'Dribbble', 'Figma preview', 'Book consultation'] },
    ],
  },
  {
    slug: 'photographers', name: 'Photographers', icon: Camera, accent: 'from-indigo-500 to-blue-600',
    tagline: 'Genres, packages and a bookable availability calendar.',
    categories: ['Photography & Video', 'Drone Services'],
    groups: [
      { label: 'Genres', features: ['Wedding', 'Product', 'Portrait', 'Events'] },
      { label: 'Booking', features: ['Packages', 'Availability calendar', 'Book shoot'] },
    ],
  },
  {
    slug: 'videographers', name: 'Videographers', icon: Video, accent: 'from-purple-500 to-fuchsia-600',
    tagline: 'Reels, kit and live streaming for productions of any size.',
    categories: ['Photography & Video', 'Media & Publishing', 'Film & Video Production'],
    groups: [
      { label: 'Core', features: ['Portfolio', 'Equipment', 'Drone', 'Live streaming', 'Cinema reel'] },
    ],
  },
  {
    slug: 'musicians', name: 'Musicians', icon: Music, accent: 'from-red-500 to-rose-600',
    tagline: 'Music, shows and merch — bookable for performances.',
    categories: ['Music & Nightlife', 'Entertainment', 'Comedy & Live Performance'],
    groups: [
      { label: 'Core', features: ['Songs', 'Albums', 'Upcoming shows', 'Book performance', 'Merch store'] },
    ],
  },
  {
    slug: 'event-vendors', name: 'Event Vendors', icon: PartyPopper, accent: 'from-yellow-500 to-orange-600',
    tagline: 'Every vendor for the day, booked as one bundle.',
    categories: ['Event Planning', 'Event Venue & Hall', 'Bridal & Wedding Services'],
    groups: [
      { label: 'Vendors', features: ['Decorations', 'Catering', 'MC', 'DJ', 'Photographer', 'Venue'] },
      { label: 'Booking', features: ['Bundle booking'] },
    ],
  },
  {
    slug: 'transport', name: 'Transport', icon: Bus, accent: 'from-blue-500 to-sky-600',
    tagline: 'Schedules, rides and cargo tracking from one profile.',
    categories: ['Logistics & Transport', 'Ride-Hailing & Taxi', 'Keke & Okada Services', 'Truck & Heavy Haulage', 'Bus & Interstate Transport', 'Vehicle Tracking & Telematics'],
    groups: [
      { label: 'Core', features: ['Bus schedule', 'Ride booking', 'Fleet', 'Cargo tracking'] },
    ],
  },
  {
    slug: 'travel-agencies', name: 'Travel Agencies', icon: Plane, accent: 'from-cyan-500 to-blue-600',
    tagline: 'Packages, visas, flights and hotels in one booking flow.',
    categories: ['Travel & Tourism', 'Immigration & Visa Services', 'Study Abroad & Scholarships', 'Museum & Heritage Site', 'Airline & Flight Booking'],
    groups: [
      { label: 'Core', features: ['Holiday packages', 'Visa assistance', 'Flight booking', 'Hotel booking', 'Insurance'] },
    ],
  },
  {
    slug: 'schools', name: 'Schools', icon: GraduationCap, accent: 'from-indigo-500 to-violet-600',
    tagline: 'Admissions, fees and a student portal built in.',
    categories: ['School & Education', 'Childcare', 'International School', 'University & College', 'Library & Study Centre', 'Special Needs Education'],
    groups: [
      { label: 'Core', features: ['Admissions', 'Courses', 'Teachers', 'Calendar', 'Fees', 'Student portal'] },
    ],
  },
  {
    slug: 'training', name: 'Training Institutes', icon: BookOpen, accent: 'from-emerald-500 to-green-600',
    tagline: 'Courses, certificates and live online classes.',
    categories: ['Training & Tutoring', 'Computer & Tech Training', 'Music School', 'Language School', 'Driving School', 'Business Coaching', 'Vocational & Skills Training', 'Exam Preparation Centre'],
    groups: [
      { label: 'Core', features: ['Courses', 'Certificates', 'Instructors', 'Live classes', 'Online learning'] },
      { label: 'Booking', features: ['Book a class', 'Book a lesson', 'Coaching sessions'] },
    ],
  },
  {
    slug: 'lawyers', name: 'Lawyers', icon: Scale, accent: 'from-slate-600 to-blue-800',
    tagline: 'Practice areas, secure documents and consultations.',
    categories: ['Legal Services', 'Notary & Documentation', 'Trademark & IP Services'],
    groups: [
      { label: 'Core', features: ['Practice areas', 'Book consultation', 'Case updates', 'Secure documents'] },
    ],
  },
  {
    slug: 'construction', name: 'Construction', icon: HardHat, accent: 'from-amber-500 to-yellow-600',
    tagline: 'Projects, teams and live progress updates.',
    categories: ['Construction', 'Roofing & Building Works', 'Building Materials Store', 'Architecture & Design', 'Borehole Drilling & Water Works', 'Block Industry & Cement', 'Aluminium & Glass Works', 'Aluminium Windows & Doors'],
    groups: [
      { label: 'Core', features: ['Projects', 'Equipment', 'Team', 'Materials', 'Progress updates'] },
      { label: 'Booking', features: ['Request a quote', 'Book a consultation'] },
    ],
  },
  {
    slug: 'agriculture', name: 'Agriculture', icon: Sprout, accent: 'from-green-500 to-lime-600',
    tagline: 'Produce, machinery, buyers and export — farm to market.',
    categories: ['Agriculture', 'Palm Oil & Local Produce Seller', 'Produce / Fruit & Veg Market', 'Agro Inputs & Seedlings'],
    groups: [
      { label: 'Core', features: ['Produce', 'Farm tours', 'Machinery', 'Buyers', 'Export'] },
    ],
  },
  {
    slug: 'manufacturing', name: 'Manufacturing', icon: Factory, accent: 'from-zinc-600 to-slate-800',
    tagline: 'Products, certifications and wholesale ordering.',
    categories: ['Manufacturing', 'Import/Export & Trading', 'Welders & Fabrication', 'Water Factory & Sachet Water', 'Procurement & Supply', 'Steel & Metal Works', 'Printing Press', 'Packaging & Labelling', 'Textile Manufacturing', 'Food Processing', 'Chemical & Industrial Supplies', 'Mining & Quarry'],
    groups: [
      { label: 'Core', features: ['Products', 'Factory tour', 'Certifications', 'Wholesale orders'] },
    ],
  },
  {
    slug: 'fitness', name: 'Fitness', icon: Dumbbell, accent: 'from-orange-500 to-amber-600',
    tagline: 'Memberships, trainers, live classes and plans.',
    categories: ['Fitness & Gym', 'Sports & Recreation', 'Sports Academy'],
    groups: [
      { label: 'Core', features: ['Membership', 'Trainers', 'Live classes', 'Workout plans', 'Nutrition'] },
    ],
  },
  {
    slug: 'finance', name: 'Finance', icon: Landmark, accent: 'from-blue-600 to-indigo-700',
    tagline: 'Loans, insurance, savings and financial consultation.',
    categories: ['Financial Services', 'Insurance', 'Microfinance & SACCO', 'Money Transfer / Mobile Money Agent', 'Accounting & Tax', 'Consulting', 'Recruitment & HR', 'Fintech & Payments', 'Auditing Services', 'Market Research', 'Investment & Wealth Management', 'Cooperative Society', 'POS & Agent Banking', 'Bureau de Change'],
    groups: [
      { label: 'Core', features: ['Loans', 'Insurance', 'Investment', 'Savings', 'Financial consultation', 'Accounting & tax', 'Money transfer & mobile money', 'Consulting & advisory', 'Recruitment & HR'] },
    ],
  },
  {
    slug: 'government', name: 'Government', icon: Building, accent: 'from-slate-500 to-gray-700',
    tagline: 'Digital forms, payments, appointments and public notices.',
    categories: ['Non-profit & NGO', 'Religious Organization', 'Energy & Utilities', 'Oil & Gas Services', 'Community Association'],
    groups: [
      { label: 'Core', features: ['Services', 'Digital forms', 'Payments', 'Appointments', 'Public notices', 'Membership', 'Donations'] },
    ],
  },
  {
    slug: 'service-providers', name: 'Service Providers', icon: Wrench, accent: 'from-teal-600 to-emerald-700',
    tagline: 'Plumbers, electricians, cleaners & technicians — booked with live ETA.',
    categories: ['Cleaning Services', 'House Cleaning', 'Fumigation & Pest Control', 'Electrical Services', 'Plumbing Services', 'Solar Installation', 'Key Cutting & Locksmith', 'Cyber Café & Business Centre', 'Translation & Interpretation', 'Recycling & Waste Management', 'Water Treatment & Purification', 'Satellite & Cable Installation', 'Photocopy & Printing Kiosk'],
    groups: [
      { label: 'Core', features: ['Instant booking', 'Quotes & estimates', 'Home visits', 'Emergency call', 'Live ETA', 'Reviews', 'Pricing', 'Availability'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // Round-8 additions: the everyday African economy — tailors, home services,
  // repairs, couriers, food vendors and local trades each get their own system.
  // ---------------------------------------------------------------------------
  {
    slug: 'tailors', name: 'Tailors & Fashion Designers', icon: Shirt, accent: 'from-pink-500 to-fuchsia-600',
    tagline: 'Fittings, measurements and made-to-order with a storefront.',
    categories: ['Tailor & Fashion Designer', 'Fabric Store', 'Footwear & Bags', 'Leather Works', 'Uniform & Corporate Wear', 'Sewing & Alterations'],
    groups: [
      { label: 'Catalog', features: ['Custom styles', 'Size guide', 'Fabric library', 'Lookbook', 'Bespoke orders'] },
      { label: 'Booking & shop', features: ['Book a fitting', 'Fittings & measurements', 'Made-to-order', 'Add to cart', 'Home delivery'] },
      { label: 'Premium', features: ['Fashion show live', 'Behind the seams'] },
    ],
  },
  {
    slug: 'home-services', name: 'Home & Personal Services', icon: Home, accent: 'from-cyan-600 to-teal-700',
    tagline: 'Laundry, cleaning, décor and tradespeople — visited on your schedule.',
    categories: ['Laundry & Dry Cleaning', 'Interior Decoration', 'Furniture Maker / Carpentry', 'Painting & POP Ceiling', 'Tiling & Flooring', 'Appliance Repair', 'CCTV & Security Installation', 'Curtains & Blinds', 'Landscaping & Gardening', 'Swimming Pool Services', 'Home Renovation', 'Upholstery & Refurbishing', 'Laundry Kiosk'],
    groups: [
      { label: 'Booking', features: ['Quotes & estimates', 'Home visits', 'Request pickup', 'Book a service', 'Availability'] },
      { label: 'Services', features: ['Laundry & dry cleaning', 'Interior decoration', 'Furniture making', 'Painting & POP ceiling', 'Tiling & flooring', 'Appliance repair', 'CCTV & security installation'] },
      { label: 'Laundry', features: ['Wash & fold', 'Dry cleaning', 'Pickup & delivery', 'Subscription plans'] },
      { label: 'Trust', features: ['Licensed pros', 'Live ETA', 'Reviews', 'Guaranteed work'] },
    ],
  },
  {
    slug: 'repairs', name: 'Repairs & Vehicle Services', icon: Wrench, accent: 'from-zinc-600 to-slate-800',
    tagline: 'Repairs, washes and roadside help — quoted and booked online.',
    categories: ['Car Wash & Detailing', 'Auto Electrician & Panel Beating', 'Tyre & Vulcanizer', 'Towing & Recovery', 'Generator Sales & Repair', 'Gadget & Device Repair', 'Watch & Jewellery Repair', 'Motorcycle & Bicycle Repair', 'Automotive', 'Inverter & Battery Services', 'Air Conditioning & Refrigeration', 'Shoe Repair & Cobbler', 'Roadside Mechanic'],
    groups: [
      { label: 'Vehicle', features: ['Car wash & detailing', 'Auto electrician & panel beating', 'Tyres & vulcanizer', 'Towing & recovery', 'Roadside help', 'Warranty flow'] },
      { label: 'Repairs', features: ['Book a repair', 'Quotes & estimates', 'Generator repair', 'Gadget repair', 'Watch & jewellery repair', 'Motorcycle & bicycle repair'] },
    ],
  },
  {
    slug: 'courier', name: 'Courier & Delivery', icon: Truck, accent: 'from-blue-600 to-indigo-700',
    tagline: 'Packages, haulage and cross-border trade with live tracking.',
    categories: ['Courier & Dispatch', 'Moving & Haulage', 'Import/Export & Trading', 'Customs Brokerage & Clearing', 'Freight Forwarding', 'Shipping & Customs Agency', 'Warehousing & Storage', 'Last-Mile Delivery', 'Cold Chain Logistics'],
    groups: [
      { label: 'Core', features: ['Request pickup', 'Package tracking', 'Same-day delivery', 'Fleet & riders', 'Moving & haulage', 'Import / export', 'Quotes & estimates'] },
    ],
  },
  {
    slug: 'food-vendors', name: 'Food Vendors & Street Food', icon: UtensilsCrossed, accent: 'from-amber-500 to-red-600',
    tagline: 'Everyday food businesses — quick ordering and pickup built in.',
    categories: ['Local Food Vendor', 'Food Truck', 'Suya & Grill', 'Shawarma & Kebab', 'Bakery & Pastry', 'Frozen Food Store', 'Meat & Poultry Shop', 'Produce / Fruit & Veg Market', 'Palm Oil & Local Produce Seller', 'Firewood & Charcoal Supply', 'Gas Refill Station', 'Catering', 'Buka / Local Eatery', 'Small Chops & Snacks', 'Cold Room & Fish Depot', 'Water Vendor'],
    groups: [
      { label: 'Ordering', features: ['Quick ordering', 'Add to cart', 'Pickup', 'Delivery', 'Bulk / wholesale orders'] },
      { label: 'Menu', features: ['Daily menu', 'Specials', 'Suya & grill', 'Shawarma & kebab', 'Bakery & pastry'] },
      { label: 'Market', features: ['Fresh produce', 'Frozen food', 'Meat & poultry', 'Palm oil & local produce', 'Charcoal & firewood', 'Gas refills'] },
    ],
  },
  {
    slug: 'software-it', name: 'Software & IT', icon: Laptop, accent: 'from-indigo-500 to-blue-700',
    tagline: 'Projects, support and cybersecurity — scoped and started online.',
    categories: ['Software & IT', 'Telecommunications', 'Cybersecurity', 'IT Support & Services', 'Web & App Development', 'Cloud & Hosting Services', 'Data & Analytics', 'AI & Automation Services', 'Game Development', 'Call Centre & BPO', 'Recharge Card & Data Vendor'],
    groups: [
      { label: 'Core', features: ['Start a project', 'Web & app development', 'IT support', 'Cybersecurity', 'Managed services', 'Maintenance plans'] },
    ],
  },
  {
    slug: 'event-entertainment', name: 'Event Rentals & Entertainment', icon: PartyPopper, accent: 'from-yellow-500 to-orange-600',
    tagline: 'Hire equipment or book the act — one request, one bundle.',
    categories: ['Event Rentals & Equipment', 'DJ & MC', 'Entertainment', 'Music & Nightlife', 'Cinema & Theatre', 'Gaming & Esports Centre', 'Betting & Lottery', 'Football Viewing Centre', 'Amusement Park & Play Centre'],
    groups: [
      { label: 'Core', features: ['Rentals & hire', 'Quotes & setup', 'Book a DJ / MC', 'Acts & performances', 'Bundle booking'] },
    ],
  },

  // ---------------------------------------------------------------------------
  // Group-10 additions: the everyday African economy — vets, spas, places of
  // worship, bakeries and bars each graduate from a bundled category to their
  // own purpose-built operating system.
  // ---------------------------------------------------------------------------
  {
    slug: 'veterinary', name: 'Veterinary Clinics & Pet Care', icon: Stethoscope, accent: 'from-green-600 to-emerald-700',
    tagline: 'Consultations, vaccinations and boarding — with a pet profile built in.',
    categories: ['Veterinary Services'],
    groups: [
      { label: 'Care', features: ['Consultations', 'Vaccinations', 'Deworming', 'Surgery', 'Laboratory', 'Pet grooming', 'Boarding & kennels', 'Pet store'] },
      { label: 'Booking', features: ['Book appointment', 'Book grooming', 'Home visits', 'Emergency care'] },
      { label: 'Trust', features: ['Qualified vets', 'Verified clinic', 'Vaccination records', 'Pet profile'] },
    ],
  },
  {
    slug: 'spa-wellness', name: 'Spa & Wellness', icon: Sparkles, accent: 'from-purple-500 to-pink-600',
    tagline: 'Treatments, therapists and memberships — relaxation on your schedule.',
    categories: ['Spa & Beauty', 'Wellness & Therapy', 'Chiropractic & Osteopathy'],
    groups: [
      { label: 'Treatments', features: ['Massages', 'Facials', 'Body treatments', 'Manicure & pedicure', 'Therapy & counselling', 'Packages'] },
      { label: 'Booking', features: ['Choose therapist', 'Book appointment', 'Home visits', 'Membership plans', 'Gift vouchers'] },
      { label: 'Premium', features: ['Wellness programs', 'Spa retreats', 'Couples packages'] },
    ],
  },
  {
    slug: 'religious-organizations', name: 'Religious Organizations', icon: Building, accent: 'from-amber-500 to-yellow-600',
    tagline: 'Services, giving and live worship — a church that fits in a pocket.',
    categories: ['Religious Organization', 'Non-profit & NGO'],
    groups: [
      { label: 'Services', features: ['Service times', 'Live worship', 'Sermon archive', 'Announcements', 'Events', 'Prayer requests'] },
      { label: 'Giving', features: ['Tithes & offerings', 'Donations', 'Membership', 'Volunteer signup', 'Outreach programs'] },
      { label: 'Community', features: ['Groups & fellowships', 'Counselling', 'Youth & children', 'Marriage & ceremonies'] },
    ],
  },
  {
    slug: 'bakeries', name: 'Bakeries & Desserts', icon: ShoppingBag, accent: 'from-orange-500 to-amber-600',
    tagline: 'Fresh bakes, custom cakes and same-day delivery — straight from the oven.',
    categories: ['Bakery & Pastry', 'Café & Bakery', 'Ice Cream & Desserts'],
    groups: [
      { label: 'Menu', features: ['Fresh bakes', 'Bread & pastries', 'Cakes & custom orders', 'Desserts', 'Drinks'] },
      { label: 'Ordering', features: ['Add to cart', 'Pickup', 'Delivery', 'Custom cake request', 'Bulk orders'] },
      { label: 'Premium', features: ['Birthday packages', 'Subscription boxes', 'Catering bakes'] },
    ],
  },
  {
    slug: 'bars-lounges', name: 'Bars & Lounges', icon: Music, accent: 'from-red-500 to-rose-600',
    tagline: 'Drinks, happy hours and table reservations — the night, booked.',
    categories: ['Bar & Lounge', 'Wine & Spirits Shop'],
    groups: [
      { label: 'Menu', features: ['Drinks menu', 'Cocktails', 'Shisha', 'Happy hours', 'Food menu'] },
      { label: 'Booking', features: ['Reserve table', 'Book event', 'Private hire', 'Bottle service'] },
      { label: 'Customer', features: ['Reviews', 'Live DJ schedule', 'Events & themed nights'] },
    ],
  },
];

/* ------------------------------------------------- universal foundation ----- */

// Every profile, in every industry, stands on this shared base.
export const UNIVERSAL_FEATURES: string[] = [
  'Verified badge', 'Business story', 'Brand video', 'Cover video', 'Image gallery',
  'Services', 'Products', 'Pricing', 'FAQs', 'Reviews & ratings', 'Contact information',
  'WhatsApp integration', 'Phone call', 'Email enquiry', 'Website link',
  'Google Maps directions', 'Business hours', 'Team members', 'Branch locations',
  'Events', 'Announcements', 'Offers & promotions', 'Live chat', 'AI assistant',
  'Live broadcast', 'Portfolio', 'Blog / articles', 'Careers', 'Digital downloads',
  'Instant booking', 'Payments', 'Owner analytics', 'QR code sharing',
  'Social media links', 'Save to favorites', 'Share profile', 'Report business',
  'Verified documents', 'Business insights', 'Multi-language', 'Multi-currency',
  'Multi-category listing',
];

export function getIndustry(slug: string): IndustrySystem | undefined {
  return INDUSTRIES.find((i) => i.slug === slug);
}

if (import.meta.env.DEV) {
  const covered = new Set(INDUSTRIES.flatMap((i) => i.categories));
  for (const cat of BUSINESS_CATEGORIES) {
    if (!covered.has(cat)) {
      console.warn(`industrySystems.ts: business category "${cat}" isn't covered by any industry — add it so the /platform page stays complete.`);
    }
  }
  for (const ind of INDUSTRIES) {
    for (const cat of ind.categories) {
      if (!BUSINESS_CATEGORIES.includes(cat)) {
        console.warn(`industrySystems.ts: "${ind.name}" lists "${cat}" which is not a valid business category — check data/categories.ts stayed in sync.`);
      }
    }
  }
}
