import { describe, it, expect } from 'vitest';
import { scoreCandidate, bandFor, DEFAULT_WEIGHTS } from './quality';
import type { RawCandidate } from './types';

/**
 * A valid RawCandidate needs evidence per field — the whole point of §8. The
 * helpers here build a fully-sourced candidate and then take bits away, so the
 * tests show what each missing/factory part is worth.
 */
const full: RawCandidate = {
  sourceRecordId: 'Q1',
  sourceUrl: 'https://www.wikidata.org/wiki/Q1',
  name: 'Yemzo Foods',
  category: 'Restaurant',
  city: 'Lagos',
  address: '12 Admiralty Way',
  phone: '+2348030000001',
  email: 'hello@yemzo.ng',
  website: 'https://yemzo.ng',
  description: 'Jollof and more.',
  evidence: {
    name: { method: 'api', sourceUrl: 'u', confidence: 80 },
    category: { method: 'api', sourceUrl: 'u', confidence: 80 },
    city: { method: 'api', sourceUrl: 'u', confidence: 80 },
    address: { method: 'api', sourceUrl: 'u', confidence: 80 },
    phone: { method: 'api', sourceUrl: 'u', confidence: 80 },
    email: { method: 'api', sourceUrl: 'u', confidence: 80 },
    website: { method: 'api', sourceUrl: 'u', confidence: 80 },
    description: { method: 'api', sourceUrl: 'u', confidence: 80 },
  },
};

const without = (pick: Partial<RawCandidate>, drop: Array<keyof RawCandidate>) => {
  const c: RawCandidate = { ...full, ...pick };
  for (const d of drop) delete c[d];
  return c;
};

describe('scoreCandidate', () => {
  it('scores a fully-formed api record in the EXCELLENT band (duplicate pending)', () => {
    const s = scoreCandidate({ candidate: full, sourceAccuracy: 0.8 });
    expect(s.score).toBeGreaterThanOrEqual(80);
    expect(s.score).toBeLessThan(95); // duplicate never confirmed at discovery
    expect(s.band).toBe('EXCELLENT');
    expect(s.parts.find((p) => p.key === 'duplicateConfidence')?.earned).toBe(0);
  });

  it('punishes an unreachable record through the contact component', () => {
    const s = scoreCandidate({ candidate: without(full, ['phone', 'email']), sourceAccuracy: 0.8 });
    const contact = s.parts.find((p) => p.key === 'contact')!;
    expect(contact.earned).toBe(0);
  });

  it('scores an unexplained-but-present field at 30% rather than full trust', () => {
    const noEvidence: RawCandidate = {
      ...without(full, ['address']),
      address: '12 Admiralty Way',
      evidence: { ...full.evidence },
    };
    delete noEvidence.evidence.address;
    const s = scoreCandidate({ candidate: noEvidence, sourceAccuracy: 0.8 });
    const loc = s.parts.find((p) => p.key === 'location')!;
    // sourced: api * (0.5 + 0.5*0.8) = 0.9 for the city; address unproven = 0.3
    // max(0.9, 0.3) * 1 (address > 0) → 0.9, so location is the city's full value.
    expect(loc.earned).toBeCloseTo(20 * 0.9, 1);
  });

  it('a source with no accuracy record earns nothing there (never an assumed average)', () => {
    const s = scoreCandidate({ candidate: full });
    expect(s.parts.find((p) => p.key === 'sourceConfidence')?.earned).toBe(0);
  });

  it('gives ZERO weight to a model guess', () => {
    // The only reachable contact is a model guess — §10: no page support, not
    // evidence. The candidate must score as if it had no contact at all.
    const aiGuess: RawCandidate = {
      ...full,
      phone: null,
      email: 'guess@madeup.example',
      evidence: {
        ...full.evidence,
        phone: { method: 'api', sourceUrl: 'u', confidence: 80 },
        email: { method: 'ai_inferred', sourceUrl: 'u', confidence: 0 },
      },
    };
    const s = scoreCandidate({ candidate: aiGuess, sourceAccuracy: 0.8 });
    const contact = s.parts.find((p) => p.key === 'contact')!;
    expect(contact.earned).toBe(0);
  });

  it('bands map onto the threshold words the review queue uses', () => {
    expect(bandFor(95)).toBe('EXCEPTIONAL');
    expect(bandFor(85)).toBe('EXCELLENT');
    expect(bandFor(50)).toBe('FAIR');
    expect(bandFor(10)).toBe('LOW');
  });

  it('weights sum to 100 (a silent sum of 95 would cap every candidate)', () => {
    const total = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });
});