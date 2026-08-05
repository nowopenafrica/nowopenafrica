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
type PlacementSeed = [string, string, string, number, string, string];
const AD_PLACEMENTS: PlacementSeed[] = [
  // Nigeria
  ['Third Mainland Bridge Gantry', 'Billboard', 'Lagos, Nigeria', 650, '18m x 9m', 'high'],
  ['Lekki-Epe Expressway Unipole', 'Billboard', 'Lagos, Nigeria', 480, '12m x 6m', 'high'],
  ['Victoria Island LED Tower', 'Digital Screen', 'Lagos, Nigeria', 820, '10m x 6m', 'high'],
  ['Ikeja City Mall Atrium Screen', 'Mall Media', 'Lagos, Nigeria', 210, '4m x 3m', 'high'],
  ['Murtala Muhammed Airport Arrivals Wall', 'Airport', 'Lagos, Nigeria', 540, '8m x 3m', 'high'],
  ['Danfo Bus Full Wrap (Fleet of 10)', 'Transit', 'Lagos, Nigeria', 300, 'Full vehicle', 'high'],
  ['Oshodi Interchange Digital Board', 'Digital Screen', 'Lagos, Nigeria', 390, '8m x 4m', 'high'],
  ['Wuse Market Entrance Billboard', 'Billboard', 'Abuja, Nigeria', 320, '10m x 5m', 'high'],
  ['Nnamdi Azikiwe Airport Baggage Hall', 'Airport', 'Abuja, Nigeria', 410, '6m x 3m', 'medium'],
  ['Maitama District Lamp Posts (20 units)', 'Street Furniture', 'Abuja, Nigeria', 150, '1.2m x 1.8m each', 'medium'],
  ['Port Harcourt Aba Road Unipole', 'Billboard', 'Port Harcourt, Nigeria', 260, '12m x 6m', 'high'],
  ['Ibadan Ring Road Billboard', 'Billboard', 'Ibadan, Nigeria', 180, '10m x 5m', 'medium'],
  ['Kano Kofar Mata Roundabout Board', 'Billboard', 'Kano, Nigeria', 160, '8m x 4m', 'medium'],
  ['Wazobia FM Drive-Time Slot (60s)', 'Radio', 'Lagos, Nigeria', 220, '60 seconds', 'high'],
  // Ghana
  ['Accra Kwame Nkrumah Circle Gantry', 'Billboard', 'Accra, Ghana', 340, '14m x 7m', 'high'],
  ['Accra Mall Food Court Screens', 'Mall Media', 'Accra, Ghana', 170, 'Network of 8', 'high'],
  ['Kotoka Airport Departure Lounge', 'Airport', 'Accra, Ghana', 380, '5m x 2.5m', 'medium'],
  ['Tema Motorway Unipole', 'Billboard', 'Tema, Ghana', 240, '12m x 6m', 'high'],
  ['Kumasi Kejetia Market Wall', 'Billboard', 'Kumasi, Ghana', 150, '15m x 4m', 'high'],
  ['Trotro Rear Window Network (50 vehicles)', 'Transit', 'Accra, Ghana', 190, '1m x 0.6m each', 'high'],
  // Kenya
  ['Mombasa Road Digital Gantry', 'Digital Screen', 'Nairobi, Kenya', 560, '12m x 5m', 'high'],
  ['Nairobi CBD Kenyatta Avenue Board', 'Billboard', 'Nairobi, Kenya', 430, '10m x 5m', 'high'],
  ['Two Rivers Mall Escalator Wraps', 'Mall Media', 'Nairobi, Kenya', 180, '6 escalators', 'medium'],
  ['JKIA International Arrivals Corridor', 'Airport', 'Nairobi, Kenya', 590, '10 lightboxes', 'high'],
  ['Matatu Full Branding (Route 111)', 'Transit', 'Nairobi, Kenya', 130, 'Full vehicle', 'high'],
  ['Mombasa Moi Avenue Billboard', 'Billboard', 'Mombasa, Kenya', 200, '8m x 4m', 'medium'],
  // South Africa
  ['N1 Highway Digital Spectacular', 'Digital Screen', 'Johannesburg, South Africa', 900, '15m x 7m', 'high'],
  ['Sandton City Rooftop Sign', 'Billboard', 'Johannesburg, South Africa', 750, '20m x 8m', 'high'],
  ['Gautrain Station Platform Screens', 'Transit', 'Johannesburg, South Africa', 350, 'Network of 12', 'high'],
  ['V&A Waterfront Entrance Towers', 'Mall Media', 'Cape Town, South Africa', 520, '2 towers, 6m x 3m', 'high'],
  ['Cape Town Intl Baggage Carousels', 'Airport', 'Cape Town, South Africa', 480, '4 carousels', 'high'],
  ['Durban Golden Mile Beachfront Board', 'Billboard', 'Durban, South Africa', 310, '9m x 4.5m', 'high'],
  ['Moses Mabhida Stadium LED Perimeter', 'Stadium', 'Durban, South Africa', 680, 'Pitch-side LED ring', 'high'],
  ['Pretoria Church Square Street Poles (30)', 'Street Furniture', 'Pretoria, South Africa', 160, '1m x 1.5m each', 'medium'],
  // Egypt
  ['6th October Bridge Mega Board', 'Billboard', 'Cairo, Egypt', 700, '20m x 8m', 'high'],
  ['Cairo Ring Road Digital Unipole', 'Digital Screen', 'Cairo, Egypt', 620, '14m x 7m', 'high'],
  ['Cairo Intl Terminal 3 Lightboxes', 'Airport', 'Cairo, Egypt', 450, '12 lightboxes', 'high'],
  ['Alexandria Corniche Seafront Board', 'Billboard', 'Alexandria, Egypt', 280, '10m x 5m', 'high'],
  // East & Central Africa
  ['Bole Road Digital Screen', 'Digital Screen', 'Addis Ababa, Ethiopia', 260, '8m x 4m', 'high'],
  ['Addis Ababa Bole Airport Jet Bridges', 'Airport', 'Addis Ababa, Ethiopia', 400, '6 bridge wraps', 'high'],
  ['Dar es Salaam Samora Avenue Board', 'Billboard', 'Dar es Salaam, Tanzania', 190, '9m x 4.5m', 'high'],
  ['Kampala Northern Bypass Unipole', 'Billboard', 'Kampala, Uganda', 170, '12m x 6m', 'medium'],
  ['Kigali Convention Centre Approach', 'Billboard', 'Kigali, Rwanda', 210, '8m x 4m', 'medium'],
  ['Kigali Bus Shelter Network (25 shelters)', 'Street Furniture', 'Kigali, Rwanda', 140, '25 backlit panels', 'medium'],
  ['Kinshasa Boulevard du 30 Juin Board', 'Billboard', 'Kinshasa, DR Congo', 230, '12m x 6m', 'high'],
  // West Africa (francophone)
  ['Dakar Autoroute Péage Gantry', 'Billboard', 'Dakar, Senegal', 250, '12m x 6m', 'high'],
  ['Abidjan Plateau Digital Corner', 'Digital Screen', "Abidjan, Côte d'Ivoire", 330, '7m x 4m', 'high'],
  ['Abidjan Félix-Houphouët-Boigny Airport', 'Airport', "Abidjan, Côte d'Ivoire", 360, '8 lightboxes', 'medium'],
  ['Douala Akwa Boulevard Board', 'Billboard', 'Douala, Cameroon', 200, '10m x 5m', 'high'],
  // North & Southern Africa
  ['Casablanca Corniche Digital Wall', 'Digital Screen', 'Casablanca, Morocco', 540, '11m x 6m', 'high'],
  ['Marrakech Menara Airport Arrivals', 'Airport', 'Marrakech, Morocco', 390, '6 lightboxes', 'high'],
  ['Tunis Habib Bourguiba Avenue Board', 'Billboard', 'Tunis, Tunisia', 240, '9m x 4.5m', 'high'],
  ['Algiers Didouche Mourad Street Poles (40)', 'Street Furniture', 'Algiers, Algeria', 180, '1m x 1.5m each', 'medium'],
  ['Lusaka Great East Road Unipole', 'Billboard', 'Lusaka, Zambia', 150, '12m x 6m', 'medium'],
  ['Harare Samora Machel Avenue Board', 'Billboard', 'Harare, Zimbabwe', 130, '9m x 4.5m', 'medium'],
  ['Gaborone Game City Mall Screens', 'Mall Media', 'Gaborone, Botswana', 120, 'Network of 6', 'medium'],
  ['Windhoek Independence Avenue Board', 'Billboard', 'Windhoek, Namibia', 110, '8m x 4m', 'medium'],
  ['Maputo Julius Nyerere Avenue Board', 'Billboard', 'Maputo, Mozambique', 140, '9m x 4.5m', 'medium'],
];

// Type-appropriate Pexels photos (visually verified) so placement cards show
// realistic imagery — billboards for billboards, terminals for airport ads…
const AD_TYPE_IMAGES: Record<string, string[]> = {
  'Billboard': [802024, 1580625, 1058759].map(pexels),
  'Digital Screen': [2506923, 2614818, 2372982].map(pexels),
  'Transit': [2031758, 3626589].map(pexels),
  'Mall Media': [264636, 2861656, 3962285].map(pexels),
  'Airport': [227690, 2033343, 358319].map(pexels),
  'Street Furniture': [374815, 2422588].map(pexels),
  'Stadium': [270085, 2263436].map(pexels),
  'Radio': [164829, 1054713, 744318].map(pexels),
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
