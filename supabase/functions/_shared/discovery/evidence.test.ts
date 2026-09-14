import { describe, it, expect } from 'vitest';
import { evidenceFor } from './evidence';

const base = {
  sourceRecordId: 'x1',
  sourceUrl: 'https://src.example/x1',
  name: 'Suya Spot',
  phone: '+2348012345678',
  category: null,
  evidence: {
    name: { method: 'api' as const, sourceUrl: 'https://src.example/x1', confidence: 90 },
    phone: { method: 'structured_data' as const, sourceUrl: 'https://src.example/x1', confidence: 85 },
    category: { method: 'ai_inferred' as const, sourceUrl: '', confidence: 40 },
  },
};

describe('evidenceFor', () => {
  it('lifts each populated, evidenced field into a row', () => {
    const rows = evidenceFor(base, 'wikidata');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      evidence_field: 'name',
      field_value: 'Suya Spot',
      source_key: 'wikidata',
      method: 'api',
      source_url: 'https://src.example/x1',
      confidence: 90,
      owner_confirmed: false,
      can_auto_update: true,
    });
    expect(rows[1]).toMatchObject({ evidence_field: 'phone', method: 'structured_data', confidence: 85 });
  });

  it('drops fields with evidence but no concrete value (the source lied)', () => {
    // category is evidence-marked but null — it must never become a claim with
    // a guess in field_value: no value, no row.
    expect(evidenceFor(base, 'wikidata').some((r) => r.evidence_field === 'category')).toBe(false);
  });

  it('marks inferred/extracted values as not auto-updatable', () => {
    const c = {
      ...base,
      city: 'Lagos',
      evidence: { ...base.evidence, city: { method: 'ai_extracted' as const, sourceUrl: '', confidence: 55 } },
    };
    const rows = evidenceFor(c, 'openstreetmap');
    expect(rows.find((r) => r.evidence_field === 'city')).toMatchObject({
      method: 'ai_extracted',
      confidence: 55,
      can_auto_update: false,
    });
    expect(rows.find((r) => r.evidence_field === 'name')?.can_auto_update).toBe(true);
  });

  it('clamps confidence into 0-100 and falls back to the candidate URL', () => {
    const c = {
      ...base,
      website: 'https://b.ng',
      evidence: {
        ...base.evidence,
        website: { method: 'api' as const, sourceUrl: '', confidence: 130 },
      },
    };
    const rows = evidenceFor(c, 'wikidata');
    const w = rows.find((r) => r.evidence_field === 'website');
    expect(w?.confidence).toBe(100);
    expect(w?.source_url).toBe('https://src.example/x1');
  });
});