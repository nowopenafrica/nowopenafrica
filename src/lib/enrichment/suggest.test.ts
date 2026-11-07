import { describe, it, expect } from 'vitest';
import {
  suggestForBusiness, isEligible, describeRun, buildOverview, ENRICHMENT_VERSION,
  type EnrichableBusiness,
} from './suggest';

const NOW = '2026-09-14T12:00:00.000Z';

const biz = (over: Partial<EnrichableBusiness> = {}): EnrichableBusiness => ({
  id: 'b1', name: 'Lagos Flavours', category: 'Restaurant', claim_status: 'unclaimed', ...over,
});

describe('isEligible', () => {
  it('accepts an unclaimed business with a category', () => {
    expect(isEligible(biz()).ok).toBe(true);
  });

  it('refuses a CLAIMED business', () => {
    /*
     * The rule that matters most. Once a real person answers for the page,
     * proposing services they never mentioned is putting words in their mouth.
     */
    const r = isEligible(biz({ claim_status: 'claimed' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/owner writes its content/i);
  });

  it('refuses a business with no category or no name', () => {
    expect(isEligible(biz({ category: '' })).ok).toBe(false);
    expect(isEligible(biz({ name: '  ' })).ok).toBe(false);
  });
});

describe('suggestForBusiness', () => {
  it('produces services and offerings from the category vocabulary', () => {
    const r = suggestForBusiness(biz(), NOW);
    expect(r.industry).toBe('restaurants');
    expect(r.services.length).toBeGreaterThan(4);
    expect(r.products.length).toBeGreaterThan(4);
    expect(r.services.map((s) => s.name)).toContain('Dine-in');
  });

  it('marks everything suggested, unconfirmed and UNPUBLISHED', () => {
    // The public RLS policy refuses `suggested` outright, so a bad run is
    // invisible rather than embarrassing.
    for (const row of suggestForBusiness(biz(), NOW).services) {
      expect(row.content_status).toBe('suggested');
      expect(row.published).toBe(false);
      expect(row.requires_confirmation).toBe(true);
      expect(row.source_type).toBe('category_template');
      expect(row.enrichment_version).toBe(ENRICHMENT_VERSION);
      expect(row.generated_at).toBe(NOW);
    }
  });

  it('never invents a price, an availability or a description', () => {
    for (const row of suggestForBusiness(biz(), NOW).services) {
      expect(row.description).toBeNull();
      expect(row).not.toHaveProperty('price');
      expect(row).not.toHaveProperty('stock_quantity');
    }
  });

  it('produces NOTHING for a category with no template', () => {
    const r = suggestForBusiness(biz({ category: 'Interdimensional Plumbing' }), NOW);
    expect(r.services).toEqual([]);
    expect(r.products).toEqual([]);
    expect(r.skipped).toMatch(/no template/i);
  });

  it('produces nothing for a claimed business', () => {
    const r = suggestForBusiness(biz({ claim_status: 'claimed' }), NOW);
    expect(r.services).toEqual([]);
    expect(r.skipped).toMatch(/claimed/i);
  });

  it('suppresses anything the profile already has, rather than duplicating it', () => {
    const r = suggestForBusiness(
      biz({ existingServices: [{ name: 'dine in' }, { name: 'Takeaway' }] }), NOW);
    const names = r.services.map((s) => s.name.toLowerCase());
    expect(names).not.toContain('dine-in');
    expect(names).not.toContain('takeaway');
    expect(r.duplicates.length).toBe(2);
  });

  it('matches an existing entry loosely, so punctuation does not defeat it', () => {
    const r = suggestForBusiness(biz({ existingServices: [{ name: 'DINE  IN!' }] }), NOW);
    expect(r.services.map((s) => s.name)).not.toContain('Dine-in');
  });

  it('never proposes more than ten of a kind', () => {
    const r = suggestForBusiness(biz(), NOW);
    expect(r.services.length).toBeLessThanOrEqual(10);
    expect(r.products.length).toBeLessThanOrEqual(10);
  });

  it('suggests no products for a hospital, which sells none', () => {
    const r = suggestForBusiness(biz({ category: 'Hospital & Clinic' }), NOW);
    expect(r.industry).toBe('hospitals');
    expect(r.products).toEqual([]);
    expect(r.services.length).toBeGreaterThan(0);
  });

  it('works on the imported category names the directory actually uses', () => {
    // MEASURED: 533 listings carry "Schools & Training", a name the app's own
    // category list never defined. The alias layer is what makes them reachable.
    const r = suggestForBusiness(biz({ category: 'Schools & Training' }), NOW);
    expect(r.industry).toBe('schools');
    expect(r.services.length).toBeGreaterThan(0);
  });

  it('reports what it blocked instead of filtering silently', () => {
    /*
     * A template that starts producing forbidden claims must be visible. Silent
     * filtering would show an empty result and hide the cause.
     */
    const r = suggestForBusiness(biz(), NOW);
    expect(Array.isArray(r.blocked)).toBe(true);
    // The restaurant template is clean today; the channel must still exist.
    expect(r.blocked).toEqual([]);
  });

  it('carries only FAQs that defer to the business', () => {
    const r = suggestForBusiness(biz(), NOW);
    expect(r.faqs.length).toBeGreaterThan(0);
    for (const f of r.faqs) {
      expect(/contact|ask the|use the contact/i.test(f.answer)).toBe(true);
    }
  });

  it('attaches every row to the right business', () => {
    const r = suggestForBusiness(biz({ id: 'b-42' }), NOW);
    for (const row of [...r.services, ...r.products]) {
      expect(row.business_id).toBe('b-42');
    }
  });

  it('is deterministic — the same input twice gives the same output', () => {
    expect(suggestForBusiness(biz(), NOW)).toEqual(suggestForBusiness(biz(), NOW));
  });
});

describe('describeRun', () => {
  it('says what happened and that nothing is live', () => {
    const line = describeRun(suggestForBusiness(biz(), NOW));
    expect(line).toMatch(/unpublished, awaiting review/i);
  });

  it('gives the reason when nothing was produced', () => {
    expect(describeRun(suggestForBusiness(biz({ claim_status: 'claimed' }), NOW)))
      .toMatch(/claimed/i);
  });
});

describe('buildOverview', () => {
  it('restates what is known and claims nothing else', () => {
    const text = buildOverview({ ...biz(), location: 'Lagos' }) ?? '';
    expect(text).toContain('Lagos Flavours');
    expect(text).toContain('Lagos');
    expect(text).toMatch(/not yet been confirmed/i);
  });

  it('never implies history, size or quality', () => {
    const text = buildOverview({ ...biz(), location: 'Lagos' }) ?? '';
    for (const word of ['leading', 'award', 'years', 'trusted', 'best', 'premier', 'established']) {
      expect(text.toLowerCase()).not.toContain(word);
    }
  });

  it('uses the right article for the category', () => {
    // "a hospital & clinic" but "an optician".
    expect(buildOverview({ ...biz(), category: 'Optician' })).toMatch(/is an optician/i);
    expect(buildOverview({ ...biz(), category: 'Restaurant' })).toMatch(/is a restaurant/i);
  });

  it('does not append "business" to a category that is already a noun', () => {
    expect(buildOverview({ ...biz(), category: 'Hospital & Clinic' }))
      .not.toMatch(/clinic business/i);
  });

  it('omits the location cleanly when there is none', () => {
    const text = buildOverview(biz()) ?? '';
    expect(text).not.toMatch(/\bin\s+\./);
    expect(text).not.toMatch(/undefined|null/);
  });

  it('returns null rather than a sentence built from one field', () => {
    expect(buildOverview({ ...biz(), category: '' })).toBeNull();
    expect(buildOverview({ ...biz(), name: '' })).toBeNull();
  });
});
