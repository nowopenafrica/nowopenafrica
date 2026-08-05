// NowOpen Studio — Campaign Marketplace.
//
// A browsable catalogue of ready-made, per-industry campaign packs. Each pack
// bundles a goal, a duration, the channels it will run on and a one-click
// "launch" that generates the full day-by-day plan (via the existing campaigns
// engine) and drops it into the saved campaign plans.

import { Business } from '../types';
import { CopyGoal } from './copywriter';
import { VIDEO_INDUSTRIES, industryKeyForCategory, industryByKey } from './videoCreator';
import { buildCampaign, loadCampaigns, saveCampaigns, CampaignPlan } from './campaigns';

export interface MarketplacePack {
  id: string;
  industryKey: string;
  title: string;
  emoji: string;
  description: string;
  goal: CopyGoal;
  durationDays: number;
  channels: string[];
  tier: 'free' | 'pro';
  tags: string[];
}

// Per-industry goal mix, so the marketplace feels curated for each category.
const PACK_GOALS: Record<string, { goal: CopyGoal; days: number; tier: 'free' | 'pro'; blurb: string }[]> = {
  restaurant: [
    { goal: 'weekend-promo', days: 5, tier: 'free', blurb: 'Pull weekend foot traffic with a deadline-driven offer.' },
    { goal: 'product-launch', days: 7, tier: 'free', blurb: 'Roll out a new menu item across every channel.' },
    { goal: 'grand-opening', days: 7, tier: 'free', blurb: 'Announce your opening and fill the first weeks.' },
    { goal: 'flash-sale', days: 3, tier: 'pro', blurb: 'A 72-hour frenzy that clears stock and spikes orders.' },
    { goal: 'testimonial', days: 5, tier: 'pro', blurb: 'Turn happy diners into your best advertising.' },
  ],
  salon: [
    { goal: 'product-launch', days: 5, tier: 'free', blurb: 'Spotlight new services and fresh looks.' },
    { goal: 'weekend-promo', days: 5, tier: 'free', blurb: 'Fill weekend slots with an irresistible offer.' },
    { goal: 'grand-opening', days: 7, tier: 'free', blurb: 'Launch the salon with a week of buzz.' },
    { goal: 'testimonial', days: 5, tier: 'pro', blurb: 'Before-and-after proof that books new clients.' },
  ],
  hotel: [
    { goal: 'weekend-promo', days: 5, tier: 'free', blurb: 'Sell out the weekend with staycation offers.' },
    { goal: 'event', days: 7, tier: 'free', blurb: 'Fill conference rooms, events and packages.' },
    { goal: 'anniversary', days: 5, tier: 'pro', blurb: 'Celebrate your years in business with a thank-you.' },
    { goal: 'seasonal-sale', days: 7, tier: 'pro', blurb: 'Ride the holiday season with themed stays.' },
  ],
  'real-estate': [
    { goal: 'product-launch', days: 7, tier: 'free', blurb: 'Put your newest listing in front of buyers.' },
    { goal: 'educational', days: 7, tier: 'free', blurb: 'Build authority as the agent who knows the market.' },
    { goal: 'seasonal-sale', days: 7, tier: 'pro', blurb: 'Capitalise on the busy buying season.' },
  ],
  fashion: [
    { goal: 'product-launch', days: 7, tier: 'free', blurb: 'Drop a new collection with runway-style hype.' },
    { goal: 'flash-sale', days: 3, tier: 'free', blurb: 'Move stock fast with a limited-time discount.' },
    { goal: 'seasonal-sale', days: 7, tier: 'pro', blurb: 'Seasonal styling push for the whole wardrobe.' },
    { goal: 'grand-opening', days: 7, tier: 'pro', blurb: 'Open the store with a launch customers remember.' },
  ],
  laundry: [
    { goal: 'weekend-promo', days: 5, tier: 'free', blurb: 'Win weekend laundry with pickup & delivery offers.' },
    { goal: 'educational', days: 5, tier: 'free', blurb: 'Teach fabric care and build trust in your service.' },
    { goal: 'flash-sale', days: 3, tier: 'pro', blurb: 'A quick discount that spikes sign-ups.' },
  ],
  'car-wash': [
    { goal: 'flash-sale', days: 3, tier: 'free', blurb: 'Fill the bay with a same-day detailing deal.' },
    { goal: 'weekend-promo', days: 5, tier: 'free', blurb: 'Weekend shine-up offers for car owners.' },
    { goal: 'testimonial', days: 5, tier: 'pro', blurb: 'Showcase transformations that sell the service.' },
  ],
  pharmacy: [
    { goal: 'educational', days: 7, tier: 'free', blurb: 'Health tips that position you as the trusted pharmacy.' },
    { goal: 'seasonal-sale', days: 7, tier: 'free', blurb: 'Seasonal wellness bundles and essentials push.' },
    { goal: 'product-launch', days: 5, tier: 'pro', blurb: 'Introduce new stock and health checks.' },
  ],
  church: [
    { goal: 'event', days: 7, tier: 'free', blurb: 'Fill the room for services, conventions and outreach.' },
    { goal: 'grand-opening', days: 7, tier: 'free', blurb: 'Welcome your community to a new season.' },
    { goal: 'educational', days: 7, tier: 'pro', blurb: 'Weekly teaching clips that build a faithful audience.' },
  ],
  school: [
    { goal: 'grand-opening', days: 7, tier: 'free', blurb: 'Announce admissions are open and drive enquiries.' },
    { goal: 'event', days: 7, tier: 'free', blurb: 'Open days and school events that fill seats.' },
    { goal: 'educational', days: 7, tier: 'pro', blurb: 'Share wins and learning moments parents love.' },
  ],
  auto: [
    { goal: 'product-launch', days: 7, tier: 'free', blurb: 'Showcase a vehicle or service with detailed proof.' },
    { goal: 'weekend-promo', days: 5, tier: 'free', blurb: 'Weekend service specials for busy drivers.' },
    { goal: 'educational', days: 7, tier: 'pro', blurb: 'Car-care tips that build a loyal workshop clientele.' },
  ],
  fitness: [
    { goal: 'product-launch', days: 7, tier: 'free', blurb: 'Launch memberships and classes to fill the floor.' },
    { goal: 'event', days: 7, tier: 'free', blurb: 'Bootcamps and challenges that pack the gym.' },
    { goal: 'testimonial', days: 5, tier: 'pro', blurb: 'Transformation stories that sell results.' },
  ],
  beauty: [
    { goal: 'product-launch', days: 5, tier: 'free', blurb: 'Introduce new treatments and product lines.' },
    { goal: 'grand-opening', days: 7, tier: 'free', blurb: 'Launch the studio with pampering offers.' },
    { goal: 'seasonal-sale', days: 7, tier: 'pro', blurb: 'Seasonal glow-up packages and gift bundles.' },
  ],
  agency: [
    { goal: 'product-launch', days: 7, tier: 'free', blurb: 'Launch your latest campaign or service offer.' },
    { goal: 'grand-opening', days: 7, tier: 'free', blurb: 'Introduce your studio to the market.' },
    { goal: 'educational', days: 7, tier: 'pro', blurb: 'Marketing tips that win you clients.' },
  ],
};

