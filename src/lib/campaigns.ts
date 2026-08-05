// NowOpen Studio — One-Click Campaigns.
//
// From a single goal, this generates a full campaign plan: a day-by-day
// timeline of posts, stories, WhatsApp broadcasts, emails and SMS — each with
// copy written from the business profile. Everything is rule-based and instant
// (no external API), matching the rest of Studio's on-device generation.

import { Business } from '../types';
import { CopyGoal, copyForGoal, hashtagsFor, COPY_GOALS } from './copywriter';

export type CampaignAsset =
  | 'Social post'
  | 'Story'
  | 'WhatsApp status'
  | 'Email'
  | 'SMS';

export interface CampaignStep {
  id: string;
  day: number;
  focus: string;
  platform: string;
  asset: CampaignAsset;
  caption: string;
}

export interface CampaignPlan {
  id: string;
  goal: CopyGoal;
  headline: string;
  startDate: string; // YYYY-MM-DD
  days: number;
  steps: CampaignStep[];
  createdAt: string;
}

export const CAMPAIGN_LENGTHS = [3, 5, 7] as const;

const DAY_FOCUS = [
  'The reveal',
  'The proof',
  'The reminder',
  'The deadline',
  'The last call',
  'The encore',
  'The thank you',
];

const GOAL_EMOJI: Record<CopyGoal, string> = {
  'grand-opening': '🎉',
  'product-launch': '✨',
  'weekend-promo': '📢',
  'flash-sale': '⚡',
  'seasonal-sale': '🎁',
  hiring: '🚀',
  event: '📅',
  'thank-you': '💛',
  anniversary: '🎂',
  testimonial: '⭐',
  'behind-scenes': '👀',
  educational: '💡',
  'new-arrival': '🆕',
};

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function goalLabel(goal: CopyGoal): string {
  return COPY_GOALS.find((g) => g.key === goal)?.label || goal;
}

export function dayFocus(day: number, days: number): string {
  const idx = Math.min(DAY_FOCUS.length, days) - 1;
  const slot = day - 1;
  return DAY_FOCUS[Math.min(slot, idx)];
}

export function dateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

// Timezone-safe day arithmetic on YYYY-MM-DD strings.
export function shiftDate(start: string, offset: number): string {
  const [y, m, d] = start.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  base.setDate(base.getDate() + offset);
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(base.getDate()).padStart(2, '0');
  return `${base.getFullYear()}-${mm}-${dd}`;
}

function makeCaption(
  business: Pick<Business, 'name' | 'category' | 'location' | 'phone' | 'description' | 'hours'>,
  goal: CopyGoal,
  focus: string,
  date: string,
  day: number,
  days: number,
): string {
  const base = copyForGoal(business, goal, 'instagram');
  return `${base}\n\n🔥 ${focus} — day ${day} of ${days}. Scheduled ${dateLabel(date)}.\n${hashtagsFor(business, goal)}`;
}

function makeStoryHook(
  business: Pick<Business, 'name' | 'category' | 'location'>,
  goal: CopyGoal,
  focus: string,
): string {
  return `${GOAL_EMOJI[goal]} ${focus}: ${business.name} — ${business.category || 'our latest'}${business.location ? ` in ${business.location}` : ''}. Follow along!`;
}

// Builds a full campaign plan. Deterministic per (business, goal, start, days).
export function buildCampaign(
  business: Pick<Business, 'name' | 'category' | 'location' | 'phone' | 'description' | 'hours'>,
  goal: CopyGoal,
  startDate: string,
  days: number,
): CampaignPlan {
  const headline = `${GOAL_EMOJI[goal]} ${goalLabel(goal)} — ${business.name}`;
  const steps: CampaignStep[] = [];
  for (let day = 1; day <= days; day++) {
    const focus = dayFocus(day, days);
    const date = shiftDate(startDate, day - 1);
    steps.push(
      { id: uid(), day, focus, platform: 'Instagram', asset: 'Social post', caption: makeCaption(business, goal, focus, date, day, days) },
      { id: uid(), day, focus, platform: 'Stories', asset: 'Story', caption: makeStoryHook(business, goal, focus) },
      { id: uid(), day, focus, platform: 'WhatsApp', asset: 'WhatsApp status', caption: copyForGoal(business, goal, 'whatsapp') },
      { id: uid(), day, focus, platform: 'Email', asset: 'Email', caption: copyForGoal(business, goal, 'email') },
      { id: uid(), day, focus, platform: 'SMS', asset: 'SMS', caption: copyForGoal(business, goal, 'sms') },
    );
  }
  return { id: uid(), goal, headline, startDate, days, steps, createdAt: new Date().toISOString() };
}

// Plain-text plan used for downloads and the full WhatsApp share.
export function campaignPlanText(plan: CampaignPlan): string {
  const head = [`NOWOPEN STUDIO — ONE-CLICK CAMPAIGN`, plan.headline, `Starts ${dateLabel(plan.startDate)} · ${plan.days} days`, '='.repeat(40)];
  let day = 0;
  for (const step of plan.steps) {
    if (step.day !== day) {
      day = step.day;
      head.push('', `DAY ${day} — ${step.focus}`, '-'.repeat(40));
    }
    head.push(`[${step.platform} · ${step.asset}]`, step.caption, '');
  }
  return head.join('\n');
}

// Short WhatsApp broadcast a business can send to announce the campaign.
export function campaignBroadcastText(plan: CampaignPlan): string {
  return [
    `📣 ${plan.headline}!`,
    `We are running a ${plan.days}-day campaign starting ${dateLabel(plan.startDate)}.`,
    `Watch our page for ${plan.steps.filter((s) => s.asset === 'Social post').length} new posts, stories and offers.`,
    `Don't miss out!`,
  ].filter(Boolean).join('\n');
}

// --- Persistence ------------------------------------------------------------

export function campaignsKey(businessId: string): string {
  return `nowopen_campaigns_plan_${businessId}`;
}

export function loadCampaigns(businessId: string): CampaignPlan[] {
  try {
    const raw = localStorage.getItem(campaignsKey(businessId));
    const parsed = raw ? (JSON.parse(raw) as CampaignPlan[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCampaigns(businessId: string, plans: CampaignPlan[]): void {
  try { localStorage.setItem(campaignsKey(businessId), JSON.stringify(plans)); } catch { /* ignore */ }
}
