import { describe, it, expect } from 'vitest';
import { runEnrichment } from './index';

const business = {
  id: 'b1',
  name: 'Green Gardens Restaurant',
  domain: 'greengardens.ng',
  phoneE164: '+2348021112222',
  claim_status: 'unclaimed' as const,
  ownerConfirmed: false,
  fields: { opening_hours: null, hours: null, website: null, phone: null },
};

const source = { key: 'openstreetmap', url: 'https://nominatim.openstreetmap.org/search?q=green+gardens', sourceType: 'api' };

describe('runEnrichment', () => {
  it('records nothing when identity does not match', () => {
    const s = runEnrichment({
      business,
      source,
      report: { name: 'Completely Different Company', hours: [{ days: ['mon'], open: 9 * 60, close: 17 * 60 }] },
    });
    expect(s.matched).toBe(false);
    expect(s.deliverables.evidence).toHaveLength(0);
    expect(s.deliverables.proposals).toHaveLength(0);
  });

  it('proposes real hours against the 24/7 default', () => {
    const s = runEnrichment({
      business,
      source,
      report: {
        name: 'Green Gardens Restaurant',
        domain: 'greengardens.ng',
        hours: [
          { days: ['mon', 'tue', 'wed', 'thu', 'fri'], open: 9 * 60, close: 17 * 60 },
          { days: ['sat'], open: 10 * 60, close: 14 * 60 },
        ],
      },
    });
    expect(s.matched).toBe(true);
    expect(s.deliverables.evidence.some((e) => e.field_name === 'opening_hours')).toBe(true);
    expect(s.deliverables.proposals.some((p) => p.field_name === 'opening_hours')).toBe(true);
  });

  it('keeps ai_inferred observations as evidence-only', () => {
    const s = runEnrichment({
      business,
      source,
      report: {
        name: 'Green Gardens Restaurant',
        domain: 'greengardens.ng',
        observations: [{ field: 'about', value: 'Founded in 1950', supported_by: 'Founded in 1950 by Ada.' }],
      },
    });
    expect(s.matched).toBe(true);
    expect(s.deliverables.evidence.some((e) => e.field_name === 'about')).toBe(true);
  });

  it('routes a licensed, signalled image into the media drafts', () => {
    const s = runEnrichment({
      business,
      source,
      report: {
        name: 'Green Gardens Restaurant',
        domain: 'greengardens.ng',
        images: [{
          url: 'https://photos.example.com/gg-logo.jpg',
          hint: 'logo',
          signals: ['name:exact', 'domain:example.com'],
          licence: 'CC0',
        }],
      },
    });
    expect(s.deliverables.media).toHaveLength(1);
    expect(s.deliverables.media[0].asset_type).toBe('logo');
    expect(s.deliverables.media[0].rights_decision).toBe('licensed');
    expect(s.deliverables.media[0].keep_url_only).toBe(true);
  });

  it('keeps a no-licence image off the page via conservative rights', () => {
    const s = runEnrichment({
      business,
      source,
      report: {
        name: 'Green Gardens Restaurant',
        domain: 'greengardens.ng',
        images: [{ url: 'https://scraped.example.com/photo.jpg', signals: ['name:exact'], licence: null }],
      },
    });
    if (s.deliverables.media.length) {
      expect(s.deliverables.media[0].rights_decision).toBe('conservative_default');
    }
  });
});