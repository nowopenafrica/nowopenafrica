import { describe, it, expect } from 'vitest';

import { DESIGN_TEMPLATES } from '../designTemplates';
import {
  DELIVERABLE_CATEGORIES, DELIVERABLES, registerUploadedDeliverable, clearUploadedDeliverables,
} from '../design/deliverables';
import { CREATE_CATEGORIES } from './createCategories';
import {
  NEEDS, POPULAR, isListed, needFor, deliverableSlugFor, listedIn, listedFor, shownNeeds, needFromLegacy,
} from './needs';

describe('the needs taxonomy', () => {
  it('has the nine needs in order', () => {
    expect(NEEDS.map((n) => n.slug)).toEqual([
      'stationery', 'brand', 'social', 'promotions', 'flyers', 'events', 'menus', 'outdoor', 'documents',
    ]);
    expect(NEEDS.map((n) => n.title)).toEqual([
      'Business cards & stationery', 'Brand & packaging', 'Social media', 'Promotions & sales',
      'Flyers & posters', 'Events & invitations', 'Menus & price lists', 'Signs & outdoor',
      'Documents & presentations',
    ]);
  });

  it('files every code template under exactly one need and a deliverable of that need', () => {
    for (const t of DESIGN_TEMPLATES) {
      const need = needFor(t);
      expect(need, `${t.key} has no need`).not.toBeNull();
      const deliverable = deliverableSlugFor(t);
      const n = NEEDS.find((x) => x.slug === need);
      expect(n?.deliverables.map((d) => d.slug), `${t.key} -> ${need}/${deliverable}`).toContain(deliverable);
    }
  });

  it('lists only templates with a look', () => {
    for (const n of NEEDS) for (const t of listedIn(n.slug, DESIGN_TEMPLATES)) expect(t.look).toBeTruthy();
    const lookless = { ...DESIGN_TEMPLATES[0], look: undefined };
    expect(isListed(lookless)).toBe(false);
    expect(NEEDS.some((n) => listedIn(n.slug, [lookless]).length > 0)).toBe(false);
    expect(listedFor('business-card', [lookless])).toEqual([]);
  });

  it('only shows needs with at least six listed templates', () => {
    for (const n of shownNeeds(DESIGN_TEMPLATES)) expect(listedIn(n.slug).length).toBeGreaterThanOrEqual(6);
  });

  it('shows all nine needs', () => {
    expect(shownNeeds(DESIGN_TEMPLATES).length).toBe(9);
  });

  it('keeps popular now to the six', () => {
    expect(POPULAR.map((p) => p.label)).toEqual([
      'Business card', 'Flyer', 'Instagram post', 'WhatsApp status', 'Menu', 'Invitation',
    ]);
    for (const p of POPULAR) {
      expect(NEEDS.find((n) => n.slug === p.need)?.deliverables.map((d) => d.slug)).toContain(p.deliverable);
    }
  });

  it('maps every legacy category to a need', () => {
    /* video and photography have no matching need: they are explicitly null. */
    const none = ['video', 'photography'];
    for (const c of CREATE_CATEGORIES) {
      if (none.includes(c.slug)) expect(needFromLegacy(c.slug)).toBeNull();
      else expect(needFromLegacy(c.slug), c.slug).not.toBeNull();
    }
    for (const c of DELIVERABLE_CATEGORIES) expect(needFromLegacy(c.id), c.id).not.toBeNull();
    expect(needFromLegacy('nonsense')).toBeNull();
  });

  /*
   * Pinned filings. The structural tests above pass for ANY consistent
   * filing, so they cannot tell a voucher in promotions from a voucher on a
   * billboard. These are the popular anchors and the deliberate re-filings.
   */
  it('pins the popular anchors and the deliberate moves', () => {
    const pinned: Record<string, [string, string]> = {
      'card-front': ['stationery', 'business-card'],
      'flyer-services-photo': ['flyers', 'flyer'],
      statement: ['social', 'instagram-post'],
      'story-caption': ['social', 'story'],
      'menu-column': ['menus', 'menu'],
      'wedding-invite': ['events', 'invitation'],
      'invoice-modern': ['stationery', 'invoice'],
      'gift-voucher': ['promotions', 'gift-voucher'],
      'swiss-grid': ['documents', 'company-profile'],
      'minimal-grid': ['documents', 'report-cover'],
      vacancy: ['flyers', 'notice'],
      'opening-hours': ['flyers', 'notice'],
      'street-poster': ['events', 'event-poster'],
      'band-poster': ['events', 'event-poster'],
      'event-lineup': ['events', 'event-poster'],
      'corner-anchor': ['flyers', 'poster'],
      'coming-soon': ['flyers', 'poster'],
      'web-hero': ['promotions', 'display-ad'],
      'rollup-clean': ['outdoor', 'roll-up'],
      'billboard-statement': ['outdoor', 'billboard'],
      'property-feature-wide': ['promotions', 'display-ad'],
      'donation-appeal': ['social', 'instagram-post'],
      'app-download': ['social', 'instagram-post'],
    };
    for (const [key, [need, deliverable]] of Object.entries(pinned)) {
      expect([DELIVERABLES[key]?.need, DELIVERABLES[key]?.deliverable], key).toEqual([need, deliverable]);
    }
  });

  it('leaves an uploaded row with only a category out of every need', () => {
    registerUploadedDeliverable('uploaded-only-category', { category: 'flyers', name: 'Uploaded' });
    try {
      const t = { ...DESIGN_TEMPLATES[0], key: 'uploaded-only-category' };
      expect(needFor(t)).toBeNull();
      expect(NEEDS.some((n) => listedIn(n.slug, [t]).length > 0)).toBe(false);
    } finally {
      clearUploadedDeliverables();
    }
  });
});
