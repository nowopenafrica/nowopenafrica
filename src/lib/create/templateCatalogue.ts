/**
 * The catalogue Create Media actually shows: code templates plus published
 * uploads, as one list.
 *
 * ── WHY THIS MODULE HAD TO EXIST BEFORE THE UPLOAD SCREEN ────────────────
 *
 * `design_templates` is applied to live and `templateUpload.ts` validates a
 * file into a `DesignTemplate`. Neither of those puts a template in front of
 * anybody: six components import `DESIGN_TEMPLATES` directly, so a published
 * row appears in exactly zero places. Building the upload screen first would
 * have produced a dashboard that accepts work and then loses it.
 *
 * ── THE FAILURE MODE THIS IS SHAPED AROUND ───────────────────────────────
 *
 * The 66 code templates are the product's shop window. If this read fails —
 * the table is missing, the network is down, RLS changes — the gallery must
 * still show 66 layouts, not an empty page or a spinner. So `fetchCatalogue`
 * returns the code templates **on every path, including the failure path**,
 * and says separately whether the uploaded half could be read.
 *
 * That is the opposite default from `businessProjects.ts`, deliberately.
 * There, showing nothing would be a false claim about somebody's business;
 * here, showing nothing would hide work that is sitting in the repository.
 * Both rules come from the same principle: never let a failed read look like
 * an answer.
 *
 * ── CODE TEMPLATES WIN A KEY COLLISION ───────────────────────────────────
 *
 * The uploader is handed every existing key so it cannot choose one of the
 * 66. This re-checks on the way out anyway, because the upload path is not
 * the only way a row can reach the table — SQL exists — and a row that
 * shadows "editorial-split" would silently replace a template the gallery,
 * the editor, the motion studio and the deliverable counts all depend on.
 */

import { DESIGN_TEMPLATES, type DesignTemplate } from '../designTemplates';
import { readTemplateUpload, type Editability } from './templateUpload';
import {
  registerUploadedDeliverable, registerUploadedDeliverables,
  type Deliverable, type DeliverableCategory,
} from '../design/deliverables';
import { supabase } from '../supabase';
import { isListedWith, type ListingRule } from './needs';

/** Editorial state. Import state is separate — see the migration. */
export type TemplateStatus =
  | 'draft' | 'in_review' | 'approved' | 'published' | 'rejected' | 'archived';

export const TEMPLATE_STATUSES: TemplateStatus[] = [
  'draft', 'in_review', 'approved', 'published', 'rejected', 'archived',
];

export const STATUS_LABEL: Record<TemplateStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  published: 'Published',
  rejected: 'Rejected',
  archived: 'Archived',
};

/** A row as stored. `document` is the validated slot shape. */
export interface TemplateRow {
  id: string;
  key: string;
  label: string;
  description: string | null;
  category: string;
  styles: string[];
  industries: string[];
  tags: string[];
  document: unknown;
  editability: Editability;
  source_format: string | null;
  /** A DESIGN_FORMATS key, or null to take the product's own fallback. */
  format: string | null;
  preview_url: string | null;
  status: TemplateStatus;
  published_at: string | null;
  created_at: string;
}

/** An entry in the merged catalogue, carrying where it came from. */
export interface CatalogueEntry {
  template: DesignTemplate;
  origin: 'code' | 'uploaded';
  editability: Editability;
  /** The database id, for uploaded entries only. */
  rowId?: string;
}

export type CatalogueRead = {
  /** Always populated. The code half never depends on a network call. */
  entries: CatalogueEntry[];
  /**
   * Whether the uploaded half was readable. `false` means the list is
   * incomplete, not that nothing has been uploaded — the difference matters
   * enough to be a separate field rather than an empty array.
   */
  uploadedAvailable: boolean;
  /** Said out loud when `uploadedAvailable` is false. */
  reason?: string;
  /** Rows that were read but refused, with why. Never silently dropped. */
  rejected: { key: string; why: string }[];
};

const MISSING_TABLE = new Set(['42P01', 'PGRST205']);

/** The code half, as catalogue entries. Synchronous, always available. */
export function codeEntries(from: readonly DesignTemplate[] = DESIGN_TEMPLATES): CatalogueEntry[] {
  return from.map((template) => ({ template, origin: 'code', editability: 'full' }));
}

