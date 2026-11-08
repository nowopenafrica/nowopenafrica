import { describe, it, expect, afterEach } from 'vitest';

import { DESIGN_TEMPLATES, type DesignTemplate } from '../designTemplates';
import { FORMATS } from '../design/formats';
import { DIRECTIONS } from '../design/directions';
import { INDUSTRY_GROUPS } from '../design/taxonomy';
import {
  DELIVERABLES, clearUploadedDeliverables, registerUploadedDeliverable,
} from '../design/deliverables';
import { NEEDS } from './needs';
import {
  CATEGORIES, OCCASIONS, SUBCATEGORIES,
  needToSubcategories, shownSubcategories, subcategoryFor,
} from './catalogueTaxonomy';

const byKey = (key: string) => SUBCATEGORIES.find((s) => s.key === key);

describe('catalogue taxonomy', () => {
  afterEach(() => clearUploadedDeliverables());

  it('has the eight founder categories, A to H', () => {
    expect(CATEGORIES.map((c) => c.key)).toEqual([
      'brand', 'social', 'advertising', 'print', 'presentations', 'events', 'product', 'production',
    ]);
  });

  it('maps all 110 code templates to exactly one registered subcategory', () => {
    expect(DESIGN_TEMPLATES).toHaveLength(110);
    for (const tpl of DESIGN_TEMPLATES) {
      const sub = subcategoryFor(tpl);
      expect(sub, tpl.key).not.toBeNull();
      expect(SUBCATEGORIES.filter((s) => s.key === sub!.key), tpl.key).toHaveLength(1);
    }
  });

  it('keeps subcategory keys unique and inside a real category', () => {
    const keys = SUBCATEGORIES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    const cats = new Set(CATEGORIES.map((c) => c.key));
    for (const s of SUBCATEGORIES) expect(cats.has(s.category), s.key).toBe(true);
  });

  it('only keeps a subcategory that has a template or is a pilot target', () => {
    const pilots = new Set(['business-card', 'instagram-post', 'billboard-48-sheet']);
    for (const s of SUBCATEGORIES) {
      const used = DESIGN_TEMPLATES.some((t) => subcategoryFor(t)?.key === s.key);
      expect(used || pilots.has(s.key), s.key).toBe(true);
    }
  });

  it('every DELIVERABLES entry names a registered subcategory', () => {
    for (const [key, d] of Object.entries(DELIVERABLES)) {
      expect(byKey(d.subcategory), key).toBeDefined();
    }
  });

  it('every need deliverable that has a subcategory maps through needToSubcategories', () => {
    for (const need of NEEDS) {
      const mapped = needToSubcategories(need.slug);
      expect(mapped.length, need.slug).toBeGreaterThan(0);
      for (const d of need.deliverables) {
        if (byKey(d.slug)) expect(mapped, `${need.slug}/${d.slug}`).toContain(d.slug);
      }
      for (const key of mapped) expect(byKey(key), key).toBeDefined();
    }
  });

  it('defines the three pilot subcategories even with no templates', () => {
    const card = byKey('business-card')!;
    expect(card.sides).toBe('front-back');
    expect(card.requiredRoles).toEqual(expect.arrayContaining(['brand', 'headline', 'contact']));

    const post = byKey('instagram-post')!;
    expect(post.formats).toContain('instagram-portrait');

    const board = byKey('billboard-48-sheet')!;
    expect(board.formats).toEqual(['board-48-sheet']);
    expect(board.category).toBe('advertising');
    expect(DESIGN_TEMPLATES.some((t) => subcategoryFor(t)?.key === 'billboard-48-sheet')).toBe(false);
  });

  it('resolves every format key in FORMATS', () => {
    for (const s of SUBCATEGORIES) {
      expect(s.formats.length, s.key).toBeGreaterThan(0);
      for (const f of s.formats) expect(FORMATS[f], `${s.key} -> ${f}`).toBeDefined();
    }
  });

  it('files every template whose deliverable names a format under a subcategory made on it', () => {
    const misfiled: string[] = [];
    for (const tpl of DESIGN_TEMPLATES) {
      const format = DELIVERABLES[tpl.key]?.format;
      const sub = subcategoryFor(tpl);
      if (format && sub && !sub.formats.includes(format)) misfiled.push(`${tpl.key}: ${format} not in ${sub.key}`);
    }
    expect(misfiled).toEqual([]);
  });

  it('keeps industry facets inside INDUSTRY_GROUPS', () => {
    for (const tpl of DESIGN_TEMPLATES) {
      for (const industry of tpl.industries ?? []) {
        expect(INDUSTRY_GROUPS, `${tpl.key} -> ${industry}`).toContain(industry);
      }
    }
  });

  it('lists the spec occasions in kebab-case', () => {
    expect(OCCASIONS).toEqual([
      'sale', 'launch', 'opening', 'holiday', 'wedding', 'church-and-community', 'sport',
    ]);
  });

  it('returns null for an uploaded deliverable without a subcategory', () => {
    registerUploadedDeliverable('uploaded-x', { category: 'flyers', name: 'Uploaded' });
    expect(subcategoryFor({ key: 'uploaded-x' })).toBeNull();
    registerUploadedDeliverable('uploaded-y', { category: 'flyers', name: 'Uploaded', subcategory: 'flyer' });
    expect(subcategoryFor({ key: 'uploaded-y' })?.key).toBe('flyer');
  });
});

describe('shownSubcategories', () => {
  const dirs = DIRECTIONS.map((d) => d.key);
  const inSub = (sub: string) => DESIGN_TEMPLATES.filter((t) => subcategoryFor(t)?.key === sub);
  const withDirections = (tpls: DesignTemplate[], n: number): DesignTemplate[] =>
    tpls.map((t, i) => ({ ...t, direction: dirs[i % n] }));

  it('returns nothing for today\'s library, which has no directions yet', () => {
    expect(shownSubcategories(DESIGN_TEMPLATES)).toEqual([]);
  });

  it('hides a subcategory that spans only 3 directions, shows one with 4', () => {
    const cards = inSub('business-card');
    expect(cards.length).toBeGreaterThanOrEqual(4);
    expect(shownSubcategories(withDirections(cards, 3))).toEqual([]);
    expect(shownSubcategories(withDirections(cards, 4)).map((s) => s.key)).toEqual(['business-card']);
  });
});
