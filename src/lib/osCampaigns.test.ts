import { describe, it, expect } from 'vitest';
import {
  CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS,
  mapCampaignRow, advanceStatus, formatCampaignDate,
  campaignWindowLabel, nextStep, summarizeCampaigns, CAMPAIGNS_SEED,
  type CampaignItem,
} from './osCampaigns';

const org = '00000000-0000-4000-8000-00000000a001';

function item(over: Partial<CampaignItem> = {}): CampaignItem {
  return { id: 'c1', org_id: org, slug: 's', name: 'Campaign', focus: 'f', audience: '', channels: ['Social'], status: 'idea', starts_at: null, ends_at: null, ...over };
}

describe('campaigns lib', () => {
  it('exposes the statuses and their labels', () => {
    expect(CAMPAIGN_STATUSES).toEqual(['idea', 'planning', 'in_build', 'live', 'wrapped']);
    expect(CAMPAIGN_STATUS_LABELS.live).toBe('Live');
    expect(CAMPAIGN_STATUS_LABELS.in_build).toBe('In build');
    expect(CAMPAIGN_STATUS_LABELS.wrapped).toBe('Wrapped');
  });

  it('maps os_campaigns rows, tolerating an unknown status', () => {
    const row = { id: 'r1', org_id: org, slug: 'rw', name: 'Restaurant Week', focus: 'f', audience: 'a', channels: ['Social'], status: 'in_build', starts_at: '2026-09-14T09:00:00Z', ends_at: null };
    expect(mapCampaignRow(row)).toMatchObject({ id: 'r1', slug: 'rw', status: 'in_build', channels: ['Social'] });
    expect(mapCampaignRow({ ...row, status: 'archived' })).toMatchObject({ status: 'idea' });
  });

  it('advances a campaign one stage, clamped at the ends', () => {
    expect(advanceStatus('idea')).toBe('planning');
    expect(advanceStatus('planning')).toBe('in_build');
    expect(advanceStatus('in_build')).toBe('live');
    expect(advanceStatus('live')).toBe('wrapped');
    expect(advanceStatus('wrapped')).toBe('wrapped');
  });

  it('formats campaign dates as month + year, tolerating missing dates', () => {
    expect(formatCampaignDate('2026-09-14T09:00:00Z')).toBe('Sep 2026');
    expect(formatCampaignDate(null)).toBe('TBA');
    expect(formatCampaignDate('not-a-date')).toBe('TBA');
  });

  it('derives an honest run-window label per status', () => {
    expect(campaignWindowLabel(item({ status: 'live', starts_at: '2026-01-15T09:00:00Z' }))).toBe('Live since Jan 2026');
    expect(campaignWindowLabel(item({ status: 'in_build', starts_at: '2026-09-14T09:00:00Z', ends_at: '2026-09-20T09:00:00Z' }))).toBe('Sep 2026 → Sep 2026');
    expect(campaignWindowLabel(item({ status: 'planning', starts_at: '2026-11-02T09:00:00Z' }))).toBe('Target Nov 2026');
    expect(campaignWindowLabel(item({ status: 'wrapped', starts_at: '2026-01-15T09:00:00Z', ends_at: '2026-02-15T09:00:00Z' }))).toBe('Wrapped · Feb 2026');
  });

  it('gives every status an honest next step', () => {
    expect(nextStep(item({ status: 'idea' }))).toBe('Write the one-page plan');
    expect(nextStep(item({ status: 'in_build' }))).toBe('QA the landing page, ads and emails');
    expect(nextStep(item({ status: 'wrapped' }))).toBe('File the retro and archive the assets');
  });

  it('summarizes the ledger by status', () => {
    const s = summarizeCampaigns([
      item({ id: 'c1', status: 'live' }),
      item({ id: 'c2', status: 'live' }),
      item({ id: 'c3', status: 'in_build' }),
      item({ id: 'c4', status: 'wrapped' }),
      item({ id: 'c5', status: 'planning' }),
    ]);
    expect(s).toEqual({ total: 5, live: 2, inBuild: 1, wrapped: 1 });
  });

  it('mirrors the three seeded platform campaigns', () => {
    expect(CAMPAIGNS_SEED).toHaveLength(3);
    expect(new Set(CAMPAIGNS_SEED.map((c) => c.slug)).size).toBe(3);
    expect(CAMPAIGNS_SEED.every((c) => c.org_id === org)).toBe(true);
    expect(CAMPAIGNS_SEED.find((c) => c.name === 'Restaurant Week 2026')?.status).toBe('in_build');
  });
});
