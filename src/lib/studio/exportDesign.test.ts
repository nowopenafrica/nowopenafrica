import { describe, it, expect } from 'vitest';

import {
  describeExport, exportFileName, exportSize, MAX_AREA, MAX_SIDE, pdfOrientation, pdfPlan, safeScale,
} from './exportDesign';
import { blankDocument } from './designDocument';

const page = (width: number, height: number) => ({ width, height });

describe('the size a file will come out', () => {
  it('is the document at 1x, not whatever the screen was', () => {
    expect(exportSize(page(1080, 1350), 1)).toEqual({ width: 1080, height: 1350 });
  });

  it('multiplies both sides by the scale', () => {
    expect(exportSize(page(1080, 1080), 2)).toEqual({ width: 2160, height: 2160 });
  });

  it('gives whole pixels', () => {
    const s = exportSize(page(1081, 1081), 1.5);
    expect(Number.isInteger(s.width)).toBe(true);
    expect(Number.isInteger(s.height)).toBe(true);
  });
});

describe('staying inside what a browser can actually rasterise', () => {
  it('leaves an ordinary export alone', () => {
    expect(safeScale(page(1080, 1080), 2)).toEqual({ scale: 2, reduced: false });
  });

  /*
   * The failure this exists to prevent: past the limit a canvas comes back
   * BLANK rather than throwing, so the customer gets an empty PNG and no
   * error anywhere.
   */
  it('reduces a scale that would exceed the side limit', () => {
    const r = safeScale(page(2000, 3000), 3);
    expect(r.reduced).toBe(true);
    const s = exportSize(page(2000, 3000), r.scale);
    expect(Math.max(s.width, s.height)).toBeLessThanOrEqual(MAX_SIDE);
  });

  it('reduces a scale that would exceed the total area', () => {
    const wide = page(4000, 4000);
    const r = safeScale(wide, 2);
    expect(r.reduced).toBe(true);
    const s = exportSize(wide, r.scale);
    expect(s.width * s.height).toBeLessThanOrEqual(MAX_AREA);
  });

  /* Every scale it returns must satisfy BOTH limits, not just the one that bit. */
  it('respects both limits across a range of page shapes', () => {
    const shapes = [page(1080, 1080), page(1080, 1920), page(3508, 2480), page(5000, 400), page(400, 5000)];
    for (const p of shapes) {
      for (const wanted of [1, 2, 3, 8]) {
        const { scale } = safeScale(p, wanted);
        const s = exportSize(p, scale);
        expect(Math.max(s.width, s.height), `${p.width}x${p.height} @${wanted}`).toBeLessThanOrEqual(MAX_SIDE + 1);
        expect(s.width * s.height, `${p.width}x${p.height} @${wanted}`).toBeLessThanOrEqual(MAX_AREA + MAX_SIDE);
      }
    }
  });

  it('never returns a scale of zero, which would export nothing', () => {
    const { scale } = safeScale(page(99999, 99999), 1);
    expect(scale).toBeGreaterThan(0);
  });

  /* A page with no size is a bug elsewhere; do not divide by it here. */
  it('does not divide by a zero-sized page', () => {
    expect(() => safeScale(page(0, 0), 2)).not.toThrow();
    expect(Number.isFinite(safeScale(page(0, 0), 2).scale)).toBe(true);
  });
});

describe('the filename', () => {
  it('comes from the title', () => {
    expect(exportFileName('Lagos Launch Flyer')).toBe('lagos-launch-flyer.png');
  });

  it('marks the scale only when it is not 1x', () => {
    expect(exportFileName('Flyer', { scale: 1 })).toBe('flyer.png');
    expect(exportFileName('Flyer', { scale: 2 })).toBe('flyer@2x.png');
  });

  /*
   * Titles are user text. A name is built from an allowlist, so nothing the
   * user types can become a path, an extension or a hidden file.
   */
  it('cannot become a path or a different file type', () => {
    for (const nasty of ['../../etc/passwd', 'a/b\\c', 'design.exe', '.htaccess', 'a\nb']) {
      const name = exportFileName(nasty);
      expect(name, nasty).not.toMatch(/[/\\]/);
      expect(name, nasty).toMatch(/^[a-z0-9-]+\.png$/);
    }
  });

  it('falls back to a usable name when the title is empty or unusable', () => {
    for (const empty of ['', '   ', '!!!', null, undefined]) {
      expect(exportFileName(empty)).toBe('nowopen-design.png');
    }
  });

  it('does not run on forever', () => {
    expect(exportFileName('x'.repeat(500)).length).toBeLessThanOrEqual(45);
  });

  it('uses the extension it is given', () => {
    expect(exportFileName('Flyer', { extension: 'pdf' })).toBe('flyer.pdf');
  });
});

describe('what the UI is told before an export runs', () => {
  it('reports the real size and filename together', () => {
    const doc = blankDocument(1080, 1350, 'Market Day');
    const d = describeExport(doc, doc.pages[0], 2);
    expect(d).toMatchObject({ width: 2160, height: 2700, filename: 'market-day@2x.png', reduced: false });
    expect(d.label).toBe('2160 × 2700');
  });

  /* The button says 2x; if it cannot deliver 2x, the screen has to say so. */
  it('admits when it had to reduce the scale', () => {
    const doc = blankDocument(4000, 4000, 'Billboard');
    expect(describeExport(doc, doc.pages[0], 2).reduced).toBe(true);
  });
});

describe('a multi-page PDF, planned before it runs', () => {
  const doc = blankDocument(1080, 1350, 'Spring Menu');
  const pages = [
    { ...doc.pages[0] },
    { ...doc.pages[0], id: 'p2', width: 1920, height: 1080 },
  ];

  it('names the file once, for the whole document', () => {
    expect(pdfPlan(doc, pages).filename).toBe('spring-menu.pdf');
  });

  /* Pages in one document may differ in size; each is measured on its own. */
  it('measures every page separately', () => {
    const plan = pdfPlan(doc, pages, 2);
    expect(plan.pages[0]).toMatchObject({ width: 2160, height: 2700, orientation: 'portrait' });
    expect(plan.pages[1]).toMatchObject({ width: 3840, height: 2160, orientation: 'landscape' });
  });

  it('reports when any page had to be reduced, not just the first', () => {
    const big = [{ ...doc.pages[0] }, { ...doc.pages[0], width: 4000, height: 4000 }];
    const plan = pdfPlan(doc, big, 2);
    expect(plan.pages[0].reduced).toBe(false);
    expect(plan.anyReduced).toBe(true);
  });

  it('calls a square page portrait rather than guessing', () => {
    expect(pdfOrientation({ width: 1080, height: 1080 })).toBe('portrait');
    expect(pdfOrientation({ width: 1081, height: 1080 })).toBe('landscape');
  });
});
