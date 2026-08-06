// NowOpen Studio — Campaign Analytics.
//
// A marketing health dashboard computed from the Studio's on-device data
// (content planner, promos, reviews, loyalty and campaign drafts). It turns
// scattered activity into a single Marketing Health Score, weekly activity
// trend, channel breakdown and rule-based next steps that link straight into
// the Studio modules that fix them.

import { Business } from '../types';
import { GrowthPlanModule, weekKeyFor } from './growth';
import { loadPlannerItems, PlanItem } from './planner';
import { loadPromos, promoCounts } from './promotions';
import { loadReviews, reviewStats } from './reviews';
import { loadCustomers, loadTxns, loyaltyStats } from './loyalty';

export interface ScoreItem {
  label: string;
  earned: number;
  max: number;
}

export interface ScoreInputs {
  publishedThisWeek: number;
  livePromos: number;
  scheduledPromos: number;
  sharedPromos: number;
  avgRating: number;
  totalReviews: number;
  responded: number;
  members: number;
}

export interface ChannelStat {
  platform: string;
  published: number;
  planned: number;
}

export interface WeekStat {
  week: string;
  label: string;
  posts: number;
  promos: number;
}

export interface Insight {
  tip: string;
  module: GrowthPlanModule;
  tone: 'good' | 'warn' | 'info';
}

export interface AnalyticsSnapshot {
  score: number;
  scoreItems: ScoreItem[];
  scoreLabel: string;
  publishedThisWeek: number;
  postsByPlatform: ChannelStat[];
  weeklyActivity: WeekStat[];
  promoStats: { live: number; scheduled: number; ended: number; shared: number; total: number };
  reviewStats: { total: number; avg: number; positive: number; neutral: number; negative: number; responded: number };
  loyalty: { members: number; active: number; visits: number; redemptions: number };
  campaigns: { total: number; latest: string | null };
  insights: Insight[];
}

// --- Marketing Health Score (pure) -----------------------------------------

export function marketingScore(s: ScoreInputs): { score: number; items: ScoreItem[] } {
  const items: ScoreItem[] = [];
  const add = (label: string, earned: number, max: number) =>
    items.push({ label, earned: Math.max(0, Math.min(max, Math.round(earned))), max });

  add('Content cadence', Math.min(s.publishedThisWeek / 3, 1) * 30, 30);
  add('Promotion activity', Math.min((s.livePromos * 2 + s.scheduledPromos + s.sharedPromos) / 4, 1) * 25, 25);
  add('Reviews & reputation', (s.avgRating > 0 ? (s.avgRating / 5) * 15 : 0) + (s.totalReviews > 0 ? Math.min(s.responded / s.totalReviews, 1) * 10 : 0), 25);
  add('Loyalty audience', Math.min(s.members / 20, 1) * 20, 20);

  const score = Math.max(0, Math.min(100, items.reduce((sum, i) => sum + i.earned, 0)));
  return { score, items };
}

export function analyticsScoreLabel(score: number): string {
  if (score >= 80) return 'Growing Fast';
  if (score >= 60) return 'On Track';
  if (score >= 40) return 'Building Momentum';
  return 'Needs a Push';
}

// --- Trend helpers ----------------------------------------------------------

function lastWeeks(n: number, now = new Date()): Date[] {
  const weeks: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    weeks.push(d);
  }
  return weeks;
}

function weekLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function weeklyActivity(planner: PlanItem[], promos: ReturnType<typeof loadPromos>, now = new Date()): WeekStat[] {
  const weeks = lastWeeks(8, now);
  const keys = weeks.map((d) => weekKeyFor(d));
  return weeks.map((d, i) => {
    const key = keys[i];
    const posts = planner.filter((p) => p.status === 'published' && weekKeyFor(new Date(`${p.date}T00:00:00`)) === key).length;
    const promosCount = promos.filter((p) => weekKeyFor(new Date(`${p.startsAt}T00:00:00`)) === key).length;
    return { week: key, label: weekLabel(d), posts, promos: promosCount };
  });
}

export function channelBreakdown(planner: PlanItem[]): ChannelStat[] {
  const map = new Map<string, { published: number; planned: number }>();
  for (const p of planner) {
    const entry = map.get(p.platform) || { published: 0, planned: 0 };
    if (p.status === 'published') entry.published++;
    else entry.planned++;
    map.set(p.platform, entry);
  }
  return Array.from(map.entries())
    .map(([platform, v]) => ({ platform, published: v.published, planned: v.planned }))
    .sort((a, b) => b.published - a.published || b.planned - a.planned);
}

