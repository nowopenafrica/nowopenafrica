/**
 * Laying an artboard out for real, and reading where everything landed.
 *
 * ── WHY A BROWSER AND NOT A PARSER ───────────────────────────────────────
 *
 * A Claude Design artboard positions its content with flexbox and grid:
 * `margin-top: auto`, `justify-content: space-between`, `gap`, and text that
 * wraps. Where the headline sits is decided by the layout engine and by the
 * glyph advances of the font — it is not written anywhere in the markup.
 *
 * Guessing it is exactly the failure this product already has a name for:
 * the PDF import that "recreated" text instead of reading it, and shipped
 * layouts nobody recognised. So the artboard is laid out, at its real size,
 * and the boxes are MEASURED.
 *
 * ── THE TWO SAFETY BARRIERS ──────────────────────────────────────────────
 *
 * 1. `parseDesignCanvas` has already removed every script, handler, remote
 *    reference and frame from the markup.
 * 2. It is rendered in an iframe whose `sandbox` does NOT include
 *    `allow-scripts`, so nothing in it can execute even if step 1 missed
 *    something. `allow-same-origin` is present and is what lets the parent
 *    read the geometry back; without script execution it grants no power.
 *
 * ── MEASURED IN THE FONTS IT WILL BE DRAWN IN ────────────────────────────
 *
 * The artboards are set in Inter, Inter Tight and Instrument Serif. Create
 * Media does not ship those — it ships nine self-hosted faces. Measuring in
 * Inter and then rendering in Outfit would import geometry that is correct
 * for a font the result will never use.
 *
 * So the measuring document is given OUR faces, mapped onto the artboard's
 * roles. Coolvetica is in both, so the display type — the part that decides
 * a poster's composition — is measured in the face it will be drawn in.
 */

import { TYPEFACES, fontStack, glyphFallbackFaces, type TypefaceKey } from '../design/typefaces';
import type { ParsedArtboard } from './designCanvas';

export interface MeasuredRun {
  text: string;
  /** The `data-props` token that produced this text, when one did. */
  token?: string;
  /** Pixels, within the artboard's own coordinate space. */
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontWeight: number;
  upper: boolean;
  /** Letter spacing in em. */
  tracking: number;
  align: 'left' | 'center' | 'right';
  /** Set in the display face rather than the body face. */
  display: boolean;
  /** Carries its own background — a pill, a tab, a filled bar. */
  chip: boolean;
  /**
   * A repeating group — a services column, a checklist, a stat strip —
   * measured as ONE run with its rows, because that is what the catalogue's
   * list slots are for. Absent on an ordinary line.
   */
  rows?: string[];
  /** 'column' when the rows stack, 'row' when they sit side by side. */
  flow?: 'row' | 'column';
}

/**
 * A painted thing that is not type: a bar, a panel, a disc, a photo frame.
 *
 * ── WHY THIS HAD TO BE ADDED ─────────────────────────────────────────────
 *
 * The first import read text and nothing else, and the result was 71
 * templates of words on a flat ground while the 66 written in code carried
 * geometry on 35 of them and photography on 29. A design is not its
 * sentences: the rainbow rule under the headline, the disc behind the week
 * number, the panel the business name sits on and the 760px photograph at
 * the top are the design. Measured here, they become `ShapeSpec`s the
 * renderer already knows how to draw.
 */
export interface MeasuredShape {
  /** Pixels, within the artboard's own coordinate space. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner rounding in pixels, as computed. */
  radius: number;
  /** Fill as rendered. `null` when the box is drawn only as an outline. */
  fill: string | null;
  /** True when the background is a gradient rather than a flat colour. */
  gradient: boolean;
  /** Border colour and width, for an outline shape such as a photo ring. */
  stroke: string | null;
  strokeWidth: number;
  opacity: number;
  /** Degrees, from a `rotate` in the element's transform. */
  rotation: number;
  /** This box held a picture: the layout is built around a photograph. */
  isImage: boolean;
}

