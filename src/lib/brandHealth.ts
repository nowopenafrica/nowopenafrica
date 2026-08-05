// Brand Consistency Score + Recommendations for the Brand OS.
//
// A deterministic 0–100 health check computed from the business profile and
// the editable brand identity. Every incomplete item becomes a recommendation
// with the exact points completing it would earn — so the score doubles as a
// to-do list. This is the "Brand Health" Canva doesn't have.

import { Business } from '../types';
import { deriveTier } from './trust';
import { BrandIdentity } from './brandIdentity';

export interface HealthItem {
  label: string;
  detail: string;
  earned: number;
  total: number;
  ok: boolean;
  partial?: boolean;
}

export interface HealthSuggestion {
  label: string;
  action: string;
  points: number;
  impact: string;
}

export interface BrandHealth {
  score: number;
  items: HealthItem[];
  suggestions: HealthSuggestion[];
}

function item(label: string, detail: string, earned: number, total: number): HealthItem {
  const ok = earned >= total;
  const partial = !ok && earned > 0;
  return { label, detail, earned, total, ok, partial };
}

const IMPACT: Record<string, string> = {
  trust: 'boosts trust & conversions',
  visibility: 'raises visibility in search',
  premium: 'makes you look established',
  reach: 'grows reach & discovery',
  sales: 'supports sales & credibility',
};

export function computeBrandHealth(business: Business, identity: BrandIdentity): BrandHealth {
  const items: HealthItem[] = [];

  const descLen = (business.description || '').trim().length;
  items.push(item('Logo', 'A sharp logo builds instant recognition', business.logo_url ? 15 : 0, 15));
  items.push(item('Cover / hero image', 'First impression on your profile', business.image_url ? 10 : 0, 10));
  items.push(item('Business description', 'Describe what you offer', descLen >= 80 ? 10 : descLen >= 30 ? 5 : 0, 10));
  items.push(item(
    'Contact details',
    'Phone + website/email + location',
    ((business.phone ? 1 : 0) + ((business.website || business.email) ? 1 : 0) + (business.location ? 1 : 0)) >= 2 ? 10 : 0,
    10,
  ));
  items.push(item('Category', 'Tell people what you are', business.category ? 5 : 0, 5));
  items.push(item('Verification', 'Verified badge builds trust', deriveTier(business) !== 'none' ? 10 : 0, 10));
  items.push(item('Tagline', 'One-line positioning', identity.tagline.trim() ? 5 : 0, 5));
  items.push(item('Mission', 'Why you exist', identity.mission.trim() ? 5 : 0, 5));
  items.push(item('Business story', 'Your journey so far', identity.story.trim() ? 5 : 0, 5));
  items.push(item('Brand promise', 'The promise customers remember', identity.brandPromise.trim() ? 5 : 0, 5));
  items.push(item('Brand voice', 'Voice traits + writing style set', identity.voice.length > 0 || identity.writingStyle !== 'professional' ? 5 : 0, 5));
  items.push(item('Opening hours', 'Always-open signals', business.hours ? 5 : 0, 5));
  items.push(item('Reviews', 'Social proof', business.rating !== undefined && business.rating >= 4 ? 5 : 0, 5));
  items.push(item('Established', 'A founding year adds heritage', identity.established.trim() ? 5 : 0, 5));

  const total = items.reduce((sum, i) => sum + i.total, 0);
  const earned = items.reduce((sum, i) => sum + i.earned, 0);
  const score = Math.round((earned / total) * 100);

  const suggestions: HealthSuggestion[] = [];
  const push = (i: HealthItem, label: string, action: string, impact: string) => {
    const missing = i.total - i.earned;
    if (missing > 0) suggestions.push({ label, action, points: missing, impact });
  };

  push(items[0], 'Upload a clear logo', 'Add a logo from your dashboard', IMPACT.trust);
  push(items[1], 'Add a cover / hero image', 'Add a cover image from your dashboard', IMPACT.visibility);
  push(items[2], 'Write a fuller business description', 'Expand your description to 80+ characters', IMPACT.trust);
  push(items[3], 'Complete your contact details', 'Add phone, website or email, and location', IMPACT.sales);
  push(items[4], 'Pick a category', 'Choose a category on your profile', IMPACT.visibility);
  push(items[5], 'Apply for verification', 'Complete verification to earn the badge', IMPACT.trust);
  push(items[6], 'Add your tagline', 'Set a one-line positioning in Brand Identity', IMPACT.premium);
  push(items[7], 'Add your mission', 'Tell people why you exist in Brand Identity', IMPACT.premium);
  push(items[8], 'Tell your business story', 'Share your journey in Brand Identity', IMPACT.premium);
  push(items[9], 'Set a brand promise', 'Define the promise in Brand Identity', IMPACT.premium);
  push(items[10], 'Choose your brand voice', 'Pick voice traits in Brand Identity', IMPACT.reach);
  push(items[11], 'Add opening hours', 'Set your hours on your profile', IMPACT.trust);
  push(items[12], 'Collect reviews', 'Ask happy customers to review you', IMPACT.trust);
  push(items[13], 'Add your founding year', 'Enter an established year in Brand Identity', IMPACT.premium);

  return { score, items, suggestions };
}
