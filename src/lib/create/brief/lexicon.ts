// Words the brief reader understands. Plain data; longest phrase wins.
//
// This is a deterministic reader, like intent.ts and searchRank.ts: it costs
// nothing, cannot be rate-limited and returns the same brief for the same
// sentence. A model may later propose values for empty fields (decision D2);
// it will never replace this.

import type { Objective, Tier } from './types';

/** INDUSTRIES keys. A test checks every key exists and every profile has words. */
export const INDUSTRY_WORDS: Record<string, string[]> = {
  'restaurant-dining': ['restaurant', 'restaurants', 'fine dining', 'bistro', 'eatery', 'dining', 'bar and grill', 'lounge'],
  'quick-service-food': ['fast food', 'street food', 'suya', 'shawarma', 'food truck', 'food vendor', 'buka', 'takeaway', 'grill spot'],
  'cafe-bakery': ['cafe', 'coffee shop', 'bakery', 'pastry', 'cake shop', 'cakes', 'patisserie'],
  'hotel-hospitality': ['hotel', 'hotels', 'guesthouse', 'guest house', 'short let', 'shortlet', 'resort', 'lodge', 'bnb'],
  'skincare-beauty': ['skincare', 'skin care', 'beauty brand', 'cosmetics', 'cosmetic', 'serum', 'body butter', 'fragrance', 'perfume', 'makeup brand'],
  'salon-barber': ['salon', 'barber', 'barbershop', 'barbing', 'hair studio', 'braiding', 'nail studio', 'spa'],
  'fashion-apparel': ['fashion label', 'fashion brand', 'fashion house', 'clothing brand', 'clothing line', 'fashion', 'apparel', 'streetwear', 'boutique', 'ready to wear'],
  'tailoring-bridal': ['tailor', 'tailoring', 'bridal', 'aso oke', 'asoebi', 'wedding dress', 'bespoke suits'],
  'real-estate': ['real estate', 'estate agency', 'estate agent', 'realtor', 'property', 'properties', 'apartments', 'housing estate', 'land sale'],
  'law-finance-consulting': ['law firm', 'lawyer', 'chambers', 'accounting', 'accountant', 'audit firm', 'consulting', 'consultancy', 'tax'],
  'fintech-payments': ['fintech', 'payments app', 'payment app', 'wallet app', 'mobile money', 'pos', 'savings app', 'lending app'],
  'software-tech': ['software', 'saas', 'tech startup', 'startup', 'app launch', 'it company', 'ai product', 'tech company'],
  'events-conferences': ['conference', 'summit', 'tech conference', 'expo', 'trade fair', 'symposium', 'hackathon', 'seminar', 'webinar', 'workshop'],
  'music-nightlife': ['concert', 'gig', 'nightclub', 'club night', 'party', 'dj', 'festival', 'rave', 'album launch', 'listening party'],
  'faith-organisations': ['church', 'crusade', 'mosque', 'ministry', 'fellowship', 'revival', 'sunday service', 'convention'],
  'school-education': ['school', 'academy', 'college', 'university', 'tutoring', 'training centre', 'training center', 'admission', 'creche'],
  'clinic-health': ['clinic', 'hospital', 'dental', 'dentist', 'medical centre', 'medical center', 'optician', 'physiotherapy', 'diagnostics'],
  'pharmacy-wellness': ['pharmacy', 'chemist', 'drug store', 'supplements', 'wellness centre', 'wellness center'],
  'fitness-gym': ['gym', 'fitness', 'crossfit', 'yoga studio', 'personal trainer', 'bootcamp'],
  'retail-supermarket': ['supermarket', 'shop', 'store', 'mini mart', 'retail', 'gadget store', 'phone store', 'provision store'],
  'logistics-delivery': ['logistics', 'delivery', 'dispatch', 'courier', 'haulage', 'freight', 'ride hailing', 'movers'],
  'construction-trades': ['construction', 'builder', 'contractor', 'plumber', 'plumbing', 'electrician', 'carpentry', 'painter', 'engineering firm', 'cleaning service'],
  'agriculture-produce': ['farm', 'farms', 'agriculture', 'agro', 'produce', 'poultry', 'palm oil', 'rice brand', 'honey'],
  'automotive': ['car dealership', 'car dealer', 'cars', 'auto shop', 'mechanic', 'car wash', 'car hire', 'auto parts'],
  'ngo-community': ['ngo', 'charity', 'foundation', 'non profit', 'nonprofit', 'fundraiser', 'community group', 'outreach'],
};

