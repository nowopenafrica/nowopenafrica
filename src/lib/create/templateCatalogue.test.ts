import { afterEach, describe, expect, it } from 'vitest';

import {
  codeEntries, deliverablesFor, entryFromRow, mergeEntries, normaliseRow,
  type CatalogueEntry, type TemplateRow,
} from './templateCatalogue';
import { DESIGN_TEMPLATES } from '../designTemplates';
import {
  categoryCounts, clearUploadedDeliverables, deliverableFor, formatForTemplate,
  registerUploadedDeliverable, registerUploadedDeliverables,
} from '../design/deliverables';

afterEach(() => clearUploadedDeliverables());

/** The smallest document that passes the validator. */
const doc = {
  label: 'Uploaded layout',
  slots: [{ role: 'headline', x: 0.1, y: 0.4, w: 0.8 }],
};

const row = (over: Partial<TemplateRow> = {}): TemplateRow => normaliseRow({
  id: 'row-1',
  key: 'uploaded-layout',
  label: 'Uploaded layout',
  description: 'From the dashboard',
  category: 'flyers',
  styles: [],
  industries: [],
  tags: [],
  document: doc,
  editability: 'full',
  source_format: 'json',
  format: null,
  preview_url: null,
  status: 'published',
  published_at: '2026-10-26T00:00:00Z',
  created_at: '2026-10-26T00:00:00Z',
  ...over,
} as TemplateRow);

describe('a stored row becomes a template through the same validator', () => {
  it('reads a well-formed row', () => {
    const read = entryFromRow(row(), new Set());
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.entry.origin).toBe('uploaded');
    expect(read.entry.rowId).toBe('row-1');
    expect(read.entry.template.slots[0].role).toBe('headline');
  });

  /*
   * `document` is jsonb — nothing in Postgres constrains its shape, and the
   * row can be written by hand. Running one contract both ways means there
   * is no second, weaker definition of valid.
   */
  /*
   * A palette can be removed from the library after a row was published. The
   * row must keep its place in the catalogue, drawn in its plain colours,
   * rather than vanish into `rejected`.
   */
  it('keeps a row whose look names a palette that no longer exists', () => {
    const read = entryFromRow(row({ document: { ...doc, look: { palette: 'gone', type: 'editorial' } } }), new Set());
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.entry.template.look).toBeUndefined();
    expect(read.notes.join(' ')).toMatch(/"gone" is not a palette/i);
  });

  it('refuses a row whose document is not a design', () => {
    expect(entryFromRow(row({ document: 'not a design' }), new Set()).ok).toBe(false);
    expect(entryFromRow(row({ document: { label: 'x', slots: [] } }), new Set()).ok).toBe(false);
  });

  it('takes the category from the column, which is what a reviewer set', () => {
    const read = entryFromRow(row({ category: 'menus', document: { ...doc, category: 'events' } }), new Set());
    expect(read.ok).toBe(true);
  });

  it('refuses a row whose category is not a real one', () => {
    const read = entryFromRow(row({ category: 'packaging' }), new Set());
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.why).toContain('packaging');
  });

  /*
   * The uploader is handed every existing key, but the upload screen is not
   * the only way a row reaches this table. A row shadowing a code template
   * would replace a layout the gallery, the editor and the motion studio
   * all depend on.
   */
  it('renames rather than shadows a code template', () => {
    const victim = DESIGN_TEMPLATES[0].key;
    const read = entryFromRow(row({ key: victim }), new Set([victim]));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.entry.template.key).not.toBe(victim);
    expect(read.renamedFrom).toBe(victim);
  });
});

describe('merging', () => {
  const uploaded: CatalogueEntry[] = [{
    template: { ...DESIGN_TEMPLATES[0], key: 'brand-new' },
    origin: 'uploaded',
    editability: 'full',
    rowId: 'row-1',
  }];

  it('keeps every code template and appends the uploaded ones', () => {
    const merged = mergeEntries(codeEntries(), uploaded);
    expect(merged.length).toBe(DESIGN_TEMPLATES.length + 1);
    expect(merged.slice(0, DESIGN_TEMPLATES.length).every((e) => e.origin === 'code')).toBe(true);
  });

  it('never lets an uploaded key replace a code one', () => {
    const collide: CatalogueEntry[] = [{ ...uploaded[0], template: DESIGN_TEMPLATES[0] }];
    const merged = mergeEntries(codeEntries(), collide);
    expect(merged.length).toBe(DESIGN_TEMPLATES.length);
    expect(merged.find((e) => e.template.key === DESIGN_TEMPLATES[0].key)?.origin).toBe('code');
  });
});

