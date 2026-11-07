import { describe, it, expect } from 'vitest';

import {
  blankDocument, documentFromTemplate, inPaintOrder, objectId, readDocument, SCHEMA_VERSION,
  type DesignObject,
} from './designDocument';
import { DESIGN_TEMPLATES, type DesignTemplate } from '../designTemplates';
import { sampleFor } from '../create/sampleCopy';
import { resolveLook, type Look } from '../design/look';
import { brandPalette } from '../design/remix';
import { dressTemplate } from './templateDressing';

const SQUARE = { width: 1080, height: 1080 };

describe('a blank document is immediately usable', () => {
  it('has one page at the requested size', () => {
    const doc = blankDocument(1080, 1920, 'Story');
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].width).toBe(1080);
    expect(doc.pages[0].height).toBe(1920);
    expect(doc.title).toBe('Story');
  });

  it('declares its schema version, so a later build can upgrade it', () => {
    expect(blankDocument(100, 100).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('gives every object a distinct id', () => {
    const ids = new Set(Array.from({ length: 500 }, () => objectId()));
    expect(ids.size).toBe(500);
  });
});

describe('the existing catalogue becomes editable documents', () => {
  /*
   * The point of the whole approach: 47 templates x 11 styles already exist
   * as structured slot documents, so none of them needs re-authoring to be
   * editable. If this breaks, the editor has no content on day one.
   */
  it('converts every template without throwing', () => {
    for (const t of DESIGN_TEMPLATES) {
      const doc = documentFromTemplate(t, sampleFor(t), { ...SQUARE });
      expect(doc.pages[0], t.key).toBeTruthy();
    }
  });

  it('produces real text objects carrying the template copy', () => {
    const t = DESIGN_TEMPLATES.find((x) => x.key === 'editorial-split')!;
    const doc = documentFromTemplate(t, sampleFor(t), { ...SQUARE });
    const headline = doc.pages[0].objects.find((o) => o.slotRole === 'headline');
    expect(headline?.type).toBe('text');
    expect((headline as { text?: string }).text).toBeTruthy();
  });

  /*
   * TEXT must land on the page. Decorative geometry need not.
   *
   * The first version of this asserted 0..1 for every object, and it was
   * right while the converter carried only text. Carrying the shapes broke
   * it on promo-burst, whose circle starts at x = -0.05 — a shape bleeding
   * off the edge, which is ordinary design practice and exactly what the
   * gallery has always drawn (the surface clips it).
   *
   * So the bound stays where it matters and the geometry is allowed its
   * bleed, within a limit: a shape wandering a whole page away is a
   * conversion bug, not a design decision.
   */
  it('keeps text on the page, so one document fits any output size', () => {
    for (const t of DESIGN_TEMPLATES) {
      for (const o of documentFromTemplate(t, sampleFor(t), { ...SQUARE }).pages[0].objects) {
        if (o.type === 'text') {
          expect(o.x, `${t.key} text x`).toBeGreaterThanOrEqual(0);
          expect(o.x, `${t.key} text x`).toBeLessThanOrEqual(1);
          expect(o.y, `${t.key} text y`).toBeGreaterThanOrEqual(0);
          expect(o.y, `${t.key} text y`).toBeLessThanOrEqual(1);
        } else {
          expect(o.x, `${t.key} shape x`).toBeGreaterThanOrEqual(-1);
          expect(o.x, `${t.key} shape x`).toBeLessThanOrEqual(2);
          expect(o.y, `${t.key} shape y`).toBeGreaterThanOrEqual(-1);
          expect(o.y, `${t.key} shape y`).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  /*
   * Slots measured up from the foot of the page are resolved to the one
   * origin the document uses. Leaving two conventions in the data is how a
   * footer ends up drawn across the headline.
   */
  it('resolves bottom-anchored slots to a single origin', () => {
    const withBottom = DESIGN_TEMPLATES.find((t) => t.slots.some((s) => s.fromBottom));
    expect(withBottom, 'a template with a fromBottom slot').toBeTruthy();
    const doc = documentFromTemplate(withBottom!, sampleFor(withBottom!), { ...SQUARE });
    for (const o of doc.pages[0].objects) expect(o.y).toBeLessThanOrEqual(1);
  });

  it('skips slots with nothing in them rather than making empty layers', () => {
    const t = DESIGN_TEMPLATES[0];
    const doc = documentFromTemplate(t, { headline: 'Only this' }, { ...SQUARE });
    // The layout's own shapes still come through; only empty slots are skipped.
    const fromSlots = doc.pages[0].objects.filter((o) => o.slotRole);
    expect(fromSlots).toHaveLength(1);
    expect(fromSlots[0].slotRole).toBe('headline');
  });

  it('remembers where it came from', () => {
    const t = DESIGN_TEMPLATES[0];
    const doc = documentFromTemplate(t, sampleFor(t), { ...SQUARE, styleKey: 'field', accent: '#0a7d4b' });
    expect(doc.sourceTemplateKey).toBe(t.key);
    expect(doc.styleKey).toBe('field');
    expect(doc.accent).toBe('#0a7d4b');
  });
});

describe('a stored document is checked before it is trusted', () => {
  it('accepts one it made itself', () => {
    const r = readDocument(blankDocument(1080, 1080));
    expect(r.ok).toBe(true);
  });

  it('refuses anything that is not a document', () => {
    for (const bad of [null, undefined, 'a string', 42, []]) {
      expect(readDocument(bad).ok, String(bad)).toBe(false);
    }
  });

  it('refuses a document with no usable page', () => {
    expect(readDocument({ schemaVersion: 1, pages: [] }).ok).toBe(false);
    expect(readDocument({ schemaVersion: 1, pages: [{ id: 'p', name: 'x', width: 0, height: 10, objects: [] }] }).ok).toBe(false);
    expect(readDocument({ schemaVersion: 1, pages: [{ id: 'p', name: 'x', width: 10, height: 10 }] }).ok).toBe(false);
  });

  /*
   * The important refusal. Rendering a newer document with this build would
   * silently drop whatever the newer version added — and the next save would
   * then destroy it.
   */
  it('refuses a document from a newer build instead of half-rendering it', () => {
    const r = readDocument({ ...blankDocument(100, 100), schemaVersion: SCHEMA_VERSION + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/newer version/i);
  });
});

describe('paint order', () => {
  const at = (z: number, id: string): DesignObject => ({
    id, type: 'shape', shape: 'rect', name: id, x: 0, y: 0, w: 1, h: 1,
    rotation: 0, opacity: 1, visible: true, locked: false, z,
  });

  it('draws low z first', () => {
    const page = { id: 'p', name: 'p', width: 10, height: 10, objects: [at(3, 'c'), at(1, 'a'), at(2, 'b')] };
    expect(inPaintOrder(page).map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  /* A tie must not reshuffle on every render — that is a flicker, not a sort. */
  it('is stable when two objects share a z', () => {
    const page = { id: 'p', name: 'p', width: 10, height: 10, objects: [at(1, 'first'), at(1, 'second')] };
    expect(inPaintOrder(page).map((o) => o.id)).toEqual(['first', 'second']);
  });
});

describe('layouts with more than one side or page', () => {
  /*
   * One mechanism for three products: the back of a business card, the
   * second page of a menu and the inside of a company profile are all a
   * design whose slots do not fit on one surface. Because they are pages,
   * the editor tabs, the PDF page loop and the save format already work.
   */
  const multi = DESIGN_TEMPLATES.filter((t) => t.extraPages?.length);

  it('the library actually has some', () => {
    expect(multi.length).toBeGreaterThan(0);
  });

  it('builds a page for every side declared', () => {
    for (const t of multi) {
      const doc = documentFromTemplate(t, sampleFor(t), { ...SQUARE });
      expect(doc.pages.length, t.key).toBe(1 + (t.extraPages?.length ?? 0));
    }
  });

  it('names the sides so the tabs read properly', () => {
    const card = DESIGN_TEMPLATES.find((t) => t.key === 'card-qr')!;
    const doc = documentFromTemplate(card, sampleFor(card), { ...SQUARE });
    expect(doc.pages.map((p) => p.name)).toEqual(['Front', 'Back']);
  });

  it('gives every page the same canvas size', () => {
    for (const t of multi) {
      const doc = documentFromTemplate(t, sampleFor(t), { width: 1011, height: 638 });
      for (const page of doc.pages) {
        expect(page.width, t.key).toBe(1011);
        expect(page.height, t.key).toBe(638);
      }
    }
  });

  /* Two objects sharing an id is how selecting one selects both. */
  it('gives every object across every page its own id', () => {
    for (const t of multi) {
      const doc = documentFromTemplate(t, sampleFor(t), { ...SQUARE });
      const ids = doc.pages.flatMap((p) => p.objects.map((o) => o.id));
      expect(new Set(ids).size, t.key).toBe(ids.length);
    }
  });

  it('leaves single-page layouts with exactly one page', () => {
    const single = DESIGN_TEMPLATES.filter((t) => !t.extraPages?.length);
    expect(single.length).toBeGreaterThan(0);
    for (const t of single.slice(0, 10)) {
      expect(documentFromTemplate(t, sampleFor(t), { ...SQUARE }).pages).toHaveLength(1);
    }
  });
});

describe('a look travels into the editor and back out of storage', () => {
  /*
   * No shipped template carries a look until Task 8, so the fixture borrows
   * a real layout with geometry and gives it one. Hexes are never written
   * here: every expectation is pushed through resolveLook, the same resolver
   * the gallery draws with, so "the editor matches the card" is what is
   * being asserted rather than a copy of today's palette values.
   */
  const LOOK: Look = {
    palette: 'lagos-sunset',
    type: 'editorial',
    gradient: { kind: 'linear', stops: ['ground', 'primary'], angle: 160 },
    pattern: { key: 'dots', role: 'highlight', opacity: 0.08, scale: 0.08, zone: 'bottom' },
  };
  const base = DESIGN_TEMPLATES.find((t) => t.shapes?.length && !t.extraPages?.length && !t.look)!;
  const fixtureWithLook: DesignTemplate = {
    ...base,
    look: LOOK,
    shapes: [
      ...(base.shapes ?? []),
      { kind: 'rect', x: 0, y: 0.9, w: 1, h: 0.1, tone: 'secondary' },
      { kind: 'circle', cx: 0.8, cy: 0.2, r: 0.1, tone: 'primary', fill: { kind: 'linear', stops: ['primary', 'highlight'], angle: 45 } },
    ],
  };
  const resolved = resolveLook(fixtureWithLook, { accent: '#4f46e5', ...SQUARE });
  const roundTrip = <T,>(x: T): unknown => JSON.parse(JSON.stringify(x));

  it('carries the look into the document', () => {
    const doc = documentFromTemplate(fixtureWithLook, sampleFor(fixtureWithLook), { ...SQUARE });
    expect(doc.schemaVersion).toBe(2);
    expect(doc.look?.palette).toBe('lagos-sunset');

    const page = doc.pages[0];
    expect(page.background).toContain(resolved.roles.ground);
    expect(page.background).toContain('linear-gradient(160deg');
    expect(page.pattern?.svg.startsWith('<svg')).toBe(true);
    expect(page.pattern?.svg).toBe(resolved.pattern?.svg);
    expect(page.pattern?.opacity).toBe(0.08);
    expect(page.pattern?.zone).toBe('bottom');

    /* Shapes take role colours; the gradient circle paints from the roles. */
    const shapes = page.objects.filter((o) => o.type === 'shape') as { fill?: string }[];
    expect(shapes.map((s) => s.fill)).toContain(resolved.roles.secondary);
    const gradient = shapes.find((s) => s.fill?.startsWith('linear-gradient'));
    expect(gradient?.fill).toContain(resolved.roles.highlight);

    /* Type on the ground is the palette's own ink, set in the look's pairing. */
    const headline = page.objects.find((o) => o.slotRole === 'headline') as { colour?: string; font?: string };
    const slot = fixtureWithLook.slots.find((s) => s.role === 'headline')!;
    if (!slot.tone || slot.tone === 'onSurface') expect(headline.colour).toBe(resolved.inkOn.ground);
    expect(headline.font).toBe(resolved.pairing.display);
  });

  it('records a brand palette and the remix seed it was opened with', () => {
    const pal = brandPalette({ primary: '#0f766e', scheme: 'dark' })!;
    const doc = documentFromTemplate(fixtureWithLook, sampleFor(fixtureWithLook), {
      ...SQUARE, brandPalette: pal, seed: 7, brand: { primary: '#0f766e' }, look: { type: 'impact' },
    });
    expect(doc.look).toEqual({ palette: pal.key, override: { type: 'impact' }, seed: 7, brand: { primary: '#0f766e' } });
    expect(doc.pages[0].background).toContain(pal.colours.ground);
  });

  it('reopens a saved look exactly as it was', () => {
    const doc = documentFromTemplate(fixtureWithLook, sampleFor(fixtureWithLook), { ...SQUARE, seed: 3 });
    const r = readDocument(roundTrip(doc));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc).toEqual(doc);
  });

  it('leaves a template with no look exactly as before', () => {
    const doc = documentFromTemplate(base, sampleFor(base), { ...SQUARE });
    expect(doc.look).toBeUndefined();
    expect('pattern' in doc.pages[0]).toBe(false);
    expect(doc.pages[0].background).toBe(dressTemplate(base, { ...SQUARE }).background);
  });

  it('upgrades a version 1 document without changing how it looks', () => {
    const made = documentFromTemplate(base, sampleFor(base), { ...SQUARE });
    const v1 = { ...made, schemaVersion: 1 };
    const r = readDocument(roundTrip(v1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.schemaVersion).toBe(2);
    expect(r.doc.pages).toEqual(made.pages);
    expect(r.doc.look).toBeUndefined();
  });

  it('opens a version 2 document', () => {
    expect(readDocument(roundTrip(blankDocument(100, 100))).ok).toBe(true);
  });

  /* Review Focus 2: a stale palette key degrades, it never blanks a design. */
  it('opens a design whose palette has been removed', () => {
    const doc = documentFromTemplate(fixtureWithLook, sampleFor(fixtureWithLook), { ...SQUARE });
    const stale = roundTrip({ ...doc, look: { ...doc.look, palette: 'gone' } });
    const r = readDocument(stale);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    /* The pages are self-contained, so they still draw what was saved. */
    expect(r.doc.pages).toEqual(doc.pages);
    expect(r.doc.look?.palette).toBe('gone');

    /* Re-resolving that look lands on the fallback, never on nothing. */
    const again = documentFromTemplate(fixtureWithLook, sampleFor(fixtureWithLook), { ...SQUARE, look: { palette: 'gone' } });
    expect(again.look).toBeUndefined();
    expect(again.pages[0].pattern).toBeUndefined();
    expect(again.pages[0].background).toBe(dressTemplate(fixtureWithLook, { ...SQUARE }).background);
    expect(again.pages[0].objects.length).toBe(doc.pages[0].objects.length);
  });

  it('drops a damaged look or pattern instead of refusing the design', () => {
    const doc = documentFromTemplate(fixtureWithLook, sampleFor(fixtureWithLook), { ...SQUARE });
    const damaged = roundTrip({
      ...doc,
      look: 'lagos-sunset',
      pages: doc.pages.map((p) => ({ ...p, pattern: { svg: 'javascript:alert(1)', opacity: 'x' } })),
    });
    const r = readDocument(damaged);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.look).toBeUndefined();
    expect(r.doc.pages[0].pattern).toBeUndefined();

    const loud = readDocument(roundTrip({ ...doc, pages: doc.pages.map((p) => ({ ...p, pattern: { ...p.pattern, opacity: 4 } })) }));
    expect(loud.ok && loud.doc.pages[0].pattern?.opacity).toBe(1);
  });

  /*
   * A mesh ground is an opaque flat first layer with soft radials over it.
   * TemplateSurface and the canvas paint groundLayers in array order, first
   * at the bottom; a CSS `background` list paints its FIRST value on top. Joined
   * in array order, the opaque base covered every radial and the editor showed
   * a flat ground.
   */
  it('paints a mesh ground in the order the gallery does', () => {
    const mesh: DesignTemplate = {
      ...fixtureWithLook,
      look: { ...LOOK, gradient: { kind: 'mesh', stops: ['ground', 'primary', 'secondary'] } },
    };
    const r = resolveLook(mesh, { accent: '#4f46e5', ...SQUARE });
    expect(r.groundLayers.map((l) => l.kind)).toEqual(['linear', 'radial', 'radial']);
    const bg = documentFromTemplate(mesh, sampleFor(mesh), { ...SQUARE }).pages[0].background ?? '';
    const flat = bg.indexOf('linear-gradient(180deg');
    const radials = [...bg.matchAll(/radial-gradient/g)].map((m) => m.index ?? -1);
    expect(radials).toHaveLength(2);
    // Every radial is listed (so painted) above the opaque base; the flat ground fills last.
    for (const at of radials) expect(at).toBeLessThan(flat);
    expect(bg.endsWith(`, ${r.roles.ground}`)).toBe(true);
  });

  /*
   * brand-intro-reveal ships with a duotone, and a customer who adds a photo
   * in the editor reaches it. The page carries the resolved pair, as it
   * carries every other resolved colour, so the editor and its export draw the
   * customiser's photograph.
   */
  it('carries the duotone onto the page and keeps it through storage', () => {
    const duo: DesignTemplate = { ...fixtureWithLook, look: { ...LOOK, duotone: ['ground', 'highlight'] } };
    const r = resolveLook(duo, { accent: '#4f46e5', ...SQUARE });
    const doc = documentFromTemplate(duo, sampleFor(duo), { ...SQUARE });
    expect(r.duotone).not.toBeNull();
    expect(doc.pages[0].duotone).toEqual(r.duotone);
    const back = readDocument(roundTrip(doc));
    expect(back.ok && back.doc.pages[0].duotone).toEqual(r.duotone);

    /* No duotone in the look, no duotone on the page. */
    expect('duotone' in documentFromTemplate(fixtureWithLook, sampleFor(fixtureWithLook), { ...SQUARE }).pages[0]).toBe(false);

    /* Anything but two hex colours is dropped, never drawn. */
    for (const bad of [['red', 'blue'], ['#000000'], 'url(#x)', ['#000000', 'url(javascript:1)']]) {
      const damaged = readDocument(roundTrip({ ...doc, pages: doc.pages.map((p) => ({ ...p, duotone: bad })) }));
      expect(damaged.ok).toBe(true);
      if (damaged.ok) expect('duotone' in damaged.doc.pages[0]).toBe(false);
    }
  });
});
