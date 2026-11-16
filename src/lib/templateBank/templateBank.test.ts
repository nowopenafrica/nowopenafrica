import { describe, it, expect, afterEach } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  DESIGN_TEMPLATES, allTemplates, registerTemplates, templateByKey, type DesignTemplate,
} from '../designTemplates';
import { findTemplates, INDUSTRY_GROUPS } from '../design/taxonomy';
import { DESIGN_STYLES } from '../design/styles';
import { gateTemplate, parseTemplate, usableDefinition } from './schema';
import {
  DIVISIONS, PACKAGE_FORMAT, PACKAGE_FORMAT_VERSION, QUALITY_CRITERIA, importable, readPackageZip,
  validatePackage, type BankTemplate, type PackageFiles,
} from './package';
import { auditFit, type Measure } from './fit';
import { packageDocs } from './docs';
import { BANK_V1, BANK_V1_NAME, BANK_V1_VERSION } from '../../data/templateBank';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const json = (v: unknown) => strToU8(JSON.stringify(v));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function pack(templates: BankTemplate[], mutate?: (files: PackageFiles, manifest: Record<string, unknown>) => void): PackageFiles {
  const files: PackageFiles = {};
  const manifest: Record<string, unknown> = {
    format: PACKAGE_FORMAT, formatVersion: PACKAGE_FORMAT_VERSION, name: 'Test bank', version: '1.0.0',
    createdAt: '2026-11-16T00:00:00Z',
    templates: templates.map((t) => ({
      id: t.id, key: t.key, version: t.version, division: t.division,
      source: `${t.division}/${t.key}/template.json`, preview: `${t.division}/${t.key}/preview.png`,
    })),
  };
  for (const t of templates) {
    files[`${t.division}/${t.key}/template.json`] = json(t);
    files[`${t.division}/${t.key}/preview.png`] = PNG;
  }
  mutate?.(files, manifest);
  files['manifest.json'] = json(manifest);
  return files;
}

const first = BANK_V1[0];
const second = BANK_V1[1];

describe('parseTemplate', () => {
  it('accepts every built-in layout unchanged, so the importer and the catalogue agree on the format', () => {
    for (const tpl of DESIGN_TEMPLATES) {
      const parsed = parseTemplate(clone(tpl));
      expect(parsed.ok, `${tpl.key}: ${parsed.ok ? '' : parsed.errors.join('; ')}`).toBe(true);
      if (parsed.ok) expect(parsed.template).toEqual(clone(tpl));
    }
  });

  it('names the field that is wrong', () => {
    const bad = clone(first.definition) as unknown as Record<string, unknown>;
    (bad.slots as Record<string, unknown>[])[0].role = 'banner';
    bad.mood = 'sleepy';
    const parsed = parseTemplate(bad);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.some((e) => e.startsWith('slots[0].role'))).toBe(true);
      expect(parsed.errors.some((e) => e.startsWith('mood'))).toBe(true);
    }
  });

  it('refuses an industry that is not one of the directory groups', () => {
    const parsed = parseTemplate({ ...clone(first.definition), industries: ['Restaurants'] });
    expect(parsed.ok).toBe(false);
  });

  it('drops fields it does not know rather than storing them', () => {
    const parsed = parseTemplate({ ...clone(first.definition), onLoad: 'alert(1)' });
    expect(parsed.ok && 'onLoad' in parsed.template).toBe(false);
  });

  it('rejects things that are not templates at all', () => {
    for (const junk of [null, 'x', 4, [], {}]) expect(parseTemplate(junk).ok).toBe(false);
  });
});

