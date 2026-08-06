// NowOpen Studio — AI Notifications (Morning Brief).
//
// Each morning the Studio produces a "brief" — a greeting, the live status,
// a seeded weather outlook for the business's city and a set of rule-based
// AI notices: "you are still closed", "no post published yet today", "rainy
// day — push delivery", "weekend offer ideas", review prompts and a growth
// note. Each notice links to the Studio module that fixes it.

import { Business } from '../types';
import { hashString, mulberry32, pick } from './videoCreator';
import { dateKey, loadClockConfig, resolveBusinessStatus, getStatusMeta } from './businessStatus';
import { computeAnalytics } from './analytics';
import { loadPlannerItems } from './planner';
import { GrowthPlanModule } from './growth';

export interface MorningNotification {
  id: string;
  title: string;
  body: string;
  emoji: string;
  tone: 'good' | 'warn' | 'info' | 'tip';
  module: GrowthPlanModule;
}

export interface Weather {
  condition: string;
  emoji: string;
  tempC: number;
  rainPct: number;
}

export interface MorningBrief {
  date: string;
  greeting: string;
  status: string;
  statusEmoji: string;
  statusLabel: string;
  weather: Weather;
  weekend: boolean;
  season: string;
  highlight: string;
  notifications: MorningNotification[];
}

const WEATHER_POOL: { condition: string; emoji: string; rainPct: number }[] = [
  { condition: 'Sunny', emoji: '☀️', rainPct: 5 },
  { condition: 'Partly cloudy', emoji: '⛅', rainPct: 15 },
  { condition: 'Cloudy', emoji: '☁️', rainPct: 30 },
  { condition: 'Rainy', emoji: '🌧️', rainPct: 75 },
  { condition: 'Humid & warm', emoji: '🌡️', rainPct: 45 },
];

export function weatherFor(business: Business, now = new Date()): Weather {
  const rng = mulberry32(hashString(`${business.id}:${dateKey(now)}:weather`));
  const base = pick(rng, WEATHER_POOL);
  return { ...base, tempC: 22 + Math.floor(rng() * 13) };
}

export function seasonFor(now = new Date()): string {
  const month = now.getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

export function buildMorningBrief(business: Business, now = new Date()): MorningBrief {
  const config = loadClockConfig(business);
  const status = resolveBusinessStatus(business, config, now);
  const statusMeta = getStatusMeta(status, business.category);
  const analytics = computeAnalytics(business);
  const weather = weatherFor(business, now);
  const day = now.getDay();
  const weekend = day === 0 || day === 6;
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const notifications: MorningNotification[] = [];
  let id = 0;
  const push = (title: string, body: string, emoji: string, tone: MorningNotification['tone'], module: GrowthPlanModule) =>
    notifications.push({ id: `${dateKey(now)}-${id++}`, title, body, emoji, tone, module });

  if (status === 'closed') {
    push('You are still closed', 'Customers visiting now see "Closed". Opening keeps your streak and metrics climbing.', '⚫', 'warn', 'card');
  } else {
    push('You are open', `Your status is "${statusMeta.label}" — customers can find you right now.`, statusMeta.emoji, 'good', 'card');
  }

  const publishedToday = loadPlannerItems(business.id).some((i) => i.date === dateKey(now) && i.status === 'published');
  if (!publishedToday) {
    push('No post published today', 'One post today keeps your cadence and feed growing. Plan it in seconds.', '📸', 'tip', 'planner');
  } else {
    push('Post published', 'You already posted today — keep the streak going tomorrow.', '✅', 'good', 'planner');
  }

  if (weather.rainPct >= 60) {
    push('Rainy day ahead', 'Wet weather is delivery weather. Push delivery and pickup offers today.', '🌧️', 'tip', 'promotions');
  } else if (weather.condition === 'Sunny') {
    push('Bright day for content', 'Good light means great photos and stories. Capture something visual today.', '☀️', 'info', 'social');
  }

  if (weekend) {
    push('Weekend is here', 'Weekend offers convert best on Fridays–Sundays. Share one with a deadline.', '🎉', 'tip', 'promotions');
  }

  if (analytics.reviewStats.total > 0 && analytics.reviewStats.responded < analytics.reviewStats.total) {
    push('Reviews need replies', `${analytics.reviewStats.responded}/${analytics.reviewStats.total} reviews answered. Public replies win customers back.`, '💬', 'warn', 'home');
  } else {
    push('Ask for a review', 'Happy customers rarely review unless asked. Send a gentle request after the visit.', '⭐', 'info', 'home');
  }

  if (analytics.score < 60) {
    push('Growth score needs a push', `Your score is ${analytics.score}/100. Today's mission is the fastest fix.`, '📈', 'info', 'analytics');
  } else {
    push('Growth on track', `Your score is ${analytics.score}/100 — keep the momentum.`, '📈', 'good', 'analytics');
  }

  const highlight = status === 'closed'
    ? `Open now to start earning today's metrics and keep your streak alive.`
    : publishedToday
      ? `You have already posted today — outstanding. Now check today's mission.`
      : `No post yet today. ${weekend ? 'A weekend offer' : 'One strong post'} can set the tone for the whole day.`;

  return {
    date: dateKey(now),
    greeting,
    status,
    statusEmoji: statusMeta.emoji,
    statusLabel: statusMeta.label,
    weather,
    weekend,
    season: seasonFor(now),
    highlight,
    notifications,
  };
}
