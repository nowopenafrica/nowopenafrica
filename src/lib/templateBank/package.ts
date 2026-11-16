import { unzipSync, strFromU8 } from 'fflate';
import { DESIGN_TEMPLATES, type DesignTemplate } from '../designTemplates';
import { DESIGN_FORMATS } from '../../data/studioPresets';
import { INDUSTRY_GROUPS } from '../design/taxonomy';
import { DESIGN_STYLES } from '../design/styles';
import { gateTemplate, parseTemplate, TEMPLATE_KEY_PATTERN } from './schema';

/**
 * The Template Bank package: what a ZIP must contain to be importable.
 *
 * A package is a manifest plus one folder per template holding `template.json`
 * (metadata wrapped around a native DesignTemplate) and `preview.png`. The
 * definition is the editable source — the same data shape the built-in
 * catalogue uses — so an imported template is editable, restylable and
 * resizable exactly like a built-in one. The preview is for catalogues and
 * humans; the product always renders from the definition.
 */

export const PACKAGE_FORMAT = 'nowopen-template-bank';
export const PACKAGE_FORMAT_VERSION = 1;

export const DIVISIONS = [
  { key: '01-brand-identity', code: 'BR', label: 'Brand identity and corporate design' },
  { key: '02-social-media', code: 'SM', label: 'Social media and digital marketing' },
  { key: '03-advertising-outdoor', code: 'AD', label: 'Advertising and outdoor' },
  { key: '04-events-entertainment', code: 'EV', label: 'Events and entertainment' },
  { key: '05-packaging-products', code: 'PK', label: 'Packaging and product design' },
  { key: '06-print-merchandise', code: 'PM', label: 'Print and promotional merchandise' },
  { key: '07-photography-motion', code: 'PV', label: 'Photography, motion and creative production' },
] as const;

export type DivisionKey = typeof DIVISIONS[number]['key'];

/** The scoring rubric, with the most each criterion can earn. Sums to 100. */
export const QUALITY_CRITERIA = {
  originality: 15,
  artDirection: 15,
  typography: 15,
  composition: 15,
  imagery: 10,
  colour: 10,
  brandAdaptability: 10,
  commercialEffectiveness: 5,
  technicalExecution: 5,
} as const;

export type QualityCriterion = keyof typeof QUALITY_CRITERIA;

/**
 * The score a reviewer must record before a template can be published.
 *
 * Enforced at publish, in the database, against the score a reviewer enters in
 * admin. A score carried inside a package is the author's claim about their
 * own work and is shown as such; it never opens the gate.
 */
export const MIN_QUALITY_SCORE = 80;

export interface QualityScore extends Record<QualityCriterion, number> {
  total: number;
  /** Who scored it. */
  reviewer: string;
}

export interface BankTemplate {
  id: string;
  key: string;
  version: number;
  name: string;
  division: DivisionKey;
  category: string;
  subcategory: string;
  industries: string[];
  designStyle: string;
  concept: string;
  description: string;
  /** DESIGN_FORMATS keys this was art-directed for, primary first. */
  formats: string[];
  dimensions: { width: number; height: number; unit: 'px' };
  aspectRatio: string;
  medium: 'digital' | 'print' | 'both';
  typography: string[];
  palette: string;
  imageRequirements: string;
  tags: string[];
  difficulty: 'simple' | 'standard' | 'advanced';
  licence: string;
  /** A score claimed by the package. Provisional: only a review recorded in admin counts. */
  quality?: QualityScore;
  /** The built-in style this layout was art-directed in. Any style still applies. */
  recommendedStyle: string;
  /** Brand colour the preview was rendered in. */
  previewAccent: string;
  /** Placeholder copy showing what each slot is for. Never a real business. */
  sample: BankSample;
  definition: DesignTemplate;
}

