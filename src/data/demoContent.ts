/**
 * Services and galleries for the curated demo profiles.
 *
 * ── WHAT WAS WRONG ────────────────────────────────────────────────────────
 *
 * Twenty-three industries already had purpose-built content — SAMPLE_ROOMS,
 * SAMPLE_TREATMENTS, SAMPLE_DOCTORS, SAMPLE_COURSES. Everything else fell
 * through to one hard-coded list:
 *
 *   Web Development — Custom websites and web applications — $500-$5000
 *
 * Shown on a real estate agency, a pharmacy, a bakery and a farm. Priced in
 * dollars, on a platform that quotes naira everywhere else. And the gallery was
 * three generic picsum placeholders, identical on all forty-five profiles.
 *
 * That is what makes a demo read as unfinished rather than as a business: not
 * the absence of a rating, but a butchery advertising UI/UX design.
 *
 * ── WHAT IS AND IS NOT IN HERE ────────────────────────────────────────────
 *
 * IN: services with real descriptions and naira prices, and industry-
 * appropriate photography.
 *
 * NOT IN, deliberately: reviews, ratings, customer counts, testimonials. Those
 * are on the permanent prohibition list, and they are also the WRONG way to
 * make a page look real. A well-filled page with no reviews reads as a business
 * that has just joined — completely credible. A thin page carrying 4.8 stars
 * and three five-star comments from "John Doe" reads as a lie the instant
 * anybody looks at it, and it poisons every real rating on the platform.
 *
 * ── THE IMAGES ────────────────────────────────────────────────────────────
 *
 * Pexels, which the CSP already allows and the rest of the sample data already
 * uses. Every id below is one already proven to load somewhere in this repo, so
 * a demo profile cannot ship a broken image. Pexels' licence permits commercial
 * use without attribution; nothing here is lifted from a competitor's library
 * or from a real business's own photographs.
 */

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1000`;

export interface DemoService {
  id: string;
  name: string;
  description: string;
  /** Naira, as a business would write it. Ranges where a range is honest. */
  price: string;
}

interface DemoSet {
  services: DemoService[];
  gallery: number[];
}

const svc = (rows: [string, string, string][]): DemoService[] =>
  rows.map(([name, description, price], i) => ({
    id: `demo-${i}`, name, description, price,
  }));

/**
 * Keyed by BUSINESS_CATEGORIES value, so a demo profile picks up its own
 * industry's content with no mapping table to drift.
 *
 * Only the categories that had no purpose-built set are here. The twenty-three
 * that already have one keep it — duplicating those would be two sources of
 * truth for the same page.
 */
const SETS: Record<string, DemoSet> = {
  'Real Estate': {
    services: svc([
      ['Property sales', 'Verified listings across Lagos, with documents checked before a viewing is booked.', 'Commission 5%'],
      ['Rentals & short-lets', 'Yearly rentals and serviced short-lets, inspected and photographed.', 'From ₦85,000/night'],
      ['Property inspection', 'A guided viewing with an agent, including the neighbourhood walk-through.', 'Free'],
      ['Documentation & title check', 'Survey, deed and C-of-O verification before you pay a kobo.', 'From ₦150,000'],
      ['Property management', 'Rent collection, maintenance and tenant handling for landlords abroad.', '8% of rent'],
    ]),
    gallery: [1643383, 1571460, 2062431, 1918291, 106399, 1029599],
  },

  Restaurant: {
    services: svc([
      ['Dine-in', 'Table service across two floors, with a private room for twelve.', 'À la carte'],
      ['Takeaway & delivery', 'Packed for travel and dispatched across the island within the hour.', 'From ₦1,500'],
      ['Event catering', 'Full-service catering for weddings, offices and private parties.', 'From ₦12,000/head'],
      ['Set lunch', 'Two courses and a drink, weekdays until 4pm.', '₦7,500'],
    ]),
    gallery: [5638732, 6646357, 2233729, 4871119, 1233319, 291528],
  },

  'Bakery & Pastry': {
    services: svc([
      ['Fresh bread, daily', 'Baked from 4am — agege, sourdough, wheat and butter rolls.', 'From ₦1,200'],
      ['Celebration cakes', 'Made to order, from a single tier to a five-tier wedding cake.', 'From ₦25,000'],
      ['Small chops & pastries', 'Trays for meetings, naming ceremonies and birthdays.', 'From ₦18,000/tray'],
      ['Corporate standing order', 'A weekly delivery to your office, invoiced monthly.', 'By arrangement'],
    ]),
    gallery: [96974, 67468, 4110251, 5638732, 291528],
  },

  'Bar & Lounge': {
    services: svc([
      ['Table reservations', 'Booths and terrace tables, with a minimum spend at weekends.', 'From ₦50,000'],
      ['Cocktails & spirits', 'A full bar, with a rotating list of six house cocktails.', 'From ₦4,500'],
      ['Live sessions', 'Live band on Thursdays, DJ from 10pm Friday and Saturday.', 'Entry ₦5,000'],
      ['Private hire', 'The upstairs lounge, exclusively, for up to sixty guests.', 'From ₦450,000'],
    ]),
    gallery: [1233319, 2233729, 4871119, 6646357],
  },

  'Car Dealership': {
    services: svc([
      ['Foreign-used sales', 'Inspected, duty-paid vehicles with the full service history.', 'From ₦8,500,000'],
      ['Trade-in valuation', 'Bring your current car and we value it against anything on the lot.', 'Free'],
      ['Finance & instalments', 'Arranged with partner banks, subject to their approval.', 'From 20% down'],
      ['Pre-purchase inspection', 'A full mechanical and computer diagnostic before you commit.', '₦35,000'],
      ['Registration & papers', 'Plates, insurance and customs papers handled for you.', 'From ₦120,000'],
    ]),
    gallery: [170811, 112460, 3874337, 116675, 3802510, 1592384],
  },

  Pharmacy: {
    services: svc([
      ['Prescription dispensing', 'Filled by a registered pharmacist, with a counselling note.', 'Per prescription'],
      ['Over-the-counter advice', 'Talk to the pharmacist before you buy — no appointment.', 'Free'],
      ['Blood pressure & sugar checks', 'Walk-in screening, results explained on the spot.', '₦2,000'],
      ['Repeat medication', 'A monthly refill reminder and delivery for chronic prescriptions.', 'From ₦1,500 delivery'],
      ['Baby & maternal care', 'Formula, vitamins and advice for new mothers.', 'Varies'],
    ]),
    gallery: [208541, 3683074, 3873209, 3652097, 208512, 5910953],
  },

  'Fashion & Apparel': {
    services: svc([
      ['Ready-to-wear', 'The current collection, in stock in standard sizes.', 'From ₦35,000'],
      ['Made-to-measure', 'Measured, cut and fitted — two fittings included.', 'From ₦120,000'],
      ['Bridal & occasion', 'Wedding, engagement and traditional outfits, from sketch to final fitting.', 'From ₦450,000'],
      ['Alterations', 'Taking in, letting out, hemming and repairs.', 'From ₦5,000'],
    ]),
    gallery: [1055691, 1043474, 2955376, 1926769, 6311392, 267301],
  },

  'Grocery / Mini-Mart': {
    services: svc([
      ['Everyday groceries', 'Staples, fresh produce, frozen goods and household items.', 'Shelf price'],
      ['Home delivery', 'Ordered on WhatsApp before 2pm, delivered the same day.', 'From ₦1,000'],
      ['Bulk & wholesale', 'Bags of rice, cartons and crates at trade prices.', 'On request'],
      ['Monthly food basket', 'A standing order built from your own list, invoiced monthly.', 'From ₦45,000'],
    ]),
    gallery: [618775, 2338407, 616354, 65175, 725992, 1927377],
  },

  Agriculture: {
    services: svc([
      ['Fresh produce, wholesale', 'Harvested to order for markets, restaurants and processors.', 'Per tonne'],
      ['Farm inputs & seedlings', 'Certified seed, seedlings and fertiliser with planting guidance.', 'From ₦2,500'],
      ['Off-taker contracts', 'A fixed-volume supply agreement across the season.', 'By agreement'],
      ['Agronomy visits', 'A field visit and soil assessment with a written plan.', 'From ₦40,000'],
    ]),
    gallery: [1393382, 547263, 533280, 2286776, 1300355, 2255801],
  },

  Manufacturing: {
    services: svc([
      ['Contract manufacturing', 'Your product, made to your specification, under your label.', 'Per unit, MOQ applies'],
      ['Private label', 'Formulation, packaging and labelling handled end to end.', 'From ₦1,500,000'],
      ['Packaging & fulfilment', 'Cartoning, shrink-wrap, palletising and dispatch.', 'Per pallet'],
      ['Factory tour & audit', 'Walk the line and review our certifications before you commit.', 'By appointment'],
    ]),
    gallery: [327090, 1000084, 230325, 1583884, 4239013, 4483610],
  },

  'Religious Organization': {
    services: svc([
      ['Weekly services', 'Sunday first and second service, and midweek teaching.', 'Open to all'],
      ['Weddings & naming', 'Booked through the church office, with counselling beforehand.', 'By arrangement'],
      ['Community outreach', 'Food support, school fees assistance and hospital visits.', 'Volunteer-run'],
      ['Youth & children', "Children's church during services, and a Saturday youth meeting.", 'Open to all'],
    ]),
    gallery: [1024993, 2775196, 208216, 1616096],
  },

  'Veterinary Services': {
    services: svc([
      ['Consultation', 'A full examination with the vet, including a written note.', '₦12,000'],
      ['Vaccination', 'Core and booster vaccines, with a stamped record card.', 'From ₦8,000'],
      ['Surgery & dentistry', 'Routine and emergency procedures, with overnight care.', 'From ₦45,000'],
      ['Home visits', 'For animals that travel badly, within the city.', 'From ₦20,000'],
    ]),
    gallery: [1108099, 406014, 1633522, 1108102],
  },
};

/*
 * A last-resort set, and it says what it is.
 *
 * This replaces "Web Development — $500-$5000", which appeared on a butchery.
 * A demo for an industry we have not written content for should look like a
 * profile that has not been filled in yet — which is honest, and which is also
 * what a real new business looks like on day one.
 */
const FALLBACK: DemoSet = {
  services: svc([
    ['Your first service', 'A short description of what this is and who it is for.', 'From ₦0'],
    ['Your second service', 'Businesses on NowOpen list as many as they need.', 'On request'],
    ['Your third service', 'Prices can be fixed, a range, or hidden until you ask.', 'Varies'],
  ]),
  gallery: [3184291, 3184418, 3184465],
};

export const demoServices = (category: string | null | undefined): DemoService[] =>
  (category ? SETS[category]?.services : undefined) ?? FALLBACK.services;

export const demoGallery = (category: string | null | undefined): string[] =>
  ((category ? SETS[category]?.gallery : undefined) ?? FALLBACK.gallery).map(px);

/** Categories with purpose-written content here. Used by the test. */
export const DEMO_CONTENT_CATEGORIES = Object.keys(SETS);
