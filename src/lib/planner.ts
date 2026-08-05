// NowOpen Studio — Content Planner storage.
//
// Shared helpers for reading planner items from localStorage so other modules
// (Growth Challenges, Business Health) can count published posts without
// depending on the ContentPlanner component.

import { weekKeyFor } from './growth';

export interface PlanItem {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  platform: string;
  status: 'planned' | 'published';
}

export function planItemsKey(businessId: string): string {
  return `nowopen_planner_${businessId}`;
}

export function loadPlannerItems(businessId: string): PlanItem[] {
  try {
    const raw = localStorage.getItem(planItemsKey(businessId));
    const parsed = raw ? (JSON.parse(raw) as PlanItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePlannerItems(businessId: string, items: PlanItem[]): void {
  try { localStorage.setItem(planItemsKey(businessId), JSON.stringify(items)); } catch { /* ignore */ }
}

// How many items are marked published in the current week (Monday first).
export function publishedThisWeek(businessId: string, now = new Date()): number {
  const week = weekKeyFor(now);
  return loadPlannerItems(businessId).filter((i) => {
    const d = new Date(`${i.date}T00:00:00`);
    return i.status === 'published' && weekKeyFor(d) === week;
  }).length;
}
