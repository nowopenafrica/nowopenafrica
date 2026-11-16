// Measured checks on a concept: the house's critical gates (C1 to C13 in the
// catalogue spec), applied to a composed document instead of a template.
//
// CI-3 is done when every concept passes these, and until this file they had
// only ever been run on templates. The rules are not new and not softened:
// the same 4.5:1, the same six points at print size, the same roadside floors
// (checks/flow.ts, S5), the same safe margin. What is new is reading them off
// a DesignDocument, where positions are fractions of the page.
//
// Each finding names the object and the measurement ("Call to action is 0.039
// of the board's height, below 0.07"), because a reviewer and the next fix
// both need the number, not a verdict.
//
// Not measured here, and said so rather than implied: C1 (asset licences: a
// concept shown to a customer carries no photograph yet), C7 and C8 (editor
// and export), C10 (invented facts: the copy bank is gated in ideas.ts, a
// customer's own words are theirs), C11 (no mockups are composed).

import type { Format } from '../../design/formats';
import { BILLBOARD_MAX_WORDS, BILLBOARD_MIN_BRAND, BILLBOARD_MIN_TEXT } from '../../design/quality/checks/flow';
import { minTextPx } from '../../design/quality/checks/geometry';
import { contrastRatio } from '../../design/styles';
import { GLYPH_FALLBACK, nearestWeight, typefaceOf } from '../../design/typefaces';
import type { DesignDocument, DesignObject, TextObject } from '../../studio/designDocument';
import { METRIC_CHARS, METRIC_WIDTHS } from './fontMetrics';

export type CheckCode = 'C3' | 'C4' | 'C5' | 'C12';

export interface Finding {
  code: CheckCode;
  /** The object's name in the document, so it can be found in the editor's layer list. */
  where: string;
  detail: string;
}

export interface CheckOptions {
  /** The format the document was composed for. Null skips the checks that need one. */
  format: Format | null;
  /** A piece read at speed from a road. Turns on the S5 floors and the word budget. */
  distance?: boolean;
}

const HEX = /^#[0-9a-f]{6}$/i;
const INDEX = new Map([...METRIC_CHARS].map((ch, k) => [ch, k]));
const FALLBACK = GLYPH_FALLBACK.unicodeRange.map((r) => r.replace('U+', '').split('-').map((h) => parseInt(h, 16)) as [number, number]);
const inFallback = (cp: number) => FALLBACK.some(([a, z]) => cp >= a && cp <= z);

const texts = (objs: DesignObject[]) => objs.filter((o): o is TextObject => o.type === 'text' && o.visible !== false && !!o.text);
const words = (s: string) => s.split(/\s+/).filter((t) => /[\p{L}\p{N}@]/u.test(t)).length;

