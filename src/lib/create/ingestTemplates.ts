/**
 * One door into the catalogue, for both kinds of file.
 *
 * ── THE TWO SOURCES ──────────────────────────────────────────────────────
 *
 * A template reaches Create Media one of two ways:
 *
 *   1. **Native JSON** — the slot shape, written or exported from here.
 *      Nothing to convert; `readTemplateUpload` validates it.
 *   2. **A Claude Design artboard** (`.dc.html`) — a real design, laid out
 *      with flexbox, which has to be rendered and MEASURED before its
 *      geometry is known. See designCanvas.ts and measureArtboard.ts.
 *
 * Both end as the same `DesignTemplate`, which is what keeps the rest of the
 * product — gallery, editor, exporter, Motion Studio — unchanged.
 *
 * ── WHY MEASUREMENT IS INJECTED ──────────────────────────────────────────
 *
 * Laying an artboard out needs a browser. Everything else here is a decision
 * about what a file is and whether it may be published, and decisions should
 * be testable without one. So the measuring step arrives as an argument, and
 * the tests hand in the geometry they want to reason about.
 */

import { parseDesignCanvas } from './designCanvas';
import { templateFromArtboard } from './canvasSlots';
import { classifyArtboard, cleanLabel, type ArtboardClass } from './classifyArtboard';
import { classifyUpload, readTemplateUpload, templateKeyFrom, type Editability } from './templateUpload';
import type { Measured } from './measureArtboard';
import type { ParsedArtboard } from './designCanvas';
import type { DesignTemplate } from '../designTemplates';

export interface TemplateDraft {
  template: DesignTemplate;
  editability: Editability;
  /** 'json' or 'dc.html' — what it arrived as, recorded on the row. */
  sourceFormat: string;
  category: string;
  format: string;
  styles: string[];
  industries: string[];
  tags: string[];
  publish: boolean;
  /** Corrections and losses, said out loud. Never swallowed. */
  notes: string[];
  /** Why this category and canvas were proposed, when they were proposed. */
  because?: string;
}

export type Ingested =
  | { ok: true; fileName: string; draft: TemplateDraft }
  | { ok: false; fileName: string; reason: string };

/** Lays the artboard out and reads the boxes back. Supplied by the caller. */
export type Measurer = (board: ParsedArtboard) => Promise<Measured>;

const isArtboard = (name: string, text: string): boolean =>
  /\.dc\.html?$/i.test(name) || /<x-dc[\s>]/i.test(text);

/**
 * Read one file into a publishable draft, or say why not.
 *
 * `taken` must hold every key the catalogue already answers to — the shipped
 * layouts included — so an import can never shadow one of them.
 */
export async function ingestFile(
  file: { name: string; type: string; text: () => Promise<string> },
  taken: ReadonlySet<string>,
  measure: Measurer,
): Promise<Ingested> {
  const fileName = file.name;

  /*
   * An artboard is recognised by its content as well as its name, because a
   * file saved out of a canvas is often just "Main.html" and refusing it on
   * the extension alone would send somebody to rename files.
   */
  let text = '';
  const looksTextual = /\.(json|html?)$/i.test(fileName) || /json|html/i.test(file.type);
  if (looksTextual) {
    try { text = await file.text(); } catch { return { ok: false, fileName, reason: 'That file could not be read.' }; }
  }

  if (text && isArtboard(fileName, text)) return ingestArtboard(fileName, text, taken, measure);

  const kind = classifyUpload(fileName, file.type);
  if (!kind.supported) return { ok: false, fileName, reason: kind.reason };
  if (kind.becomes !== 'full') {
    return {
      ok: false,
      fileName,
      reason: `A .${kind.ext} is a picture, not a layout — nothing in the editor could change its words or resize it. `
        + 'Upload artwork in the Brand Asset Manager, or the design itself as an artboard or template JSON.',
    };
  }

  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (e) {
    return { ok: false, fileName, reason: `That file is not readable JSON: ${(e as Error).message}` };
  }

  const result = readTemplateUpload(parsed, taken);
  if (!result.ok) return { ok: false, fileName, reason: result.reason };

  const raw = parsed as Record<string, unknown>;
  return {
    ok: true,
    fileName,
    draft: {
      template: result.template,
      editability: result.editability,
      sourceFormat: 'json',
      category: String(raw.category ?? ''),
      format: '',
      styles: result.template.styles ?? [],
      industries: [],
      tags: result.template.tags ?? [],
      publish: false,
      notes: result.notes,
    },
  };
}

async function ingestArtboard(
  fileName: string,
  text: string,
  taken: ReadonlySet<string>,
  measure: Measurer,
): Promise<Ingested> {
  const parsed = parseDesignCanvas(text);
  if (!parsed.ok) return { ok: false, fileName, reason: parsed.reason };

  const { runs, shapes } = await measure(parsed.board);
  const built = templateFromArtboard(parsed.board, runs, shapes);
  if (!built.ok) return { ok: false, fileName, reason: built.reason };

  /*
   * The filename helps say what a design is FOR; only the artboard's own
   * title may decide how big it is. "A3-ID-Front.dc.html" is a staff ID
   * card whose board code reads exactly like a paper size.
   */
  const proposal: ArtboardClass = classifyArtboard(
    `${parsed.board.title} ${fileName}`,
    parsed.board.width,
    parsed.board.height,
    parsed.board.title,
  );

  /*
   * The key comes from the FILE, not the title. Two artboards called
   * "Carousel" exist in this system and are different designs; their file
   * names are not.
   */
  const stem = fileName.replace(/\.dc\.html?$/i, '').replace(/\.html?$/i, '');

  const label = cleanLabel(parsed.board.title, stem.replace(/[-_]+/g, ' '));

  return {
    ok: true,
    fileName,
    draft: {
      template: { ...built.template, key: templateKeyFrom(stem, taken), label },
      /*
       * Every slot is live type at a measured position: the same thing a
       * template written in code is. Nothing here is a flattened picture,
       * which is what 'partial' would mean.
       */
      editability: 'full',
      sourceFormat: 'dc.html',
      category: proposal.category,
      format: proposal.format,
      styles: [],
      industries: [],
      tags: proposal.tags,
      publish: false,
      notes: built.notes,
      because: proposal.because,
    },
  };
}

/**
 * Read a whole selection, one at a time, keeping keys unique across the run.
 *
 * Sequential rather than parallel on purpose: each artboard is laid out in a
 * real frame, and fifty frames at once is how a browser tab stops answering.
 * The key set grows as it goes, so importing two files that both want
 * "carousel" gives the second one its own key instead of losing it.
 */
export async function ingestFiles(
  files: readonly { name: string; type: string; text: () => Promise<string> }[],
  taken: ReadonlySet<string>,
  measure: Measurer,
  onProgress?: (done: number, total: number) => void,
): Promise<Ingested[]> {
  const claimed = new Set(taken);
  const out: Ingested[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const result = await ingestFile(files[i], claimed, measure);
    if (result.ok) claimed.add(result.draft.template.key);
    out.push(result);
    onProgress?.(i + 1, files.length);
  }
  return out;
}
