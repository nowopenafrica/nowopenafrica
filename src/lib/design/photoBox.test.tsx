/**
 * Task 18c-1, the engine half of the premium uplift: the photo box and its
 * focal point (S2), the designed no-photo state (S1, S1b), per-side shapes
 * (S3), text flow (S4) and the solid pill (S7), in both renderers.
 *
 * Structural, as renderParity is: jsdom lays nothing out and has no canvas,
 * so what is compared is where each renderer puts things and what colour it
 * asks for.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import TemplateSurface from '../../components/studio/TemplateSurface';
import { balanceLines, drawTemplateFrame, tabularWidth } from '../drawTemplate';
import {
  coverInBox, fitSlotSize, frontShapes, lineHeightFor, pageTemplate, photoBoxPx, photoMaskShapes, templateByKey, wrapEstimate,
  type DesignTemplate, type SlotSpec,
} from '../designTemplates';
import { isSampleText, sampleFor } from '../create/sampleCopy';
import { documentFromTemplate, type ShapeObject } from '../studio/designDocument';
import { describe as describeLayout } from './composition';
import { resolveLook } from './look';
import { fallbackProblems, initialOf, resolveFallback } from './photoFallback';
import { PILOT_TEMPLATES } from './pilotTemplates';
import { previewPhotoForTemplate } from './previewMedia';
import { previewCriticals } from './quality/preview';
import { canvasFor } from './quality/checks/geometry';

afterEach(cleanup);

const ACCENT = '#2563eb';
const PHOTO_LED = PILOT_TEMPLATES.filter((t) => t.photoLed);

/** A canvas context that records calls, with save/restore so clip state can be followed. */
function recorder() {
  const calls: { op: string; args: unknown[]; fill?: unknown; alpha?: number }[] = [];
  const state: Record<string, unknown> = { fillStyle: '', strokeStyle: '', font: '', globalAlpha: 1, textAlign: 'left', textBaseline: 'top' };
  const stack: Record<string, unknown>[] = [];
  const grads: { stops: [number, string][] }[] = [];
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'save') return () => { stack.push({ ...target }); calls.push({ op: 'save', args: [] }); };
      if (prop === 'restore') return () => { Object.assign(target, stack.pop() ?? {}); calls.push({ op: 'restore', args: [] }); };
      if (prop === 'measureText') return (s: string) => ({ width: s.length * 20 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => { const g = { stops: [] as [number, string][], addColorStop: (at: number, c: string) => { g.stops.push([at, c]); } }; grads.push(g); return g; };
      }
      return (...args: unknown[]) => { calls.push({ op: prop, args, fill: target.fillStyle, alpha: target.globalAlpha as number }); };
    },
    set(target, prop: string, v) { target[prop] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, grads };
}

const rgb = (c: string): string => {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return c.toLowerCase();
  const [r, g, b, a] = m[1].split(',').map((x) => Number(x.trim()));
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  return a === undefined || a === 1 ? hex : `${hex}@${a}`;
};