/** NowOpen listing category names (data/categories.ts) to INDUSTRIES keys, for the signed-in default. */
export const CATEGORY_TO_INDUSTRY: Record<string, string> = {
  'Restaurant': 'restaurant-dining', 'Bar & Lounge': 'restaurant-dining', 'Fast Food': 'quick-service-food',
  'Suya & Grill': 'quick-service-food', 'Shawarma & Kebab': 'quick-service-food', 'Food Truck': 'quick-service-food',
  'Local Food Vendor': 'quick-service-food', 'Café & Bakery': 'cafe-bakery', 'Bakery & Pastry': 'cafe-bakery',
  'Hotel & Lodging': 'hotel-hospitality', 'Guesthouse & Short-let / B&B': 'hotel-hospitality',
  'Skincare Clinic': 'skincare-beauty', 'Perfume & Cosmetics Store': 'skincare-beauty',
  'Salon / Barber': 'salon-barber', 'Spa & Beauty': 'salon-barber', 'Hair Braiding Studio': 'salon-barber', 'Nail Studio': 'salon-barber',
  'Fashion & Apparel': 'fashion-apparel', 'Boutique': 'fashion-apparel', 'Tailor & Fashion Designer': 'tailoring-bridal',
  'Bridal & Wedding Services': 'tailoring-bridal', 'Real Estate': 'real-estate', 'Legal Services': 'law-finance-consulting',
  'Accounting & Tax': 'law-finance-consulting', 'Consulting': 'law-finance-consulting', 'Fintech & Payments': 'fintech-payments',
  'Software & IT': 'software-tech', 'Web & App Development': 'software-tech', 'Event Planning': 'events-conferences',
  'Music & Nightlife': 'music-nightlife', 'DJ & MC': 'music-nightlife', 'Religious Organization': 'faith-organisations',
  'School & Education': 'school-education', 'Training & Tutoring': 'school-education', 'Hospital & Clinic': 'clinic-health',
  'Dental Care': 'clinic-health', 'Pharmacy': 'pharmacy-wellness', 'Fitness & Gym': 'fitness-gym',
  'Retail Store': 'retail-supermarket', 'Supermarket': 'retail-supermarket', 'Grocery / Mini-Mart': 'retail-supermarket',
  'Courier & Dispatch': 'logistics-delivery', 'Logistics & Transport': 'logistics-delivery', 'Construction': 'construction-trades',
  'Agriculture': 'agriculture-produce', 'Automotive': 'automotive', 'Car Dealership': 'automotive', 'Non-profit & NGO': 'ngo-community',
};

/** Order matters only through phrase length: "grand opening" beats "opening". */
export const OBJECTIVE_WORDS: Record<Objective, string[]> = {
  identity: ['brand identity', 'visual identity', 'identity', 'rebrand', 'logo', 'brand kit', 'brand guidelines', 'branding'],
  launch: ['launch', 'launching', 'unveiling', 'new product', 'new collection', 'introducing', 'drop'],
  opening: ['opening', 'grand opening', 'now open', 'opening soon', 'new branch', 'new location', 'reopening'],
  sale: ['sale', 'discount', 'promo', 'promotion', 'offer', 'black friday', 'clearance', 'deal'],
  event: ['event', 'conference', 'summit', 'concert', 'party', 'wedding', 'crusade', 'seminar', 'festival', 'webinar', 'workshop'],
  recruit: ['hiring', 'vacancy', 'recruitment', 'job opening', 'admission', 'enrolment', 'enrollment', 'now enrolling'],
  inform: ['menu', 'price list', 'timetable', 'schedule', 'notice', 'opening hours', 'programme', 'agenda'],
  awareness: ['awareness', 'brand campaign', 'advert', 'advertise', 'advertising', 'ad'],
};

export const TIER_WORDS: Record<Tier, string[]> = {
  luxury: ['luxury', 'luxe', 'high end', 'highend', 'exclusive', 'upscale', 'couture', 'five star', '5 star'],
  premium: ['premium', 'classy', 'elegant', 'boutique', 'fine', 'posh', 'sophisticated'],
  value: ['affordable', 'cheap', 'budget', 'low cost', 'discount', 'bargain'],
  mid: [],
};

/** Places are kept as typed. This list only recognises them; it never supplies one. */
export const PLACE_WORDS: Record<string, string[]> = {
  'Lagos': ['lagos', 'lekki', 'ikoyi', 'victoria island', 'ikeja', 'yaba', 'surulere'],
  'Abuja': ['abuja', 'maitama', 'wuse', 'asokoro'],
  'Port Harcourt': ['port harcourt'], 'Ibadan': ['ibadan'], 'Kano': ['kano'], 'Enugu': ['enugu'], 'Benin City': ['benin city'],
  'Nigeria': ['nigeria', 'nigerian'],
  'Accra': ['accra'], 'Kumasi': ['kumasi'], 'Ghana': ['ghana', 'ghanaian'],
  'Nairobi': ['nairobi'], 'Mombasa': ['mombasa'], 'Kenya': ['kenya', 'kenyan'],
  'Kigali': ['kigali'], 'Rwanda': ['rwanda', 'rwandan'],
  'Johannesburg': ['johannesburg', 'joburg'], 'Cape Town': ['cape town'], 'South Africa': ['south africa', 'south african'],
  'Kampala': ['kampala'], 'Dar es Salaam': ['dar es salaam'], 'Addis Ababa': ['addis ababa'], 'Dakar': ['dakar'], 'Abidjan': ['abidjan'],
  'Africa': ['africa', 'african', 'pan african'],
};

