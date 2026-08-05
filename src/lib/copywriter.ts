// NowOpen Studio — AI Copywriter.
//
// Generates on-brand captions, hashtags, ads, SMS, emails, SEO descriptions
// and press-style copy straight from the business profile + a chosen goal and
// tone. Rule-based and instant (no external API), so it works offline and
// never leaves the studio with a spinner.

import { Business } from '../types';

export type CopyGoal =
  | 'grand-opening'
  | 'product-launch'
  | 'weekend-promo'
  | 'flash-sale'
  | 'hiring'
  | 'event'
  | 'thank-you'
  | 'anniversary'
  | 'seasonal-sale'
  | 'testimonial'
  | 'behind-scenes'
  | 'educational'
  | 'new-arrival';

export interface CopyTone {
  key: string;
  label: string;
  opener: string;
  closer?: string;
}

// Pick a voice for the caption. Applied on top of the generated copy so the
// AI Social Studio can offer "make it friendly / urgent / Gen Z" instantly.
export const COPY_TONES: CopyTone[] = [
  { key: 'friendly', label: 'Friendly', opener: 'Hey there, friend! ' },
  { key: 'professional', label: 'Professional', opener: 'We are pleased to share: ' },
  { key: 'luxury', label: 'Luxury', opener: 'Elevate your experience with ' },
  { key: 'funny', label: 'Funny', opener: 'Okay, hear us out… ' },
  { key: 'genz', label: 'Gen Z', opener: 'no cap — ' },
  { key: 'corporate', label: 'Corporate', opener: 'To our valued customers, ' },
  { key: 'local', label: 'Local Nigerian', opener: 'Wetin we get for you today? ' },
  { key: 'inspirational', label: 'Inspirational', opener: 'Small businesses, big dreams. ' },
  { key: 'urgent', label: 'Urgent', opener: 'Right now, ', closer: ' Offer ends soon.' },
  { key: 'premium', label: 'Premium', opener: 'Reserved for the best. ' },
];

export function applyTone(text: string, toneKey?: string): string {
  if (!toneKey) return text;
  const tone = COPY_TONES.find((t) => t.key === toneKey);
  if (!tone) return text;
  return tone.opener + text + (tone.closer || '');
}

export type CopyPlatform =
  | 'instagram'
  | 'facebook'
  | 'linkedin'
  | 'whatsapp'
  | 'x'
  | 'sms'
  | 'email'
  | 'seo'
  | 'blog';

export interface CopyPackItem {
  platform: CopyPlatform;
  goal: CopyGoal;
  text: string;
  hashtags: string;
}

interface CopyContext {
  name: string;
  category: string;
  location: string;
  phone: string;
  description: string;
  hours: string;
}

export const COPY_GOALS: { key: CopyGoal; label: string }[] = [
  { key: 'grand-opening', label: 'Grand Opening' },
  { key: 'product-launch', label: 'Product Launch' },
  { key: 'weekend-promo', label: 'Weekend Promotion' },
  { key: 'flash-sale', label: 'Flash Sale' },
  { key: 'seasonal-sale', label: 'Seasonal Sale' },
  { key: 'hiring', label: 'Recruitment' },
  { key: 'event', label: 'Event Promotion' },
  { key: 'thank-you', label: 'Customer Appreciation' },
  { key: 'anniversary', label: 'Anniversary' },
  { key: 'testimonial', label: 'Customer Testimonial' },
  { key: 'new-arrival', label: 'New Arrival' },
  { key: 'behind-scenes', label: 'Behind The Scenes' },
  { key: 'educational', label: 'Educational / Tips' },
];

export const COPY_PLATFORMS: { key: CopyPlatform; label: string }[] = [
  { key: 'instagram', label: 'Instagram Caption' },
  { key: 'facebook', label: 'Facebook Post' },
  { key: 'linkedin', label: 'LinkedIn Post' },
  { key: 'whatsapp', label: 'WhatsApp Broadcast' },
  { key: 'x', label: 'X / Twitter' },
  { key: 'sms', label: 'SMS' },
  { key: 'email', label: 'Email Campaign' },
  { key: 'seo', label: 'SEO Description' },
  { key: 'blog', label: 'Blog Article' },
];

function context(business: Pick<Business, 'name' | 'category' | 'location' | 'phone' | 'description' | 'hours'>): CopyContext {
  return {
    name: business.name,
    category: business.category || 'business',
    location: business.location || 'near you',
    phone: business.phone || '',
    description: business.description || '',
    hours: business.hours || '',
  };
}

