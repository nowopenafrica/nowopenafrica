// NowOpen Studio — Growth Challenges.
//
// Gamified sprints that turn the Growth Center's advice into something to
// actually finish. Each challenge breaks down into checkable tasks computed
// from the business profile plus live counters (planner, promos, reviews,
// weekly plan), and rewards points you can claim.

import { Business } from '../types';
import { GrowthPlanModule } from './growth';

export interface Challenge {
  id: string;
  title: string;
  desc: string;
  points: number;
  module: GrowthPlanModule;
}

export interface ChallengeTask {
  id: string;
  label: string;
  done: boolean;
}

export interface ChallengeStats {
  business: Business;
  planDone: number;
  planTotal: number;
  plannerPublished: number;
  promosTotal: number;
  livePromos: number;
  promosShared: number;
  reviewsCount: number;
  respondedCount: number;
}

export const CHALLENGES: Challenge[] = [
  { id: 'profile-perfect', title: 'Profile Perfection', desc: 'Complete the six essentials that make a profile trustworthy.', points: 100, module: 'home' },
  { id: 'content-sprint', title: 'Social Sprint', desc: 'Publish three posts this week from your Content Planner.', points: 150, module: 'planner' },
  { id: 'promo-launch', title: 'Promo Pro', desc: 'Create, launch and share a live promotion.', points: 200, module: 'promotions' },
  { id: 'plan-pilot', title: 'Plan Pilot', desc: 'Tackle your weekly growth plan and finish every task.', points: 100, module: 'home' },
];

const has = (v: unknown) => !!(v && String(v).trim());

export function tasksFor(c: Challenge, s: ChallengeStats): ChallengeTask[] {
  const b = s.business;
  switch (c.id) {
    case 'profile-perfect':
      return [
        { id: 'logo', label: 'Add your logo', done: has(b.logo_url) },
        { id: 'cover', label: 'Add a cover photo', done: has(b.image_url) },
        { id: 'desc', label: 'Write a full description (60+ characters)', done: String(b.description || '').trim().length >= 60 },
        { id: 'phone', label: 'Add a phone number', done: has(b.phone) },
        { id: 'hours', label: 'Set opening hours', done: has(b.hours) },
        { id: 'link', label: 'Claim your brand link', done: has(b.username) },
      ];
    case 'content-sprint':
      return [
        { id: 'p1', label: 'Publish post 1 this week', done: s.plannerPublished >= 1 },
        { id: 'p2', label: 'Publish post 2 this week', done: s.plannerPublished >= 2 },
        { id: 'p3', label: 'Publish post 3 this week', done: s.plannerPublished >= 3 },
      ];
    case 'promo-launch':
      return [
        { id: 'c1', label: 'Create a promotion', done: s.promosTotal >= 1 },
        { id: 'c2', label: 'Take a promotion live', done: s.livePromos >= 1 },
        { id: 'c3', label: 'Share it on WhatsApp', done: s.promosShared >= 1 },
      ];
    case 'review-boost':
      return [
        { id: 'r1', label: 'Collect your first review', done: s.reviewsCount >= 1 },
        { id: 'r2', label: 'Collect three reviews', done: s.reviewsCount >= 3 },
        { id: 'r3', label: 'Respond to a review', done: s.respondedCount >= 1 },
      ];
    case 'plan-pilot': {
      const frac = s.planTotal ? s.planDone / s.planTotal : 0;
      return [
        { id: 'q1', label: 'Complete a third of the weekly plan', done: frac >= 0.34 },
        { id: 'q2', label: 'Complete two thirds of the weekly plan', done: frac >= 0.67 },
        { id: 'q3', label: 'Complete the whole weekly plan', done: frac >= 1 },
      ];
    }
    default:
      return [];
  }
}

export function challengeProgress(tasks: ChallengeTask[]): { done: number; total: number } {
  return { done: tasks.filter((t) => t.done).length, total: tasks.length };
}

// Claimed points, persisted per business.
export function challengesKey(businessId: string): string {
  return `nowopen_challenges_${businessId}`;
}

export function loadClaimed(businessId: string): string[] {
  try {
    const raw = localStorage.getItem(challengesKey(businessId));
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveClaimed(businessId: string, claimed: string[]): void {
  try { localStorage.setItem(challengesKey(businessId), JSON.stringify(claimed)); } catch { /* ignore */ }
}

export function totalPoints(businessId: string, challenges: Challenge[]): number {
  const claimed = loadClaimed(businessId);
  return challenges.filter((c) => claimed.includes(c.id)).reduce((s, c) => s + c.points, 0);
}
