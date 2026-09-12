import { describe, it, expect } from 'vitest';

import {
  sourcePermits, assertSourcePermits, ADAPTERS, REQUIRED_CONFIGURATION,
  guardedFetchUrl, type SourcePolicy,
} from './adapter';
import {
  scoreCandidate, bandFor, weakestParts, DEFAULT_WEIGHTS, type ScoreInput,
} from './qualityScore';
import type { RawCandidate } from './adapter';

/**
 * AutoAcquire §6 and §13.
 *
 * The adapter contract exists with no adapters behind it, and the rights gate
 * is the reason it can. Measured on production 2026-09-08: `radar_sources`
 * holds four rows, three of them inbound (an admin uploading, an owner
 * submitting, a customer suggesting — none of which discovers anything), and
 * the fourth is the only external directory on record:
 *
 *   businesslist_ng   active FALSE · automated_access prohibited
 *                     bulk_extraction prohibited · redistribution prohibited
 *                     licence None · authorised_by None
 *
 * So there is nothing NowOpen is permitted to discover from, and §0/§6/§29
 * forbid inventing one.
 */

const permitted: SourcePolicy = {
  key: 'partner_api',
  name: 'A Licensed Partner',
  active: true,
  automatedAccess: 'permitted',
  bulkExtraction: 'permitted',
  redistribution: 'permitted',
  competingDataset: 'permitted',
  licence: 'Signed agreement 2026-09',
  authorisedBy: 'NowOpen Africa',
};

/** The real row, as it stands in production. */
const businesslistNg: SourcePolicy = {
  key: 'businesslist_ng',
  name: 'BusinessList.com.ng',
  active: false,
  automatedAccess: 'prohibited',
  bulkExtraction: 'prohibited',
  redistribution: 'prohibited',
  competingDataset: 'prohibited',
  licence: null,
  authorisedBy: null,
};

describe('an adapter cannot authorise itself', () => {
  it('permits a properly licensed source', () => {
    for (const op of ['discover', 'fetch', 'bulk', 'publish'] as const) {
      expect(sourcePermits(permitted, op).permitted, op).toBe(true);
    }
  });

  it('refuses the real prohibited source, for every operation', () => {
    /*
     * The row that makes this file necessary. Its terms forbid bots, crawlers,
     * bulk extraction and use in a competing dataset — and it is on record
     * that way precisely so nobody re-decides it from memory.
     */
    for (const op of ['discover', 'fetch', 'bulk', 'publish'] as const) {
      const v = sourcePermits(businesslistNg, op);
      expect(v.permitted, op).toBe(false);
      expect(v.reason).toMatch(/not active|does not permit|authorised/i);
    }
  });

  it('refuses a source nobody has authorised, even when every flag says permitted', () => {
    /*
     * The difference between "we believe this is allowed" and "a named person
     * decided it is". Without this, a row created by a well-meaning script
     * with permissive defaults becomes a licence.
     */
    const v = sourcePermits({ ...permitted, authorisedBy: null }, 'discover');
    expect(v.permitted).toBe(false);
    expect(v.reason).toMatch(/Nobody has authorised/);
  });

  it('treats a blank authoriser as no authoriser', () => {
    expect(sourcePermits({ ...permitted, authorisedBy: '   ' }, 'fetch').permitted).toBe(false);
  });

  it('refuses an inactive source however permissive its licence', () => {
    expect(sourcePermits({ ...permitted, active: false }, 'discover').permitted).toBe(false);
  });

  it('treats UNKNOWN as a refusal, not as probably-fine', () => {
    /*
     * The whole design in one assertion. A source whose licence nobody has
     * recorded is a source nobody has cleared. Refusing wrongly costs a
     * config change; permitting wrongly costs a legal letter.
     */
    const v = sourcePermits({ ...permitted, bulkExtraction: 'unknown' }, 'bulk');
    expect(v.permitted).toBe(false);
    expect(v.reason).toMatch(/Nothing has recorded that it is allowed/);
  });

  it('separates the operations, so fetching one page is not bulk extraction', () => {
    // A source may allow a lookup and forbid taking the database.
    const p = { ...permitted, bulkExtraction: 'prohibited' };
    expect(sourcePermits(p, 'fetch').permitted).toBe(true);
    expect(sourcePermits(p, 'bulk').permitted).toBe(false);
  });

  it('forbids publishing into a competing dataset where the source says so', () => {
    // A directory republishing a directory is what those terms exist to stop.
    const p = { ...permitted, competingDataset: 'prohibited' };
    expect(sourcePermits(p, 'fetch').permitted).toBe(true);
    expect(sourcePermits(p, 'publish').permitted).toBe(false);
  });

  it('throws with the reason, for call sites that cannot continue', () => {
    expect(() => assertSourcePermits(businesslistNg, 'discover')).toThrow(/Refused:/);
    expect(() => assertSourcePermits(permitted, 'discover')).not.toThrow();
  });
});