describe('an uploaded template is classified, or it is invisible', () => {
  /*
   * Without this the row shows in the gallery's "Everything" shelf and in no
   * category, no count and no collection — which reads as a bug because it
   * is one.
   */
  it('joins the category counts once registered', () => {
    const entries = [{
      template: { ...DESIGN_TEMPLATES[0], key: 'uploaded-layout' },
      origin: 'uploaded' as const,
      editability: 'full' as const,
      rowId: 'row-1',
    }];
    const before = categoryCounts([...DESIGN_TEMPLATES, entries[0].template]).flyers;
    registerUploadedDeliverables(deliverablesFor(entries, [row()]));
    const after = categoryCounts([...DESIGN_TEMPLATES, entries[0].template]).flyers;
    expect(after).toBe(before + 1);
    expect(deliverableFor({ key: 'uploaded-layout' })?.category).toBe('flyers');
  });

  it('carries the canvas so a card does not open as a square', () => {
    registerUploadedDeliverables({ 'uploaded-layout': { category: 'branding', name: 'Card', format: 'business-card' } });
    expect(formatForTemplate({ key: 'uploaded-layout' })).toBe('business-card');
  });

  /* A hand-written classification is never overridden from the network. */
  it('cannot restyle a code template', () => {
    const victim = DESIGN_TEMPLATES[0].key;
    const was = deliverableFor({ key: victim });
    registerUploadedDeliverables({ [victim]: { category: 'menus', name: 'Hijacked' } });
    expect(deliverableFor({ key: victim })).toEqual(was);
  });

  it('forgets the previous registration rather than accumulating', () => {
    registerUploadedDeliverables({ 'a-key': { category: 'flyers', name: 'A' } });
    registerUploadedDeliverables({ 'b-key': { category: 'flyers', name: 'B' } });
    expect(deliverableFor({ key: 'a-key' })).toBeNull();
    expect(deliverableFor({ key: 'b-key' })?.name).toBe('B');
  });
});

describe('null arrays out of Postgres', () => {
  it('are never iterated', () => {
    const r = normaliseRow({ ...row(), styles: null, tags: null, industries: null } as unknown as TemplateRow);
    expect(r.styles).toEqual([]);
    expect(r.tags).toEqual([]);
    expect(r.industries).toEqual([]);
  });
});

describe('a link to a template knows what canvas it belongs on', () => {
  /*
   * Opening by link reads one row and never goes through the catalogue, so
   * without a single-row registration the editor knew the design and not
   * its size — and every uploaded template opened 1080×1080 whatever it was
   * drawn at. A business card opening square is the failure the card sizes
   * in studioPresets already record.
   */
  it('registers one row without wiping the rest', () => {
    registerUploadedDeliverables({ 'from-catalogue': { category: 'flyers', name: 'A' } });
    registerUploadedDeliverable('from-a-link', { category: 'branding', name: 'B', format: 'business-card' });

    expect(deliverableFor({ key: 'from-catalogue' })?.name).toBe('A');
    expect(formatForTemplate({ key: 'from-a-link' })).toBe('business-card');
  });

  it('still cannot restyle a shipped layout', () => {
    const victim = DESIGN_TEMPLATES[0].key;
    const was = deliverableFor({ key: victim });
    registerUploadedDeliverable(victim, { category: 'menus', name: 'Hijacked' });
    expect(deliverableFor({ key: victim })).toEqual(was);
  });
});

describe('geometry survives the round trip', () => {
  /*
   * It did not, and the failure was invisible in the worst way: the importer
   * measured a design's bars and discs, the Template Manager wrote them to
   * the database, and every READ rebuilt the template from an allowlist with
   * no `shapes` in it. 71 rows held geometry; 71 templates rendered flat.
   */
  const withShapes = {
    ...doc,
    shapes: [
      { kind: 'rect', x: 0.07, y: 0.5, w: 0.86, h: 0.004, tone: 'accent' },
      { kind: 'circle', cx: 0.5, cy: 0.3, r: 0.1, tone: 'white', alpha: 0.8 },
    ],
    photoLed: true,
  };

  it('reads shapes and the photo flag back out', () => {
    const read = entryFromRow(row({ document: withShapes }), new Set());
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.entry.template.shapes).toHaveLength(2);
    expect(read.entry.template.shapes?.map((s) => s.kind)).toEqual(['rect', 'circle']);
    expect(read.entry.template.photoLed).toBe(true);
  });

  /* A tone is a brand role. A hex would make the design somebody else's. */
  it('refuses a shape painted in a literal colour', () => {
    const read = entryFromRow(row({
      document: { ...doc, shapes: [{ kind: 'rect', x: 0, y: 0, w: 1, h: 0.1, tone: '#2563eb' }] },
    }), new Set());
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.entry.template.shapes ?? []).toHaveLength(0);
  });

  it('refuses a shape whose kind the renderer does not know', () => {
    const read = entryFromRow(row({
      document: { ...doc, shapes: [{ kind: 'hexagon', x: 0, y: 0, w: 1, h: 1, tone: 'accent' }] },
    }), new Set());
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.entry.template.shapes ?? []).toHaveLength(0);
  });
});
