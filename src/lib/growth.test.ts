import { describe, it, expect } from 'vitest';
import { Business } from '../types';
import { growthScore, scoreLabel, weeklyPlan, planStorageKey, healthTips, GrowthPlanModule } from './growth';

const empty = {
  id: '1',
  name: '',
  description: '',
  category: '',
  location: '',
} as unknown as Business;

const complete = {
  id: '2',
  username: 'meatclub',
  verified: true,
  name: 'Meat Club',
  description: 'Lagos’ favourite grill — flame-grilled meats, fresh sides and great vibes every single day of the week.',
  category: 'Restaurant',
  location: 'Lagos',
  phone: '+234 800 123 4567',
  website: 'meatclub.example',
  email: 'hello@meatclub.example',
  image_url: 'https://example.com/cover.png',
  logo_url: 'https://example.com/logo.png',
  rating: 4.8,
  hours: '9am – 10pm',
  phone_verified: true,
  email_verified: true,
  id_verified: true,
  registration_verified: true,
  address_verified: true,
  documents_reviewed: true,
  onsite_verified: true,
  verification_tier: 'gold',
  created_at: new Date().toISOString(),
} as unknown as Business;

describe('growth score', () => {
  it('scores an empty profile near zero', () => {
    const { score } = growthScore(empty);
    expect(score).toBeLessThanOrEqual(15);
  });

  it('scores a complete, verified profile highly', () => {
    const { score } = growthScore(complete);
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it('caps the score at 100 and never goes negative', () => {
    const high = { ...complete, rating: 5, verification_tier: 'platinum' };
    expect(growthScore(high).score).toBeLessThanOrEqual(100);
    expect(growthScore(empty).score).toBeGreaterThanOrEqual(0);
  });

  it('returns one breakdown item per pillar with earned <= max', () => {
    const { items } = growthScore(complete);
    expect(items.length).toBe(4);
    for (const i of items) {
      expect(i.earned).toBeLessThanOrEqual(i.max);
      expect(i.earned).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('score label', () => {
  it('maps thresholds to labels', () => {
    expect(scoreLabel(95)).toBe('Growth Legend');
    expect(scoreLabel(80)).toBe('Growing Strong');
    expect(scoreLabel(60)).toBe('Building Momentum');
    expect(scoreLabel(40)).toBe('Getting Started');
    expect(scoreLabel(10)).toBe('Fresh Start');
  });
});

describe('weekly plan', () => {
  it('includes a logo task when the logo is missing', () => {
    const tasks = weeklyPlan(empty);
    expect(tasks.some((t) => t.id === 'logo')).toBe(true);
  });

  it('omits completion tasks for a complete profile', () => {
    const tasks = weeklyPlan(complete);
    expect(tasks.some((t) => t.id === 'logo')).toBe(false);
    expect(tasks.some((t) => t.id === 'description')).toBe(false);
  });

  it('keeps ids unique and modules valid', () => {
    const valid: GrowthPlanModule[] = ['home', 'brand-kit', 'card', 'qr', 'social', 'flyer', 'poster', 'banner', 'copywriter', 'promotions', 'planner', 'health', 'assistant', 'campaign', 'announce', 'quotations', 'catalogues'];
    const tasks = weeklyPlan(complete);
    const ids = tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of tasks) {
      expect(valid).toContain(t.module);
      expect(t.title.length).toBeGreaterThan(3);
      expect(t.detail.length).toBeGreaterThan(20);
    }
  });
});

describe('plan storage', () => {
  it('is scoped per business and per week', () => {
    const a = planStorageKey('1', new Date(2026, 0, 5)); // Monday
    const b = planStorageKey('2', new Date(2026, 0, 5));
    const c = planStorageKey('1', new Date(2026, 0, 12)); // next Monday
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(planStorageKey('1', new Date(2026, 0, 7))).toBe(a); // mid-week same key
  });
});

describe('health tips', () => {
  it('returns at most four tips', () => {
    expect(healthTips(empty).length).toBeGreaterThanOrEqual(1);
    expect(healthTips(empty).length).toBeLessThanOrEqual(4);
    expect(healthTips(complete).length).toBeGreaterThanOrEqual(1);
  });
});
