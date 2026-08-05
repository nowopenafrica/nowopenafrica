// NowOpen Studio — Daily Growth Brief.
//
// The "Daily Growth Dashboard" engine. Each morning it builds today's business
// snapshot: the live status, the key daily metrics (profile views, reach,
// phone clicks, WhatsApp chats, directions, bookings/orders, revenue and
// followers gained) and a single "Today's Goal" that turns the growth score
// into one actionable mission. Everything is deterministic (seeded by business
// id + date) so the numbers are stable all day and testable.

import { Business } from '../types';
import { hashString, mulberry32, pick } from './videoCreator';
import {
  dateKey,
  loadClockConfig,
  resolveBusinessStatus,
  getStatusMeta,
  getBusinessHealth,
  getOpenStreak,
  getOpeningReliability,
  BusinessStatus,
} from './businessStatus';
import { computeAnalytics } from './analytics';

export interface DailyMetric {
  key: string;
  label: string;
  value: number;
  delta: number; // % change vs yesterday (-100 = brand new)
  emoji: string;
  trend: 'up' | 'down' | 'flat';
}

export interface TodayGoal {
  key: string;
  title: string;
  detail: string;
  target: string;
  points: number;
  emoji: string;
  done: boolean;
}

export interface DailyBrief {
  date: string;
  greeting: string;
  status: BusinessStatus;
  statusLabel: string;
  statusEmoji: string;
  metrics: DailyMetric[];
  followers: number;
  score: number;
  scoreLabel: string;
  goal: TodayGoal;
  coach: string;
}

// --- Metrics ------------------------------------------------------------------

interface MetricDef {
  key: string;
  label: string;
  emoji: string;
  base: number;
  spread: number;
  categoryDependent: boolean;
}

const METRIC_DEFS: MetricDef[] = [
  { key: 'profileViews', label: 'Profile views', emoji: '👀', base: 40, spread: 260, categoryDependent: false },
  { key: 'reach', label: 'Reach', emoji: '📣', base: 200, spread: 1400, categoryDependent: false },
  { key: 'phoneClicks', label: 'Phone clicks', emoji: '📞', base: 2, spread: 26, categoryDependent: false },
  { key: 'whatsappChats', label: 'WhatsApp chats', emoji: '💬', base: 3, spread: 34, categoryDependent: false },
  { key: 'directions', label: 'Directions', emoji: '📍', base: 2, spread: 22, categoryDependent: false },
  { key: 'bookings', label: 'Bookings / orders', emoji: '🧾', base: 1, spread: 19, categoryDependent: true },
  { key: 'revenue', label: 'Est. revenue', emoji: '💰', base: 8_000, spread: 180_000, categoryDependent: true },
  { key: 'followersGained', label: 'New followers', emoji: '🧑‍🤝‍🧑', base: 1, spread: 9, categoryDependent: false },
];

export const DAILY_METRIC_KEYS = METRIC_DEFS.map((m) => m.key);

export function dailyFollowers(business: Business, _now: Date): number {
  const rng = mulberry32(hashString(`${business.id}:followers`));
  const score = computeAnalytics(business).score;
  return Math.round(40 + rng() * 380 + score * 4);
}

export function dailyMetrics(business: Business, now: Date): DailyMetric[] {
  const score = computeAnalytics(business).score;
  const boost = 0.75 + score / 100; // growth score scales every metric
  const todaySeed = mulberry32(hashString(`${business.id}:${dateKey(now)}:brief`));
  const yesterdaySeed = mulberry32(hashString(`${business.id}:${dateKey(now)}:brief:yesterday`));

  const valueFor = (def: MetricDef, rng: () => number): number => {
    const raw = def.base + rng() * def.spread;
    const scaled = Math.round(raw * boost);
    if (def.key === 'revenue') return Math.round(scaled / 100) * 100;
    return scaled;
  };

  return METRIC_DEFS.map((def) => {
    const today = valueFor(def, todaySeed);
    const yesterday = Math.max(1, valueFor(def, yesterdaySeed));
    const delta = Math.round(((today - yesterday) / yesterday) * 100);
    const trend: DailyMetric['trend'] = delta > 3 ? 'up' : delta < -3 ? 'down' : 'flat';
    return { key: def.key, label: def.label, value: today, delta, emoji: def.emoji, trend };
  });
}

// --- Today's goal -------------------------------------------------------------

export interface GoalDef {
  key: string;
  title: string;
  emoji: string;
  points: number;
}

