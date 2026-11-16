import { describe, expect, it } from 'vitest';
import { readDocument, type DesignObject, type TextObject } from '../../studio/designDocument';
import { readBrief } from '../brief';
import { ARCHETYPES, archetypeOf, movementOf } from '../intel';
import { TYPEFACES } from '../../design/typefaces';
import { contrastRatio } from '../../design/styles';
import { PALETTES } from '../../design/palettes';
import { IMPLEMENTED, compose, legible, type ComposeInput } from './archetypes';
import { BENCHMARK } from './benchmark';
import { aspectClass, balance, fit, lineWidth, wrap } from './canvas';
import { METRIC_CHARS, METRIC_WIDTHS } from './fontMetrics';
import { conceptsFor, distinctnessProblems, documentFor } from './concepts';

const FORMATS = {
  tall: { w: 1080, h: 1920 }, portrait: { w: 1080, h: 1350 }, square: { w: 1080, h: 1080 },
  landscape: { w: 1754, h: 1240 }, wide: { w: 4500, h: 1500 },
} as const;

const colours = { ground: '#f6e9dc', ink: '#3a1c12', primary: '#c4552d', secondary: '#1f6f6b', highlight: '#e9a23b' };
const fonts = { display: 'serif', text: 'humanist', accent: 'mono' } as const;
const short: ComposeInput = { colours, fonts, image: 'https://example.test/a.jpg', copy: { brand: 'Your brand', headline: 'Now open.', support: 'Come and see.', cta: 'Visit' } };
const long: ComposeInput = {
  colours, fonts, image: 'https://example.test/a.jpg',
  copy: {
    brand: 'Adébáyọ̀ & Daughters Trading Company', eyebrow: 'The first collection, this season',
    headline: 'An unusually long headline that still has to fit the page',
    support: 'A supporting line that runs to a good many words, because real customers write real sentences and a layout that only holds a slogan is not a layout.',
    cta: 'Book a private viewing', details: ['Opening date: Saturday 14 December', 'Where: 12 Admiralty Way, Lekki Phase 1', 'Hours: 8am to 10pm daily', 'Reservations: 0800 000 0000', 'Dress: smart'],
  },
};

const texts = (objs: DesignObject[]) => objs.filter((o): o is TextObject => o.type === 'text');
const overlap = (a: DesignObject, b: DesignObject) =>
  a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;

describe('canvas', () => {
  it('classes a format by its shape', () => {
    expect(aspectClass(1080, 1920)).toBe('tall');
    expect(aspectClass(1080, 1350)).toBe('portrait');
    expect(aspectClass(1080, 1080)).toBe('square');
    expect(aspectClass(1754, 1240)).toBe('landscape');
    expect(aspectClass(4500, 1500)).toBe('wide');
  });

  it('wraps on words and keeps a given line break', () => {
    const s = { font: 'sans', size: 0.05 } as const;
    expect(wrap('One two\nthree', 1, s)).toEqual(['One two', 'three']);
    const lines = wrap('Several words that cannot share one narrow line', 0.3, s);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(lineWidth(l, s)).toBeLessThanOrEqual(0.3);
  });

  it('shrinks type until the words fit, and stops at the floor', () => {
    const style = { font: 'heavy' } as const;
    const a = fit('Now open', 0.8, style, 0.2, 0.05, 2);
    const b = fit('A much longer headline than that one', 0.8, style, 0.2, 0.05, 2);
    expect(b.size).toBeLessThan(a.size);
    expect(b.lines.length).toBeLessThanOrEqual(2);
    expect(fit('Supercalifragilisticexpialidocious', 0.1, style, 0.2, 0.05, 1).size).toBe(0.05);
  });
});

describe('measurement', () => {
  it('has measured widths for every face and weight the product ships', () => {
    const shipped = TYPEFACES.flatMap((t) => Object.keys(t.files).map((w) => `${t.key}-${w}`)).sort();
    expect(Object.keys(METRIC_WIDTHS).sort()).toEqual(shipped);
    for (const widths of Object.values(METRIC_WIDTHS)) expect(widths).toHaveLength([...METRIC_CHARS].length);
  });

  it('measures a narrow face narrower than a wide one, and capitals wider than lower case', () => {
    const text = 'Good skin takes its time.';
    expect(lineWidth(text, { font: 'condensed', size: 0.1 })).toBeLessThan(lineWidth(text, { font: 'heavy', size: 0.1 }));
    expect(lineWidth(text, { font: 'sans', size: 0.1, upper: true })).toBeGreaterThan(lineWidth(text, { font: 'sans', size: 0.1 }));
    /* A character no face has still takes room, so a line is never measured as shorter than it is. */
    expect(lineWidth('中', { font: 'sans', size: 0.1 })).toBeGreaterThan(0.03);
  });

  it('evens out a headline instead of leaving one word on the last line', () => {
    const s = { font: 'didone', size: 0.0775, weight: 700 } as const;
    const text = 'Cut slow. Worn long.';
    const box = lineWidth('Cut slow. Worn', s) * 1.05;
    const greedy = wrap(text, box, s);
    expect(greedy).toEqual(['Cut slow. Worn', 'long.']);
    expect(balance(text, greedy, box, s)).toEqual(['Cut slow.', 'Worn long.']);
    expect(balance('One line', ['One line'], 1, s)).toEqual(['One line']);
  });

  it('keeps a palette accent readable as small type on its own ground', () => {
    for (const p of PALETTES) {
      const accent = legible(p.colours.primary, p.colours.ground);
      expect(contrastRatio(accent, p.colours.ground), p.key).toBeGreaterThanOrEqual(4.5);
      if (contrastRatio(p.colours.primary, p.colours.ground) >= 4.5) expect(accent, p.key).toBe(p.colours.primary);
    }
  });
});

