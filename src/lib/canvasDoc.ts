// NowOpen Studio — free-canvas document model.
//
// Creative Studio has two modes:
//   • Smart layout (default) — the existing fixed layouts. Positions are
//     governed by the layout, which is why every export looks composed. This
//     file does not touch that path at all.
//   • Free canvas (opt-in)  — the same content as movable, resizable layers for
//     people who want to break the grid.
//
// The two are deliberately separate render paths. Smart layout keeps rendering
// from the flat headline/subline/badge state exactly as before; the canvas
// renders from a CanvasDoc. Switching to free canvas SEEDS a document from the
// current design (see docFromSlots) and switching back simply stops using it —
// the smart-layout state is never mutated, so the toggle can't damage a design
// that was working.
//
// Everything here is pure: no React, no DOM, no I/O. The reducer-style ops each
// return a new document, which is what makes undo/redo a matter of keeping
// snapshots rather than inverting operations.
//
// Not yet implemented, and deliberately so: rotation handles, snapping/guides,
// grouping, and multiplayer. The model carries `rotation` so the renderer and
// the transform UI can adopt it without a migration.

export type LayerKind = 'text' | 'image' | 'shape' | 'qr' | 'logo';

export interface Layer {
  id: string;
  kind: LayerKind;
  name: string;
  /** Geometry in design units — the same coordinate space as the canvas w/h. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise. Carried by the model; no UI for it yet. */
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  // --- content, by kind ---
  text?: string;
  src?: string;
  fill?: string;
  fontSize?: number;
  fontWeight?: number;
  align?: 'left' | 'center' | 'right';
  radius?: number;
}

export interface CanvasDoc {
  width: number;
  height: number;
  /** Paint order: index 0 is furthest back. */
  layers: Layer[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Smallest sensible layer, so a resize can't make something unclickable. */
export const MIN_SIZE = 24;

export function newLayerId(doc: CanvasDoc, kind: LayerKind): string {
  let n = 1;
  const taken = new Set(doc.layers.map((l) => l.id));
  while (taken.has(`${kind}-${n}`)) n++;
  return `${kind}-${n}`;
}

export function createLayer(doc: CanvasDoc, kind: LayerKind, patch: Partial<Layer> = {}): Layer {
  return {
    id: patch.id ?? newLayerId(doc, kind),
    kind,
    name: patch.name ?? kind,
    x: patch.x ?? Math.round(doc.width * 0.1),
    y: patch.y ?? Math.round(doc.height * 0.1),
    w: patch.w ?? Math.round(doc.width * 0.5),
    h: patch.h ?? Math.round(doc.height * 0.12),
    rotation: patch.rotation ?? 0,
    opacity: patch.opacity ?? 1,
    locked: patch.locked ?? false,
    hidden: patch.hidden ?? false,
    ...patch,
  };
}

// --- queries -----------------------------------------------------------------

export const findLayer = (doc: CanvasDoc, id: string): Layer | undefined =>
  doc.layers.find((l) => l.id === id);

/** Topmost visible, unlocked layer whose box contains the point. */
export function layerAt(doc: CanvasDoc, x: number, y: number): Layer | undefined {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    if (l.hidden || l.locked) continue;
    if (x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) return l;
  }
  return undefined;
}

// --- mutations (each returns a new document) ---------------------------------

export function addLayer(doc: CanvasDoc, layer: Layer): CanvasDoc {
  return { ...doc, layers: [...doc.layers, layer] };
}

export function updateLayer(doc: CanvasDoc, id: string, patch: Partial<Layer>): CanvasDoc {
  return {
    ...doc,
    layers: doc.layers.map((l) => (l.id === id ? { ...l, ...patch, id: l.id, kind: l.kind } : l)),
  };
}

/**
 * Nudge a layer. Kept fully on-canvas: a layer dragged off the edge is
 * unrecoverable without an undo, which is a bad first experience.
 */
export function moveLayer(doc: CanvasDoc, id: string, dx: number, dy: number): CanvasDoc {
  const l = findLayer(doc, id);
  if (!l || l.locked) return doc;
  return updateLayer(doc, id, {
    x: clamp(l.x + dx, 0, Math.max(0, doc.width - l.w)),
    y: clamp(l.y + dy, 0, Math.max(0, doc.height - l.h)),
  });
}

export function resizeLayer(doc: CanvasDoc, id: string, dw: number, dh: number): CanvasDoc {
  const l = findLayer(doc, id);
  if (!l || l.locked) return doc;
  return updateLayer(doc, id, {
    w: clamp(l.w + dw, MIN_SIZE, doc.width - l.x),
    h: clamp(l.h + dh, MIN_SIZE, doc.height - l.y),
  });
}

export function removeLayer(doc: CanvasDoc, id: string): CanvasDoc {
  return { ...doc, layers: doc.layers.filter((l) => l.id !== id) };
}

export function duplicateLayer(doc: CanvasDoc, id: string): { doc: CanvasDoc; id: string | null } {
  const l = findLayer(doc, id);
  if (!l) return { doc, id: null };
  const copy = createLayer(doc, l.kind, {
    ...l,
    id: newLayerId(doc, l.kind),
    name: `${l.name} copy`,
    x: clamp(l.x + 16, 0, Math.max(0, doc.width - l.w)),
    y: clamp(l.y + 16, 0, Math.max(0, doc.height - l.h)),
  });
  return { doc: addLayer(doc, copy), id: copy.id };
}

export type ReorderTo = 'front' | 'back' | 'forward' | 'backward';

export function reorderLayer(doc: CanvasDoc, id: string, to: ReorderTo): CanvasDoc {
  const i = doc.layers.findIndex((l) => l.id === id);
  if (i < 0) return doc;
  const layers = [...doc.layers];
  const [l] = layers.splice(i, 1);
  const at = to === 'front' ? layers.length
    : to === 'back' ? 0
      : to === 'forward' ? Math.min(layers.length, i + 1)
        : Math.max(0, i - 1);
  layers.splice(at, 0, l);
  return { ...doc, layers };
}

// --- history -----------------------------------------------------------------

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

/** Bounded so a long editing session can't grow memory without limit. */
export const HISTORY_LIMIT = 50;

export const initHistory = <T,>(present: T): History<T> => ({ past: [], present, future: [] });

export function pushHistory<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h;
  const past = [...h.past, h.present].slice(-HISTORY_LIMIT);
  // A new edit invalidates the redo stack — standard, and prevents branching.
  return { past, present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  const previous = h.past[h.past.length - 1];
  return {
    past: h.past.slice(0, -1),
    present: previous,
    future: [h.present, ...h.future].slice(0, HISTORY_LIMIT),
  };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: rest };
}

