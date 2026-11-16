import { describe, expect, it } from 'vitest';
import { formatOf, type Format } from '../../design/formats';
import { PALETTES } from '../../design/palettes';
import { contrastRatio } from '../../design/styles';
import { readableInk } from '../../design/palettes';
import type { DesignObject, TextObject } from '../../studio/designDocument';
import { readBrief } from '../brief';
import { IMPLEMENTED, carries, compose, composeWithReport, type ComposeInput } from './archetypes';
import { BENCHMARK } from './benchmark';
import { checkConcept, describeFindings } from './conceptChecks';
import { conceptsFor, documentFor, isRoadside } from './concepts';

const FORMATS = ['instagram-portrait', 'instagram-post', 'story', 'a4', 'a5', 'half-a4', 'postcard', 'business-card', 'business-card-portrait', 'x-post', 'website-banner', 'rollup', 'billboard', 'board-48-sheet'];
const roadside = (key: string) => /^(billboard|board-)/.test(key);
const copy = {
  brand: 'Your brand', eyebrow: 'Opening', headline: 'Pull up a chair.', support: 'A kitchen that cooks the way it would for family. Come hungry.',
  cta: 'Book a table', details: ['Opening: Your opening date', 'Where: Your address', 'Book: Your booking line'],
};
const fonts = { display: 'serif', text: 'humanist', accent: 'mono' } as const;
const input = (colours: ComposeInput['colours'], more: Partial<ComposeInput> = {}): ComposeInput => ({ copy, colours, fonts, image: 'x.jpg', ...more });
const texts = (objs: DesignObject[]) => objs.filter((o): o is TextObject => o.type === 'text');

describe('the critical gates, on concepts', () => {
  it('passes every composition, on every format, in every palette', () => {
    const failures: string[] = [];
    let n = 0;
    for (const a of IMPLEMENTED) for (const key of FORMATS) for (const p of PALETTES) {
      const format = formatOf(key) as Format;
      const distance = roadside(key);
      const doc = compose(a, input(p.colours), format, 'x', { distance });
      n += 1;
      for (const line of describeFindings(checkConcept(doc, { format, distance }))) failures.push(`${a} / ${key} / ${p.key}: ${line}`);
    }
    expect(n).toBe(IMPLEMENTED.length * FORMATS.length * PALETTES.length);
    expect(failures.slice(0, 12)).toEqual([]);
  });

  it('passes the fifteen benchmark concepts and a concept for every kind of request', () => {
    const requests = [...BENCHMARK.map((b) => b.request), 'Business card for my salon', 'Billboard for my gym', 'A5 flyer for a church harvest event',
      'Roll-up banner for a pharmacy', 'Story for a luxury hotel opening', 'Postcard for a bakery', 'Website banner for a software company'];
    for (const request of requests) {
      const brief = readBrief(request);
      const format = brief.format ? formatOf(brief.format.value) : formatOf('instagram-portrait');
      for (const c of conceptsFor(brief)) {
        const found = checkConcept(documentFor(c, brief), { format, distance: isRoadside(brief) });
        expect(describeFindings(found), `${request} / ${c.archetype}`).toEqual([]);
      }
    }
  });

  it('keeps words apart on a board and on a card too, not only on a poster', () => {
    const overlap = (a: DesignObject, b: DesignObject) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
    for (const a of IMPLEMENTED) for (const key of ['billboard', 'board-48-sheet', 'business-card', 'business-card-portrait']) {
      const ts = texts(compose(a, input(PALETTES[0].colours), formatOf(key) as Format, 'x', { distance: roadside(key) }).pages[0].objects);
      for (let i = 0; i < ts.length; i += 1) for (let j = i + 1; j < ts.length; j += 1) {
        expect(overlap(ts[i], ts[j]), `${a} on ${key}: "${ts[i].name}" overlaps "${ts[j].name}"`).toBe(false);
      }
    }
  });
});

