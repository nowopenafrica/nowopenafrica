import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';

import {
  PUBLISH_SCORE, RUBRIC, checkUpload, gateFor, readTemplateZip, rubricProblems, rubricTotal,
  type RubricLines,
} from './templateReview';
import { deliverablesFor, entryFromRow, type TemplateRow } from './templateCatalogue';
import { SAMPLE_MAX_CHARS, readTemplateUpload, templateToUploadJson, withCleanClassification } from './templateUpload';
import { BASE_SAMPLE, sampleFor } from './sampleCopy';
import { subcategoryFor } from './catalogueTaxonomy';
import { clearUploadedDeliverables, registerUploadedDeliverables } from '../design/deliverables';
import { DESIGN_TEMPLATES, type DesignTemplate } from '../designTemplates';
import { MANIFEST } from '../design/assetManifest';
import { automatedCriticals } from '../design/quality/critical';
import { coreCriticals } from '../design/quality/criticalCore';

const MIGRATION = join(process.cwd(), 'supabase/migrations/20261117000000_design_template_review_gate.sql');

const full = (): RubricLines =>
  Object.fromEntries(RUBRIC.map((r) => [r.key, r.max])) as RubricLines;

const row = (patch: Partial<TemplateRow> = {}): TemplateRow => ({
  id: 'r1', key: 'k', label: 'L', description: null, category: 'social', styles: [], industries: [], tags: [],
  document: {}, editability: 'full', source_format: 'json', format: null, preview_url: null,
  status: 'in_review', published_at: null, created_at: '2026-11-17T00:00:00Z',
  ...patch,
});

describe('the rubric', () => {
  it('sums to 100 and publishes at 85 (spec D3)', () => {
    expect(rubricTotal(full())).toBe(100);
    expect(PUBLISH_SCORE).toBe(85);
  });

  it('is the same rubric the database scores with', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const json = sql.match(/SELECT '(\{[^']+\})'::jsonb/);
    expect(json).not.toBeNull();
    expect(JSON.parse(json![1])).toEqual(Object.fromEntries(RUBRIC.map((r) => [r.key, r.max])));
  });

  it('refuses a line out of range, a fraction, or a missing line', () => {
    expect(rubricProblems(full())).toEqual([]);
    expect(rubricProblems({ ...full(), originality: 16 })).toEqual(['Originality must be 0 to 15']);
    expect(rubricProblems({ ...full(), colour: 7.5 })).toEqual(['Colour needs a whole number']);
    const { technical: _t, ...missing } = full();
    expect(rubricProblems(missing)).toEqual(['Technical execution needs a whole number']);
  });
});

describe('gateFor, the screen copy of design_templates_publish_gate', () => {
  const reviewed = { reviewed_at: '2026-11-17T09:00:00Z', review_lines: full(), review_decision: 'approve' as const, review_score: 90, review_criticals: [] };

  it('lets a current approved review of 85+ with no criticals through', () => {
    expect(gateFor(row(reviewed))).toEqual({ publishable: true, why: 'reviewed' });
    expect(gateFor(row({ ...reviewed, review_score: 85 })).publishable).toBe(true);
  });

  it('keeps everything else back, and says why', () => {
    expect(gateFor(row())).toEqual({ publishable: false, reasons: ['not reviewed'] });
    expect(gateFor(row({ ...reviewed, review_score: 84 }))).toEqual({ publishable: false, reasons: ['scored 84, below 85'] });
    expect(gateFor(row({ ...reviewed, review_decision: 'revise' }))).toEqual({ publishable: false, reasons: ['the review says revise'] });
    expect(gateFor(row({ ...reviewed, review_criticals: ['C5', 'C10'] }))).toEqual({ publishable: false, reasons: ['critical C5, C10'] });
  });

  it('treats a legacy listing as listed only while it stays published', () => {
    expect(gateFor(row({ status: 'published', legacy_listing: true }))).toEqual({ publishable: true, why: 'legacy' });
    expect(gateFor(row({ status: 'draft', legacy_listing: true })).publishable).toBe(false);
  });
});