export const canUndo = <T,>(h: History<T>) => h.past.length > 0;
export const canRedo = <T,>(h: History<T>) => h.future.length > 0;

// --- seeding from the smart layout ------------------------------------------

export interface SlotSeed {
  width: number;
  height: number;
  headline: string;
  subline: string;
  badge: string;
  accent: string;
  logoUrl?: string | null;
  qrDataUrl?: string | null;
}

/**
 * Build a document from the current smart-slot design so switching into free
 * canvas starts from what the merchant already has, rather than a blank page.
 *
 * Positions approximate the smart layouts' vertical rhythm — badge, headline,
 * subtext stacked in the lower-middle, brand marks at the corners. It is a
 * starting point to drag from, not a reproduction of a specific layout.
 */
export function docFromSlots(seed: SlotSeed): CanvasDoc {
  const { width: W, height: H } = seed;
  const pad = Math.round(Math.min(W, H) * 0.08);
  const min = Math.min(W, H);
  const doc: CanvasDoc = { width: W, height: H, layers: [] };
  const layers: Layer[] = [];

  const push = (kind: LayerKind, patch: Partial<Layer>) =>
    layers.push(createLayer({ ...doc, layers }, kind, patch));

  if (seed.logoUrl) {
    push('logo', {
      name: 'Logo', src: seed.logoUrl,
      x: pad, y: pad, w: Math.round(min * 0.16), h: Math.round(min * 0.16),
    });
  }
  if (seed.badge.trim()) {
    push('text', {
      name: 'Badge', text: seed.badge, fill: seed.accent,
      fontSize: Math.round(min * 0.032), fontWeight: 800, align: 'left',
      x: pad, y: Math.round(H * 0.52), w: Math.round(W - pad * 2), h: Math.round(min * 0.06),
    });
  }
  push('text', {
    name: 'Headline', text: seed.headline, fill: '#ffffff',
    fontSize: Math.round(min * 0.075), fontWeight: 800, align: 'left',
    x: pad, y: Math.round(H * 0.6), w: Math.round(W - pad * 2), h: Math.round(min * 0.2),
  });
  if (seed.subline.trim()) {
    push('text', {
      name: 'Subtext', text: seed.subline, fill: '#e5e7eb',
      fontSize: Math.round(min * 0.036), fontWeight: 500, align: 'left',
      x: pad, y: Math.round(H * 0.8), w: Math.round(W - pad * 2), h: Math.round(min * 0.08),
    });
  }
  if (seed.qrDataUrl) {
    const size = Math.round(min * 0.16);
    push('qr', {
      name: 'QR code', src: seed.qrDataUrl,
      x: W - pad - size, y: H - pad - size, w: size, h: size,
    });
  }

  return { ...doc, layers };
}
