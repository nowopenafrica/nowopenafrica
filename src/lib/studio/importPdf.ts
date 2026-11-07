/**
 * Opening a PDF — as a reference, which is the only honest thing to call it.
 *
 * ── WHY THIS IS NOT "IMPORT A PDF AS EDITABLE VECTORS" ───────────────────
 *
 * A PDF is a page description, not an authoring format. By the time a design
 * is a PDF its text is positioned glyph runs against an embedded font subset,
 * its paragraphs are gone, its layers are gone, and a rounded rectangle is a
 * sequence of curve operators with no memory of having been a rectangle. A
 * tool that claims to turn that back into editable objects is either
 * producing a pile of unusable path fragments or quietly rasterising the page
 * and calling it editable.
 *
 * So this does the thing it can actually do, and says so: it renders the
 * pages and hands them to the reconstruction path that already exists for a
 * photograph of a design — reference locked underneath, page proportions,
 * palette, and an editable text block over each busy area. The words are NOT
 * read. See lib/studio/reference.ts for why a guessed headline is worse than
 * an empty one.
 *
 * A .pptx, by contrast, really does come in editable — see importPptx.ts.
 * That difference is a property of the two file formats, not of effort.
 *
 * ── WHY THE LIBRARY IS LOADED LATE ───────────────────────────────────────
 *
 * pdf.js is large. Imported at the top of the editor it would sit in the
 * chunk every visitor downloads to open a design, to pay for a feature most
 * of them never use. Everything here is behind a dynamic import, so the cost
 * lands on the person who actually chose a PDF.
 */

import type { DesignDocument } from './designDocument';
import { documentFromReference, type ReferencePlan } from './reference';
import {
  groupTextLines, hasUsableText, inkColour, patchColour,
  type PdfTextLine, type PdfTextPiece,
} from './pdfText';
import { objectId, type DesignObject, type DesignPage } from './designDocument';

/** The longest side a page is rendered at, before upload compression. */
export const PDF_RENDER_MAX = 1600;

/** More pages than anybody is going to redraw by hand in one sitting. */
export const MAX_PDF_PAGES = 10;

/**
 * The zoom to render a page at.
 *
 * A PDF page is measured in points, so an A4 page is 595 x 842 and renders at
 * 1:1 as a thumbnail. The scale is chosen to land the longest side on
 * `maxSide`, with a ceiling so a tiny page — a label, a business card — is
 * not blown up into a blurry wall of pixels.
 */
export function renderScale(width: number, height: number, maxSide = PDF_RENDER_MAX): number {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0) return 1;
  return Math.min(4, Math.max(0.1, maxSide / longest));
}

/** What a PDF cannot be opened for, in words that say what to do next. */
export function pdfFailure(err: unknown): string {
  const name = (err as { name?: string })?.name ?? '';
  if (name === 'PasswordException') {
    return 'That PDF is password protected. Open it, remove the password and save a copy, then try again.';
  }
  if (name === 'InvalidPDFException') return 'That file is not a readable PDF.';
  const message = err instanceof Error ? err.message : '';
  return message ? `That PDF could not be opened: ${message}` : 'That PDF could not be opened.';
}

export interface RenderedPage {
  /** The rendered page, ready to be measured and uploaded. */
  blob: Blob;
  pixels: ImageData;
  width: number;
  height: number;
  /**
   * The page's OWN text, when it has any.
   *
   * A born-digital PDF carries every string with its position, size and
   * font. Reading that is the difference between importing a document and
   * guessing at a picture of one.
   */
  lines: PdfTextLine[];
}

export interface PdfRender {
  pages: RenderedPage[];
  /** How many pages the file actually has, which may exceed what was rendered. */
  pageCount: number;
}

/**
 * Render the first pages of a PDF.
 *
 * Kept apart from the document assembly below so the half that needs a real
 * browser is as small as possible, and the half that can be reasoned about
 * is ordinary data.
 */
export async function renderPdf(data: ArrayBuffer, limit = MAX_PDF_PAGES): Promise<PdfRender> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const task = pdfjs.getDocument({
    data,
    /*
     * This app's Content-Security-Policy has no 'unsafe-eval', and pdf.js
     * uses eval for some font programs when it is allowed to. Turning it off
     * here means a graceful fallback rather than a console full of CSP
     * violations and a page that half renders.
     */
    isEvalSupported: false,
  });

  const file = await task.promise;
  try {
    const pages: RenderedPage[] = [];
    const count = Math.min(file.numPages, limit);

    for (let n = 1; n <= count; n += 1) {
      const page = await file.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: renderScale(base.width, base.height) });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('this browser would not provide a canvas to draw on');

      /* A PDF page has no background of its own; without this it composites
       * onto transparency and every analysis below reads it as black. */
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      page.cleanup();

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('the rendered page could not be read back');

      /*
       * The text, mapped into the SAME pixel space as the raster above.
       *
       * `Util.transform` composes the viewport with the item's own matrix,
       * which is what turns PDF user space (origin bottom-left, y upward)
       * into the top-left pixel space everything else here uses. Doing it by
       * hand is where this goes wrong.
       */
      const pieces: PdfTextPiece[] = [];
      try {
        const content = await page.getTextContent();
        for (const item of content.items) {
          const run = item as { str?: string; width?: number; transform?: number[]; fontName?: string };
          if (typeof run.str !== 'string' || !run.str.trim() || !run.transform) continue;
          const tx = pdfjs.Util.transform(viewport.transform, run.transform);
          /* Rows 2 and 3 of the composed matrix carry the glyph height. */
          const fontHeight = Math.hypot(tx[2], tx[3]);
          if (!(fontHeight > 0)) continue;
          const face = (run.fontName ?? '').toLowerCase();
          pieces.push({
            str: run.str,
            x: tx[4],
            /* tx[5] is the BASELINE; the box starts a font-height above it. */
            y: tx[5] - fontHeight,
            width: (run.width ?? 0) * viewport.scale,
            height: fontHeight,
            bold: /bold|black|heavy|semib/.test(face),
            italic: /italic|oblique/.test(face),
          });
        }
      } catch {
        /* A PDF with no text layer, or one pdf.js cannot read. Not an error:
           the page is simply a picture, and the caller handles that. */
      }

      pages.push({
        blob,
        pixels: ctx.getImageData(0, 0, canvas.width, canvas.height),
        width: canvas.width,
        height: canvas.height,
        lines: groupTextLines(pieces),
      });
    }

    return { pages, pageCount: file.numPages };
  } finally {
    /* The worker holds the whole file in memory until this happens. */
    await file.destroy();
  }
}

