/**
 * Bringing an SVG in as editable objects.
 *
 * ── WHAT COMES IN EDITABLE, AND WHAT DOES NOT ────────────────────────────
 *
 * This document model holds text, rectangles, ellipses, lines and images.
 * An SVG holds all of those plus paths, polygons, gradients, filters,
 * clipping, masks and arbitrary transforms. So the honest result is a split:
 *
 *   - `<text>`, `<rect>`, `<circle>`, `<ellipse>` and `<line>` become real
 *     objects you can select, retype, recolour and move.
 *   - Everything else stays in the artwork, which is placed as one locked
 *     image layer beneath them.
 *
 * The import reports both numbers, because "imported successfully" is not a
 * useful thing to tell somebody whose logo arrived as a flat picture. They
 * need to know which parts they can edit before they start.
 *
 * ── WHY THE FILE IS SANITISED FIRST ──────────────────────────────────────
 *
 * An SVG is a document, not an image: it can carry <script>, event handler
 * attributes, <foreignObject> with arbitrary HTML, and external references
 * that fetch on render. Any of those, rendered inside this app, runs with the
 * app's own origin and the signed-in user's session. Everything below is
 * removed before the file is parsed for content or shown on a canvas.
 */

import type { DesignObject, TextObject } from './designDocument';
import { objectId } from './designDocument';
import { DANGEROUS_TAGS, isUnsafeAttribute } from './svgSanitise.mjs';

export interface SvgImport {
  /** The sanitised artwork, safe to render. */
  artwork: string;
  width: number;
  height: number;
  objects: DesignObject[];
  /** Elements that became editable objects. */
  editable: number;
  /** Elements that could only stay in the picture. */
  flattened: number;
  /** What was removed for safety, so it can be said out loud. */
  removed: string[];
}

/* DANGEROUS_TAGS and isUnsafeAttribute live in svgSanitise.mjs, shared with the asset intake script. */

/** Tags this document model can represent as real, editable objects. */
const EDITABLE_TAGS = new Set(['text', 'rect', 'circle', 'ellipse', 'line']);

const num = (v: string | null, fallback = 0): number => {
  const n = Number.parseFloat(v ?? '');
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Strip everything that could execute or fetch.
 *
 * Returns what it removed so the UI can say so — a file quietly altered is a
 * file somebody will wonder about later.
 */
export function sanitiseSvg(doc: Document): string[] {
  const removed: string[] = [];
  const root = doc.documentElement;

  /*
   * Matched by NAME, not by selector.
   *
   * An SVG is parsed as XML, where selectors are case-sensitive — so
   * `querySelectorAll('foreignobject')` matches nothing at all, because the
   * element is spelled `foreignObject`. The sanitiser looked like it worked
   * and silently left the most dangerous element in the file. Comparing
   * lowercased node names cannot miss a capital letter.
   */
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (DANGEROUS_TAGS.includes(el.nodeName.toLowerCase()) && el !== root) {
      removed.push(el.nodeName.toLowerCase());
      el.remove();
    }
  }

  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      /* Event handlers, and any reference that would fetch from elsewhere. */
      if (isUnsafeAttribute(name, attr.value)) {
        removed.push(name);
        el.removeAttribute(attr.name);
      }
    }
  }

  return [...new Set(removed)];
}

/** The artboard an SVG declares, from viewBox or width/height. */
export function svgSize(root: Element): { width: number; height: number } {
  const box = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (box.length === 4 && box.every((n) => Number.isFinite(n)) && box[2] > 0 && box[3] > 0) {
    return { width: box[2], height: box[3] };
  }
  const width = num(root.getAttribute('width'), 0);
  const height = num(root.getAttribute('height'), 0);
  if (width > 0 && height > 0) return { width, height };
  /* A file with no stated size still has to land on a canvas. */
  return { width: 1080, height: 1080 };
}

/**
 * Read an SVG file into a document's worth of objects.
 *
 * `parse` is injected so this can be tested without a browser; in the app it
 * is `new DOMParser().parseFromString`.
 */
