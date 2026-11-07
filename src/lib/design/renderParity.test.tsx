/**
 * Renderer parity (spec §4.7): a looked template must draw the same words in
 * the same colour and the same face in all three places it is drawn.
 *
 *  - TemplateSurface, the DOM the gallery, the customiser and the PNG/PDF
 *    export render;
 *  - drawTemplateFrame, the canvas painter motion and video export use;
 *  - documentFromTemplate, the editable document "Open in Studio" makes.
 *
 * Structural, not pixels: jsdom lays nothing out and has no canvas. What is
 * compared is the colour and font family each renderer ASKS for, which is
 * where every drift so far has come from (a fourth copy of a constant, a
 * layer list joined the wrong way round). Ground layers are compared in paint
 * order, bottom first, with a mesh override so the order actually matters.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import TemplateSurface, { type TemplateContent } from '../../components/studio/TemplateSurface';
import { drawTemplateFrame } from '../drawTemplate';
import { DESIGN_TEMPLATES, isListRole, type DesignTemplate, type SlotSpec } from '../designTemplates';
import { documentFromTemplate, type TextObject } from '../studio/designDocument';
import { resolveLook, type Look } from './look';
import { fontStack } from './typefaces';

afterEach(cleanup);

const LOOKED = DESIGN_TEMPLATES.filter((t) => t.look);
const W = 1080;
const H = 1350;
const ACCENT = '#2563eb';

/* Words no two slots share, so each renderer's output is found by its text. */
const CONTENT: TemplateContent = {
  brand: 'Parity Brand Co',
  eyebrow: 'Eyebrow words',
  headline: 'Headline words',
  subline: 'Subline words here',
  meta: 'Meta line text',
  cta: 'Call to act',
  stats: [{ value: '41%', label: 'First label' }, { value: '72', label: 'Second label' }],
  logoUrl: null,
  qrUrl: null,
};
const TEXT_ROLES = ['brand', 'eyebrow', 'headline', 'subline', 'meta', 'cta'] as const;
type TextRole = typeof TEXT_ROLES[number];
const isTextRole = (r: string): r is TextRole => (TEXT_ROLES as readonly string[]).includes(r);

/* ---- normalising what each renderer says --------------------------------- */

/** Any CSS colour this code emits, as [r, g, b, a]. */
function rgba(c: string): [number, number, number, number] {
  const s = c.trim().toLowerCase();
  const fn = s.match(/^rgba?\(([^)]+)\)$/);
  if (fn) {
    const [r, g, b, a] = fn[1].split(',').map((x) => Number(x.trim()));
    return [r, g, b, a ?? 1];
  }
  const hex = s.replace('#', '');
  const n = Number.parseInt(hex.slice(0, 6), 16);
  const a = hex.length === 8 ? Number.parseInt(hex.slice(6), 16) / 255 : 1;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, Math.round(a * 100) / 100];
}
const family = (f: string): string => f.toLowerCase().replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim();
/** The family part of a canvas font shorthand: `800 54px Inter, sans-serif`. */
const canvasFamily = (font: string): string => family(font.replace(/^\s*\d+\s+[\d.]+px\s+/, ''));

/* ---- the canvas painter, recorded ---------------------------------------- */

interface Grad { kind: 'linear' | 'radial'; stops: string[] }
interface Painted { text: string; fill: unknown; font: string }

function recordCanvas(tpl: DesignTemplate, look?: Partial<Look>) {
  const texts: Painted[] = [];
  const fills: unknown[] = [];
  const state: Record<string, unknown> = { font: '', fillStyle: '' };
  const grad = (kind: Grad['kind']) => {
    const g: Grad = { kind, stops: [] };
    return Object.assign(g, { addColorStop: (_at: number, c: string) => { g.stops.push(c); } });
  };
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'fillText') return (t: string) => { texts.push({ text: t, fill: target.fillStyle, font: String(target.font) }); };
      if (prop === 'fillRect') return () => { fills.push(target.fillStyle); };
      if (prop === 'measureText') return (s: string) => ({ width: s.length * 20 });
      if (prop === 'createLinearGradient') return () => grad('linear');
      if (prop === 'createRadialGradient') return () => grad('radial');
      return () => undefined;
    },
    set(target, prop: string, v) { target[prop] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  drawTemplateFrame(ctx, tpl, CONTENT, W, H, { accent: ACCENT, look });
  return { texts, fills };
}

/** The first painted line of a slot's words: the renderer wraps, line one is a prefix. */
const canvasRun = (texts: Painted[], value: string, upper?: boolean): Painted | undefined => {
  const want = (upper ? value.toUpperCase() : value);
  return texts.find((p) => p.text.length > 0 && want.startsWith(p.text));
};

/* ---- the DOM, read back -------------------------------------------------- */

function renderDom(tpl: DesignTemplate, look?: Partial<Look>) {
  const { container } = render(
    <TemplateSurface template={tpl} content={CONTENT} width={W} height={H} accent={ACCENT} look={look} />,
  );
  /*
   * The innermost element carrying exactly these words and a colour, and the
   * face it inherits: a list row sets the family on the row, its value and
   * label divs only the colour.
   */
  const styleOf = (value: string): { color: string; fontFamily: string } | undefined => {
    const hits = [...container.querySelectorAll<HTMLElement>('div, span')]
      .filter((el) => el.textContent === value && el.style.color);
    const el = hits[hits.length - 1];
    if (!el) return undefined;
    let face: HTMLElement | null = el;
    while (face && !face.style.fontFamily) face = face.parentElement;
    return { color: el.style.color, fontFamily: face?.style.fontFamily ?? '' };
  };
  return { container, styleOf };
}

