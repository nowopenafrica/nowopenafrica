import { describe, expect, it, vi } from 'vitest';

let mockRows: unknown[] = [];
vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: mockRows, error: null }) }) }),
      }),
    }),
  },
}));

import baseline from './fixtures/listing-baseline.json';
import { DESIGN_TEMPLATES, templateByKey } from '../designTemplates';
import { clearUploadedDeliverables, deliverableFor, registerUploadedDeliverable } from '../design/deliverables';
import { contentHash } from '../design/quality/hash';
import type { Review } from '../design/quality/ledger';
import { NEEDS, isListed, type ListingRule, type NeedSlug, isListedWith, listedFor, listedIn, shownNeeds } from './needs';
import { entryFromRow, fetchCatalogue, type TemplateRow } from './templateCatalogue';

const TODAY = '2026-11-08';
const keys = (ts: { key: string }[]) => ts.map((t) => t.key);
const notes = { visual: '', typography: '', composition: '', relevance: '', industry: '', access: '', mobile: '' };
const human = { visual: 9, typography: 4, composition: 9, relevance: 5, industry: 4, access: 3, mobile: 2 };
const approve = (key: string, hash: string, over: Partial<Review> = {}): Review => ({
  key, hash, reviewer: 'x', date: '2026-11-01', human, notes,
  decision: 'approve', c10: false, auto: 49, criticals: [], ...over,
});

describe('gate off: the gallery is unchanged', () => {
  it('shownNeeds, listedIn and listedFor match the captured baseline', () => {
    expect(shownNeeds().map((n) => n.slug)).toEqual(baseline.shownNeeds);
    for (const n of NEEDS) {
      expect(keys(listedIn(n.slug)), n.slug).toEqual((baseline.listedIn as Record<string, string[]>)[n.slug]);
      for (const d of n.deliverables) {
        expect(keys(listedFor(d.slug)), d.slug).toEqual((baseline.listedFor as Record<string, string[]>)[d.slug]);
      }
    }
  });

  it('isListed is still the look rule', () => {
    for (const t of DESIGN_TEMPLATES) expect(isListed(t)).toBe(Boolean(t.look));
  });
});

describe('gate on (injected)', () => {
  const t = templateByKey('tiered-sale');
  const sub = deliverableFor(t)?.subcategory ?? '';
  const gated = new Set([sub]);
  const rule = (reviews: Review[]) => ({ gated, reviews, today: TODAY, all: DESIGN_TEMPLATES });

  it('the fixture template sits in a subcategory', () => {
    expect(sub).not.toBe('');
  });

  it('a gated template with no review is not listed, though it has a look', () => {
    expect(Boolean(t.look)).toBe(true);
    expect(isListedWith(t, rule([]))).toBe(false);
  });

  it('a passing review lists it; a stale one does not', () => {
    expect(isListedWith(t, rule([approve(t.key, contentHash(t))]))).toBe(true);
    expect(isListedWith(t, rule([approve(t.key, 'stale')]))).toBe(false);
  });

  it('templates outside the gated subcategories keep the look rule', () => {
    const outside = DESIGN_TEMPLATES.filter((x) => deliverableFor(x)?.subcategory !== sub);
    expect(outside.length).toBeGreaterThan(0);
    for (const x of outside) expect(isListedWith(x, rule([])), x.key).toBe(Boolean(x.look));
  });

  it('listedIn and listedFor honour the injected rule', () => {
    const d = deliverableFor(t) as { deliverable: string; need: NeedSlug };
    expect(listedFor(d.deliverable, DESIGN_TEMPLATES, rule([]))).toEqual([]);
    expect(listedFor(d.deliverable, DESIGN_TEMPLATES).length).toBeGreaterThan(0);
    expect(listedIn(d.need, DESIGN_TEMPLATES, rule([])).some((x) => deliverableFor(x)?.subcategory === sub)).toBe(false);
  });
});

