// NowOpen Studio — Business Growth Score (11 dimensions).
//
// Every dimension here is measured or it is null. There is no estimate layer.
//
// It used to "blend real on-device signals with deterministic seeded
// estimates" — meaning seven of the eleven had `rng() * n` added to them, and
// reach, followers, engagement, bookings and advertising had no data source at
// all behind the noise. Because the generator was seeded from the business id
// the numbers never moved, so they read as measurements that had simply
// plateaued. The weakest dimension drives the "biggest opportunity" this panel
// leads with AND the advice the site assistant gives the owner, so a business
// could be told for weeks to fix whichever number the seed happened to make
// smallest.
//
// Unmeasured dimensions now return null: they stay listed, so an owner can see
// what the platform intends to measure, but they carry no number, cannot be
// the "weakest", and are excluded from the headline average.

import { Business } from '../types';
import { computeAnalytics } from './analytics';
import { isOrderingCategory, loadClockConfig, getBusinessHealth } from './businessStatus';

export interface HealthDimension {
  key: string;
  label: string;
  emoji: string;
  /** null = nothing measures this yet. Not the same as a score of zero. */
  score: number | null;
  detail: string;
  tip: string;
  module: 'home' | 'social' | 'planner' | 'promotions' | 'loyalty' | 'campaigns' | 'analytics' | 'copywriter' | 'live-promo' | 'card';
}

export interface MarketingHealth {
  /** null when fewer than two dimensions are measured. */
  score: number | null;
  label: string;
  dimensions: HealthDimension[];
  /** Lowest MEASURED dimension, or null when nothing is measured. */
  weakest: HealthDimension | null;
  strongest: HealthDimension | null;
  /** How many of the dimensions currently have a data source. */
  measuredCount: number;
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

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  // --- Measured ------------------------------------------------------------
  const profile = clamp(profileCompleteness(business));

  // Posting cadence against the 3-a-week target. Was this plus rng() * 45,
  // so a business that had published nothing could still score 40.
  const content = clamp((analytics.publishedThisWeek / 3) * 55);

  const promotions = clamp(
    analytics.promoStats.live * 25 + analytics.promoStats.scheduled * 12 + analytics.promoStats.shared * 8,
  );

  const consistency = clamp((analytics.publishedThisWeek / 3) * 60 + (clockHealth.score ?? 0) / 4);

  // Only once there is a review to average. The old formula floored an
  // unreviewed business at 20, which is a score nobody had earned.
  const reviews = analytics.reviewStats.total > 0
    ? clamp(
        (analytics.reviewStats.avg / 5) * 60 +
        Math.min(analytics.reviewStats.responded / analytics.reviewStats.total, 1) * 40,
      )
    : null;

  // Only once somebody has joined. Was `15 + rng() * 25` for an empty scheme.
  const loyalty = analytics.loyalty.members > 0
    ? clamp(
        Math.min(analytics.loyalty.members / 50, 1) * 70 +
        Math.min(analytics.loyalty.active / 20, 1) * 30,
      )
    : null;

  // --- Not measured --------------------------------------------------------
  // No analytics layer exists, so none of these have a source. They were
  // `30 + rng() * 40`, `25 + rng() * 40`, `rating * 10 + rng() * 50` and so on:
  // a real-looking number for something the platform never observed.
  const engagement = null;
  const reach = null;
  const bookings = null;
  const followers = null;
  const advertising = null;

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

  // Average only what is measured, and report nothing below two — an
  // "average" of one number is not a growth score. The unmeasured dimensions
  // stay in `dimensions` so the panel can list them as pending.
  const measured = dimensions.filter(
    (d): d is HealthDimension & { score: number } => d.score !== null,
  );
  const score = measured.length >= 2
    ? clamp(measured.reduce((sum, d) => sum + d.score, 0) / measured.length)
    : null;

  // weakest drives the "biggest opportunity" this panel leads with and the
  // advice the assistant gives, so it may only ever be a measured dimension.
  const sorted = [...measured].sort((a, b) => a.score - b.score);

  const label = score === null
    ? 'Not enough data yet'
    : score >= 80 ? 'Growing Fast'
    : score >= 60 ? 'On Track'
    : score >= 40 ? 'Building Momentum'
    : 'Needs a Push';

  return {
    score,
    label,
    dimensions,
    weakest: sorted[0] ?? null,
    strongest: sorted[sorted.length - 1] ?? null,
    measuredCount: measured.length,
  };
}
