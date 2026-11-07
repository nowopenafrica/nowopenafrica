// Category templates — what a business of THIS kind plausibly offers.
//
// WHAT A TEMPLATE IS, AND THE ONE THING IT IS NOT
//
// A template is a vocabulary: the services and product groups a reader would
// expect from a restaurant, a tailor, a repair shop. It is a starting point for
// a human review queue and a prompt for the owner who eventually claims the
// page — "is this you? tick what applies".
//
// It is NOT evidence. Nothing here is a statement that any particular business
// offers any particular thing, and nothing generated from it may ever be
// published as though it were. That is enforced in the database: content
// created from a template lands `content_status = 'suggested'`, and the public
// RLS policy on business_services/products/gallery refuses to return that
// status at all. See 20260921010000_content_provenance.sql.
//
// WHY KEYED BY INDUSTRY AND NOT BY CATEGORY
//
// There are 250 business categories and 42 industries, and every category is
// covered by at least one industry (asserted in categoryTemplates.test.ts). 250
// hand-written templates would rot; 42 can be kept honest. `templateFor` walks
// category → industry → template.
//
// THE SENSITIVE CATEGORIES ARE THE POINT, NOT AN EDGE CASE
//
// MEASURED: the directory is roughly 70% hospitals and schools. Those are
// exactly the categories where a wrong suggestion does real harm — "offers
// chemotherapy", "accredited by the Ministry" — so every template carries an
// explicit `forbiddenClaims` list, and the sensitive ones carry more than the
// benign ones. A template with an empty forbidden list is a template nobody has
// thought about, which is why the type requires it.

import { INDUSTRIES } from './industrySystems';

export interface TemplateFaq {
  question: string;
  /**
   * The answer, which never asserts anything about the business.
   *
   * Every templated answer points the reader at the business itself. "Contact
   * this business to confirm" is useful and true; "Yes, we offer parking" is a
   * claim NowOpen is in no position to make on somebody else's behalf.
   */
  answer: string;
}

export interface CategoryTemplate {
  /** Industry slug from industrySystems.ts. */
  industry: string;
  /** Suggested service names. A vocabulary, never an inventory. */
  services: readonly string[];
  /** Suggested product or offering GROUPS — never specific items or brands. */
  products: readonly string[];
  faqs: readonly TemplateFaq[];
  /** Profile sections worth showing for this kind of business. */
  sections: readonly string[];
  /** schema.org type, for structured data on an eligible profile. */
  schemaType: string;
  /**
   * Phrases that must never appear in generated content for this industry,
   * because they assert something only the business or a regulator can.
   */
  forbiddenClaims: readonly string[];
  /** What an honest gallery looks like here before the owner uploads anything. */
  galleryGuidance: string;
}

/**
 * Claims no template may ever produce, whatever the industry.
 *
 * These are the ones that are wrong everywhere: a price nobody quoted, a
 * guarantee nobody gave, an award nobody won.
 */
export const UNIVERSAL_FORBIDDEN_CLAIMS: readonly string[] = [
  'award-winning', 'award winning', 'certified', 'accredited', 'licensed by',
  'guaranteed', 'guarantee', 'best in', 'number one', 'no. 1', 'leading',
  'years of experience', 'established in', 'since 19', 'since 20',
  'free delivery', 'same-day delivery', 'nationwide delivery',
  '24/7', '24 hours a day', 'open 24',
  'money-back', 'refund policy', 'warranty',
  'trusted by', 'as seen on', 'partnered with',
];

const FAQ_CONTACT = 'Contact this business to confirm.';

/**
 * Templates, richest first for the industries the directory actually contains.
 *
 * An industry with no entry gets NO suggestions — `templateFor` returns null
 * and the engine produces nothing. Silence is the correct output for a
 * business nobody has written a vocabulary for; filler is not.
 */
