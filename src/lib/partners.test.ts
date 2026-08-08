import { describe, it, expect } from 'vitest';
import {
  PARTNER_STAGES, PARTNER_TYPES,
  mapPartnerRow, stageIndex, advanceStage, summarizePartners, PARTNERS_SEED,
  type PartnerItem,
} from './partners';

const org = '00000000-0000-4000-8000-00000000a001';

function partner(over: Partial<PartnerItem> = {}): PartnerItem {
  return { id: 'p1', org_id: org, name: 'TechCabal', type: 'Media', note: '', stage: 'Proposal', ...over };
}

describe('partners lib', () => {
  it('exposes the four-stage pipeline and the seven partner types', () => {
    expect(PARTNER_STAGES).toEqual(['Proposal', 'Negotiation', 'Active', 'Alumni']);
    expect(PARTNER_TYPES).toHaveLength(7);
    expect(PARTNER_TYPES).toContain('Investor');
    expect(PARTNER_TYPES).toContain('University');
  });

  it('maps os_partners rows, falling back to Proposal for unknown stages', () => {
    const row = { id: 'r1', org_id: org, name: 'Magnet Agency', type: 'Agency', note: 'n', stage: 'Active' };
    expect(mapPartnerRow(row)).toMatchObject({ id: 'r1', name: 'Magnet Agency', stage: 'Active' });
    expect(mapPartnerRow({ ...row, stage: 'Committed' }).stage).toBe('Proposal');
  });

  it('moves a partner forward and backward, clamped to the pipeline ends', () => {
    expect(stageIndex('Proposal')).toBe(0);
    expect(stageIndex('Alumni')).toBe(3);
    expect(advanceStage('Proposal', 1)).toBe('Negotiation');
    expect(advanceStage('Negotiation', -1)).toBe('Proposal');
    expect(advanceStage('Alumni', 1)).toBe('Alumni');
    expect(advanceStage('Proposal', -1)).toBe('Proposal');
  });

  it('summarizes the pipeline by stage and type', () => {
    const s = summarizePartners([
      partner({ id: 'p1', name: 'A', type: 'Investor', stage: 'Proposal' }),
      partner({ id: 'p2', name: 'B', type: 'Media', stage: 'Negotiation' }),
      partner({ id: 'p3', name: 'C', type: 'Agency', stage: 'Active' }),
      partner({ id: 'p4', name: 'D', type: 'Media', stage: 'Alumni' }),
    ]);
    expect(s.total).toBe(4);
    expect(s.active).toBe(1);
    expect(s.perStage).toEqual({ Proposal: 1, Negotiation: 1, Active: 1, Alumni: 1 });
    expect(s.perType).toEqual({ Investor: 1, Media: 2, Agency: 1 });
  });

  it('mirrors the four seeded partners, one per stage', () => {
    expect(PARTNERS_SEED).toHaveLength(4);
    expect(new Set(PARTNERS_SEED.map((p) => p.name)).size).toBe(4);
    expect(new Set(PARTNERS_SEED.map((p) => p.stage)).size).toBe(4);
    expect(PARTNERS_SEED.every((p) => p.org_id === org)).toBe(true);
  });
});