/**
 * Turn a stored row back into a template, through the SAME validator that
 * accepted it.
 *
 * Re-validating a row we wrote ourselves looks redundant and is not: the
 * document is `jsonb`, nothing in Postgres constrains its shape, and the row
 * can be written by hand. Running the one contract on both the way in and
 * the way out means there is no second, weaker definition of "valid".
 *
 * `taken` must contain every key already in the catalogue, so a row cannot
 * shadow a code template. A renamed key is reported, not hidden — a template
 * that quietly answers to a different key is a template whose saved designs
 * stop finding it.
 */
export function entryFromRow(
  row: TemplateRow,
  taken: ReadonlySet<string>,
): { ok: true; entry: CatalogueEntry; renamedFrom?: string; notes: string[] } | { ok: false; why: string } {
  const doc = row.document;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, why: 'its stored document is not an object' };
  }

  /*
   * The category lives in a column (it is what the index and the filters
   * read) and the validator wants it on the document. The column is the
   * authority: it is the field a reviewer classified.
   */
  /* `stored`: a look that no longer reads costs the row its look, not the row. */
  const result = readTemplateUpload(
    { ...(doc as object), key: row.key, category: row.category }, taken, { stored: true },
  );
  if (!result.ok) return { ok: false, why: result.reason };

  const template: DesignTemplate = {
    ...result.template,
    label: row.label || result.template.label,
    desc: row.description ?? result.template.desc,
    ...(row.tags.length ? { tags: row.tags } : {}),
  };

  return {
    ok: true,
    entry: { template, origin: 'uploaded', editability: row.editability, rowId: row.id },
    ...(template.key !== row.key ? { renamedFrom: row.key } : {}),
    notes: result.notes,
  };
}

/**
 * The entries that may be offered. `fetchCatalogue` returns every entry (the
 * code half is never dropped); listing is decided here, by the same rule as
 * `isListed`. An uploaded row in a gated subcategory with no passing review,
 * or with no review at all, is not offered.
 */
export function listedEntries(entries: readonly CatalogueEntry[], rule?: ListingRule): CatalogueEntry[] {
  return entries.filter((e) => isListedWith(e.template, rule));
}

/** Merge, with the code half first and collisions going to the code half. */
export function mergeEntries(
  code: readonly CatalogueEntry[],
  uploaded: readonly CatalogueEntry[],
): CatalogueEntry[] {
  const seen = new Set(code.map((e) => e.template.key));
  const merged = [...code];
  for (const entry of uploaded) {
    if (seen.has(entry.template.key)) continue;
    seen.add(entry.template.key);
    merged.push(entry);
  }
  return merged;
}

export const TEMPLATE_COLUMNS =
  'id,key,label,description,category,styles,industries,tags,document,editability,source_format,format,preview_url,status,published_at,created_at';

/**
 * The whole catalogue, for the public Create pages.
 *
 * Only published rows — RLS enforces that too, but asking for exactly what
 * is wanted means a staff member browsing Create sees the same catalogue a
 * visitor does, rather than their own drafts mixed in.
 */
