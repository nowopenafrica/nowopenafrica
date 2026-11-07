import { describe, it, expect } from 'vitest';

import { divisionOf, priceCaveat, serviceAsCatalogueItem } from './serviceAdapter';
import { sellable } from './catalogue';
import type { Service } from './services';

const service = (over: Partial<Service> = {}): Service => ({
  id: 'x', sku: 'ds-flyer', slug: 'flyer', name: 'Promotional flyer',
  short_description: 'A flyer built from your brand.', category_id: 'c',
  deliverable_type: 'digital', fulfilment: 'creator', pricing_model: 'starting_at',
  currency: 'NGN', price_minor: 750000, price_unit: null, price_basis: 'proposed',
  price_includes: [], exclusions: [], turnaround_min_days: 2, turnaround_max_days: 4,
  revisions_included: null, editable_source_included: false, available_formats: [],
  template_tags: [], production_required: false, quote_required: false,
  is_orderable: false, featured: false, sort_order: 0,
  ...over,
});

describe('money crosses the boundary intact', () => {
  it('converts minor units to the whole naira the order flow uses', () => {
    expect(serviceAsCatalogueItem(service({ price_minor: 750000 })).price).toBe(7500);
    expect(serviceAsCatalogueItem(service({ price_minor: 35000000 })).price).toBe(350000);
  });

  it('carries no price at all when there is none', () => {
    expect(serviceAsCatalogueItem(service({ price_minor: null })).price).toBeUndefined();
  });
});

describe('what may be sold', () => {
  /*
   * ── THE MAPPING THAT CARRIES MONEY ───────────────────────────────────
   *
   * The old model's 'quoted' means "safe to sell" and drives the order
   * button's wording. A proposed launch price has a number but nobody has
   * agreed to it, so it must land on 'indicative' — the value the existing
   * flow already treats as request-only.
   */
  it('refuses to call an unverified price sellable', () => {
    for (const basis of ['proposed', 'indicative'] as const) {
      const item = serviceAsCatalogueItem(service({ price_basis: basis, is_orderable: false }));
      expect(item.basis, basis).toBe('indicative');
      expect(sellable(item), basis).toBe(false);
    }
  });

  it('follows the generated column, not the basis field', () => {
    /*
     * A row could carry basis 'quoted' while unpublished, or be published
     * with the basis unset. is_orderable is the database's single answer to
     * both; reading price_basis here would be a second opinion that can
     * disagree with it.
     */
    expect(serviceAsCatalogueItem(service({ price_basis: 'quoted', is_orderable: false })).basis)
      .toBe('indicative');
    expect(serviceAsCatalogueItem(service({ price_basis: 'quoted', is_orderable: true })).basis)
      .toBe('quoted');
  });

  it('makes a genuinely quoted service sellable', () => {
    expect(sellable(serviceAsCatalogueItem(service({ is_orderable: true })))).toBe(true);
  });
});

describe('which part of the page it belongs to', () => {
  it('sends anything that gets produced to print', () => {
    expect(divisionOf({ deliverable_type: 'digital', production_required: true })).toBe('print');
    expect(divisionOf({ deliverable_type: 'print', production_required: false })).toBe('print');
  });

  it('keeps strategy and managed work with brand', () => {
    expect(divisionOf({ deliverable_type: 'strategy', production_required: false })).toBe('brand');
    expect(divisionOf({ deliverable_type: 'managed', production_required: false })).toBe('brand');
  });

  it('sends video to video and everything else to create', () => {
    expect(divisionOf({ deliverable_type: 'video', production_required: false })).toBe('video');
    expect(divisionOf({ deliverable_type: 'digital', production_required: false })).toBe('create');
  });
});

describe('"from" belongs on a floor, not on an exact figure', () => {
  it('marks open-ended prices', () => {
    expect(serviceAsCatalogueItem(service({ pricing_model: 'starting_at' })).from).toBe(true);
    expect(serviceAsCatalogueItem(service({ pricing_model: 'package' })).from).toBe(true);
  });

  it('leaves a per-unit price exact', () => {
    expect(serviceAsCatalogueItem(service({ pricing_model: 'per_screen' })).from).toBeUndefined();
    expect(serviceAsCatalogueItem(service({ pricing_model: 'per_item' })).from).toBeUndefined();
  });
});

describe('the caveat under the price', () => {
  /* A caveat under every figure is a caveat nobody reads. */
  it('says nothing when the price is real', () => {
    expect(priceCaveat(service({ is_orderable: true }))).toBeNull();
  });

  it('distinguishes a guess from a benchmark from a conversation', () => {
    expect(priceCaveat(service({ price_basis: 'proposed' }))).toMatch(/guide price/i);
    expect(priceCaveat(service({ price_basis: 'indicative' }))).toMatch(/estimate/i);
    expect(priceCaveat(service({ quote_required: true }))).toMatch(/read your brief/i);
  });
});

describe('quantity breaks survive the crossing', () => {
  /*
   * ── FOUND BY WATCHING IT FAIL ────────────────────────────────────────
   *
   * The adapter dropped `tiers`. So `defaultConfiguration()` found no
   * quantity, the panel showed no quantity control, and price_service
   * refused the whole thing with 'quantity_required' — while the panel
   * cheerfully displayed a total from its own arithmetic. The price on
   * screen and the price the server would record were different numbers.
   */
  it('carries the tiers the configurator needs to ask for a quantity', () => {
    const item = serviceAsCatalogueItem(service({
      tiers: [{ min_quantity: 100, price_minor: 1500000 }],
    }));
    expect(item.tiers).toEqual([{ qty: 100, price: 15000 }]);
  });

  it('puts them in ascending order, which every reader assumes', () => {
    /* tierFor() takes the LAST eligible tier — the largest only if sorted. */
    const item = serviceAsCatalogueItem(service({
      tiers: [
        { min_quantity: 500, price_minor: 3800000 },
        { min_quantity: 100, price_minor: 1500000 },
        { min_quantity: 250, price_minor: 2500000 },
      ],
    }));
    expect(item.tiers?.map((t) => t.qty)).toEqual([500, 100, 250].sort((a, b) => a - b));
  });

  it('leaves a service without tiers alone', () => {
    expect(serviceAsCatalogueItem(service()).tiers).toBeUndefined();
  });
});
