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

export async function exportNodeToPng(
  node: HTMLElement,
  opts: { pixelRatio?: number; backgroundColor?: string; canvasWidth?: number; canvasHeight?: number } = {},
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

// Rasterise a node to PNG, then immediately download it. Returns the file
// name so callers can confirm exactly what was saved.
export async function downloadNodePng(
  node: HTMLElement,
  filename: string,
  opts: { pixelRatio?: number; backgroundColor?: string; canvasWidth?: number; canvasHeight?: number } = {},
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
  opts: { pixelRatio?: number; backgroundColor?: string } = {},
): Promise<string> {
  const dataUrl = await exportNodeToPng(node, { pixelRatio: opts.pixelRatio ?? 3, backgroundColor: opts.backgroundColor });
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
