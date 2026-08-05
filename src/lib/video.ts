// NowOpen Studio — Reel & Video Studio.
//
// Turns a goal into a shootable reel script: hook, value, call-to-action,
// then a scene-by-scene breakdown with on-screen captions, filming directions
// and voiceover lines. Export the caption + voiceover as copy in one tap.

import { Business } from '../types';

export type ReelFormat = '15s Reel' | 'Product Showcase' | 'Promo Video' | 'Story';

export interface ReelScene {
  id: string;
  duration: number;
  caption: string;
  direction: string;
  voiceover: string;
}

export interface ReelScript {
  id: string;
  format: ReelFormat;
  title: string;
  hook: string;
  value: string;
  cta: string;
  scenes: ReelScene[];
  caption: string;
  hashtags: string[];
  createdAt: string;
}

export const REEL_FORMATS: { key: ReelFormat; label: string; desc: string; total: number }[] = [
  { key: '15s Reel', label: '15s Reel', desc: 'Fast hook, quick value, one CTA. Built for Instagram Reels & TikTok.', total: 15 },
  { key: 'Product Showcase', label: 'Product Showcase', desc: 'Feature your offer in close-ups with bold captions.', total: 18 },
  { key: 'Promo Video', label: 'Promo Video', desc: 'Announce a promotion with urgency and a clear offer.', total: 18 },
  { key: 'Story', label: 'Story', desc: 'Short story-format clips with a swipe-up style CTA.', total: 12 },
];

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const HASHTAG_SUGGESTIONS: [RegExp, string[]][] = [
  [/restaurant|fast food|caf|bar|grill|food|eatery|barbecue|bbq/i, ['#Foodie', '#NigerianFood', '#LocalBiz', '#TastyNigeria', '#SupportLocal']],
  [/fashion|apparel|cloth|tailor|attire|jewelry|accessories/i, ['#Fashionista', '#StyleInspo', '#NaijaFashion', '#OOTD']],
  [/salon|barber|beauty|spa|wellness|skincare/i, ['#BeautyNigerian', '#GlowUp', '#SelfCare', '#NaturalBeauty']],
  [/gym|fitness|sport/i, ['#FitnessGoals', '#GymLife', '#TrainHard', '#FitNaija']],
  [/hotel|lodg|travel|tour|short/i, ['#TravelNaija', '#ExploreNigeria', '#Wanderlust', '#WeekendGetaway']],
  [/tech|soft|web|app|it|repair|gadget|phone/i, ['#TechNaija', '#Gadgets', '#Innovation', '#TechLife']],
  [/photograph|video|media|design|creative|art/i, ['#CreativeLagos', '#VisualStory', '#MadeInNigeria', '#Creator']],
  [/pharm|clinic|hospital|dental|vet|health/i, ['#HealthFirst', '#Wellness', '#StayHealthy', '#Care']],
  [/school|tutor|educ|train|learn/i, ['#Learning', '#EducationForAll', '#SkillUp', '#KnowledgeIsPower']],
  [/real estate|property|estate|house/i, ['#RealEstateNaija', '#HomeGoals', '#PropertyLagos', '#NewHome']],
];

export function hashtagsFor(category: string): string[] {
  const match = HASHTAG_SUGGESTIONS.find(([re]) => re.test(category || ''));
  return match ? [...match[1], '#NowOpenAfrica'] : ['#SupportLocal', '#NowOpenAfrica', '#SmallBusiness'];
}

function hookFor(business: Business, format: ReelFormat): string {
  if (format === 'Promo Video') return 'This offer ends soon — act fast!';
  if (format === 'Product Showcase') return `Watch closely — ${business.name}'s best seller.`;
  return '3 seconds that will change how you see us.';
}

function valueFor(business: Business, format: ReelFormat): string {
  if (format === 'Promo Video') return `We're running a limited-time deal at ${business.name}.`;
  if (format === 'Product Showcase') return `Here's what makes ${business.name} different.`;
  return `Here's why people love ${business.name}.`;
}

function ctaFor(business: Business): string {
  return business.phone ? `Message us on WhatsApp to order — tap the link in our bio.` : `Find ${business.name} on NowOpen Africa and tap the message button.`;
}

function formatCaption(format: ReelFormat): string {
  switch (format) {
    case 'Product Showcase': return 'We put it to the test — and you are going to love it.';
    case 'Promo Video': return 'Limited time. Don’t sleep on this one.';
    case 'Story': return 'Quick one — this is what we have been up to.';
    default: return 'Swipe to see what we are about.';
  }
}

