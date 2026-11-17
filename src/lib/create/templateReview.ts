import { unzipSync, strFromU8 } from 'fflate';

import type { TemplateRow } from './templateCatalogue';

/**
 * Reviewing an uploaded template before it reaches the public gallery.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────
 *
 * The founder's rule from the Creative Intelligence spec (D3, approved
 * 2026-11-15): a template is published only with a review that approves it,
 * scores 85 or more on the 100-point rubric, and records no critical
 * failure. The database enforces it (migration 20261117000000); this file is
 * the screen's copy, so the Publish button can say why it is off before
 * anybody presses it. When the two disagree, the database wins.
 *
 * ── WHERE THIS CAME FROM ─────────────────────────────────────────────────
 *
 * The Template Bank branch (claude/template-bank-wip) built a second
 * importer, table and gallery hook beside this one. Its package reading and
 * its rubric are what survive, here; the rest duplicated the Template
 * Manager and is not merged.
 */

/** The rubric. Must equal design_template_rubric() in the migration; a test reads the SQL. */
export const RUBRIC = [
  { key: 'originality', label: 'Originality', max: 15 },
  { key: 'art_direction', label: 'Art direction', max: 15 },
  { key: 'typography', label: 'Typography', max: 15 },
  { key: 'composition', label: 'Composition', max: 15 },
  { key: 'imagery', label: 'Imagery', max: 10 },
  { key: 'colour', label: 'Colour', max: 10 },
  { key: 'brand_relevance', label: 'Brand relevance', max: 10 },
  { key: 'commercial', label: 'Commercial effectiveness', max: 5 },
  { key: 'technical', label: 'Technical execution', max: 5 },
] as const;

export type RubricKey = (typeof RUBRIC)[number]['key'];
export type RubricLines = Record<RubricKey, number>;

/** The publication bar. Spec D3: 85, not the 80 the rubric calls "strong". */
export const PUBLISH_SCORE = 85;

export type ReviewDecision = 'approve' | 'revise' | 'reject';

export const rubricTotal = (lines: Partial<RubricLines>): number =>
  RUBRIC.reduce((sum, r) => sum + (Number.isFinite(lines[r.key]) ? (lines[r.key] as number) : 0), 0);

/** Problems with a set of lines; empty when every line is a whole number in range. */
export function rubricProblems(lines: Partial<RubricLines>): string[] {
  const out: string[] = [];
  for (const r of RUBRIC) {
    const v = lines[r.key];
    if (typeof v !== 'number' || !Number.isInteger(v)) out.push(`${r.label} needs a whole number`);
    else if (v < 0 || v > r.max) out.push(`${r.label} must be 0 to ${r.max}`);
  }
  return out;
}

export type GateState =
  | { publishable: true; why: 'legacy' | 'reviewed' }
  | { publishable: false; reasons: string[] };

/**
 * May this row be published now?
 *
 * Mirrors design_templates_publish_gate except for the content hash, which
 * only the database can compute the way it compares it. Nothing in the
 * screen edits a stored document, so a stale review shows up only as the
 * database refusing the publish, with its own message.
 */
export function gateFor(row: TemplateRow): GateState {
  if (row.status === 'published' && row.legacy_listing) return { publishable: true, why: 'legacy' };
  const reasons: string[] = [];
  if (!row.reviewed_at || !row.review_lines) {
    reasons.push('not reviewed');
    return { publishable: false, reasons };
  }
  if (row.review_decision !== 'approve') reasons.push(`the review says ${row.review_decision ?? 'nothing'}`);
  const score = row.review_score ?? 0;
  if (score < PUBLISH_SCORE) reasons.push(`scored ${score}, below ${PUBLISH_SCORE}`);
  const criticals = row.review_criticals ?? [];
  if (criticals.length) reasons.push(`critical ${criticals.join(', ')}`);
  return reasons.length ? { publishable: false, reasons } : { publishable: true, why: 'reviewed' };
}

/* ── ZIP packages ───────────────────────────────────────────────────────── */

/** Refuse archives that expand past these. A template package is JSON and pictures. */
export const MAX_ZIP_BYTES = 250 * 1024 * 1024;
export const MAX_ZIP_FILES = 5000;

/** What a ZIP held that the importer reads: the same files it takes one by one. */
const TEMPLATE_FILE = /\.(json|dc\.html?|html?)$/i;

/** Files a package carries for people, not for the importer. */
const NOT_A_TEMPLATE = /(^|\/)(manifest\.json|package\.json)$/i;

export interface ZipFile { name: string; type: string; text: () => Promise<string> }

export interface ZipRead {
  files: ZipFile[];
  /** Everything else in the archive (previews, readmes), counted, never silently dropped. */
  skipped: string[];
}

/**
 * Open a ZIP of templates.
 *
 * A ZIP is a bundle of the files the manager already takes one at a time:
 * template JSON and Claude Design artboards. Each then goes through the same
 * validation as a single upload, so there is one door and one set of rules.
 *
 * The Template Bank's package format (a manifest plus template.json files
 * that wrap a layout in metadata) is NOT read: its categories are not
 * Create's deliverable categories, and the only packages ever made in it
 * hold the 33 bank layouts, which are not merged. A wrapped file is refused
 * by the JSON validator with its reason, like any other bad file.
 */
export function readTemplateZip(bytes: Uint8Array, zipName: string): ZipRead {
  let total = 0;
  let count = 0;
  const raw = unzipSync(bytes, {
    filter: (f) => {
      if (f.name.endsWith('/')) return false;
      count += 1;
      total += f.originalSize;
      if (count > MAX_ZIP_FILES) throw new Error(`${zipName} holds more than ${MAX_ZIP_FILES} files.`);
      if (total > MAX_ZIP_BYTES) throw new Error(`${zipName} expands to more than ${MAX_ZIP_BYTES / 1024 / 1024} MB.`);
      return true;
    },
  });

  const files: ZipFile[] = [];
  const skipped: string[] = [];
  for (const [path, data] of Object.entries(raw).sort(([a], [b]) => a.localeCompare(b))) {
    const name = path.replace(/\\/g, '/');
    const base = name.split('/').pop() ?? name;
    if (name.startsWith('__MACOSX/') || base.startsWith('.')) continue;
    if (!TEMPLATE_FILE.test(name) || NOT_A_TEMPLATE.test(name)) { skipped.push(name); continue; }
    const isJson = /\.json$/i.test(name);
    files.push({
      // The path inside the ZIP, so two folders' "post.json" stay told apart in the report.
      name,
      type: isJson ? 'application/json' : 'text/html',
      text: () => Promise.resolve(strFromU8(data)),
    });
  }
  return { files, skipped };
}