// --- Insights (rule-based next steps) --------------------------------------

export function insightsFor(s: AnalyticsSnapshot): Insight[] {
  const out: Insight[] = [];

  if (s.publishedThisWeek < 3)
    out.push({ tip: 'You are posting less than the 3×-a-week cadence that drives most profile visits. Plan the next 7 days now.', module: 'planner', tone: 'warn' });
  if (s.promoStats.live === 0 && s.promoStats.scheduled === 0)
    out.push({ tip: 'No promotion is live or scheduled. A weekend offer is the fastest way to pull customers in.', module: 'live-promo', tone: 'warn' });
  if (s.reviewStats.total > 0 && s.reviewStats.avg >= 4 && s.reviewStats.positive >= s.reviewStats.total * 0.6)
    out.push({ tip: 'Your reviews are glowing — turn them into posts and a “rated by your customers” badge on your card.', module: 'social', tone: 'good' });
  if (s.campaigns.total === 0)
    out.push({ tip: 'You have not saved an email or SMS campaign yet. Draft one in minutes from your profile.', module: 'campaigns', tone: 'info' });
  if (s.reviewStats.total < 3)
    out.push({ tip: 'Fewer than 3 reviews means new visitors have little to judge you on. Ask your happiest customers.', module: 'home', tone: 'warn' });
  if (s.reviewStats.negative > 0)
    out.push({ tip: `${s.reviewStats.negative} negative review${s.reviewStats.negative === 1 ? '' : 's'} need a reply. Responding publicly shows you care and wins customers back.`, module: 'home', tone: 'warn' });
  if (s.loyalty.members < 5)
    out.push({ tip: 'A small loyalty base means repeat visits are leaving value on the table. Launch your programme and sign up regulars.', module: 'loyalty', tone: 'info' });
  if (s.campaigns.latest && Date.now() - new Date(s.campaigns.latest).getTime() > 30 * 86400000)
    out.push({ tip: 'Your last campaign draft is over a month old — refresh it with a new offer before it goes stale.', module: 'campaigns', tone: 'info' });
  if (out.length < 3)
    out.push({ tip: 'Keep the momentum: one post, one promo and one review request every week compounds fast.', module: 'home', tone: 'good' });

  return out.slice(0, 4);
}

// --- Full snapshot ----------------------------------------------------------

export function computeAnalytics(business: Business, now = new Date()): AnalyticsSnapshot {
  const planner = loadPlannerItems(business.id);
  const promos = loadPromos(business.id);
  const reviews = loadReviews(business.id);
  const customers = loadCustomers(business.id);
  const txns = loadTxns(business.id);

  const pCounts = promoCounts(promos, now);
  const rStats = reviewStats(reviews);
  const lStats = loyaltyStats(customers, txns, now);

  const publishedThisWeek = planner.filter((i) => {
    const d = new Date(`${i.date}T00:00:00`);
    return i.status === 'published' && weekKeyFor(d) === weekKeyFor(now);
  }).length;

  let latest: string | null = null;
  let draftCount = 0;
  try {
    const raw = localStorage.getItem(`nowopen_campaigns_${business.id}`);
    const drafts = raw ? (JSON.parse(raw) as { createdAt: string }[]) : [];
    if (Array.isArray(drafts)) {
      draftCount = drafts.length;
      if (draftCount) latest = drafts[0].createdAt;
    }
  } catch { /* ignore */ }

  const base = {
    publishedThisWeek,
    livePromos: pCounts.live,
    scheduledPromos: pCounts.scheduled,
    sharedPromos: pCounts.shared,
    avgRating: rStats.avg,
    totalReviews: rStats.total,
    responded: rStats.responded,
    members: lStats.members,
  };
  const { score, items } = marketingScore(base);

  const snapshot: AnalyticsSnapshot = {
    score,
    scoreItems: items,
    scoreLabel: analyticsScoreLabel(score),
    publishedThisWeek,
    postsByPlatform: channelBreakdown(planner),
    weeklyActivity: weeklyActivity(planner, promos, now),
    promoStats: pCounts,
    reviewStats: rStats,
    loyalty: lStats,
    campaigns: { total: draftCount, latest },
    insights: [],
  };

  snapshot.insights = insightsFor(snapshot);
  return snapshot;
}