describe('the photo box (S2)', () => {
  it('replaces the four-panel windows: no pilot builds a window from abutting base panels', () => {
    for (const key of ['pilot-ig-contemporary', 'pilot-ig-luxury', 'pilot-bb-luxury']) {
      const t = templateByKey(key);
      expect(t.photo, key).toBeDefined();
      expect((t.shapes ?? []).filter((s) => s.kind === 'rect' && s.tone === 'base'), key).toEqual([]);
    }
  });

  it('every photo-led pilot has a box, inside the canvas', () => {
    for (const t of PHOTO_LED) {
      const p = t.photo!;
      expect(p, t.key).toBeDefined();
      expect(p.x >= 0 && p.y >= 0 && p.x + p.w <= 1 + 1e-9 && p.y + p.h <= 1 + 1e-9, t.key).toBe(true);
    }
  });

  it('places the cover image by its focal point, as CSS object-position does', () => {
    const box = { x: 100, y: 50, w: 400, h: 200 };
    // A 1000x1000 image covers 400x200 at 400x400; 200 px of height overflow.
    expect(coverInBox(1000, 1000, box)).toEqual({ x: 100, y: -50, w: 400, h: 400 });
    expect(coverInBox(1000, 1000, box, [0.5, 0])).toEqual({ x: 100, y: 50, w: 400, h: 400 });
    expect(coverInBox(1000, 1000, box, [0.5, 1])).toEqual({ x: 100, y: -150, w: 400, h: 400 });
  });

  it('keeps a layout without a box full bleed, in both renderers', () => {
    const t = templateByKey('statement');
    expect(photoBoxPx(t, 1080, 1080)).toEqual({ x: 0, y: 0, w: 1080, h: 1080, radius: 0 });
    const { container } = render(
      <TemplateSurface template={t} content={sampleFor(t)} width={1080} height={1080} accent={ACCENT} mediaUrl="/x.jpg" />,
    );
    expect(container.querySelector('[data-photo-box]')).toBeNull();
    expect((container.querySelector('img') as HTMLElement).style.inset).toBe('0px');
  });

  it('clips the photo to the box in the DOM and on the canvas, at the same place', () => {
    const t = templateByKey('pilot-ig-contemporary');
    const { w, h } = canvasFor(t);
    const box = photoBoxPx(t, w, h);
    const { container } = render(
      <TemplateSurface template={t} content={sampleFor(t)} width={w} height={h} accent={ACCENT} mediaUrl="/x.jpg" />,
    );
    const frame = container.querySelector<HTMLElement>('[data-photo-box]')!;
    expect(frame).toBeTruthy();
    expect([frame.style.left, frame.style.top, frame.style.width, frame.style.height])
      .toEqual([box.x, box.y, box.w, box.h].map((v) => `${v}px`));
    expect(frame.style.overflow).toBe('hidden');

    const { ctx, calls } = recorder();
    const media = { width: 800, height: 600 } as unknown as CanvasImageSource;
    drawTemplateFrame(ctx, t, { ...sampleFor(t), media }, w, h, { accent: ACCENT });
    const clipAt = calls.findIndex((c) => c.op === 'clip');
    const rect = calls.slice(0, clipAt).reverse().find((c) => c.op === 'rect');
    expect(rect?.args).toEqual([box.x, box.y, box.w, box.h]);
    const draw = calls.find((c) => c.op === 'drawImage')!;
    expect(draw.args.slice(1)).toEqual(Object.values(coverInBox(800, 600, box, t.photo?.focal)));
  });

  it('keeps the window as panels in the editable document, overlapped so no seam opens', () => {
    const t = templateByKey('pilot-ig-contemporary');
    const mask = photoMaskShapes(t, 0.002);
    expect(mask).toHaveLength(4);
    // The left panel reaches past the box edge; the bottom panel past the box foot.
    expect(mask[0]).toMatchObject({ kind: 'rect', x: 0, w: 0.442 });
    const doc = documentFromTemplate(t, sampleFor(t), { width: 1080, height: 1350, accent: ACCENT });
    const shapes = doc.pages[0].objects.filter((o): o is ShapeObject => o.type === 'shape');
    // Four panels, then the blue tile.
    expect(shapes).toHaveLength(5);
    const roles = resolveLook(t, { accent: ACCENT, width: 1080, height: 1350 }).roles;
    expect(shapes.slice(0, 4).every((s) => s.fill === roles.ground)).toBe(true);
  });

  it('measures image share from the box, and keeps every pilot descriptor where it was', () => {
    // Before Task 18c-1 these came from the four base panels.
    expect(describeLayout(templateByKey('pilot-ig-contemporary')).imageShare).toBe(1);
    expect(describeLayout(templateByKey('pilot-ig-luxury')).imageShare).toBe(2);
    expect(describeLayout(templateByKey('pilot-bb-luxury')).imageShare).toBe(2);
    // The mount still holds the headline, as the panel did.
    expect(describeLayout(templateByKey('pilot-ig-luxury')).container).toBe(true);
    expect(describeLayout(templateByKey('pilot-ig-contemporary')).container).toBe(false);
  });
});