export interface BankSample {
  brand?: string;
  eyebrow?: string;
  headline?: string;
  subline?: string;
  meta?: string;
  cta?: string;
  services?: string[];
  stats?: { value: string; label: string }[];
  contact?: string[];
  price?: { label: string; price: string; was?: string }[];
}

export interface ManifestEntry {
  id: string;
  key: string;
  version: number;
  division: DivisionKey;
  /** Path of template.json inside the ZIP. */
  source: string;
  preview: string;
}

export interface BankManifest {
  format: typeof PACKAGE_FORMAT;
  formatVersion: number;
  name: string;
  version: string;
  createdAt: string;
  templates: ManifestEntry[];
}

export type PackageFiles = Record<string, Uint8Array>;

/** Refuse archives that expand past this. A template bank is JSON and PNGs. */
export const MAX_PACKAGE_BYTES = 250 * 1024 * 1024;
export const MAX_PACKAGE_FILES = 5000;

export function readPackageZip(bytes: Uint8Array): PackageFiles {
  let total = 0;
  let count = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      if (file.name.endsWith('/')) return false;
      count += 1;
      total += file.originalSize;
      if (count > MAX_PACKAGE_FILES) throw new Error(`This archive holds more than ${MAX_PACKAGE_FILES} files.`);
      if (total > MAX_PACKAGE_BYTES) throw new Error('This archive is larger than a template bank should be.');
      return true;
    },
  });
  const out: PackageFiles = {};
  for (const [name, data] of Object.entries(files)) out[name.replace(/\\/g, '/').replace(/^\.?\//, '')] = data;
  return stripSingleRoot(out);
}

/** A ZIP made by compressing a folder has everything under one directory. */
function stripSingleRoot(files: PackageFiles): PackageFiles {
  const names = Object.keys(files);
  if (names.includes('manifest.json') || !names.length) return files;
  const root = names[0].split('/')[0];
  if (!names.every((n) => n.startsWith(`${root}/`)) || !names.includes(`${root}/manifest.json`)) return files;
  const out: PackageFiles = {};
  for (const n of names) out[n.slice(root.length + 1)] = files[n];
  return out;
}

export type TemplateVerdict = 'new' | 'update' | 'duplicate' | 'rejected';

export interface TemplateReport {
  id: string;
  key: string;
  version: number;
  source: string;
  verdict: TemplateVerdict;
  errors: string[];
  warnings: string[];
  /** Present whenever the file parsed far enough to preview. */
  template?: BankTemplate;
}

export interface PackageReport {
  ok: boolean;
  manifest?: BankManifest;
  /** Problems with the package as a whole. Any of these blocks the import. */
  errors: string[];
  warnings: string[];
  templates: TemplateReport[];
  counts: Record<TemplateVerdict, number>;
}

export interface ExistingTemplate { key: string; version: number }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown, max = 600): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

function readJson(files: PackageFiles, path: string): { value?: unknown; error?: string } {
  const data = files[path];
  if (!data) return { error: `${path} is missing` };
  try { return { value: JSON.parse(strFromU8(data)) }; } catch { return { error: `${path} is not valid JSON` }; }
}