/** How the Creative System's faces map onto the ones Create Media ships. */
export const FACE_MAP: { match: RegExp; key: TypefaceKey }[] = [
  /* Exact: the house face is in both systems, so display type is faithful. */
  { match: /coolvetica/i, key: 'coolvetica' },
  { match: /inter\s*tight/i, key: 'coolvetica' },
  { match: /instrument\s*serif|playfair|georgia/i, key: 'editorial' },
  { match: /ui-monospace|monospace|mono\b/i, key: 'mono' },
];

const DISPLAY_KEYS: TypefaceKey[] = ['coolvetica', 'editorial'];

/** `@font-face` for every face we ship, so the iframe can use them. */
function faceRules(): string {
  const out: string[] = [];
  for (const face of TYPEFACES) {
    for (const [weight, url] of Object.entries(face.files ?? {})) {
      out.push(
        `@font-face{font-family:"${face.family}";src:url("${url}") format("woff2");`
        + `font-weight:${weight};font-style:normal;font-display:block;}`,
      );
    }
  }
  // The glyph fallback every Studio stack names second, range-limited as in index.css.
  for (const f of glyphFallbackFaces()) {
    out.push(
      `@font-face{font-family:"${f.family}";src:url("${f.url}") format("woff2");`
      + `font-weight:${f.weight};font-style:normal;font-display:block;unicode-range:${f.unicodeRange};}`,
    );
  }
  return out.join('\n');
}

/**
 * The stylesheet that re-faces the artboard.
 *
 * `*` is overridden with `!important` because the families are inline styles,
 * and each mapping covers DESCENDANTS too — otherwise a span inside a
 * Coolvetica headline falls back through the `*` rule and is measured in the
 * wrong face.
 */
function faceOverrides(): string {
  const lines = [`*,*::before,*::after{font-family:${fontStack('sans')} !important;}`];
  for (const { match, key } of FACE_MAP) {
    const needle = match.source.split('|')[0].replace(/\\s\*/g, ' ').replace(/[\\^$]/g, '');
    lines.push(`[style*="${needle}" i],[style*="${needle}" i] *{font-family:${fontStack(key)} !important;}`);
  }
  return lines.join('\n');
}

const num = (v: string): number => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Lay the artboard out and read every text run back.
 *
 * Resolves with an empty list rather than throwing when the document cannot
 * be reached — a measurement that silently returns nothing is caught by the
 * caller, which refuses the import rather than publishing an empty template.
 */
export async function measureArtboard(board: ParsedArtboard): Promise<Measured> {
  if (typeof document === 'undefined') return { runs: [], shapes: [] };

  const frame = document.createElement('iframe');
  /* No allow-scripts. The parent reads geometry; nothing inside can run. */
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', 'Measuring an imported artboard');
  Object.assign(frame.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${board.width}px`,
    height: `${board.height}px`,
    border: '0',
    visibility: 'hidden',
  });

  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;}
${faceRules()}
${faceOverrides()}
</style></head><body>${board.html}</body></html>`;

  document.body.appendChild(frame);

  try {
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(); } };
      frame.addEventListener('load', done, { once: true });
      /* A frame that never fires load must not hang the import. */
      window.setTimeout(done, 4000);
    });

    const doc = frame.contentDocument;
    if (!doc) return { runs: [], shapes: [] };

    /*
     * The faces are loaded before anything is measured. Without this the
     * first measurement runs against the fallback metrics and every box is
     * the wrong width — the exact bug that makes an imported poster look
     * "nearly right" and nobody can say why.
     */
    try { await doc.fonts?.ready; } catch { /* a face that will not load is a worse measurement, not a failure */ }

    const root = doc.body.firstElementChild;
    if (!root) return { runs: [], shapes: [] };
    const base = root.getBoundingClientRect();

    return { runs: collect(root, base, board), shapes: collectShapes(root, base) };
  } finally {
    frame.remove();
  }
}

/** Everything one artboard yields: its type, and everything painted behind it. */
export interface Measured {
  runs: MeasuredRun[];
  shapes: MeasuredShape[];
}

/** Transparent in every spelling a browser returns. */
const INVISIBLE_FILL = /^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/;