describe('the no-photo state (S1, S1b)', () => {
  it('every photo-led pilot carries one that is more than a flat field', () => {
    for (const t of PHOTO_LED) expect(fallbackProblems(t), t.key).toEqual([]);
  });

  it('is drawn with no photo, never an empty plane, in the DOM and on the canvas', () => {
    for (const t of PHOTO_LED) {
      const { w, h } = canvasFor(t);
      const { container, unmount } = render(
        <TemplateSurface template={t} content={sampleFor(t)} width={w} height={h} accent={ACCENT} mediaUrl={null} />,
      );
      const fb = container.querySelector<HTMLElement>('[data-photo-fallback]');
      expect(fb, `${t.key}: DOM`).toBeTruthy();
      const layers = [...fb!.querySelectorAll<HTMLElement>('[data-fallback-layer]')];
      expect(layers.length, t.key).toBeGreaterThan(0);
      // Something besides the first flat layer: a tint, a pattern, geometry, a keyline or the initial.
      expect(fb!.children.length, `${t.key}: only a flat field`).toBeGreaterThan(1);
      unmount();

      const resolved = resolveFallback(t, resolveLook(t, { accent: ACCENT, width: w, height: h }).roles, w, h, sampleFor(t).brand)!;
      const { ctx, calls } = recorder();
      drawTemplateFrame(ctx, t, sampleFor(t), w, h, { accent: ACCENT });
      const box = resolved.box;
      const filled = calls.some((c) => c.op === 'fillRect' && (c.args as number[]).join() === [box.x, box.y, box.w, box.h].join());
      expect(filled, `${t.key}: canvas fill`).toBe(true);
    }
  });

  it('is not drawn when there is a photograph', () => {
    const t = templateByKey('pilot-ig-luxury');
    const { container } = render(
      <TemplateSurface template={t} content={sampleFor(t)} width={1080} height={1350} accent={ACCENT} mediaUrl="/x.jpg" />,
    );
    expect(container.querySelector('[data-photo-fallback]')).toBeNull();
  });

  it('paints the same fill colours in both renderers', () => {
    for (const t of PHOTO_LED) {
      const { w, h } = canvasFor(t);
      const roles = resolveLook(t, { accent: ACCENT, width: w, height: h }).roles;
      const fb = resolveFallback(t, roles, w, h, sampleFor(t).brand)!;
      const { container, unmount } = render(
        <TemplateSurface template={t} content={sampleFor(t)} width={w} height={h} accent={ACCENT} mediaUrl={null} />,
      );
      const dom = [...container.querySelectorAll<HTMLElement>('[data-fallback-layer]')].map((el) => el.style.background);
      unmount();
      const { ctx, calls, grads } = recorder();
      drawTemplateFrame(ctx, t, sampleFor(t), w, h, { accent: ACCENT });
      void calls;
      fb.layers.forEach((l, i) => {
        if (l.kind === 'flat') expect(rgb(dom[i]), `${t.key} layer ${i}`).toBe(rgb(l.color));
        else {
          for (const st of l.stops) expect(dom[i].replace(/\s/g, ''), `${t.key} layer ${i}`).toContain(st.color.replace(/\s/g, ''));
          expect(grads.some((g) => g.stops.map((s) => s[1]).join('|') === l.stops.map((s) => s.color).join('|')), `${t.key} canvas layer ${i}`).toBe(true);
        }
      });
    }
  });

  it('sets the name initial as the monogram (Ruling AP), and nothing when there is no name', () => {
    expect(initialOf('  émile & co')).toBe('É');
    expect(initialOf('')).toBe('');
    const t = templateByKey('pilot-ig-luxury');
    const { container, unmount } = render(
      <TemplateSurface template={t} content={{ ...sampleFor(t), brand: 'Kaya Studio' }} width={1080} height={1350} accent={ACCENT} />,
    );
    expect(container.querySelector('[data-fallback-monogram]')?.textContent).toBe('K');
    unmount();
    const none = render(
      <TemplateSurface template={t} content={{ ...sampleFor(t), brand: '' }} width={1080} height={1350} accent={ACCENT} />,
    );
    expect(none.container.querySelector('[data-fallback-monogram]')).toBeNull();
    const { ctx, calls } = recorder();
    drawTemplateFrame(ctx, t, { ...sampleFor(t), brand: 'Kaya Studio' }, 1080, 1350, { accent: ACCENT });
    expect(calls.some((c) => c.op === 'fillText' && c.args[0] === 'K')).toBe(true);
  });

  it('fails the preview gate (C6) when a directed photo-led design has none', () => {
    const t = templateByKey('pilot-ig-minimal');
    const stripped: DesignTemplate = { ...t, photo: { ...t.photo!, fallback: undefined } };
    const found = previewCriticals(stripped).map((c) => `${c.code} ${c.detail}`).join('\n');
    expect(found).toMatch(/C6 no photo/);
    expect(previewCriticals(t)).toEqual([]);
  });
});