export async function fetchCatalogue(): Promise<CatalogueRead> {
  const code = codeEntries();
  const { data, error } = await supabase
    .from('design_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(500);

  if (error) {
    return {
      entries: code,
      uploadedAvailable: false,
      reason: MISSING_TABLE.has(error.code ?? '')
        ? 'Uploaded templates are not switched on yet.'
        : 'We could not load uploaded templates just now.',
      rejected: [],
    };
  }

  const taken = new Set(code.map((e) => e.template.key));
  const uploaded: CatalogueEntry[] = [];
  const rejected: { key: string; why: string }[] = [];

  for (const row of (data ?? []) as unknown as TemplateRow[]) {
    const read = entryFromRow(normaliseRow(row), taken);
    if (!read.ok) { rejected.push({ key: row.key, why: read.why }); continue; }
    taken.add(read.entry.template.key);
    uploaded.push(read.entry);
  }

  /*
   * Classify the uploaded half, or it is invisible to every category count,
   * every category filter and every collection in `deliverables.ts` — it
   * would show in the "Everything" shelf and nowhere else.
   */
  registerUploadedDeliverables(deliverablesFor(uploaded, (data ?? []) as unknown as TemplateRow[]));

  return { entries: mergeEntries(code, uploaded), uploadedAvailable: true, rejected };
}

/**
 * The classification for each accepted upload, keyed the way the catalogue
 * addresses it.
 *
 * Keyed off the ENTRY's key rather than the row's, because a row whose key
 * collided with a code template was renamed on the way through and a
 * classification filed under the old one would never be found.
 */
export function deliverablesFor(
  entries: readonly CatalogueEntry[],
  rows: readonly TemplateRow[],
): Record<string, Deliverable> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: Record<string, Deliverable> = {};
  for (const entry of entries) {
    const row = entry.rowId ? byId.get(entry.rowId) : undefined;
    if (!row) continue;
    out[entry.template.key] = {
      category: row.category as DeliverableCategory,
      /* The uploader's own title. There is no second, friendlier name. */
      name: row.label || entry.template.label,
      ...(row.format ? { format: row.format } : {}),
    };
  }
  return out;
}

/** Null arrays out of Postgres are never iterated. */
export function normaliseRow(row: TemplateRow): TemplateRow {
  const strings = (v: unknown): string[] =>
    (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
  return {
    ...row,
    styles: strings(row.styles),
    industries: strings(row.industries),
    tags: strings(row.tags),
  };
}

/** Just the templates, for the many callers that want only the list. */
export const templatesOf = (read: CatalogueRead): DesignTemplate[] =>
  read.entries.map((e) => e.template);

/**
 * One template by key, wherever it lives.
 *
 * `/studio?template=<key>` is how a design opens for editing. Looking only
 * in `DESIGN_TEMPLATES` means a published upload opens an empty editor —
 * the deep link resolves, the page renders, and the design is gone.
 *
 * The code half is checked FIRST and synchronously, so the 66 layouts cost
 * nothing: a single row is fetched only for a key the bundle does not hold.
 */
export async function templateByKeyAnywhere(key: string): Promise<DesignTemplate | null> {
  if (!key) return null;
  const local = DESIGN_TEMPLATES.find((t) => t.key === key);
  if (local) return local;

  const { data, error } = await supabase
    .from('design_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('key', key)
    .eq('status', 'published')
    .maybeSingle();

  if (error || !data) return null;

  const row = normaliseRow(data as unknown as TemplateRow);
  const read = entryFromRow(row, new Set(DESIGN_TEMPLATES.map((t) => t.key)));
  if (!read.ok) return null;

  /*
   * Register this one row's classification.
   *
   * Opening a template by link does not go through `fetchCatalogue`, so
   * without this the editor knows the design and not what canvas it belongs
   * on — and every uploaded template opened square, whatever size it was
   * drawn at. One row's worth of the same registration the catalogue does.
   */
  for (const [k, value] of Object.entries(deliverablesFor([read.entry], [row]))) {
    registerUploadedDeliverable(k, value);
  }

  /*
   * A renamed key means this row was shadowing a code template, and the
   * code template was already returned above. Reaching here with a rename
   * means the link points at something that no longer answers to that key.
   */
  return read.entry.template;
}

export type TemplateRowsRead =
  | { state: 'ready'; rows: TemplateRow[] }
  /** The read failed. NEVER rendered as "no templates yet". */
  | { state: 'unavailable'; reason: string };

/**
 * Every row, for the staff screen.
 *
 * Empty is not the same as unavailable — eleven admin panels in this product
 * have already reported an empty table as a missing migration, and the
 * mirror of that mistake is a failed read that looks like an empty library
 * and invites somebody to upload everything a second time.
 */
export async function fetchTemplateRows(): Promise<TemplateRowsRead> {
  const { data, error } = await supabase
    .from('design_templates')
    .select(TEMPLATE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return {
      state: 'unavailable',
      reason: MISSING_TABLE.has(error.code ?? '')
        ? 'The template table is not applied to this database yet.'
        : `We could not read the template library: ${error.message}`,
    };
  }

  return {
    state: 'ready',
    rows: ((data ?? []) as unknown as TemplateRow[]).map(normaliseRow),
  };
}
