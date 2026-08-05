import { describe, it, expect, beforeEach } from 'vitest';
import { Business } from '../types';
import { marketingScore, analyticsScoreLabel, weeklyActivity, channelBreakdown, insightsFor, computeAnalytics, AnalyticsSnapshot } from './analytics';
import { savePlannerItems } from './planner';
import { savePromos } from './promotions';
import { saveReviews, makeReview } from './reviews';
import { saveCustomers, saveTxns, addCustomer } from './loyalty';

const biz = { id: '1', name: 'Meat Club', phone: '+234 800 123 4567' } as unknown as Business;

const NOW = new Date('2026-08-05T12:00:00'); // a Wednesday — safely mid-week

function weekAgo(days: number, from: Date = NOW): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const emptySnapshot = (over: Partial<AnalyticsSnapshot> = {}): AnalyticsSnapshot => ({
  score: 0,
  scoreItems: [],
  scoreLabel: 'Needs a Push',
  publishedThisWeek: 0,
  postsByPlatform: [],
  weeklyActivity: [],
  promoStats: { live: 0, scheduled: 0, ended: 0, shared: 0, total: 0 },
  reviewStats: { total: 0, avg: 0, positive: 0, neutral: 0, negative: 0, responded: 0 },
  loyalty: { members: 0, active: 0, visits: 0, redemptions: 0 },
  campaigns: { total: 0, latest: null },
  insights: [],
  ...over,
});

beforeEach(() => localStorage.clear());

describe('analytics — marketing score', () => {
  it('starts at zero with no activity', () => {
    const { score, items } = marketingScore({ publishedThisWeek: 0, livePromos: 0, scheduledPromos: 0, sharedPromos: 0, avgRating: 0, totalReviews: 0, responded: 0, members: 0 });
    expect(score).toBe(0);
    expect(items.reduce((s, i) => s + i.max, 0)).toBe(100);
  });

  it('rewards full content cadence', () => {
    const { score, items } = marketingScore({ publishedThisWeek: 3, livePromos: 0, scheduledPromos: 0, sharedPromos: 0, avgRating: 0, totalReviews: 0, responded: 0, members: 0 });
    expect(items[0].earned).toBe(30);
    expect(score).toBe(30);
  });

  it('caps promotion activity', () => {
    const { items } = marketingScore({ publishedThisWeek: 0, livePromos: 2, scheduledPromos: 0, sharedPromos: 0, avgRating: 0, totalReviews: 0, responded: 0, members: 0 });
    expect(items[1].earned).toBe(25);
  });

  it('rewards reviews plus responses', () => {
    const { score, items } = marketingScore({ publishedThisWeek: 0, livePromos: 0, scheduledPromos: 0, sharedPromos: 0, avgRating: 5, totalReviews: 4, responded: 4, members: 0 });
    expect(items[2].earned).toBe(25);
    expect(score).toBe(25);
  });

  it('labels the score bands', () => {
    expect(analyticsScoreLabel(85)).toBe('Growing Fast');
    expect(analyticsScoreLabel(60)).toBe('On Track');
    expect(analyticsScoreLabel(45)).toBe('Building Momentum');
    expect(analyticsScoreLabel(10)).toBe('Needs a Push');
  });
});

describe('analytics — trends', () => {
  it('buckets published posts by week', () => {
    const planner = [
      { id: 'a', date: weekAgo(0), title: 'x', platform: 'Instagram', status: 'published' as const },
      { id: 'b', date: weekAgo(0), title: 'y', platform: 'Facebook', status: 'published' as const },
      { id: 'c', date: weekAgo(7), title: 'z', platform: 'Instagram', status: 'published' as const },
      { id: 'd', date: weekAgo(0), title: 'p', platform: 'Instagram', status: 'planned' as const },
    ];
    const weeks = weeklyActivity(planner, [], NOW);
    expect(weeks.length).toBe(8);
    expect(weeks[weeks.length - 1].posts).toBe(2);
    expect(weeks[weeks.length - 2].posts).toBe(1);
  });

  it('counts promo starts by week', () => {
    const promos = [
      { id: 'p1', title: 'Sale', offer: '20% off', template: 'discount', startsAt: weekAgo(0), endsAt: weekAgo(6), channels: ['social'], created_at: weekAgo(0) },
    ] as Parameters<typeof weeklyActivity>[1];
    const weeks = weeklyActivity([], promos, NOW);
    expect(weeks[weeks.length - 1].promos).toBe(1);
  });

  it('groups planner items by platform', () => {
    const planner = [
      { id: 'a', date: '2026-08-01', title: 'x', platform: 'Instagram', status: 'published' as const },
      { id: 'b', date: '2026-08-02', title: 'y', platform: 'Instagram', status: 'published' as const },
      { id: 'c', date: '2026-08-03', title: 'z', platform: 'Facebook', status: 'planned' as const },
    ];
    const channels = channelBreakdown(planner);
    expect(channels[0]).toEqual({ platform: 'Instagram', published: 2, planned: 0 });
    expect(channels[1]).toEqual({ platform: 'Facebook', published: 0, planned: 1 });
  });
});