describe('composing to the format', () => {
  it('gives a board the headline, the name and one line to act on, all large', () => {
    for (const a of IMPLEMENTED) {
      const page = compose(a, input(PALETTES[2].colours), formatOf('billboard') as Format, 'x', { distance: true }).pages[0];
      const ts = texts(page.objects);
      expect(ts.map((t) => t.name).sort(), a).toEqual(expect.arrayContaining(['Brand', 'Headline']));
      for (const t of ts) {
        expect(['Brand', 'Headline', 'Call to action'], `${a}: ${t.name}`).toContain(t.name);
        expect((t.size * page.width) / page.height, `${a}: ${t.name}`).toBeGreaterThanOrEqual(t.name === 'Brand' ? 0.08 : 0.07);
      }
    }
  });

  it('sets nothing under six points on a business card, and nothing inside its safe margin', () => {
    const card = formatOf('business-card') as Format;
    const sixPoint = (6 / 72) * 300;
    for (const a of IMPLEMENTED) {
      const page = compose(a, input(PALETTES[0].colours), card).pages[0];
      for (const t of texts(page.objects)) {
        expect(t.size * page.width, `${a}: ${t.name}`).toBeGreaterThanOrEqual(sixPoint);
        expect(t.x * 85.6, `${a}: ${t.name} left`).toBeGreaterThanOrEqual(5);
        expect((1 - t.x - t.w) * 85.6, `${a}: ${t.name} right`).toBeGreaterThanOrEqual(5 - 1e-6);
        expect(t.y * 54, `${a}: ${t.name} top`).toBeGreaterThanOrEqual(5);
        expect((1 - t.y - t.h) * 54, `${a}: ${t.name} bottom`).toBeGreaterThanOrEqual(5 - 1e-6);
      }
    }
  });

  it('leaves a line out whole instead of cutting it, and says which', () => {
    const card = formatOf('business-card') as Format;
    let left = 0;
    for (const a of IMPLEMENTED) {
      const { doc, omitted } = composeWithReport(a, input(PALETTES[0].colours), card);
      for (const t of texts(doc.pages[0].objects)) expect(t.text.endsWith('…'), `${a}: ${t.name}`).toBe(false);
      for (const name of omitted) expect(texts(doc.pages[0].objects).some((t) => t.name === name), `${a}: ${name} was reported left out but is drawn`).toBe(false);
      left += omitted.length;
    }
    /* A card at six points cannot hold a twelve-word sentence: something is left out somewhere, and it is reported. */
    expect(left).toBeGreaterThan(0);
    expect(composeWithReport('typographic-poster', input(PALETTES[0].colours), formatOf('a4') as Format).omitted).toEqual([]);
  });

  it('never drops the business name', () => {
    for (const a of IMPLEMENTED) for (const key of FORMATS) {
      const { doc, omitted } = composeWithReport(a, input(PALETTES[0].colours, { copy: { ...copy, brand: 'Northgate Building and Roofing Materials' } }), formatOf(key) as Format, 'x', { distance: roadside(key) });
      expect(omitted, `${a} on ${key}`).not.toContain('Brand');
      expect(texts(doc.pages[0].objects).some((t) => t.slotRole === 'brand'), `${a} on ${key}`).toBe(true);
    }
  });

  it('makes any field that carries small words readable, moving the colour no further than it must', () => {
    for (const p of PALETTES) for (const role of ['primary', 'secondary', 'highlight'] as const) {
      const fill = carries(p.colours[role]);
      expect(contrastRatio(readableInk(fill), fill), `${p.key} ${role}`).toBeGreaterThanOrEqual(4.5);
      if (contrastRatio(readableInk(p.colours[role]), p.colours[role]) >= 4.5) expect(fill, `${p.key} ${role}`).toBe(p.colours[role]);
    }
  });
});

describe('the checks themselves', () => {
  const format = formatOf('instagram-portrait') as Format;
  const base = () => compose('typographic-poster', input(PALETTES[0].colours), format);
  const edit = (change: (t: TextObject) => void, name = 'Supporting line') => {
    const doc = base();
    change(texts(doc.pages[0].objects).find((t) => t.name === name) as TextObject);
    return describeFindings(checkConcept(doc, { format }));
  };

  it('find low contrast, tiny type, cut copy, a missing glyph and a wrong canvas', () => {
    expect(edit((t) => { t.colour = PALETTES[0].colours.ground; })[0]).toMatch(/^C5 Supporting line: contrast 1\.00:1/);
    expect(edit((t) => { t.size = 0.004; })[0]).toMatch(/^C5 Supporting line: set at 4\.3 px, below this format's 9\.0 px minimum/);
    expect(edit((t) => { t.text = 'A kitchen that…'; })[0]).toMatch(/^C5 Supporting line: copy is cut short/);
    expect(edit((t) => { t.font = 'condensed'; t.text = 'Open 中'; })[0]).toMatch(/^C3 Supporting line: Bebas Neue cannot draw "中"/);
    const doc = base();
    doc.pages[0].height = 1080;
    expect(describeFindings(checkConcept(doc, { format }))[0]).toMatch(/^C4 Page: canvas is 1080x1080/);
  });

  it('find words on a photograph, words on a pattern, and too many words on a board', () => {
    const onPhoto = compose('image-bleed', input(PALETTES[0].colours), format);
    onPhoto.pages[0].objects = onPhoto.pages[0].objects.filter((o) => o.name !== 'Panel');
    expect(describeFindings(checkConcept(onPhoto, { format })).some((l) => /sits directly on a photograph/.test(l))).toBe(true);
    const onPattern = compose('pattern-field', input(PALETTES[0].colours), format);
    onPattern.pages[0].objects = onPattern.pages[0].objects.filter((o) => o.name !== 'Panel');
    expect(describeFindings(checkConcept(onPattern, { format })).some((l) => /sits on the pattern/.test(l))).toBe(true);
    const board = formatOf('billboard') as Format;
    const wordy = compose('typographic-poster', input(PALETTES[0].colours, { copy: { ...copy, headline: 'A very long headline that no driver could ever read in time' } }), board, 'x', { distance: true });
    expect(describeFindings(checkConcept(wordy, { format: board, distance: true })).some((l) => /12 words besides the name and one action line, more than 7/.test(l))).toBe(true);
  });

  it('accepts a currency sign the fallback face draws', () => {
    expect(edit((t) => { t.text = 'From ₦ upward'; })).toEqual([]);
  });
});
