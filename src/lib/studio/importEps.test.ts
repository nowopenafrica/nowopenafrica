import { describe, it, expect } from 'vitest';

import { NO_EMBEDDED_PDF, embeddedPdf, isPdfBytes } from './importEps';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

const join = (...parts: string[]) => enc(parts.join('\n'));

/** A complete little PDF, as the inner document. */
const PDF = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF';

describe('finding the PDF inside an EPS', () => {
  /*
   * Illustrator has written "PDF-compatible" EPS for decades: the PostScript
   * for a printer, and a complete PDF carried alongside it in a private
   * section. That PDF is the only part anything here can open.
   */
  it('cuts out the embedded document whole', () => {
    const eps = join(
      '%!PS-Adobe-3.0 EPSF-3.0',
      '%%BoundingBox: 0 0 595 842',
      '%%Creator: Adobe Illustrator',
      '%AI9_PrivateDataBegin',
      PDF,
      '%AI9_PrivateDataEnd',
      '%%Trailer',
      '%%EOF',
    );
    const inner = embeddedPdf(eps);
    expect(inner).not.toBeNull();
    expect(dec(inner!)).toBe(PDF);
  });

  /*
   * ── THE TRAP ─────────────────────────────────────────────────────────
   *
   * `%%EOF` is also a PostScript document-structuring comment, so the LAST
   * one in the file belongs to the PostScript, usually kilobytes past the
   * end of the PDF. Cutting there hands pdf.js a document with a tail of
   * PostScript stuck to it.
   */
  it('stops at the PDF\'s end, not the PostScript\'s', () => {
    const eps = join('%!PS-Adobe-3.0 EPSF-3.0', '%AI9_PrivateDataBegin', PDF, '%AI9_PrivateDataEnd',
      'showpage', '%%Trailer', '%%EOF');
    expect(dec(embeddedPdf(eps)!)).not.toMatch(/showpage/);
  });

  it('copes with no private markers, taking the last end-of-file before them', () => {
    const eps = join('%!PS-Adobe-3.0 EPSF-3.0', '%%BoundingBox: 0 0 10 10', PDF);
    expect(dec(embeddedPdf(eps)!)).toBe(PDF);
  });

  /* A DOS EPS begins with a binary header before the PostScript ever starts. */
  it('finds it past a binary preview header', () => {
    const header = new Uint8Array([0xc5, 0xd0, 0xd3, 0xc6, 0, 0, 0, 0, 1, 2, 3, 4]);
    const body = join('%!PS-Adobe-3.0 EPSF-3.0', '%AI9_PrivateDataBegin', PDF, '%AI9_PrivateDataEnd');
    const file = new Uint8Array(header.length + body.length);
    file.set(header); file.set(body, header.length);
    expect(dec(embeddedPdf(file)!)).toBe(PDF);
  });
});

describe('when there is no PDF inside', () => {
  /*
   * Plenty of EPS files are pure PostScript — an older tool, a plotting
   * library, Illustrator with PDF compatibility switched off. PostScript is
   * a program, and running an uploaded one is not on the table.
   */
  it('says so rather than returning something broken', () => {
    const eps = join('%!PS-Adobe-3.0 EPSF-3.0', '%%BoundingBox: 0 0 100 100',
      '0 0 moveto 100 100 lineto stroke', 'showpage', '%%EOF');
    expect(embeddedPdf(eps)).toBeNull();
  });

  it('refuses a truncated embed rather than handing over half a document', () => {
    /* The header is there; the end never arrives. */
    expect(embeddedPdf(join('%!PS-Adobe-3.0', '%PDF-1.4', '1 0 obj'))).toBeNull();
  });

  it('tells the user the one thing that fixes it', () => {
    expect(NO_EMBEDDED_PDF).toMatch(/Re-export it as PDF or SVG/);
    expect(NO_EMBEDDED_PDF).toMatch(/SVG will come in as editable shapes/);
  });
});

describe('a file that is already a PDF', () => {
  /* A modern .ai file simply IS one, whatever the extension says. */
  it('is recognised by its header', () => {
    expect(isPdfBytes(enc(PDF))).toBe(true);
    expect(isPdfBytes(enc('%!PS-Adobe-3.0 EPSF-3.0'))).toBe(false);
  });

  it('is not claimed by a PDF buried deep in some other file', () => {
    expect(isPdfBytes(enc(`${'x'.repeat(2000)}%PDF-1.4`))).toBe(false);
  });
});