export function importSvg(
  source: string,
  parse: (text: string) => Document,
): SvgImport | { error: string } {
  let doc: Document;
  try {
    doc = parse(source);
  } catch {
    return { error: 'That file could not be read as an SVG.' };
  }

  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    return { error: 'That file is not an SVG, or it is damaged.' };
  }

  const removed = sanitiseSvg(doc);
  const { width, height } = svgSize(root);

  const objects: DesignObject[] = [];
  let editable = 0;
  let flattened = 0;
  let z = 1;

  for (const el of [...root.querySelectorAll('*')]) {
    const tag = el.nodeName.toLowerCase();
    if (!EDITABLE_TAGS.has(tag)) {
      /* Paths, polygons, groups, gradients — counted, not converted. */
      if (['path', 'polygon', 'polyline', 'image', 'use'].includes(tag)) flattened += 1;
      continue;
    }

    /*
     * Anything inside a transformed group would need the transform composed
     * before its coordinates mean anything on this canvas. Rather than place
     * it wrongly, it stays part of the artwork and is counted as flattened.
     */
    if (el.closest('[transform]')) { flattened += 1; continue; }

    const common = {
      id: objectId(tag === 'text' ? 't' : 's'),
      rotation: 0,
      opacity: num(el.getAttribute('opacity'), 1),
      visible: true,
      locked: false,
      z: z += 1,
    };

    if (tag === 'text') {
      const x = num(el.getAttribute('x'));
      const y = num(el.getAttribute('y'));
      const size = num(el.getAttribute('font-size'), height * 0.05);
      objects.push({
        ...common,
        type: 'text',
        name: (el.textContent ?? 'Text').trim().slice(0, 40) || 'Text',
        x: x / width,
        /* SVG text sits ON its baseline; the box starts above it. */
        y: Math.max(0, (y - size) / height),
        w: Math.min(1, 0.9),
        h: Math.min(1, (size * 1.4) / height),
        text: (el.textContent ?? '').trim(),
        size: size / width,
        colour: el.getAttribute('fill') ?? undefined,
      } as TextObject);
      editable += 1;
      continue;
    }

    let x = 0; let y = 0; let w = 0; let h = 0;
    if (tag === 'rect') {
      x = num(el.getAttribute('x')); y = num(el.getAttribute('y'));
      w = num(el.getAttribute('width')); h = num(el.getAttribute('height'));
    } else if (tag === 'circle') {
      const r = num(el.getAttribute('r'));
      x = num(el.getAttribute('cx')) - r; y = num(el.getAttribute('cy')) - r;
      w = r * 2; h = r * 2;
    } else if (tag === 'ellipse') {
      const rx = num(el.getAttribute('rx'));
      const ry = num(el.getAttribute('ry'));
      x = num(el.getAttribute('cx')) - rx; y = num(el.getAttribute('cy')) - ry;
      w = rx * 2; h = ry * 2;
    } else {
      const x1 = num(el.getAttribute('x1')); const x2 = num(el.getAttribute('x2'));
      const y1 = num(el.getAttribute('y1')); const y2 = num(el.getAttribute('y2'));
      x = Math.min(x1, x2); y = Math.min(y1, y2);
      w = Math.abs(x2 - x1); h = Math.max(1, Math.abs(y2 - y1));
    }

    if (w <= 0 || h <= 0) { flattened += 1; continue; }

    objects.push({
      ...common,
      type: 'shape',
      shape: tag === 'rect' ? 'rect' : tag === 'line' ? 'line' : 'ellipse',
      name: tag === 'rect' ? 'Rectangle' : tag === 'line' ? 'Line' : 'Ellipse',
      x: x / width,
      y: y / height,
      w: Math.min(1, w / width),
      h: Math.min(1, h / height),
      fill: el.getAttribute('fill') ?? undefined,
      stroke: el.getAttribute('stroke') ?? undefined,
    } as DesignObject);
    editable += 1;
  }

  return {
    artwork: new XMLSerializer().serializeToString(doc),
    width,
    height,
    objects,
    editable,
    flattened,
    removed,
  };
}

/** What to tell the user about what they just imported. */
export function importSummary(result: SvgImport): string {
  const parts: string[] = [];
  parts.push(result.editable === 1 ? '1 element is editable' : `${result.editable} elements are editable`);
  if (result.flattened > 0) {
    parts.push(result.flattened === 1
      ? '1 stayed part of the artwork'
      : `${result.flattened} stayed part of the artwork`);
  }
  if (result.removed.length > 0) parts.push('scripts and external references were removed');
  return `${parts.join(', ')}.`;
}
