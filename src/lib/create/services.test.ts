import { describe, it, expect } from 'vitest';

import { rankServices, refused, words, type Service } from './services';

const service = (over: Partial<Service> & Pick<Service, 'sku' | 'name'>): Service => ({
  id: over.sku, slug: over.sku, short_description: null, category_id: 'c',
  deliverable_type: 'digital', fulfilment: 'creator', pricing_model: 'starting_at',
  currency: 'NGN', price_minor: 750000, price_unit: null, price_basis: 'proposed',
  price_includes: [], exclusions: [], turnaround_min_days: 2, turnaround_max_days: 4,
  revisions_included: null, editable_source_included: false, available_formats: [],
  template_tags: [], production_required: false, quote_required: false,
  is_orderable: false, featured: false, sort_order: 0,
  ...over,
});

/*
 * The names here are the real seeded ones, because the trap this ranking has
 * to avoid is caused by them: "business card", "business card artwork",
 * "company profile", "business proposal" and "business profile document" all
 * contain the word a customer types.
 */
const CATALOGUE: Service[] = [
  service({ sku: 'ds-business-card', name: 'Business card design', sort_order: 60 }),
  service({ sku: 'pk-card-artwork', name: 'Business card artwork', sort_order: 10 }),
  service({ sku: 'bd-profile-8', name: 'Company profile, up to 8 pages', sort_order: 10 }),
  service({ sku: 'bd-proposal', name: 'Business proposal layout', sort_order: 50 }),
  service({ sku: 'ds-flyer', name: 'Promotional flyer', sort_order: 20 }),
  service({ sku: 'ds-menu', name: 'Restaurant menu design', sort_order: 100 }),
  service({ sku: 'vm-short-30', name: 'Basic short-form edit, up to 30 seconds', sort_order: 10 }),
];

const SYNONYMS = new Map<string, string[]>([
  ['ds-business-card', ['visiting card', 'complimentary card', 'contact card']],
  ['ds-menu', ['food menu', 'restaurant menu']],
  ['bd-profile-8', ['corporate profile', 'business profile document']],
  ['vm-short-30', ['reel', 'tiktok video', 'youtube short']],
]);

const rank = (q: string) => rankServices(q, CATALOGUE, SYNONYMS);

describe('searching the way a customer types', () => {
  /*
   * ── THE BRIEF'S OWN ACCEPTANCE TEST ──────────────────────────────────
   * "type 'I need a business card,' and verify that the system returns a
   * relevant, diverse collection of actual business-card templates — not the
   * existing general gallery with a new title."
   */
  it('puts business cards first for "I need a business card"', () => {
    const top = rank('I need a business card');
    expect(top[0].sku).toBe('ds-business-card');
    expect(top.slice(0, 2).map((s) => s.sku)).toContain('pk-card-artwork');
  });

  /*
   * The failure this exists to prevent: "business" matches a business
   * proposal and a business profile just as well as a business card, and a
   * naive keyword score ranks by whatever happens to sort first.
   */
  it('does not let the word "business" drag in proposals and profiles', () => {
    const top = rank('business card');
    expect(top[0].name).toMatch(/business card/i);
    const proposalRank = top.findIndex((s) => s.sku === 'bd-proposal');
    const cardRank = top.findIndex((s) => s.sku === 'ds-business-card');
    expect(cardRank).toBeLessThan(proposalRank === -1 ? Number.MAX_SAFE_INTEGER : proposalRank);
  });

  it('understands what people actually call things', () => {
    expect(rank('I want a visiting card')[0].sku).toBe('ds-business-card');
    expect(rank('need a reel edited')[0].sku).toBe('vm-short-30');
    expect(rank('corporate profile')[0].sku).toBe('bd-profile-8');
  });

  it('returns nothing rather than everything for an empty query', () => {
    expect(rank('')).toEqual([]);
    expect(rank('   ')).toEqual([]);
  });

  /* A query that matches nothing must return nothing — the signal that the
   * catalogue has a gap, which is worth more than a page of near-misses. */
  it('returns nothing when the catalogue genuinely has no answer', () => {
    expect(rank('drone survey of a quarry')).toEqual([]);
  });
});

describe('normalising what was typed', () => {
  it('drops punctuation and case', () => {
    expect(words("I NEED a Business-Card, please!")).toEqual(['i', 'need', 'a', 'business', 'card', 'please']);
  });
});

describe('telling a quote from a refusal', () => {
  it('recognises a refusal by its shape', () => {
    expect(refused({ refusal: 'below_minimum', message: 'x' })).toBe(true);
    expect(refused({
      sku: 's', service: 'S', currency: 'NGN', lines: [], total: 0,
      basis: 'proposed', orderable: false, turnaround: [1, 2],
    })).toBe(false);
  });
});