describe('archetypes', () => {
  it('builds all sixteen', () => {
    expect([...IMPLEMENTED].sort()).toEqual(ARCHETYPES.map((a) => a.key).sort());
  });

  it('gives a pattern-led page a pattern from the library, and no other page one', () => {
    for (const a of IMPLEMENTED) {
      const page = compose(a, short, FORMATS.portrait).pages[0];
      expect(!!page.pattern, a).toBe(a === 'pattern-field');
    }
    const page = compose('pattern-field', { ...short, pattern: 'arches' }, FORMATS.square).pages[0];
    expect(page.pattern?.svg).toContain('lp-arches');
    expect(readDocument(JSON.parse(JSON.stringify({ schemaVersion: 2, title: 't', pages: [page] }))).ok).toBe(true);
  });

  const cases = IMPLEMENTED.flatMap((a) => (Object.keys(FORMATS) as (keyof typeof FORMATS)[]).flatMap((f) =>
    ([['short', short], ['long', long]] as const).map(([label, input]) => [a, f, label, input] as const)));

  it.each(cases)('%s on %s with %s copy: a valid document, inside the page, no text on text', (archetype, f, _label, input) => {
    const doc = compose(archetype, input, FORMATS[f]);
    expect(readDocument(JSON.parse(JSON.stringify(doc))).ok).toBe(true);
    const page = doc.pages[0];
    expect(page.width).toBe(FORMATS[f].w);
    const ts = texts(page.objects);
    expect(ts.some((t) => t.slotRole === 'headline')).toBe(true);
    for (const t of ts) {
      expect(t.x, `${t.name} left`).toBeGreaterThanOrEqual(0);
      expect(t.y, `${t.name} top`).toBeGreaterThanOrEqual(0);
      expect(t.x + t.w, `${t.name} right`).toBeLessThanOrEqual(1.0001);
      expect(t.y + t.h, `${t.name} bottom`).toBeLessThanOrEqual(1.0001);
      expect(t.size).toBeGreaterThan(0);
    }
    for (let a = 0; a < ts.length; a += 1) {
      for (let b = a + 1; b < ts.length; b += 1) {
        expect(overlap(ts[a], ts[b]), `"${ts[a].name}" overlaps "${ts[b].name}"`).toBe(false);
      }
    }
  });

  it('recomposes for a new shape instead of scaling the old one', () => {
    for (const a of IMPLEMENTED) {
      const p = compose(a, long, FORMATS.portrait).pages[0];
      const w = compose(a, long, FORMATS.wide).pages[0];
      const head = (objs: DesignObject[]) => texts(objs).find((t) => t.slotRole === 'headline') as TextObject;
      const hp = head(p.objects);
      const hw = head(w.objects);
      /* A scaled copy keeps the same normalised box. A recomposed one does not. */
      expect(Math.abs(hp.w - hw.w) + Math.abs(hp.y - hw.y) + Math.abs(hp.x - hw.x), a).toBeGreaterThan(0.05);
    }
  });

  it('uses the picture when a picture-led composition is asked for', () => {
    for (const a of IMPLEMENTED.filter((k) => archetypeOf(k).needsImage)) {
      const objs = compose(a, short, FORMATS.portrait).pages[0].objects;
      expect(objs.filter((o) => o.type === 'image'), a).toHaveLength(1);
    }
    for (const a of IMPLEMENTED.filter((k) => !archetypeOf(k).needsImage)) {
      expect(compose(a, short, FORMATS.portrait).pages[0].objects.some((o) => o.type === 'image'), a).toBe(false);
    }
  });
});

