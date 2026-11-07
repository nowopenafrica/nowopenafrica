import { describe, it, expect } from 'vitest';

import { dressTemplate, toneColour } from './templateDressing';
import { documentFromTemplate } from './designDocument';
import { DESIGN_TEMPLATES, estimateLines, fitSlotSize } from '../designTemplates';
import { sampleFor } from '../create/sampleCopy';

const PAGE = { width: 1080, height: 1350 };
const byKey = (key: string) => DESIGN_TEMPLATES.find((t) => t.key === key)!;

/*
 * ── WHAT THIS FILE IS DEFENDING ────────────────────────────────────────
 *
 * The converter carried six text roles and nothing else, so a design that
 * appeared on the gallery as a dark gradient with an accent wedge and white
 * type opened in the Studio as black text on a white page. Every assertion
 * below is one of the things that was being dropped.
 */

describe('the surface comes with it', () => {
  it('gives a gradient template a gradient background', () => {
    const d = dressTemplate(byKey('promo-diagonal'), { ...PAGE, accent: '#db2777' });
    expect(d.background).toMatch(/gradient\(/);
  });

  it('always ends in a flat colour, so nothing shows through', () => {
    for (const t of DESIGN_TEMPLATES) {
      const d = dressTemplate(t, { ...PAGE, accent: '#4f46e5' });
      expect(d.background, t.key).toMatch(/#[0-9a-f]{3,8}$|\)$/i);
      expect(d.background, t.key).toBeTruthy();
    }
  });

  it('puts the background on the page, not just in the dressing', () => {
    const t = byKey('promo-diagonal');
    const doc = documentFromTemplate(t, sampleFor(t), { ...PAGE, accent: '#db2777' });
    expect(doc.pages[0].background).toMatch(/gradient\(/);
  });
});

describe('the geometry comes with it', () => {
  it('carries a wedge as a polygon rather than losing it', () => {
    /* A template named "Diagonal Cut" without its diagonal is not it. */
    const d = dressTemplate(byKey('promo-diagonal'), { ...PAGE, accent: '#db2777' });
    const poly = d.shapes.find((s) => s.shape === 'polygon');
    expect(poly).toBeTruthy();
    expect(poly?.points?.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps polygon points inside their own box', () => {
    for (const t of DESIGN_TEMPLATES) {
      for (const s of dressTemplate(t, { ...PAGE, accent: '#4f46e5' }).shapes) {
        for (const [px, py] of s.points ?? []) {
          expect(px, `${t.key}`).toBeGreaterThanOrEqual(-0.001);
          expect(px, `${t.key}`).toBeLessThanOrEqual(1.001);
          expect(py, `${t.key}`).toBeGreaterThanOrEqual(-0.001);
          expect(py, `${t.key}`).toBeLessThanOrEqual(1.001);
        }
      }
    }
  });

  /*
   * A circle's radius is a fraction of the SHORT edge, so on a 1080x1350
   * page it covers a different share of each axis. Normalising both by the
   * same number would turn every circle into an oval.
   */
  it('keeps a circle round on a page that is not square', () => {
    const circle = DESIGN_TEMPLATES
      .flatMap((t) => dressTemplate(t, { ...PAGE, accent: '#4f46e5' }).shapes.map((s) => ({ t, s })))
      .find(({ s }) => s.shape === 'ellipse' && !s.stroke);
    expect(circle, 'a template with a circle').toBeTruthy();
    const { s } = circle!;
    /* Equal in PIXELS is what round means. */
    expect(s.w * PAGE.width).toBeCloseTo(s.h * PAGE.height, 3);
  });

  it('draws geometry beneath every word', () => {
    const t = byKey('promo-diagonal');
    const objects = documentFromTemplate(t, sampleFor(t), { ...PAGE, accent: '#db2777' }).pages[0].objects;
    const topShape = Math.max(...objects.filter((o) => o.type === 'shape').map((o) => o.z));
    const lowestText = Math.min(...objects.filter((o) => o.type === 'text').map((o) => o.z));
    expect(topShape).toBeLessThan(lowestText);
  });

  /* A card's back has its own composition; the front's wedge is not part of it. */
  it('does not repeat the front\'s shapes on a second page', () => {
    const t = DESIGN_TEMPLATES.find((x) => x.extraPages?.length)!;
    const doc = documentFromTemplate(t, sampleFor(t), { ...PAGE, accent: '#4f46e5' });
    expect(doc.pages.length).toBeGreaterThan(1);
    expect(doc.pages[1].objects.some((o) => o.type === 'shape' && o.shape === 'polygon')).toBe(false);
  });
});

describe('the colours come with it', () => {
  it('resolves a tone to a colour instead of leaving the default', () => {
    const d = { ink: '#ffffff', accent: '#db2777' };
    expect(toneColour('accent', d)).toBe('#db2777');
    expect(toneColour('onSurface', d)).toBe('#ffffff');
    expect(toneColour(undefined, d)).toBe('#ffffff');
    /* Muted is the ink held back, not a grey that fights the palette. */
    expect(toneColour('muted', d).toLowerCase()).toContain('ffffff');
  });

  it('writes light type on a dark template', () => {
    const t = DESIGN_TEMPLATES.find((x) => x.scheme === 'dark')!;
    const doc = documentFromTemplate(t, sampleFor(t), { ...PAGE, accent: '#4f46e5' });
    const text = doc.pages[0].objects.find((o) => o.type === 'text') as { colour?: string };
    expect(text.colour).toBeTruthy();
    expect(text.colour).not.toBe('#111827');
  });

  it('gives every text object a colour, on every template', () => {
    for (const t of DESIGN_TEMPLATES) {
      for (const o of documentFromTemplate(t, sampleFor(t), { ...PAGE }).pages[0].objects) {
        if (o.type === 'text') expect((o as { colour?: string }).colour, t.key).toBeTruthy();
      }
    }
  });
});

describe('the lists come with it', () => {
  /*
   * services, contact, stats and price all returned null, so the layouts
   * built around them opened empty — a price list with a headline and
   * nothing under it.
   */
  it('carries a price list as lines, not as nothing', () => {
    const t = byKey('price-list');
    const doc = documentFromTemplate(t, sampleFor(t), { ...PAGE });
    const price = doc.pages[0].objects.find((o) => o.slotRole === 'price') as { text?: string };
    expect(price?.text).toBeTruthy();
    expect(price!.text!.split('\n').length).toBeGreaterThan(1);
  });

  it('carries a services column', () => {
    const t = byKey('consulting-clean');
    const doc = documentFromTemplate(t, sampleFor(t), { ...PAGE });
    const services = doc.pages[0].objects.find((o) => o.slotRole === 'services') as { text?: string };
    expect(services?.text).toContain('\n');
  });

  it('leaves a layout with no list content alone', () => {
    const t = byKey('statement');
    const doc = documentFromTemplate(t, { brand: 'B', headline: 'H' }, { ...PAGE });
    expect(doc.pages[0].objects.filter((o) => o.type === 'text').length).toBeGreaterThan(0);
  });
});

describe('alignment comes with it', () => {
  it('keeps a centred headline centred', () => {
    const t = DESIGN_TEMPLATES.find((x) => x.slots.some((s) => s.role === 'headline' && s.align === 'center'))!;
    const doc = documentFromTemplate(t, sampleFor(t), { ...PAGE });
    const headline = doc.pages[0].objects.find((o) => o.slotRole === 'headline') as { align?: string };
    expect(headline.align).toBe('center');
  });
});

describe('a list gets room for its lines', () => {
  /*
   * ── MEASURED, NOT ASSUMED ────────────────────────────────────────────
   *
   * Every box was sized for one line, which was correct while only
   * single-line roles were carried. The moment the lists came across, a
   * four-item services column rendered TWO items — the renderer hides its
   * overflow, so nothing reported it. Seen on consulting-clean in the
   * editor, not in a test.
   */
  it('is taller than a single line when it holds several', () => {
    const t = byKey('consulting-clean');
    const page = documentFromTemplate(t, sampleFor(t), { ...PAGE }).pages[0];
    const services = page.objects.find((o) => o.slotRole === 'services') as { h: number; text: string };
    const headline = page.objects.find((o) => o.slotRole === 'headline') as { h: number };
    const lines = services.text.split(String.fromCharCode(10)).length;
    expect(lines).toBeGreaterThan(1);
    /* Enough room for every line it actually carries. */
    expect(services.h).toBeGreaterThan(headline.h);
  });

  it('grows with the number of lines, on every list in the catalogue', () => {
    for (const t of DESIGN_TEMPLATES) {
      for (const o of documentFromTemplate(t, sampleFor(t), { ...PAGE }).pages[0].objects) {
        if (o.type !== 'text') continue;
        const text = (o as { text: string }).text;
        const size = (o as { size: number }).size;
        const lines = text.split(String.fromCharCode(10)).length;
        if (lines < 2) continue;
        /*
          1e-9 of slack, and no more. The converter reaches the same number
          by a different route (px × line height × lines ÷ height), so a box
          exactly as tall as its lines can land one float ulp under
          `size * lines` — status-order did: 0.1361111111111111 against
          0.13611111111111113. A real shortfall is a whole line, not 1e-17.
        */
        expect(o.h, `${t.key} ${o.slotRole}`).toBeGreaterThanOrEqual(Math.min(1, size * lines) - 1e-9);
      }
    }
  });
});

describe('the editor sets type the way the gallery does', () => {
  const LANDSCAPE = { width: 1920, height: 1080 };

  /*
   * ── WHY A TEMPLATE OPENED LOOKING BROKEN ─────────────────────────────
   *
   * The converter copied `slot.size` straight across. Two faults:
   *
   *   1. No fitting. The gallery runs every slot through `fitSlotSize`,
   *      which shrinks type until it stops colliding with the slot below.
   *   2. The wrong unit. `slot.size` is a fraction of the SHORT edge, and
   *      the document renders `cqw` — a fraction of the WIDTH.
   *
   * Identical on a portrait page, badly wrong on a landscape one.
   */
  it('uses the fitted size, not the slot\'s nominal one', () => {
    for (const t of DESIGN_TEMPLATES) {
      const content = sampleFor(t);
      const page = documentFromTemplate(t, content, { ...PAGE }).pages[0];
      for (const object of page.objects) {
        if (object.type !== 'text' || !object.slotRole) continue;
        const slot = t.slots.find((x) => x.role === object.slotRole);
        if (!slot) continue;
        const want = fitSlotSize(slot, t.slots, (object as { text: string }).text, PAGE.width, PAGE.height);
        const got = (object as { size: number }).size * PAGE.width;
        expect(got, `${t.key} ${object.slotRole}`).toBeCloseTo(want, 6);
      }
    }
  });

  it('draws type at the same PIXEL size on a landscape page', () => {
    /* 0.09 of the short edge is 97px on a 1920x1080 banner. Rendered as a
       fraction of the WIDTH it was 173px — 78% too large. */
    const t = DESIGN_TEMPLATES.find((x) => x.slots.some((sl) => sl.role === 'headline'))!;
    const page = documentFromTemplate(t, sampleFor(t), { ...LANDSCAPE }).pages[0];
    const headline = page.objects.find((o) => o.slotRole === 'headline') as { size: number; text: string };
    const slot = t.slots.find((sl) => sl.role === 'headline')!;
    const want = fitSlotSize(slot, t.slots, headline.text, LANDSCAPE.width, LANDSCAPE.height);
    expect(headline.size * LANDSCAPE.width).toBeCloseTo(want, 6);
  });

  /*
   * The renderer hides overflow, so a box one line too short does not
   * complain — it silently cuts the bottom off the words. Measured on
   * editorial-split, whose headline wrapped to two lines and lost its own
   * descenders.
   */
  it('gives every text box room for the lines it will really take', () => {
    for (const t of DESIGN_TEMPLATES) {
      const page = documentFromTemplate(t, sampleFor(t), { ...PAGE }).pages[0];
      for (const object of page.objects) {
        if (object.type !== 'text' || !object.slotRole) continue;
        const slot = t.slots.find((x) => x.role === object.slotRole);
        if (!slot) continue;
        const text = (object as { text: string }).text;
        const sizePx = (object as { size: number }).size * PAGE.width;
        const lines = estimateLines(text, slot, sizePx, PAGE.width);
        const neededPx = lines * sizePx;
        /* The box is in page-height fractions; compare in pixels. */
        expect(object.h * PAGE.height, `${t.key} ${object.slotRole}`).toBeGreaterThanOrEqual(neededPx * 0.98);
      }
    }
  });
});
