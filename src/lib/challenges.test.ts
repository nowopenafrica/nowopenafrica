import { describe, it, expect } from 'vitest';
import { Business } from '../types';
import { CHALLENGES, tasksFor, challengeProgress } from './challenges';

const empty = { id: '1', name: '', description: '', category: '', location: '' } as unknown as Business;

const complete = {
  id: '2',
  username: 'meatclub',
  name: 'Meat Club',
  description: 'Lagos’ favourite grill — flame-grilled meats, fresh sides and great vibes every single day of the week.',
  category: 'Restaurant',
  location: 'Lagos',
  phone: '+234 800 123 4567',
  image_url: 'https://example.com/cover.png',
  logo_url: 'https://example.com/logo.png',
  hours: '9am – 10pm',
} as unknown as Business;

const stats = {
  business: complete,
  planDone: 5,
  planTotal: 5,
  plannerPublished: 2,
  promosTotal: 2,
  livePromos: 1,
  promosShared: 1,
  reviewsCount: 3,
  respondedCount: 1,
};

describe('challenges', () => {
  it('defines four unique challenges with points', () => {
    const ids = CHALLENGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Review Booster was removed with the Review Manager module — it asked
    // owners to reply to reviews, which there's no longer a UI for.
    expect(ids.length).toBe(4);
    for (const c of CHALLENGES) {
      expect(c.points).toBeGreaterThan(0);
      expect(c.title.length).toBeGreaterThan(3);
    }
  });

  it('profile perfection tracks the six essentials', () => {
    const c = CHALLENGES.find((x) => x.id === 'profile-perfect')!;
    const { done, total } = challengeProgress(tasksFor(c, { ...stats, business: empty }));
    expect(total).toBe(6);
    expect(done).toBe(0);

    const full = challengeProgress(tasksFor(c, stats));
    expect(full.done).toBe(6);
  });

  it('content sprint rewards published posts', () => {
    const c = CHALLENGES.find((x) => x.id === 'content-sprint')!;
    const { done } = challengeProgress(tasksFor(c, { ...stats, plannerPublished: 2 }));
    expect(done).toBe(2);
  });

  it('promo launch needs create, live and share', () => {
    const c = CHALLENGES.find((x) => x.id === 'promo-launch')!;
    expect(challengeProgress(tasksFor(c, { ...stats, promosShared: 0, livePromos: 0 })).done).toBe(1);
    expect(challengeProgress(tasksFor(c, stats)).done).toBe(3);
  });

  it('no longer offers the Review Booster, which needs a removed module', () => {
    expect(CHALLENGES.find((c) => c.id === 'review-boost')).toBeUndefined();
  });

  it('plan pilot rewards partial completion', () => {
    const c = CHALLENGES.find((x) => x.id === 'plan-pilot')!;
    expect(challengeProgress(tasksFor(c, { ...stats, planDone: 1, planTotal: 5 })).done).toBe(0);
    expect(challengeProgress(tasksFor(c, { ...stats, planDone: 2, planTotal: 5 })).done).toBe(1);
    expect(challengeProgress(tasksFor(c, stats)).done).toBe(3);
  });
});