describe('concepts', () => {
  const BRIEFS = [
    'Launch poster for a luxury Nigerian skincare brand',
    'Billboard for high-end Lagos real estate',
    'Brand identity for a premium African fashion label',
    'Social posts for an international tech conference',
    'Instagram post for a contemporary restaurant opening',
  ];

  it.each(BRIEFS)('"%s" gives three concepts that differ in movement, composition, palette and type', (text) => {
    const brief = readBrief(text);
    for (const images of [[], ['a.jpg', 'b.jpg', 'c.jpg']]) {
      const concepts = conceptsFor(brief, { images });
      expect(concepts).toHaveLength(3);
      expect(distinctnessProblems(concepts)).toEqual([]);
      for (const c of concepts) {
        expect(movementOf(c.movement)).not.toBeNull();
        if (!images.length) expect(archetypeOf(c.archetype).needsImage, c.archetype).toBe(false);
        expect(readDocument(JSON.parse(JSON.stringify(documentFor(c, brief)))).ok).toBe(true);
      }
    }
  });

  it('never gives two briefs the same three concepts (CI-0: the conference and the restaurant matched)', () => {
    const sig = (t: string) => conceptsFor(readBrief(t)).map((c) => `${c.movement}/${c.archetype}`).join(' ');
    expect(sig(BRIEFS[3])).not.toBe(sig(BRIEFS[4]));
  });

  it('uses the customer’s own words, and a label rather than an invented name', () => {
    const brief = readBrief('Poster for my gym "Join in January"');
    const [first] = conceptsFor(brief);
    expect(first.input.copy.headline).toBe('Join in January');
    expect(first.input.copy.brand).toBe('Your brand');
    expect(conceptsFor(brief, { businessName: 'Iron House' })[0].input.copy.brand).toBe('Iron House');
  });

  it('flags a set that only changes colour', () => {
    const [a] = conceptsFor(readBrief(BRIEFS[0]));
    const recolour = { ...a, n: 2, palette: 'graphite' };
    expect(distinctnessProblems([a, recolour])).toEqual(expect.arrayContaining(['two concepts share a composition', 'two concepts share a movement group']));
  });

  it('sets every benchmark concept without cutting a word, and never sets a script in capitals', () => {
    for (const b of BENCHMARK) {
      const brief = readBrief(b.request);
      const concepts = conceptsFor(brief, { copy: b.copy, images: b.photos.map((p) => (p ? `x/${p}` : undefined)) });
      for (const c of concepts) {
        for (const t of texts(documentFor(c, brief).pages[0].objects)) {
          expect(t.text, `${b.key}-${c.n} ${t.name}`).not.toContain('…');
          if (t.upper) expect(t.font, `${b.key}-${c.n} ${t.name}`).not.toBe('script');
        }
      }
    }
  });

  it('puts the conference’s date, city and venue on every conference concept', () => {
    const b = BENCHMARK.find((x) => x.key === 'b4')!;
    const brief = readBrief(b.request);
    for (const c of conceptsFor(brief, { copy: b.copy })) {
      const words = texts(documentFor(c, brief).pages[0].objects).map((t) => t.text).join(' | ');
      for (const fact of ['Your dates', 'Your city', 'Your venue']) expect(words, `concept ${c.n}`).toContain(fact);
    }
  });

  it('gives a centred billboard a way to reply', () => {
    const doc = compose('centred-emblem', short, FORMATS.wide);
    expect(texts(doc.pages[0].objects).some((t) => t.name === 'Call to action')).toBe(true);
  });

  it('dresses a luxury brief in quiet colour, whatever the trade or the movement', () => {
    const loud = new Set(['bold', 'pastel']);
    for (const request of ['Launch poster for a luxury Nigerian skincare brand', 'Billboard for high-end Lagos real estate', 'Flyer for a luxury hotel',
      'Poster for a luxury gym', 'Brutalist poster for a luxury nightclub', 'Luxury menu for a restaurant', 'Poster for a luxury car dealer']) {
      const brief = readBrief(request);
      expect(brief.tier?.value, request).toBe('luxury');
      for (const images of [[], ['a.jpg', 'b.jpg', 'c.jpg']]) {
        const concepts = conceptsFor(brief, { images });
        expect(distinctnessProblems(concepts), request).toEqual([]);
        for (const c of concepts) expect(loud.has(PALETTES.find((p) => p.key === c.palette)!.family), `${request}: ${c.movement} got ${c.palette}`).toBe(false);
      }
    }
  });

  it('leaves a brief with no stated price level free to be loud', () => {
    const families = new Set(['Poster for my gym', 'Flyer for a street food stall', 'Poster for a nightclub', 'Flyer for a kids party'].flatMap((r) =>
      conceptsFor(readBrief(r)).map((c) => PALETTES.find((p) => p.key === c.palette)!.family)));
    expect(families.has('bold')).toBe(true);
  });

  it('builds the document at the brief’s own format', () => {
    const brief = readBrief(BRIEFS[1]);
    const page = documentFor(conceptsFor(brief)[0], brief).pages[0];
    expect(page.width / page.height).toBeCloseTo(3, 1);
  });
});
