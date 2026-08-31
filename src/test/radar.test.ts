import { describe, it, expect } from 'vitest';

import {
  sourceGate, findSource, activeSources, blockedSources,
  BUILT_IN_SOURCES, type RadarSource,
} from '../lib/radar/sources';
import {
  normalizePhone, normalizeDomain, normalizeEmail, normalizeName,
  normalizeBusiness,
} from '../lib/radar/normalize';
import { matchBusiness, findDuplicates, looksLikeBranches, nameSimilarity } from '../lib/radar/entity';
import { scoreConfidence, publishGate, isSensitiveCategory, DEFAULT_THRESHOLDS } from '../lib/radar/confidence';

const norm = (r: Record<string, unknown>) => normalizeBusiness(r)!;

/* ====================================================================== */
describe('the source gate', () => {
  /*
   * The reason this engine can exist at all. BusinessList prohibits automated
   * access, bulk extraction and use in a competing dataset — and NowOpen is a
   * competing dataset.
   */
  it('refuses BusinessList outright', () => {
    const v = sourceGate(findSource('businesslist_ng'));
    expect(v.allowed).toBe(false);
    expect(v).toMatchObject({ blockedBy: 'automatedAccess' });
  });

  it('cannot be unblocked by flipping the enabled switch', () => {
    const forced = { ...findSource('businesslist_ng')!, enabled: true };
    expect(sourceGate(forced).allowed).toBe(false);
  });

  // The realistic failure is not overriding a "no" — it is switching on a
  // source nobody read the terms of. Unknown is refused as firmly as prohibited.
  it('treats unknown rights as refusal, not as permission', () => {
    const unchecked: RadarSource = {
      key: 'x', name: 'Some directory', kind: 'licensed_directory', enabled: true,
      rights: {
        automatedAccess: 'unknown', bulkExtraction: 'unknown', competingDataset: 'unknown',
        redistribution: 'unknown', licence: null, authorisedBy: null, authorisedAt: null,
      },
    };
    const v = sourceGate(unchecked);
    expect(v.allowed).toBe(false);
    expect((v as { reason: string }).reason).toMatch(/nobody has checked/);
  });

  it('still refuses when every right is permitted but nobody signed it off', () => {
    const unsigned: RadarSource = {
      key: 'y', name: 'Partner feed', kind: 'partner_feed', enabled: true,
      rights: {
        automatedAccess: 'permitted', bulkExtraction: 'permitted', competingDataset: 'permitted',
        redistribution: 'permitted', licence: 'Signed 2026 agreement', authorisedBy: null, authorisedAt: null,
      },
    };
    expect(sourceGate(unsigned)).toMatchObject({ allowed: false, blockedBy: 'authorisedBy' });
  });

  it('allows the sources where the business supplies its own data', () => {
    expect(activeSources().map((s) => s.key)).toEqual(
      ['business_submission', 'public_suggestion', 'admin_import'],
    );
  });

  it('reports every blocked source with a reason an operator can act on', () => {
    const blocked = blockedSources();
    expect(blocked.map((b) => b.source.key)).toEqual(['businesslist_ng']);
    expect(blocked[0].reason).toMatch(/competing|automated/i);
  });
});