describe('fetchCatalogue with an unreviewed uploaded row', () => {
  const row: TemplateRow = {
    id: 'row-1', key: 'uploaded-layout', label: 'Uploaded layout', description: null,
    category: 'campaigns', styles: [], industries: [], tags: [],
    document: { label: 'Uploaded layout', slots: [{ role: 'headline', x: 0.1, y: 0.4, w: 0.8 }] },
    editability: 'full', source_format: 'json', format: null, preview_url: null,
    status: 'published', published_at: '2026-10-26T00:00:00Z', created_at: '2026-10-26T00:00:00Z',
  };

  it('returns every code template and lists the row only with a passing review', async () => {
    mockRows = [row];
    const read = await fetchCatalogue();
    try {
      const entryKeys = read.entries.map((e) => e.template.key);
      expect(entryKeys).toEqual(expect.arrayContaining(DESIGN_TEMPLATES.map((x) => x.key)));
      const uploaded = read.entries.find((e) => e.template.key === 'uploaded-layout')!;
      expect(uploaded.origin).toBe('uploaded');

      // Name a gated subcategory for the row, as an upload that declared one would.
      registerUploadedDeliverable('uploaded-layout', { category: 'campaigns', name: 'Uploaded layout', subcategory: 'sale-post', deliverable: 'sale-post', need: 'promotions' });
      const all = read.entries.map((e) => e.template);
      const rule = (reviews: Review[]) => ({ gated: new Set(['sale-post']), reviews, today: TODAY, all });

      const listedKeys = (r: ListingRule) => all.filter((x) => isListedWith(x, r)).map((x) => x.key);
      const without = listedKeys(rule([]));
      expect(without).not.toContain('uploaded-layout');
      // Code templates outside the gated subcategory are all still listed.
      for (const x of DESIGN_TEMPLATES) {
        if (x.look && deliverableFor(x)?.subcategory !== 'sale-post') expect(without, x.key).toContain(x.key);
      }

      expect(listedKeys(rule([approve('uploaded-layout', contentHash(uploaded.template))]))).toContain('uploaded-layout');
      expect(listedFor('sale-post', all, rule([approve('uploaded-layout', contentHash(uploaded.template))])).map((x) => x.key)).toContain('uploaded-layout');
    } finally {
      clearUploadedDeliverables();
    }
  });

  it('with the gate off the row is listed by the look rule as before', async () => {
    mockRows = [row];
    const read = await fetchCatalogue();
    try {
      for (const e of read.entries) expect(isListed(e.template), e.template.key).toBe(Boolean(e.template.look));
    } finally {
      clearUploadedDeliverables();
    }
  });

  it('an empty table still returns all code templates', async () => {
    mockRows = [];
    const read = await fetchCatalogue();
    expect(read.entries.map((e) => e.template.key)).toEqual(DESIGN_TEMPLATES.map((x) => x.key));
  });
});

describe('an upload that names a deliverable but no subcategory', () => {
  it('is gated by its deliverable slug until it has a passing review', () => {
    const row: TemplateRow = {
      id: 'row-2', key: 'uploaded-card', label: 'Uploaded card', description: null,
      category: 'flyers', styles: [], industries: [], tags: [],
      document: { label: 'Uploaded card', slots: [{ role: 'headline', x: 0.1, y: 0.4, w: 0.8 }] },
      editability: 'full', source_format: 'json', format: null, preview_url: null,
      status: 'published', published_at: '2026-10-26T00:00:00Z', created_at: '2026-10-26T00:00:00Z',
    };
    const read = entryFromRow(row, new Set());
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const up = { ...read.entry.template, look: templateByKey('tiered-sale').look };
    registerUploadedDeliverable(up.key, { category: 'flyers', name: 'Uploaded card', deliverable: 'business-card', need: 'stationery' });
    try {
      expect(deliverableFor(up)?.subcategory).toBeUndefined();
      const all = [...DESIGN_TEMPLATES, up];
      const rule = (reviews: Review[]) => ({ gated: new Set(['business-card']), reviews, today: TODAY, all });
      expect(isListed(up)).toBe(true); // gate off: look rule, as before
      expect(isListedWith(up, rule([]))).toBe(false);
      expect(listedFor('business-card', all, rule([])).map((x) => x.key)).not.toContain(up.key);
      const pass = rule([approve(up.key, contentHash(up))]);
      expect(isListedWith(up, pass)).toBe(true);
      expect(listedFor('business-card', all, pass).map((x) => x.key)).toContain(up.key);
    } finally {
      clearUploadedDeliverables();
    }
  });
});
