import { describe, it, expect } from 'vitest';

import {
  CREATE_CATEGORIES, offerFor, offerLabel, unreachableDeliverables,
  type CreateCategory,
} from './createCategories';
import { categoryCounts } from '../design/deliverables';

const bySlug = (slug: string): CreateCategory =>
  CREATE_CATEGORIES.find((c) => c.slug === slug)!;

const REAL_COUNTS = categoryCounts();
const EVERY_SERVICE = new Set([
  'design-studio', 'branding-identity', 'print-packaging', 'marketing-campaigns',
  'video-motion', 'business-digital', 'creative-services', 'print-production', 'bundles',
]);

describe('the set of cards', () => {
  it('is the thirteen the brief asked for, each with a distinct slug', () => {
    expect(CREATE_CATEGORIES).toHaveLength(13);
    expect(new Set(CREATE_CATEGORIES.map((c) => c.slug)).size).toBe(13);
  });

  it('opens with the six the founder named for launch', () => {
    expect(CREATE_CATEGORIES.slice(0, 6).map((c) => c.slug))
      .toEqual(['branding', 'social', 'outdoor', 'events', 'packaging', 'print']);
  });

  /*
   * A layout the library can draw but no card reaches is a design nobody
   * will ever find. The deliverable taxonomy and this one have to cover each
   * other, or restructuring the page quietly hides part of the catalogue.
   */
  it('reaches every deliverable category the template library has', () => {
    expect(unreachableDeliverables()).toEqual([]);
  });

  it('says something useful on every card', () => {
    for (const c of CREATE_CATEGORIES) {
      expect(c.title.length, c.slug).toBeGreaterThan(3);
      expect(c.blurb.length, c.slug).toBeGreaterThan(20);
      expect(c.examples.length, c.slug).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('what a card promises is what exists', () => {
  /*
   * ── THE RULE ─────────────────────────────────────────────────────────
   * Counted from the real library, never written down. A card promising
   * "24 designs" that opens on four loses somebody on their first visit.
   */
  it('counts templates from the catalogue, not from the copy', () => {
    const offer = offerFor(bySlug('print'), REAL_COUNTS, EVERY_SERVICE);
    expect(offer.kind).toBe('templates');
    if (offer.kind === 'templates') {
      /* flyers + menus, whatever those really are today. */
      expect(offer.count).toBe((REAL_COUNTS.flyers ?? 0) + (REAL_COUNTS.menus ?? 0));
      expect(offer.count).toBeGreaterThan(0);
    }
  });

  it('offers a service where there are no layouts but a real service', () => {
    for (const slug of ['packaging', 'video', 'photography', 'merchandise', 'signage', 'artwork']) {
      expect(offerFor(bySlug(slug), REAL_COUNTS, EVERY_SERVICE).kind, slug).toBe('service');
    }
  });

  it('falls back to "elsewhere" when neither exists', () => {
    /* No templates, and the catalogue has none of its services published. */
    expect(offerFor(bySlug('packaging'), REAL_COUNTS, new Set()).kind).toBe('elsewhere');
  });

  it('never claims templates for a category that has none', () => {
    for (const c of CREATE_CATEGORIES) {
      if (c.deliverables.length > 0) continue;
      const offer = offerFor(c, REAL_COUNTS, EVERY_SERVICE);
      expect(offer.kind, c.slug).not.toBe('templates');
    }
  });

  it('labels the action with what will actually happen', () => {
    expect(offerLabel({ kind: 'templates', count: 13 })).toBe('13 designs to edit');
    expect(offerLabel({ kind: 'templates', count: 1 })).toBe('1 design to edit');
    expect(offerLabel({ kind: 'service' })).toMatch(/price/i);
    expect(offerLabel({ kind: 'elsewhere' })).not.toMatch(/design|template/i);
  });
});

describe('a design file is not an advertising placement', () => {
  /*
   * ── THE EXPENSIVE MISUNDERSTANDING ───────────────────────────────────
   *
   * NowOpen really does sell outdoor placements — in Promote, as inventory.
   * A card that blurred the two would have somebody believing they had
   * booked a billboard because they downloaded a JPEG. The founder's brief
   * calls this out by name.
   */
  it('sends billboard buyers to Promote, and says why', () => {
    const outdoor = bySlug('outdoor');
    expect(outdoor.elsewhere).toBeTruthy();
    expect(outdoor.elsewhere!.to).toBe('/adverts');
    expect(outdoor.elsewhere!.note).toMatch(/placement/i);
  });

  it('is the only card that routes away, so the exception stays an exception', () => {
    expect(CREATE_CATEGORIES.filter((c) => c.elsewhere).map((c) => c.slug)).toEqual(['outdoor']);
  });

  /* Outdoor has no layouts, so it must never advertise designs to edit. */
  it('does not pretend outdoor artwork templates exist', () => {
    expect(bySlug('outdoor').deliverables).toEqual([]);
    expect(offerFor(bySlug('outdoor'), REAL_COUNTS, EVERY_SERVICE).kind).not.toBe('templates');
  });
});
