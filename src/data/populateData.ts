// Deterministic sample-data generators.
// These are used as a visual fallback when the database has no rows yet.
// Everything is derived from the item index (no Math.random), so a detail
// page can regenerate the exact same item that a list page linked to.

const LOCATIONS = ['Lagos', 'Nairobi', 'Accra', 'Kampala', 'Dakar', 'Abidjan', 'Johannesburg', 'Cairo', 'Addis Ababa', 'Dar es Salaam'];

// Country dialling code for each LOCATIONS entry (index-aligned) so sample
// phone numbers match the business's city instead of all being Nigerian.
const DIAL_CODES = ['+234', '+254', '+233', '+256', '+221', '+225', '+27', '+20', '+251', '+255'];

const BUSINESS_CATEGORIES = ['Restaurant', 'Tech', 'Fashion', 'Healthcare', 'Education', 'Construction', 'Retail', 'Entertainment', 'Finance', 'Agriculture'];

// Category-appropriate Pexels photos (ids verified reachable) so sample
// businesses look realistic instead of random placeholder images.
const pexels = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=640`;

const BUSINESS_IMAGES: Record<string, string[]> = {
  Restaurant: [262978, 1307698, 67468].map(pexels),
  Tech: [3184292, 574071, 1181675].map(pexels),
  Fashion: [994523, 1884581, 934070].map(pexels),
  Healthcare: [263402, 356040].map(pexels),
  Education: [256541, 301926].map(pexels),
  Construction: [176342, 1216589, 439416].map(pexels),
  Retail: [264636, 1005638, 3962285].map(pexels),
  Entertainment: [1105666, 1190298, 2263436].map(pexels),
  Finance: [259027, 534216, 730547].map(pexels),
  Agriculture: [265216, 2132250, 1595104].map(pexels),
};

// Realistic ad placements across Africa, shown while the database is empty.
// Tuple: [title, type, location, price per day (USD), dimensions, traffic]
//
// PRICING IS DERIVED, NOT INVENTED. Day rates come from published Nigerian OOH
// monthly rate cards (Aug 2026) at NGN 1,500/USD:
//
//     usd_per_day = naira_per_month / 30 / 1500
//
// Anchors: a tier-3 city unipole (Aba, Warri, Port Harcourt, Asaba) runs
// N500-900k/month; a Lagos secondary static N1.5-2m; a Lagos prime static or
// wall panel N2.5-3.5m; a Lagos prime LED N3.6-7m; a flagship Lagos LED or
// screen network N9-13m. Other markets are scaled off Lagos — South Africa
// ~1.2x, Kenya ~0.8x, Egypt and Morocco ~0.7x, Ghana ~0.6x, smaller capitals
// ~0.35-0.5x.
//
// The previous figures were 3-23x these: Port Harcourt was priced at N11.7m a
// month against a real N500k, and Ibadan at N8.1m against a real N500k. That
// is the difference between a marketplace an advertiser recognises and one
// they assume is broken.
//
// Titles follow the trade's own vocabulary — face count, structure type, then
// the road or landmark — because that is how buyers search and compare.
type PlacementSeed = [string, string, string, number, string, string];
const AD_PLACEMENTS: PlacementSeed[] = [
  // Nigeria
  ['3-Face Gantry Billboard, Third Mainland Bridge, Lagos', 'Billboard', 'Lagos, Nigeria', 56, '18m x 9m', 'high'],
  ['3-Face Unipole Billboard, Lekki-Epe Expressway, Lagos', 'Billboard', 'Lagos, Nigeria', 102, '12m x 6m', 'high'],
  ['2-Sided LED Tower, Akin Adesola, Victoria Island, Lagos', 'Digital Screen', 'Lagos, Nigeria', 289, '10m x 6m', 'high'],
  ['Double-Sided Freestanding Screens, Ikeja City Mall, Lagos', 'Mall Media', 'Lagos, Nigeria', 33, '4m x 3m', 'high'],
  ['Arrivals Wall Lightbox, Murtala Muhammed Airport, Lagos', 'Airport', 'Lagos, Nigeria', 78, '8m x 3m', 'high'],
  ['Full Vehicle Wrap, Danfo Fleet of 10, Lagos', 'Transit', 'Lagos, Nigeria', 27, 'Full vehicle', 'high'],
  ['2-Face Digital Board, Oshodi Interchange, Lagos', 'Digital Screen', 'Lagos, Nigeria', 80, '8m x 4m', 'high'],
  ['2-Face Unipole Billboard, Wuse Market Entrance, Abuja', 'Billboard', 'Abuja, Nigeria', 27, '10m x 5m', 'high'],
  ['Baggage Hall Lightbox, Nnamdi Azikiwe Airport, Abuja', 'Airport', 'Abuja, Nigeria', 49, '6m x 3m', 'medium'],
  ['Lamp Post Network (20 units), Maitama District, Abuja', 'Street Furniture', 'Abuja, Nigeria', 20, '1.2m x 1.8m each', 'medium'],
  ['2-Sided Unipole Billboard, Aba Road, Port Harcourt', 'Billboard', 'Port Harcourt, Nigeria', 11, '12m x 6m', 'high'],
  ['Double-Face Eyecatcher Billboard, Ring Road, Ibadan', 'Billboard', 'Ibadan, Nigeria', 11, '10m x 5m', 'medium'],
  ['2-Face Unipole Billboard, Kofar Mata Roundabout, Kano', 'Billboard', 'Kano, Nigeria', 13, '8m x 4m', 'medium'],
  ['Drive-Time Radio Slot (60s), Wazobia FM, Lagos', 'Radio', 'Lagos, Nigeria', 33, '60 seconds', 'high'],
  // Ghana
  ['2-Face Gantry Billboard, Kwame Nkrumah Circle, Accra', 'Billboard', 'Accra, Ghana', 40, '14m x 7m', 'high'],
  ['Food Court Screen Network, Accra Mall, Accra', 'Mall Media', 'Accra, Ghana', 22, 'Network of 8', 'high'],
  ['Departure Lounge Lightboxes, Kotoka Airport, Accra', 'Airport', 'Accra, Ghana', 52, '5m x 2.5m', 'medium'],
  ['2-Face Unipole Billboard, Tema Motorway, Tema', 'Billboard', 'Tema, Ghana', 18, '12m x 6m', 'high'],
  ['Wall Panel Billboard, Kejetia Market, Kumasi', 'Billboard', 'Kumasi, Ghana', 12, '15m x 4m', 'high'],
  ['Rear Window Network (50 vehicles), Trotro Fleet, Accra', 'Transit', 'Accra, Ghana', 16, '1m x 0.6m each', 'high'],
  // Kenya
  ['2-Sided Digital Gantry, Mombasa Road, Nairobi', 'Digital Screen', 'Nairobi, Kenya', 120, '12m x 5m', 'high'],
  ['2-Face Static Billboard, Kenyatta Avenue CBD, Nairobi', 'Billboard', 'Nairobi, Kenya', 45, '10m x 5m', 'high'],
  ['Escalator Wrap Series, Two Rivers Mall, Nairobi', 'Mall Media', 'Nairobi, Kenya', 24, '6 escalators', 'medium'],
  ['International Arrivals Corridor, JKIA, Nairobi', 'Airport', 'Nairobi, Kenya', 95, '10 lightboxes', 'high'],
  ['Full Vehicle Branding, Matatu Route 111, Nairobi', 'Transit', 'Nairobi, Kenya', 14, 'Full vehicle', 'high'],
  ['2-Face Static Billboard, Moi Avenue, Mombasa', 'Billboard', 'Mombasa, Kenya', 18, '8m x 4m', 'medium'],
  // South Africa
  ['Digital Spectacular, N1 Highway, Johannesburg', 'Digital Screen', 'Johannesburg, South Africa', 320, '15m x 7m', 'high'],
  ['Rooftop Sign, Sandton City, Johannesburg', 'Billboard', 'Johannesburg, South Africa', 180, '20m x 8m', 'high'],
  ['Platform Screen Network, Gautrain Stations, Johannesburg', 'Transit', 'Johannesburg, South Africa', 70, 'Network of 12', 'high'],
  ['Entrance Tower Screens, V&A Waterfront, Cape Town', 'Mall Media', 'Cape Town, South Africa', 110, '2 towers, 6m x 3m', 'high'],
  ['Baggage Carousel Panels, Cape Town International', 'Airport', 'Cape Town, South Africa', 85, '4 carousels', 'high'],
  ['2-Face Beachfront Billboard, Golden Mile, Durban', 'Billboard', 'Durban, South Africa', 48, '9m x 4.5m', 'high'],
  ['LED Perimeter Boards, Moses Mabhida Stadium, Durban', 'Stadium', 'Durban, South Africa', 140, 'Pitch-side LED ring', 'high'],
  ['Street Pole Network (30 units), Church Square, Pretoria', 'Street Furniture', 'Pretoria, South Africa', 26, '1m x 1.5m each', 'medium'],
  // Egypt
  ['Mega Board, 6th October Bridge, Cairo', 'Billboard', 'Cairo, Egypt', 95, '20m x 8m', 'high'],
  ['2-Sided Digital Unipole, Ring Road, Cairo', 'Digital Screen', 'Cairo, Egypt', 110, '14m x 7m', 'high'],
  ['Terminal 3 Lightbox Series, Cairo International', 'Airport', 'Cairo, Egypt', 60, '12 lightboxes', 'high'],
  ['Seafront Billboard, Corniche, Alexandria', 'Billboard', 'Alexandria, Egypt', 30, '10m x 5m', 'high'],
  // Ethiopia
  ['2-Face Digital Screen, Bole Road, Addis Ababa', 'Digital Screen', 'Addis Ababa, Ethiopia', 40, '8m x 4m', 'high'],
  ['Jet Bridge Panels, Bole Airport, Addis Ababa', 'Airport', 'Addis Ababa, Ethiopia', 55, '6 bridge wraps', 'high'],
  // East & Central Africa
  ['2-Face Static Billboard, Samora Avenue, Dar es Salaam', 'Billboard', 'Dar es Salaam, Tanzania', 20, '9m x 4.5m', 'high'],
  ['2-Face Unipole Billboard, Northern Bypass, Kampala', 'Billboard', 'Kampala, Uganda', 16, '12m x 6m', 'medium'],
  ['Approach Billboard, Kigali Convention Centre, Kigali', 'Billboard', 'Kigali, Rwanda', 22, '8m x 4m', 'medium'],
  ['Bus Shelter Network (25 shelters), Kigali', 'Street Furniture', 'Kigali, Rwanda', 13, '25 backlit panels', 'medium'],
  ['2-Face Billboard, Boulevard du 30 Juin, Kinshasa', 'Billboard', 'Kinshasa, DR Congo', 24, '12m x 6m', 'high'],
  // West & North Africa
  ['2-Face Gantry Billboard, Autoroute Péage, Dakar', 'Billboard', 'Dakar, Senegal', 28, '12m x 6m', 'high'],
  ['2-Face Billboard, Akwa Boulevard, Douala', 'Digital Screen', "Abidjan, Côte d'Ivoire", 19, '7m x 4m', 'high'],
  ['Digital Wall, Corniche, Casablanca', 'Airport', "Abidjan, Côte d'Ivoire", 85, '8 lightboxes', 'medium'],
  ['Arrivals Hall Panels, Menara Airport, Marrakech', 'Billboard', 'Douala, Cameroon', 45, '10m x 5m', 'high'],
  ['2-Face Billboard, Habib Bourguiba Avenue, Tunis', 'Digital Screen', 'Casablanca, Morocco', 26, '11m x 6m', 'high'],
  ['Street Pole Network (40 units), Didouche Mourad, Algiers', 'Airport', 'Marrakech, Morocco', 22, '6 lightboxes', 'high'],
  // Southern Africa
  ['2-Face Unipole Billboard, Great East Road, Lusaka', 'Billboard', 'Tunis, Tunisia', 14, '9m x 4.5m', 'high'],
  ['2-Face Billboard, Samora Machel Avenue, Harare', 'Street Furniture', 'Algiers, Algeria', 12, '1m x 1.5m each', 'medium'],
  ['Mall Screen Network, Game City, Gaborone', 'Billboard', 'Lusaka, Zambia', 15, '12m x 6m', 'medium'],
  ['2-Face Billboard, Independence Avenue, Windhoek', 'Billboard', 'Harare, Zimbabwe', 11, '9m x 4.5m', 'medium'],
  ['2-Face Billboard, Julius Nyerere Avenue, Maputo', 'Mall Media', 'Gaborone, Botswana', 13, 'Network of 6', 'medium'],
  // Côte d'Ivoire
  ['2-Sided Digital Corner Screen, Plateau, Abidjan', 'Billboard', 'Windhoek, Namibia', 62, '8m x 4m', 'medium'],
  ['Terminal Lightbox Series, Félix-Houphouët-Boigny Airport, Abidjan', 'Billboard', 'Maputo, Mozambique', 44, '9m x 4.5m', 'medium'],

  // --- Affordable Nigerian inventory ----------------------------------------
  //
  // The rate card started at ~N495k a month, which priced out the businesses
  // this platform is built for. The real market starts far lower: a 48-sheet
  // in Akure lists at N100k and one in Umuahia at N120k. Without a tier like
  // this, an SME browsing Promote finds nothing it can afford and concludes
  // the marketplace is not for them.
  //
  // These also widen the map. Inventory was confined to Lagos, Abuja, Port
  // Harcourt, Ibadan and Kano; real listings run through Ondo, Abia, Edo,
  // Enugu, Anambra, Akwa Ibom and Delta.
  ['48-Sheet Billboard, Ijakpo Road, Akure', 'Billboard', 'Akure, Nigeria', 2, '6m x 3m', 'medium'],
  ['48-Sheet Billboard, Ugwuachara Road, Umuahia', 'Billboard', 'Umuahia, Nigeria', 3, '6m x 3m', 'medium'],
  ['48-Sheet Billboard, Ihama Road, Benin City', 'Billboard', 'Benin City, Nigeria', 4, '6m x 3m', 'medium'],
  ['Portrait Billboard, Nwaniba Road, Uyo', 'Billboard', 'Uyo, Nigeria', 12, '4m x 8m', 'medium'],
  ['Portrait Billboard, Nsugbe Road, Onitsha', 'Billboard', 'Onitsha, Nigeria', 13, '4m x 8m', 'high'],
  ['Portrait Billboard, Nnebisi Road, Asaba', 'Billboard', 'Asaba, Nigeria', 14, '4m x 8m', 'medium'],
  ['Gantry Billboard, Abakiliki Road, Enugu', 'Billboard', 'Enugu, Nigeria', 56, '15m x 4m', 'high'],

  // --- Media the browse page offers but had nothing behind -------------------
  //
  // Cinema, Vehicle Wrap, Television, Print and Online are all filters on the
  // Promote page and every one returned an empty grid.
  //
  // HONEST NOTE: the OOH and television rates are taken from published rate
  // cards. Cinema, press and online are NOT — no comparable public card was
  // checked for those three, so their day rates are informed estimates and are
  // marked here rather than presented as sourced.
  ['Pre-Roll Slot, Filmhouse Cinemas Lekki, Lagos', 'Cinema', 'Lagos, Nigeria', 18, '30 seconds', 'medium'],
  ['Keke Napep Fleet Wrap (25 units), Aba', 'Vehicle Wrap', 'Aba, Nigeria', 9, 'Full vehicle', 'high'],
  ['Channels TV Prime Belt Spot (30s), Lagos', 'Television', 'Lagos, Nigeria', 90, '30s spot, one a day', 'high'],
  ['Full-Page Colour, National Daily, Lagos', 'Print', 'Lagos, Nigeria', 56, 'Full page', 'high'],
  ['Display Network, Nigerian Publisher Sites', 'Online', 'Lagos, Nigeria', 20, '300x250 & 728x90', 'high'],

  // --- BRT bus branding, Lagos ----------------------------------------------
  //
  // Lagos BRT is the format an SME here can actually start with: a single bus
  // runs N60-400k a month against N500k+ for the cheapest static board. Rates
  // are per bus per month from the published card; the fleet count is what the
  // buyer chooses, so each row is priced for one vehicle.
  ['BRT Interior TV Network Slot, Lagos', 'Transit', 'Lagos, Nigeria', 2, 'Onboard screen loop', 'high'],
  ['BRT Interior Panel Branding (per bus), Lagos', 'Transit', 'Lagos, Nigeria', 4, 'Interior panels', 'high'],
  ['BRT Bus Branding — Benz (per bus), Lagos', 'Transit', 'Lagos, Nigeria', 6, 'Full exterior', 'high'],
  ['BRT Bus Branding — TATA (per bus), Lagos', 'Transit', 'Lagos, Nigeria', 7, 'Full exterior', 'high'],
  ['BRT Bus Branding — Marcopolo (per bus), Lagos', 'Transit', 'Lagos, Nigeria', 8, 'Full exterior', 'high'],
  ['BRT Bus Branding — CNG Fleet (per bus), Lagos', 'Transit', 'Lagos, Nigeria', 8, 'Full exterior', 'high'],

  // --- Mobile truck & roadshow ----------------------------------------------
  //
  // Advertising that drives to the audience rather than waiting for it. Spans
  // the widest range on the platform: N75k for a truck board in Kano up to
  // N7m for a pan-Nigeria tour.
  ['Mobile Truck Billboard, Kano', 'Vehicle Wrap', 'Kano, Nigeria', 2, 'Both flanks', 'medium'],
  ['Mobile Roadshow Stage, Lagos', 'Vehicle Wrap', 'Lagos, Nigeria', 7, 'Stage truck + PA', 'high'],
  ['Mobile Roadshow Stage, South-West Circuit', 'Vehicle Wrap', 'Ibadan, Nigeria', 11, 'Stage truck + PA', 'high'],
  ['Digital LED Truck, Port Harcourt', 'Vehicle Wrap', 'Port Harcourt, Nigeria', 20, 'LED both flanks', 'high'],
  ['Double-Sided LED Truck, Lagos', 'Vehicle Wrap', 'Lagos, Nigeria', 20, 'LED both flanks', 'high'],
  ['Mobile Billboard Truck, Abuja', 'Vehicle Wrap', 'Abuja, Nigeria', 25, 'Both flanks + rear', 'high'],
  ['Mobile Billboard Truck, Lagos', 'Vehicle Wrap', 'Lagos, Nigeria', 40, 'Both flanks + rear', 'high'],
  ['Mobile Truck Tour, Pan-Nigeria Circuit', 'Vehicle Wrap', 'Lagos, Nigeria', 156, 'Multi-city route', 'high'],

  // --- Television -------------------------------------------------------------
  //
  // Priced per spot on the published card, so the day rate here is one spot a
  // day: a month of daily prime-belt spots works out at roughly N4m, which is
  // what a buyer would actually be quoted.
  ['Channels TV Sunrise Breakfast Spot (30s), Lagos', 'Television', 'Lagos, Nigeria', 126, '30s spot, one a day', 'high'],
  ['Channels TV Programme Sponsorship, Lagos', 'Television', 'Lagos, Nigeria', 50, 'Programme billing', 'high']
];

// Type-appropriate Pexels photos (visually verified) so placement cards show
// realistic imagery — billboards for billboards, terminals for airport ads…
// Every pool must be at least as long as the number of placements of that
// type, because generateAdverts indexes it with `% pool.length` — three
// billboard photos across twenty-six billboards meant the same picture
// appeared nine times down the page, which reads as one placement listed over
// and over rather than an inventory.
//
// Order matters: the first entries are the most African-looking, and Nigerian
// placements come first in AD_PLACEMENTS, so Lagos inventory gets Lagos
// imagery rather than Times Square.
//
// Every id below was loaded before being committed — a 404 here is an empty
// card, and Pexels ids are not guessable.
const AD_TYPE_IMAGES: Record<string, string[]> = {
  // 33 billboard placements
  'Billboard': [
    33644177, 29812611, 8181296, 4913828, 38162696, 8655746,
    802024, 1580625, 1058759, 13986019, 32765072, 14536799,
    31432654, 5102100, 18037899, 36519146, 33753279, 32459947,
    5983052, 15829239, 5785306, 788662, 38380369, 4700105,
    4700102, 34149123, 14189082, 12654945, 15185245, 11519039, 32418922,
    30282062, 30490769, 30979169, 32379680, 18425137, 6186034, 14780175,
    9749091, 18715205, 33572396,
  ].map(pexels),
  // 8 digital screen placements
  'Digital Screen': [
    3927753, 18187188, 14363740, 12849349, 2506923, 2614818,
    2372982, 12602146, 35072459, 27164635, 38833542, 11744955,
  ].map(pexels),
  // 10 transit placements (BRT fleet branding is most of them)
  'Transit': [
    27782512, 12641815, 35611756, 2031758, 3626589, 4774659,
    13012408, 17177127, 28757904, 16464135, 17994718, 12382508,
    9678165, 32441052,
  ].map(pexels),
  // 5 mall media placements
  'Mall Media': [
    13100935, 37713979, 264636, 2861656, 3962285,
    36542205, 11503089, 19335728, 17409586, 32094984,
  ].map(pexels),
  // 9 airport placements
  'Airport': [
    30220728, 392265, 13716228, 227690, 2033343, 358319,
    16292057, 12932408, 2073082, 16936915, 18695674, 33598033, 4836109,
  ].map(pexels),
  // 4 street furniture placements
  'Street Furniture': [1661496, 12534782, 374815, 2422588, 9053669, 20037923, 22431309, 6542518].map(pexels),
  'Stadium': [270085, 2263436, 28772774].map(pexels),
  'Radio': [164829, 1054713, 744318].map(pexels),
  'Cinema': [18758034, 7991486, 3709371, 32682154].map(pexels),
  // 9 vehicle-wrap placements (mobile truck and roadshow inventory)
  'Vehicle Wrap': [
    12418932, 5410923, 38199714, 28158703, 9754798,
    15379824, 11040957, 31310062, 16370722, 34503103,
  ].map(pexels),
  'Television': [33925166, 7865064, 39071437, 14699396].map(pexels),
  'Print': [10004971, 36376366, 3866816, 36412293].map(pexels),
  'Online': [1181675, 927022, 3153201, 1181673].map(pexels),
};

const AD_TYPE_DESCRIPTIONS: Record<string, string> = {
  'Billboard': 'Large-format outdoor billboard with premium visibility',
  'Digital Screen': 'High-brightness digital LED screen with rotating 10-second slots',
  'Transit': 'Moving vehicle advertising reaching commuters across the city',
  'Mall Media': 'Indoor retail advertising reaching shoppers at point of purchase',
  'Airport': 'Premium airport advertising reaching business and leisure travellers',
  'Street Furniture': 'Eye-level street advertising in high-footfall areas',
  'Stadium': 'Live-event advertising with broadcast camera exposure',
  'Radio': 'Prime-time radio advertising slot with mass local reach',
  'Cinema': 'Pre-roll on the big screen, to a seated audience that cannot skip it',
  'Vehicle Wrap': 'Full-body branding on a working vehicle, seen on its daily route',
  'Television': 'Broadcast slot in a scheduled programme with national reach',
  'Print': 'Full-page press placement in a national title',
  'Online': 'Display inventory across local publisher and social networks',
};

// Curated, realistic creative-services samples shown while the database is
// empty. Kept deterministic (ids media_service_1..N) so detail pages can
// resolve the exact item a list page linked to.
const CREATIVE_SERVICES = [
  { title: 'Lens & Light Photography — Product Shoots', service_type: 'Photography', description: 'Studio product photography for e-commerce and catalogues. Includes 20 retouched images, white background and lifestyle setups.', pricing: 350, pricing_model: 'per shoot', delivery_time: '5 days', clients_served: 140, review_count: 62, rating: 4.8, img: 90946 },
  { title: 'Kalahari Films — Brand Video Production', service_type: 'Videography', description: 'Full-service brand films and TV commercials: scripting, shooting, colour grading and sound design. 30-90 second final cuts.', pricing: 2500, pricing_model: 'per project', delivery_time: '21 days', clients_served: 85, review_count: 41, rating: 4.9, img: 66134 },
  { title: 'Sable Studio — Logo & Brand Identity', service_type: 'Branding', description: 'Complete identity package: logo suite, colour system, typography, brand guidelines PDF and social media kit.', pricing: 800, pricing_model: 'per project', delivery_time: '14 days', clients_served: 210, review_count: 98, rating: 4.7, img: 196644 },
  { title: 'Ubuntu Digital — Social Media Management', service_type: 'Social Media Management', description: 'Monthly content calendar, 20 designed posts, community management and a performance report across Instagram, X and TikTok.', pricing: 450, pricing_model: 'per month', delivery_time: 'ongoing', clients_served: 96, review_count: 54, rating: 4.6, img: 607812 },
  { title: 'Baobab Motion — 2D Explainer Animation', service_type: 'Animation', description: 'Animated explainer videos with script, storyboard, voice-over and custom illustration. Up to 90 seconds.', pricing: 1200, pricing_model: 'per video', delivery_time: '18 days', clients_served: 58, review_count: 33, rating: 4.8, img: 326502 },
  { title: 'Sahara Sound — Radio Jingle & Audio Ads', service_type: 'Audio Production', description: 'Catchy radio jingles and audio spots in English, French, Swahili or Pidgin. Includes composition, voice talent and mastering.', pricing: 300, pricing_model: 'per spot', delivery_time: '7 days', clients_served: 175, review_count: 80, rating: 4.5, img: 164829 },
  { title: 'Nairobi Drone Collective — Aerial Coverage', service_type: 'Drone Photography', description: 'Licensed drone pilots for real estate, events and documentaries. 4K footage plus edited highlight reel.', pricing: 550, pricing_model: 'per day', delivery_time: '5 days', clients_served: 64, review_count: 29, rating: 4.7, img: 336232 },
  { title: 'Accra Creative Lab — Web & Landing Page Design', service_type: 'Web Design', description: 'Conversion-focused landing pages and small business sites. Design in Figma, responsive build, basic SEO setup.', pricing: 950, pricing_model: 'per site', delivery_time: '14 days', clients_served: 120, review_count: 66, rating: 4.6, img: 574071 },
  { title: 'Jollof Post — Video Editing & Colour Grading', service_type: 'Video Editing', description: 'Post-production for creators and agencies: multi-cam editing, motion titles, colour grading and delivery in all aspect ratios.', pricing: 200, pricing_model: 'per minute of output', delivery_time: '4 days', clients_served: 230, review_count: 112, rating: 4.8, img: 257904 },
  { title: 'Kigali Sessions — Podcast Production', service_type: 'Podcast Production', description: 'End-to-end podcast production: recording, editing, show notes, cover art and distribution to all platforms.', pricing: 180, pricing_model: 'per episode', delivery_time: '3 days', clients_served: 44, review_count: 21, rating: 4.9, img: 1054713 },
  { title: 'Zebra Ink — Print & Packaging Design', service_type: 'Graphic Design', description: 'Flyers, billboards, product packaging and print-ready artwork with supplier liaison for CMYK production.', pricing: 260, pricing_model: 'per design', delivery_time: '6 days', clients_served: 190, review_count: 87, rating: 4.5, img: 1779487 },
  { title: 'Lagos Wedding Stories — Event Coverage', service_type: 'Event Photography', description: 'Weddings, launches and conferences covered by a two-person crew. 300+ edited photos and a same-week highlight video.', pricing: 700, pricing_model: 'per event', delivery_time: '10 days', clients_served: 155, review_count: 74, rating: 4.7, img: 169198 },
  { title: 'Savanna UX — Mobile App UI/UX Design', service_type: 'UI/UX Design', description: 'User research, wireframes and polished UI kits for iOS and Android apps, delivered as developer-ready Figma files.', pricing: 1500, pricing_model: 'per project', delivery_time: '21 days', clients_served: 39, review_count: 18, rating: 4.8, img: 196645 },
  { title: 'AfroBeat Visuals — Music Video Production', service_type: 'Videography', description: 'Concept-to-delivery music videos with location scouting, styling, cinematography and VFX-ready editing.', pricing: 3000, pricing_model: 'per video', delivery_time: '30 days', clients_served: 47, review_count: 25, rating: 4.6, img: 2263436 },
  { title: 'Cape Copy Co. — Copywriting & Content', service_type: 'Content Creation', description: 'Website copy, ad scripts, blog articles and product descriptions written for African audiences in EN/FR/PT.', pricing: 120, pricing_model: 'per 1000 words', delivery_time: '3 days', clients_served: 260, review_count: 130, rating: 4.7, img: 261510 },
  { title: 'Kampala Motion — Logo Animation & Stingers', service_type: 'Motion Graphics', description: 'Animated logos, lower thirds and broadcast stingers for TV stations, YouTubers and event screens.', pricing: 240, pricing_model: 'per animation', delivery_time: '5 days', clients_served: 91, review_count: 45, rating: 4.6, img: 4062561 },
  { title: 'Dakar Retouch — Photo Editing & Restoration', service_type: 'Photo Editing', description: 'High-end retouching, background removal, colour correction and old photo restoration with 48-hour rush option.', pricing: 15, pricing_model: 'per image', delivery_time: '2 days', clients_served: 340, review_count: 150, rating: 4.5, img: 257897 },
  { title: 'Joburg Influence — Influencer Campaign Management', service_type: 'Influencer Marketing', description: 'Campaign strategy, creator sourcing, content approval and reporting across African influencer networks.', pricing: 1000, pricing_model: 'per campaign', delivery_time: '30 days', clients_served: 52, review_count: 27, rating: 4.4, img: 267350 },
  { title: 'Timbuktu Voices — Voice-Over in 6 Languages', service_type: 'Voice-Over', description: 'Professional voice-over for ads, IVR and e-learning in English, French, Swahili, Hausa, Yoruba and Pidgin. Broadcast-ready audio.', pricing: 90, pricing_model: 'per finished minute', delivery_time: '2 days', clients_served: 205, review_count: 93, rating: 4.7, img: 744318 },
  { title: 'Cape Estates Media — Real Estate Photo & Virtual Tours', service_type: 'Real Estate Media', description: 'HDR interiors, twilight exteriors, floor plans and 360° virtual tours that help listings sell faster.', pricing: 250, pricing_model: 'per listing', delivery_time: '3 days', clients_served: 130, review_count: 61, rating: 4.8, img: 1396122 },
  { title: 'Naija Live — Livestream & Event Streaming', service_type: 'Live Streaming', description: 'Multi-camera livestreams for conferences, weddings and product launches to YouTube, Facebook and private feeds.', pricing: 600, pricing_model: 'per event', delivery_time: 'same day', clients_served: 75, review_count: 38, rating: 4.6, img: 2873486 },
  { title: 'Serengeti Signs — Billboard & OOH Creative', service_type: 'Graphic Design', description: 'High-impact large-format artwork for billboards, transit wraps and mall screens, sized to any placement spec.', pricing: 320, pricing_model: 'per design', delivery_time: '5 days', clients_served: 88, review_count: 41, rating: 4.5, img: 4348404 },
  { title: 'Atlas Media — TV Commercial Production', service_type: 'Videography', description: 'Broadcast-standard TV commercials: casting, studio or location shoots, licensed music and clearance-ready masters.', pricing: 4500, pricing_model: 'per commercial', delivery_time: '45 days', clients_served: 29, review_count: 15, rating: 4.9, img: 3062541 },
  { title: 'Accra Food Frames — Menu & Food Photography', service_type: 'Photography', description: 'Appetising menu, delivery-app and social photography for restaurants — styled, shot and delivered ready to upload.', pricing: 220, pricing_model: 'per menu shoot', delivery_time: '4 days', clients_served: 112, review_count: 57, rating: 4.7, img: 279906 },

  // Advertising had no listing at all, so filtering the Create page by it
  // returned an empty grid — the one category that looked broken rather than
  // quiet. These two cover the media-buying and performance halves of it.
  { title: 'Meridian Media Buying — Radio, TV & Outdoor', service_type: 'Advertising', description: 'Media planning and buying across radio, TV and billboards. Audience research, rate negotiation, spot scheduling and a post-campaign reach report.', pricing: 650, pricing_model: 'per month retainer', delivery_time: 'ongoing', clients_served: 68, review_count: 31, rating: 4.5, img: 590041 },
  { title: 'Kwanza Ads — Paid Social & Search', service_type: 'Advertising', description: 'Meta, TikTok and Google campaigns built and managed end to end: creative testing, audience targeting, budget pacing and weekly reporting.', pricing: 380, pricing_model: 'per month retainer', delivery_time: 'ongoing', clients_served: 143, review_count: 71, rating: 4.6, img: 265087 },

  // Second listings for the disciplines people search most. A category page
  // holding a single card reads as an empty directory, which is the same thin
  // -content problem the discovery pages guard against.
  { title: 'Indigo & Ochre — Brand Strategy Workshop', service_type: 'Branding', description: 'A facilitated two-day session that settles positioning, tone of voice and messaging before any design starts. Ends with a written brand platform.', pricing: 600, pricing_model: 'per workshop', delivery_time: '10 days', clients_served: 47, review_count: 22, rating: 4.8, img: 3184338 },
  { title: 'Harmattan Commerce — Online Store Build', service_type: 'Web Design', description: 'Shopify or WooCommerce storefronts with payment gateways set up for African cards and mobile money, plus product upload and staff training.', pricing: 1400, pricing_model: 'per store', delivery_time: '25 days', clients_served: 73, review_count: 36, rating: 4.7, img: 265685 },
  { title: 'Content Kitchen — Monthly Shoot & Scheduling', service_type: 'Social Media Management', description: 'One shoot day a month producing 30 photos and 8 short videos, captioned, scheduled and posted across your channels.', pricing: 320, pricing_model: 'per month', delivery_time: 'ongoing', clients_served: 118, review_count: 63, rating: 4.6, img: 3183197 },
  { title: 'Summit Frames — Conference & Awards Coverage', service_type: 'Event Photography', description: 'Corporate event coverage with same-day social edits and a full gallery within 72 hours. Two photographers and on-site backup included.', pricing: 480, pricing_model: 'per event day', delivery_time: '3 days', clients_served: 96, review_count: 44, rating: 4.7, img: 3184291 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

// Realistic primary → secondary category combos for sample businesses, so the
// multi-category feature demos out of the box (dev data only).
const SECONDARY_PAIRS: [string, string][] = [
  ['Tailor & Fashion Designer', 'Fabric Store'],
  ['Boutique', 'Tailor & Fashion Designer'],
  ['Frozen Food Store', 'Catering'],
  ['Fashion & Apparel', 'Footwear & Bags'],
  ['Café & Bakery', 'Bakery & Pastry'],
  ['Laundry & Dry Cleaning', 'House Cleaning'],
  ['Salon / Barber', 'Hair Braiding Studio'],
  ['Restaurant', 'Catering'],
  ['Supermarket', 'Produce / Fruit & Veg Market'],
  ['Electronics', 'Phone & Gadget Store'],
];

// Fake sample listings are a dev convenience only. In production, empty results
// must show a real empty state — never invented businesses to real visitors.
// (The curated /platform "see it live" showcase uses separate spotlight data
// and is unaffected.)
const SAMPLES_ENABLED = import.meta.env.DEV;

export const generateBusinesses = (count: number = 30) =>
  !SAMPLES_ENABLED ? [] :
  Array.from({ length: count }).map((_, index) => {
    const category = BUSINESS_CATEGORIES[index % BUSINESS_CATEGORIES.length];
    const name = `${LOCATIONS[index % LOCATIONS.length]} ${category} Co. ${index + 1}`;
    const pair = SECONDARY_PAIRS[index % SECONDARY_PAIRS.length];
    return {
      id: `business_${index + 1}`,
      username: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      name,
      category,
      secondary_categories: category === pair[0] ? [pair[1]] : undefined,
      description: `We provide excellent ${category.toLowerCase()} services to our valued customers.`,
      location: LOCATIONS[index % LOCATIONS.length],
      phone: `${DIAL_CODES[index % LOCATIONS.length]} 800 ${String(1000000 + index * 137).slice(0, 3)} ${String(1000 + index * 7).slice(0, 4)}`,
      // example.com is reserved for demos (RFC 2606) — never a live third-party site
      website: `https://business${index + 1}.example.com`,
      // Cycle through the category's photo set so repeat categories vary
      image_url: BUSINESS_IMAGES[category][Math.floor(index / BUSINESS_CATEGORIES.length) % BUSINESS_IMAGES[category].length],
      rating: 3.5 + ((index * 7) % 15) / 10,
      status: index % 3 === 0 ? 'closed' : 'open',
      verified: index % 3 === 1, // a realistic share of listings are verified
      user_id: 'sample',
    };
  });

