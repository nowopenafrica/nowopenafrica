import type { DesignDocument, DesignPage } from './designDocument';

/**
 * What leaves the editor.
 *
 * ── WHY ANY OF THIS IS A MODULE ──────────────────────────────────────────
 *
 * The rasterising is already solved: lib/studio.ts waits for every typeface
 * and image, warms html-to-image's cache and captures at a forced design
 * width. What is NOT solved by that helper is deciding how big a file may be
 * and what it should be called, and those are the two things that go wrong
 * silently — an export that exceeds the browser's canvas limit comes back
 * blank or throws deep inside a library, and a filename assembled from a
 * user's title can contain a path separator.
 *
 * Both are arithmetic and string handling, so they are decided here and
 * checked without a browser.
 */

/** The scales offered in the UI. 1 is the document's own pixel size. */
export const EXPORT_SCALES = [1, 2] as const;
export type ExportScale = (typeof EXPORT_SCALES)[number];

/**
 * The ceiling a canvas may not cross.
 *
 * 4096 on a side (and the square of that in total area) is the limit iOS
 * Safari has historically enforced; above it the canvas comes back blank
 * rather than failing, which is the worst possible outcome — the customer
 * gets an empty PNG and no error. Desktop Chrome would allow far more, but
 * this editor's audience is overwhelmingly on mid-range Android and iPhones,
 * and a file that exists everywhere beats a bigger file that is sometimes
 * empty.
 */
export const MAX_SIDE = 4096;
export const MAX_AREA = MAX_SIDE * MAX_SIDE;

/** The pixel size a capture at this scale would produce. */
export function exportSize(page: Pick<DesignPage, 'width' | 'height'>, scale: number) {
  return { width: Math.round(page.width * scale), height: Math.round(page.height * scale) };
}

/**
 * The largest scale at or below the one asked for that the browser can hold.
 *
 * Reports whether it had to reduce, because the UI has to SAY so. Quietly
 * handing back a smaller file than the "2×" button promised is the kind of
 * small lie that costs a customer a print job.
 */
export function safeScale(
  page: Pick<DesignPage, 'width' | 'height'>,
  wanted: number,
  limits: { maxSide?: number; maxArea?: number } = {},
): { scale: number; reduced: boolean } {
  const maxSide = limits.maxSide ?? MAX_SIDE;
  const maxArea = limits.maxArea ?? MAX_AREA;
  const longest = Math.max(page.width, page.height);

  /* A page with no size cannot be exported at all; do not divide by it. */
  if (longest <= 0) return { scale: wanted, reduced: false };

  const bySide = maxSide / longest;
  const byArea = Math.sqrt(maxArea / (page.width * page.height));
  const allowed = Math.min(bySide, byArea);

  if (wanted <= allowed) return { scale: wanted, reduced: false };
  /*
   * Two decimals, rounded DOWN. Rounding up would re-cross the limit that
   * this function exists to stay under.
   */
  return { scale: Math.max(0.01, Math.floor(allowed * 100) / 100), reduced: true };
}

/**
 * A filename from the design's title.
 *
 * Titles are user text, so they can contain slashes, dots and newlines. A
 * name is built from an allowlist rather than by removing the characters we
 * happen to think of, so `../../etc/passwd` and `My design.png` both come out
 * as ordinary names.
 */
export function exportFileName(
  title: string | null | undefined,
  opts: { scale?: number; extension?: string } = {},
): string {
  const extension = opts.extension ?? 'png';
  const base = (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  const scale = opts.scale && opts.scale !== 1 ? `@${opts.scale}x` : '';
  return `${base || 'nowopen-design'}${scale}.${extension}`;
}

/** Everything the UI needs to describe one export before it runs. */
export function describeExport(doc: Pick<DesignDocument, 'title'>, page: DesignPage, wanted: number) {
  const { scale, reduced } = safeScale(page, wanted);
  const size = exportSize(page, scale);
  return {
    scale,
    reduced,
    ...size,
    filename: exportFileName(doc.title, { scale: wanted }),
    label: `${size.width} × ${size.height}`,
  };
}

/**
 * ── THE PDF THIS PRODUCT CAN HONESTLY PRODUCE ────────────────────────────
 *
 * One rasterised image per page. It is NOT a print-ready PDF: the text in it
 * is a picture, so nothing is selectable, no fonts are embedded, there is no
 * vector artwork, no CMYK, no colour profile, no bleed and no trim marks.
 *
 * Saying so matters more than the feature does. A PDF that silently lacks
 * bleed is discovered at the printer, by the customer, after they have paid.
 * The button therefore says "image PDF", and nothing in the product claims
 * prepress support the pipeline does not implement.
 */

/** Portrait unless the page is wider than it is tall. */
export const pdfOrientation = (page: { width: number; height: number }): 'portrait' | 'landscape' =>
  (page.width > page.height ? 'landscape' : 'portrait');

/**
 * What a multi-page export will contain, worked out before it runs.
 *
 * Pages may differ in size within one document, so each is measured on its
 * own terms rather than letting the first page speak for all of them.
 */
export function pdfPlan(
  doc: Pick<DesignDocument, 'title'>,
  pages: DesignPage[],
  wanted = 2,
): {
  filename: string;
  pages: { width: number; height: number; scale: number; reduced: boolean; orientation: 'portrait' | 'landscape' }[];
  anyReduced: boolean;
} {
  const planned = pages.map((pg) => {
    const { scale, reduced } = safeScale(pg, wanted);
    return { ...exportSize(pg, scale), scale, reduced, orientation: pdfOrientation(pg) };
  });
  return {
    filename: exportFileName(doc.title, { extension: 'pdf' }),
    pages: planned,
    anyReduced: planned.some((pl) => pl.reduced),
  };
}
