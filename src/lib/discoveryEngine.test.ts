import { describe, it, expect } from 'vitest';

import {
  AFRICAN_COUNTRIES,
  CITIES,
  CATEGORIES,
  campaignDefaults,
  campaignTargetSummary,
  classifyCandidate,
  completenessBreakdown,
  decisionReason,
  FILTER_OPTIONS,
  NEIGHBORHOODS,
  PRODUCTS,
  SERVICES,
  toRadarSource,
  validateCampaign,
} from './discoveryEngine';

const autoSource = {
  key: 'wikidata',
  name: 'Wikidata',
  active: true,
  kind: 'authorized_api',
  automated_access: 'permitted',
  bulk_extraction: 'permitted',
  competing_dataset: 'permitted',
  redistribution: 'permitted',
  licence: 'CC0 1.0',
  authorised_by: 'NowOpen Africa',
  authorised_at: '2026-09-08',
};

const blockedSource = {
  key: 'businesslist_ng',
  name: 'BusinessList',
  active: false,
  kind: 'licensed_directory',
  automated_access: 'prohibited',
  bulk_extraction: 'prohibited',
  competing_dataset: 'prohibited',
  redistribution: 'prohibited',
  licence: null,
  authorised_by: null,
  authorised_at: null,
};

function candidate(overrides: Partial<Parameters<typeof classifyCandidate>[0]['candidate']> = {}) {
  return {
    id: 'c1',
    source_key: 'wikidata',
    name: 'Bello Tailors',
    category: 'Tailors',
    confidence: 92,
    status: 'pending',
    duplicate_of: null,
    published_business_id: null,
    ...overrides,
  };
}

describe('campaign options', () => {
  it('offers the target lists the builder needs', () => {
    expect(AFRICAN_COUNTRIES).toContain('Nigeria');
    expect(AFRICAN_COUNTRIES).toContain('Kenya');
    expect(CITIES).toContain('Lagos');
    expect(NEIGHBORHOODS).toContain('Lekki');
    expect(CATEGORIES).toContain('Tailors');
    expect(CATEGORIES).toContain('Food & Restaurants');
    expect(SERVICES).toContain('Tailoring');
    expect(PRODUCTS).toContain('Dresses');
  });

  it('covers the three product surfaces of NowOpen', () => {
    expect(CATEGORIES.some((c) => /Catering|Bakeries/.test(c))).toBe(true);
    expect(SERVICES).toContain('Photography');
  });

  it('keeps the filter list under 30 rows so the UI stays readable', () => {
    expect(FILTER_OPTIONS.length).toBeLessThan(30);
  });
});

describe('validateCampaign', () => {
  it('accepts a fully-scoped campaign', () => {
    const errors = validateCampaign({
      ...campaignDefaults(),
      name: 'Lagos Fashion — September 2026',
      countries: ['Nigeria'],
      cities: ['Lagos'],
      categories: ['Fashion & Apparel'],
      sourceKeys: ['wikidata'],
    });
    expect(errors).toEqual([]);
  });

  it('rejects a nameless, target-less campaign', () => {
    const errors = validateCampaign(campaignDefaults());
    expect(errors.map((e) => e.field)).toContain('name');
    expect(errors.map((e) => e.field)).toContain('geography');
    expect(errors.map((e) => e.field)).toContain('subject');
    expect(errors.map((e) => e.field)).toContain('sources');
  });

  it('rejects thresholds that contradict the queue threshold', () => {
    const errors = validateCampaign({
      ...campaignDefaults(),
      name: 'n',
      countries: ['Nigeria'],
      categories: ['Retail & Shopping'],
      sourceKeys: ['wikidata'],
      reviewThreshold: 90,
      autoPublishThreshold: 50,
    });
    expect(errors.map((e) => e.field)).toContain('reviewThreshold');
  });

  it('requires a channel once outreach is switched on', () => {
    const errors = validateCampaign({
      ...campaignDefaults(),
      name: 'n',
      countries: ['Ghana'],
      categories: ['Beauty & Hair'],
      sourceKeys: ['wikidata'],
      outreachEnabled: true,
      outreachChannel: null,
    });
    expect(errors.map((e) => e.field)).toContain('outreachChannel');
  });

  it('accepts outreach with a named channel', () => {
    const errors = validateCampaign({
      ...campaignDefaults(),
      name: 'n',
      countries: ['Kenya'],
      categories: ['Tech & Digital'],
      sourceKeys: ['admin_import'],
      outreachEnabled: true,
      outreachChannel: 'email',
    });
    expect(errors).toEqual([]);
  });

  it('rejects an end date before the start', () => {
    const errors = validateCampaign({
      ...campaignDefaults(),
      name: 'n',
      countries: ['Nigeria'],
      categories: ['Catering'],
      sourceKeys: ['wikidata'],
      startAt: '2026-10-01T00:00:00Z',
      endAt: '2026-09-01T00:00:00Z',
    });
    expect(errors.map((e) => e.field)).toContain('dates');
  });
});