/* ---- the suite ----------------------------------------------------------- */

const MESH: Partial<Look> = { gradient: { kind: 'mesh', stops: ['ground', 'primary', 'secondary'] } };

describe('renderer parity for every looked template', () => {
  it('has looked templates to compare', () => {
    expect(LOOKED.length).toBeGreaterThanOrEqual(3);
  });

  for (const tpl of LOOKED) {
    describe(tpl.key, () => {
      const slots = tpl.slots.filter((s): s is SlotSpec & { role: TextRole } => isTextRole(s.role));
      const doc = documentFromTemplate(tpl, CONTENT, { width: W, height: H, accent: ACCENT });
      const objectFor = (role: string) =>
        doc.pages[0].objects.find((o) => o.slotRole === role) as TextObject | undefined;

      it('sets each text slot in the same colour and face in all three renderers', () => {
        const dom = renderDom(tpl);
        const canvas = recordCanvas(tpl);
        for (const slot of slots) {
          const value = CONTENT[slot.role] as string;
          const tag = `${tpl.key}/${slot.role}`;

          const css = dom.styleOf(value);
          const painted = canvasRun(canvas.texts, value, slot.upper);
          const obj = objectFor(slot.role);
          expect(css, `${tag}: DOM`).toBeTruthy();
          expect(painted, `${tag}: canvas`).toBeTruthy();
          expect(obj, `${tag}: document`).toBeTruthy();
          if (!css || !painted || !obj) continue;

          // A disc paints its own colour behind the words; the editor has no disc.
          if (slot.treatment !== 'disc') {
            expect(rgba(String(painted.fill)), `${tag}: canvas colour`).toEqual(rgba(css.color));
            expect(rgba(obj.colour ?? ''), `${tag}: document colour`).toEqual(rgba(css.color));
          }
          expect(canvasFamily(painted.font), `${tag}: canvas face`).toBe(family(css.fontFamily));
          expect(family(fontStack(obj.font)), `${tag}: document face`).toBe(family(css.fontFamily));
        }
      });

      it('draws stat values and labels alike in the DOM and on the canvas', () => {
        const stats = tpl.slots.find((s) => s.role === 'stats');
        if (!stats) return;
        const dom = renderDom(tpl);
        const canvas = recordCanvas(tpl);
        for (const { value, label } of CONTENT.stats ?? []) {
          for (const words of [value, label]) {
            const css = dom.styleOf(words);
            const painted = canvasRun(canvas.texts, words, words === label);
            expect(css && painted, `${tpl.key}/stats ${words}`).toBeTruthy();
            if (!css || !painted) continue;
            expect(rgba(String(painted.fill)), `${tpl.key}/stats ${words}`).toEqual(rgba(css.color));
            expect(canvasFamily(painted.font)).toBe(family(css.fontFamily));
          }
        }
        /*
         * The editor holds a list as ONE text object with one colour, so it
         * cannot draw a primary value over an ink label. It takes the ink that
         * reads where the slot sits, which is the readable choice for both
         * lines (and what the editor has always done for lists); the two-tone
         * stat is a known, recorded difference of the editable copy.
         */
        const r = resolveLook(tpl, { accent: ACCENT, width: W, height: H });
        const obj = objectFor('stats');
        if (obj && isListRole(stats.role) && stats.tone !== 'muted') {
          expect(rgba(obj.colour ?? '')).toEqual(rgba(r.inkOn[stats.on ?? 'ground']));
        }
      });

      it('paints the ground layers in the same order', () => {
        const look = MESH;
        const r = resolveLook(tpl, { override: look, accent: ACCENT, width: W, height: H });
        const layers = r.groundLayers.map((l) => ({ kind: l.kind, stops: l.stops.map((s) => rgba(s.color)) }));
        expect(layers.map((l) => l.kind)).toEqual(['linear', 'radial', 'radial']);

        // Canvas: the first gradient fills are the ground, bottom first.
        const painted = recordCanvas(tpl, look).fills
          .filter((f): f is Grad => typeof f === 'object' && f !== null && 'stops' in f)
          .slice(0, layers.length)
          .map((g) => ({ kind: g.kind, stops: g.stops.map(rgba) }));
        expect(painted).toEqual(layers);

        // DOM: sibling layer divs, later ones on top, so DOM order is paint order.
        // They precede the pattern and the shapes, so the first gradients are the ground.
        const { container } = renderDom(tpl, look);
        const domKinds = [...container.firstElementChild!.children]
          .map((el) => (el as HTMLElement).style.background)
          .filter((bg) => /gradient\(/.test(bg))
          .slice(0, layers.length)
          .map((bg) => (bg.startsWith('radial') ? 'radial' : 'linear'));
        expect(domKinds).toEqual(layers.map((l) => l.kind));

        // Editor: a CSS background list paints its FIRST value on top, so it is the reverse.
        const bg = documentFromTemplate(tpl, CONTENT, { width: W, height: H, accent: ACCENT, look }).pages[0].background ?? '';
        const listed = [...bg.matchAll(/(linear|radial)-gradient\(/g)].map((m) => m[1]);
        expect(listed.reverse()).toEqual(layers.map((l) => l.kind));
      });
    });
  }
});
