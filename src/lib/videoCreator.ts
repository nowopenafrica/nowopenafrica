// NowOpen Studio — AI Video Creator.
//
// The "AI Video Director" for African businesses. Turns "I own a laundry in
// Lekki and want to attract young professionals with a weekend pickup and
// delivery promo" into a complete, shootable 30-second video: hook, scene-by-
// scene storyboard, voiceover, captions, hashtags, music, style, subtitles,
// thumbnail, predicted performance and creative-director feedback.
//
// Everything is deterministic (seeded by the business + topic) so the same
// brief always produces the same video, and pure enough to unit-test.

import { Business } from '../types';

// --- Types ------------------------------------------------------------------

export type VideoGoal =
  | 'sales' | 'calls' | 'bookings' | 'recruit' | 'property'
  | 'event' | 'launch' | 'awareness' | 'brand';

export type VideoFormat =
  | 'Reel 15' | 'Reel 30' | 'Story' | 'Landscape' | 'Square'
  | 'Product Spotlight' | 'Property Tour' | 'Food Commercial'
  | 'Service Explainer' | 'Countdown' | 'Event' | 'Customer Review'
  | 'Before & After' | 'Daily Post';

export type CreatorType =
  | 'promote' | 'product' | 'review' | 'before-after' | 'countdown'
  | 'event' | 'property' | 'food' | 'service' | 'daily';

export type MediaPick = 'upload' | 'ai' | 'stock';

export interface VideoScene {
  id: string;
  seconds: number;
  text: string;
  direction: string;
  voiceover: string;
  transition: string;
  media: MediaPick;
}

export interface UploadMedia {
  name: string;
  url: string;
  type: 'image' | 'video';
}

export interface PredictionMetric {
  label: string;
  stars: number;
}

export interface Prediction {
  stars: number;
  metrics: PredictionMetric[];
  improvements: string[];
}

export interface VideoProject {
  id: string;
  title: string;
  creator: CreatorType;
  industryKey: string;
  goal: VideoGoal;
  format: VideoFormat;
  topic: string;
  hook: string;
  cta: string;
  scenes: VideoScene[];
  caption: string;
  hashtags: string[];
  music: string;
  style: string;
  subtitle: string;
  voiceover: string;
  thumbnail: string;
  prediction: Prediction;
  coach: string[];
  upload?: UploadMedia;
  status: 'draft' | 'scheduled' | 'published';
  createdAt: string;
  /** Id of the AI Creative Director brief that produced this project, when any. */
  briefId?: string;
  /** Key of the free AI video model used to generate this project (see videoModels.ts). */
  model?: string;
}

export interface VideoCreatorInput {
  creator: CreatorType;
  industryKey: string;
  goal: VideoGoal;
  format: VideoFormat;
  topic: string;
  media: MediaPick;
  upload?: UploadMedia;
  voiceover: string;
  subtitle: string;
  style: string;
  music: string;
  market: string;
  /** Optional hook override — the Creative Agency Mode hook generator uses this
   * to pin a specific opener without re-seeding the rest of the plan. */
  hook?: string;
}

// --- Industries -------------------------------------------------------------

export interface VideoIndustry {
  key: string;
  label: string;
  emoji: string;
  promote: string[];
  focus: string;
  setting: string;
  closeup: string;
  promise: string;
  hooks: string[];
  hashtags: string[];
  stock: string[];
  palette: [string, string];
}

