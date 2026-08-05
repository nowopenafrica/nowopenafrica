// NowOpen Studio — Competitor Insights (Premium).
//
// Benchmark your business against 3 synthetic local competitors in the same
// category and market (seeded per business so it is stable), then surface the
// biggest gaps and what to do about them. The Studio marks this panel as a
// premium feature; the component decides whether the current tier unlocks it.

import { Business } from '../types';
import { hashString, mulberry32, pick } from './videoCreator';
import { industryKeyForCategory, industryByKey } from './videoCreator';
import { computeAnalytics } from './analytics';
import { dailyFollowers } from './dailyBrief';

export interface Competitor {
  name: string;
  emoji: string;
  categoryLabel: string;
  location: string;
  followers: number;
  postsPerWeek: number;
  rating: number;
  engagement: number; // 0-100
  score: number; // 0-100
}

export interface GrowthGap {
  label: string;
  business: number;
  competitorAvg: number;
  gap: number; // positive = competitor ahead
  tip: string;
}

export interface CompetitorInsights {
  premium: boolean;
  competitors: Competitor[];
  businessScore: number;
  businessFollowers: number;
  businessRating: number;
  average: Competitor;
  rank: number; // 1-4 within the set
  gaps: GrowthGap[];
}

const COMPETITOR_NAME_POOL = [
  'Prime & Co', 'Top Choice', 'City Favourite', 'Golden Touch', 'Elite Services', 'Community Pick',
  'Urban Spot', 'Fresh Start', 'The Local', 'Best Deal', 'Your Neighbour', 'Skyline',
];

function competitorFor(business: Business, idx: number, rng: () => number, now: Date): Competitor {
  const industry = industryByKey(industryKeyForCategory(business.category));
  const name = pick(rng, COMPETITOR_NAME_POOL);
  const baseFollowers = dailyFollowers(business, now);
  const followers = Math.round(baseFollowers * (0.6 + rng() * 1.1));
  const postsPerWeek = 1 + Math.floor(rng() * 6);
  const rating = Math.round((3.4 + rng() * 1.5) * 10) / 10;
  const engagement = 20 + Math.floor(rng() * 60);
  const score = Math.round(35 + rng() * 50);
  return {
    name: `${name}${idx === 0 ? '' : ` ${idx}`}`,
    emoji: pick(rng, ['🏪', '🌟', '📍', '🏬', '✨', '🏪']),
    categoryLabel: industry.label,
    location: business.location || 'near you',
    followers,
    postsPerWeek,
    rating,
    engagement,
    score,
  };
}

export function competitorInsights(business: Business, now = new Date()): CompetitorInsights {
  const analytics = computeAnalytics(business);
  const businessScore = analytics.score;
  const businessFollowers = dailyFollowers(business, now);
  const businessRating = business.rating || 3.5;
  const businessPosts = analytics.publishedThisWeek;

  const rng = mulberry32(hashString(`${business.id}:competitors`));
  const competitors = [0, 1, 2].map((idx) => competitorFor(business, idx, rng, now));

  const average: Competitor = {
    name: 'Market average',
    emoji: '📊',
    categoryLabel: industryByKey(industryKeyForCategory(business.category)).label,
    location: business.location || 'near you',
    followers: Math.round(competitors.reduce((s, c) => s + c.followers, 0) / competitors.length),
    postsPerWeek: Math.round((competitors.reduce((s, c) => s + c.postsPerWeek, 0) / competitors.length) * 10) / 10,
    rating: Math.round((competitors.reduce((s, c) => s + c.rating, 0) / competitors.length) * 10) / 10,
    engagement: Math.round(competitors.reduce((s, c) => s + c.engagement, 0) / competitors.length),
    score: Math.round(competitors.reduce((s, c) => s + c.score, 0) / competitors.length),
  };

  const scores = [...competitors.map((c) => c.score), businessScore];
  const sorted = [...scores].sort((a, b) => b - a);
  const rank = sorted.indexOf(businessScore) + 1;

  const gaps: GrowthGap[] = [
    {
      label: 'Followers',
      business: businessFollowers,
      competitorAvg: average.followers,
      gap: Math.max(0, average.followers - businessFollowers),
      tip: 'Cross-post to every connected channel and feature in a "local" tag to grow followers.',
    },
    {
      label: 'Rating',
      business: businessRating,
      competitorAvg: average.rating,
      gap: Math.max(0, Math.round((average.rating - businessRating) * 10) / 10),
      tip: 'Send a friendly review request within an hour of a visit.',
    },
    {
      label: 'Posting cadence',
      business: businessPosts,
      competitorAvg: average.postsPerWeek,
      gap: Math.max(0, average.postsPerWeek - businessPosts),
      tip: `You post ${businessPosts}×/week vs ${average.postsPerWeek}× average. Schedule 3+ posts weekly.`,
    },
    {
      label: 'Engagement',
      business: analytics.score,
      competitorAvg: average.engagement,
      gap: Math.max(0, average.engagement - analytics.score),
      tip: 'Reply to every comment and use polls/stickers to invite interaction.',
    },
    {
      label: 'Overall score',
      business: businessScore,
      competitorAvg: average.score,
      gap: Math.max(0, average.score - businessScore),
      tip: 'Close your weakest growth dimension first — the Growth Score panel shows it.',
    },
  ].sort((a, b) => b.gap - a.gap);

  return {
    premium: false,
    competitors,
    businessScore,
    businessFollowers,
    businessRating,
    average,
    rank,
    gaps,
  };
}