describe('photo subjects (quick fixes)', () => {
  it('asks for what each design is for, or shows none, never a wrong subject', () => {
    expect(templateByKey('pilot-bb-industry').photoSubject).toBe('delivery');
    expect(templateByKey('pilot-bb-luxury').photoSubject).toBe('interior');
    // The pool has neither yet, so both preview with their no-photo state (Ruling AH).
    expect(previewPhotoForTemplate(templateByKey('pilot-bb-industry'))).toBeNull();
    expect(previewPhotoForTemplate(templateByKey('pilot-bb-luxury'))).toBeNull();
  });

  it('never puts a duotone on a face', () => {
    for (const t of PILOT_TEMPLATES) {
      if (t.photoSubject === 'beauty') expect(t.look?.duotone, t.key).toBeUndefined();
    }
    expect(templateByKey('pilot-ig-luxury').photoSubject).toBe('fashion-detail');
  });
});

describe('per-side shapes (S3)', () => {
  const card = templateByKey('pilot-card-industry');

  it('keeps back-only shapes off the front and puts them on the back', () => {
    const backOnly = (card.shapes ?? []).filter((s) => s.side === 'back');
    expect(backOnly).toHaveLength(2);
    expect(frontShapes(card)).toHaveLength((card.shapes ?? []).length - 2);
    const back = pageTemplate(card, 1);
    expect(back.slots).toBe(card.extraPages![0].slots);
    expect(back.shapes).toHaveLength((card.shapes ?? []).length);
    expect(back.shapes!.every((s) => s.side === undefined)).toBe(true);
    expect(pageTemplate(card, 0)).toBe(card);
  });

  it('draws them on the back only, in both renderers and the document', () => {
    const { w, h } = canvasFor(card);
    const count = (tpl: DesignTemplate) => {
      const { container, unmount } = render(
        <TemplateSurface template={tpl} content={sampleFor(card)} width={w} height={h} accent={ACCENT} />,
      );
      const n = [...container.firstElementChild!.children].filter((el) => (el as HTMLElement).style.height === `${0.003 * h}px`).length;
      unmount();
      return n;
    };
    expect(count(card)).toBe(0);
    expect(count(pageTemplate(card, 1))).toBe(2);

    const rects = (tpl: DesignTemplate) => {
      const { ctx, calls } = recorder();
      drawTemplateFrame(ctx, tpl, sampleFor(card), w, h, { accent: ACCENT });
      return calls.filter((c) => c.op === 'fillRect' && Math.abs((c.args[3] as number) - 0.003 * h) < 1e-6).length;
    };
    expect(rects(card)).toBe(0);
    expect(rects(pageTemplate(card, 1))).toBe(2);

    const doc = documentFromTemplate(card, sampleFor(card), { width: w, height: h, accent: ACCENT });
    const lines = (i: number) => doc.pages[i].objects.filter((o) => o.type === 'shape' && Math.abs(o.h - 0.003) < 1e-9).length;
    expect(lines(0)).toBe(0);
    expect(lines(1)).toBe(2);
  });
});