export const VIDEO_INDUSTRIES: VideoIndustry[] = [
  {
    key: 'restaurant', label: 'Restaurant', emoji: '🍽️',
    promote: ['New menu', 'Weekend offer', 'New branch', 'Customer testimonial', "Valentine's", 'Christmas', 'Eid', 'Independence Day'],
    focus: 'your signature dish', setting: 'the kitchen at peak service', closeup: 'steam rising off the grill', promise: 'the best bite in town',
    hooks: ['You are hungry now.', 'Lunch just got better.', 'Your next favourite meal is here.'],
    hashtags: ['#Foodie', '#NigerianFood', '#LocalEats', '#NowOpenAfrica'],
    stock: ['Grilled platter on rustic wood', 'Steaming bowl of soup', 'Chef plating in the kitchen'],
    palette: ['#ea580c', '#facc15'],
  },
  {
    key: 'salon', label: 'Salon & Barber', emoji: '💇‍♀️',
    promote: ['New stylist', 'Hair packages', 'Weekend slots', 'Before & after', 'Student discount'],
    focus: 'your new look', setting: 'the salon chair', closeup: 'fresh colour and shine', promise: 'leave feeling brand new',
    hooks: ['Your glow-up starts here.', 'Swipe for the reveal.', 'Book your seat before it is gone.'],
    hashtags: ['#Beauty', '#GlowUp', '#SelfCare', '#NowOpenAfrica'],
    stock: ['Hair styling in motion', 'Fresh blow-dry finish', 'Colour mixing close-up'],
    palette: ['#be185d', '#f0abfc'],
  },
  {
    key: 'hotel', label: 'Hotel & Lodge', emoji: '🏨',
    promote: ['Weekend stay', 'New rooms', 'Conference packages', 'Honeymoon special', 'Last-minute deal'],
    focus: 'your staycation', setting: 'the lobby and the rooms', closeup: 'the view from the balcony', promise: 'a weekend you will not forget',
    hooks: ['Pack your bag — this is calling.', 'The view sells itself.', 'Weekend, sorted.'],
    hashtags: ['#Staycation', '#TravelAfrica', '#WeekendGetaway', '#NowOpenAfrica'],
    stock: ['Hotel room with sunset light', 'Pool at golden hour', 'Freshly made bed'],
    palette: ['#0f766e', '#eab308'],
  },
  {
    key: 'real-estate', label: 'Real Estate', emoji: '🏠',
    promote: ['New listing', 'Pre-launch', 'Rentals', 'Land sale', 'House hunting'],
    focus: 'this property', setting: 'the exterior and interiors', closeup: 'the finishing touches', promise: 'a place to call home',
    hooks: ['Welcome to your new home.', 'This one will not last long.', 'Look inside — you will want it.'],
    hashtags: ['#RealEstate', '#PropertyLagos', '#HomeGoals', '#NowOpenAfrica'],
    stock: ['Living room with natural light', 'Kitchen marble finishes', 'Building exterior at dusk'],
    palette: ['#1e3a5f', '#b45309'],
  },
  {
    key: 'fashion', label: 'Fashion & Apparel', emoji: '👗',
    promote: ['New collection', 'Sale drop', 'Custom fits', 'Ready-to-wear', 'Accessories'],
    focus: 'this collection', setting: 'the storefront', closeup: 'the fabric and fit', promise: 'a wardrobe upgrade',
    hooks: ['Outfit goals, unlocked.', 'You need this in your wardrobe.', 'Style, sorted.'],
    hashtags: ['#Fashion', '#StyleInspo', '#OOTD', '#NowOpenAfrica'],
    stock: ['Garment detail on a hanger', 'Model wearing the look', 'Fabric texture close-up'],
    palette: ['#7c3aed', '#ec4899'],
  },
  {
    key: 'laundry', label: 'Laundry', emoji: '🧺',
    promote: ['Pickup & delivery', 'Express service', 'New branch', 'Student plans', 'Free pickup'],
    focus: 'fresh, crisp laundry', setting: 'the wash floor', closeup: 'folded, pressed clothes', promise: 'your laundry, done right',
    hooks: ['Your weekends, back.', 'We pick up. We deliver.', 'Never fold again.'],
    hashtags: ['#Laundry', '#TimeSaver', '#Convenience', '#NowOpenAfrica'],
    stock: ['Neatly folded towels', 'Steam pressing a shirt', 'Clean pile on a bed'],
    palette: ['#0891b2', '#0ea5e9'],
  },
  {
    key: 'car-wash', label: 'Car Wash', emoji: '🚗',
    promote: ['Full detail', 'Express wash', 'Ceramic coating', 'Monthly plans', 'Free inspection'],
    focus: 'a showroom-clean car', setting: 'the wash bay', closeup: 'soap and shine', promise: 'drive out looking new',
    hooks: ['Dirty car? Not for long.', 'Watch this transformation.', 'Showroom shine, guaranteed.'],
    hashtags: ['#CarWash', '#Detailing', '#CarCare', '#NowOpenAfrica'],
    stock: ['Foam washing a car', 'Polishing the bonnet', 'Glossy wheel close-up'],
    palette: ['#0f172a', '#22d3ee'],
  },
  {
    key: 'pharmacy', label: 'Pharmacy & Health', emoji: '💊',
    promote: ['New stock', 'Health checks', 'Free delivery', 'Wellness bundles', '24hr service'],
    focus: 'the essentials you need', setting: 'the shelves', closeup: 'the products up close', promise: 'trusted care, nearby',
    hooks: ['Your health, close by.', 'Stocked, ready, trusted.', 'Skip the rush — order ahead.'],
    hashtags: ['#Health', '#Wellness', '#Care', '#NowOpenAfrica'],
    stock: ['Pharmacy shelves, tidy', 'Medication close-up', 'Pharmacist in white coat'],
    palette: ['#15803d', '#0ea5e9'],
  },
  {
    key: 'church', label: 'Church', emoji: '⛪',
    promote: ['This weekend service', 'New series', 'Youth program', 'Convention', 'Outreach'],
    focus: 'this weekend service', setting: 'the congregation', closeup: 'worship in motion', promise: 'a place to belong',
    hooks: ['You belong here.', 'This Sunday will be different.', 'Come as you are.'],
    hashtags: ['#Church', '#Worship', '#Faith', '#NowOpenAfrica'],
    stock: ['Worshipers raising hands', 'Sunlit church interior', 'Choir in harmony'],
    palette: ['#1e3a5f', '#eab308'],
  },
  {
    key: 'school', label: 'School & Learning', emoji: '🎓',
    promote: ['Admissions open', 'New session', 'Summer classes', 'Scholarships', 'Open day'],
    focus: 'the classroom experience', setting: 'students at work', closeup: 'smiles and focus', promise: 'an education that counts',
    hooks: ['Admissions are open.', 'Watch them grow.', 'The future starts here.'],
    hashtags: ['#Education', '#AdmissionsOpen', '#Learning', '#NowOpenAfrica'],
    stock: ['Students in class', 'Teacher at the board', 'Children reading together'],
    palette: ['#2563eb', '#facc15'],
  },
  {
    key: 'auto', label: 'Auto & Mechanics', emoji: '🚙',
    promote: ['Vehicle for sale', 'Full service', 'Diagnostics', 'Spare parts', 'Express repair'],
    focus: 'this vehicle', setting: 'the workshop floor', closeup: 'the engine and interior', promise: 'drive away happy',
    hooks: ['Trouble? We fix it.', 'Check out this beauty.', 'Your car is in good hands.'],
    hashtags: ['#Auto', '#Mechanic', '#CarService', '#NowOpenAfrica'],
    stock: ['Engine bay close-up', 'Mechanic at work', 'Vehicle on the ramp'],
    palette: ['#334155', '#f97316'],
  },
  {
    key: 'fitness', label: 'Gym & Fitness', emoji: '💪',
    promote: ['Membership', 'Personal training', 'New classes', 'Transformation', 'Weekend bootcamp'],
    focus: 'the workout', setting: 'the training floor', closeup: 'form and effort', promise: 'results you can feel',
    hooks: ['No excuses today.', 'Join the transformation.', 'Stronger, every day.'],
    hashtags: ['#Fitness', '#GymLife', '#TrainHard', '#NowOpenAfrica'],
    stock: ['Athlete mid-lift', 'Gym floor energy', 'Hands chalked up'],
    palette: ['#ea580c', '#0f172a'],
  },
  {
    key: 'beauty', label: 'Beauty & Spa', emoji: '💄',
    promote: ['Facials', 'Nails', 'Massage', 'Bridal packages', 'Skin products'],
    focus: 'the treatment', setting: 'the treatment room', closeup: 'glowing skin', promise: 'your glow-up starts here',
    hooks: ['Self-care, booked.', 'Glow, delivered.', 'Treat yourself today.'],
    hashtags: ['#Beauty', '#Spa', '#Skincare', '#NowOpenAfrica'],
    stock: ['Spa towels and candles', 'Facial in progress', 'Nail polish close-up'],
    palette: ['#db2777', '#f9a8d4'],
  },
  {
    key: 'agency', label: 'Agency & Creative', emoji: '🎬',
    promote: ['Brand campaigns', 'Social media', 'Photography', 'Video production', 'Design'],
    focus: 'the campaign', setting: 'the team at work', closeup: 'the craft', promise: 'ideas that get results',
    hooks: ['Your brand, elevated.', 'We make brands impossible to ignore.', 'Creativity, on demand.'],
    hashtags: ['#Creative', '#Marketing', '#Branding', '#NowOpenAfrica'],
    stock: ['Team brainstorming', 'Camera on set', 'Designer at the screen'],
    palette: ['#0f172a', '#7c3aed'],
  },
];

export const industryByKey = (key: string): VideoIndustry =>
  VIDEO_INDUSTRIES.find((i) => i.key === key) ?? VIDEO_INDUSTRIES[0];

// --- Category → industry mapping ---------------------------------------------

const INDUSTRY_MATCHERS: [RegExp, string][] = [
  [/restaurant|fast food|caf[eé]|grill|barbecue|bbq|eatery|food|bakery|buka|suya|pepper soup|\bbar\b/i, 'restaurant'],
  [/hotel|lodge|guest house|shortlet|apartment|inn|resort|airbnb/i, 'hotel'],
  [/real estate|property|estate|housing|land|agent/i, 'real-estate'],
  [/fashion|apparel|cloth|tailor|attire|jewel(?:l)?ery|accessor|shoes|beads|wig/i, 'fashion'],
  [/laundry|dry clean|washer/i, 'laundry'],
  [/car wash|detailing|auto.*wash/i, 'car-wash'],
  [/pharmac|drug store|chemist|medical|clinic|hospital|health|dental|optical|vet/i, 'pharmacy'],
  [/church|ministr|chapel|mosque|fellowship/i, 'church'],
  [/school|academ|tutor|educa|learn|train(?:ing)?|university|college|creche|childcare|daycare|nursery/i, 'school'],
  [/auto|mechanic|repair|spare part|tyre|tire|garage|workshop|gadget|phone repair/i, 'auto'],
  [/gym|fitness|sport|workout|yoga/i, 'fitness'],
  [/beauty|spa|skincare|makeup|make-up|cosmetic|nails|lash/i, 'beauty'],
  [/salon|barber|hair|braid|styling/i, 'salon'],
  [/agenc|creative|design|media|marketing|advert|photograph|videograph|studio|events?|cater|printer/i, 'agency'],
];

// Best-fit industry key for a business category string (free-text from the
// directory), so the video director can pick the right focus, setting, hooks
// and hashtags. Falls back to the generic "Agency & Creative" profile.
export function industryKeyForCategory(category: string): string {
  const match = INDUSTRY_MATCHERS.find(([re]) => re.test(category || ''));
  return match ? match[1] : 'agency';
}

// --- Goals ------------------------------------------------------------------

export interface VideoGoalMeta {
  key: VideoGoal;
  label: string;
  desc: string;
  ctas: string[];
  music: string;
  style: string;
}