function checkManifest(raw: unknown, errors: string[]): BankManifest | undefined {
  if (!isObj(raw)) { errors.push('manifest.json must be an object'); return undefined; }
  if (raw.format !== PACKAGE_FORMAT) errors.push(`manifest.json format must be "${PACKAGE_FORMAT}"`);
  if (raw.formatVersion !== PACKAGE_FORMAT_VERSION) {
    errors.push(`This importer reads format version ${PACKAGE_FORMAT_VERSION}; the package is version ${String(raw.formatVersion)}`);
  }
  if (!isText(raw.name, 120)) errors.push('manifest.json needs a name');
  if (!isText(raw.version, 20) || !/^\d+\.\d+\.\d+$/.test(raw.version)) errors.push('manifest.json version must look like 1.0.0');
  if (!Array.isArray(raw.templates) || !raw.templates.length) { errors.push('manifest.json lists no templates'); return undefined; }

  const divisions = new Set<string>(DIVISIONS.map((d) => d.key));
  const entries: ManifestEntry[] = [];
  raw.templates.forEach((e: unknown, i: number) => {
    if (!isObj(e) || !isText(e.id, 40) || !isText(e.key, 60) || !Number.isInteger(e.version)
      || !isText(e.source, 240) || !isText(e.preview, 240) || typeof e.division !== 'string' || !divisions.has(e.division)) {
      errors.push(`manifest.json templates[${i}] is incomplete`);
      return;
    }
    entries.push({
      id: e.id, key: e.key, version: e.version as number,
      division: e.division as DivisionKey, source: e.source, preview: e.preview,
    });
  });
  if (errors.length) return undefined;
  return {
    format: PACKAGE_FORMAT, formatVersion: PACKAGE_FORMAT_VERSION,
    name: raw.name as string, version: raw.version as string,
    createdAt: isText(raw.createdAt, 40) ? raw.createdAt : '', templates: entries,
  };
}

function checkQuality(raw: unknown, errors: string[]): QualityScore | undefined {
  if (!isObj(raw)) { errors.push('quality: is required'); return undefined; }
  let sum = 0;
  const out: Partial<QualityScore> = {};
  for (const [name, max] of Object.entries(QUALITY_CRITERIA) as [QualityCriterion, number][]) {
    const v = raw[name];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) {
      errors.push(`quality.${name}: must be 0 to ${max}`);
      continue;
    }
    out[name] = v;
    sum += v;
  }
  if (!isText(raw.reviewer, 120)) errors.push('quality.reviewer: is required');
  if (raw.total !== sum) errors.push(`quality.total: must equal the sum of its criteria (${sum})`);
  if (errors.some((e) => e.startsWith('quality'))) return undefined;
  return { ...(out as Record<QualityCriterion, number>), total: sum, reviewer: raw.reviewer as string };
}

function checkSample(raw: unknown, errors: string[]): BankSample {
  if (!isObj(raw)) { errors.push('sample: is required'); return {}; }
  const out: BankSample = {};
  const line = (v: unknown) => typeof v === 'string' && v.length <= 240;
  for (const field of ['brand', 'eyebrow', 'headline', 'subline', 'meta', 'cta'] as const) {
    if (raw[field] === undefined) continue;
    if (!line(raw[field])) errors.push(`sample.${field}: must be a short string`);
    else out[field] = raw[field] as string;
  }
  for (const field of ['services', 'contact'] as const) {
    const v = raw[field];
    if (v === undefined) continue;
    if (!Array.isArray(v) || v.length > 12 || !v.every(line)) errors.push(`sample.${field}: must be a list of short strings`);
    else out[field] = v as string[];
  }
  if (raw.stats !== undefined) {
    const v = raw.stats;
    if (!Array.isArray(v) || v.length > 8 || !v.every((r) => isObj(r) && line(r.value) && line(r.label))) errors.push('sample.stats: must be a list of value and label pairs');
    else out.stats = (v as Record<string, string>[]).map((r) => ({ value: r.value, label: r.label }));
  }
  if (raw.price !== undefined) {
    const v = raw.price;
    if (!Array.isArray(v) || v.length > 12 || !v.every((r) => isObj(r) && line(r.label) && line(r.price) && (r.was === undefined || line(r.was)))) errors.push('sample.price: must be a list of label and price rows');
    else out.price = (v as Record<string, string>[]).map((r) => (r.was ? { label: r.label, price: r.price, was: r.was } : { label: r.label, price: r.price }));
  }
  if (!out.headline) errors.push('sample.headline: is required');
  return out;
}

