// Import a rendered Smart layout into the free canvas as editable layers.
//
// The 20 smart layouts express position through flexbox and padding, not
// coordinates, so there is no geometry table to read. Rather than hand-author
// ~100 x/y/w/h entries that would silently drift every time a layout changed,
// this measures what the browser actually laid out and converts it to layers.
//
// That means the canvas starts from the exact layout the merchant picked —
// Modern Split really looks like Modern Split — and any new layout added later
// is importable with no work here.
//
// Coordinate maths: the design node is authored at true pixel size (e.g.
// 1080×1920) and a PARENT applies `transform: scale(s)` to fit the viewport.
// getBoundingClientRect therefore returns scaled screen pixels — divide by `s`
// to get design units. getComputedStyle is unaffected by transforms, so
// font-size comes back in design units already and must NOT be divided.

import { createLayer, type CanvasDoc, type Layer, type LayerKind } from './canvasDoc';

export interface ImportOptions {
  /** The design node — the element that is `width`×`height` design units. */
  node: HTMLElement;
  width: number;
  height: number;
  /** The scale factor applied by an ancestor transform. */
  scale: number;
}

const num = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Classify an image by how the layout uses it, so layers get useful names. */
function imageKind(el: HTMLImageElement, width: number, height: number): { kind: LayerKind; name: string } | null {
  const r = el.getBoundingClientRect();
  if (r.width <= 1 || r.height <= 1) return null;
  const alt = (el.getAttribute('alt') || '').toLowerCase();
  const src = el.currentSrc || el.src || '';
  // The QR is generated as a data URL and is roughly square.
  if (src.startsWith('data:image') && Math.abs(r.width - r.height) < r.width * 0.25) {
    return { kind: 'qr', name: 'QR code' };
  }
  if (alt.includes('logo')) return { kind: 'logo', name: 'Logo' };
  // A near-full-bleed image is the background; anything smaller is a mark.
  const coversNode = r.width >= width * 0.9 || r.height >= height * 0.9;
  return coversNode
    ? { kind: 'image', name: 'Background' }
    : { kind: 'logo', name: 'Logo' };
}

/**
 * Read the rendered layout inside `node` and build a CanvasDoc from it.
 * Returns null when there is nothing measurable — jsdom, a detached node, or a
 * layout that hasn't painted yet — so callers can fall back to a seeded doc.
 */
export function docFromRenderedLayout({ node, width, height, scale }: ImportOptions): CanvasDoc | null {
  if (typeof window === 'undefined' || !node.getBoundingClientRect) return null;
  const base = node.getBoundingClientRect();
  // jsdom reports 0×0 for everything; a real layout never does.
  if (!base.width || !base.height || !scale) return null;

  const s = scale;
  const doc: CanvasDoc = { width, height, layers: [] };
  const layers: Layer[] = [];

  const geometry = (el: Element) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.round((r.left - base.left) / s)),
      y: Math.max(0, Math.round((r.top - base.top) / s)),
      w: Math.max(1, Math.round(r.width / s)),
      h: Math.max(1, Math.round(r.height / s)),
    };
  };

  const push = (kind: LayerKind, patch: Partial<Layer>) => {
    layers.push(createLayer({ ...doc, layers }, kind, patch));
  };

  // 1. Background image first, so it sits at the back of the paint order.
  const images = [...node.querySelectorAll('img')] as HTMLImageElement[];
  const classified = images
    .map((el) => ({ el, meta: imageKind(el, base.width, base.height) }))
    .filter((x): x is { el: HTMLImageElement; meta: { kind: LayerKind; name: string } } => !!x.meta);

  for (const { el, meta } of classified.filter((c) => c.meta.kind === 'image')) {
    push('image', { ...geometry(el), name: meta.name, src: el.currentSrc || el.src });
  }

  // 2. Text slots. These are the contentEditable elements the smart layouts use
  //    for badge / headline / subtext, in DOM order.
  const texts = [...node.querySelectorAll('[contenteditable]')] as HTMLElement[];
  texts.forEach((el, i) => {
    const text = (el.textContent || '').trim();
    if (!text) return;
    const cs = getComputedStyle(el);
    const g = geometry(el);
    // font-size is authored in design units and unaffected by the transform.
    const fontSize = Math.round(num(cs.fontSize));
    push('text', {
      ...g,
      // Give the tallest type the obvious name rather than guessing by index —
      // layouts order badge/headline/subtext differently.
      name: `Text ${i + 1}`,
      text,
      fill: cs.color || '#ffffff',
      fontSize: fontSize || Math.round(Math.min(width, height) * 0.05),
      fontWeight: Math.round(num(cs.fontWeight)) || 700,
      align: (cs.textAlign === 'center' || cs.textAlign === 'right' ? cs.textAlign : 'left') as Layer['align'],
    });
  });

  // 3. Marks last, so the logo and QR land on top where the layouts put them.
  for (const { el, meta } of classified.filter((c) => c.meta.kind !== 'image')) {
    push(meta.kind, { ...geometry(el), name: meta.name, src: el.currentSrc || el.src });
  }

  if (!layers.length) return null;

  // Name the text layers by relative size once they're all measured — the
  // biggest is the headline, the smallest the badge. More useful in the layers
  // list than "Text 1/2/3".
  const textLayers = layers.filter((l) => l.kind === 'text');
  if (textLayers.length) {
    const sorted = [...textLayers].sort((a, b) => (b.fontSize ?? 0) - (a.fontSize ?? 0));
    const names = ['Headline', 'Subtext', 'Badge'];
    sorted.forEach((l, i) => { l.name = names[i] ?? `Text ${i + 1}`; });
  }

  return { ...doc, layers };
}
