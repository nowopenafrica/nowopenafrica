/**
 * The pilot collection (Task 18): the twenty render, and clear the automated
 * half of the quality standard, at their own canvases.
 *
 * NODE + jsdom: the criticals read the shipped font files (critical.ts), and
 * the render needs a DOM. Nothing here lays text out; jsdom cannot. What a
 * page LOOKS like is the founder's review, on screenshots.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import TemplateSurface from '../../components/studio/TemplateSurface';
import { drawTemplateFrame } from '../drawTemplate';
import { DESIGN_TEMPLATES } from '../designTemplates';
import { subcategoryFor } from '../create/catalogueTaxonomy';
import { sampleFor } from '../create/sampleCopy';
import { directionOverflow, distinctnessIssues } from './composition';
import { deliverableFor } from './deliverables';
import { isProfilePointer } from './icons';
import { platformMark } from './platformMarks';
import { previewPhotoFor, previewPhotoForTemplate } from './previewMedia';
import { PILOT_TEMPLATES } from './pilotTemplates';
import { automatedCriticals } from './quality/critical';
import { externalUrls } from './quality/checks/assets';
import { slotIconSets, slotIcons } from './quality/checks/icons';
import { pagesOf } from './quality/checks/copy';
import { canvasFor } from './quality/checks/geometry';
import { previewCriticals } from './quality/preview';

const MANIFEST = { assets: [] };
const keys = PILOT_TEMPLATES.map((t) => t.key);
const inSub = (sub: string) => PILOT_TEMPLATES.filter((t) => subcategoryFor(t)?.key === sub);

/** Render every page of a template at its true canvas; report a throw or an image without a source. */
function renderProblems(key: string): string[] {
  const tpl = PILOT_TEMPLATES.find((t) => t.key === key)!;
  const { w, h } = canvasFor(tpl);
  const problems: string[] = [];
  const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const was = g.IS_REACT_ACT_ENVIRONMENT;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const quiet = console.error;
  try {
    for (const page of pagesOf(tpl)) {
      // With and without the gallery's preview photograph, as a photo-led card is shown both ways.
      // previewPhotoForTemplate is null when the pool has no photo of the design's subject (Ruling AH).
      for (const mediaUrl of tpl.photoLed ? [null, previewPhotoForTemplate(tpl), previewPhotoFor(tpl.key)] : [null]) {
        console.error = () => {};
        act(() => {
          root.render(createElement(TemplateSurface, {
            template: { ...tpl, slots: page.slots },
            content: sampleFor(tpl), width: w, height: h, accent: '#2563eb', mediaUrl,
          }));
        });
        console.error = quiet;
        const surface = host.firstElementChild as HTMLElement | null;
        if (!surface) problems.push(`${page.name}: rendered nothing`);
        else if (surface.style.width !== `${w}px` || surface.style.height !== `${h}px`) {
          problems.push(`${page.name}: drew ${surface.style.width} x ${surface.style.height}, not ${w} x ${h}`);
        }
        for (const img of Array.from(host.querySelectorAll('img'))) {
          if (!img.getAttribute('src')) problems.push(`${page.name}: an image has no source`);
        }
      }
    }
  } catch (e) {
    problems.push(`render threw: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    console.error = quiet;
    try { act(() => root.unmount()); } catch { /* torn down by the error */ }
    host.remove();
    g.IS_REACT_ACT_ENVIRONMENT = was;
  }
  return problems;
}

/** One page drawn by TemplateSurface with its demo copy, at its true canvas. */
function drawDom(tpl: (typeof PILOT_TEMPLATES)[number], slots: (typeof PILOT_TEMPLATES)[number]['slots']) {
  const { w, h } = canvasFor(tpl);
  const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const was = g.IS_REACT_ACT_ENVIRONMENT;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => {
    root.render(createElement(TemplateSurface, {
      template: { ...tpl, slots }, content: sampleFor(tpl), width: w, height: h, accent: '#2563eb',
    }));
  });
  return {
    el,
    done: () => { act(() => root.unmount()); el.remove(); g.IS_REACT_ACT_ENVIRONMENT = was; },
  };
}

describe('the pilot collection', () => {
  it('is twenty designs: eight cards, six posts, six 48-sheets, all in the library', () => {
    expect(PILOT_TEMPLATES).toHaveLength(20);
    expect(inSub('business-card')).toHaveLength(8);
    expect(inSub('instagram-post')).toHaveLength(6);
    expect(inSub('billboard-48-sheet')).toHaveLength(6);
    for (const key of keys) expect(DESIGN_TEMPLATES.some((t) => t.key === key), key).toBe(true);
  });

  it('opens each on its product canvas', () => {
    const want: Record<string, string> = {
      'business-card': 'business-card', 'instagram-post': 'instagram-portrait', 'billboard-48-sheet': 'board-48-sheet',
    };
    for (const t of PILOT_TEMPLATES) expect(deliverableFor(t)?.format, t.key).toBe(want[subcategoryFor(t)!.key]);
  });

  it('uses each direction at most once in a product, and every direction on the cards', () => {
    for (const sub of ['business-card', 'instagram-post', 'billboard-48-sheet']) {
      const dirs = inSub(sub).map((t) => t.direction);
      expect(new Set(dirs).size, sub).toBe(dirs.length);
    }
    expect(new Set(inSub('business-card').map((t) => t.direction)).size).toBe(8);
  });

  it('keeps every pair in a product at distance 3 or more, with no direction overflowing', () => {
    expect(distinctnessIssues(PILOT_TEMPLATES)).toEqual([]);
    expect(directionOverflow(PILOT_TEMPLATES)).toEqual([]);
    // And against the whole library, where the undirected designs are not compared.
    expect(distinctnessIssues(DESIGN_TEMPLATES)).toEqual([]);
    expect(directionOverflow(DESIGN_TEMPLATES)).toEqual([]);
  });

  it('never repeats a palette across the twenty', () => {
    const palettes = PILOT_TEMPLATES.map((t) => t.look?.palette);
    expect(palettes.every(Boolean)).toBe(true);
    expect(new Set(palettes).size).toBe(palettes.length);
  });

  it('gives every card a back, and the industry designs a real trade', () => {
    for (const t of inSub('business-card')) expect(t.extraPages?.length, t.key).toBe(1);
    for (const t of PILOT_TEMPLATES.filter((x) => x.direction === 'industry')) {
      expect(t.industries?.length, t.key).toBe(1);
    }
  });

  it('carries no image of its own, and declares an icon set exactly when it draws icons', () => {
    for (const t of PILOT_TEMPLATES) {
      expect(externalUrls(t), t.key).toEqual([]);
      const sets = slotIconSets(t);
      const want = sets.size === 0 ? undefined : sets.has('lucide') ? 'lucide' : 'platform';
      expect(t.iconSet, t.key).toBe(want);
    }
  });

  it('puts icons where the design spec says (Task 18b)', () => {
    const on = (key: string) => slotIcons(PILOT_TEMPLATES.find((t) => t.key === key)!)
      .map((p) => `${p.where}=${p.icon.set}:${p.icon.name}`);
    expect(on('pilot-card-industry')).toEqual([
      'front.contact[0]=lucide:phone', 'front.contact[1]=lucide:map-pin', 'front.contact[2]=lucide:globe',
      'Back.services[0]=lucide:clock', 'Back.services[1]=lucide:clock', 'Back.services[2]=lucide:clock',
    ]);
    // Every card leads its contact rows with icons; the handle cards carry one Instagram mark.
    for (const t of inSub('business-card')) expect(slotIconSets(t).has('lucide'), t.key).toBe(true);
    const marks = (t: (typeof PILOT_TEMPLATES)[number]) => slotIcons(t).filter((p) => p.icon.set === 'platform');
    expect(PILOT_TEMPLATES.filter((t) => marks(t).length > 0).map((t) => t.key).sort()).toEqual([
      'pilot-bb-contemporary', 'pilot-card-bold', 'pilot-card-contemporary', 'pilot-card-playful', 'pilot-ig-bold',
    ]);
    // Billboards: at most one handle line, one mark, and no general icons (few words, large type).
    for (const t of inSub('billboard-48-sheet')) {
      expect(marks(t).length, t.key).toBeLessThanOrEqual(1);
      expect(slotIconSets(t).has('lucide'), t.key).toBe(false);
    }
    for (const t of PILOT_TEMPLATES) for (const p of marks(t)) expect(p.icon.name, t.key).toBe('instagram');
  });

  it('has no automated critical failure', () => {
    const failures = PILOT_TEMPLATES.flatMap((t) =>
      automatedCriticals(t, DESIGN_TEMPLATES, MANIFEST).map((c) => `${t.key}: ${c.code} ${c.detail}`));
    expect(failures).toEqual([]);
  });

  it('renders every page as the gallery card does (C6)', () => {
    const failures = PILOT_TEMPLATES.flatMap((t) => previewCriticals(t).map((c) => `${t.key}: ${c.code} ${c.detail}`));
    expect(failures).toEqual([]);
  });

  /*
   * The trademark rule, as drawn: on every page of every pilot, a platform
   * mark sits only on a row whose words are a handle or a profile pointer,
   * and it is painted in that row's own text colour.
   */
  it('draws a platform mark only beside a handle, in the row text colour', () => {
    let seen = 0;
    for (const tpl of PILOT_TEMPLATES) {
      for (const page of pagesOf(tpl)) {
        const host = drawDom(tpl, page.slots);
        for (const svg of Array.from(host.el.querySelectorAll<SVGElement>('svg[data-icon^="platform:"]'))) {
          seen += 1;
          const row = svg.parentElement as HTMLElement;
          const words = row.textContent ?? '';
          expect(isProfilePointer(words), `${tpl.key} ${page.name}: "${words}"`).toBe(true);
          // The row (or, in a text slot, its flex line) carries the words' colour; the mark takes it unchanged.
          expect(svg.style.color, `${tpl.key} ${page.name}`).not.toBe('');
          expect(svg.style.color, `${tpl.key} ${page.name}`).toBe(row.style.color);
          expect(svg.getAttribute('fill')).toBe('currentColor');
          const name = svg.getAttribute('data-icon')!.split(':')[1];
          expect(svg.querySelector('path')?.getAttribute('d')).toBe(platformMark(name)!.path);
        }
        host.done();
      }
    }
    // Five pilots carry a handle row, one each.
    expect(seen).toBe(5);
  });

  /*
   * And the export matches: the canvas painter draws each icon from the same
   * path data as the DOM, in the colour of the words it leads.
   */
  it('paints the same icons on the canvas, from the same paths, in the words colour', () => {
    const g = globalThis as { Path2D?: unknown };
    const had = g.Path2D;
    class FakePath { d: string; constructor(d: string) { this.d = d; } }
    g.Path2D = FakePath;
    try {
      for (const tpl of PILOT_TEMPLATES) {
        const { w, h } = canvasFor(tpl);
        for (const page of pagesOf(tpl)) {
          /* Icons and words in paint order, so each icon can be matched to the words drawn after it. */
          const events: { d?: string; text?: string; y?: number; colour: unknown }[] = [];
          /* Where each icon's box starts, in the coordinates it is drawn in (paintIcon translates, then scales). */
          const iconTops: number[] = [];
          let lastY = 0;
          const state: Record<string, unknown> = { fillStyle: '', strokeStyle: '', font: '' };
          const stack: Record<string, unknown>[] = [];
          const ctx = new Proxy(state, {
            get(target, prop: string) {
              if (prop in target) return target[prop];
              if (prop === 'save') return () => { stack.push({ ...target }); };
              if (prop === 'restore') return () => { Object.assign(target, stack.pop() ?? {}); };
              if (prop === 'fill') return (p?: unknown) => { if (p instanceof FakePath) events.push({ d: p.d, colour: target.fillStyle }); };
              if (prop === 'stroke') return (p?: unknown) => { if (p instanceof FakePath) events.push({ d: p.d, colour: target.strokeStyle }); };
              if (prop === 'fillText') return (t: string, _x: number, y: number) => { events.push({ text: t, y, colour: target.fillStyle }); };
              if (prop === 'translate') return (_x: number, y: number) => { lastY = y; };
              if (prop === 'scale') return () => { iconTops.push(lastY); };
              if (prop === 'measureText') return (t: string) => ({ width: t.length * 10 });
              if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
              return () => undefined;
            },
            set(target, prop: string, v) { target[prop] = v; return true; },
          }) as unknown as CanvasRenderingContext2D;
          drawTemplateFrame(ctx, { ...tpl, slots: page.slots }, sampleFor(tpl), w, h, { accent: '#2563eb' });

          const host = drawDom(tpl, page.slots);
          const domPaths = Array.from(host.el.querySelectorAll('svg[data-icon] path')).map((p) => p.getAttribute('d'));
          /*
           * Where the DOM puts each icon: centred in its line box, so its top is
           * half the leading below the line's top, (lineHeight x size - size) / 2.
           * A list row's line box starts at the row's own top; a text slot's at
           * the slot's origin, which is where the canvas translates to.
           */
          const domTops = Array.from(host.el.querySelectorAll<SVGElement>('svg[data-icon]')).map((svg) => {
            const line = svg.parentElement as HTMLElement;
            const fs = parseFloat(line.style.fontSize);
            const lead = (parseFloat(line.style.lineHeight) * fs - parseFloat(svg.getAttribute('width')!)) / 2;
            return { lead, rowTop: line.style.top ? parseFloat(line.style.top) : 0, text: !line.style.top };
          });
          host.done();

          expect(iconTops.length, `${tpl.key} ${page.name}`).toBe(domTops.length);
          domTops.forEach((d, i) => {
            expect(iconTops[i], `${tpl.key} ${page.name} icon ${i} top`).toBeCloseTo(d.rowTop + d.lead, 6);
          });
          // A text slot's words sit on the same line as its icon, half the leading down.
          for (const d of domTops.filter((x) => x.text)) {
            expect(events.some((e) => e.text !== undefined && Math.abs((e.y ?? NaN) - d.lead) < 1e-6), `${tpl.key} ${page.name} words`).toBe(true);
          }

          expect(events.filter((e) => e.d).map((e) => e.d), `${tpl.key} ${page.name}`).toEqual(domPaths);
          events.forEach((e, i) => {
            if (!e.d) return;
            // The next words painted are the icon's own row: same colour, unchanged.
            const words = events.slice(i + 1).find((x) => x.text !== undefined);
            expect(words?.colour, `${tpl.key} ${page.name} before "${words?.text}"`).toBe(e.colour);
          });
        }
      }
    } finally {
      g.Path2D = had;
    }
  });

  it('reads each row icon from its own words when the rows are a real business (Ruling AL)', () => {
    const tpl = PILOT_TEMPLATES.find((t) => t.key === 'pilot-card-corporate')!;
    const { w, h } = canvasFor(tpl);
    const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const was = g.IS_REACT_ACT_ENVIRONMENT;
    g.IS_REACT_ACT_ENVIRONMENT = true;
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    const icons = (contact: string[]) => {
      act(() => {
        root.render(createElement(TemplateSurface, {
          template: tpl, content: { ...sampleFor(tpl), contact }, width: w, height: h, accent: '#2563eb',
        }));
      });
      return Array.from(el.querySelectorAll('svg[data-icon]')).map((s) => s.getAttribute('data-icon'));
    };
    try {
      // The template's hints are phone, mail, globe; these rows are in another order.
      expect(icons(['hello@mamaput.ng', '+234 803 123 4567', 'www.mamaput.ng'])).toEqual(['lucide:mail', 'lucide:phone', 'lucide:globe']);
      // Free text nothing can classify, and no longer the sample: no icon, row kept.
      expect(icons(['Ring Ade after six', 'hello@mamaput.ng'])).toEqual(['lucide:mail']);
      expect(el.textContent).toContain('Ring Ade after six');
    } finally {
      act(() => root.unmount());
      el.remove();
      g.IS_REACT_ACT_ENVIRONMENT = was;
    }
  });

  it.each(keys)('renders %s at its true canvas, every page, without throwing', (key) => {
    expect(renderProblems(key)).toEqual([]);
  });
});
