import { describe, it, expect } from 'vitest';

import {
  cardTitle, categoryCounts, deliverableFor, DELIVERABLE_CATEGORIES, DELIVERABLES, templatesIn,
} from './deliverables';
import { DESIGN_TEMPLATES } from '../designTemplates';

describe('every layout says what it makes', () => {
  /*
   * A layout with no deliverable falls back to its style name — "Editorial
   * Split" — which is the exact problem this table exists to end. If somebody
   * adds a layout and forgets a line here, this fails rather than quietly
   * reintroducing designer jargon to a business owner.
   */
  it('classifies all of them', () => {
    const missing = DESIGN_TEMPLATES.filter((t) => !deliverableFor(t)).map((t) => t.key);
    expect(missing, `unclassified layouts: ${missing.join(', ')}`).toEqual([]);
  });

  it('does not classify layouts that do not exist', () => {
    const keys = new Set(DESIGN_TEMPLATES.map((t) => t.key));
    const stale = Object.keys(DELIVERABLES).filter((k) => !keys.has(k));
    expect(stale, `deliverables for missing layouts: ${stale.join(', ')}`).toEqual([]);
  });

  it('only uses categories that are offered', () => {
    const offered = new Set(DELIVERABLE_CATEGORIES.map((c) => c.id));
    for (const [key, d] of Object.entries(DELIVERABLES)) {
      expect(offered.has(d.category), `${key} -> ${d.category}`).toBe(true);
    }
  });
});

describe('the names a business would use', () => {
  it('shows the deliverable, not the layout style', () => {
    expect(cardTitle({ key: 'menu-column', label: 'Menu Column' })).toBe('Menu');
    expect(cardTitle({ key: 'card-front', label: 'Card Front' })).toBe('Business card');
    expect(cardTitle({ key: 'editorial-split', label: 'Editorial Split' })).toBe('Announcement flyer');
  });

  it('falls back to the layout name for anything unclassified', () => {
    expect(cardTitle({ key: 'not-a-real-key', label: 'Some Layout' })).toBe('Some Layout');
  });

  it('never names a deliverable after a design term', () => {
    const jargon = ['split', 'grid', 'stack', 'glass', 'mesh', 'serif', 'swiss', 'luxe', 'anchor', 'ticker'];
    for (const [key, d] of Object.entries(DELIVERABLES)) {
      /*
       * WHOLE WORDS. The first version used `includes`, and "ticker" matched
       * inside "s-ticker" — flagging a sticker, which is a real thing a
       * business orders, as design jargon. Substring matching on short words
       * has now produced a wrong answer three times in this codebase.
       */
      const words = d.name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
      for (const word of jargon) {
        expect(words.includes(word), `${key} is named "${d.name}"`).toBe(false);
      }
    }
  });

  it('gives every deliverable a distinct, readable name', () => {
    for (const d of Object.values(DELIVERABLES)) {
      expect(d.name.length).toBeGreaterThan(3);
      expect(d.name[0]).toBe(d.name[0].toUpperCase());
    }
  });
});

describe('counts come from the library', () => {
  /*
   * A number typed into the copy goes stale the first time somebody adds a
   * layout. These are counted, every time.
   */
  it('adds up to the layouts that are classified', () => {
    const counts = categoryCounts();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(DESIGN_TEMPLATES.filter((t) => deliverableFor(t)).length);
  });

  it('has no empty category on offer', () => {
    /* A category that opens onto nothing is a promise the product breaks. */
    const counts = categoryCounts();
    for (const c of DELIVERABLE_CATEGORIES) {
      expect(counts[c.id], `${c.label} is empty`).toBeGreaterThan(0);
    }
  });

  it('returns the layouts in a category', () => {
    const menus = templatesIn('menus');
    expect(menus.length).toBe(categoryCounts().menus);
    for (const t of menus) expect(DELIVERABLES[t.key].category).toBe('menus');
  });

  it('counts a filtered library, not the whole one', () => {
    const two = DESIGN_TEMPLATES.filter((t) => ['menu-column', 'price-list'].includes(t.key));
    expect(categoryCounts(two).menus).toBe(2);
    expect(categoryCounts(two).flyers).toBe(0);
  });
});

describe('the categories themselves', () => {
  it('explains each one in plain words', () => {
    for (const c of DELIVERABLE_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(3);
      expect(c.blurb.length).toBeGreaterThan(15);
    }
  });

  it('has no duplicate ids', () => {
    const ids = DELIVERABLE_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