describe('the registry is empty, and says why', () => {
  it('registers no adapters', () => {
    /*
     * Not an oversight. It becomes non-empty the day a radar_sources row
     * exists with automated_access permitted and a named authorised_by — a
     * signed agreement, a licensed dataset or an authorized API. That is a
     * legal precondition, not an engineering task.
     */
    expect(ADAPTERS).toHaveLength(0);
  });

  it('documents the credentials a future adapter needs, without faking them', () => {
    // §54: document the configuration, do not pretend it works.
    /*
     * Reworded on 2026-09-08, when Wikidata became the first authorised
     * source. The registry is still empty, but the REASON changed: it is no
     * longer "nothing is authorised", it is "the authorised one does not need
     * this interface" — it answers structured JSON on one endpoint rather
     * than needing fetch-and-scrape. The note has to say which.
     */
    expect(REQUIRED_CONFIGURATION.note).toMatch(/no in-process adapter is registered/i);
    expect(REQUIRED_CONFIGURATION.note).toMatch(/wikidata/i);
    expect(REQUIRED_CONFIGURATION.note).toMatch(/none is set/i);
    expect(REQUIRED_CONFIGURATION.perAdapter.length).toBeGreaterThan(0);
    for (const a of REQUIRED_CONFIGURATION.perAdapter) {
      expect(a.alsoRequired).toMatch(/radar_sources/);
    }
  });

  it('hands adapter authors the SSRF guard', () => {
    /*
     * The single most likely omission in a new adapter is the check that
     * stops a source listing becoming server-side request forgery, so it is
     * re-exported where an author will find it.
     */
    expect(guardedFetchUrl('http://169.254.169.254/').safe).toBe(false);
    expect(guardedFetchUrl('https://example.com/').safe).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────

function candidate(over: Partial<RawCandidate> = {}): RawCandidate {
  return {
    sourceRecordId: 'r1',
    sourceUrl: 'https://zanzibarcoffee.ng',
    name: 'Zanzibar Coffee',
    category: 'Café & Bakery',
    city: 'Lagos',
    address: '12 Admiralty Way',
    phone: '+2348030000001',
    website: 'https://zanzibarcoffee.ng',
    description: 'Speciality coffee roaster.',
    evidence: {
      name: { method: 'structured_data', sourceUrl: 'https://zanzibarcoffee.ng', confidence: 95 },
      category: { method: 'structured_data', sourceUrl: 'https://zanzibarcoffee.ng', confidence: 90 },
      city: { method: 'dom_extraction', sourceUrl: 'https://zanzibarcoffee.ng', confidence: 85 },
      address: { method: 'dom_extraction', sourceUrl: 'https://zanzibarcoffee.ng', confidence: 85 },
      phone: { method: 'structured_data', sourceUrl: 'https://zanzibarcoffee.ng', confidence: 95 },
      website: { method: 'api', sourceUrl: 'https://zanzibarcoffee.ng', confidence: 100 },
    },
    ...over,
  };
}

const score = (i: Partial<ScoreInput> = {}) =>
  scoreCandidate({ candidate: candidate(), sourceAccuracy: 0.9, duplicateConfidence: 0.95, ...i });

describe('the quality score is deterministic and explainable', () => {
  it('sums its weights to exactly 100', () => {
    /*
     * A scoring function whose weights sum to 95 reports a maximum of 95 and
     * nobody notices for months.
     */
    const total = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it('gives the same answer twice', () => {
    expect(score().score).toBe(score().score);
  });

  it('scores a well-sourced candidate highly', () => {
    const b = score();
    expect(b.score).toBeGreaterThanOrEqual(85);
    expect(['EXCELLENT', 'EXCEPTIONAL']).toContain(b.band);
  });

  it('explains every component, including the ones that scored nothing', () => {
    // A review queue needs to say WHICH part is weak, not just show a number.
    const b = scoreCandidate({ candidate: candidate({ phone: null, email: null }) });
    const contact = b.parts.find((p) => p.key === 'contact')!;
    expect(contact.earned).toBe(0);
    expect(contact.why).toMatch(/unreachable/i);
  });

  it('bands at the documented boundaries', () => {
    expect(bandFor(95)).toBe('EXCEPTIONAL');
    expect(bandFor(94)).toBe('EXCELLENT');
    expect(bandFor(85)).toBe('EXCELLENT');
    expect(bandFor(84)).toBe('GOOD');
    expect(bandFor(70)).toBe('GOOD');
    expect(bandFor(69)).toBe('FAIR');
    expect(bandFor(50)).toBe('FAIR');
    expect(bandFor(49)).toBe('LOW');
  });
});

describe('an AI guess earns nothing — §10', () => {
  it('scores an ai_inferred field at zero', () => {
    /*
     * The most important assertion here. If a guess earned partial credit, a
     * model that confidently filled every field would outrank a sparse
     * candidate whose three fields came from the business's own website — and
     * the publishing gate would prefer the invention.
     */
    const inferred = candidate({
      evidence: {
        name: { method: 'ai_inferred', sourceUrl: 'https://x', confidence: 99 },
        phone: { method: 'ai_inferred', sourceUrl: 'https://x', confidence: 99 },
        category: { method: 'ai_inferred', sourceUrl: 'https://x', confidence: 99 },
        city: { method: 'ai_inferred', sourceUrl: 'https://x', confidence: 99 },
        address: { method: 'ai_inferred', sourceUrl: 'https://x', confidence: 99 },
        website: { method: 'ai_inferred', sourceUrl: 'https://x', confidence: 99 },
      },
    });
    const b = scoreCandidate({ candidate: inferred, sourceAccuracy: 1, duplicateConfidence: 1 });
    for (const key of ['identity', 'location', 'category', 'contact', 'digital'] as const) {
      expect(b.parts.find((p) => p.key === key)!.earned, key).toBe(0);
    }
  });

  it('ranks a sparse sourced candidate above a complete invented one', () => {
    const sourcedSparse = scoreCandidate({
      candidate: candidate({ description: null, address: null, city: 'Lagos' }),
      sourceAccuracy: 0.9,
      duplicateConfidence: 0.9,
    });
    const inventedComplete = scoreCandidate({
      candidate: candidate({
        evidence: Object.fromEntries(
          ['name', 'category', 'city', 'address', 'phone', 'website'].map((f) => [
            f, { method: 'ai_inferred' as const, sourceUrl: 'https://x', confidence: 100 },
          ]),
        ),
      }),
      sourceAccuracy: 0.9,
      duplicateConfidence: 0.9,
    });
    expect(sourcedSparse.score).toBeGreaterThan(inventedComplete.score);
  });

  it('discounts ai_extracted rather than refusing it', () => {
    // A model that read a real page did something; nothing checked that it
    // read it correctly.
    const b = scoreCandidate({
      candidate: candidate({
        evidence: { name: { method: 'ai_extracted', sourceUrl: 'https://x', confidence: 90 } },
      }),
    });
    const identity = b.parts.find((p) => p.key === 'identity')!;
    expect(identity.earned).toBeGreaterThan(0);
    expect(identity.earned).toBeLessThan(identity.possible);
  });
});

describe('unknown scores nothing, never an assumed average', () => {
  it('gives a source with no track record zero for confidence', () => {
    const b = scoreCandidate({ candidate: candidate(), duplicateConfidence: 1 });
    const part = b.parts.find((p) => p.key === 'sourceConfidence')!;
    expect(part.earned).toBe(0);
    expect(part.why).toMatch(/earned nothing/);
  });

  it('gives an unrun duplicate check zero', () => {
    // An unchecked candidate is not a confirmed original.
    const b = scoreCandidate({ candidate: candidate(), sourceAccuracy: 1 });
    const part = b.parts.find((p) => p.key === 'duplicateConfidence')!;
    expect(part.earned).toBe(0);
    expect(part.why).toMatch(/not run/);
  });

  it('does not grade out of what happens to be present', () => {
    /*
     * A candidate with almost nothing must score low, not score 100% of the
     * little it has. Grading out of present fields is how an empty record
     * reaches a perfect mark.
     */
    const bare = scoreCandidate({
      candidate: {
        sourceRecordId: 'r', sourceUrl: 'https://x', name: 'A Shop', evidence: {},
      },
    });
    expect(bare.score).toBeLessThan(20);
    expect(bare.band).toBe('LOW');
  });
});

describe('the review queue can see what is weak', () => {
  it('lists the weakest components first', () => {
    const b = scoreCandidate({ candidate: candidate({ phone: null, email: null, website: null }) });
    const weak = weakestParts(b, 3).map((p) => p.key);
    expect(weak).toContain('contact');
    expect(weak).toContain('digital');
  });
});