function checkTemplate(raw: unknown, entry: ManifestEntry): { template?: BankTemplate; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(raw)) return { errors: ['template.json must be an object'], warnings };

  const text = (field: string, max = 600) => {
    if (!isText(raw[field], max)) errors.push(`${field}: is required`);
    return raw[field] as string;
  };
  const oneOf = <T extends string>(field: string, allowed: readonly T[]): T => {
    if (!allowed.includes(raw[field] as T)) errors.push(`${field}: must be one of ${allowed.join(', ')}`);
    return raw[field] as T;
  };
  const list = (field: string, allowed?: readonly string[]) => {
    const v = raw[field];
    if (!Array.isArray(v) || v.some((x) => !isText(x, 80))) { errors.push(`${field}: must be a list of strings`); return [] as string[]; }
    const bad = allowed ? (v as string[]).filter((x) => !allowed.includes(x)) : [];
    if (bad.length) errors.push(`${field}: unknown value${bad.length > 1 ? 's' : ''} ${bad.join(', ')}`);
    return v as string[];
  };

  if (raw.id !== entry.id) errors.push(`id: is "${String(raw.id)}" but the manifest says "${entry.id}"`);
  if (raw.key !== entry.key) errors.push(`key: is "${String(raw.key)}" but the manifest says "${entry.key}"`);
  if (raw.version !== entry.version) errors.push('version: does not match the manifest');
  if (raw.division !== entry.division) errors.push('division: does not match the manifest');
  if (!TEMPLATE_KEY_PATTERN.test(entry.key)) errors.push('key: must be lower-case words joined by hyphens');
  if (entry.version < 1) errors.push('version: must be 1 or more');

  const name = text('name', 60);
  const category = text('category', 80);
  const subcategory = text('subcategory', 80);
  const designStyle = text('designStyle', 60);
  const concept = text('concept');
  const description = text('description');
  const palette = text('palette');
  const imageRequirements = text('imageRequirements');
  const licence = text('licence');
  const aspectRatio = text('aspectRatio', 12);
  const medium = oneOf('medium', ['digital', 'print', 'both'] as const);
  const difficulty = oneOf('difficulty', ['simple', 'standard', 'advanced'] as const);
  const industries = list('industries', INDUSTRY_GROUPS);
  const formats = list('formats', DESIGN_FORMATS.map((f) => f.key));
  const typography = list('typography');
  const tags = list('tags');
  if (!formats.length) errors.push('formats: needs at least one');

  const dim = raw.dimensions;
  let dimensions: BankTemplate['dimensions'] = { width: 0, height: 0, unit: 'px' };
  if (!isObj(dim) || !Number.isInteger(dim.width) || !Number.isInteger(dim.height)
    || (dim.width as number) < 100 || (dim.height as number) < 100 || dim.unit !== 'px') {
    errors.push('dimensions: needs a width, a height and unit "px"');
  } else dimensions = { width: dim.width as number, height: dim.height as number, unit: 'px' };

  const recommendedStyle = oneOf('recommendedStyle', DESIGN_STYLES.map((st) => st.key));
  const previewAccent = typeof raw.previewAccent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.previewAccent)
    ? raw.previewAccent
    : (errors.push('previewAccent: must be a 6-digit hex colour'), '#2563eb');
  const sample = checkSample(raw.sample, errors);

  const quality = raw.quality === undefined ? undefined : checkQuality(raw.quality, errors);
  if (quality) warnings.push(`Carries a claimed score of ${quality.total} from "${quality.reviewer}". It is not a review of record.`);

  const parsed = parseTemplate(raw.definition);
  if (!parsed.ok) {
    errors.push(...parsed.errors.map((e) => `definition.${e}`));
    return { errors, warnings };
  }
  const definition = parsed.template;
  if (definition.key !== entry.key) errors.push('definition.key: must match the template key');
  errors.push(...gateTemplate(definition).map((issue) => `layout: ${issue}`));

  const missingIndustries = industries.filter((g) => !(definition.industries ?? []).includes(g));
  if (missingIndustries.length) warnings.push('industries differ between the metadata and the layout definition');

  return {
    errors, warnings,
    template: {
      id: entry.id, key: entry.key, version: entry.version, name, division: entry.division,
      category, subcategory, industries, designStyle, concept, description, formats, dimensions,
      aspectRatio, medium, typography, palette, imageRequirements, tags, difficulty, licence,
      ...(quality ? { quality } : {}), recommendedStyle, previewAccent, sample, definition,
    },
  };
}

