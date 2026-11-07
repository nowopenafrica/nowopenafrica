/**
 * The signals that decide which candidates get read.
 *
 * These exist because two review stages have a 100% pass rate between them.
 * So the assertions that matter are the ones about NOT crying wolf: a signal
 * that fires on everything restores exactly the situation it was built to
 * fix, with extra noise.
 */

import { describe, it, expect } from 'vitest';

import { riskSignals, needsCloserLook, type RiskInput } from './reviewRisk';

const candidate = (over: Partial<RiskInput> = {}): RiskInput => ({
  name: 'Ada Fabrics',
  category: 'Retail',
  phone: '+2348012345678',
  email: null,
  website: null,
  confidence: 80,
  ...over,
});

const codes = (c: RiskInput) => riskSignals(c).map((s) => s.code);

describe('a healthy candidate is left alone', () => {
  it('raises nothing for a contactable, confident business', () => {
    expect(riskSignals(candidate())).toEqual([]);
    expect(needsCloserLook(candidate())).toBe(false);
  });

  it('counts any one contact method as reachable', () => {
    for (const over of [
      { phone: '+2348012345678' },
      { phone: null, email: 'hello@ada.ng' },
      { phone: null, website: 'https://ada.ng' },
      { phone: null, whatsapp: '+2348012345678' },
    ]) {
      expect(codes(candidate(over)), JSON.stringify(over)).not.toContain('no_contact');
    }
  });
});

describe('the signal that matters most', () => {
  it('flags a listing nobody could ever be invited to claim', () => {
    /*
     * The whole purpose of the directory is that an owner takes control. A
     * record with no phone, email or website can never be told it exists, so
     * publishing it adds a page nobody owns and nobody can be contacted about.
     */
    const c = candidate({ phone: null, email: null, website: null });
    expect(codes(c)).toContain('no_contact');
    expect(riskSignals(c)[0].label).toMatch(/invited to claim/);
  });
});

describe('institutions are flagged, not condemned', () => {
  it('flags the categories that have never produced a claim', () => {
    // 1,769 hospitals and 829 schools, zero claims between them.
    for (const category of ['Hospital & Clinic', 'Schools & Training', 'Library & Archive']) {
      expect(codes(candidate({ category })), category).toContain('institutional');
    }
  });

  it('says what was observed rather than what to conclude', () => {
    const [signal] = riskSignals(candidate({ category: 'Hospital & Clinic' }));
    expect(signal.label).toMatch(/rarely claim/);
    expect(signal.label).not.toMatch(/reject|delete|bad/i);
  });

  it('leaves ordinary trades alone', () => {
    for (const category of ['Restaurant', 'Retail', 'Beauty & Wellness', 'Café & Bakery']) {
      expect(codes(candidate({ category })), category).not.toContain('institutional');
    }
  });
});

describe('a place is not a business — but only when it is also unreachable', () => {
  it('flags the landmark case actually found in the data', () => {
    // "IBM Building, Johannesburg" was a real row headed for publication.
    const c = candidate({ name: 'IBM Building, Johannesburg', phone: null, email: null, website: null });
    expect(codes(c)).toContain('place_not_business');
  });

  it('does NOT flag a real business whose name contains a place word', () => {
    /*
     * The rule that would do real damage. Park Inn, Bridge House Bakery and
     * Tower Pharmacy are businesses; the word alone proves nothing, which is
     * why it only counts alongside having no contact at all.
     */
    for (const name of ['Bridge House Bakery', 'Tower Pharmacy', 'Stadium Sports Bar']) {
      expect(codes(candidate({ name })), name).not.toContain('place_not_business');
    }
  });
});

describe('confidence and duplicates', () => {
  it('flags confidence below the review threshold', () => {
    expect(codes(candidate({ confidence: 20 }))).toContain('low_confidence');
    expect(codes(candidate({ confidence: 80 }))).not.toContain('low_confidence');
  });

  it('respects a caller-supplied threshold', () => {
    expect(riskSignals(candidate({ confidence: 60 }), 70).map((s) => s.code)).toContain('low_confidence');
  });

  it('flags a probable duplicate', () => {
    expect(codes(candidate({ duplicateOf: 'abc' }))).toContain('possible_duplicate');
  });
});

describe('unknown is not the same as absent', () => {
  it('does not claim "no evidence" when the count was never loaded', () => {
    /*
     * The mistake this codebase keeps making in other places: treating a
     * value nobody fetched as a value that is zero. An absent count means
     * unknown, and unknown is not a finding.
     */
    expect(codes(candidate({ evidenceCount: undefined }))).not.toContain('no_evidence');
    expect(codes(candidate({ evidenceCount: null }))).not.toContain('no_evidence');
    expect(codes(candidate({ evidenceCount: 0 }))).toContain('no_evidence');
  });
});

describe('it does not cry wolf', () => {
  it('stays silent on the ordinary case so the flagged ones stand out', () => {
    /*
     * A signal that fires on everything recreates the flat list of thousands
     * that caused the 100% pass rate, with extra noise on top.
     */
    const ordinary = [
      candidate(),
      candidate({ category: 'Restaurant', phone: '+2348011111111' }),
      candidate({ category: 'Retail', website: 'https://shop.ng', phone: null }),
      candidate({ name: 'Bridge House Bakery', phone: '+2348022222222' }),
    ];
    expect(ordinary.filter((c) => needsCloserLook(c))).toHaveLength(0);
  });
});

describe('a cohort is not an alarm', () => {
  it('shows an institutional category WITHOUT summoning a reviewer to it', () => {
    /*
     * Measured 2026-10-09 and it changed the design: flagging every
     * institutional category raised 2,733 of 4,517 candidates. A queue where
     * 79% is flagged is the flat list of thousands again. "This is a
     * hospital" is a decision about the Wikidata import, taken once — not
     * something to re-decide 2,733 times.
     *
     * Excluding cohort signals the queue falls to 1,066 (23.6%), each a
     * per-row fact somebody can act on.
     */
    const hospital = candidate({ category: 'Hospital & Clinic' });
    expect(codes(hospital)).toContain('institutional');
    expect(needsCloserLook(hospital), 'a cohort signal must not fill the queue').toBe(false);
  });

  it('still summons when the row has a per-row problem too', () => {
    const unreachableHospital = candidate({
      category: 'Hospital & Clinic', phone: null, email: null, website: null,
    });
    expect(needsCloserLook(unreachableHospital)).toBe(true);
  });

  it('marks every signal with a severity', () => {
    const noisy = candidate({
      category: 'Hospital & Clinic', phone: null, email: null, website: null,
      confidence: 10, duplicateOf: 'x', evidenceCount: 0,
    });
    const signals = riskSignals(noisy);
    expect(signals.length).toBeGreaterThan(3);
    for (const s of signals) expect(['look', 'context']).toContain(s.severity);
    expect(signals.filter((s) => s.severity === 'context').map((s) => s.code)).toEqual(['institutional']);
  });
});