describe('text flow (S4)', () => {
  const slot: SlotSpec = { role: 'headline', x: 0.4, y: 0.08, w: 0.55, size: 0.3, upper: true, font: 'condensed' };

  it('wraps word by word', () => {
    expect(wrapEstimate('YOUR CAMPAIGN LINE', slot, 540, 3600)).toHaveLength(3);
    expect(wrapEstimate('one', slot, 540, 3600)).toHaveLength(1);
  });

  it('shrinks to the line limit, and leaves a slot without one as it was', () => {
    const free = fitSlotSize(slot, [slot], 'YOUR CAMPAIGN LINE', 3600, 1800);
    const two = fitSlotSize({ ...slot, maxLines: 2 }, [slot], 'YOUR CAMPAIGN LINE', 3600, 1800);
    expect(free).toBe(540);
    expect(two).toBeLessThan(free);
    expect(wrapEstimate('YOUR CAMPAIGN LINE', slot, two, 3600)).toHaveLength(2);
  });

  it('keeps the words inside a height box', () => {
    const boxed = { ...slot, h: 0.3 };
    const px = fitSlotSize(boxed, [boxed], 'YOUR CAMPAIGN LINE', 3600, 1800);
    const lines = wrapEstimate('YOUR CAMPAIGN LINE', boxed, px, 3600).length;
    expect(lines * px * 1.03).toBeLessThanOrEqual(0.3 * 1800);
  });

  it('balances lines on the canvas without adding one', () => {
    const measure = (s: string) => s.length * 10;
    const greedy = ['Book your next', 'session'];
    expect(balanceLines(measure, 'Book your next session', 150, 3)).not.toEqual(greedy);
    const balanced = balanceLines(measure, 'Book your next session', 150, 3);
    expect(balanced).toHaveLength(2);
    expect(Math.max(...balanced.map(measure))).toBeLessThan(140);
  });

  it('clamps a limited slot in the DOM and asks for balanced wrapping', () => {
    const t = templateByKey('pilot-bb-contemporary');
    const { container } = render(
      <TemplateSurface template={t} content={sampleFor(t)} width={3600} height={1800} accent={ACCENT} />,
    );
    const headline = [...container.querySelectorAll<HTMLElement>('div')].find((el) => el.textContent === sampleFor(t).headline && el.style.fontSize)!;
    expect(headline.style.webkitLineClamp || headline.style.getPropertyValue('-webkit-line-clamp')).toBe('2');
  });
});

describe('the solid pill (S7)', () => {
  it('fills the pill with its tone and sets the words in the ink for it, in both renderers', () => {
    const t = templateByKey('pilot-ig-industry');
    const roles = resolveLook(t, { accent: ACCENT, width: 1080, height: 1350 });
    const cta = sampleFor(t).cta!;
    const { container } = render(
      <TemplateSurface template={t} content={sampleFor(t)} width={1080} height={1350} accent={ACCENT} />,
    );
    const el = [...container.querySelectorAll<HTMLElement>('div')].find((d) => d.textContent === cta && d.style.borderRadius === '999px')!;
    expect(rgb(el.style.background)).toBe(roles.roles.highlight);
    expect(rgb(el.style.color)).toBe(roles.inkOn.highlight);

    const { ctx, calls } = recorder();
    drawTemplateFrame(ctx, t, sampleFor(t), 1080, 1350, { accent: ACCENT });
    const words = calls.find((c) => c.op === 'fillText' && String(c.args[0]) === cta.toUpperCase());
    expect(words?.fill).toBe(roles.inkOn.highlight);
    const pill = calls.filter((c) => c.op === 'fill' && c.fill === roles.roles.highlight);
    expect(pill.length).toBeGreaterThan(0);
  });

  it('is used where the tinted pill read as disabled', () => {
    for (const key of ['pilot-card-industry', 'pilot-ig-bold', 'pilot-ig-industry', 'pilot-bb-industry']) {
      expect(templateByKey(key).slots.find((s) => s.role === 'cta')?.pillStyle, key).toBe('solid');
    }
  });
});