/**
 * Corner rounding in pixels, whatever units it was written in.
 *
 * `getComputedStyle` hands back `border-radius: 50%` as the string "50%",
 * not as pixels — it cannot resolve a percentage without the box. Reading it
 * as a number gave 50, and on a 150px disc that is a third of the rounding
 * there actually is, so every circle in the Creative System measured as a
 * rectangle with slightly soft corners.
 */
export function radiusPx(value: string | null | undefined, box: { width: number; height: number }): number {
  const raw = (value ?? '').trim();
  if (!raw) return 0;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  /* A percentage is of the box's own side, and 50% is a full round. */
  if (raw.endsWith('%')) return (n / 100) * Math.min(box.width, box.height);
  return n;
}

/**
 * Collect the painted boxes.
 *
 * Deliberately not every element. A box counts only if it PAINTS something —
 * a fill, a gradient or a border — and is big enough to see. Without that
 * floor, a flex wrapper with no appearance becomes a rectangle, and an
 * imported poster arrives carrying forty invisible shapes nobody can select
 * but everybody has to scroll past in the layers list.
 */
function collectShapes(root: Element, base: DOMRect): MeasuredShape[] {
  const view = root.ownerDocument.defaultView;
  if (!view) return [];

  const canvas = base.width * base.height;
  const found: MeasuredShape[] = [];

  const walk = (el: Element) => {
    const css = view.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const isImage = el.hasAttribute('data-noa-image');

    const fill = INVISIBLE_FILL.test(css.backgroundColor) ? null : css.backgroundColor;
    const gradient = /gradient\(/i.test(css.backgroundImage ?? '');
    const strokeWidth = num(css.borderTopWidth);
    const stroke = strokeWidth > 0 && css.borderTopStyle !== 'none' ? css.borderTopColor : null;

    const paints = Boolean(fill) || gradient || Boolean(stroke) || isImage;
    const area = rect.width * rect.height;
    /* Below a thousandth of the canvas it is a detail, not a shape. */
    const visible = area > canvas * 0.001 && rect.width >= 2 && rect.height >= 2;

    if (paints && visible && el !== root) {
      const rotate = /rotate\(([-\d.]+)deg\)/.exec(css.transform ?? '');
      found.push({
        x: rect.left - base.left,
        y: rect.top - base.top,
        w: rect.width,
        h: rect.height,
        radius: radiusPx(css.borderTopLeftRadius, rect),
        fill,
        gradient,
        stroke,
        strokeWidth,
        opacity: Number.parseFloat(css.opacity) || 1,
        rotation: rotate ? Number(rotate[1]) : 0,
        isImage,
      });
    }

    for (const child of [...el.children]) walk(child);
  };

  for (const child of [...root.children]) walk(child);
  return found;
}

/** Does this element hold text of its own, rather than only child blocks? */
function ownText(el: Element): string {
  let text = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
    else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element;
      /* An inline span with no size of its own is part of this run. */
      const style = child.getAttribute('style') ?? '';
      if (!/font-size|display\s*:\s*(flex|grid|block)/i.test(style)) {
        /*
         * Separated by a space. These spans are siblings in a flex column —
         * two lines of one headline — and joining them bare produced
         * "Something biggeris opening." in the first board measured.
         */
        text += ` ${child.textContent ?? ''}`;
      }
    }
  }
  return text.replace(/\s+/g, ' ').trim();
}