describe('readTemplateZip', () => {
  const zip = (files: Record<string, string>) =>
    zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));

  it('takes template JSON and artboards, and counts everything else', async () => {
    const read = readTemplateZip(zip({
      'pack/social/post.json': '{"key":"a"}',
      'pack/event/poster.dc.html': '<x-dc></x-dc>',
      'pack/manifest.json': '{}',
      'pack/social/preview.png': 'png',
      'pack/README.md': '# hi',
      '__MACOSX/pack/._post.json': 'junk',
      'pack/.DS_Store': 'junk',
    }), 'pack.zip');
    expect(read.files.map((f) => f.name)).toEqual(['pack/event/poster.dc.html', 'pack/social/post.json']);
    expect(read.files.map((f) => f.type)).toEqual(['text/html', 'application/json']);
    expect(await read.files[1].text()).toBe('{"key":"a"}');
    expect([...read.skipped].sort()).toEqual(['pack/README.md', 'pack/manifest.json', 'pack/social/preview.png']);
  });

  it('refuses an archive with too many files', () => {
    const many = Object.fromEntries(Array.from({ length: 5001 }, (_, i) => [`f${i}.json`, '{}']));
    expect(() => readTemplateZip(zip(many), 'big.zip')).toThrow(/more than 5000 files/);
  });

  it('refuses something that is not a ZIP', () => {
    expect(() => readTemplateZip(strToU8('not a zip'), 'x.zip')).toThrow();
  });
});

describe('an upload\'s product, direction and demo copy', () => {
  const base = DESIGN_TEMPLATES.find((t) => t.key === 'pilot-ig-bold') ?? DESIGN_TEMPLATES[0];
  const upload = (extra: Record<string, unknown>) => {
    const read = readTemplateUpload({ ...JSON.parse(templateToUploadJson(base, 'social')), key: 'upload-x', ...extra });
    if (!read.ok) throw new Error(read.reason);
    return read;
  };
  const codes = (tpl: DesignTemplate, format: string | null) =>
    checkUpload(tpl, { category: 'social', format }, DESIGN_TEMPLATES);

  afterEach(() => clearUploadedDeliverables());

  it('fails C2 and C9 without them, which is why every live upload failed', () => {
    const check = codes(upload({}).template, 'instagram-portrait');
    expect(check.ok && check.list.map((f) => f.code)).toEqual(expect.arrayContaining(['C2', 'C9']));
  });

  it('clears C2 and C9 with them', () => {
    const read = upload({
      subcategory: 'instagram-post',
      direction: 'bold',
      sample: { brand: 'Your brand', eyebrow: 'Big news', headline: 'Now open', subline: 'Come and see us this week.', cta: 'Link in bio' },
    });
    expect(read.template.subcategory).toBe('instagram-post');
    expect(read.template.direction).toBe('bold');
    const check = codes(read.template, 'instagram-portrait');
    expect(check.ok).toBe(true);
    const found = check.ok ? check.list.map((f) => f.code) : [];
    expect(found).not.toContain('C2');
    expect(found).not.toContain('C9');
  });

  it('drops an unknown product or direction with a note, and caps the copy', () => {
    const read = upload({ subcategory: 'spaceship', direction: 'vaporwave', sample: { headline: 'x'.repeat(500), services: ['a', '', 'b', 7] } });
    expect(read.template.subcategory).toBeUndefined();
    expect(read.template.direction).toBeUndefined();
    expect(read.notes.join(' ')).toMatch(/spaceship.*vaporwave/s);
    expect(read.template.sample?.headline).toHaveLength(SAMPLE_MAX_CHARS);
    expect(read.template.sample?.services).toEqual(['a', 'b']);
  });

  it('is what the gallery card shows, with blank fields falling back', () => {
    const copy = sampleFor({ key: 'upload-x', sample: { headline: 'Your opening date', subline: '', services: ['First', ' '] } });
    expect(copy.headline).toBe('Your opening date');
    expect(copy.subline).toBe(BASE_SAMPLE.subline);
    expect(copy.services).toEqual(['First']);
  });

  it('survives the trip through a stored row, and files the row under its product', () => {
    const tpl = upload({ subcategory: 'instagram-post', direction: 'industry' }).template;
    const stored = row({ key: 'upload-x', document: withCleanClassification(tpl), industries: ['Food & Hospitality'], status: 'published' });
    const read = entryFromRow(stored, new Set(DESIGN_TEMPLATES.map((t) => t.key)));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.entry.template.industries).toEqual(['Food & Hospitality']);
    registerUploadedDeliverables(deliverablesFor([read.entry], [stored]));
    expect(subcategoryFor(read.entry.template)?.key).toBe('instagram-post');
  });
});

describe('criticalCore, the browser-safe half', () => {
  it('finds exactly what automatedCriticals finds, apart from C3', () => {
    for (const tpl of DESIGN_TEMPLATES) {
      const all = automatedCriticals(tpl, DESIGN_TEMPLATES, MANIFEST).filter((f) => f.code !== 'C3');
      expect(coreCriticals(tpl, DESIGN_TEMPLATES, MANIFEST)).toEqual(all);
    }
  });
});