/* ====================================================================== */
describe('normalisation', () => {
  it('reduces Nigerian phone numbers to one form', () => {
    for (const v of ['08031234567', '+2348031234567', '234 803 123 4567', '0803-123-4567', '002348031234567']) {
      expect(normalizePhone(v)).toBe('+2348031234567');
    }
  });

  it('survives a trunk zero left after the country code', () => {
    expect(normalizePhone('23408031234567')).toBe('+2348031234567');
  });

  // A number NowOpen cannot dial is worse than none, because the score counts it.
  it('returns null rather than a number it cannot vouch for', () => {
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('not a phone')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('08031234')).toBeNull();
  });

  it('reduces websites to a registrable domain', () => {
    expect(normalizeDomain('https://www.Yemzo.com.ng/about?x=1')).toBe('yemzo.com.ng');
    expect(normalizeDomain('yemzo.com')).toBe('yemzo.com');
    expect(normalizeDomain('not a url')).toBeNull();
    expect(normalizeDomain('localhost')).toBeNull();
  });

  it('rejects an address-shaped email', () => {
    expect(normalizeEmail('Hi@Yemzo.COM')).toBe('hi@yemzo.com');
    expect(normalizeEmail('hi@yemzo')).toBeNull();
  });

  it('treats company-form words as noise so Ltd and Limited are one business', () => {
    expect(normalizeName('Yemzo Ltd')).toBe(normalizeName('Yemzo Limited'));
    expect(normalizeName('XYZ Foods Nig. Ltd')).toBe(normalizeName('X.Y.Z Foods'));
  });

  it('drops coordinates that are out of range rather than clamping them', () => {
    // A clamped coordinate is a confident lie about where a business is.
    expect(norm({ name: 'A', latitude: 999, longitude: 3 }).latitude).toBeNull();
    expect(norm({ name: 'A', latitude: 6.4, longitude: 3.4 }).latitude).toBe(6.4);
  });

  it('refuses a record with no name at all', () => {
    expect(normalizeBusiness({ name: '   ' })).toBeNull();
  });
});

/* ====================================================================== */
describe('entity resolution', () => {
  const a = norm({ name: 'XYZ Foods', city: 'Lagos', address: '24 Admiralty Way', phone: '08031234567' });

  it('matches the same business written differently', () => {
    const b = norm({ name: 'X.Y.Z. Foods Ltd', city: 'Lagos', address: '24 Admiralty Way, Lekki' });
    expect(matchBusiness(a, b).verdict).toBe('match');
  });

  it('treats a shared phone number as decisive', () => {
    const b = norm({ name: 'XYZ Food Company', city: 'Lagos', phone: '+2348031234567' });
    const r = matchBusiness(a, b);
    expect(r.verdict).toBe('match');
    expect(r.decidedBy).toBe('phone');
  });

  // A mall switchboard would otherwise merge every shop behind it.
  it('does not merge unrelated businesses that share a number', () => {
    const b = norm({ name: 'Golden Sands Hotel', city: 'Lagos', phone: '08031234567' });
    expect(matchBusiness(a, b).verdict).not.toBe('match');
  });

  it('keeps two different shops on the same street apart', () => {
    const b = norm({ name: 'Mama Put Kitchen', city: 'Lagos', address: '24 Admiralty Way' });
    expect(matchBusiness(a, b).verdict).toBe('no-match');
  });

  it('reads branches of a chain as branches, not duplicates', () => {
    const lekki = norm({ name: 'Chicken Republic Lekki', city: 'Lagos' });
    const abuja = norm({ name: 'Chicken Republic', city: 'Abuja' });
    expect(looksLikeBranches(lekki, abuja)).toBe(true);
  });

  it('scores a name contained in a longer one highly', () => {
    expect(nameSimilarity('chicken republic', 'chicken republic lekki phase 1')).toBeGreaterThan(0.85);
  });

  it('returns every possible match for a person rather than picking one', () => {
    const existing = [
      { record: 'one', normalized: norm({ name: 'XYZ Foods Lagos', city: 'Lagos' }) },
      { record: 'two', normalized: norm({ name: 'Totally Different', city: 'Kano' }) },
    ];
    const report = findDuplicates(a, existing);
    expect(report.best?.record).toBe('one');
    expect(report.possibles.every((p) => p.record !== 'two')).toBe(true);
  });
});

/* ====================================================================== */
describe('confidence', () => {
  const full = {
    name: 'XYZ Foods', category: 'Restaurant & Food', city: 'Lagos',
    address: '24 Admiralty Way', phone: '08031234567',
    website: 'https://xyzfoods.ng', email: 'hi@xyzfoods.ng',
    latitude: 6.44, longitude: 3.47,
  };

  it('scores a complete, corroborated record near the top', () => {
    const r = scoreConfidence({ normalized: norm(full), sourceCount: 3 });
    expect(r.score).toBe(100);
    expect(r.missing).toEqual([]);
  });

  it('scores a name-and-city shell low', () => {
    const r = scoreConfidence({ normalized: norm({ name: 'Blue Partners Motors', city: 'Lagos' }) });
    expect(r.score).toBeLessThan(DEFAULT_THRESHOLDS.review);
    expect(r.missing).toContain('Phone number');
  });

  it('names what is missing, so the queue can show it', () => {
    const r = scoreConfidence({ normalized: norm({ ...full, phone: null, website: null }) });
    expect(r.missing).toEqual(expect.arrayContaining(['Phone number', 'Website']));
  });

  it('caps corroboration so repeating a record cannot inflate it', () => {
    const three = scoreConfidence({ normalized: norm(full), sourceCount: 3 }).score;
    const twenty = scoreConfidence({ normalized: norm(full), sourceCount: 20 }).score;
    expect(twenty).toBe(three);
  });
});