describe('gateTemplate', () => {
  it('passes every built-in layout — it holds imports to the same rules, not stricter ones', () => {
    for (const tpl of DESIGN_TEMPLATES) expect(gateTemplate(tpl), tpl.key).toEqual([]);
  });

  it('catches a missing headline, thin tags and slow motion', () => {
    const tpl: DesignTemplate = {
      ...clone(first.definition),
      tags: ['one'],
      slots: [{ role: 'subline', x: 0.1, y: 0.1, w: 0.5, motion: { in: 'fade', at: 3, dur: 1 } }],
    };
    const issues = gateTemplate(tpl).join(' | ');
    expect(issues).toContain('no headline');
    expect(issues).toContain('search tags');
    expect(issues).toContain('settle');
  });

  it('catches a solid shape over the headline', () => {
    const tpl: DesignTemplate = {
      ...clone(first.definition),
      shapes: [{ kind: 'rect', x: 0, y: 0, w: 1, h: 1, tone: 'accent' }],
    };
    expect(gateTemplate(tpl).some((i) => i.includes('covers the headline'))).toBe(true);
  });
});

describe('the official bank', () => {
  it('has unique ids and keys, none of them a built-in key', () => {
    const builtIn = new Set(DESIGN_TEMPLATES.map((t) => t.key));
    expect(new Set(BANK_V1.map((t) => t.id)).size).toBe(BANK_V1.length);
    expect(new Set(BANK_V1.map((t) => t.key)).size).toBe(BANK_V1.length);
    for (const t of BANK_V1) expect(builtIn.has(t.key), t.key).toBe(false);
  });

  it('passes the structural gate, template by template', () => {
    for (const t of BANK_V1) expect(gateTemplate(t.definition), t.key).toEqual([]);
  });

  it('uses only real divisions, industries, styles and formats', () => {
    const divisions = new Set<string>(DIVISIONS.map((d) => d.key));
    const styles = new Set(DESIGN_STYLES.map((s) => s.key));
    for (const t of BANK_V1) {
      expect(divisions.has(t.division), t.key).toBe(true);
      expect(styles.has(t.recommendedStyle), t.key).toBe(true);
      for (const g of t.industries) expect(INDUSTRY_GROUPS, t.key).toContain(g);
    }
  });

  it('carries no score of its own: only a recorded review counts', () => {
    for (const t of BANK_V1) expect(t.quality, t.key).toBeUndefined();
  });

  it('never names a real business or uses filler text in its sample copy', () => {
    for (const t of BANK_V1) {
      const text = JSON.stringify(t.sample).toLowerCase();
      expect(text, t.key).not.toContain('lorem');
      if (t.sample.brand) expect(t.sample.brand, t.key).toBe('Your business');
    }
  });

  it('gives sample copy to every text slot it draws, and no copy to slots it lacks', () => {
    const textRoles = ['brand', 'eyebrow', 'headline', 'subline', 'meta', 'cta'] as const;
    for (const t of BANK_V1) {
      const roles = new Set(t.definition.slots.map((s) => s.role));
      for (const role of textRoles) {
        expect(Boolean(t.sample[role]), `${t.key}: ${role}`).toBe(roles.has(role));
      }
    }
  });

  it('keeps a billboard to the headline, the name and one action', () => {
    for (const t of BANK_V1.filter((b) => b.formats[0] === 'billboard')) {
      expect(t.definition.slots.map((s) => s.role).sort(), t.key).toEqual(['brand', 'cta', 'headline']);
    }
  });
});

