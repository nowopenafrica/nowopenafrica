// NowOpen Studio — Business Growth Score (11 dimensions).
//
// A fuller, 11-part growth score than the classic marketing health score: it
// blends real on-device signals (profile fields, planner output, promos,
// reviews, loyalty) with deterministic seeded estimates (reach, engagement,
// followers, ads) so every dimension returns 0–100. The weakest dimension
// becomes the "biggest opportunity" the Growth Score panel leads with.

import { Business } from '../types';
import { hashString, mulberry32 } from './videoCreator';
import { computeAnalytics } from './analytics';
import { isOrderingCategory, loadClockConfig, getBusinessHealth } from './businessStatus';

export interface HealthDimension {
  key: string;
  label: string;
  emoji: string;
  score: number;
  detail: string;
  tip: string;
  module: 'home' | 'social' | 'planner' | 'promotions' | 'loyalty' | 'campaigns' | 'analytics' | 'copywriter' | 'live-promo' | 'card';
}

export interface MarketingHealth {
  score: number;
  label: string;
  dimensions: HealthDimension[];
  weakest: HealthDimension;
  strongest: HealthDimension;
}

export const GROWTH_DIMENSIONS = [
  'Profile', 'Content', 'Engagement', 'Promotions', 'Reach', 'Consistency', 'Reviews', 'Bookings', 'Followers', 'Advertising', 'Loyalty',
] as const;

function profileCompleteness(business: Business): number {
  const checks = [
    Boolean(business.name),
    Boolean(business.description && business.description.length > 20),
    Boolean(business.image_url || business.logo_url),
    Boolean(business.phone),
    Boolean(business.location),
    Boolean(business.website),
    Boolean(business.category),
    Boolean(business.rating),
    Boolean(business.status),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function marketingHealth(business: Business, _now = new Date()): MarketingHealth {
  const analytics = computeAnalytics(business);
  const clockHealth = getBusinessHealth(business, loadClockConfig(business));
  const rng = mulberry32(hashString(`${business.id}:growth11`));

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  const profile = clamp(profileCompleteness(business));
  const content = clamp((analytics.publishedThisWeek / 3) * 55 + rng() * 45);
  const engagement = clamp((business.rating || 3.5) * 10 + rng() * 50);
  const promotions = clamp((analytics.promoStats.live * 25 + analytics.promoStats.scheduled * 12 + analytics.promoStats.shared * 8) + rng() * 40);
  const reach = clamp(30 + rng() * 40 + analytics.score / 4);
  const consistency = clamp((analytics.publishedThisWeek / 3) * 60 + clockHealth.score / 4);
  const reviews = clamp(
    (analytics.reviewStats.avg > 0 ? (analytics.reviewStats.avg / 5) * 60 : 20) +
    (analytics.reviewStats.total > 0 ? Math.min(analytics.reviewStats.responded / analytics.reviewStats.total, 1) * 40 : 0),
  );
  const bookings = clamp((isOrderingCategory(business.category) ? 35 : 20) + rng() * 45 + (business.rating || 3.5) * 5);
  const followers = clamp(25 + rng() * 40 + analytics.score / 5);
  const advertising = clamp(20 + rng() * 50 + analytics.promoStats.total * 5);
  const loyalty = clamp(
    analytics.loyalty.members > 0
      ? Math.min(analytics.loyalty.members / 50, 1) * 70 + Math.min(analytics.loyalty.active / 20, 1) * 30
      : 15 + rng() * 25,
  );

  const dimensions: HealthDimension[] = [
    { key: 'profile', label: 'Profile & card', emoji: '🪪', score: profile, detail: 'How complete your NowOpen profile and business card are.', tip: 'Fill every field — add photos, hours, website and services.', module: 'card' },
    { key: 'content', label: 'Content', emoji: '🎨', score: content, detail: 'Posts created and variety across your feed.', tip: `Aim for 3+ posts a week. ${analytics.publishedThisWeek < 3 ? 'You are below the cadence that drives growth.' : 'Great cadence — keep it up.'}`, module: 'social' },
    { key: 'engagement', label: 'Engagement', emoji: '💬', score: engagement, detail: 'How people react, reply and share your content.', tip: 'Reply to every comment and DM within the hour.', module: 'social' },
    { key: 'promotions', label: 'Promotions', emoji: '🏷️', score: promotions, detail: 'Offers live, scheduled and shared.', tip: analytics.promoStats.live === 0 ? 'No offer is live — launch a weekend promo now.' : 'A promotion is live — keep the momentum.', module: 'promotions' },
    { key: 'reach', label: 'Reach', emoji: '📣', score: reach, detail: 'Estimated people who see your business each week.', tip: 'Reels and live sessions are the fastest way to grow reach.', module: 'analytics' },
    { key: 'consistency', label: 'Consistency', emoji: '📅', score: consistency, detail: 'Posting and opening reliably, week after week.', tip: 'Schedule posts ahead so consistency never depends on a busy day.', module: 'planner' },
    { key: 'reviews', label: 'Reviews', emoji: '⭐', score: reviews, detail: `Average rating and reply rate (${analytics.reviewStats.responded}/${analytics.reviewStats.total || 0} replied).`, tip: analytics.reviewStats.total > 0 && analytics.reviewStats.responded < analytics.reviewStats.total ? 'Reply to unanswered reviews — it lifts your rating.' : 'Ask happy customers for reviews right after their visit.', module: 'home' },
    { key: 'bookings', label: 'Bookings & orders', emoji: '🧾', score: bookings, detail: 'Orders, bookings and enquiries your profile generates.', tip: isOrderingCategory(business.category) ? 'Add a clear "Order / Book" button and reply fast on WhatsApp.' : 'Make booking effortless — one tap from your profile to a booking.', module: 'card' },
    { key: 'followers', label: 'Followers', emoji: '🧑‍🤝‍🧑', score: followers, detail: 'Estimated audience following your business.', tip: 'Cross-post to every connected channel to grow followers faster.', module: 'social' },
    { key: 'advertising', label: 'Advertising', emoji: '📢', score: advertising, detail: 'Promoted posts and paid campaigns reach new people.', tip: 'Boost your best-performing post with a small budget.', module: 'campaigns' },
    { key: 'loyalty', label: 'Loyalty', emoji: '💛', score: loyalty, detail: `${analytics.loyalty.members} members · ${analytics.loyalty.visits} visits · ${analytics.loyalty.redemptions} redemptions.`, tip: analytics.loyalty.members < 20 ? 'Sign up regulars to your loyalty programme — repeat customers spend more.' : 'Reward your most loyal members to keep them coming back.', module: 'loyalty' },
  ];

  const score = clamp(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length);
  const sorted = [...dimensions].sort((a, b) => a.score - b.score);
  const label = score >= 80 ? 'Growing Fast' : score >= 60 ? 'On Track' : score >= 40 ? 'Building Momentum' : 'Needs a Push';

  return {
    score,
    label,
    dimensions,
    weakest: sorted[0],
    strongest: sorted[sorted.length - 1],
  };
}