export const VIDEO_GOALS: VideoGoalMeta[] = [
  { key: 'sales', label: 'Get sales', desc: 'Drive orders and revenue', ctas: ['Order on WhatsApp today', 'Shop now before it is gone', 'Message us to order'], music: 'Upbeat afrobeats', style: 'Energy' },
  { key: 'calls', label: 'Get calls', desc: 'Fill the phone line', ctas: ['Call us now', 'Dial us for today’s offer', 'Call before it sells out'], music: 'Confident acoustic', style: 'Corporate' },
  { key: 'bookings', label: 'Get bookings', desc: 'Fill slots and seats', ctas: ['Book your slot today', 'Reserve now — seats are limited', 'Book on WhatsApp'], music: 'Soft keys', style: 'Minimal' },
  { key: 'recruit', label: 'Recruit staff', desc: 'Find the right team', ctas: ['Send your CV on WhatsApp', 'Apply today', 'Message us to apply'], music: 'Clean modern synth', style: 'Corporate' },
  { key: 'property', label: 'Sell property', desc: 'Move listings fast', ctas: ['Book a viewing today', 'Call for the price', 'Inquire about this property'], music: 'Slow cinematic strings', style: 'Luxury Real Estate' },
  { key: 'event', label: 'Event promotion', desc: 'Fill the room', ctas: ['Get your ticket now', 'RSVP on WhatsApp', 'Save your seat today'], music: 'High-energy drum loop', style: 'Event Energy' },
  { key: 'launch', label: 'Product launch', desc: 'Debuts and drops', ctas: ['Be the first to try it', 'Pre-order today', 'Get yours at launch'], music: 'Trendy pop hook', style: 'Modern African' },
  { key: 'awareness', label: 'Awareness', desc: 'Get discovered', ctas: ['Follow for more', 'Share this with a friend', 'Save this post'], music: 'Lo-fi chill', style: 'Minimal' },
  { key: 'brand', label: 'Brand story', desc: 'Who you are', ctas: ['Visit us today', 'Come say hello', 'Find us on NowOpen Africa'], music: 'Gentle acoustic guitar', style: 'Cinematic' },
];

export const goalByKey = (key: VideoGoal): VideoGoalMeta =>
  VIDEO_GOALS.find((g) => g.key === key) ?? VIDEO_GOALS[0];

// --- Formats ----------------------------------------------------------------

export interface VideoFormatMeta {
  key: VideoFormat;
  label: string;
  seconds: number;
  size: string;
  desc: string;
}

export const VIDEO_FORMATS: VideoFormatMeta[] = [
  { key: 'Reel 15', label: 'Reel (15s)', seconds: 15, size: '1080×1920', desc: 'Hook + value + CTA. Instagram & TikTok.' },
  { key: 'Reel 30', label: 'Reel (30s)', seconds: 30, size: '1080×1920', desc: 'More story, same punch.' },
  { key: 'Story', label: 'Story', seconds: 12, size: '1080×1920', desc: 'Fast, swipe-up friendly.' },
  { key: 'Landscape', label: 'Landscape', seconds: 30, size: '1920×1080', desc: 'YouTube & Facebook.' },
  { key: 'Square', label: 'Square', seconds: 15, size: '1080×1080', desc: 'Feed posts & LinkedIn.' },
  { key: 'Product Spotlight', label: 'Product Spotlight', seconds: 18, size: '1080×1920', desc: 'One product, star treatment.' },
  { key: 'Property Tour', label: 'Property Tour', seconds: 24, size: '1920×1080', desc: 'Walkthrough with a drone feel.' },
  { key: 'Food Commercial', label: 'Food Commercial', seconds: 20, size: '1080×1920', desc: 'Appetising close-ups.' },
  { key: 'Service Explainer', label: 'Service Explainer', seconds: 24, size: '1080×1920', desc: 'Problem → how it works → CTA.' },
  { key: 'Countdown', label: 'Promo Countdown', seconds: 18, size: '1080×1920', desc: 'Urgency that converts.' },
  { key: 'Event', label: 'Event', seconds: 18, size: '1080×1920', desc: 'Hype the next big moment.' },
  { key: 'Customer Review', label: 'Customer Review', seconds: 20, size: '1080×1920', desc: 'Reviews as animated video.' },
  { key: 'Before & After', label: 'Before & After', seconds: 18, size: '1080×1920', desc: 'Transformations that sell.' },
  { key: 'Daily Post', label: 'Daily Post', seconds: 10, size: '1080×1920', desc: 'Consistent daily content.' },
];

export const formatByKey = (key: VideoFormat): VideoFormatMeta =>
  VIDEO_FORMATS.find((f) => f.key === key) ?? VIDEO_FORMATS[0];

// --- Creators ---------------------------------------------------------------

export interface CreatorMeta {
  key: CreatorType;
  label: string;
  emoji: string;
  desc: string;
  format: VideoFormat;
}

export const CREATORS: CreatorMeta[] = [
  { key: 'promote', label: 'Promote my business', emoji: '📣', desc: 'A polished promo for your offer or branch.', format: 'Reel 15' },
  { key: 'product', label: 'Product spotlight', emoji: '📦', desc: 'One product, star treatment.', format: 'Product Spotlight' },
  { key: 'property', label: 'Property tour', emoji: '🏠', desc: 'Photos become a luxury walkthrough.', format: 'Property Tour' },
  { key: 'food', label: 'Food commercial', emoji: '🍽️', desc: 'Turn a few photos into a premium ad.', format: 'Food Commercial' },
  { key: 'review', label: 'Customer review', emoji: '⭐', desc: 'A testimonial turned into animated video.', format: 'Customer Review' },
  { key: 'before-after', label: 'Before & after', emoji: '✨', desc: 'Transformations that sell themselves.', format: 'Before & After' },
  { key: 'countdown', label: 'Promo countdown', emoji: '⏳', desc: 'Urgency: sale ends tonight, 3 days left…', format: 'Countdown' },
  { key: 'event', label: 'Event video', emoji: '🎉', desc: 'Church, wedding, concert, launch, school.', format: 'Event' },
  { key: 'service', label: 'Service explainer', emoji: '🧰', desc: 'Explain what you do in 24 seconds.', format: 'Service Explainer' },
  { key: 'daily', label: 'Daily content', emoji: '📅', desc: 'A quick post to keep you consistent.', format: 'Daily Post' },
];

export const creatorByKey = (key: CreatorType): CreatorMeta =>
  CREATORS.find((c) => c.key === key) ?? CREATORS[0];

// --- Styles, subtitles, voiceovers, music ------------------------------------

export const VIDEO_STYLES: { key: string; label: string; desc: string }[] = [
  { key: 'cinematic', label: 'Cinematic', desc: 'Apple TV+ feel — slow, clean, filmic.' },
  { key: 'energy', label: 'High energy', desc: 'Nike vibes — punchy cuts, bold type.' },
  { key: 'dramatic', label: 'Dramatic', desc: 'Netflix style — dark, moody, branded.' },
  { key: 'luxury', label: 'Luxury', desc: 'Slow, elegant, premium.' },
  { key: 'minimal', label: 'Minimal', desc: 'Clean type, lots of space.' },
  { key: 'corporate', label: 'Corporate', desc: 'Structured and credible.' },
  { key: 'luxury-real-estate', label: 'Luxury Real Estate', desc: 'Wide pans, quiet luxury.' },
  { key: 'fashion', label: 'Fashion', desc: 'Fast cuts, editorial energy.' },
  { key: 'food', label: 'Food', desc: 'Warm, close-up, appetising.' },
  { key: 'sports', label: 'Sports', desc: 'High tempo, sweat and drive.' },
  { key: 'technology', label: 'Technology', desc: 'Futuristic, sharp.' },
  { key: 'church', label: 'Church', desc: 'Warm, uplifting, reverent.' },
  { key: 'healthcare', label: 'Healthcare', desc: 'Clean, trustworthy, calm.' },
  { key: 'travel', label: 'Travel', desc: 'Wanderlust, golden hours.' },
  { key: 'afrobeats', label: 'Afrobeats', desc: 'Vibrant, rhythmic, colourful.' },
  { key: 'modern-african', label: 'Modern African', desc: 'Bold patterns, cultural pride.' },
];