/** Is the page point (x, y) inside this object as drawn? Rotation is ignored: no composition rotates a ground. */
function covers(o: DesignObject, x: number, y: number): boolean {
  if (x < o.x || x > o.x + o.w || y < o.y || y > o.y + o.h) return false;
  if (o.type !== 'shape') return true;
  const u = (x - o.x) / o.w;
  const v = (y - o.y) / o.h;
  if (o.shape === 'ellipse') return (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.25;
  if (o.shape === 'polygon' && o.points?.length) {
    let hit = false;
    for (let i = 0, j = o.points.length - 1; i < o.points.length; j = i, i += 1) {
      const [xi, yi] = o.points[i];
      const [xj, yj] = o.points[j];
      if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  return true;
}

/**
 * What a text sits on: the colour of the topmost solid thing under it, or
 * 'photo', or 'pattern'. Sampled at five points along the text's own box,
 * because a headline can start on one colour and end on another.
 */
function groundsUnder(t: TextObject, page: DesignDocument['pages'][number]): (string | 'photo' | 'pattern')[] {
  const below = page.objects.filter((o) => o.z < t.z && o.visible !== false && o.type !== 'text').sort((a, b) => b.z - a.z);
  const out = new Set<string>();
  for (const [fx, fy] of [[0.5, 0.5], [0.08, 0.5], [0.92, 0.5], [0.5, 0.15], [0.5, 0.85]]) {
    /* Only where the words are: a left-set line does not reach the right of its box. */
    const px = t.align === 'center' || !t.align || t.align === 'left' ? t.x + t.w * (t.align === 'center' ? fx : Math.min(fx, 0.5)) : t.x + t.w * Math.max(fx, 0.5);
    const py = t.y + t.h * fy;
    let found: string | null = null;
    for (const o of below) {
      if (!covers(o, px, py)) continue;
      if (o.type === 'image') { found = 'photo'; break; }
      if (o.type === 'shape' && o.fill && HEX.test(o.fill) && (o.opacity ?? 1) >= 0.95) { found = o.fill; break; }
    }
    out.add(found ?? (page.pattern ? 'pattern' : page.background ?? '#ffffff'));
  }
  return [...out];
}

/** Every finding for this document. Empty means it passes what is measured here. */
export function checkConcept(doc: DesignDocument, opts: CheckOptions): Finding[] {
  const out: Finding[] = [];
  const page = doc.pages[0];
  const f = opts.format;
  const ts = texts(page.objects);

  /* C4: the canvas is the format's shape, within 1%. */
  if (f) {
    const err = Math.abs(page.width / page.height - f.w / f.h) / (f.w / f.h);
    if (err > 0.01) out.push({ code: 'C4', where: 'Page', detail: `canvas is ${page.width}x${page.height}, ${(err * 100).toFixed(1)}% off the ${f.label} shape` });
  }

  /* C3: every character has a glyph in its face, or in the fallback face that covers it. */
  for (const t of ts) {
    const face = typefaceOf(t.font);
    const widths = METRIC_WIDTHS[`${face.key}-${nearestWeight(t.font, t.weight ?? 600)}`];
    const missing = new Set<string>();
    for (const ch of t.upper ? t.text.toUpperCase() : t.text) {
      if (ch === '\n') continue;
      const k = INDEX.get(ch);
      const drawn = k !== undefined && widths ? widths[k] >= 0 : false;
      if (!drawn && !(face.glyphFallback && inFallback(ch.codePointAt(0) as number)) && !(face.key === GLYPH_FALLBACK.source)) missing.add(ch);
    }
    if (missing.size) out.push({ code: 'C3', where: t.name, detail: `${face.label} cannot draw ${[...missing].map((c) => `"${c}"`).join(' ')}` });
  }

  /* C5: copy cut short. A design that drops the end of a sentence is not finished. */
  for (const t of ts) if (t.text.endsWith('…')) out.push({ code: 'C5', where: t.name, detail: `copy is cut short: "${t.text.replace(/\n/g, ' ').slice(-28)}"` });

  /* C5: contrast, against whatever the words actually sit on. */
  for (const t of ts) {
    const need = t.slotRole === 'headline' ? 3 : 4.5;
    for (const ground of groundsUnder(t, page)) {
      if (ground === 'photo') out.push({ code: 'C5', where: t.name, detail: 'sits directly on a photograph, where contrast cannot be promised' });
      else if (ground === 'pattern') out.push({ code: 'C5', where: t.name, detail: 'sits on the pattern instead of a plain panel' });
      else if (t.colour && HEX.test(t.colour)) {
        const ratio = contrastRatio(t.colour, ground);
        if (ratio < need - 1e-9) out.push({ code: 'C5', where: t.name, detail: `contrast ${ratio.toFixed(2)}:1 on ${ground}, below ${need}:1` });
      }
    }
  }

  /* C5: smallest readable type. Six points at print size, the floor on a screen, and the roadside floors on a board. */
  const minPx = minTextPx(f);
  for (const t of ts) {
    const px = t.size * page.width;
    if (opts.distance) {
      const floor = t.slotRole === 'brand' ? BILLBOARD_MIN_BRAND : BILLBOARD_MIN_TEXT;
      const rel = px / page.height;
      if (rel < floor - 1e-9) out.push({ code: 'C5', where: t.name, detail: `${rel.toFixed(3)} of the board's height, below ${floor}` });
    } else if (px < minPx - 1e-6) {
      out.push({ code: 'C5', where: t.name, detail: `set at ${px.toFixed(1)} px, below this format's ${minPx.toFixed(1)} px minimum` });
    }
  }
  if (opts.distance) {
    /* S5: seven words, the name and one line to act on left out of the count. */
    const counted = ts.filter((t) => t.slotRole !== 'brand' && t.name !== 'Call to action').reduce((n, t) => n + words(t.text), 0);
    if (counted > BILLBOARD_MAX_WORDS) out.push({ code: 'C5', where: 'Page', detail: `${counted} words besides the name and one action line, more than ${BILLBOARD_MAX_WORDS}` });
  }

  /* C12: nothing a press will trim. Words stay inside the format's safe margin. */
  if (f?.mm && f.safeMm > 0) {
    const sx = f.safeMm / f.mm.w;
    const sy = f.safeMm / f.mm.h;
    for (const t of ts) {
      const gaps = [t.x - sx, t.y - sy, 1 - sx - (t.x + t.w), 1 - sy - (t.y + t.h)];
      const worst = Math.min(gaps[0] * f.mm.w, gaps[1] * f.mm.h, gaps[2] * f.mm.w, gaps[3] * f.mm.h);
      if (worst < -0.05) out.push({ code: 'C12', where: t.name, detail: `${(-worst).toFixed(1)} mm inside the ${f.safeMm} mm safe margin` });
    }
  }
  return out;
}

/** One line per finding, for a test failure or a review sheet. */
export const describeFindings = (fs: Finding[]): string[] => fs.map((x) => `${x.code} ${x.where}: ${x.detail}`);
