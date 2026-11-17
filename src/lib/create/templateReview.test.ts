import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';

import {
  PUBLISH_SCORE, RUBRIC, gateFor, readTemplateZip, rubricProblems, rubricTotal,
  type RubricLines,
} from './templateReview';
import type { TemplateRow } from './templateCatalogue';
import { DESIGN_TEMPLATES } from '../designTemplates';
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

describe('criticalCore, the browser-safe half', () => {
  it('finds exactly what automatedCriticals finds, apart from C3', () => {
    for (const tpl of DESIGN_TEMPLATES) {
      const all = automatedCriticals(tpl, DESIGN_TEMPLATES, MANIFEST).filter((f) => f.code !== 'C3');
      expect(coreCriticals(tpl, DESIGN_TEMPLATES, MANIFEST)).toEqual(all);
    }
  });
});