describe('the bb-contemporary headline (quick fix)', () => {
  it('is at most 0.26 and two lines', () => {
    const h = templateByKey('pilot-bb-contemporary').slots.find((s) => s.role === 'headline')!;
    expect(h.size).toBeLessThanOrEqual(0.26);
    expect(h.maxLines).toBe(2);
  });
});

/* ── fix round 1 ─────────────────────────────────────────────────────── */

describe('fix round 1: the monogram (Ruling AW) and its letter', () => {
  it('draws no initial for the gallery sample name, in either renderer', () => {
    for (const t of PHOTO_LED.filter((x) => x.photo?.fallback?.monogram)) {
      const { w, h } = canvasFor(t);
      const { container, unmount } = render(
        <TemplateSurface template={t} content={sampleFor(t)} width={w} height={h} accent={ACCENT} />,
      );
      expect(container.querySelector('[data-fallback-monogram]'), t.key).toBeNull();
      unmount();
      const { ctx, calls } = recorder();
      drawTemplateFrame(ctx, t, sampleFor(t), w, h, { accent: ACCENT });
      const initial = initialOf(sampleFor(t).brand);
      expect(calls.some((c) => c.op === 'fillText' && c.args[0] === initial), t.key).toBe(false);
    }
  });

  it('takes one composed letter, keeping a letter whose capital is two', () => {
    expect(initialOf('ßeta Bakery')).toBe('ß');
    expect(initialOf('ﬁne Foods')).toBe('ﬁ');
    expect(initialOf('Émile Couture')).toBe('É');
    expect(initialOf('ʼNa Kitchen')).toBe('N');
    expect(initialOf('12 Degrees')).toBe('1');
  });
});

describe('fix round 1: the no-photo state must show something (S1b)', () => {
  it('fails a fill whose only tint is invisible, in the rule and in the preview gate', () => {
    const t = templateByKey('pilot-ig-minimal');
    const faint: DesignTemplate = {
      ...t,
      photo: { ...t.photo!, fallback: { layers: [{ kind: 'flat', tone: { role: 'ground' } }, { kind: 'flat', tone: { role: 'ink', alpha: 0 } }] } },
    };
    expect(fallbackProblems(faint).join()).toMatch(/untreated flat field/);
    expect(previewCriticals(faint).map((c) => c.detail).join('\n')).toMatch(/empty plane/);
  });
});

describe('fix round 1: the solid pill in the editable document', () => {
  it('is as tall as the words wrap, and sits around them as the DOM pads them', () => {
    // bb-industry's call to act, given two lines and a longer line to wrap onto them.
    const base = templateByKey('pilot-bb-industry');
    const t: DesignTemplate = { ...base, slots: base.slots.map((x) => (x.role === 'cta' ? { ...x, maxLines: 2 } : x)) };
    const W = 3600;
    const H = 1800;
    const slot = t.slots.find((s) => s.role === 'cta')!;
    const copy = { ...sampleFor(t), cta: 'Book a pickup in your area today' };
    const text = copy.cta;
    const px = fitSlotSize(slot, t.slots, text, W, H);
    const lines = wrapEstimate(text, slot, px, W).length;
    expect(lines).toBe(2);
    const doc = documentFromTemplate(t, copy, { width: W, height: H, accent: ACCENT });
    const pill = doc.pages[0].objects.find((o) => o.type === 'shape' && o.name === 'Pill')!;
    const pad = Math.min(W, H) * 0.014;
    expect(pill.h * H).toBeCloseTo(2 * px * lineHeightFor(slot.size) + pad * 1.4, 6);
    expect(pill.y * H).toBeCloseTo(slot.y * H - pad * 0.7, 6);
    // Right-aligned: the pill's right edge is the slot's, out by the side padding.
    expect((pill.x + pill.w) * W).toBeCloseTo((slot.x + slot.w) * W + pad * 1.6, 6);
  });
});