describe('validatePackage', () => {
  it('accepts the official bank as a package', () => {
    const report = validatePackage(pack(BANK_V1));
    expect(report.errors).toEqual([]);
    expect(report.counts).toEqual({ new: BANK_V1.length, update: 0, duplicate: 0, rejected: 0 });
    expect(importable(report)).toHaveLength(BANK_V1.length);
  });

  it('survives a real ZIP round trip, including one made by zipping a folder', () => {
    const files = pack([first, second]);
    const flat = readPackageZip(zipSync(files));
    expect(validatePackage(flat).counts.new).toBe(2);

    const nested: PackageFiles = {};
    for (const [name, data] of Object.entries(files)) nested[`bank-v1/${name}`] = data;
    expect(validatePackage(readPackageZip(zipSync(nested))).counts.new).toBe(2);
  });

  it('stops at a missing or foreign manifest', () => {
    expect(validatePackage({}).errors[0]).toContain('manifest.json is missing');
    const report = validatePackage(pack([first], (_f, m) => { m.format = 'something-else'; }));
    expect(report.ok).toBe(false);
  });

  it('reports a missing preview and a preview that is not an image', () => {
    const missing = validatePackage(pack([first], (f) => { delete f[`${first.division}/${first.key}/preview.png`]; }));
    expect(missing.templates[0].errors.join()).toContain('Missing file');
    const fake = validatePackage(pack([first], (f) => { f[`${first.division}/${first.key}/preview.png`] = strToU8('not a png'); }));
    expect(fake.templates[0].errors.join()).toContain('not a PNG');
  });

  it('reports a missing template file without rejecting its neighbours', () => {
    const report = validatePackage(pack([first, second], (f) => { delete f[`${first.division}/${first.key}/template.json`]; }));
    expect(report.counts).toMatchObject({ new: 1, rejected: 1 });
  });

  it('detects duplicates inside the package', () => {
    const twin = { ...clone(second), key: first.key, definition: { ...clone(second.definition), key: first.key } };
    const report = validatePackage(pack([first, twin]));
    expect(report.templates[1].errors.join()).toContain('Duplicate key');
  });

  it('detects what is already in the bank: same version skipped, newer accepted, older refused', () => {
    const files = pack([first]);
    expect(validatePackage(files, [{ key: first.key, version: 1 }]).counts.duplicate).toBe(1);
    expect(validatePackage(files, [{ key: first.key, version: 2 }]).counts.rejected).toBe(1);
    const v2 = { ...clone(first), version: 2 };
    expect(validatePackage(pack([v2]), [{ key: first.key, version: 1 }]).counts.update).toBe(1);
  });

  it('refuses to replace a built-in layout', () => {
    const key = DESIGN_TEMPLATES[0].key;
    const hijack = { ...clone(first), key, definition: { ...clone(first.definition), key } };
    expect(validatePackage(pack([hijack])).templates[0].errors.join()).toContain('built-in layout');
  });

  it('rejects a template whose layout fails the gate', () => {
    const broken = clone(first);
    broken.definition.slots = broken.definition.slots.filter((s) => s.role !== 'headline');
    expect(validatePackage(pack([broken])).templates[0].errors.join()).toContain('no headline');
  });

  it('treats a score inside a package as a claim: reported, never a pass or a fail', () => {
    const parts = Object.fromEntries(Object.keys(QUALITY_CRITERIA).map((k) => [k, 1]));
    const low = { ...clone(first), quality: { ...parts, total: 9, reviewer: 'The author' } } as BankTemplate;
    const report = validatePackage(pack([low]));
    expect(report.counts.new).toBe(1);
    expect(report.templates[0].warnings.join()).toContain('not a review of record');
  });

  it('writes package documents that describe the package they are in', () => {
    const report = validatePackage(pack(BANK_V1));
    const docs = packageDocs(BANK_V1, { ...report.manifest!, name: BANK_V1_NAME, version: BANK_V1_VERSION });
    expect(docs['README.md']).toContain(`${BANK_V1.length} templates`);
    expect(docs['QA-REPORT.md']).toContain('Nothing here has passed design review');
    for (const t of BANK_V1) expect(docs['TEMPLATE-INDEX.md']).toContain(t.id);
  });
});

