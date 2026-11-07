import { describe, it, expect } from 'vitest';

import { MAX_PDF_PAGES, PDF_RENDER_MAX, documentFromPdf, pdfFailure, pdfSummary, renderScale } from './importPdf';
import type { ReferencePlan } from './reference';

/*
 * Only the parts that are data. `renderPdf` needs a real canvas and a real
 * pdf.js worker; it is exercised in the browser, not pretended at here with a
 * mock that would pass whatever it was told to pass.
 */

describe('how big a page is rendered', () => {
  it('lands the longest side on the target', () => {
    /* A4 at 72dpi is 595 x 842 points. */
    expect(renderScale(595, 842) * 842).toBeCloseTo(PDF_RENDER_MAX, 5);
    expect(renderScale(842, 595) * 842).toBeCloseTo(PDF_RENDER_MAX, 5);
  });

  /*
   * A business card is 243 x 153 points. Scaled to the target it would be
   * magnified more than six times into a blurry wall of pixels that costs
   * upload bandwidth and shows no more detail than the PDF contained.
   */
  it('will not blow a small page up without limit', () => {
    expect(renderScale(243, 153)).toBe(4);
  });

  it('survives a page with no size', () => {
    expect(renderScale(0, 0)).toBe(1);
    expect(renderScale(Number.NaN, 100)).toBe(1);
  });
});

describe('why a PDF would not open', () => {
  it('says what to do about a password', () => {
    const err = Object.assign(new Error('No password given'), { name: 'PasswordException' });
    expect(pdfFailure(err)).toMatch(/password/i);
    expect(pdfFailure(err)).toMatch(/save a copy/i);
  });

  it('says plainly when the file is not a PDF', () => {
    expect(pdfFailure(Object.assign(new Error('x'), { name: 'InvalidPDFException' })))
      .toMatch(/not a readable PDF/);
  });

  it('still says something useful for anything else', () => {
    expect(pdfFailure(new Error('the worker died'))).toMatch(/the worker died/);
    expect(pdfFailure('???')).toMatch(/could not be opened/);
  });
});

describe('the document that comes out', () => {
  const plan = (regions: number): ReferencePlan => ({
    width: 1200,
    height: 1600,
    background: '#ffffff',
    palette: [{ hex: '#0a7d4b', weight: 0.4 }, { hex: '#ffffff', weight: 0.6 }],
    regions: Array.from({ length: regions }, (_, i) => ({
      x: 0.1, y: 0.1 + i * 0.2, w: 0.8, h: 0.1, confidence: 0.8,
    })),
    dark: false,
  });

  it('becomes one page per rendered PDF page, named in order', () => {
    const doc = documentFromPdf(
      [{ plan: plan(1), assetId: 'a.png' }, { plan: plan(2), assetId: 'b.png' }],
      'Autumn flyer',
    );
    expect(doc.pages.map((p) => p.name)).toEqual(['Page 1', 'Page 2']);
    expect(doc.title).toBe('Autumn flyer');
  });

  it('keeps each page\'s own reference picture, not the first one twice', () => {
    const doc = documentFromPdf(
      [{ plan: plan(1), assetId: 'a.png' }, { plan: plan(1), assetId: 'b.png' }],
      'x',
    );
    const assets = doc.pages.map((p) => p.objects.find((o) => o.type === 'image'));
    expect(assets.map((o) => (o as { assetId: string }).assetId)).toEqual(['a.png', 'b.png']);
  });

  /*
   * The reference is the thing being traced over. Unlocked, the first drag
   * moves the picture instead of the text on top of it.
   */
  it('leaves the reference locked underneath', () => {
    const doc = documentFromPdf([{ plan: plan(1), assetId: 'a.png' }], 'x');
    expect(doc.pages[0].objects.find((o) => o.type === 'image')).toMatchObject({ locked: true, z: 1 });
  });

  /*
   * ── THE LINE THIS FEATURE IS NOT ALLOWED TO CROSS ────────────────────
   *
   * Nothing here reads the words off the page. A detected area is an empty
   * box that says what it is, because a flyer that looks right and says
   * something the business never said is worse than an obvious blank.
   */
  it('never puts words into a detected area', () => {
    const doc = documentFromPdf([{ plan: plan(3), assetId: 'a.png' }], 'x');
    const texts = doc.pages[0].objects.filter((o) => o.type === 'text');
    expect(texts).toHaveLength(3);
    for (const t of texts) expect((t as { text: string }).text).toBe('Type the words here');
  });
});

describe('what the user is told', () => {
  /*
   * A SCANNED page is still a picture, and must still say so. This is the
   * sentence that stops a reconstruction being mistaken for an import.
   */
  it('calls a scan a reference to draw over, not an editable import', () => {
    const summary = pdfSummary(2, 2, 5);
    expect(summary).toMatch(/opened as a reference to draw over/);
    expect(summary).toMatch(/words were not read/);
  });

  /*
   * A born-digital page gets the opposite sentence, because it is the
   * opposite outcome: the document's own words, at the document's own
   * positions. Saying "a reference to draw over" for that would describe a
   * worse product than the one that ran.
   */
  it('says when the real text was read, and how much of it', () => {
    const summary = pdfSummary(2, 2, 0, 37);
    expect(summary).toMatch(/37 lines of real editable text/);
    expect(summary).toMatch(/laid out as the file had them/);
    expect(summary).not.toMatch(/reference to draw over/);
    expect(summary).not.toMatch(/words were not read/);
  });

  /* A report with a scanned signature page is both, and says both. */
  it('describes a mixed file as both', () => {
    const summary = pdfSummary(3, 3, 4, 20);
    expect(summary).toMatch(/20 lines of real editable text/);
    expect(summary).toMatch(/scanned pages/);
  });

  it('says when pages were left out', () => {
    expect(pdfSummary(MAX_PDF_PAGES, 40, 3)).toMatch(/30 further pages were left out/);
  });

  it('says so when no text areas were found', () => {
    expect(pdfSummary(1, 1, 0)).toMatch(/no clear text areas/);
  });
});
