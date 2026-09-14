import { describe, it, expect } from 'vitest';
import {
  buildDeliverables,
  isEmpty,
  PROPOSE_FLOOR,
  STOCK_PLACEHOLDER_CONFIDENCE,
  liftLicensedMediaToFields,
  type MediaDraft,
} from './proposals';

const business = {
  id: 'b1',
  name: 'Green Gardens',
  claim_status: 'unclaimed',
  ownerConfirmed: false,
  fields: { opening_hours: null, hours: null, website: null, phone: null },
  social_links: undefined,
};

const source = { key: 'openstreetmap', url: 'https://nominatim.openstreetmap.org/search?q=green+gardens', sourceType: 'api' };

describe('liftLicensedMediaToFields', () => {
  const licensed: MediaDraft = {
    asset_type: 'cover',
    source_id: 'pexels',
    source_url: 'https://www.pexels.com/search/lagos-cafe/',
    source_uri: 'https://images.pexels.com/photos/123/cover.jpg',
    match_confidence: 40,
    matching_signal: { fields: ['name:x', 'category:food'], exact: false },
    rights_decision: 'licensed',
    licence: 'Pexels License',
    rights_owner: null,
    jurisdiction: 'US',
    criticality: 'non_critical',
    moderation_status: 'pending',
    keep_url_only: true,
    status: 'discovered',
  };

  it('lifts a licensed cover into an image_url proposal backed by evidence', () => {
    const out = liftLicensedMediaToFields({ business, media: [licensed] });
    expect(out.proposals).toHaveLength(1);
    expect(out.proposals[0].field_name).toBe('image_url');
    expect(out.proposals[0].proposed_value).toBe(licensed.source_uri);
    expect(out.proposals[0].confidence).toBe(STOCK_PLACEHOLDER_CONFIDENCE);
    expect(out.evidence).toHaveLength(1);
    expect(out.evidence[0].field_name).toBe('image_url');
    expect(out.evidence[0].extraction_method).toBe('api');
    expect(out.evidence[0].status).toBe('source_confirmed');
    expect(out.evidence[0].generated_by_ai).toBe(false);
    expect(out.proposals[0].reason).toMatch(/licensed stock placeholder/i);
  });

  it('maps a licensed logo to logo_url instead', () => {
    const out = liftLicensedMediaToFields({ business, media: [{ ...licensed, asset_type: 'logo' }] });
    expect(out.proposals[0].field_name).toBe('logo_url');
  });

  it('does not lift when the business already has the field', () => {
    const out = liftLicensedMediaToFields({
      business: { ...business, fields: { ...business.fields, image_url: 'https://x/cover.png' } },
      media: [licensed],
    });
    expect(out.proposals).toHaveLength(0);
    expect(out.notes.some((n) => n.includes('already has a value'))).toBe(true);
  });

  it('keeps gallery items registry-only', () => {
    const out = liftLicensedMediaToFields({ business, media: [{ ...licensed, asset_type: 'gallery' }] });
    expect(out.proposals).toHaveLength(0);
  });

  it('never lifts unlicensed (conservative) media', () => {
    const out = liftLicensedMediaToFields({
      business,
      media: [{ ...licensed, rights_decision: 'conservative_default', licence: null }],
    });
    expect(out.proposals).toHaveLength(0);
    expect(out.notes.some((n) => n.includes('registry only'))).toBe(true);
  });

  it('never duplicates a field that is already pending', () => {
    const out = liftLicensedMediaToFields({
      business,
      media: [licensed],
      pendingFields: new Set(['image_url']),
    });
    expect(out.proposals).toHaveLength(0);
    expect(out.notes.some((n) => n.includes('already pending'))).toBe(true);
  });
});

describe('buildDeliverables', () => {
  it('creates evidence + proposal for concrete hours', () => {
    const d = buildDeliverables({
      business,
      source,
      hours: { kind: 'proposal', proposedText: 'Mon–Fri: 9AM–5PM', reason: 'OSM reports hours.', confidence: 80 },
    });
    expect(d.evidence).toHaveLength(1);
    expect(d.evidence[0].field_name).toBe('opening_hours');
    expect(d.evidence[0].extraction_method).toBe('structured_data');
    expect(d.proposals).toHaveLength(1);
    expect(d.proposals[0].proposed_value).toBe('Mon–Fri: 9AM–5PM');
  });

  it('records a DEFAULT-24/7 agreement as nothing at all', () => {
    const d = buildDeliverables({
      business,
      source,
      hours: { kind: 'default_remains', proposedText: undefined, reason: 'Source agrees with the default.', confidence: 0 },
    });
    expect(isEmpty(d)).toBe(true);
  });

  it('records low-confidence AI observations as evidence but never proposes', () => {
    const d = buildDeliverables({
      business,
      source,
      observations: [{
        field: 'about', value: 'Founded in 1950', quote: '', sourceUrl: source.url,
        method: 'ai_inferred', confidence: 0, probablyMadeUp: true,
      }],
    });
    expect(d.evidence).toHaveLength(1);
    expect(d.evidence[0].generated_by_ai).toBe(true);
    expect(d.evidence[0].status).toBe('ai_inferred');
    expect(d.proposals).toHaveLength(0);
  });

  it('does not propose a social value that matches what is already stored', () => {
    const d = buildDeliverables({
      business: {
        ...business,
        social_links: { instagram: 'https://instagram.com/green' },
      },
      source,
      social: { instagram: 'https://instagram.com/green' },
    });
    expect(d.proposals).toHaveLength(0);
    expect(d.notes.some((n) => n.includes('already stored'))).toBe(true);
  });

  it('never duplicates a field that already has a pending proposal', () => {
    const d = buildDeliverables({
      business,
      source,
      pendingFields: new Set(['opening_hours']),
      hours: { kind: 'proposal', proposedText: 'Mon–Fri: 9AM–5PM', reason: 'x', confidence: 80 },
    });
    expect(d.proposals).toHaveLength(0);
    expect(d.notes.some((n) => n.includes('already pending'))).toBe(true);
  });

  it('respects a raised approval threshold', () => {
    const d = buildDeliverables({
      business,
      source,
      prefs: { approvalThreshold: 60 },
      hours: { kind: 'proposal', proposedText: 'Mon–Fri: 9AM–5PM', reason: 'x', confidence: 40 },
    });
    // evidence is still recorded; the proposal is withheld below the bar.
    expect(d.evidence).toHaveLength(1);
    expect(d.proposals).toHaveLength(0);
    expect(d.notes.some((n) => n.includes('below proposal floor'))).toBe(true);
  });

  it('proposes social links changes and keeps platforms', () => {
    const d = buildDeliverables({
      business,
      source,
      social: { instagram: 'https://instagram.com/green', facebook: 'https://facebook.com/green' },
    });
    expect(d.evidence.some((e) => e.field_name === 'social_links')).toBe(true);
    expect(d.proposals.some((p) => p.field_name === 'social_links')).toBe(true);
    expect(JSON.parse(d.proposals.find((p) => p.field_name === 'social_links')!.proposed_value)).toEqual({
      instagram: 'https://instagram.com/green',
      facebook: 'https://facebook.com/green',
    });
  });
});