describe('fix round 1: focal points and the fallback geometry agree across renderers', () => {
  it('clamps an out-of-range focal point alike in the DOM and on the canvas', () => {
    const base = templateByKey('pilot-ig-contemporary');
    const t: DesignTemplate = { ...base, photo: { ...base.photo!, focal: [1.5, -0.2] } };
    const box = photoBoxPx(t, 1080, 1350);
    const { container } = render(
      <TemplateSurface template={t} content={sampleFor(t)} width={1080} height={1350} accent={ACCENT} mediaUrl="/x.jpg" />,
    );
    const pos = (container.querySelector('[data-photo-box] img') as HTMLElement).style.objectPosition;
    const [fx, fy] = pos.split(' ').map((v) => parseFloat(v) / 100);
    expect([fx, fy]).toEqual([1, 0]);
    const { ctx, calls } = recorder();
    drawTemplateFrame(ctx, t, { ...sampleFor(t), media: { width: 800, height: 600 } as unknown as CanvasImageSource }, 1080, 1350, { accent: ACCENT });
    const [, x, y, dw, dh] = calls.find((c) => c.op === 'drawImage')!.args as number[];
    expect(x).toBeCloseTo(box.x + (box.w - dw) * fx, 6);
    expect(y).toBeCloseTo(box.y + (box.h - dh) * fy, 6);
  });

  it('sets the monogram in the same face, size and place, and the keyline on the same rectangle', () => {
    const t = templateByKey('pilot-ig-luxury');
    const content = { ...sampleFor(t), brand: 'Kaya Studio' };
    const fb = resolveFallback(t, resolveLook(t, { accent: ACCENT, width: 1080, height: 1350 }).roles, 1080, 1350, content.brand)!;
    const { container } = render(
      <TemplateSurface template={t} content={content} width={1080} height={1350} accent={ACCENT} />,
    );
    const mono = container.querySelector<HTMLElement>('[data-fallback-monogram]')!;
    const line = container.querySelector<HTMLElement>('[data-fallback-keyline]')!;
    const { ctx, calls } = recorder();
    drawTemplateFrame(ctx, t, content, 1080, 1350, { accent: ACCENT });
    const painted = calls.find((c) => c.op === 'fillText' && c.args[0] === 'K')!;
    // Both centre the em box on (cx, cy): the DOM a line-height 1 box moved back by half, the canvas its 'middle' baseline.
    expect(parseFloat(mono.style.left) + fb.box.x).toBeCloseTo(painted.args[1] as number, 6);
    expect(parseFloat(mono.style.top) + fb.box.y).toBeCloseTo(painted.args[2] as number, 6);
    expect(mono.style.transform).toBe('translate(-50%, -50%)');
    expect(mono.style.lineHeight).toBe('1');
    expect(parseFloat(mono.style.fontSize)).toBe(fb.monogram!.sizePx);
    // The keyline: the DOM border sits inside its box; the canvas strokes its centre line half a width in.
    const k = fb.keyline!;
    expect([line.style.left, line.style.top, line.style.width, line.style.height].map(parseFloat))
      .toEqual([k.x - fb.box.x, k.y - fb.box.y, k.w, k.h]);
    const stroke = calls.find((c) => c.op === 'strokeRect')!.args as number[];
    expect(stroke[0]).toBeCloseTo(k.x + k.width / 2, 6);
    expect(stroke[2]).toBeCloseTo(k.w - k.width, 6);
  });
});

/* ── Task 18c-2 ──────────────────────────────────────────────────────── */

