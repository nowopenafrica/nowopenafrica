import { Business } from '../types';

// qrcode, html-to-image and jspdf are imported DYNAMICALLY, inside the three
// functions that need them, rather than at the top of this module.
//
// Twenty files import from here, most of them only for a string or blob helper
// like slugForFile or downloadText. A static import meant every one of those
// chunks also carried a QR encoder, a DOM rasteriser and a PDF writer — which
// is how ContentFactory, a 125-line component, ended up in an 821 kB bundle.
//
// Each consumer is already async, so deferring costs nothing at the call site:
// the library loads on the first export, by which time the user has clicked a
// button and expects a moment's work.

// Brand materials always show the production brand domain (never localhost/a
// preview URL) so a printed QR/card points at the real live profile.
export const BRAND_ORIGIN = 'https://nowopenafrica.com';

// The public, always-live profile URL an asset points to. This is the heart of
// the "Live Brand Kit": print once, and the destination stays current forever.
// Uses the business's brand name (username) → nowopenafrica.com/<brandname>.
export function profileUrl(business: Pick<Business, 'id' | 'username'>): string {
  return business.username ? `${BRAND_ORIGIN}/${business.username}` : `${BRAND_ORIGIN}/businesses/${business.id}`;
}

// A high-error-correction QR (so a logo can sit in the middle later) as a PNG
// data URL, ready to drop into an <img> or download.
export async function generateQr(
  text: string,
  opts: { size?: number; dark?: string; light?: string } = {},
): Promise<string> {
  const { default: QRCode } = await import('qrcode');
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: opts.size ?? 512,
    color: { dark: opts.dark ?? '#0f172a', light: opts.light ?? '#ffffff' },
  });
}

// Robust DOM → PNG snapshot for the Studio exports. html-to-image has two
// classic failure modes that make a download look "broken":
//   1. images (logo/cover) come out blank because the browser hadn't finished
//      decoding them — or because html-to-image's internal cache misses on the
//      very first pass, and
//   2. the brand webfont (Coolvetica) renders in a fallback face because it
//      wasn't loaded/embedded yet.
// This helper fixes both: it waits for fonts + every <img> to be ready, then
// does a throwaway "warm-up" render (which primes html-to-image's image cache)
// before the real capture. Slightly slower, but the output is reliable.
async function waitForAssets(node: HTMLElement) {
  // Fonts (Coolvetica) fully loaded.
  try {
    const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (fonts?.ready) await fonts.ready;
  } catch { /* older browsers — best effort */ }

  // Every <img> inside the node fully decoded.
  const imgs = Array.from(node.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });
    }),
  );

  // CSS background-images too (e.g. the business-card cover uses one) — <img>
  // waiting above misses these, so preload them via a detached Image.
  const bgUrls: string[] = [];
  for (const el of [node, ...Array.from(node.querySelectorAll<HTMLElement>('*'))]) {
    const bg = getComputedStyle(el).backgroundImage;
    const match = bg && bg.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/);
    if (match) bgUrls.push(match[1]);
  }
  await Promise.all(
    bgUrls.map(
      (u) =>
        new Promise<void>((resolve) => {
          const pre = new Image();
          pre.crossOrigin = 'anonymous';
          pre.onload = () => resolve();
          pre.onerror = () => resolve();
          pre.src = u;
        }),
    ),
  );

  // Two paints so layout, fonts and gradients settle before the snapshot.
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

/**
 * Lay the node out at its DESIGN width for the duration of a capture.
 *
 * Export nodes are written as `width: 640, maxWidth: '100%'`, so on a phone the
 * card renders at whatever the column allows — around 360px. html-to-image
 * captures what is on screen, so the same card exported from a phone came out
 * barely half the resolution of one exported from a desktop, and reflowed into
 * a different layout. A business card is a fixed physical artefact; what it
 * looks like must not depend on the window that happened to export it.
 *
 * Fixed-position and far off-screen while it happens, so widening it cannot
 * make the page scroll sideways or flash at the owner.
 *
 * Returns the undo. A no-op when the node is already at least that wide.
 */
function forceDesignWidth(node: HTMLElement, width: number): () => void {
  /*
   * Always pin, never only-widen.
   *
   * The previous version returned early when the node was already at least this
   * wide, which is nearly always true on a desktop — so the same card exported
   * at 641px on one screen and 640px on another produced two different files.
   * An export is a fixed artefact; it must not record the window that made it.
   */
  if (!width) return () => {};
  const s = node.style;
  const prev = {
    width: s.width, maxWidth: s.maxWidth, position: s.position,
    left: s.left, top: s.top, zIndex: s.zIndex,
  };
  s.position = 'fixed';
  s.left = '-10000px';
  s.top = '0';
  s.zIndex = '-1';
  s.width = `${width}px`;
  s.maxWidth = 'none';
  return () => {
    s.width = prev.width; s.maxWidth = prev.maxWidth; s.position = prev.position;
    s.left = prev.left; s.top = prev.top; s.zIndex = prev.zIndex;
  };
}

