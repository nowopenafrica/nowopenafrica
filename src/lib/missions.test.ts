import { describe, it, expect, beforeEach } from 'vitest';
import { Business } from '../types';
import {
  todayMission,
  completeMission,
  loadMissions,
  levelFor,
  progressToNextLevel,
  isMissionComplete,
  MISSIONS_LEVELS,
} from './missions';

const business: Business = {
  id: 'biz-1',
  name: 'Sunrise Grill',
  description: 'A fast food restaurant serving grilled specials in Lagos.',
  category: 'restaurant',
  location: 'Lagos, Nigeria',
};

const now = new Date('2026-08-04T10:30:00');
const tomorrow = new Date('2026-08-05T10:30:00');

describe('missions', () => {
  beforeEach(() => {
    localStorage.removeItem(`nowopen_missions_${business.id}`);
  });

  it('picks a mission with points for today', () => {
    const m = todayMission(business, now);
    expect(m.title.length).toBeGreaterThan(0);
    expect(m.points).toBeGreaterThan(0);
    expect(m.emoji.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same day', () => {
    expect(todayMission(business, now).key).toBe(todayMission(business, now).key);
  });

  it('completes a mission once and awards points', () => {
    const first = completeMission(business.id, now);
    expect(first.pointsAdded).toBeGreaterThan(0);
    expect(loadMissions(business.id).points).toBe(first.state.points);
    expect(isMissionComplete(business.id, now)).toBe(true);

    const second = completeMission(business.id, now);
    expect(second.pointsAdded).toBe(0);
    expect(loadMissions(business.id).points).toBe(first.state.points);
  });

  it('awards more points on a later day', () => {
    const a = completeMission(business.id, now);
    const b = completeMission(business.id, tomorrow);
    expect(b.state.points).toBe(a.state.points + b.pointsAdded);
  });

  it('tracks levels from points', () => {
    expect(levelFor(0).label).toBe('Newbie');
    expect(levelFor(100).label).toBe('Local Star');
    expect(levelFor(1200).label).toBe('Marketing Mogul');
    const prog = progressToNextLevel(80);
    expect(prog.next!.label).toBe('Local Star');
    expect(prog.pointsNeeded).toBe(20);
  });

  it('reports complete level progress', () => {
    expect(progressToNextLevel(2000).pct).toBe(100);
    expect(MISSIONS_LEVELS.length).toBeGreaterThanOrEqual(5);
  });
});
