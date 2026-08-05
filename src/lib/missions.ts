// NowOpen Studio — Today's Mission & Growth Points.
//
// A daily gamified mission: each day the Studio picks one mission (seeded by
// business + date), worth a set number of growth points. Completing it earns
// points that unlock levels (Newbie → Marketing Mogul). Points and completed
// missions persist per business so the dashboard can show progress at a glance.

import { Business } from '../types';
import { hashString, mulberry32, pick } from './videoCreator';
import { dateKey } from './businessStatus';

export interface Mission {
  key: string;
  title: string;
  detail: string;
  emoji: string;
  points: number;
}

export interface CompletedMission extends Mission {
  date: string;
}

export interface MissionsState {
  points: number;
  completed: CompletedMission[];
}

const MISSION_POOL: Mission[] = [
  { key: 'post', title: 'Post today', detail: 'Publish one on-brand post on any channel.', emoji: '📸', points: 50 },
  { key: 'live', title: 'Go LIVE', detail: 'Stream for 15 minutes — your followers get notified.', emoji: '🔴', points: 80 },
  { key: 'reply', title: 'Reply to reviews', detail: 'Answer every unanswered customer review.', emoji: '💌', points: 40 },
  { key: 'promo', title: 'Share an offer', detail: 'Launch or share a promotion with a deadline.', emoji: '🏷️', points: 60 },
  { key: 'update', title: 'Update products', detail: 'Add or refresh a product or menu item.', emoji: '📦', points: 40 },
  { key: 'reviews', title: 'Ask for reviews', detail: 'Request reviews from 3 happy customers.', emoji: '⭐', points: 70 },
  { key: 'connect', title: 'Connect a channel', detail: 'Link one more social or messaging channel.', emoji: '🔗', points: 60 },
  { key: 'plan', title: 'Plan the week', detail: 'Schedule at least 3 posts in the planner.', emoji: '📅', points: 55 },
];

export const MISSIONS_LEVELS = [
  { at: 0, label: 'Newbie', emoji: '🌱' },
  { at: 100, label: 'Local Star', emoji: '⭐' },
  { at: 250, label: 'Community Favourite', emoji: '🌟' },
  { at: 500, label: 'Growth Mover', emoji: '🚀' },
  { at: 1000, label: 'Marketing Mogul', emoji: '👑' },
] as const;

export function missionsKey(businessId: string): string {
  return `nowopen_missions_${businessId}`;
}

export function loadMissions(businessId: string): MissionsState {
  try {
    const raw = localStorage.getItem(missionsKey(businessId));
    const parsed = raw ? (JSON.parse(raw) as Partial<MissionsState>) : {};
    return { points: typeof parsed.points === 'number' ? parsed.points : 0, completed: Array.isArray(parsed.completed) ? parsed.completed : [] };
  } catch {
    return { points: 0, completed: [] };
  }
}

export function saveMissions(businessId: string, state: MissionsState): void {
  try { localStorage.setItem(missionsKey(businessId), JSON.stringify(state)); } catch { /* ignore */ }
}

function missionFor(businessId: string, now: Date): Mission {
  const state = loadMissions(businessId);
  const today = dateKey(now);
  const already = state.completed.find((m) => m.date === today);
  if (already) return { key: already.key, title: already.title, detail: already.detail, emoji: already.emoji, points: already.points };

  // Avoid repeating a mission two days running when possible.
  const rng = mulberry32(hashString(`${businessId}:${today}:mission`));
  const yesterday = state.completed[state.completed.length - 1];
  const pool = yesterday ? MISSION_POOL.filter((m) => m.key !== yesterday.key) : MISSION_POOL;
  const chosen = pick(rng, pool.length > 0 ? pool : MISSION_POOL);
  return chosen;
}

export function todayMission(business: Business, now = new Date()): Mission {
  return missionFor(business.id, now);
}

export function completeMission(businessId: string, now = new Date()): { mission: Mission; state: MissionsState; pointsAdded: number } {
  const today = dateKey(now);
  const state = loadMissions(businessId);
  const already = state.completed.find((m) => m.date === today);
  if (already) return { mission: already, state, pointsAdded: 0 };

  const mission = missionFor(businessId, now);
  const next: MissionsState = {
    points: state.points + mission.points,
    completed: [...state.completed, { ...mission, date: today }],
  };
  saveMissions(businessId, next);
  return { mission, state: next, pointsAdded: mission.points };
}

export function levelFor(points: number): (typeof MISSIONS_LEVELS)[number] {
  let level = MISSIONS_LEVELS[0];
  for (const l of MISSIONS_LEVELS) {
    if (points >= l.at) level = l;
  }
  return level;
}

export function progressToNextLevel(points: number): { current: (typeof MISSIONS_LEVELS)[number]; next: (typeof MISSIONS_LEVELS)[number] | null; pointsNeeded: number; pct: number } {
  const level = levelFor(points);
  const idx = MISSIONS_LEVELS.indexOf(level);
  const next = MISSIONS_LEVELS[idx + 1] || null;
  const pointsNeeded = next ? next.at - points : 0;
  const pct = next ? Math.min(100, Math.round((points - level.at) / (next.at - level.at) * 100)) : 100;
  return { current: level, next, pointsNeeded, pct };
}

export function isMissionComplete(businessId: string, now = new Date()): boolean {
  return loadMissions(businessId).completed.some((m) => m.date === dateKey(now));
}