function collect(root: Element, base: DOMRect, board: ParsedArtboard): MeasuredRun[] {
  const runs: MeasuredRun[] = [];
  const byText = new Map<string, string>();
  for (const [token, text] of Object.entries(board.tokenText)) {
    byText.set(text.replace(/\s+/g, ' ').trim(), token);
  }

  const view = root.ownerDocument.defaultView;
  if (!view) return runs;

  const walk = (el: Element) => {
    /*
     * A repeating group is measured as ONE run.
     *
     * Measured on the real boards: a service menu, a claim checklist and a
     * three-column deck slide each lost most of themselves, because every
     * row competed for one of eleven roles and ten of them lost. They are
     * not eleven things — they are one list, which this catalogue already
     * renders through `services`, `price`, `stats` and `contact`.
     */
    const group = repeatingGroup(el, view);
    if (group) {
      const rect = el.getBoundingClientRect();
      const first = view.getComputedStyle(group.sample);
      const fontSize = num(first.fontSize) || 16;
      runs.push({
        text: group.rows.join(' · '),
        rows: group.rows,
        flow: group.flow,
        x: rect.left - base.left,
        y: rect.top - base.top,
        w: rect.width,
        h: rect.height,
        fontSize,
        fontWeight: Number.parseInt(first.fontWeight, 10) || 400,
        upper: first.textTransform === 'uppercase',
        tracking: 0,
        align: 'left',
        display: false,
        chip: false,
      });
      return;
    }

    const text = ownText(el);
    if (text) {
      const rect = el.getBoundingClientRect();
      const css = view.getComputedStyle(el);
      const fontSize = num(css.fontSize) || 16;
      const family = css.fontFamily ?? '';
      const trackingPx = css.letterSpacing === 'normal' ? 0 : num(css.letterSpacing);
      const textAlign = css.textAlign;

      runs.push({
        text,
        ...(byText.has(text) ? { token: byText.get(text) } : {}),
        x: rect.left - base.left,
        y: rect.top - base.top,
        w: rect.width,
        h: rect.height,
        fontSize,
        fontWeight: Number.parseInt(css.fontWeight, 10) || 400,
        upper: css.textTransform === 'uppercase',
        tracking: fontSize ? trackingPx / fontSize : 0,
        align: textAlign === 'center' || textAlign === 'right' ? textAlign : 'left',
        display: DISPLAY_KEYS.some((k) => family.includes(k === 'coolvetica' ? 'Coolvetica' : 'DM Serif')),
        /* A pill or a filled bar: it carries its own ground, so it is a control. */
        chip: css.backgroundColor !== 'rgba(0, 0, 0, 0)' && css.backgroundColor !== 'transparent',
      });
      /* A run is a leaf: its children are part of it, not runs of their own. */
      return;
    }
    for (const child of [...el.children]) walk(child);
  };

  for (const child of [...root.children]) walk(child);
  return runs;
}

/**
 * Is this element a list of like rows?
 *
 * Deliberately strict. Two children are a pair, not a list, and a group
 * whose rows differ wildly in height is a layout, not a repetition — folding
 * either into one slot would lose the design rather than describe it.
 */
function repeatingGroup(
  el: Element,
  view: Window,
): { rows: string[]; sample: Element; flow: 'row' | 'column' } | null {
  const kids = [...el.children].filter((c) => (c.textContent ?? '').trim().length > 0);
  if (kids.length < 3 || kids.length > 10) return null;

  const boxes = kids.map((k) => k.getBoundingClientRect());
  if (boxes.some((b) => b.height < 1 || b.width < 1)) return null;

  const heights = boxes.map((b) => b.height);
  const tallest = Math.max(...heights);
  const shortest = Math.min(...heights);
  /* Rows of one list are the same size give or take their own wrapping. */
  if (tallest / shortest > 1.8) return null;

  const xs = boxes.map((b) => Math.round(b.left));
  const ys = boxes.map((b) => Math.round(b.top));
  const stacked = new Set(xs).size === 1 && new Set(ys).size === kids.length;
  const abreast = new Set(ys).size === 1 && new Set(xs).size === kids.length;
  if (!stacked && !abreast) return null;

  const rows = kids.map((k) => (k.textContent ?? '').replace(/\s+/g, ' ').trim());
  if (rows.some((r) => !r || r.length > 90)) return null;

  /* The biggest text inside a row is what sets the list's type size. */
  const sample = deepest(kids[0], view);
  return { rows, sample, flow: stacked ? 'column' : 'row' };
}

/** The descendant carrying the largest type, which sets the row's size. */
function deepest(row: Element, view: Window): Element {
  let best = row;
  let size = num(view.getComputedStyle(row).fontSize);
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      const s = num(view.getComputedStyle(child).fontSize);
      if (s > size && (child.textContent ?? '').trim()) { size = s; best = child; }
      walk(child);
    }
  };
  walk(row);
  return best;
}