export const AUDIENCE_WORDS: Record<string, string[]> = {
  'An international audience; English first, no local shorthand': ['international', 'global', 'worldwide', 'diaspora'],
  'Young adults, phone-first': ['youth', 'young people', 'gen z', 'students', 'teens'],
  'Families and parents': ['families', 'family', 'parents', 'kids', 'children'],
  'Business buyers and professionals': ['b2b', 'corporate clients', 'professionals', 'executives', 'investors'],
  'Women': ['women', 'ladies', 'for her'],
  'Men': ['men', 'gentlemen', 'for him'],
};

/** Style words to MOVEMENTS keys. A named movement is the customer's choice and goes first. */
export const MOVEMENT_WORDS: Record<string, string[]> = {
  'swiss-international': ['swiss', 'swiss style', 'grid based', 'helvetica style'],
  'bauhaus': ['bauhaus', 'geometric'],
  'luxury-minimalism': ['luxury minimal', 'luxury minimalism', 'quiet luxury'],
  'neo-brutalism': ['brutalist', 'brutalism', 'neo brutalism', 'raw'],
  'editorial': ['editorial', 'magazine style', 'magazine'],
  'contemporary-maximalism': ['maximalist', 'maximalism', 'busy', 'colourful', 'colorful'],
  'afro-contemporary': ['afro', 'afrocentric', 'afro contemporary', 'ankara', 'african print'],
  'african-modernism': ['african modernism', 'african modern'],
  'retro-futurism': ['retro', 'retro futurism', 'space age', 'futuristic retro'],
  'corporate-precision': ['corporate', 'formal', 'official'],
  'analog-experimental': ['hand made', 'handmade', 'zine', 'photocopy', 'grunge'],
  'cgi-3d': ['3d', 'cgi', 'render', 'rendered'],
  'art-deco': ['art deco', 'deco', 'gatsby'],
  'japanese-minimalism': ['japanese', 'zen', 'japandi'],
  'y2k-psychedelic': ['y2k', 'psychedelic', 'trippy', 'chrome'],
  'organic-natural': ['organic', 'natural', 'earthy', 'botanical'],
  'kinetic-typography': ['kinetic', 'animated type', 'motion type'],
  'memphis': ['memphis', 'squiggle', 'playful shapes'],
  'constructivism': ['constructivist', 'constructivism', 'propaganda style'],
  'heritage-craft': ['heritage', 'vintage', 'traditional', 'classic', 'artisan'],
  'information-design': ['infographic', 'data led', 'timetable style'],
  'monochrome-photographic': ['black and white', 'monochrome', 'b w'],
  'gradient-futurism': ['gradient', 'futuristic', 'glow', 'neon'],
  'collage': ['collage', 'cut out', 'cutout'],
  'typographic-monumentalism': ['big type', 'huge text', 'typography only', 'type only', 'text only'],
};

/** Movement groups a general style word points at, when no movement is named. */
export const DIRECTION_TO_MOVEMENTS: Record<string, string[]> = {
  luxury: ['luxury-minimalism', 'art-deco', 'heritage-craft'],
  minimal: ['swiss-international', 'japanese-minimalism', 'organic-natural'],
  corporate: ['corporate-precision', 'information-design'],
  editorial: ['editorial', 'monochrome-photographic', 'african-modernism'],
  bold: ['typographic-monumentalism', 'neo-brutalism', 'kinetic-typography'],
  contemporary: ['afro-contemporary', 'gradient-futurism', 'retro-futurism'],
  playful: ['memphis', 'contemporary-maximalism', 'y2k-psychedelic'],
};

/** Words that mean several pieces of one kind. */
export const SERIES_WORDS = ['posts', 'social posts', 'series', 'set of', 'carousel', 'stories', 'flyers', 'posters', 'banners', 'cards', 'creatives', 'countdown'];
/** Words that mean a whole system of different pieces. */
export const SYSTEM_WORDS = ['brand identity', 'visual identity', 'identity', 'rebrand', 'branding', 'brand kit', 'campaign', 'full set', 'every size', 'conference identity', 'event branding'];

/** Deliverable phrases searchRank does not carry. Keys are SUBCATEGORIES keys. */
export const DELIVERABLE_EXTRA: Record<string, string[]> = {
  'instagram-post': ['posts', 'social posts', 'social media posts', 'instagram posts', 'facebook post', 'linkedin post'],
  'billboard-48-sheet': ['48 sheet billboard', '48 sheet'],
  'speaker-card': ['speaker card', 'speaker cards', 'speaker post'],
  'hang-tag': ['hang tag', 'swing tag'],
  'product-label': ['product label', 'bottle label', 'jar label', 'packaging label'],
  'brand-guidelines': ['brand guidelines', 'brand guide', 'style guide'],
  'story': ['instagram story', 'status'],
  'reels-cover': ['reels cover', 'reel cover'],
  'shopfront-sign': ['shop sign', 'signboard', 'shopfront sign'],
  'menu': ['food menu', 'drinks menu'],
};