export const SUBTITLE_STYLES: { key: string; label: string; desc: string }[] = [
  { key: 'apple', label: 'Apple style', desc: 'Big, rounded, clean.' },
  { key: 'netflix', label: 'Netflix style', desc: 'Bold with a colour highlight.' },
  { key: 'tiktok', label: 'TikTok style', desc: 'Animated pop words.' },
  { key: 'premium', label: 'Premium', desc: 'Gold serif captions.' },
  { key: 'minimal', label: 'Minimal', desc: 'Sans-serif, small, precise.' },
  { key: 'emoji', label: 'Emoji captions', desc: 'Words with emoji accents.' },
];

export const VOICEOVER_OPTIONS: { key: string; label: string; gender: 'Male' | 'Female'; accent: string }[] = [
  { key: 'male-nigerian', label: 'Male · Nigerian English', gender: 'Male', accent: 'Nigerian English' },
  { key: 'female-nigerian', label: 'Female · Nigerian English', gender: 'Female', accent: 'Nigerian English' },
  { key: 'male-kenyan', label: 'Male · Kenyan English', gender: 'Male', accent: 'Kenyan English' },
  { key: 'female-kenyan', label: 'Female · Kenyan English', gender: 'Female', accent: 'Kenyan English' },
  { key: 'male-southafrican', label: 'Male · South African English', gender: 'Male', accent: 'South African English' },
  { key: 'female-southafrican', label: 'Female · South African English', gender: 'Female', accent: 'South African English' },
  { key: 'male-ghanaian', label: 'Male · Ghanaian English', gender: 'Male', accent: 'Ghanaian English' },
  { key: 'female-ghanaian', label: 'Female · Ghanaian English', gender: 'Female', accent: 'Ghanaian English' },
  { key: 'male-american', label: 'Male · American', gender: 'Male', accent: 'American' },
  { key: 'female-american', label: 'Female · American', gender: 'Female', accent: 'American' },
  { key: 'male-british', label: 'Male · British', gender: 'Male', accent: 'British' },
  { key: 'female-british', label: 'Female · British', gender: 'Female', accent: 'British' },
  { key: 'female-french', label: 'Female · French', gender: 'Female', accent: 'French' },
  { key: 'male-arabic', label: 'Male · Arabic', gender: 'Male', accent: 'Arabic' },
  { key: 'female-swahili', label: 'Female · Swahili', gender: 'Female', accent: 'Swahili' },
  { key: 'female-yoruba', label: 'Female · Yoruba', gender: 'Female', accent: 'Yoruba' },
  { key: 'male-igbo', label: 'Male · Igbo', gender: 'Male', accent: 'Igbo' },
  { key: 'male-hausa', label: 'Male · Hausa', gender: 'Male', accent: 'Hausa' },
];

export const MUSIC_OPTIONS: { key: string; label: string }[] = [
  { key: 'afrobeats', label: 'Upbeat afrobeats' },
  { key: 'amapiano', label: 'Amapiano groove' },
  { key: 'highlife', label: 'Highlife classic' },
  { key: 'kwaito', label: 'Kwaito energy' },
  { key: 'bongo', label: 'Bongo flava' },
  { key: 'cinematic', label: 'Slow cinematic strings' },
  { key: 'piano', label: 'Soft piano' },
  { key: 'acoustic', label: 'Gentle acoustic guitar' },
  { key: 'lofi', label: 'Lo-fi chill' },
  { key: 'synth', label: 'Clean modern synth' },
  { key: 'drum', label: 'High-energy drum loop' },
  { key: 'pop', label: 'Trendy pop hook' },
  { key: 'ambient', label: 'Understated ambient' },
];

// --- Countdown & event templates --------------------------------------------

export const COUNTDOWN_TEMPLATES: { key: string; label: string; emoji: string; lines: string[] }[] = [
  { key: '3-days', label: '3 days left', emoji: '⏳', lines: ['3 days left', 'Then it is gone', 'Miss it, regret it'] },
  { key: 'tonight', label: 'Sale ends tonight', emoji: '🌙', lines: ['Sale ends tonight', 'Tonight only', 'Do not sleep on this'] },
  { key: 'black-friday', label: 'Black Friday', emoji: '🛍️', lines: ['Black Friday is here', 'Biggest deals of the year', 'While stock lasts'] },
  { key: 'christmas', label: 'Christmas', emoji: '🎄', lines: ['Christmas is coming', 'Gifts sorted in one place', 'Warm wishes, big offers'] },
  { key: 'ramadan', label: 'Ramadan', emoji: '🌙', lines: ['Ramadan Mubarak', 'Iftar specials available', 'Pre-order for the family'] },
  { key: 'easter', label: 'Easter', emoji: '🐣', lines: ['Easter is here', 'Family specials', 'Book your table today'] },
  { key: 'back-to-school', label: 'Back to school', emoji: '🎒', lines: ['Back to school', 'Everything you need', 'Student prices today'] },
];

export const EVENT_TEMPLATES: { key: string; label: string; emoji: string; lines: string[] }[] = [
  { key: 'church', label: 'Church service', emoji: '⛪', lines: ['You belong here', 'This Sunday, 9AM', 'Come as you are'] },
  { key: 'wedding', label: 'Wedding', emoji: '💍', lines: ['Save the date', 'A day to remember', 'Join us to celebrate'] },
  { key: 'conference', label: 'Conference', emoji: '🎤', lines: ['The big day is close', 'Speakers you will love', 'Get your seat now'] },
  { key: 'concert', label: 'Concert', emoji: '🎶', lines: ['Get ready', 'The lineup drops now', 'Tickets are moving'] },
  { key: 'birthday', label: 'Birthday', emoji: '🎂', lines: ['Another year, another party', 'Come celebrate with us', 'Your table is waiting'] },
  { key: 'school', label: 'School event', emoji: '🏫', lines: ['Open day this weekend', 'Meet the teachers', 'Bring the family'] },
  { key: 'launch', label: 'Business launch', emoji: '🎊', lines: ['The wait is over', 'We open our doors', 'Come and celebrate'] },
];

// --- Generic hooks & CTAs ----------------------------------------------------

export const GENERIC_HOOKS: string[] = [
  'Stop scrolling — this is for you.',
  'You have to see this.',
  'Wait for the end.',
  'Only in {location}.',
  'Do not sleep on this one.',
  'We know what you need today.',
  'Three seconds and you are hooked.',
  'This changes everything in {location}.',
  'Tell me this is not what you have been waiting for.',
  'Save this for later.',
  'POV: you just found your new favourite.',
  'Bet you did not expect this.',
  'Here is why everyone is talking about us.',
  'Your next favourite is right here.',
  'We made something you will love.',
  'This is {location}’s best kept secret.',
  'Keep watching — it gets better.',
  'Real talk: you need this today.',
  'You asked, we delivered.',
  'The wait is over.',
];

export const COUNTDOWN_HOOKS: string[] = [
  'Time is running out.',
  'The clock is ticking.',
  'Miss it, and you will regret it.',
  'Last chance — really.',
  'The offer is about to vanish.',
];

// --- Campaigns & trends -----------------------------------------------------

export interface CampaignPlan {
  occasion: string;
  industry: string;
  theme: string;
  counts: { reels: number; stories: number; posters: number; flyers: number };
  emailSubject: string;
  emailBody: string;
  sms: string;
  landingHeadline: string;
  landingSub: string;
  bestTimes: string;
  budgetHint: string;
  hashtags: string[];
}