/**
 * Is this page a document, or a picture of one?
 *
 * The answer decides everything else, so it is one function with one rule
 * rather than a condition buried in the assembly.
 */
export const pageHasText = (page: RenderedPage): boolean =>
  hasUsableText(page.lines, page.width);

/**
 * One page, rebuilt from the text the file actually carries.
 *
 * The rendered raster stays as the background — it holds every logo, rule
 * and photograph, which IS the layout and must not change. On top of it,
 * each line of real text becomes a real text object at its real position.
 *
 * Each line also gets a patch behind it, sampled from the page either side,
 * because the raster still contains the original words. Without it, editing
 * a line would leave the old one showing through underneath. The patch is
 * invisible until the text is changed, and over a photograph or a gradient
 * it will show — stated in `pdfText.ts`, and still better than ghosting.
 */
export function faithfulPage(
  page: RenderedPage,
  assetId: string,
  name: string,
): DesignPage {
  const objects: DesignObject[] = [];
  let z = 0;

  for (const line of page.lines) {
    const x = line.x / page.width;
    const y = line.y / page.height;
    const w = Math.min(1 - Math.max(0, x), line.width / page.width);
    const h = Math.min(1 - Math.max(0, y), line.height / page.height);
    if (!(w > 0) || !(h > 0)) continue;

    const box = { x: line.x, y: line.y, width: line.width, height: line.height };
    z += 1;
    objects.push({
      id: objectId('s'),
      type: 'shape',
      shape: 'rect',
      name: 'Text background',
      x: Math.max(0, x), y: Math.max(0, y), w, h,
      rotation: 0, opacity: 1, visible: true, locked: false, z,
      fill: patchColour(page.pixels, box),
    });

    z += 1;
    objects.push({
      id: objectId('t'),
      type: 'text',
      name: line.text.slice(0, 40) || 'Text',
      x: Math.max(0, x), y: Math.max(0, y), w, h,
      rotation: 0, opacity: 1, visible: true, locked: false, z,
      text: line.text,
      /* Size is a fraction of the WIDTH, because that is what the renderer
         sets type in. The same unit trap as everywhere else in this engine. */
      size: line.size / page.width,
      weight: line.bold ? 700 : 400,
      colour: inkColour(page.pixels, box),
    });
  }

  return {
    id: objectId('pg'),
    name,
    width: page.width,
    height: page.height,
    objects,
    backgroundMedia: { assetId, kind: 'image', fit: 'cover', dim: 0 },
  };
}

/**
 * Build one document from the rendered pages.
 *
 * Each page goes through the SAME reconstruction a photographed design does,
 * so there is one behaviour to understand and one place where "the words were
 * not read" is enforced.
 */
export function documentFromPdf(
  pages: { plan: ReferencePlan; assetId: string }[],
  title: string,
): DesignDocument {
  const first = documentFromReference(pages[0].plan, pages[0].assetId, title.slice(0, 80) || 'Imported PDF');
  return {
    ...first,
    pages: pages.map((page, i) => {
      const built = documentFromReference(page.plan, page.assetId, title).pages[0];
      return { ...built, name: `Page ${i + 1}` };
    }),
  };
}

/**
 * What the user is told once it is open.
 *
 * The two kinds of page get different sentences, because they are genuinely
 * different outcomes: one gives back the document's own words, the other
 * gives back a picture with areas marked out. Saying "imported" for both
 * would make the second look like a failure of the first.
 */
export function pdfSummary(
  rendered: number,
  pageCount: number,
  regions: number,
  linesRead = 0,
): string {
  const parts: string[] = [];
  if (linesRead > 0) {
    parts.push(`${rendered} ${rendered === 1 ? 'page' : 'pages'} opened with ${linesRead} `
      + `${linesRead === 1 ? 'line' : 'lines'} of real editable text, laid out as the file had them`);
  } else {
    parts.push(`${rendered} ${rendered === 1 ? 'page' : 'pages'} opened as a reference to draw over`);
  }
  if (pageCount > rendered) parts.push(`${pageCount - rendered} further pages were left out`);
  if (regions > 0) {
    parts.push(`${regions} text ${regions === 1 ? 'area' : 'areas'} on scanned pages were marked out — `
      + 'those words were not read, so type them in');
  } else if (linesRead === 0) {
    parts.push('no clear text areas were found, so add text where you need it');
  }
  return `${parts.join('. ')}.`;
}