const SCENE_TEMPLATES: Record<ReelFormat, (b: Business, hook: string, value: string, cta: string) => Omit<ReelScene, 'id'>[]> = {
  '15s Reel': (b, hook, value, cta) => [
    { duration: 3, caption: 'Wait for it…', direction: 'Close-up of the product or storefront, punchy zoom on the logo.', voiceover: hook },
    { duration: 3, caption: 'This is us 👀', direction: 'Fast montage: staff at work, happy customers, or the product in action.', voiceover: `Meet ${b.name}.` },
    { duration: 3, caption: 'Here’s the thing', direction: 'Two quick cuts showing the key feature or offer.', voiceover: value },
    { duration: 3, caption: 'See for yourself', direction: 'Wide shot of the space or a satisfied customer reaction.', voiceover: 'Come see for yourself.' },
    { duration: 3, caption: 'Message us now', direction: 'Freeze frame on logo, phone number or offer.', voiceover: cta },
  ],
  'Product Showcase': (b, hook, value, cta) => [
    { duration: 3, caption: 'You asked…', direction: 'Product held up, natural light.', voiceover: hook },
    { duration: 3, caption: b.name, direction: 'Slow pan across the product.', voiceover: `Meet our signature at ${b.name}.` },
    { duration: 3, caption: 'The details', direction: 'Macro shots: texture, finishing, packaging.', voiceover: 'Notice the details — everything is intentional.' },
    { duration: 3, caption: 'Who it’s for', direction: 'Cut to a customer using or wearing it.', voiceover: value },
    { duration: 3, caption: 'Real reviews', direction: 'Screenshots or spoken quote from a customer.', voiceover: 'Our customers agree.' },
    { duration: 3, caption: 'Get yours', direction: 'Logo + phone number on screen.', voiceover: cta },
  ],
  'Promo Video': (b, hook, value, cta) => [
    { duration: 3, caption: 'OFFER ALERT ⚡', direction: 'Big bold text over brand colours, sound effect on impact.', voiceover: hook },
    { duration: 3, caption: 'What you get', direction: 'List the offer items on screen one by one.', voiceover: value },
    { duration: 3, caption: 'Only while it lasts', direction: 'Countdown or calendar graphic.', voiceover: 'This runs for a limited time only.' },
    { duration: 3, caption: 'No gimmicks', direction: 'Staff or owner gives a thumbs up.', voiceover: 'Simple, honest, no gimmicks.' },
    { duration: 3, caption: 'How to claim', direction: 'Step-by-step: message, order, done.', voiceover: 'Message us to claim yours today.' },
    { duration: 3, caption: b.name, direction: 'Logo, address, phone number on screen.', voiceover: cta },
  ],
  'Story': (b, hook, value, cta) => [
    { duration: 3, caption: 'POV: your next visit 👀', direction: 'Vertical handheld shot inside the space.', voiceover: hook },
    { duration: 3, caption: 'Inside the magic', direction: `Behind-the-scenes at ${b.name}.`, voiceover: value },
    { duration: 3, caption: 'The best part', direction: 'Highlight the offer or customer reaction.', voiceover: 'And here is the best part.' },
    { duration: 3, caption: 'Tap to reach out', direction: 'Arrow pointing to the message button.', voiceover: cta },
  ],
};

export function scenesFor(format: ReelFormat, business: Business, hook: string, value: string, cta: string): ReelScene[] {
  const tmpl = SCENE_TEMPLATES[format](business, hook, value, cta);
  return tmpl.map((s) => ({ ...s, id: uid() }));
}

export function generateReel(business: Business, format: ReelFormat): ReelScript {
  const hook = hookFor(business, format);
  const value = valueFor(business, format);
  const cta = ctaFor(business);
  const scenes = scenesFor(format, business, hook, value, cta);
  return {
    id: uid(),
    format,
    title: business.name,
    hook,
    value,
    cta,
    scenes,
    caption: formatCaption(format),
    hashtags: hashtagsFor(business.category),
    createdAt: new Date().toISOString(),
  };
}

export function totalDuration(script: ReelScript): number {
  return script.scenes.reduce((s, x) => s + x.duration, 0);
}

export function voiceoverText(script: ReelScript): string {
  return script.scenes.map((s) => s.voiceover).filter(Boolean).join(' ');
}

export function captionText(script: ReelScript): string {
  return [script.caption, '', ...script.hashtags].join('\n');
}

export function shotListText(script: ReelScript): string {
  return script.scenes.map((s, i) => `Scene ${i + 1} · [${s.duration}s] ${s.caption}\n   🎬 ${s.direction}`).join('\n\n');
}

// --- Persistence ------------------------------------------------------------

export function reelsKey(businessId: string): string {
  return `nowopen_reels_${businessId}`;
}

export function loadReels(businessId: string): ReelScript[] {
  try {
    const raw = localStorage.getItem(reelsKey(businessId));
    const parsed = raw ? (JSON.parse(raw) as ReelScript[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveReels(businessId: string, scripts: ReelScript[]): void {
  try { localStorage.setItem(reelsKey(businessId), JSON.stringify(scripts)); } catch { /* ignore */ }
}