export interface CampaignOccasion {
  key: string;
  label: string;
  emoji: string;
  theme: string;
  emailSubject: string;
  landingHeadline: string;
}

export const CAMPAIGN_OCCASIONS: CampaignOccasion[] = [
  { key: 'christmas', label: 'Christmas', emoji: '🎄', theme: 'Festive generosity — gift ideas and family offers', emailSubject: '🎄 Christmas at {name} — gifts, sorted', landingHeadline: 'Christmas made easy at {name}' },
  { key: 'black-friday', label: 'Black Friday', emoji: '🛍️', theme: 'Maximum urgency, biggest discounts of the year', emailSubject: '🖤 BLACK FRIDAY at {name}', landingHeadline: 'Black Friday deals are live' },
  { key: 'new-year', label: 'New Year', emoji: '🎉', theme: 'Fresh start offers and resolutions', emailSubject: '🎉 New year, new offers at {name}', landingHeadline: 'Start the new year right' },
  { key: 'ramadan', label: 'Ramadan', emoji: '🌙', theme: 'Iftar specials, family bundles and goodwill', emailSubject: '🌙 Ramadan specials at {name}', landingHeadline: 'Iftar, made easier' },
  { key: 'easter', label: 'Easter', emoji: '🐣', theme: 'Family gatherings and weekend specials', emailSubject: '🐣 Easter weekend at {name}', landingHeadline: 'Easter family specials' },
  { key: 'independence', label: 'Independence Day', emoji: '🇳🇬', theme: 'Proud, local, one-nation offers', emailSubject: '🇳🇬 Celebrate with {name}', landingHeadline: 'Proudly local this Independence Day' },
  { key: 'valentines', label: 'Valentine’s', emoji: '❤️', theme: 'Romance, couples’ deals and gifts', emailSubject: '❤️ Valentine’s specials at {name}', landingHeadline: 'Say it with {name}' },
  { key: 'back-to-school', label: 'Back to School', emoji: '🎒', theme: 'School essentials, student prices', emailSubject: '🎒 Back to school at {name}', landingHeadline: 'Ready for school, ready for less' },
];

export const occasionByKey = (key: string): CampaignOccasion =>
  CAMPAIGN_OCCASIONS.find((o) => o.key === key) ?? CAMPAIGN_OCCASIONS[0];

export interface Trend {
  topic: string;
  hook: string;
  audio: string;
  hashtags: string[];
}

export const TREND_MARKETS: { key: string; label: string; flag: string }[] = [
  { key: 'nigeria', label: 'Nigeria', flag: '🇳🇬' },
  { key: 'kenya', label: 'Kenya', flag: '🇰🇪' },
  { key: 'ghana', label: 'Ghana', flag: '🇬🇭' },
  { key: 'south-africa', label: 'South Africa', flag: '🇿🇦' },
  { key: 'tanzania', label: 'Tanzania', flag: '🇹🇿' },
  { key: 'uganda', label: 'Uganda', flag: '🇺🇬' },
];

export const TRENDS: Record<string, Trend[]> = {
  nigeria: [
    { topic: 'Local food run', hook: 'Naija food never misses.', audio: 'Amapiano groove', hashtags: ['#NaijaFood', '#Amapiano', '#TrenNigeria'] },
    { topic: 'Weekend reset', hook: 'Reset the whole weekend.', audio: 'Lo-fi chill', hashtags: ['#WeekendReset', '#SelfCare', '#TrenNigeria'] },
    { topic: 'Small business spotlight', hook: 'Support local — this one delivers.', audio: 'Upbeat afrobeats', hashtags: ['#SmallBiz', '#SupportLocal', '#TrenNigeria'] },
  ],
  kenya: [
    { topic: 'Kenyan street eats', hook: 'The streets know best.', audio: 'Gengetone', hashtags: ['#KenyanFood', '#Gengetone', '#TrendingKE'] },
    { topic: 'Work-from-anywhere', hook: 'Your new office spot.', audio: 'Soft piano', hashtags: ['#WFA', '#NairobiVibes', '#TrendingKE'] },
    { topic: 'Sherehe weekend', hook: 'Sherehe never ends.', audio: 'Bongo flava', hashtags: ['#Sherehe', '#BongoFlava', '#TrendingKE'] },
  ],
  ghana: [
    { topic: 'Waakye run', hook: 'Waakye hour is sacred.', audio: 'Highlife classic', hashtags: ['#Waakye', '#GhanaFood', '#TrendingGH'] },
    { topic: 'Chale, let us shop', hook: 'Chale, the prices are sweet.', audio: 'Amapiano groove', hashtags: ['#ShopGhana', '#MadeInGhana', '#TrendingGH'] },
    { topic: 'Sunday vibes', hook: 'Sunday = family + vibes.', audio: 'Gospel highlife', hashtags: ['#SundayVibes', '#FamilyTime', '#TrendingGH'] },
  ],
  'south-africa': [
    { topic: 'Local is lekker', hook: 'Local is lekker, always.', audio: 'Kwaito energy', hashtags: ['#LocalIsLekker', '#Kwaito', '#TrendingZA'] },
    { topic: 'First Fridays', hook: 'First Friday energy.', audio: 'Amapiano groove', hashtags: ['#FirstFriday', '#Joburg', '#TrendingZA'] },
    { topic: 'Braai season', hook: 'Fire up the braai.', audio: 'Kwaito energy', hashtags: ['#Braai', '#Mzansi', '#TrendingZA'] },
  ],
  tanzania: [
    { topic: 'Zanzibar sunsets', hook: 'This view does the talking.', audio: 'Bongo flava', hashtags: ['#Zanzibar', '#BongoFlava', '#TrendingTZ'] },
    { topic: 'Mama lishe spots', hook: 'Mama lishe never disappoints.', audio: 'Bongo flava', hashtags: ['#MamaLishe', '#DarFood', '#TrendingTZ'] },
  ],
  uganda: [
    { topic: 'Rolex (the food)', hook: 'A Rolex, but for breakfast.', audio: 'Highlife classic', hashtags: ['#RolexFood', '#KampalaEats', '#TrendingUG'] },
    { topic: 'Kampala nights', hook: 'Kampala after 6 hits different.', audio: 'Afro-pop', hashtags: ['#Kampala', '#Nights', '#TrendingUG'] },
  ],
};

// --- Deterministic helpers ---------------------------------------------------

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function fillLocation(template: string, location: string): string {
  return template.replace('{location}', location || 'your city');
}

// --- Hooks & CTAs -----------------------------------------------------------

