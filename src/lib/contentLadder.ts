// NowOpen Studio — AI Monthly Planner.
//
// Generates a full month of on-brand content days (Sun–Sat theme ladder) for
// the business's industry: educational tips, product spotlights, behind the
// scenes, social proof, weekend offers and lifestyle posts, each with a
// ready caption, a suggested platform and a matching design format. One click
// dumps the whole month into the Content Planner storage (`nowopen_planner_*`).

import { Business } from '../types';
import { hashString, mulberry32, pick } from './videoCreator';
import { industryKeyForCategory, industryByKey } from './videoCreator';
import { loadPlannerItems, savePlannerItems, PlanItem } from './planner';
import { WEEKDAY_LABELS_FULL } from './businessStatus';

export interface Theme {
  key: string;
  label: string;
  emoji: string;
  hook: string; // caption pattern placeholder for the angle
}

// The weekly content ladder — every business gets a mix of selling and trust
// building so the feed never turns into a pure ad wall.
export const WEEK_THEMES: Theme[] = [
  { key: 'educational', label: 'Educational', emoji: '🎓', hook: 'A quick tip' },
  { key: 'product', label: 'Product spotlight', emoji: '✨', hook: 'Today’s spotlight' },
  { key: 'behind-scenes', label: 'Behind the scenes', emoji: '🎬', hook: 'Behind the scenes' },
  { key: 'proof', label: 'Social proof', emoji: '⭐', hook: 'What customers say' },
  { key: 'promo', label: 'Weekend offer', emoji: '🏷️', hook: 'This weekend' },
  { key: 'lifestyle', label: 'Lifestyle & fun', emoji: '🎉', hook: 'Good vibes' },
  { key: 'community', label: 'Community & rest', emoji: '💛', hook: 'From our community' },
];

export const LADDER_PLATFORMS = ['instagram', 'facebook', 'whatsapp', 'tiktok', 'x', 'gmb', 'linkedin'];

export const LADDER_FORMATS = ['Post', 'Story', 'Reel', 'Carousel'];

export interface ContentDay {
  date: string; // YYYY-MM-DD
  dayName: string; // e.g. 'Mon'
  theme: Theme;
  title: string;
  caption: string;
  platform: string;
  format: string;
  emoji: string;
  status: 'planned';
}

function dayTheme(dayOfWeek: number): Theme {
  // dayOfWeek: 0 = Sunday … 6 = Saturday. The ladder runs Sun-first
  // (community → educational → product → BTS → proof → promo → lifestyle).
  return WEEK_THEMES[(dayOfWeek + 6) % 7];
}

export function buildMonthPlan(business: Business, opts?: { year?: number; month?: number; now?: Date }): ContentDay[] {
  const base = opts?.now || new Date();
  const year = opts?.year ?? base.getFullYear();
  const month = opts?.month ?? base.getMonth(); // 0-based
  const industry = industryByKey(industryKeyForCategory(business.category));
  const rng = mulberry32(hashString(`${business.id}:${year}-${month + 1}:ladder`));

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: ContentDay[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const theme = dayTheme(date.getDay());
    const focus = pick(rng, industry.promote);
    const hook = pick(rng, industry.hooks);
    const promise = industry.promise;
    const platform = LADDER_PLATFORMS[(d - 1) % LADDER_PLATFORMS.length];
    const format = pick(rng, LADDER_FORMATS);

    const titles: Record<string, string> = {
      educational: `Did you know? ${industry.label} tip of the day`,
      product: `${focus} — ${business.name} spotlight`,
      'behind-scenes': `Inside ${business.name}`,
      proof: `Rated ${business.rating || 5}/5 by real customers`,
      promo: `${focus} — this weekend at ${business.name}`,
      lifestyle: `Good vibes only at ${business.name}`,
      community: `From our community — ${business.name}`,
    };

    const captions: Record<string, string> = {
      educational: `${hook}.\n\nToday's tip: how to choose the right ${focus.toLowerCase()} — ${promise}.\n\nSave this for later.`,
      product: `${hook} — ${focus}.\n\n${promise}. Ask us on WhatsApp for today's price.\n\n#NowOpenAfrica`,
      'behind-scenes': `${hook}: ${industry.setting}.\n\n${industry.closeup}. Real work, real care.\n\n${business.name} — ${industry.focus}.`,
      proof: `${hook}: "${focus} never disappoints."\n\n${promise}. Come see why customers rate us ${business.rating || 5}/5.\n\n#NowOpenAfrica`,
      promo: `${hook}: ${focus}, only at ${business.name}.\n\n${promise}. Tag a friend to join you.\n\n#NowOpenAfrica #LocalBusiness`,
      lifestyle: `${hook} — ${industry.setting}, ${industry.promise}.\n\nFollow along for daily posts from ${business.name}.`,
      community: `${hook}: ${industry.promise}.\n\nTell us in the comments — what should we post next?\n\n#NowOpenAfrica`,
    };

    days.push({
      date: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      dayName: WEEKDAY_LABELS_FULL[date.getDay()].slice(0, 3),
      theme,
      title: titles[theme.key],
      caption: captions[theme.key],
      platform,
      format,
      emoji: theme.emoji,
      status: 'planned',
    });
  }

  return days;
}

// Merge the generated month into the planner storage (skips days that already
// have a planned item) so the Content Planner calendar fills up in one click.
export function saveMonthToPlanner(businessId: string, plan: ContentDay[]): number {
  const existing = loadPlannerItems(businessId);
  const existingKeys = new Set(existing.map((i) => `${i.date}|${i.title}`));
  const additions: PlanItem[] = [];
  for (const day of plan) {
    const key = `${day.date}|${day.title}`;
    if (existingKeys.has(key)) continue;
    additions.push({
      id: `${day.date}-${Math.random().toString(36).slice(2, 8)}`,
      date: day.date,
      title: day.title,
      platform: `${day.platform} · ${day.format}`,
      status: 'planned',
    });
  }
  if (additions.length > 0) savePlannerItems(businessId, [...existing, ...additions]);
  return additions.length;
}
