// NowOpen Studio — AI Trend Radar.
//
// Surfaces what is "trending near you" for the business's industry and market
// (Nigeria, Kenya, Ghana, South Africa, Tanzania, Uganda), scores each trend's
// opportunity for THIS business (seeded by business id + market + date) and
// turns the top trend into a ready-to-post caption + reel idea. Reuses the
// existing TRENDS / TREND_MARKETS pools and the industry profiles from the
// video director so the suggestions stay on-brand.

import { Business } from '../types';
import { hashString, mulberry32, pick } from './videoCreator';
import { TRENDS, TREND_MARKETS, industryKeyForCategory, industryByKey, Trend } from './videoCreator';
import { dateKey } from './businessStatus';

export const TREND_EMOJIS = ['🔥', '⚡', '💫', '🎯', '🚀', '✨', '📈', '🎉'];

export function marketForLocation(location?: string): string {
  const loc = (location || '').toLowerCase();
  const match = TREND_MARKETS.find((m) => loc.includes(m.key.replace(/-/g, ' ')) || loc.includes(m.label.toLowerCase()));
  if (match) return match.key;
  if (/kenya|nairobi|mombasa|kisumu/i.test(loc)) return 'kenya';
  if (/ghana|accra|kumasi|takoradi/i.test(loc)) return 'ghana';
  if (/south|johannesburg|cape town|durban|pretoria/i.test(loc)) return 'south-africa';
  if (/tanzania|dar es|arusha|mwanza/i.test(loc)) return 'tanzania';
  if (/uganda|kampala|entebbe|jinja/i.test(loc)) return 'uganda';
  return 'nigeria';
}

export interface RadarTrend extends Trend {
  emoji: string;
  score: number; // opportunity for this business, 0-100
  fit: string; // why it fits this industry
  suggestedPost: string; // ready-to-post caption
  suggestedReel: string; // reel concept
  cta: string;
}

export interface TrendRadar {
  market: string;
  marketLabel: string;
  flag: string;
  industryKey: string;
  industryLabel: string;
  industryEmoji: string;
  trends: RadarTrend[];
  best: RadarTrend;
}

const CTAS = ['Tap to order', 'Message us now', 'Visit us today', 'Call us to book', 'Swipe up — offer inside'];

export function trendRadarFor(business: Business, opts?: { market?: string; count?: number; now?: Date }): TrendRadar {
  const now = opts?.now || new Date();
  const market = opts?.market || marketForLocation(business.location);
  const count = opts?.count || 3;
  const marketMeta = TREND_MARKETS.find((m) => m.key === market) || TREND_MARKETS[0];
  const industryKey = industryKeyForCategory(business.category);
  const industry = industryByKey(industryKey);
  const pool = TRENDS[market] || TRENDS.nigeria;

  const seeded = pool.map((t) => {
    const rng = mulberry32(hashString(`${business.id}:${market}:${t.topic}:${dateKey(now)}`));
    const score = 55 + Math.floor(rng() * 46); // 55-100
    const emoji = pick(rng, TREND_EMOJIS);
    const hook = pick(rng, industry.hooks) || t.hook;
    const focus = pick(rng, industry.promote) || t.topic;
    const cta = pick(rng, CTAS);
    return {
      ...t,
      emoji,
      score,
      fit: `Fits ${industry.label} — lean on "${focus}" and promise ${industry.promise}.`,
      suggestedPost: `${hook}\n\nToday's angle: ${focus}. ${industry.promise}.\n\n${cta}.\n\n${[...t.hashtags, ...industry.hashtags.slice(0, 3)].join(' ')}`,
      suggestedReel: `15s reel: ${t.topic} hook → ${industry.setting} → ${industry.closeup} → CTA "${cta}". Audio: ${t.audio}.`,
      cta,
    };
  });

  const trends = seeded.sort((a, b) => b.score - a.score).slice(0, count);

  return {
    market,
    marketLabel: marketMeta.label,
    flag: marketMeta.flag,
    industryKey,
    industryLabel: industry.label,
    industryEmoji: industry.emoji,
    trends,
    best: trends[0],
  };
}