export async function exportNodeToPng(
  node: HTMLElement,
  opts: {
    pixelRatio?: number; backgroundColor?: string; canvasWidth?: number; canvasHeight?: number;
    /** Capture at this CSS width whatever the screen is doing. */
    designWidth?: number;
  } = {},
): Promise<string> {
  /*
   * The design width comes from the node when the caller did not pass one.
   *
   * It used to be the caller's job, and five of nine call sites forgot — the QR
   * lockup, the Smart ID front PNG (whose own PDF did pass it, so the two came
   * out different sizes) and both halves of "Download everything". Reading it
   * off the element makes every current and future export correct by default;
   * an explicit option still wins.
   */
  const declared = Number(node.dataset.exportWidth ?? 0);
  const restoreWidth = forceDesignWidth(node, opts.designWidth ?? declared ?? 0);
  try {
    return await captureNode(node, opts);
  } finally {
    restoreWidth();
  }
}

async function captureNode(
  node: HTMLElement,
  opts: { pixelRatio?: number; backgroundColor?: string; canvasWidth?: number; canvasHeight?: number },
): Promise<string> {
  await waitForAssets(node);
  const options = {
    pixelRatio: opts.pixelRatio ?? 2,
    backgroundColor: opts.backgroundColor,
    canvasWidth: opts.canvasWidth,
    canvasHeight: opts.canvasHeight,
    cacheBust: true,
    // Give remote images (Supabase Storage) a real CORS request so the canvas
    // isn't tainted and dropped.
    fetchRequestInit: { mode: 'cors' as RequestMode },
  };
  // Warm-up pass primes html-to-image's image cache; the second pass is the
  // one we keep. (Well-known html-to-image workaround for first-render blanks.)
  const { toPng } = await import('html-to-image');
  // Called twice on purpose — see the note above this function.
  await toPng(node, options);
  return toPng(node, options);
}

// Convert a data: URL into a Blob so the browser saves it as a real file.
// Anchor-downloading an oversized data URL is unreliable — Safari and some
// mobile browsers open it in a new tab instead of saving. A Blob object URL
// downloads everywhere.
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = /:([^;]+)/.exec(head)?.[1] || 'application/octet-stream';
  if (/;base64$/i.test(head)) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
}