/**
 * Check a whole package before anything is written.
 *
 * `existing` is every key and version already in the bank, so a re-upload is
 * reported as a duplicate and a higher version as an update. Built-in layout
 * keys are always refused: saved designs point at those keys.
 */
export function validatePackage(files: PackageFiles, existing: ExistingTemplate[] = []): PackageReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const empty = { new: 0, update: 0, duplicate: 0, rejected: 0 };

  const manifestFile = readJson(files, 'manifest.json');
  if (manifestFile.error) return { ok: false, errors: [manifestFile.error], warnings, templates: [], counts: empty };
  const manifest = checkManifest(manifestFile.value, errors);
  if (!manifest) return { ok: false, errors, warnings, templates: [], counts: empty };

  const builtIn = new Set(DESIGN_TEMPLATES.map((t) => t.key));
  const latest = new Map<string, number>();
  for (const e of existing) latest.set(e.key, Math.max(latest.get(e.key) ?? 0, e.version));

  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const listed = new Set<string>();

  const templates = manifest.templates.map((entry): TemplateReport => {
    listed.add(entry.source);
    const report: TemplateReport = {
      id: entry.id, key: entry.key, version: entry.version, source: entry.source,
      verdict: 'rejected', errors: [], warnings: [],
    };

    if (seenIds.has(entry.id)) report.errors.push(`Duplicate id ${entry.id} inside this package`);
    if (seenKeys.has(entry.key)) report.errors.push(`Duplicate key ${entry.key} inside this package`);
    seenIds.add(entry.id);
    seenKeys.add(entry.key);
    if (builtIn.has(entry.key)) report.errors.push(`"${entry.key}" is a built-in layout and cannot be replaced by an import`);

    const preview = files[entry.preview];
    if (!preview) report.errors.push(`Missing file: ${entry.preview}`);
    else if (!isPng(preview)) report.errors.push(`${entry.preview} is not a PNG image`);

    const source = readJson(files, entry.source);
    if (source.error) {
      report.errors.push(files[entry.source] ? source.error : `Missing file: ${entry.source}`);
      return report;
    }

    const checked = checkTemplate(source.value, entry);
    report.errors.push(...checked.errors);
    report.warnings.push(...checked.warnings);
    report.template = checked.template;
    if (report.errors.length) return report;

    const have = latest.get(entry.key) ?? 0;
    if (have === entry.version) {
      report.verdict = 'duplicate';
      report.warnings.push(`Version ${entry.version} is already in the bank; it will be skipped.`);
    } else if (have > entry.version) {
      report.errors.push(`The bank already holds version ${have}; this is version ${entry.version}`);
    } else report.verdict = have ? 'update' : 'new';
    return report;
  });

  const unlisted = Object.keys(files).filter((n) => n.endsWith('/template.json') && !listed.has(n));
  if (unlisted.length) warnings.push(`${unlisted.length} template file${unlisted.length > 1 ? 's are' : ' is'} not in the manifest and will be ignored: ${unlisted.slice(0, 5).join(', ')}`);

  const counts = { ...empty };
  for (const t of templates) counts[t.verdict] += 1;
  if (!counts.new && !counts.update) warnings.push('Nothing in this package is new.');

  return { ok: errors.length === 0, manifest, errors, warnings, templates, counts };
}

/** The templates an import would actually write. */
export const importable = (report: PackageReport): BankTemplate[] =>
  report.templates
    .filter((t) => (t.verdict === 'new' || t.verdict === 'update') && t.template)
    .map((t) => t.template as BankTemplate);