export const generateAdverts = (count: number = AD_PLACEMENTS.length) => {
  if (!SAMPLES_ENABLED) return [];
  // Cycle each type's photo set independently so repeats of a type vary
  const typeCounts: Record<string, number> = {};
  return AD_PLACEMENTS.slice(0, count).map(([title, type, location, pricePerDay, dimensions, traffic], index) => {
    const pool = AD_TYPE_IMAGES[type] ?? [];
    typeCounts[type] = (typeCounts[type] ?? -1) + 1;
    return {
    id: `advert_${index + 1}`,
    title,
    type,
    category: type,
    description: `${AD_TYPE_DESCRIPTIONS[type] || 'Premium advertising placement'} — ${dimensions}, ${traffic} traffic. Located at ${location}.`,
    location,
    price_per_day: pricePerDay,
    pricing: pricePerDay,
    budget: pricePerDay * 30,
    duration: 30,
    dimensions,
    traffic_density: traffic,
    available_until: new Date(Date.now() + ((index % 45) + 15) * DAY_MS).toISOString(),
    image_url: pool.length > 0 ? pool[typeCounts[type] % pool.length] : `https://picsum.photos/seed/placement${index + 1}/400/300.jpg`,
    awards: index % 9 === 0 ? 'Top Rated Location' : null,
    status: index % 8 === 0 ? 'pending' : 'active',
    user_id: 'sample',
    created_at: new Date(Date.now() - ((index % 60) + 1) * DAY_MS).toISOString(),
    };
  });
};

export const generateMediaServices = (count: number = 30) =>
  !SAMPLES_ENABLED ? [] :
  CREATIVE_SERVICES.slice(0, count).map(({ img, ...service }, index) => ({
    id: `media_service_${index + 1}`,
    ...service,
    image_url: pexels(img),
    status: 'open',
    user_id: 'sample',
  }));

// Kept for backwards compatibility with older imports.
export const generateMedia = generateMediaServices;

// Sample ids look like `business_12` / `advert_3` / `media_service_7`.
// Real Supabase rows use uuid ids, so detail pages can tell them apart.
export const isSampleId = (id: string) => /^(business|advert|media_service)_\d+$/.test(id);