const PACK_CHANNELS: Record<string, string[]> = {
  'weekend-promo': ['Instagram', 'Stories', 'WhatsApp', 'Email', 'SMS'],
  'product-launch': ['Instagram', 'Stories', 'WhatsApp', 'Email', 'SMS'],
  'grand-opening': ['Instagram', 'Stories', 'WhatsApp', 'Email', 'SMS'],
  'flash-sale': ['Instagram', 'Stories', 'WhatsApp', 'SMS'],
  'testimonial': ['Instagram', 'Stories', 'WhatsApp'],
  'educational': ['Instagram', 'Stories', 'WhatsApp', 'Email'],
  event: ['Instagram', 'Stories', 'WhatsApp', 'Email', 'SMS'],
  anniversary: ['Instagram', 'Stories', 'WhatsApp', 'Email'],
  'seasonal-sale': ['Instagram', 'Stories', 'WhatsApp', 'Email', 'SMS'],
  hiring: ['Instagram', 'Facebook', 'LinkedIn', 'WhatsApp'],
};

const PACK_EMOJI: Record<string, string> = {
  'weekend-promo': '📢',
  'product-launch': '✨',
  'grand-opening': '🎉',
  'flash-sale': '⚡',
  'testimonial': '⭐',
  educational: '💡',
  event: '📅',
  anniversary: '🎂',
  'seasonal-sale': '🎁',
  hiring: '🚀',
};

const PACK_TAGS: Record<string, string[]> = {
  'weekend-promo': ['offer', 'foot traffic', 'deadline'],
  'product-launch': ['launch', 'new', 'spotlight'],
  'grand-opening': ['launch', 'buzz', 'first impression'],
  'flash-sale': ['sale', 'urgency', '72hr'],
  'testimonial': ['proof', 'reviews', 'social proof'],
  educational: ['trust', 'authority', 'value'],
  event: ['event', 'bookings', 'fill the room'],
  anniversary: ['celebration', 'loyalty', 'thank you'],
  'seasonal-sale': ['season', 'holiday', 'bundle'],
  hiring: ['hiring', 'team', 'careers'],
};

export function marketplaceCatalog(): MarketplacePack[] {
  const packs: MarketplacePack[] = [];
  for (const industry of VIDEO_INDUSTRIES) {
    const goals = PACK_GOALS[industry.key] || PACK_GOALS.agency;
    for (const g of goals) {
      packs.push({
        id: `${industry.key}-${g.goal}`,
        industryKey: industry.key,
        title: `${industry.label} · ${g.goal.replace(/-/g, ' ')}`,
        emoji: PACK_EMOJI[g.goal] || '🚀',
        description: g.blurb,
        goal: g.goal,
        durationDays: g.days,
        channels: PACK_CHANNELS[g.goal] || ['Instagram', 'Stories', 'WhatsApp'],
        tier: g.tier,
        tags: PACK_TAGS[g.goal] || [],
      });
    }
  }
  return packs;
}

export function packsForIndustry(industryKey: string): MarketplacePack[] {
  return marketplaceCatalog().filter((p) => p.industryKey === industryKey);
}

// Best-match packs for a business, ranked with its own industry first.
export function featuredPacks(business: Business, count = 6): MarketplacePack[] {
  const key = industryKeyForCategory(business.category);
  const catalog = marketplaceCatalog();
  const own = catalog.filter((p) => p.industryKey === key);
  const rest = catalog.filter((p) => p.industryKey !== key);
  return [...own, ...rest].slice(0, count);
}

export function industryLabelFor(key: string): string {
  return industryByKey(key).label;
}

// Launch a pack: generate the full plan via the campaigns engine and persist it.
export function launchPack(business: Business, pack: MarketplacePack, startDate: string): CampaignPlan {
  const plan = buildCampaign(business, pack.goal, startDate, pack.durationDays);
  const existing = loadCampaigns(business.id);
  saveCampaigns(business.id, [...existing, plan]);
  return plan;
}
