/**
 * Opening an EPS — by finding the PDF hidden inside it.
 *
 * ── WHAT AN EPS ACTUALLY IS ──────────────────────────────────────────────
 *
 * PostScript. A program, not a document: a stream of drawing instructions in
 * a Turing-complete language that a printer was meant to execute. No browser
 * has a PostScript interpreter, pdf.js explicitly is not one, and running an
 * uploaded program would be the exact thing this project refuses to do.
 *
 * ── SO WHY THIS WORKS ANYWAY, MOST OF THE TIME ───────────────────────────
 *
 * Illustrator has written "PDF-compatible" EPS for about twenty-five years:
 * the PostScript is still there for a printer, and a COMPLETE PDF document is
 * carried alongside it inside the same file, between private markers. An .ai
 * file from any modern version goes further and simply IS a PDF with an
 * Illustrator-specific private section.
 *
 * So this does not interpret anything. It finds the embedded PDF, cuts it out
 * and hands it to the PDF path — which opens it as a reference to draw over,
 * for the reasons set out in importPdf.ts.
 *
 * ── AND WHEN THERE ISN'T ONE ─────────────────────────────────────────────
 *
 * Plenty of EPS files are pure PostScript with no PDF inside — anything from
 * an older tool, a scientific plotting library, or Illustrator with PDF
 * compatibility switched off. Those cannot be opened here and are REFUSED
 * with the one instruction that actually solves it: re-export as PDF or SVG.
 * A file that silently opened blank would be worse.
 *
 * Some EPS files carry a preview image instead, but the format specifies TIFF
 * or Windows Metafile for it — neither of which a browser can draw — and it
 * is a low-resolution thumbnail for page layout, not artwork worth tracing.
 */

/** The marker Illustrator puts around the PDF it embeds in an EPS. */
const AI_PRIVATE_END = '%AI9_PrivateDataEnd';

/** Index of `needle` in `hay`, searching from `from`, or -1. */
function indexOf(hay: Uint8Array, needle: string, from = 0): number {
  const pattern = new TextEncoder().encode(needle);
  outer: for (let i = Math.max(0, from); i <= hay.length - pattern.length; i += 1) {
    for (let j = 0; j < pattern.length; j += 1) {
      if (hay[i + j] !== pattern[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** Last index of `needle` at or after `from`, or -1. */
function lastIndexOf(hay: Uint8Array, needle: string, from = 0): number {
  const pattern = new TextEncoder().encode(needle);
  outer: for (let i = hay.length - pattern.length; i >= from; i -= 1) {
    for (let j = 0; j < pattern.length; j += 1) {
      if (hay[i + j] !== pattern[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Cut the embedded PDF out of an EPS or AI file.
 *
 * Returns null when there is not one, which is a real answer and not a
 * failure to look properly.
 */
export function embeddedPdf(bytes: Uint8Array): Uint8Array | null {
  const start = indexOf(bytes, '%PDF-');
  if (start < 0) return null;

  /*
   * Illustrator's own end marker first, because it is exact.
   *
   * Falling straight to the last `%%EOF` is wrong here: `%%EOF` is also a
   * PostScript document-structuring comment, so the last one in the file is
   * usually the PostScript's, several kilobytes past the end of the PDF.
   */
  const privateEnd = indexOf(bytes, AI_PRIVATE_END, start);
  const limit = privateEnd > 0 ? privateEnd : bytes.length;

  const eof = lastIndexOf(bytes.subarray(0, limit), '%%EOF', start);
  if (eof < 0) return null;

  return bytes.slice(start, eof + '%%EOF'.length);
}

/** True for a file that is simply a PDF already, whatever it is called. */
export const isPdfBytes = (bytes: Uint8Array): boolean => indexOf(bytes.subarray(0, 1024), '%PDF-') >= 0;

/**
 * What to say when there is no PDF inside.
 *
 * Names the one action that fixes it. "Unsupported file" tells somebody
 * holding a logo their designer sent them absolutely nothing.
 */
export const NO_EMBEDDED_PDF =
  'That EPS has no PDF inside it, and PostScript cannot be opened here. '
  + 'Re-export it as PDF or SVG from the program that made it — SVG will come in as editable shapes.';