const CTAS: Record<CopyPlatform, string> = {
  instagram: 'Follow @nowopenafrica and save this post so you never miss an update.',
  facebook: 'Follow our page and turn on notifications to stay in the loop.',
  linkedin: 'Follow our page to stay up to date with what we are building.',
  whatsapp: 'Reply "START" to be added to our broadcast list.',
  x: 'Follow us and turn on notifications.',
  sms: 'Reply STOP to opt out.',
  email: 'Tap the button in this email to shop / book today.',
  seo: '',
  blog: '',
};

function goalCopy(goal: CopyGoal, c: CopyContext): { opener: string; body: string; closer: string } {
  const g = {
    'grand-opening': {
      opener: `🎉 We are officially OPEN! ${c.name} is here.`,
      body: `After weeks of preparation, ${c.name} (${c.category}) is ready to welcome you in ${c.location}. Come explore, ask questions and enjoy opening-week offers.`,
      closer: 'We cannot wait to meet you in person.',
    },
    'product-launch': {
      opener: `✨ Fresh off the press — a new arrival at ${c.name}.`,
      body: `Our latest ${c.category} offering has just landed in ${c.location}. First come, first served.`,
      closer: 'Be among the first to get your hands on it.',
    },
    'weekend-promo': {
      opener: `📢 Weekend special at ${c.name}!`,
      body: `All weekend long, enjoy exclusive ${c.category} deals in ${c.location}. Perfect timing to treat yourself or someone you love.`,
      closer: 'Offer ends Sunday — do not sleep on this one.',
    },
    'flash-sale': {
      opener: `⚡ FLASH SALE — limited time only.`,
      body: `For a very short window, ${c.name} is dropping prices on ${c.category} favourites in ${c.location}. When it is gone, it is gone.`,
      closer: 'Set a timer and move fast.',
    },
    'seasonal-sale': {
      opener: `🎁 Seasonal sale now live at ${c.name}.`,
      body: `The holiday season is the perfect time for ${c.category} — and we are celebrating with special prices in ${c.location}.`,
      closer: 'Grab something special before the season ends.',
    },
    hiring: {
      opener: `🚀 ${c.name} is hiring!`,
      body: `We are growing our ${c.category} team in ${c.location} and looking for talented, driven people. If that sounds like you (or someone you know), we want to hear from you.`,
      closer: 'Send your CV today and join a team that cares.',
    },
    event: {
      opener: `📅 You are invited — an event by ${c.name}.`,
      body: `Join us for a special ${c.category} event in ${c.location}. Great company, great vibes, and something for everyone.`,
      closer: 'Tag a friend you are bringing along.',
    },
    'thank-you': {
      opener: `💛 Thank you, ${c.location}!`,
      body: `From the whole team at ${c.name}, a heartfelt thank you. Your support is what keeps our ${c.category} dream alive every single day.`,
      closer: 'We are nothing without you.',
    },
    anniversary: {
      opener: `🎂 We are turning another year at ${c.name}.`,
      body: `It has been an incredible journey serving ${c.category} to ${c.location}. Thank you for growing with us — the best is yet to come.`,
      closer: 'Here is to many more years together.',
    },
    testimonial: {
      opener: `⭐ Real words from real customers.`,
      body: `Our customers in ${c.location} say it best — here is what ${c.name} means to them. Their reviews drive everything we do, every single day.`,
      closer: 'Come and see why they keep coming back.',
    },
    'behind-scenes': {
      opener: `👀 Behind the scenes at ${c.name}.`,
      body: `A look at the hard work and heart that goes into every ${c.category} moment in ${c.location}. No filters — just the real thing.`,
      closer: 'Follow along for the full story.',
    },
    educational: {
      opener: `💡 Did you know?`,
      body: `Here is a quick ${c.category} tip from the team at ${c.name}. A little knowledge goes a long way — save this for later and share it with someone who needs it.`,
      closer: 'Follow for more useful tips like this.',
    },
    'new-arrival': {
      opener: `🆕 Something new just landed at ${c.name}.`,
      body: `Fresh picks are in store now in ${c.location}. Be first to see the newest ${c.category} favourites before they are gone.`,
      closer: 'Come take a look this week.',
    },
  } as const;
  return g[goal];
}

