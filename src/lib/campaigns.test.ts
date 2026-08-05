import { describe, it, expect, beforeEach } from 'vitest';
import { Business } from '../types';
import {
  CAMPAIGN_LENGTHS, CampaignPlan,
  buildCampaign, goalLabel, dayFocus, dateLabel,
  campaignPlanText, campaignBroadcastText,
  loadCampaigns, saveCampaigns,
} from './campaigns';

const biz = {
  id: '1',
  name: 'Meat Club',
  category: 'Restaurant',
  location: 'Lagos',
  phone: '+234 800 123 4567',
  description: 'Grilled meats and more.',
  hours: '9am – 10pm',
} as unknown as Business;

beforeEach(() => localStorage.clear());

describe('campaigns — generation', () => {
  it('builds 5 assets for every campaign day', () => {
    const plan = buildCampaign(biz, 'flash-sale', '2026-08-03', 5);
    expect(plan.days).toBe(5);
    expect(plan.steps).toHaveLength(25);
    for (const d of [1, 2, 3, 4, 5]) {
      expect(plan.steps.filter((s) => s.day === d)).toHaveLength(5);
    }
  });

  it('honours every configured length', () => {
    for (const n of CAMPAIGN_LENGTHS) {
      expect(buildCampaign(biz, 'event', '2026-08-03', n).steps).toHaveLength(n * 5);
    }
  });

  it('spans dates from the start date and labels them readably', () => {
    const plan = buildCampaign(biz, 'grand-opening', '2026-08-03', 3);
    const day1 = plan.steps.find((s) => s.day === 1);
    const day3 = plan.steps.find((s) => s.day === 3);
    expect(plan.startDate).toBe('2026-08-03');
    expect(day1?.caption).toContain('Scheduled Mon, Aug 3');
    expect(day3?.caption).toContain('Scheduled Wed, Aug 5');
    expect(dateLabel(plan.startDate)).toContain('Aug');
  });

  it('mentions the business in the social caption', () => {
    const plan = buildCampaign(biz, 'weekend-promo', '2026-08-03', 3);
    expect(plan.steps[0].caption).toContain('Meat Club');
  });

  it('ships a unique id per step and a headline mentioning the goal', () => {
    const plan = buildCampaign(biz, 'hiring', '2026-08-03', 5);
    const ids = new Set(plan.steps.map((s) => s.id));
    expect(ids.size).toBe(plan.steps.length);
    expect(plan.headline.toLowerCase()).toContain(goalLabel('hiring').toLowerCase());
  });
});

describe('campaigns — helpers', () => {
  it('labels each goal', () => {
    expect(goalLabel('flash-sale')).toContain('Flash');
    expect(goalLabel('anniversary')).toContain('Anniversary');
  });

  it('keeps each day focused and non-empty', () => {
    for (const d of [1, 2, 3, 4, 5, 6, 7]) {
      expect(dayFocus(d, 7).trim().length).toBeGreaterThan(3);
    }
  });
});

describe('campaigns — copy & persistence', () => {
  it('groups the plan text by day with headers', () => {
    const plan = buildCampaign(biz, 'flash-sale', '2026-08-03', 3);
    const text = campaignPlanText(plan);
    expect(text).toContain('DAY 1');
    expect(text).toContain('DAY 3');
    expect(text).toContain('[Instagram · Social post]');
    expect(text).toContain('Meat Club');
  });

  it('builds a broadcast summary mentioning the business', () => {
    const plan = buildCampaign(biz, 'event', '2026-08-03', 3);
    const text = campaignBroadcastText(plan);
    expect(text).toContain('Meat Club');
    expect(text).toContain('Event Promotion');
  });

  it('saves and reloads campaign plans per business', () => {
    const plan = buildCampaign(biz, 'thank-you', '2026-08-03', 5);
    saveCampaigns('biz1', [plan]);
    const loaded = loadCampaigns('biz1');
    expect(loaded).toHaveLength(1);
    expect((loaded[0] as CampaignPlan).startDate).toBe('2026-08-03');
    expect(loadCampaigns('other')).toHaveLength(0);
  });
});