describe('campaignTargetSummary', () => {
  it('reads as a plan line, not a list dump', () => {
    expect(campaignTargetSummary({
      ...campaignDefaults(),
      countries: ['Nigeria', 'Ghana'],
      regions: ['Lagos State'],
      cities: ['Lagos'],
      categories: ['Tailors'],
    })).toBe('2 countries · 1 regions · 1 cities · 1 categories');
  });

  it('says plainly when nothing is targeted', () => {
    expect(campaignTargetSummary(campaignDefaults())).toBe('No targets selected');
  });
});

describe('classifyCandidate', () => {
  it('auto-publishes a high-confidence record from a permitted source', () => {
    const d = classifyCandidate({
      candidate: candidate(),
      source: toRadarSource(autoSource),
      mode: 'autonomous',
      thresholds: { autoPublish: 90, review: 50 },
    });
    expect(d.action).toBe('auto-publish');
  });

  it('never auto-publishes from a source that is not cleared', () => {
    const d = classifyCandidate({ candidate: candidate(), source: toRadarSource(blockedSource) });
    expect(d.action).toBe('reject');
    expect(d.reason).toMatch(/automated access/i);
  });

  it('holds an exact duplicate regardless of confidence', () => {
    const d = classifyCandidate({
      candidate: candidate({ duplicate_of: 'b-123' }),
      source: toRadarSource(autoSource),
      mode: 'autonomous',
    });
    expect(d.action).toBe('hold');
  });

  it('requires approval in manual mode even at high confidence', () => {
    const d = classifyCandidate({
      candidate: candidate(),
      source: toRadarSource(autoSource),
      mode: 'manual',
    });
    expect(d.action).toBe('review');
  });

  it('holds low-confidence records rather than publishing them', () => {
    const d = classifyCandidate({
      candidate: candidate({ confidence: 30 }),
      source: toRadarSource(autoSource),
      mode: 'autonomous',
    });
    expect(d.action).toBe('hold');
  });

  it('never auto-publishes a health/finance/legal category', () => {
    const d = classifyCandidate({
      candidate: candidate({ category: 'Health & Medical', confidence: 99 }),
      source: toRadarSource(autoSource),
      mode: 'autonomous',
    });
    expect(d.action).toBe('review');
    expect(d.reason).toMatch(/person/);
  });

  it('treats a missing source row as un-permitted — default deny', () => {
    const d = classifyCandidate({ candidate: candidate(), source: null });
    expect(d.action).toBe('reject');
  });

  it('holds a candidate that is already published', () => {
    const d = classifyCandidate({
      candidate: candidate({ published_business_id: 'b-1' }),
      source: toRadarSource(autoSource),
    });
    expect(d.action).toBe('hold');
  });
});

describe('decisionReason', () => {
  it('explains the blocking right', () => {
    expect(decisionReason(candidate(), toRadarSource(blockedSource))).toMatch(/automated access is not established/i);
  });

  it('defers to a human when the source is clear', () => {
    expect(decisionReason(candidate(), toRadarSource(autoSource))).toMatch(/human decision/);
  });
});

describe('completenessBreakdown', () => {
  it('scores a thin candidate honestly and displates components', () => {
    const { score, components } = completenessBreakdown(candidate({ category: null, confidence: 0, status: 'pending', duplicate_of: null }));
    // name + source + decision + reproducible are present; category and
    // confidence are not.
    expect(score).toBe(65);
    expect(components.length).toBe(6);
    expect(components.find((c) => c.label === 'category')?.present).toBe(false);
    expect(components.find((c) => c.label === 'confidence')?.present).toBe(false);
    expect(components.find((c) => c.label === 'name')?.present).toBe(true);
    expect(components.every((c) => c.weight > 0)).toBe(true);
  });
});