describe('Task 18c-2: carry-overs', () => {
  it('asks only whether the brand is a sample brand, so a real name matching a sample headline keeps its initial', () => {
    expect(isSampleText('Your brand', ['brand'])).toBe(true);
    // "Now open" is a sample headline (ig-bold), never a sample brand.
    expect(isSampleText('Now open', ['brand'])).toBe(false);
    expect(isSampleText('Now open')).toBe(true);
    const t = templateByKey('pilot-ig-luxury');
    const roles = resolveLook(t, { accent: ACCENT, width: 1080, height: 1350 }).roles;
    expect(resolveFallback(t, roles, 1080, 1350, 'Now open')?.monogram?.char).toBe('N');
  });

  it('counts a fallback shape as drawn only where it reaches the photo box', () => {
    const t = templateByKey('pilot-bb-contemporary');
    const outside: DesignTemplate = {
      ...t,
      photo: {
        ...t.photo!,
        fallback: { layers: [{ kind: 'flat', tone: { role: 'ground' } }], shapes: [{ kind: 'rect', x: 0.1, y: 0.85, w: 0.2, h: 0.1, tone: 'secondary' }] },
      },
    };
    expect(fallbackProblems(outside, 3600, 1800).join()).toMatch(/untreated flat field/);
    expect(fallbackProblems(t, 3600, 1800)).toEqual([]);
  });

  it('keeps the editable pill on the page when its slot is flush to an edge', () => {
    const base = templateByKey('pilot-ig-industry');
    const flush: DesignTemplate = { ...base, slots: base.slots.map((s) => (s.role === 'cta' ? { ...s, x: 0, align: 'left' as const } : s)) };
    const doc = documentFromTemplate(flush, sampleFor(base), { width: 1080, height: 1350, accent: ACCENT });
    const pill = doc.pages[0].objects.find((o) => o.type === 'shape' && o.name === 'Pill')!;
    expect(pill.x).toBeGreaterThanOrEqual(0);
    expect(pill.x + pill.w).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('Task 18c-2: type (S8, S9, S10)', () => {
  it('sets a named face from the pairing in the DOM and the document (S10)', () => {
    const t = templateByKey('pilot-card-luxury');
    const r = resolveLook(t, { accent: ACCENT, width: 1011, height: 638 });
    // The luxury pairing's accent is mono; the role is set in its text sans instead.
    expect(r.pairing.accent).toBe('mono');
    expect(t.slots.find((s) => s.role === 'eyebrow')!.face).toBe('text');
    const { container } = render(<TemplateSurface template={t} content={sampleFor(t)} width={1011} height={638} accent={ACCENT} />);
    const el = [...container.querySelectorAll<HTMLElement>('div')].find((d) => d.textContent === sampleFor(t).eyebrow && d.style.fontFamily)!;
    expect(el.style.fontFamily).toContain('Outfit');
    const doc = documentFromTemplate(t, sampleFor(t), { width: 1011, height: 638, accent: ACCENT });
    expect(doc.pages[0].objects.find((o) => o.type === 'text' && o.slotRole === 'eyebrow')).toMatchObject({ font: 'sans' });
  });

  it('aligns a row list in both renderers (S8)', () => {
    const t = templateByKey('pilot-bb-contemporary');
    const { container } = render(<TemplateSurface template={t} content={sampleFor(t)} width={3600} height={1800} accent={ACCENT} />);
    const row = [...container.querySelectorAll<HTMLElement>('div')].find((d) => d.textContent === '@yourhandle' && d.style.display === 'flex')!;
    expect(row.style.justifyContent).toBe('flex-end');
    const { ctx, calls } = recorder();
    drawTemplateFrame(ctx, t, sampleFor(t), 3600, 1800, { accent: ACCENT });
    const slot = t.slots.find((s) => s.role === 'contact')!;
    const words = calls.find((c) => c.op === 'fillText' && c.args[0] === '@yourhandle')!;
    // measureText is 20 px a character here: the words end on the slot's right edge.
    expect((words.args[1] as number) + 11 * 20).toBeCloseTo((slot.x + slot.w) * 3600, 6);
  });

  it('sets figures a zero apart on the canvas, tabular-nums in the DOM (S9)', () => {
    const t = templateByKey('pilot-ig-industry');
    const { container } = render(<TemplateSurface template={t} content={sampleFor(t)} width={1080} height={1350} accent={ACCENT} />);
    const price = [...container.querySelectorAll<HTMLElement>('div')].find((d) => d.textContent?.includes('₦4,500') && d.style.display === 'flex')!;
    expect(price.style.fontVariantNumeric).toBe('tabular-nums');
    const ctx = { measureText: (s: string) => ({ width: s === '0' ? 10 : s === '1' ? 4 : s.length * 7 }) } as unknown as CanvasRenderingContext2D;
    // The naira sign keeps its own width; each 1 takes a zero's.
    expect(tabularWidth(ctx, '₦11')).toBe(7 + 20);
  });
});
