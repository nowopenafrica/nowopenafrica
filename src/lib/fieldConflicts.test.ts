import { describe, it, expect } from 'vitest';
import {
  recommended, recommendationReason, sourceName, isCurrentValue, blockedReason,
  conflictSummary, displayConflictValue, UNRANKED_AUTHORITY,
  type FieldConflictRow, type ConflictCandidate,
} from './fieldConflicts';

function candidate(over: Partial<ConflictCandidate> = {}): ConflictCandidate {
  return {
    evidence_id: 'e1',
    value: 'A value',
    source: 'official_website',
    source_url: 'https://example.com',
    confidence: 70,
    method: 'api',
    by_ai: false,
    authority: 20,
    observed_at: '2026-09-14T00:00:00Z',
    ...over,
  };
}

function row(over: Partial<FieldConflictRow> = {}): FieldConflictRow {
  return {
    business_id: 'b1',
    field_name: 'phone',
    business_name: 'A Business',
    current_value: null,
    evidence_count: 2,
    distinct_values: 2,
    business_claimed: false,
    candidates: [
      candidate({ evidence_id: 'e1', value: '+234 800', source: 'official_website', authority: 20, confidence: 70 }),
      candidate({ evidence_id: 'e2', value: '+234 809', source: 'wikidata', authority: 65, confidence: 99 }),
    ],
    first_seen: '2026-09-14T00:00:00Z',
    ...over,
  };
}

describe('recommended', () => {
  it('takes the first candidate, which the view has already ordered by authority', () => {
    expect(recommended(row())?.source).toBe('official_website');
  });

  it('returns null rather than undefined for an empty candidate list', () => {
    expect(recommended(row({ candidates: [] }))).toBeNull();
  });
});

describe('recommendationReason', () => {
  it('says plainly that authority beats confidence when the loser is more confident', () => {
    // This is the counter-intuitive case: wikidata reported 99 and still loses
    // to a website that reported 70. An operator not told this will assume the
    // ranking is broken.
    const reason = recommendationReason(row()) ?? '';
    expect(reason).toMatch(/higher confidence/i);
    expect(reason).toMatch(/authority beats confidence/i);
  });

  it('does not claim a confidence upset when the winner is also the more confident', () => {
    const r = row({
      candidates: [
        candidate({ evidence_id: 'e1', source: 'official_website', authority: 20, confidence: 95 }),
        candidate({ evidence_id: 'e2', source: 'wikidata', authority: 65, confidence: 40 }),
      ],
    });
    const reason = recommendationReason(r) ?? '';
    expect(reason).toMatch(/outranks/i);
    expect(reason).not.toMatch(/higher confidence/i);
  });

  it('refuses to recommend when no source is ranked for the field', () => {
    const r = row({
      candidates: [
        candidate({ evidence_id: 'e1', source: 'mystery_a', authority: UNRANKED_AUTHORITY }),
        candidate({ evidence_id: 'e2', source: 'mystery_b', authority: UNRANKED_AUTHORITY }),
      ],
    });
    const reason = recommendationReason(r) ?? '';
    expect(reason).toMatch(/no source here is ranked/i);
    expect(reason).toMatch(/decide this one on the evidence/i);
  });

  it('says the order is recency when two sources rank equally', () => {
    const r = row({
      candidates: [
        candidate({ evidence_id: 'e1', source: 'source_a', authority: 30 }),
        candidate({ evidence_id: 'e2', source: 'source_b', authority: 30 }),
      ],
    });
    expect(recommendationReason(r) ?? '').toMatch(/rank equally/i);
  });

  it('handles a single candidate without inventing a rival', () => {
    const r = row({ candidates: [candidate()] });
    expect(recommendationReason(r) ?? '').toMatch(/highest-ranked source/i);
  });

  it('is null when there is nothing to recommend', () => {
    expect(recommendationReason(row({ candidates: [] }))).toBeNull();
  });
});

describe('isCurrentValue', () => {
  it('recognises the value the business already holds', () => {
    const r = row({ current_value: '+234 809' });
    expect(isCurrentValue(r, r.candidates[1])).toBe(true);
    expect(isCurrentValue(r, r.candidates[0])).toBe(false);
  });

  it('does not treat a null current value as matching a null candidate', () => {
    // Both being absent is not agreement about anything; calling it "already
    // held" would label a real choice as a no-op.
    const r = row({ current_value: null, candidates: [candidate({ value: null })] });
    expect(isCurrentValue(r, r.candidates[0])).toBe(false);
  });
});

describe('blockedReason', () => {
  it('blocks a claimed business and explains that the database will refuse', () => {
    const reason = blockedReason(row({ business_claimed: true })) ?? '';
    expect(reason).toMatch(/claimed/i);
    expect(reason).toMatch(/refuse the write/i);
  });

  it('does not block an unclaimed business', () => {
    expect(blockedReason(row({ business_claimed: false }))).toBeNull();
  });
});

describe('conflictSummary', () => {
  it('counts distinct sources, not evidence rows', () => {
    const r = row({
      distinct_values: 2,
      candidates: [
        candidate({ evidence_id: 'e1', source: 'wikidata', value: 'X' }),
        candidate({ evidence_id: 'e2', source: 'wikidata', value: 'Y' }),
      ],
    });
    expect(conflictSummary(r)).toBe('2 different values from 1 source');
  });

  it('pluralises sources correctly', () => {
    expect(conflictSummary(row())).toBe('2 different values from 2 sources');
  });
});

describe('display helpers', () => {
  it('renders an empty value as an em dash rather than blank', () => {
    expect(displayConflictValue(null)).toBe('—');
    expect(displayConflictValue('')).toBe('—');
    expect(displayConflictValue('real')).toBe('real');
  });

  it('makes a source key readable without inventing a name for a missing one', () => {
    expect(sourceName('official_website')).toBe('official website');
    expect(sourceName(null)).toBe('an unnamed source');
  });
});