// Trigger a browser download for a data URL / blob URL / http(s) URL. Data
// URLs are converted to a Blob first, and temporary object URLs are always
// cleaned up so large exports (A4 flyers, video) don't leak memory.
export function downloadUrl(url: string, filename: string) {
  const objectUrl = url.startsWith('data:') ? URL.createObjectURL(dataUrlToBlob(url)) : url;
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (objectUrl !== url) setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

// Download an arbitrary Blob (text, guidelines, etc.). The object URL is
// revoked once the browser has had time to start the save.
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Download plain text (captions, hashtags, guidelines) as a .txt file.
export function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

// Download a remote file (e.g. the logo stored on Supabase). Fetches it as a
// Blob first — a plain <a download> is ignored for cross-origin URLs and would
// just navigate to the image. Falls back to opening the URL when CORS blocks
// the fetch.
export async function downloadRemoteUrl(url: string, filename: string) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('bad status');
    const blob = await res.blob();
    downloadBlob(blob, filename);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

/**
 * Print a rasterised node at a true physical size.
 *
 * The obvious implementation — write the node's outerHTML into a blank window —
 * is what this replaces, and it was quietly broken: these cards are styled with
 * Tailwind classes, and the new window has no stylesheet. Everything carried by
 * a class rather than an inline style was lost, so `h-24` collapsed the cover
 * photo to nothing, the padding and flex layout went, and Print / Save as PDF
 * produced a bare stack of text that looked nothing like the card on screen.
 *
 * A PNG has no such dependency: what prints is exactly what was previewed.
 *
 * `widthMm` is the real width the sheet should print at — 85.6mm for a CR80
 * business card — so it comes out of the printer at card size on whatever paper
 * is loaded, ready to cut, rather than blown up to fill A4.
 */
export function printImage(dataUrl: string, title: string, widthMm = 85.6): boolean {
  const w = window.open('', '_blank', 'width=900,height=650');
  if (!w) return false;
  const safeTitle = title.replace(/[<&>]/g, '');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
  html,body{margin:0;padding:0;background:#f1f5f9}
  body{display:flex;align-items:center;justify-content:center;min-height:100vh}
  img{width:${widthMm}mm;height:auto;display:block;box-shadow:0 2px 12px rgba(0,0,0,.15)}
  @media print{ @page{margin:10mm} body{background:#fff;min-height:0;display:block} img{box-shadow:none;margin:0 auto} }
</style></head><body>
<img src="${dataUrl}" alt="${safeTitle}">
<script>
  // Print only once the image has actually decoded — printing an <img> that is
  // still loading gives a blank sheet.
  var i=document.images[0];
  function go(){ setTimeout(function(){ window.focus(); window.print(); }, 250); }
  if (i.complete) go(); else { i.onload=go; i.onerror=go; }
</script>
</body></html>`);
  w.document.close();
  return true;
}

// Rasterise a node to PNG, then immediately download it. Returns the file
// name so callers can confirm exactly what was saved.
export async function downloadNodePng(
  node: HTMLElement,
  filename: string,
  opts: { pixelRatio?: number; backgroundColor?: string; canvasWidth?: number; canvasHeight?: number; designWidth?: number } = {},
): Promise<string> {
  const dataUrl = await exportNodeToPng(node, opts);
  downloadUrl(dataUrl, filename);
  return filename;
}

export const slugForFile = (name: string) =>
  (name || 'nowopen').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'nowopen';

function imageDataSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('could not read image'));
    img.src = dataUrl;
  });
}

// Rasterise a node and embed it in a print-ready PDF at the standard ID-card
// size (CR80, 85.6 × 54 mm) — the card keeps its aspect ratio, centred.
export async function downloadNodePdf(
  node: HTMLElement,
  filename: string,
  opts: { pixelRatio?: number; backgroundColor?: string; designWidth?: number } = {},
): Promise<string> {
  const dataUrl = await exportNodeToPng(node, {
    pixelRatio: opts.pixelRatio ?? 3,
    backgroundColor: opts.backgroundColor,
    designWidth: opts.designWidth,
  });
  const { w, h } = await imageDataSize(dataUrl);
  const cardW = 85.6;
  const cardH = 54;
  let fitW = cardW;
  let fitH = fitW / (w / h);
  if (fitH > cardH) {
    fitH = cardH;
    fitW = fitH * (w / h);
  }
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [cardW, cardH] });
  pdf.addImage(dataUrl, 'PNG', (cardW - fitW) / 2, (cardH - fitH) / 2, fitW, fitH);
  pdf.save(filename);
  return filename;
}

// Share targets for the Share Center.
export function shareLinks(url: string, title: string) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return [
    { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${t}%20${u}` },
    { key: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { key: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
    { key: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { key: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${u}&text=${t}` },
    { key: 'email', label: 'Email', href: `mailto:?subject=${t}&body=${u}` },
  ];
}

/**
 * Rasterise several nodes into one multi-page PDF.
 *
 * A catalogue is not one sheet, and handing someone six separate PNGs is not
 * handing them a catalogue. Each node becomes a full-bleed page at the paper
 * size given, in order.
 *
 * Pages are captured one at a time rather than in parallel on purpose: every
 * capture holds a full-size bitmap, and a twelve-page catalogue of photographs
 * done at once is enough to be killed by the tab's memory limit on a phone.
 * Slower and finishes beats faster and dies.
 *
 * `onProgress` is called before each page so a caller can say "3 of 6" instead
 * of leaving a spinner running for half a minute.
 */
export async function downloadSheetsPdf(
  nodes: HTMLElement[],
  filename: string,
  opts: {
    widthMm: number;
    heightMm: number;
    pixelRatio?: number;
    designWidth?: number;
    backgroundColor?: string;
    onProgress?: (page: number, total: number) => void;
  },
): Promise<string> {
  const pages = nodes.filter(Boolean);
  if (pages.length === 0) throw new Error('nothing to export');

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: opts.widthMm >= opts.heightMm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [opts.widthMm, opts.heightMm],
  });

  for (let i = 0; i < pages.length; i++) {
    opts.onProgress?.(i + 1, pages.length);
    const dataUrl = await exportNodeToPng(pages[i], {
      pixelRatio: opts.pixelRatio ?? 2,
      backgroundColor: opts.backgroundColor ?? '#ffffff',
      designWidth: opts.designWidth,
    });
    if (i > 0) pdf.addPage([opts.widthMm, opts.heightMm]);
    // Full bleed: the sheet was drawn at the paper's own proportions, so it
    // fills the page without a fit calculation that could letterbox it.
    pdf.addImage(dataUrl, 'PNG', 0, 0, opts.widthMm, opts.heightMm);
  }

  pdf.save(filename);
  return filename;
}
