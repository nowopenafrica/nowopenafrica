import { describe, it, expect } from 'vitest';
import { Business } from '../types';
import { marketplaceCatalog, packsForIndustry, featuredPacks, launchPack, industryLabelFor } from './campaignMarketplace';
import { VIDEO_INDUSTRIES } from './videoCreator';
import { loadCampaigns } from './campaigns';

const business: Business = {
  id: 'biz-1',
  name: 'Sunrise Grill',
  description: 'A fast food restaurant serving grilled specials in Lagos.',
  category: 'restaurant',
  location: 'Lagos, Nigeria',
  phone: '+2348000000000',
};

describe('campaignMarketplace', () => {
  it('covers every video industry with curated packs', () => {
    const catalog = marketplaceCatalog();
    for (const industry of VIDEO_INDUSTRIES) {
      expect(packsForIndustry(industry.key).length).toBeGreaterThan(0);
    }
    expect(catalog.length).toBeGreaterThan(VIDEO_INDUSTRIES.length);
  });

  it('ranks a business own-industry packs first', () => {
    const featured = featuredPacks(business, 6);
    expect(featured[0].industryKey).toBe('restaurant');
    const own = featured.filter((p) => p.industryKey === 'restaurant');
    const rest = featured.filter((p) => p.industryKey !== 'restaurant');
    expect(own.length).toBeGreaterThan(rest.length);
  });

  it('every pack is fully specified', () => {
    for (const p of marketplaceCatalog()) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.durationDays).toBeGreaterThan(0);
      expect(p.channels.length).toBeGreaterThan(0);
      expect(['free', 'pro']).toContain(p.tier);
    }
  });

  it('launch generates a persisted campaign plan', () => {
    localStorage.removeItem(`nowopen_campaigns_plan_${business.id}`);
    const pack = packsForIndustry('restaurant')[0];
    const plan = launchPack(business, pack, '2026-08-10');
    expect(plan.days).toBe(pack.durationDays);
    expect(plan.steps.length).toBe(plan.days * 5);
    expect(loadCampaigns(business.id)).toHaveLength(1);
    localStorage.removeItem(`nowopen_campaigns_plan_${business.id}`);
  });

  it('resolves industry labels', () => {
    expect(industryLabelFor('restaurant')).toContain('Restaurant');
  });
});
