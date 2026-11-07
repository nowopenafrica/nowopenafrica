import { describe, it, expect } from 'vitest';
import { GOALS, goalBySlug } from './goals';
import { parsePromoteIntent } from './promoteIntent';
import { ADVERT_CATEGORIES } from '../../data/advertCategories';
import { listedIn, deliverableSlugFor, type NeedSlug } from '../create/needs';

const PRODUCTS = [
  'featured-business', 'sponsored-result', 'category-spotlight', 'city-spotlight',
  'homepage-feature', 'featured-offer', 'industry-takeover',
];

describe('promote goals', () => {
  it('has the six goals in order', () => {
    expect(GOALS.map((g) => g.slug)).toEqual(['nearby', 'launch', 'sale', 'event', 'awareness', 'hiring']);
  });

  it('uses the spec labels and lines verbatim', () => {
    expect(GOALS.map((g) => [g.label, g.line])).toEqual([
      ['Get customers nearby', 'Be findable where people search, then seen on their route'],
      ['Launch something new', 'Make noise for a new shop, product or service'],
      ['Run a sale or offer', 'Give people a reason to buy this week'],
      ['Fill an event', 'Put the date in front of the right crowd'],
      ['Build awareness', 'Be the name people already know'],
      ['Hire staff', 'Reach people looking for work near you'],
    ]);
  });

  it('every channel is real', () => {
    for (const g of GOALS) {
      for (const c of g.channels) {
        if (c.kind === 'product') expect(PRODUCTS).toContain(c.slug);
        if (c.kind === 'placement') {
          expect(c.categories.length).toBeGreaterThan(0);
          for (const cat of c.categories) expect(ADVERT_CATEGORIES).toContain(cat);
        }
      }
    }
  });

  it('every design link is listed', () => {
    for (const g of GOALS) {
      expect(g.designs.length).toBeGreaterThan(0);
      for (const d of g.designs) {
        expect(listedIn(d.need as NeedSlug).filter((t) => deliverableSlugFor(t) === d.deliverable).length, `${g.slug}: ${d.need}/${d.deliverable}`).toBeGreaterThan(0);
      }
    }
  });

  it('free comes first', () => {
    for (const g of GOALS) expect(g.channels[0].kind).toBe('free');
  });

  it('has a why sentence for each goal and looks goals up by slug', () => {
    for (const g of GOALS) expect(g.why.length).toBeGreaterThan(10);
    expect(goalBySlug('sale')?.slug).toBe('sale');
    expect(goalBySlug('nope')).toBeNull();
  });
});

describe('parsePromoteIntent', () => {
  it('maps words to goals', () => {
    expect(parsePromoteIntent('more customers for my salon in Lekki')).toEqual({ goal: 'nearby', city: 'Lagos' });
    expect(parsePromoteIntent('grand opening next month').goal).toBe('launch');
    expect(parsePromoteIntent('black friday sale').goal).toBe('sale');
    expect(parsePromoteIntent('concert in Abuja')).toEqual({ goal: 'event', city: 'Abuja' });
    expect(parsePromoteIntent('we are hiring cashiers').goal).toBe('hiring');
    expect(parsePromoteIntent('brand awareness billboard').goal).toBe('awareness');
  });

  it('does not misread loose words', () => {
    expect(parsePromoteIntent('show me prices').goal).toBeNull();
    expect(parsePromoteIntent('wedding cakes').goal).toBeNull();
    expect(parsePromoteIntent('special event').goal).toBe('event');
    expect(parsePromoteIntent('local brand').goal).not.toBe('nearby');
    expect(parsePromoteIntent('we are not hiring').goal).toBeNull();
    expect(['event', null]).toContain(parsePromoteIntent('staff party').goal);
  });

  it('city only sets the area', () => {
    expect(parsePromoteIntent('Lagos')).toEqual({ goal: null, city: 'Lagos' });
  });

  it('unknown stays unknown', () => {
    expect(parsePromoteIntent('asdf')).toEqual({ goal: null, city: null });
  });
});
