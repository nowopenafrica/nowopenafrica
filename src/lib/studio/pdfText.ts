/**
 * The text a PDF already contains.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────
 *
 * The importer rendered every page to pixels and then ran it through the
 * reconstruction built for a PHOTOGRAPHED design — the one that looks at
 * blocks of contrast and guesses "there is probably a headline here".
 *
 * For a photograph that is the only thing you can do. For a born-digital PDF
 * it is indefensible: the file already carries every string, its position,
 * its size and its font. Rendering that to pixels and guessing at it is
 * throwing away perfect data and replacing it with an approximation — which
 * is exactly what "it tries to recreate the text" means.
 *
 * So: when a page has real text, use the real text. When it does not — a
 * scan, a photograph saved as PDF — the page genuinely IS a picture and the
 * old path is the honest answer.
 *
 * ── WHY RUNS MUST BE GROUPED ─────────────────────────────────────────────
 *
 * pdf.js does not hand back lines. It hands back RUNS: a change of font,
 * kerning or colour starts a new item, so one headline can arrive as eight
 * pieces. Importing those as eight text objects is technically faithful and
 * practically useless — nobody wants to edit a headline in eight boxes.
 *
 * They are regrouped here into lines, by baseline and by the gaps between
 * them, so what you click is what a person would call a line of text.
 */

import type { Bitmap } from './reference';
import { toHex } from './reference';

/** One run as pdf.js reports it, already mapped into page pixels. */
export interface PdfTextPiece {
  str: string;
  /** Top-left of the glyph box, in page pixels at scale 1. */
  x: number;
  y: number;
  width: number;
  /** The font's height in page pixels — not the glyph's ink height. */
  height: number;
  bold: boolean;
  italic: boolean;
}

export interface PdfTextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The dominant font height on this line. */
  size: number;
  bold: boolean;
}

/**
 * Same line, or not?
 *
 * Compared on the CENTRE rather than the top, because a run set in a smaller
 * face on the same baseline — a currency symbol, a superscript — has a
 * different top and belongs to the line all the same.
 */
function sameLine(a: PdfTextPiece, b: PdfTextPiece): boolean {
  const centreA = a.y + a.height / 2;
  const centreB = b.y + b.height / 2;
  const tolerance = Math.min(a.height, b.height) * 0.5;
  return Math.abs(centreA - centreB) <= tolerance;
}

export function groupTextLines(pieces: readonly PdfTextPiece[]): PdfTextLine[] {
  const usable = pieces.filter((p) => p.str.trim().length > 0 && p.height > 0);
  if (!usable.length) return [];

  /* Top to bottom, then left to right — reading order. */
  const sorted = [...usable].sort((a, b) => (a.y - b.y) || (a.x - b.x));

  const rows: PdfTextPiece[][] = [];
  for (const piece of sorted) {
    const row = rows.find((r) => sameLine(r[0], piece));
    if (row) row.push(piece);
    else rows.push([piece]);
  }

  return rows.map((row) => {
    const ordered = [...row].sort((a, b) => a.x - b.x);
    const size = ordered.reduce((tallest, p) => Math.max(tallest, p.height), 0);

    let text = '';
    let previous: PdfTextPiece | null = null;
    for (const piece of ordered) {
      if (previous) {
        const gap = piece.x - (previous.x + previous.width);
        /*
         * A run break is not a space. pdf.js splits mid-word on a kerning
         * pair, so joining every run with " " inserts spaces into words.
         * A quarter of the type size is the gap at which a reader would see
         * one — below that the pieces are touching.
         */
        if (gap > size * 0.25) text += ' ';
      }
      text += piece.str;
      previous = piece;
    }

    const left = ordered[0].x;
    const right = ordered.reduce((edge, p) => Math.max(edge, p.x + p.width), 0);
    const top = ordered.reduce((edge, p) => Math.min(edge, p.y), Infinity);
    const bottom = ordered.reduce((edge, p) => Math.max(edge, p.y + p.height), 0);

    return {
      text: text.replace(/\s+/g, ' ').trim(),
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
      size,
      /* Bold when most of the line's width is set in a bold face. */
      bold: ordered.filter((p) => p.bold).reduce((w, p) => w + p.width, 0) > (right - left) / 2,
    };
  }).filter((line) => line.text.length > 0);
}

/**
 * Is this page worth treating as text at all?
 *
 * A scanned page sometimes carries a handful of stray characters from an OCR
 * layer or a stamped page number. Rebuilding that as "the text of the page"
 * would be worse than admitting it is a picture, so a page has to carry a
 * real amount of text before the faithful path is used.
 */
export function hasUsableText(lines: readonly PdfTextLine[], pageWidth: number): boolean {
  if (lines.length < 2) return false;
  const characters = lines.reduce((n, l) => n + l.text.length, 0);
  if (characters < 24) return false;
  /* And it has to span something: a single page number is not a document. */
  const widest = lines.reduce((w, l) => Math.max(w, l.width), 0);
  return widest > pageWidth * 0.1;
}

/**
 * The colour to lay behind a line so the baked-in text stops showing.
 *
 * The rendered page is kept as the background, because that is what holds
 * every logo, rule and photograph — the layout, in other words, which must
 * not change. But it also holds the ORIGINAL text, so an editable line
 * placed on top would sit over its own ghost the moment it was edited.
 *
 * So each line gets a patch sampled from the pixels immediately AROUND the
 * glyph box: the band above and below, which is page background wherever the
 * text sits on a flat ground. Honest limitation: over a photograph or a
 * gradient, a flat patch is visible. It is still better than ghosting, and
 * it only shows once the words are changed.
 */
export function patchColour(img: Bitmap, box: { x: number; y: number; width: number; height: number }): string {
  const band = Math.max(1, Math.round(box.height * 0.35));
  const x0 = Math.max(0, Math.floor(box.x));
  const x1 = Math.min(img.width - 1, Math.ceil(box.x + box.width));
  const above = Math.floor(box.y) - band;
  const below = Math.ceil(box.y + box.height);

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const read = (yStart: number) => {
    for (let y = yStart; y < yStart + band; y += 1) {
      if (y < 0 || y >= img.height) continue;
      for (let x = x0; x <= x1; x += 2) {
        const i = (y * img.width + x) * 4;
        r += img.data[i];
        g += img.data[i + 1];
        b += img.data[i + 2];
        n += 1;
      }
    }
  };
  read(above);
  read(below);

  /* Nothing to sample — a line flush against the edge. White is the paper. */
  if (!n) return '#ffffff';
  return toHex(r / n, g / n, b / n);
}

/** The colour to set the text itself, read from the darkest ink in its box. */
export function inkColour(img: Bitmap, box: { x: number; y: number; width: number; height: number }): string {
  const x0 = Math.max(0, Math.floor(box.x));
  const x1 = Math.min(img.width - 1, Math.ceil(box.x + box.width));
  const y0 = Math.max(0, Math.floor(box.y));
  const y1 = Math.min(img.height - 1, Math.ceil(box.y + box.height));

  let best = Infinity;
  let hex = '#111827';
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * img.width + x) * 4;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      /* Darkest by simple sum: the glyph ink against its own background. */
      const sum = r + g + b;
      if (sum < best) {
        best = sum;
        hex = toHex(r, g, b);
      }
    }
  }
  return hex;
}