/* ====================================================================== */
describe('the publish gate', () => {
  const permitted = findSource('business_submission')!;
  const base = { confidence: 95, mode: 'autonomous', duplicate: 'no-match', source: permitted } as const;

  it('auto-publishes a high-confidence record from a permitted source', () => {
    expect(publishGate({ ...base }).action).toBe('auto-publish');
  });

  // Rights are checked before anything else: a record from a source Radar may
  // not use should never be scored, let alone published.
  it('rejects anything from a blocked source however confident it is', () => {
    const d = publishGate({ ...base, confidence: 100, source: findSource('businesslist_ng')! });
    expect(d.action).toBe('reject');
    expect(d.reason).toMatch(/competing|automated/i);
  });

  it('never auto-publishes in manual or assisted mode', () => {
    expect(publishGate({ ...base, mode: 'manual' }).action).toBe('review');
    expect(publishGate({ ...base, mode: 'assisted' }).action).toBe('review');
  });

  /*
   * A fabricated pharmacy or lender is a different order of mistake from a
   * fabricated barber, and this is the market where that difference is
   * sharpest. No confidence and no mode gets past a person.
   */
  it('always sends health, finance and legal to a human', () => {
    for (const category of ['Health & Pharmacy', 'Finance & Banking', 'Legal Services', 'Medical Clinic']) {
      expect(isSensitiveCategory(category)).toBe(true);
      expect(publishGate({ ...base, confidence: 100, category }).action).toBe('review');
    }
    expect(isSensitiveCategory('Barbershop')).toBe(false);
  });

  it('holds an exact duplicate instead of creating a second listing', () => {
    expect(publishGate({ ...base, duplicate: 'match' }).action).toBe('hold');
  });

  it('sends a possible duplicate to a person, never merging on its own', () => {
    const d = publishGate({ ...base, duplicate: 'possible' });
    expect(d.action).toBe('review');
    expect(d.reason).toMatch(/loses owner data/i);
  });

  it('holds a record too thin to be worth reviewing', () => {
    expect(publishGate({ ...base, confidence: 30 }).action).toBe('hold');
  });

  it('reviews the band between the two thresholds', () => {
    expect(publishGate({ ...base, confidence: 70 }).action).toBe('review');
  });
});

/* ====================================================================== */
describe('the safety boundary', () => {
  /*
   * The single most important property of the engine: discovery is automatic,
   * ownership never is. Nothing in Radar returns, sets or implies an owner —
   * a business becomes claimed only through the claim flow, which a person
   * reviews.
   */
  it('has no path from a confidence score to ownership', () => {
    const decisions = [0, 49, 50, 89, 90, 100].map((confidence) =>
      publishGate({ confidence, mode: 'autonomous', duplicate: 'no-match', source: findSource('business_submission')! }).action);
    expect(decisions.every((a) => ['auto-publish', 'review', 'hold', 'reject'].includes(a))).toBe(true);
    // 'claim' and 'verify' are deliberately not in the action vocabulary.
    expect(decisions).not.toContain('claim');
    expect(decisions).not.toContain('verify');
  });

  it('ships with exactly one source registered as prohibited, on purpose', () => {
    const prohibited = BUILT_IN_SOURCES.filter((s) => s.rights.automatedAccess === 'prohibited');
    expect(prohibited.map((s) => s.key)).toEqual(['businesslist_ng']);
    expect(prohibited[0].notes).toMatch(/not a content licence/i);
  });
});