describe('analytics — insights', () => {
  it('points at gaps and celebrates wins', () => {
    const snap = emptySnapshot({
      publishedThisWeek: 1,
      promoStats: { live: 0, scheduled: 0, ended: 0, shared: 0, total: 0 },
      reviewStats: { total: 5, avg: 4.6, positive: 4, neutral: 1, negative: 0, responded: 5 },
      loyalty: { members: 3, active: 1, visits: 4, redemptions: 1 },
      campaigns: { total: 0, latest: null },
    });
    const insights = insightsFor(snap);
    expect(insights.some((i) => i.module === 'planner')).toBe(true);
    expect(insights.some((i) => i.module === 'live-promo')).toBe(true);
    expect(insights.some((i) => i.module === 'social' && i.tone === 'good')).toBe(true);
    expect(insights.some((i) => i.module === 'campaigns')).toBe(true);
  });

  it('always returns between three and four insights', () => {
    expect(insightsFor(emptySnapshot()).length).toBeGreaterThanOrEqual(3);
    expect(insightsFor(emptySnapshot()).length).toBeLessThanOrEqual(4);
  });
});

describe('analytics — full snapshot', () => {
  it('reads every Studio data source', () => {
    savePlannerItems(biz.id, [{ id: 'a', date: weekAgo(0), title: 'post', platform: 'Instagram', status: 'published' }]);
    savePromos(biz.id, [{ id: 'p1', title: 'Sale', offer: '20% off', template: 'discount', startsAt: weekAgo(0), endsAt: weekAgo(6), channels: ['social'], created_at: weekAgo(0) }]);
    saveReviews(biz.id, [makeReview({ author: 'Ada', rating: 5, text: 'Amazing place, loved it!', replied: true })]);
    const { customer, txn } = addCustomer('Ada', '080 1234 5678', { id: 'prog', name: 'Rewards', spendPerPoint: 100, pointValue: 2, welcomePoints: 50, stampsForReward: 0, active: true, created_at: '' });
    saveCustomers(biz.id, [customer]);
    if (txn) saveTxns(biz.id, [txn]);
    localStorage.setItem('nowopen_campaigns_1', JSON.stringify([{ id: 'd1', title: 'Grand opening', goal: 'launch', email: 'hi', sms: 'yo', createdAt: new Date().toISOString() }]));

    const snap = computeAnalytics(biz, NOW);
    expect(snap.publishedThisWeek).toBe(1);
    expect(snap.promoStats.total).toBe(1);
    expect(snap.reviewStats.total).toBe(1);
    expect(snap.reviewStats.positive).toBe(1);
    expect(snap.loyalty.members).toBe(1);
    expect(snap.loyalty.visits).toBe(0);
    expect(snap.campaigns.total).toBe(1);
    expect(snap.score).toBeGreaterThan(0);
    expect(snap.scoreItems.length).toBe(4);
    expect(snap.insights.length).toBeGreaterThanOrEqual(3);
  });

  it('handles a completely fresh business', () => {
    const snap = computeAnalytics(biz, NOW);
    expect(snap.score).toBe(0);
    expect(snap.postsByPlatform).toEqual([]);
    expect(snap.promoStats.total).toBe(0);
    expect(snap.campaigns.total).toBe(0);
  });
});