const GOALS: GoalDef[] = [
  { key: 'post', title: 'Post once today', emoji: '📸', points: 50 },
  { key: 'promo', title: 'Share a weekend offer', emoji: '🏷️', points: 60 },
  { key: 'review', title: 'Ask 3 customers for a review', emoji: '⭐', points: 70 },
  { key: 'live', title: 'Go LIVE for 15 minutes', emoji: '🔴', points: 80 },
  { key: 'reply', title: 'Reply to every review', emoji: '💌', points: 40 },
  { key: 'update', title: 'Update your menu or products', emoji: '📦', points: 40 },
  { key: 'connect', title: 'Connect one more channel', emoji: '🔗', points: 60 },
  { key: 'open', title: 'Open for the day', emoji: '🟢', points: 30 },
];

export interface GoalRecord {
  date: string;
  key: string;
  done: boolean;
}

export function goalStorageKey(businessId: string): string {
  return `nowopen_dailyGoal_${businessId}`;
}

export function loadGoalRecord(businessId: string): GoalRecord | null {
  try {
    const raw = localStorage.getItem(goalStorageKey(businessId));
    return raw ? (JSON.parse(raw) as GoalRecord) : null;
  } catch {
    return null;
  }
}

export function saveGoalRecord(businessId: string, record: GoalRecord): void {
  try { localStorage.setItem(goalStorageKey(businessId), JSON.stringify(record)); } catch { /* ignore */ }
}

export function completeTodayGoal(businessId: string, now: Date): GoalRecord {
  const record: GoalRecord = { date: dateKey(now), key: loadGoalRecord(businessId)?.key || 'post', done: true };
  saveGoalRecord(businessId, record);
  return record;
}

// --- Brief ---------------------------------------------------------------------

export function todayGoalFor(business: Business, now: Date): TodayGoal {
  const status = resolveBusinessStatus(business, loadClockConfig(business), now);
  const rng = mulberry32(hashString(`${business.id}:${dateKey(now)}:goal`));

  const pool = [...GOALS];
  if (status === 'closed') {
    // Closed businesses get the opening mission first so the dashboard drives
    // the Business Clock integration.
    const record = loadGoalRecord(business.id);
    const openGoal = pool.splice(pool.findIndex((g) => g.key === 'open'), 1)[0];
    if (!record || record.date !== dateKey(now) || !record.done) {
      return { ...openGoal, detail: 'Turn your Business Clock on — businesses open daily get 3.8× more views.', target: 'Status: Open', done: false };
    }
  }

  const def = pick(rng, pool);
  const details: Record<string, string> = {
    post: 'One on-brand post today compounds into followers and reach.',
    promo: 'Deadline-driven offers are the fastest way to pull customers in.',
    review: 'New visitors judge you on reviews — happy customers are your best ads.',
    live: 'Live sessions spike reach and put a face to your business.',
    reply: 'Public replies win customers back and lift your rating.',
    update: 'Fresh products and menus keep your profile from going stale.',
    connect: 'Post once, publish everywhere — each channel adds reach.',
    open: 'Businesses that open daily earn far more profile views.',
  };
  return { ...def, detail: details[def.key], target: `+${def.points} growth points`, done: false };
}

export function buildDailyBrief(business: Business, now: Date): DailyBrief {
  const status = resolveBusinessStatus(business, loadClockConfig(business), now);
  const statusMeta = getStatusMeta(status, business.category);
  const analytics = computeAnalytics(business);
  const health = getBusinessHealth(business, loadClockConfig(business));
  const goal = todayGoalFor(business, now);
  const record = loadGoalRecord(business.id);

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const streak = getOpenStreak(business, loadClockConfig(business));
  const coach = status === 'closed'
    ? `You are still closed for today. Opening now keeps your ${streak}-day open streak alive and starts your metrics climbing.`
    : goal.key === 'live'
      ? 'Going live is the single highest-reach action you can take today — your followers get notified the moment you start.'
      : `Your health score is ${health.score}/100 with ${getOpeningReliability(business, loadClockConfig(business))}% opening reliability. Complete today's goal to keep climbing.`;

  return {
    date: dateKey(now),
    greeting,
    status,
    statusLabel: statusMeta.label,
    statusEmoji: statusMeta.emoji,
    metrics: dailyMetrics(business, now),
    followers: dailyFollowers(business, now),
    score: analytics.score,
    scoreLabel: analytics.scoreLabel,
    goal: record && record.date === dateKey(now) && record.done ? { ...goal, done: true } : goal,
    coach,
  };
}
