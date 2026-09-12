import { describe, it, expect } from 'vitest';
import {
  PROPOSAL_STATUS_LABEL, PROPOSAL_FIELD_LABEL, proposalFieldLabel,
  proposalReviewPatch, displayValue, sourceLabel, isApplied, APPLIED_SENTINEL,
  AUTO_APPLIED_SENTINEL, type ChangeProposalRow,
} from './changeProposals';

describe('changeProposals — field labels', () => {
  it('spells out every field the applier can write', () => {
    for (const field of [
      'description', 'category', 'address', 'location', 'phone', 'whatsapp', 'email',
      'website', 'logo_url', 'image_url', 'opening_hours', 'tagline', 'about', 'story',
      'mission', 'vision', 'subcategory', 'business_type', 'employees', 'service_area',
      'timezone', 'founded_year', 'social_links',
    ]) {
      expect(proposalFieldLabel(field), field).not.toBe(field);
    }
    // The applier allowlist is exactly these 23 fields.
    expect(mapLength(PROPOSAL_FIELD_LABEL)).toBe(23);
  });

  it('falls back to the raw name for an unknown column', () => {
    expect(proposalFieldLabel('some_new_column')).toBe('some_new_column');
  });

  it('covers every proposal status the DB allows', () => {
    for (const s of ['pending', 'approved', 'rejected', 'superseded']) {
      expect(PROPOSAL_STATUS_LABEL[s]).toEqual(expect.stringMatching(/\S/));
    }
  });
});

describe('changeProposals — reviewer stamps', () => {
  it('approve moves the row out of pending and records who did it', () => {
    expect(proposalReviewPatch('approve', '2026-09-12T00:00:00.000Z', 'u-admin', null)).toEqual({
      status: 'approved',
      reviewed_by: 'u-admin',
      reviewed_at: '2026-09-12T00:00:00.000Z',
      note: 'Approved in change review',
    });
  });

  it('reject keeps the given reason (trimmed)', () => {
    expect(proposalReviewPatch('reject', '2026-09-12T00:00:00.000Z', 'u-admin', '  Stored hours look wrong  '))
      .toMatchObject({ status: 'rejected', note: 'Stored hours look wrong' });
  });

  it('reject without a reason says so rather than storing null', () => {
    expect(proposalReviewPatch('reject', '2026-09-12T00:00:00.000Z', null, null).note)
      .toBe('Rejected in change review');
  });
});

describe('changeProposals — applied sentinel', () => {
  it('only the applier-stamped row reads as applied', () => {
    const base: { status: ChangeProposalRow['status']; note: string | null } = { status: 'approved', note: null };
    expect(isApplied({ ...base, note: APPLIED_SENTINEL })).toBe(true);
    expect(isApplied({ ...base, note: 'Approved in change review' })).toBe(false);
    expect(isApplied({ status: 'pending', note: null })).toBe(false);
  });

  it('reads an owner-sync auto-applied row as applied too', () => {
    expect(isApplied({ status: 'approved', note: AUTO_APPLIED_SENTINEL })).toBe(true);
    expect(isApplied({ status: 'pending', note: AUTO_APPLIED_SENTINEL })).toBe(false);
  });
});

describe('changeProposals — value display', () => {
  it('renders social_links as the platform list, not raw json', () => {
    expect(displayValue('social_links', '{"instagram":"https://ig/x","facebook":"https://fb/x"}'))
      .toBe('instagram, facebook');
  });

  it('falls back to raw text when the json is malformed', () => {
    expect(displayValue('social_links', '{not json')).toBe('{not json');
  });

  it('shows a dash for absent values', () => {
    expect(displayValue('opening_hours', null)).toBe('—');
    expect(displayValue('description', '')).toBe('—');
  });

  it('passes plain field values through untouched', () => {
    expect(displayValue('opening_hours', 'Mon–Sat: 9AM–7PM')).toBe('Mon–Sat: 9AM–7PM');
  });
});

describe('changeProposals — source labelling', () => {
  it('prefers the source id, de-snaked', () => {
    expect(sourceLabel('openstreetmap', 'https://www.openstreetmap.org/')).toBe('openstreetmap');
  });

  it('falls back to the host of the source url', () => {
    expect(sourceLabel(null, 'https://www.openstreetmap.org/node/1')).toBe('www.openstreetmap.org/node/1');
  });

  it('returns null when neither exists', () => {
    expect(sourceLabel(null, null)).toBeNull();
  });
});

const mapLength = (m: Record<string, unknown>) => Object.keys(m).length;

describe('changeProposals — registry integrity', () => {
  it('labels every status and every writable field once', () => {
    expect(mapLength(PROPOSAL_STATUS_LABEL)).toBe(4);
    expect(mapLength(PROPOSAL_FIELD_LABEL)).toBe(23);
  });
});