export const CATEGORY_TEMPLATES: readonly CategoryTemplate[] = [
  {
    industry: 'hospitals',
    schemaType: 'MedicalBusiness',
    services: [
      'General consultation', 'Outpatient care', 'Diagnostic tests',
      'Laboratory services', 'Emergency care', 'Specialist referral',
      'Health screening', 'Immunisation',
    ],
    products: [],
    sections: ['About', 'Departments', 'Location', 'Contact', 'Opening hours'],
    faqs: [
      { question: 'Do I need an appointment?', answer: `Contact this facility to ask about appointments and walk-in availability. ${FAQ_CONTACT}` },
      { question: 'Which health insurance is accepted?', answer: 'Insurance arrangements vary. Ask the facility directly before your visit.' },
      { question: 'What are the visiting hours?', answer: 'Visiting hours are set by each facility. Contact them to confirm.' },
      { question: 'How do I reach the facility?', answer: 'Use the contact options on this profile for directions and enquiries.' },
    ],
    /*
     * The longest list on purpose. A wrong suggestion here is not an
     * inconvenience — somebody may travel to a hospital for treatment it does
     * not provide, or trust a qualification nobody verified.
     */
    forbiddenClaims: [
      'specialist in', 'consultant', 'surgery', 'surgeon', 'operating theatre',
      'intensive care', 'icu', 'chemotherapy', 'dialysis', 'maternity',
      'ambulance', 'emergency response', 'board-certified', 'consultant-led',
      'treats', 'cures', 'diagnosis of', 'success rate', 'accredited hospital',
      'teaching hospital', 'referral centre',
    ],
    galleryGuidance: 'No stand-in imagery. A photograph that is not this facility is worse here than no photograph.',
  },
  {
    industry: 'schools',
    schemaType: 'EducationalOrganization',
    services: [
      'Admissions enquiries', 'Academic programmes', 'Tutoring',
      'Examination preparation', 'Extracurricular activities',
      'Career guidance', 'Library access', 'Parent consultation',
    ],
    products: [],
    sections: ['About', 'Programmes', 'Admissions', 'Location', 'Contact'],
    faqs: [
      { question: 'How do I apply?', answer: `Admission processes differ by institution. ${FAQ_CONTACT}` },
      { question: 'What are the fees?', answer: 'Fees are set by the institution. Contact them directly for current figures.' },
      { question: 'What programmes are offered?', answer: 'Ask the institution for its current programme list.' },
      { question: 'When does the term start?', answer: 'Term dates vary. Contact the institution to confirm.' },
    ],
    forbiddenClaims: [
      'accredited by', 'approved by', 'ranked', 'pass rate', 'graduation rate',
      'scholarship', 'bursary', 'affiliated with', 'recognised by',
      'ministry approved', 'university of', 'degree awarding', 'curriculum',
      'ofsted', 'waec', 'neco', 'jamb approved',
    ],
    galleryGuidance: 'Only real photographs of the institution. Stock classrooms mislead parents making a decision about a child.',
  },
  {
    industry: 'restaurants',
    schemaType: 'Restaurant',
    services: ['Dine-in', 'Takeaway', 'Delivery', 'Catering', 'Event catering', 'Private dining', 'Corporate meals', 'Table reservations'],
    products: ['Rice dishes', 'Soups', 'Grills', 'Small chops', 'Drinks', 'Desserts', 'Breakfast', 'Party trays'],
    sections: ['About', 'Menu', 'Opening hours', 'Location', 'Contact'],
    faqs: [
      { question: 'Do you take reservations?', answer: `Reservation policies vary. ${FAQ_CONTACT}` },
      { question: 'Is delivery available?', answer: 'Ask the business which delivery areas it covers.' },
      { question: 'Are there vegetarian options?', answer: 'Menus change. Contact the business to ask about dietary options.' },
      { question: 'What are the opening hours?', answer: 'Hours shown on this profile are confirmed only where marked. Contact the business to be sure.' },
    ],
    forbiddenClaims: ['halal', 'kosher', 'gluten-free', 'allergen-free', 'organic', 'michelin', 'health rating', 'hygiene rating', 'no msg'],
    galleryGuidance: 'Food photography must be this kitchen\'s own. A generic plate of jollof is a picture of somebody else\'s cooking.',
  },
  {
    industry: 'fashion',
    schemaType: 'ClothingStore',
    services: ['Bespoke clothing', 'Ready-to-wear', 'Fashion styling', 'Clothing alterations', 'Bridal wear', 'Occasion wear', 'Corporate wear', 'Fashion consultation'],
    products: ['Dresses', 'Shirts', 'Trousers', 'Two-piece sets', 'Kaftans', 'Skirts', 'Accessories', 'Custom outfits'],
    sections: ['About', 'Collections', 'Sizing', 'Location', 'Contact'],
    faqs: [
      { question: 'Do you make custom pieces?', answer: `Contact this business to confirm whether bespoke work is available.` },
      { question: 'How long does an order take?', answer: 'Turnaround depends on the piece. Ask the business for a timeline.' },
      { question: 'What sizes are available?', answer: 'Ask the business about sizing and fittings.' },
      { question: 'How do I request a quote?', answer: 'Use the contact options on this profile to ask about pricing and availability.' },
    ],
    forbiddenClaims: ['designer', 'luxury', 'imported', 'authentic', 'genuine leather', 'handmade', 'exclusive', 'limited edition'],
    galleryGuidance: 'Show this label\'s own work. Another designer\'s garment under this name is somebody else\'s portfolio.',
  },
  {
    industry: 'beauty-salon',
    schemaType: 'BeautySalon',
    services: ['Hair styling', 'Haircuts', 'Hair treatment', 'Braiding', 'Natural hair care', 'Manicure and pedicure', 'Makeup services', 'Beauty consultation'],
    products: ['Hair care products', 'Styling products', 'Hair extensions', 'Wigs', 'Beauty accessories', 'Nail care products', 'Skincare products', 'Grooming products'],
    sections: ['About', 'Services', 'Opening hours', 'Location', 'Contact'],
    faqs: [
      { question: 'Do I need to book ahead?', answer: `Booking policies vary. ${FAQ_CONTACT}` },
      { question: 'How much does a service cost?', answer: 'Contact the business for current pricing.' },
      { question: 'How long does an appointment take?', answer: 'Ask the business about timings for the service you want.' },
      { question: 'Do you serve walk-ins?', answer: `${FAQ_CONTACT}` },
    ],
    /*
     * Cosmetic procedure claims are regulated in most markets and are a real
     * safety question, not a marketing one.
     */
    forbiddenClaims: ['laser', 'botox', 'filler', 'injectable', 'chemical peel', 'microblading', 'permanent', 'dermatologist', 'medical-grade', 'clinically proven', 'skin lightening', 'bleaching'],
    galleryGuidance: 'Only work done by this salon. Borrowed hair photography is the most common form of this dishonesty.',
  },
  {
    industry: 'creative-agencies',
    schemaType: 'ProfessionalService',
    services: ['Brand strategy', 'Brand identity', 'Graphic design', 'UI/UX design', 'Motion design', 'Video production', 'Advertising creative', 'Social media content'],
    products: ['Brand identity package', 'Social media design', 'Commercial video', 'Campaign creative', 'Website design', 'Presentation design', 'Product animation', 'Digital brand assets'],
    sections: ['About', 'Services', 'Portfolio', 'Contact'],
    faqs: [
      { question: 'What services do you offer?', answer: 'Ask the agency for its current service list.' },
      { question: 'How do I start a project?', answer: 'Use the contact options on this profile to send a brief.' },
      { question: 'What does a project cost?', answer: 'Pricing depends on scope. Contact the agency for a quote.' },
      { question: 'How long does a project take?', answer: `Timelines vary by project. ${FAQ_CONTACT}` },
    ],
    forbiddenClaims: ['clients include', 'worked with', 'campaign for', 'award-winning agency', 'featured in', 'agency of record'],
    galleryGuidance: 'A portfolio must be this agency\'s own work. Presenting another studio\'s campaign is the clearest possible misrepresentation.',
  },
  {
    industry: 'repairs',
    schemaType: 'AutoRepair',
    services: ['Vehicle diagnostics', 'Routine servicing', 'Engine repair', 'Bodywork and panel beating', 'Auto electrical work', 'Tyre fitting', 'Air conditioning service', 'Roadside assistance'],
    products: ['Spare parts', 'Tyres', 'Batteries', 'Lubricants and oils', 'Filters', 'Car accessories', 'Cleaning products'],
    sections: ['About', 'Services', 'Opening hours', 'Location', 'Contact'],
    faqs: [
      { question: 'Do you offer a diagnostic check?', answer: `${FAQ_CONTACT}` },
      { question: 'How much will a repair cost?', answer: 'Contact the workshop for a quote once they have seen the vehicle.' },
      { question: 'Do you work on my make of car?', answer: 'Ask the workshop which makes and models it handles.' },
      { question: 'How long will the work take?', answer: `Turnaround depends on the job. ${FAQ_CONTACT}` },
    ],
    forbiddenClaims: ['genuine parts', 'oem', 'manufacturer approved', 'authorised dealer', 'warranty', 'certified technician', 'roadworthy certificate'],
    galleryGuidance: 'Photographs of this workshop and its own completed work only.',
  },
  {
    industry: 'real-estate',
    schemaType: 'RealEstateAgent',
    services: ['Property sales', 'Property letting', 'Property management', 'Property valuation', 'Viewing arrangements', 'Tenant screening', 'Property consultation'],
    products: ['Residential properties', 'Commercial properties', 'Land', 'Short-let apartments', 'Office space', 'Serviced apartments'],
    sections: ['About', 'Listings', 'Service area', 'Contact'],
    faqs: [
      { question: 'What properties are available?', answer: 'Availability changes constantly. Contact the agent for current listings.' },
      { question: 'How do I arrange a viewing?', answer: 'Use the contact options on this profile to request a viewing.' },
      { question: 'What areas do you cover?', answer: `${FAQ_CONTACT}` },
      { question: 'What are your fees?', answer: 'Contact the agent for its fee structure.' },
    ],
    forbiddenClaims: ['registered agent', 'regulated by', 'title verified', 'c of o', 'certificate of occupancy', 'guaranteed rental', 'roi', 'return on investment', 'government approved'],
    galleryGuidance: 'Only photographs of properties this agent actually represents.',
  },
  {
    industry: 'retail',
    schemaType: 'Store',
    services: ['In-store shopping', 'Product enquiries', 'Home delivery', 'Click and collect', 'Bulk orders', 'Gift wrapping'],
    products: ['General merchandise', 'Household goods', 'Personal care', 'Packaged food', 'Stationery', 'Accessories'],
    sections: ['About', 'Products', 'Opening hours', 'Location', 'Contact'],
    faqs: [
      { question: 'Do you deliver?', answer: 'Ask the business which areas it delivers to.' },
      { question: 'What payment methods do you accept?', answer: `Payment options vary. ${FAQ_CONTACT}` },
      { question: 'Is an item in stock?', answer: 'Stock changes daily. Contact the business to check.' },
      { question: 'What are the opening hours?', answer: 'Contact the business to confirm current hours.' },
    ],
    forbiddenClaims: ['in stock', 'available now', 'cheapest', 'lowest price', 'wholesale prices', 'genuine', 'original', 'imported'],
    galleryGuidance: 'Photographs of this shop and the stock it actually carries.',
  },
  {
    industry: 'hotels',
    schemaType: 'Hotel',
    services: ['Room bookings', 'Event hosting', 'Conference facilities', 'Restaurant and bar', 'Airport transfer', 'Laundry service'],
    products: ['Standard rooms', 'Executive rooms', 'Suites', 'Event spaces', 'Meeting rooms'],
    sections: ['About', 'Rooms', 'Amenities', 'Location', 'Contact'],
    faqs: [
      { question: 'How do I book a room?', answer: 'Use the contact options on this profile to enquire about availability.' },
      { question: 'What amenities are available?', answer: `Amenities vary by property. ${FAQ_CONTACT}` },
      { question: 'What are check-in and check-out times?', answer: 'Contact the property to confirm.' },
      { question: 'Is parking available?', answer: `${FAQ_CONTACT}` },
    ],
    forbiddenClaims: ['star rating', '5-star', 'four star', 'rated', 'free wifi', 'free breakfast', 'swimming pool', 'air conditioned', 'generator', '24-hour power'],
    galleryGuidance: 'Only this property\'s own rooms. Hotel stock photography is the single most misleading image class on the internet.',
  },
  {
    industry: 'fitness',
    schemaType: 'ExerciseGym',
    services: ['Gym access', 'Personal training', 'Group classes', 'Fitness assessment', 'Nutrition guidance', 'Membership plans'],
    products: ['Day passes', 'Monthly membership', 'Class packages', 'Personal training sessions'],
    sections: ['About', 'Classes', 'Opening hours', 'Location', 'Contact'],
    faqs: [
      { question: 'What does membership cost?', answer: 'Contact the gym for current membership options.' },
      { question: 'Do you offer trial sessions?', answer: `${FAQ_CONTACT}` },
      { question: 'What classes are available?', answer: 'Ask the gym for its current timetable.' },
      { question: 'Is there parking?', answer: `${FAQ_CONTACT}` },
    ],
    forbiddenClaims: ['certified trainer', 'qualified instructor', 'guaranteed results', 'lose weight', 'transformation', 'medically supervised', 'physiotherapy'],
    galleryGuidance: 'Photographs of this gym floor and its own equipment.',
  },
  {
    industry: 'lawyers',
    schemaType: 'LegalService',
    services: ['Legal consultation', 'Document preparation', 'Contract review', 'Property transactions', 'Business registration', 'Dispute resolution'],
    products: [],
    sections: ['About', 'Practice areas', 'Contact'],
    faqs: [
      { question: 'What areas of law do you handle?', answer: 'Ask the practice for its current areas of work.' },
      { question: 'How do I arrange a consultation?', answer: 'Use the contact options on this profile.' },
      { question: 'What are your fees?', answer: `Fees depend on the matter. ${FAQ_CONTACT}` },
    ],
    /*
     * A wrong suggestion about a legal practice can lead somebody to rely on
     * representation that does not exist, in a matter with a deadline.
     */
    forbiddenClaims: ['called to the bar', 'senior advocate', 'san', 'bar association', 'admitted in', 'specialises in', 'success rate', 'won', 'no win no fee', 'notary', 'commissioner for oaths'],
    galleryGuidance: 'Office photographs only. No imagery implying courts, judges or outcomes.',
  },
  {
    industry: 'home-services',
    schemaType: 'HomeAndConstructionBusiness',
    services: ['Repairs and maintenance', 'Installation', 'Cleaning services', 'Plumbing', 'Electrical work', 'Painting', 'Pest control', 'Site inspection'],
    products: ['Fittings and fixtures', 'Cleaning supplies', 'Replacement parts'],
    sections: ['About', 'Services', 'Service area', 'Contact'],
    faqs: [
      { question: 'What areas do you cover?', answer: `${FAQ_CONTACT}` },
      { question: 'How do I get a quote?', answer: 'Use the contact options on this profile to describe the job.' },
      { question: 'How quickly can you attend?', answer: `Availability varies. ${FAQ_CONTACT}` },
      { question: 'Do you handle emergencies?', answer: `${FAQ_CONTACT}` },
    ],
    forbiddenClaims: ['licensed electrician', 'certified', 'insured', 'bonded', 'guaranteed work', 'emergency callout', '24 hour service', 'free quote'],
    galleryGuidance: 'Completed jobs this business actually carried out.',
  },
  {
    industry: 'photographers',
    schemaType: 'ProfessionalService',
    services: ['Portrait photography', 'Event photography', 'Wedding photography', 'Product photography', 'Corporate photography', 'Photo editing', 'Studio sessions'],
    products: ['Photo sessions', 'Prints', 'Digital albums', 'Event coverage packages'],
    sections: ['About', 'Portfolio', 'Services', 'Contact'],
    faqs: [
      { question: 'What does a session cost?', answer: 'Contact the photographer for current rates.' },
      { question: 'Do you travel for shoots?', answer: `${FAQ_CONTACT}` },
      { question: 'How long until I receive my photos?', answer: `Turnaround varies. ${FAQ_CONTACT}` },
      { question: 'How do I book?', answer: 'Use the contact options on this profile.' },
    ],
    forbiddenClaims: ['published in', 'shot for', 'official photographer', 'award-winning photographer', 'featured'],
    galleryGuidance: 'This photographer\'s own images only. Nothing in this industry is more damaging than a borrowed portfolio.',
  },

  // ────────────────────────────────────────────────────────────────────────
  // Added 2026-09-17. Three industries that had listings and no vocabulary.
  //
  // Each was chosen because its industry entry lists a COHERENT set of
  // categories — every member really does share these words. The category
  // names that failed that test got an entry in DELIBERATELY_UNMAPPED instead.
  // ────────────────────────────────────────────────────────────────────────
  {
    industry: 'finance',
    schemaType: 'FinancialService',
    /*
     * Named as the ACT, never the outcome. "Loan applications" is something an
     * office accepts; "Loans" reads as money this business will give you,
     * which is a promise nobody here is in a position to make.
     */
    services: [
      'Account opening', 'Loan applications', 'Savings products',
      'Money transfer', 'Bill payments', 'Financial advice',
      'Insurance enquiries', 'Foreign exchange enquiries',
    ],
    products: [],
    sections: ['About', 'Services', 'Location', 'Contact', 'Opening hours'],
    faqs: [
      { question: 'What do I need to open an account?', answer: `Requirements differ between institutions and account types. ${FAQ_CONTACT}` },
      { question: 'Are there fees?', answer: 'Fees and rates are set by the institution and change. Contact this business for its current terms.' },
    ],
    /*
     * A rate, a return or a regulator IS the product here. Publishing any of
     * them on somebody else's behalf is the most expensive mistake this system
     * could make — it is what a person acts on with their savings.
     */
    forbiddenClaims: [
      'interest rate', 'apr', 'returns of', 'roi', 'guaranteed returns',
      'cbn-licensed', 'cbn licensed', 'ndic', 'insured deposits', 'deposit insurance',
      'regulated by', 'sec-registered', 'instant loan', 'no collateral',
      'lowest rate', 'best rate', 'approved in minutes', 'credit score',
    ],
    galleryGuidance: 'The branch or office as it is. Nothing implying a vault, a queue-free hall or a scale this business does not have.',
  },
  {
    industry: 'event-entertainment',
    schemaType: 'EntertainmentBusiness',
    services: [
      'Event equipment hire', 'Sound and lighting hire', 'Venue setup',
      'Event bookings', 'Performance bookings', 'Delivery and collection',
      'Setup and takedown',
    ],
    /*
     * GROUPS, not items. "Canopies and tents" is a kind of thing this trade
     * rents; "200 white canopies" is stock, and nobody counted it.
     */
    products: [
      'Canopies and tents', 'Chairs and tables', 'Sound equipment',
      'Lighting equipment', 'Staging', 'Decor items', 'Generators',
    ],
    sections: ['About', 'Services', 'Hire', 'Location', 'Contact'],
    faqs: [
      { question: 'What is available on my date?', answer: 'Availability changes daily. Contact this business with your date.' },
      { question: 'Is delivery included?', answer: `Delivery terms differ by item and distance. ${FAQ_CONTACT}` },
    ],
    forbiddenClaims: [
      'in stock', 'available now', 'any date', 'unlimited', 'per day', 'per hour',
      'starting from', 'free setup', 'biggest', 'largest',
    ],
    galleryGuidance: 'Equipment this company owns and events it actually supplied, with the agreement of whoever booked them. A stock wedding is not a portfolio.',
  },
  {
    industry: 'software-it',
    schemaType: 'ProfessionalService',
    services: [
      'Website development', 'Mobile app development', 'IT support',
      'Systems maintenance', 'Cloud and hosting setup', 'Data and reporting',
      'Technical consultation', 'Staff training',
    ],
    products: [],
    sections: ['About', 'Services', 'Contact'],
    faqs: [
      { question: 'How do projects start?', answer: 'Scoping and terms differ by project. Contact this business to discuss yours.' },
      { question: 'Do you offer ongoing support?', answer: `Support arrangements vary. ${FAQ_CONTACT}` },
    ],
    /*
     * Security and uptime claims are the dangerous ones here: they are
     * assertions about somebody's risk, and a reader acts on them by trusting
     * a system with their data.
     */
    forbiddenClaims: [
      'uptime', 'sla', 'iso 27001', 'soc 2', 'gdpr-compliant', 'gdpr compliant',
      'hack-proof', 'unhackable', 'secure by default', 'enterprise-grade',
      'penetration tested', 'fully managed', 'zero downtime', 'ai-powered',
    ],
    galleryGuidance: 'Work this team actually shipped, and only with the agreement of the client. Screenshots of software somebody else built are a false portfolio.',
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────
// Resolution
// ─────────────────────────────────────────────────────────────────────────

/**
 * Category names the LIVE DATA uses that the app's own category list does not.
 *
 * MEASURED on production 2026-09-14, against the biggest categories in the
 * directory:
 *
 *   Hospital & Clinic     1,654   in BUSINESS_CATEGORIES
 *   Schools & Training      533   NOT in BUSINESS_CATEGORIES
 *   Professional Services   190   NOT in BUSINESS_CATEGORIES
 *   Arts & Culture           68   NOT in BUSINESS_CATEGORIES
 *   Health & Medical         41   NOT in BUSINESS_CATEGORIES
 *
 * Those four arrived through the Wikidata and CSV imports under names the app
 * never defined, so they resolve to no industry — which silently costs them
 * their industry page, their booking modules AND any enrichment. 832 listings,
 * roughly a fifth of the directory.
 *
 * THIS MAP IS A READ-TIME ALIAS, NOT A FIX. It changes no stored data and
 * nothing is renamed; it only lets the resolver recognise a name it already
 * sees every day. Normalising the stored categories is a decision about 832
 * live rows and belongs to a migration somebody chooses to run, not to a
 * lookup table.
 *
 * Only unambiguous mappings appear here. "Arts & Culture" is deliberately
 * ABSENT: it covers galleries, museums, performers and cultural centres, which
 * are different businesses with different vocabularies, and guessing one would
 * suggest gallery services to a dance troupe.
 */
export const CATEGORY_ALIASES: Readonly<Record<string, string>> = {
  'schools & training': 'schools',
  'health & medical': 'hospitals',

  // Added 2026-09-17, each one checked against the industry's own category
  // list rather than against the name reading plausibly.
  'banking & finance': 'finance',
  'events & entertainment': 'event-entertainment',
  'fitness & wellness': 'fitness',
  'beauty & hair': 'beauty-salon',
  'tech & digital': 'software-it',
  education: 'schools',
};

/**
 * Names that resolve to NOTHING, on purpose, with the reason recorded.
 *
 * This list is not documentation. It exists because 'professional services'
 * was aliased to `service-providers` and sat here for days looking correct —
 * and `service-providers` is plumbers, electricians, cleaners and locksmiths.
 * It was inert only because that industry had no template yet; the moment
 * anybody wrote one, 143 businesses would have been handed a plumber's
 * vocabulary.
 *
 * MEASURED 2026-09-17 — a random sample of the 141 unclaimed listings stored
 * as "Professional Services":
 *
 *   BUA Cement · University Publishing Company Ltd. · Legit.ng
 *   4TEES RENTALS & BALLOONS NIGERIA LIMITED · Zaacoal
 *   Anti-Corruption Research Center · Phillips Consulting
 *
 * A cement manufacturer, a publisher, a news site, a balloon hire company, a
 * charcoal producer, a research centre and a consultancy. There is no service
 * these seven share. Any vocabulary broad enough to cover them would be
 * "consultation, advisory, support" — the filler the engine exists to refuse.
 *
 * THE FIX IS NOT A TEMPLATE. These listings are mis-categorised, not
 * under-served: BUA Cement is Manufacturing, York Press is Publishing. Re-
 * categorising them gives each one a vocabulary that is actually about it.
 * Until somebody does that work, silence is the honest output.
 */
export const DELIBERATELY_UNMAPPED: Readonly<Record<string, string>> = {
  'professional services':
    'A grab-bag: cement, publishing, news, balloon hire and consultancy under one name. Re-categorise; do not guess.',
  'professional service':
    'Same grab-bag as "Professional Services", singular.',
  'arts & culture':
    'Galleries, museums, performers and cultural centres want different words. Guessing one suggests exhibitions to a dance troupe.',
  'hospitality & travel':
    'A hotel and a travel agency share almost no vocabulary. "Room service" on an agency is a false claim.',
  'shopping mall':
    'A mall is a landlord, not a shop. Suggesting product sales describes its tenants, not it.',
  'library & archive':
    'No industry defined for it yet. A real vocabulary exists here — it needs an industry entry first, not an alias to something else.',
  other:
    'By definition uncategorised. Nothing can be inferred from it.',
};

const BY_INDUSTRY = new Map(CATEGORY_TEMPLATES.map((t) => [t.industry, t]));

/**
 * The industry a business category belongs to.
 *
 * MEASURED: 19 of the 250 categories appear in more than one industry ("Café &
 * Bakery" is in both `restaurants` and `bakeries`). First match in INDUSTRIES
 * order wins — deterministic, and the earlier entry is the broader industry,
 * which is the safer vocabulary to suggest from.
 */
export function industryForCategory(category: string | null | undefined): string | null {
  const needle = (category ?? '').trim().toLowerCase();
  if (!needle) return null;

  // An exact category wins over an alias: the alias exists only for names the
  // category list never defined.
  for (const ind of INDUSTRIES) {
    if (ind.categories.some((c) => c.toLowerCase() === needle)) return ind.slug;
  }

  const aliased = CATEGORY_ALIASES[needle];
  if (aliased && INDUSTRIES.some((i) => i.slug === aliased)) return aliased;

  return null;
}

/**
 * The template for a business category, or null.
 *
 * NULL IS A REAL ANSWER. An industry nobody has written a vocabulary for gets
 * no suggestions at all, and the engine must produce nothing rather than fall
 * back to a generic list. "Services: consultation, support, enquiries" under a
 * real business name is filler pretending to be information.
 */
export function templateFor(category: string | null | undefined): CategoryTemplate | null {
  const industry = industryForCategory(category);
  return industry ? BY_INDUSTRY.get(industry) ?? null : null;
}

/** Every claim forbidden for this category: the universal set plus its own. */
export function forbiddenClaimsFor(category: string | null | undefined): string[] {
  const t = templateFor(category);
  return [...UNIVERSAL_FORBIDDEN_CLAIMS, ...(t?.forbiddenClaims ?? [])];
}

/**
 * Does this text make a claim the category forbids?
 *
 * Substring matching on a lowercased haystack, deliberately blunt. A false
 * positive costs one rejected suggestion; a false negative publishes "licensed
 * by" under a business nobody licensed.
 */
export function findForbiddenClaim(
  text: string | null | undefined,
  category: string | null | undefined,
): string | null {
  const haystack = (text ?? '').toLowerCase();
  if (!haystack.trim()) return null;
  for (const claim of forbiddenClaimsFor(category)) {
    if (haystack.includes(claim.toLowerCase())) return claim;
  }
  return null;
}

/** Industries that have a template. Useful for admin filters and coverage reports. */
export const TEMPLATED_INDUSTRIES: readonly string[] = CATEGORY_TEMPLATES.map((t) => t.industry);