export function hooksFor(business: Pick<Business, 'name' | 'location'>, industry: VideoIndustry, topic: string): string[] {
  const rng = mulberry32(hashString(business.name + '|' + topic + '|hooks'));
  const location = business.location || 'your city';
  const topicBase = topic.trim() || industry.focus;
  const themed = [
    ...industry.hooks,
    ...GENERIC_HOOKS.map((h) => fillLocation(h, location)),
    `${topicBase} — but you have to see it to believe it.`,
    `${business.name} is about to change your day.`,
    `In ${location}? This is for you.`,
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  while (out.length < 20 && out.length < themed.length) {
    const h = pick(rng, themed);
    if (!seen.has(h)) { seen.add(h); out.push(h); }
  }
  return out;
}

export function ctasFor(goal: VideoGoal, business: Pick<Business, 'phone'>): string[] {
  const base = goalByKey(goal).ctas;
  const withWhatsApp = business.phone
    ? [...base, 'Chat with us on WhatsApp — we reply fast.']
    : base;
  return withWhatsApp;
}

// --- Scene flow -------------------------------------------------------------

interface SceneContext {
  business: Business;
  industry: VideoIndustry;
  goal: VideoGoal;
  format: VideoFormat;
  topic: string;
  hook: string;
  cta: string;
}

interface SceneDraft {
  seconds: number;
  text: string;
  direction: string;
  voiceover: string;
  transition: string;
}

const TRANSITIONS = {
  cut: 'Hard cut',
  zoom: 'Punch-in zoom',
  slide: 'Slide up',
  cross: 'Crossfade',
  whip: 'Whip pan',
  pop: 'Pop-in text',
  static: 'Static hold',
};

function scene(_ctx: SceneContext, p: Partial<SceneDraft> & { seconds: number; text: string; direction: string; voiceover: string }): SceneDraft {
  return { transition: TRANSITIONS.cut, ...p };
}

function hookScene(ctx: SceneContext, seconds: number): SceneDraft {
  return scene(ctx, {
    seconds,
    text: ctx.hook,
    direction: `Punch-in on ${ctx.industry.focus}.`,
    voiceover: ctx.hook,
    transition: TRANSITIONS.zoom,
  });
}

function whoScene(ctx: SceneContext, seconds: number): SceneDraft {
  const loc = ctx.business.location ? ` in ${ctx.business.location}` : '';
  return scene(ctx, {
    seconds,
    text: ctx.business.name,
    direction: `Wide shot of ${ctx.industry.setting}.`,
    voiceover: `Meet ${ctx.business.name}${loc}.`,
    transition: TRANSITIONS.slide,
  });
}

function valueScene(ctx: SceneContext, seconds: number): SceneDraft {
  const topic = ctx.topic.trim() || ctx.industry.promise;
  return scene(ctx, {
    seconds,
    text: topic,
    direction: `Close-up of ${ctx.industry.closeup}.`,
    voiceover: topic,
    transition: TRANSITIONS.cut,
  });
}

function detailScene(ctx: SceneContext, seconds: number): SceneDraft {
  return scene(ctx, {
    seconds,
    text: 'The details matter',
    direction: `Macro shots — ${ctx.industry.closeup}, textures, finishing.`,
    voiceover: `Notice the details — everything is intentional.`,
    transition: TRANSITIONS.cut,
  });
}

function proofScene(ctx: SceneContext, seconds: number): SceneDraft {
  return scene(ctx, {
    seconds,
    text: '★ Loved by customers',
    direction: `Quick cuts of happy customers in ${ctx.industry.setting}.`,
    voiceover: `People love ${ctx.industry.focus}.`,
    transition: TRANSITIONS.pop,
  });
}

function offerScene(ctx: SceneContext, seconds: number): SceneDraft {
  const topic = ctx.topic.trim() || ctx.industry.promise;
  return scene(ctx, {
    seconds,
    text: 'Today only',
    direction: `Big bold type over brand colours — highlight the offer.`,
    voiceover: `Today only — ${topic}.`,
    transition: TRANSITIONS.pop,
  });
}

function ctaScene(ctx: SceneContext, seconds: number): SceneDraft {
  return scene(ctx, {
    seconds,
    text: ctx.cta,
    direction: `Logo, phone number and address on screen.`,
    voiceover: ctx.cta,
    transition: TRANSITIONS.cross,
  });
}

function claimScene(ctx: SceneContext, seconds: number): SceneDraft {
  return scene(ctx, {
    seconds,
    text: 'How to claim',
    direction: 'Three simple steps: message, order, done.',
    voiceover: 'Message us to claim yours today — it takes ten seconds.',
    transition: TRANSITIONS.slide,
  });
}

function endCard(ctx: SceneContext, seconds: number): SceneDraft {
  return scene(ctx, {
    seconds,
    text: ctx.business.name,
    direction: 'Logo, address and phone number on a clean end card.',
    voiceover: ctx.cta,
    transition: TRANSITIONS.cross,
  });
}

const FLOWS: Record<VideoFormat, (ctx: SceneContext) => SceneDraft[]> = {
  'Reel 15': (ctx) => [
    hookScene(ctx, 2),
    whoScene(ctx, 2),
    valueScene(ctx, 3),
    { ...scene(ctx, { seconds: 2, text: 'Made for you', direction: `Customer reacting in ${ctx.industry.setting}.`, voiceover: 'Made with you in mind — every single time.', transition: TRANSITIONS.cut }) },
    proofScene(ctx, 2),
    ctaScene(ctx, 4),
  ],
  'Reel 30': (ctx) => [
    hookScene(ctx, 3),
    whoScene(ctx, 2),
    valueScene(ctx, 3),
    detailScene(ctx, 3),
    { ...scene(ctx, { seconds: 3, text: 'Behind the scenes', direction: `B-Roll of ${ctx.industry.setting} in motion.`, voiceover: `A look behind the scenes at ${ctx.business.name}.`, transition: TRANSITIONS.whip }) },
    proofScene(ctx, 3),
    offerScene(ctx, 4),
    claimScene(ctx, 3),
    endCard(ctx, 6),
  ],
  'Story': (ctx) => [
    hookScene(ctx, 2),
    whoScene(ctx, 2),
    valueScene(ctx, 3),
    proofScene(ctx, 2),
    ctaScene(ctx, 3),
  ],
  'Landscape': (ctx) => [
    hookScene(ctx, 3),
    whoScene(ctx, 2),
    valueScene(ctx, 4),
    detailScene(ctx, 4),
    { ...scene(ctx, { seconds: 4, text: 'Why us', direction: 'Wide establishing shot, then three selling points on screen.', voiceover: `Here is why ${ctx.business.name} is worth your time.`, transition: TRANSITIONS.slide }) },
    proofScene(ctx, 4),
    offerScene(ctx, 4),
    endCard(ctx, 5),
  ],
  'Square': (ctx) => FLOWS['Reel 15'](ctx),
  'Product Spotlight': (ctx) => [
    { ...scene(ctx, { seconds: 2, text: 'You asked…', direction: 'Product held up in natural light.', voiceover: ctx.hook, transition: TRANSITIONS.zoom }) },
    { ...scene(ctx, { seconds: 3, text: ctx.topic.trim() || 'The product', direction: 'Slow pan across the product.', voiceover: `Introducing ${ctx.topic.trim() || 'our latest'} at ${ctx.business.name}.`, transition: TRANSITIONS.cross }) },
    { ...scene(ctx, { seconds: 4, text: 'The details', direction: 'Macro: texture, finish, packaging.', voiceover: 'Notice the details — everything is intentional.', transition: TRANSITIONS.cut }) },
    { ...scene(ctx, { seconds: 3, text: 'Who it is for', direction: 'A customer using or wearing it.', voiceover: `Made for people who want the best — like you.`, transition: TRANSITIONS.slide }) },
    proofScene(ctx, 3),
    ctaScene(ctx, 3),
  ],
  'Property Tour': (ctx) => [
    { ...scene(ctx, { seconds: 4, text: `Welcome to ${ctx.topic.trim() || 'this property'}`, direction: 'Slow aerial-style pan across the exterior — drone feel.', voiceover: `Welcome to ${ctx.topic.trim() || 'this home'} in ${ctx.business.location || 'your city'}.`, transition: TRANSITIONS.cross }) },
    { ...scene(ctx, { seconds: 4, text: 'The living space', direction: 'Walkthrough: living room, natural light, open plan.', voiceover: 'Bright, open and ready for your furniture.', transition: TRANSITIONS.cut }) },
    { ...scene(ctx, { seconds: 4, text: 'Details & finishes', direction: 'Close-ups: kitchen, bathroom, fittings.', voiceover: 'The finishes speak for themselves.', transition: TRANSITIONS.cut }) },
    { ...scene(ctx, { seconds: 4, text: 'Bedrooms', direction: 'Bedrooms with room-to-breathe framing.', voiceover: 'Comfortable rooms made for rest.', transition: TRANSITIONS.slide }) },
    { ...scene(ctx, { seconds: 4, text: 'Location', direction: 'Street + neighbourhood shots.', voiceover: `Situated in ${ctx.business.location || 'a prime area'}, close to everything.`, transition: TRANSITIONS.cross }) },
    { ...scene(ctx, { seconds: 4, text: ctx.cta, direction: 'Price, address and contact on screen.', voiceover: ctx.cta, transition: TRANSITIONS.cross }) },
  ],
  'Food Commercial': (ctx) => [
    hookScene(ctx, 4),
    { ...scene(ctx, { seconds: 4, text: ctx.topic.trim() || 'The dish', direction: 'The dish plated, hero shot, steam rising.', voiceover: `Today, we are serving ${ctx.topic.trim() || 'our signature dish'}.`, transition: TRANSITIONS.zoom }) },
    { ...scene(ctx, { seconds: 4, text: 'Fresh, made today', direction: 'Ingredients + preparation in the kitchen.', voiceover: 'Fresh ingredients, made today — the way it should be.', transition: TRANSITIONS.cut }) },
    { ...scene(ctx, { seconds: 4, text: 'The sizzle', direction: 'Close-up of the grill or fry — sound on.', voiceover: 'You can almost taste it.', transition: TRANSITIONS.whip }) },
    ctaScene(ctx, 4),
  ],
  'Service Explainer': (ctx) => [
    hookScene(ctx, 3),
    { ...scene(ctx, { seconds: 3, text: 'The problem', direction: 'A relatable frustration shot.', voiceover: 'Let us be honest — it takes too long.', transition: TRANSITIONS.cut }) },
    { ...scene(ctx, { seconds: 4, text: `Meet ${ctx.topic.trim() || 'our service'}`, direction: `${ctx.industry.label} in action — the team at work.`, voiceover: `That is why ${ctx.business.name} exists.`, transition: TRANSITIONS.slide }) },
    { ...scene(ctx, { seconds: 6, text: 'How it works', direction: 'Three steps on screen, one by one.', voiceover: 'Step one, reach out. Step two, we handle it. Step three, you are done.', transition: TRANSITIONS.pop }) },
    { ...scene(ctx, { seconds: 4, text: 'Why choose us', direction: 'Ratings, guarantees and happy customers.', voiceover: `Reliable, affordable and trusted in ${ctx.business.location || 'your city'}.`, transition: TRANSITIONS.cut }) },
    ctaScene(ctx, 4),
  ],
  'Countdown': (ctx) => [
    { ...scene(ctx, { seconds: 3, text: ctx.hook, direction: 'Big clock / countdown graphic on screen.', voiceover: ctx.hook, transition: TRANSITIONS.pop }) },
    { ...scene(ctx, { seconds: 3, text: ctx.topic.trim() || ctx.industry.promise, direction: 'The offer, bold and clear.', voiceover: ctx.topic.trim() || ctx.industry.promise, transition: TRANSITIONS.cut }) },
    offerScene(ctx, 3),
    proofScene(ctx, 3),
    { ...scene(ctx, { seconds: 3, text: 'Do not miss out', direction: 'Urgency montage — customers, product, clock.', voiceover: 'When it is gone, it is gone.', transition: TRANSITIONS.whip }) },
    ctaScene(ctx, 3),
  ],
  'Event': (ctx) => [
    hookScene(ctx, 3),
    { ...scene(ctx, { seconds: 3, text: ctx.topic.trim() || 'The big moment', direction: 'Hero shot of the venue or crowd.', voiceover: ctx.topic.trim() || 'The moment you have been waiting for.', transition: TRANSITIONS.zoom }) },
    { ...scene(ctx, { seconds: 4, text: 'Date & venue', direction: 'Date, time and location on screen.', voiceover: `${ctx.business.location || 'Check the details below'} — put it in your calendar.`, transition: TRANSITIONS.slide }) },
    { ...scene(ctx, { seconds: 4, text: 'What to expect', direction: 'Highlights montage — speakers, lineup, moments.', voiceover: 'Great people, great energy, one unforgettable moment.', transition: TRANSITIONS.cut }) },
    ctaScene(ctx, 4),
  ],
  'Customer Review': (ctx) => [
    { ...scene(ctx, { seconds: 3, text: 'Real words. Real customers.', direction: 'Animated quote card intro.', voiceover: ctx.hook, transition: TRANSITIONS.zoom }) },
    { ...scene(ctx, { seconds: 5, text: '“Best in town”', direction: 'Quote animates word-by-word over brand colours.', voiceover: `“The service at ${ctx.business.name} is genuinely the best in town.”`, transition: TRANSITIONS.pop }) },
    { ...scene(ctx, { seconds: 5, text: '“They deliver”', direction: 'Second quote, cut to a customer clip.', voiceover: '“They deliver exactly what they promise — every time.”', transition: TRANSITIONS.slide }) },
    proofScene(ctx, 3),
    ctaScene(ctx, 4),
  ],
  'Before & After': (ctx) => [
    { ...scene(ctx, { seconds: 3, text: 'Before', direction: 'The “before” shot — desaturated, flat.', voiceover: 'Before.', transition: TRANSITIONS.cut }) },
    { ...scene(ctx, { seconds: 3, text: 'The transformation', direction: 'Transition wipe across the screen.', voiceover: 'One visit later…', transition: TRANSITIONS.cross }) },
    { ...scene(ctx, { seconds: 4, text: 'After', direction: 'The “after” shot — bright, colour-graded.', voiceover: 'After.', transition: TRANSITIONS.zoom }) },
    { ...scene(ctx, { seconds: 4, text: 'Results you can see', direction: 'Side-by-side comparison on screen.', voiceover: `Results you can actually see — that is ${ctx.business.name}.`, transition: TRANSITIONS.cut }) },
    ctaScene(ctx, 4),
  ],
  'Daily Post': (ctx) => [
    hookScene(ctx, 3),
    valueScene(ctx, 4),
    ctaScene(ctx, 3),
  ],
};

function buildScenes(ctx: SceneContext, media: MediaPick): VideoScene[] {
  return FLOWS[ctx.format](ctx).map((d) => ({ id: uid(), media, ...d }));
}

// --- Prediction & coach -----------------------------------------------------

export function predictPerformance(p: { hook: string; scenes: VideoScene[]; caption: string; topic: string; cta: string; upload?: UploadMedia; phone?: string }): Prediction {
  const improvements: string[] = [];
  let score = 3;

  if (!p.hook || p.hook.length < 8) { improvements.push('Lead with a stronger hook — the first 3 seconds decide the scroll.'); score -= 1; }
  else if (p.hook.length > 60) { improvements.push('Hook is too long — keep it to a few words on screen.'); score -= 1; }
  else { score += 1; }

  if (p.scenes.length < 3) { improvements.push('Add at least 3 scenes — a single shot loses attention.'); score -= 1; }
  else if (p.scenes.length >= 5) { score += 1; }

  if (!p.topic.trim()) { improvements.push('Give the video a specific topic — generic videos feel generic.'); }

  if (!p.cta) { improvements.push('Add a clear call to action so viewers know what to do next.'); score -= 1; }
  else if (p.phone) { score += 1; }

  if (p.caption.length > 280) { improvements.push('Caption is long — keep it under 280 characters and move detail into the video.'); }

  if (p.upload) { score += 1; }

  const seconds = p.scenes.reduce((s, x) => s + x.seconds, 0);
  if (seconds > 20) { improvements.push('Over 20 seconds is fine for story, but tighten the first 5 seconds.'); }

  const clamped = Math.max(1, Math.min(5, score));
  const metrics: PredictionMetric[] = [
    { label: 'Likely engagement', stars: Math.max(1, Math.min(5, clamped + (p.hook.length > 8 ? 1 : 0))) },
    { label: 'Watch time', stars: Math.max(1, Math.min(5, clamped + (p.scenes.length >= 5 ? 1 : 0))) },
    { label: 'Shares', stars: Math.max(1, Math.min(5, clamped + (p.caption.includes('#') ? 1 : 0))) },
    { label: 'Tap-through', stars: Math.max(1, Math.min(5, clamped + (p.cta ? 1 : 0))) },
  ];
  return { stars: clamped, metrics, improvements };
}

export function coachFeedback(p: { hook: string; scenes: VideoScene[]; topic: string; cta: string; music: string; thumbnail: string; caption: string }): string[] {
  const notes: string[] = [];
  if (p.hook.length > 60) notes.push('“The hook is weak. Lead with the offer, not a greeting — cut it to under 8 words on screen.”');
  else if (p.hook.length >= 8) notes.push('“Hook is strong. Keep the first shot on this line, and do not overlay other text on top.”');
  else notes.push('“Add a hook. Right now the first second is wasted.”');

  if (p.scenes.length >= 5) notes.push('“Good structure. Scene 3 could become a close-up of your best result.”');
  else notes.push('“Too thin — add a middle scene so the story has a build.”');

  if (!p.cta) notes.push('“Add a clear CTA at the end. No call to action, no action.”');
  else notes.push('“CTA is clear. Put your phone number on screen for the last 3 seconds.”');

  if (p.caption.length > 280) notes.push('“Move the long copy into the video. Keep the caption punchy.”');
  if (!p.topic.trim()) notes.push('“Make it specific — say exactly what the customer gets.”');

  notes.push(`“Music: ${p.music} fits — but bring it in after the hook, not before it.”`);
  notes.push(`“Thumbnail: use “${p.thumbnail || 'your best frame'}” with your logo in the corner.”`);
  return notes;
}

// --- Captions, hashtags, pack ------------------------------------------------

export function hashtagsFor(_business: Pick<Business, 'category'>, industry: VideoIndustry, topic: string): string[] {
  const topicTag = '#' + topic.trim().replace(/[^a-zA-Z0-9]+/g, '').slice(0, 18);
  return [...new Set([...industry.hashtags, topicTag ? topicTag : '#LocalBiz', '#NowOpenAfrica'])];
}

export function projectCaption(_p: { topic?: string; business?: Business }): string {
  // Handled by generateVideoProject; this is a helper kept for tests of copy.
  return '';
}

export function voiceoverText(p: VideoProject): string {
  return p.scenes.map((s) => s.voiceover).filter(Boolean).join(' ');
}

export function captionText(p: VideoProject): string {
  return [p.caption, '', ...p.hashtags].join('\n');
}

export function shotListText(p: VideoProject): string {
  return p.scenes.map((s, i) => `Scene ${i + 1} · [${s.seconds}s] ${s.text}\n   🎬 ${s.direction}\n   🎙️ ${s.voiceover}`).join('\n\n');
}

export function projectPackText(p: VideoProject): string {
  return [
    `${p.title.toUpperCase()} — ${p.format} · ${p.goal.replace('-', ' ').toUpperCase()}`,
    '',
    `HOOK: ${p.hook}`,
    `CTA: ${p.cta}`,
    `MUSIC: ${p.music}`,
    `STYLE: ${p.style}`,
    `SUBTITLES: ${p.subtitle}`,
    `VOICEOVER: ${p.voiceover}`,
    '',
    shotListText(p),
    '',
    'CAPTION',
    captionText(p),
  ].join('\n');
}

// --- Project generation ------------------------------------------------------

export function generateVideoProject(business: Business, input: VideoCreatorInput): VideoProject {
  const industry = industryByKey(input.industryKey);
  const goal = goalByKey(input.goal);
  const rng = mulberry32(hashString(business.id + '|' + input.topic + '|' + input.format));

  const hooks = input.creator === 'countdown' ? COUNTDOWN_HOOKS : hooksFor(business, industry, input.topic);
  const hook = input.hook ?? pick(rng, hooks);
  const ctas = ctasFor(input.goal, business);
  const cta = pick(rng, ctas);

  const ctx: SceneContext = {
    business, industry, goal: input.goal, format: input.format,
    topic: input.topic, hook, cta,
  };
  const scenes = buildScenes(ctx, input.media);

  const topicLabel = input.topic.trim() || industry.promise;
  const caption = [
    `${topicLabel.charAt(0).toUpperCase() + topicLabel.slice(1)} at ${business.name}${business.location ? `, ${business.location}` : ''}.`,
    goal.desc.length ? `${goal.desc.charAt(0).toUpperCase() + goal.desc.slice(1)} — tap to learn more.` : '',
    '',
    ...industry.hashtags,
  ].filter(Boolean).join('\n');

  const hashtags = hashtagsFor(business, industry, input.topic);
  const style = input.style || goal.style;
  const thumbnail = `${topicLabel} · ${cta}`;

  const prediction = predictPerformance({
    hook, scenes, caption, topic: input.topic, cta,
    upload: input.upload, phone: business.phone,
  });
  const coach = coachFeedback({
    hook, scenes, topic: input.topic, cta,
    music: input.music, thumbnail, caption,
  });

  const title = `${industry.label} · ${input.topic.trim() || input.format}`;

  return {
    id: uid(),
    title,
    creator: input.creator,
    industryKey: industry.key,
    goal: input.goal,
    format: input.format,
    topic: input.topic,
    hook,
    cta,
    scenes,
    caption,
    hashtags,
    music: input.music,
    style,
    subtitle: input.subtitle,
    voiceover: input.voiceover,
    thumbnail,
    prediction,
    coach,
    upload: input.upload,
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
}

// --- Campaign generator -----------------------------------------------------

export function buildCampaign(business: Pick<Business, 'name' | 'location'>, industry: VideoIndustry, occasion: CampaignOccasion): CampaignPlan {
  const name = business.name;
  const loc = business.location || 'your city';
  return {
    occasion: occasion.label,
    industry: industry.label,
    theme: `${occasion.theme} — tailored for ${industry.label} in ${loc}.`,
    counts: { reels: 30, stories: 15, posters: 10, flyers: 5 },
    emailSubject: occasion.emailSubject.replace('{name}', name),
    emailBody: `${name} is celebrating ${occasion.label} with offers made for ${industry.label.toLowerCase()} customers in ${loc}. Limited time, real savings. Tap through to claim yours.`,
    sms: `${occasion.label.toUpperCase()} at ${name}! ${industry.focus}. Limited time only. Reply to order.`,
    landingHeadline: occasion.landingHeadline.replace('{name}', name),
    landingSub: `${industry.promise} — ${occasion.theme}.`,
    bestTimes: 'Mon–Fri 7–8PM · Sat–Sun 12–2PM',
    budgetHint: 'Start at a small daily boost (₦2,000–5,000 / day) aimed at your local radius, then scale the winners.',
    hashtags: [...industry.hashtags, `#${occasion.label.replace(/[^a-zA-Z]/g, '')}Sale`],
  };
}

// --- Trends -----------------------------------------------------------------

export function trendsFor(market: string, industry?: VideoIndustry): Trend[] {
  const base = TRENDS[market] ?? TRENDS.nigeria;
  const themed: Trend[] = industry
    ? base.slice(0, 1).map((t) => ({ ...t, topic: `${t.topic} — ${industry.label} angle` }))
    : [];
  return [...themed, ...base];
}

// --- Persistence ------------------------------------------------------------

export function videoKey(businessId: string): string {
  return `nowopen_videos_${businessId}`;
}

export function loadProjects(businessId: string): VideoProject[] {
  try {
    const raw = localStorage.getItem(videoKey(businessId));
    const parsed = raw ? (JSON.parse(raw) as VideoProject[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProjects(businessId: string, projects: VideoProject[]): void {
  try { localStorage.setItem(videoKey(businessId), JSON.stringify(projects)); } catch { /* quota / private mode */ }
}
