import { describe, it, expect } from 'vitest';
import { Business } from '../types';
import {
  parseBrief, buildAgencyPlan, brandAssetsReport, seasonFit,
  CAMPAIGN_GOAL_CARDS, PLATFORM_RULES, goalCardByKey, creatorForFormat,
} from './agencyStudio';
import { generateVideoProject } from './videoCreator';

const biz: Business = {
  id: 'biz-1',
  name: 'Meat Club',
  description: 'Smoked meats and grills.',
  category: 'Restaurant',
  location: 'Lagos',
  phone: '+234 800 123 4567',
  logo_url: 'https://img/logo.png',
  rating: 4.6,
};

describe('agencyStudio — brief parsing', () => {
  it('detects a sales brief with urgency and a clean topic', () => {
    const p = parseBrief('Can you help me promote a weekend grill special with a discount?');
    expect(p.goal).toBe('sales');
    expect(p.urgency).toBe(true);
    expect(p.topic.toLowerCase()).toContain('grill');
    expect(p.topic.toLowerCase()).not.toContain('can');
  });

  it('detects bookings and the platform', () => {
    const p = parseBrief('We want more table bookings on instagram reels this month');
    expect(p.goal).toBe('bookings');
    expect(p.platform).toBe('instagram');
  });

  it('detects hiring briefs', () => {
    const p = parseBrief('We are hiring staff for the new branch');
    expect(p.goal).toBe('recruit');
  });

  it('reads an explicit duration', () => {
    const p = parseBrief('A 30 second reel for our new product');
    expect(p.duration).toBe(30);
    expect(p.goal).toBe('launch');
  });

  it('reads an explicit format keyword', () => {
    expect(parseBrief('Make a story about our daily special').format).toBe('Story');
  });

  it('detects season mentions', () => {
    expect(seasonFit('Black Friday deals for my shop')?.key).toBe('black-friday');
    expect(seasonFit('Valentine special at the salon')?.key).toBe('valentines');
    expect(seasonFit('Just regular weekly posts')).toBeNull();
  });
});

describe('agencyStudio — campaign plan', () => {
  it('builds a complete deterministic plan', () => {
    const a = buildAgencyPlan(biz, 'Weekend grill special with a discount on instagram');
    const b = buildAgencyPlan(biz, 'Weekend grill special with a discount on instagram');

    expect(a.recommendation.goal).toBe('sales');
    expect(a.recommendation.platform).toBe('instagram');
    expect(a.video.scenes.length).toBeGreaterThan(0);
    expect(a.video.hook).toBe(b.video.hook);
    expect(a.calendar).toHaveLength(7);
    expect(a.calendar[0].status).toBe('draft');
    expect(a.calendar[6].status).toBe('publish');
    expect(a.recommendation.reasoning.length).toBeGreaterThan(0);
    expect(a.hooks.length).toBeGreaterThanOrEqual(3);
  });

  it('picks a property tour flow when the brief mentions property', () => {
    const a = buildAgencyPlan(biz, 'Help me sell this 3-bedroom apartment listing on instagram');
    expect(a.recommendation.goal).toBe('property');
    expect(a.recommendation.format).toBe('Property Tour');
    expect(a.video.format).toBe('Property Tour');
    expect(creatorForFormat('Property Tour')).toBe('property');
  });

  it('matches a season and builds the full campaign pack', () => {
    const a = buildAgencyPlan(biz, 'Black Friday offer for my restaurant');
    expect(a.season?.occasion.key).toBe('black-friday');
    expect(a.season?.plan.emailSubject).toContain('Meat Club');
    expect(a.season?.plan.sms).toContain('BLACK FRIDAY');
  });

  it('defaults a blank brief to awareness', () => {
    const a = buildAgencyPlan(biz, '');
    expect(a.recommendation.goal).toBe('awareness');
    expect(a.recommendation.headline).toContain('Meat Club');
  });

  it('lets the hook generator pin a specific opener deterministically', () => {
    const a = buildAgencyPlan(biz, 'Weekend grill special with a discount on instagram');
    const custom = generateVideoProject(biz, { ...a.input, hook: a.hooks[2] });
    expect(custom.hook).toBe(a.hooks[2]);
    expect(custom.scenes.length).toBe(a.video.scenes.length);
  });

  it('exposes a hook bank pulled from the same brief', () => {
    const a = buildAgencyPlan(biz, 'Weekend grill special with a discount on instagram');
    expect(a.hooks).toContain(a.video.hook);
  });
});

describe('agencyStudio — assets, goals and platforms', () => {
  it('covers every video goal with a card', () => {
    expect(CAMPAIGN_GOAL_CARDS.length).toBe(9);
    for (const g of CAMPAIGN_GOAL_CARDS) {
      expect(g.formats.length).toBeGreaterThan(0);
      expect(g.platforms.length).toBeGreaterThan(0);
    }
  });

  it('goalCardByKey falls back safely', () => {
    expect(goalCardByKey('sales').metric).toBe('New orders');
  });

  it('every platform has optimisation rules', () => {
    expect(Object.keys(PLATFORM_RULES)).toHaveLength(6);
    for (const p of Object.values(PLATFORM_RULES)) {
      expect(p.tips.length).toBeGreaterThan(0);
      expect(p.bestTimes.length).toBeGreaterThan(0);
    }
  });

  it('brand assets report counts presence from the business profile', () => {
    const r = brandAssetsReport(biz);
    expect(r.assets).toHaveLength(10);
    expect(r.assets.find((a) => a.key === 'logo')!.present).toBe(true);
    expect(r.assets.find((a) => a.key === 'phone')!.present).toBe(true);
    expect(r.assets.find((a) => a.key === 'website')!.present).toBe(false);
    expect(r.readiness).toBeGreaterThanOrEqual(40);
    expect(r.readiness).toBeLessThanOrEqual(100);
  });
});