describe('published templates in the catalogue', () => {
  afterEach(() => registerTemplates([]));

  it('joins the library, is found by key and by search, and can be withdrawn', () => {
    const before = allTemplates().length;
    registerTemplates([first.definition]);
    expect(allTemplates()).toHaveLength(before + 1);
    expect(templateByKey(first.key).key).toBe(first.key);
    expect(findTemplates(first.definition.label).map((t) => t.key)).toContain(first.key);

    registerTemplates([]);
    expect(allTemplates()).toHaveLength(before);
    expect(templateByKey(first.key)).toBe(DESIGN_TEMPLATES[0]);
  });

  it('never lets a published template shadow a built-in layout', () => {
    const builtIn = DESIGN_TEMPLATES[0];
    registerTemplates([{ ...first.definition, key: builtIn.key }]);
    expect(templateByKey(builtIn.key)).toBe(builtIn);
    expect(allTemplates()).toHaveLength(DESIGN_TEMPLATES.length);
  });

  it('will not hand a renderer a stored definition that no longer validates', () => {
    expect(usableDefinition(clone(first.definition))?.key).toBe(first.key);
    expect(usableDefinition({ ...clone(first.definition), slots: [] })).toBeNull();
    expect(usableDefinition('{}')).toBeNull();
  });
});

describe('auditFit', () => {
  /** Every character is half an em wide. Crude, and enough to test the logic. */
  const measure: Measure = (text, font) => text.length * (parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '0') * 0.5);

  const tpl = (slots: DesignTemplate['slots']): DesignTemplate => ({
    key: 'fit', label: 'Fit', desc: 'Fit', mood: 'bold', scheme: 'dark', surface: { kind: 'solid' }, slots,
  });

  it('is silent when everything fits', () => {
    const t = tpl([
      { role: 'headline', x: 0.1, y: 0.1, w: 0.8, size: 0.08 },
      { role: 'subline', x: 0.1, y: 0.6, w: 0.8, size: 0.03 },
    ]);
    expect(auditFit(t, { headline: 'Short line', subline: 'Under it' }, 1000, 1000, measure)).toEqual([]);
  });

  it('reports a headline that wraps onto the line beneath it', () => {
    const t = tpl([
      { role: 'headline', x: 0.1, y: 0.1, w: 0.8, size: 0.1 },
      { role: 'subline', x: 0.1, y: 0.25, w: 0.8, size: 0.03 },
    ]);
    const issues = auditFit(t, { headline: 'A much longer headline that needs three lines', subline: 'Under it' }, 1000, 1000, measure);
    expect(issues.some((i) => i.kind === 'overlap')).toBe(true);
  });

  it('reports a line the renderer would cut with an ellipsis', () => {
    const t = tpl([{ role: 'headline', x: 0.1, y: 0.1, w: 0.8, size: 0.05 }, { role: 'cta', x: 0.1, y: 0.8, w: 0.2, size: 0.04 }]);
    const issues = auditFit(t, { headline: 'Fine', cta: 'An action line far too long for its box' }, 1000, 1000, measure);
    expect(issues.some((i) => i.kind === 'cut' && i.slot === 'cta')).toBe(true);
  });

  it('reports a single word wider than its box', () => {
    const t = tpl([{ role: 'headline', x: 0.1, y: 0.1, w: 0.3, size: 0.2 }]);
    expect(auditFit(t, { headline: 'Extraordinary' }, 1000, 1000, measure).some((i) => i.kind === 'too-wide')).toBe(true);
  });

  it('reports a list that runs into the footer', () => {
    const t = tpl([
      { role: 'headline', x: 0.1, y: 0.05, w: 0.8, size: 0.05 },
      { role: 'services', x: 0.1, y: 0.3, w: 0.8, size: 0.05, gap: 2.4, max: 6 },
      { role: 'meta', x: 0.1, y: 0.1, w: 0.8, size: 0.02, fromBottom: true },
    ]);
    const issues = auditFit(t, { headline: 'List', services: ['a', 'b', 'c', 'd', 'e', 'f'], meta: 'Footer' }, 1000, 1000, measure);
    expect(issues.some((i) => i.kind === 'overlap')).toBe(true);
  });
});