// Hashtags built from the business name, category, location + platform.
export function hashtagsFor(business: Pick<Business, 'name' | 'category' | 'location'>, goal: CopyGoal): string {
  const tag = (s: string) => '#' + s.replace(/[^a-zA-Z0-9]+/g, '').replace(/\d+$/, '');
  const words: string[] = [business.category, business.location];
  business.name.split(/[^a-zA-Z0-9]+/).filter((w) => w.length > 2).forEach((w) => words.push(w));
  const goalTag: Record<CopyGoal, string> = {
    'grand-opening': 'NowOpen', 'product-launch': 'NewArrival', 'weekend-promo': 'WeekendDeals',
    'flash-sale': 'FlashSale', 'seasonal-sale': 'SeasonalSale', hiring: 'HiringNow',
    event: 'EventAlert', 'thank-you': 'ThankYou', anniversary: 'Anniversary',
    testimonial: 'CustomerLove', 'behind-scenes': 'BehindTheScenes',
    educational: 'BusinessTips', 'new-arrival': 'NewInStore',
  };
  const base = Array.from(new Set(words.map(tag).filter((t) => t.length > 1)));
  const picks = [...base.slice(0, 6), tag(goalTag[goal]), 'NowOpenAfrica', 'SmallBusiness', 'ShopLocal'];
  return Array.from(new Set(picks.filter(Boolean))).join(' ');
}

export function copyForGoal(
  business: Pick<Business, 'name' | 'category' | 'location' | 'phone' | 'description' | 'hours'>,
  goal: CopyGoal,
  platform: CopyPlatform,
): string {
  const c = context(business);
  const { opener, body, closer } = goalCopy(goal, c);
  const cta = CTAS[platform];

  if (platform === 'seo') {
    const keywords = [c.category, c.location, c.name].filter(Boolean).join(', ');
    return `${c.name} — ${c.category} in ${c.location}. ${c.description || `${c.name} is your trusted ${c.category} destination near you.`} Discover offers, hours and directions on our NowOpen Africa profile. ${c.phone ? `Call us on ${c.phone}.` : ''} Visit ${c.name} today. (Keywords: ${keywords})`;
  }

  if (platform === 'sms') {
    // SMS has a hard 160-char limit — trim the body and keep it punchy.
    const { opener, body, closer } = goalCopy(goal, c);
    const phoneBit = c.phone ? ` Call/WhatsApp ${c.phone}.` : '';
    const stop = ` Reply STOP to opt out. (${closer})`;
    const maxBody = 160 - phoneBit.length - stop.length;
    const line = `${opener} ${body}`.trim();
    const base = line.length > maxBody ? line.slice(0, Math.max(40, maxBody - 1)).trimEnd().replace(/[,;]$/, '') + '…' : line;
    return `${base}${phoneBit}${stop}`;
  }

  if (platform === 'email') {
    return [
      `Subject: ${opener}`,
      '',
      `Hi there,`,
      '',
      body,
      '',
      c.phone ? `Questions? Call or WhatsApp ${c.phone}.` : '',
      c.hours ? `Opening hours: ${c.hours}.` : '',
      closer,
      '',
      `— The ${c.name} team`,
    ].filter(Boolean).join('\n');
  }

  if (platform === 'blog') {
    return [
      `${opener}`,
      '',
      `At ${c.name}, we believe great ${c.category || 'service'} should be easy to find and even easier to enjoy. That is why ${c.location && `customers across ${c.location} `}keep coming back.`,
      '',
      body,
      '',
      closer,
      '',
      `Get in touch: ${c.phone || 'message us on NowOpen Africa'}.`,
    ].join('\n');
  }

  // Social caption (instagram/facebook/linkedin/whatsapp/x)
  return [opener, '', body, '', cta, c.phone ? `📞 ${c.phone}` : ''].filter(Boolean).join('\n');
}

// A bundle across every platform for one goal — used by the "Download copy
// pack" button and the Export Centre.
export function copyPack(
  business: Pick<Business, 'name' | 'category' | 'location' | 'phone' | 'description' | 'hours'>,
  goal: CopyGoal,
): CopyPackItem[] {
  return COPY_PLATFORMS.map(({ key }) => ({
    platform: key,
    goal,
    text: copyForGoal(business, goal, key),
    hashtags: key === 'instagram' || key === 'x' ? hashtagsFor(business, goal) : '',
  }));
}
