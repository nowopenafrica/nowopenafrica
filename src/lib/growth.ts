// NowOpen Studio — Growth Center.
//
// The Growth Score (0-100) measures how complete, trusted and discoverable a
// business is, then turns the gaps into a weekly action plan. Every task links
// straight into a Studio module, so improving your score is one click away.
// Rule-based and instant, so the Growth Center works fully offline.

import { Business } from '../types';

export interface ScoreItem {
  label: string;
  earned: number;
  max: number;
}

export type GrowthPlanModule =
  | 'home' | 'brand-kit' | 'card' | 'social' | 'flyer' | 'poster' | 'banner'
  | 'copywriter' | 'promotions' | 'planner' | 'health' | 'assistant'
  | 'live-promo' | 'campaigns' | 'loyalty' | 'analytics' | 'challenges'
  | 'landing' | 'invoices'
  | 'campaign' | 'announce' | 'quotations' | 'catalogues';

export interface GrowthPlanTask {
  id: string;
  title: string;
  detail: string;
  module: GrowthPlanModule;
  effort: 'quick' | 'deep';
}

const has = (v: unknown) => !!(v && String(v).trim());

// --- Growth Score -----------------------------------------------------------

export function growthScore(business: Business): { score: number; items: ScoreItem[] } {
  const items: ScoreItem[] = [];
  const add = (label: string, earned: number, max: number) =>
    items.push({ label, earned: Math.max(0, Math.min(max, Math.round(earned))), max });

  // 1. Profile completeness (0-50) — one field at a time.
  const fields: [string, unknown][] = [
    ['Name', business.name],
    ['Description', business.description],
    ['Category', business.category],
    ['Location', business.location],
    ['Phone', business.phone],
    ['Opening hours', business.hours],
    ['Website / email', business.website || business.email],
    ['Logo', business.logo_url],
    ['Cover photo', business.image_url],
    ['Brand link', business.username],
  ];
  const filled = fields.filter(([, v]) => has(v)).length;
  add('Profile completeness', (filled / fields.length) * 50, 50);

  // 2. Customer reviews (0-15).
  const rating = Number(business.rating) || 0;
  add('Customer reviews', rating > 0 ? (rating / 5) * 15 : 0, 15);

  // 3. Trust & verification (0-25).
  const signals: unknown[] = [
    business.verified,
    business.phone_verified,
    business.email_verified,
    business.id_verified,
    business.registration_verified,
    business.address_verified,
    business.documents_reviewed,
    business.onsite_verified,
  ];
  const verified = signals.filter(Boolean).length;
  add('Verification & trust', (verified / signals.length) * 20 + (business.verification_tier ? 5 : 0), 25);

  // 4. Time on platform (0-10).
  let tenure = 0;
  if (business.created_at) {
    const months = (Date.now() - new Date(business.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30);
    tenure = Math.min(10, Math.round(Math.max(0, months)));
  }
  add('Time on platform', tenure, 10);

  const score = Math.max(0, Math.min(100, items.reduce((s, x) => s + x.earned, 0)));
  return { score, items };
}

export function scoreLabel(score: number): string {
  if (score >= 90) return 'Growth Legend';
  if (score >= 75) return 'Growing Strong';
  if (score >= 55) return 'Building Momentum';
  if (score >= 35) return 'Getting Started';
  return 'Fresh Start';
}

// --- Weekly Growth Plan -----------------------------------------------------

export function weekKeyFor(date: Date): string {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday first
  d.setDate(d.getDate() - day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function planStorageKey(businessId: string, date = new Date()): string {
  return `nowopen_growth_plan_${businessId}_${weekKeyFor(date)}`;
}

export function weeklyPlan(business: Business): GrowthPlanTask[] {
  const tasks: GrowthPlanTask[] = [];
  const push = (id: string, title: string, detail: string, module: GrowthPlanModule, effort: 'quick' | 'deep') =>
    tasks.push({ id, title, detail, module, effort });

  const descLen = String(business.description || '').trim().length;
  if (!business.logo_url) push('logo', 'Add your logo', 'A logo is the face of your brand. Open the Brand Kit, upload it once, and every Studio export uses it automatically.', 'brand-kit', 'quick');
  if (!business.image_url) push('cover', 'Add a cover photo', 'Your cover is the first thing customers see. Add a sharp photo of your space, products or team.', 'card', 'quick');
  if (descLen < 60) push('description', 'Strengthen your description', 'Profiles with a full description get more visits. Use the AI Copywriter to rewrite it in your brand tone.', 'copywriter', 'quick');
  if (!business.phone) push('phone', 'Add a phone number', 'Customers expect to call or WhatsApp you. Add your number to unlock calls in one tap.', 'card', 'quick');
  if (!business.hours) push('hours', 'Set your opening hours', 'Showing hours builds trust and stops missed customers. Update them in your card.', 'card', 'quick');
  if (!business.username) push('link', 'Claim your brand link', 'Own a clean NowOpen link like nowopenafrica.com/yourbrand, then put it on your business card with its QR.', 'card', 'quick');

  push('post', 'Design this week’s social post', 'One polished post a week beats a month of silence. Pick a template and download it in every format.', 'social', 'quick');
  push('promo', 'Run a weekend promotion', 'Weekend offers are the fastest way to pull customers in. Build a promo asset with a clear headline and deadline.', 'promotions', 'deep');
  push('whatsapp', 'Share a WhatsApp status', 'Broadcast this week’s offer to everyone who saved your number.', 'assistant', 'quick');
  push('plan', 'Add content to your calendar', 'Plan the next 7 days of posts, promos and stories so you never scramble at the last minute.', 'planner', 'deep');
  push('caption', 'Generate captions for your posts', 'Let the AI Copywriter turn this week’s offer into captions, hashtags and an SMS blast.', 'copywriter', 'quick');
  push('campaign', 'Launch a one-click campaign', 'Pick a goal and Studio writes your whole week — posts, stories, WhatsApp, email and SMS — in one click.', 'campaign', 'deep');
  push('announce', 'Publish an announcement', 'New product, new branch or holiday hours? Compose it once and publish straight to your profile.', 'announce', 'quick');
  push('quote', 'Send a proposal to a customer', 'Turn your next order into a proper quote with VAT and a total, then send it on WhatsApp.', 'quotations', 'deep');
  push('catalogue', 'Share your digital catalogue', 'Turn your products or menu into a clean, shareable list customers can browse on any phone.', 'catalogues', 'quick');

  const seen = new Set<string>();
  return tasks.filter((t) => {
    const k = `${t.module}-${t.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// --- Health tips (Business Health dashboard) --------------------------------

export function healthTips(business: Business): { tip: string; module: GrowthPlanModule }[] {
  const tips: { tip: string; module: GrowthPlanModule }[] = [];
  if (!business.phone_verified)
    tips.push({ tip: 'Verify your phone number to show the trusted badge and unlock WhatsApp messaging.', module: 'health' });
  if (!business.registration_verified && !business.documents_reviewed)
    tips.push({ tip: 'Complete document review to earn the verified badge and appear higher in search.', module: 'health' });
  if (!business.rating || Number(business.rating) === 0)
    tips.push({ tip: 'Ask 5 happy customers for a review — ratings are the #1 trust signal for new visitors.', module: 'health' });
  if (String(business.description || '').trim().length < 60)
    tips.push({ tip: 'A fuller description keeps visitors on your profile longer and improves search ranking.', module: 'copywriter' });
  if (!business.logo_url)
    // Was "look 3× more professional" — an invented multiplier stated as fact,
    // the same class of claim removed from the opening-hours coach. The nudge
    // stands on its own without a statistic nobody measured.
    tips.push({ tip: 'A logo makes your profile look finished, and every Studio export picks it up automatically. Upload one in the Brand Kit.', module: 'brand-kit' });
  if (tips.length < 3)
    tips.push({ tip: 'Keep posting weekly — a steady feed is what keeps you in front of customers.', module: 'social' });
  if (tips.length < 4)
    tips.push({ tip: 'Put your profile link and its QR on your business card for flyers, receipts and your storefront window.', module: 'card' });
  return tips.slice(0, 4);
}
