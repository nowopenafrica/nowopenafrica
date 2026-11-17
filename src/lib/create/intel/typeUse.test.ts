import { describe, expect, it } from 'vitest';
import { formatOf, type Format } from '../../design/formats';
import { PALETTES } from '../../design/palettes';
import { TYPEFACES, type TypefaceKey } from '../../design/typefaces';
import type { TextObject } from '../../studio/designDocument';
import { readBrief } from '../brief';
import { compose, type ComposeInput } from '../compose/archetypes';
import { checkConcept, describeFindings } from '../compose/conceptChecks';
import { conceptsFor, distinctnessProblems, documentFor, isRoadside } from '../compose/concepts';
import { ALL_PAIRINGS, FACE_USE, INTEL_PAIRINGS, MOVEMENTS, TYPE_REFERENCES, TYPE_RULES, TYPE_USE_CASES, faceUse, pairingProblems, setsLabels } from './index';

const TRADES = ['restaurant', 'salon', 'law firm', 'church', 'gym', 'fashion label', 'tech startup', 'hotel', 'school', 'pharmacy', 'real estate agency', 'bakery', 'nightclub', 'logistics company', 'wedding planner', 'supermarket'];

describe('what each face is for', () => {
  it('has a written job for every face in the library, and no job for a face that is not', () => {
    expect(Object.keys(FACE_USE).sort()).toEqual(TYPEFACES.map((t) => t.key).sort());
  });

  it('agrees with what the files are: a face with no lower case is capitals-only, a script is never capitals', () => {
    expect(faceUse('condensed').capitals).toBe('only');
    expect(faceUse('classical').capitals).toBe('only');
    for (const k of ['script', 'handwritten', 'retro'] as TypefaceKey[]) {
      expect(faceUse(k).capitals, k).toBe('never');
      expect(setsLabels(k), k).toBe(false);
      expect(faceUse(k).maxWords, k).toBeLessThanOrEqual(6);
    }
    /* A face held to headlines is never also called good for paragraphs or small print. */
    for (const [k, u] of Object.entries(FACE_USE)) if (u.smallest === 'display') expect(u.paragraphs, k).toBe(false);
    /* The fallback has to be able to do every job, because it stands in for every face. */
    expect(faceUse('universal')).toMatchObject({ smallest: 'small', paragraphs: true, distance: true, figures: true });
  });

  it('has faces for every job: small print, paragraphs, the road and figures', () => {
    const count = (f: (k: TypefaceKey) => boolean) => TYPEFACES.filter((t) => t.key !== 'coolvetica' && f(t.key)).length;
    expect(count((k) => faceUse(k).smallest === 'small')).toBeGreaterThanOrEqual(5);
    expect(count((k) => faceUse(k).paragraphs)).toBeGreaterThanOrEqual(6);
    expect(count((k) => faceUse(k).distance && faceUse(k).smallest === 'display')).toBeGreaterThanOrEqual(6);
    expect(count((k) => faceUse(k).figures)).toBeGreaterThanOrEqual(8);
  });
});

describe('pairings', () => {
  it('never puts a display face under the headline, or a face that cannot be read in lines', () => {
    for (const p of INTEL_PAIRINGS) expect(pairingProblems(p, { headlineWords: 3 }), p.key).toEqual([]);
  });

  it('uses every face of the second batch somewhere, so none was added for show', () => {
    const used = new Set(ALL_PAIRINGS.flatMap((p) => [p.display, p.text, p.accent]));
    /* The two scripts are the customer's to choose in the editor: the engine sets labels in capitals, which a script cannot be. The fallback is borrowed from, not paired. */
    const notPaired = new Set<TypefaceKey>(['handwritten', 'retro', 'universal', 'coolvetica']);
    for (const t of TYPEFACES) if (!notPaired.has(t.key)) expect(used.has(t.key), t.key).toBe(true);
  });

  it('gives every movement at least one new voice, all of them real pairings', () => {
    const keys = new Set(ALL_PAIRINGS.map((p) => p.key));
    const fresh = new Set(['system', 'broadcast', 'atelier', 'monument', 'neighbourhood', 'signal', 'masthead', 'works', 'studio', 'artline', 'playroom', 'city']);
    for (const m of MOVEMENTS) {
      for (const k of m.pairings) expect(keys.has(k), `${m.key}: ${k}`).toBe(true);
      expect(m.pairings.some((k) => fresh.has(k)), m.key).toBe(true);
    }
  });

  it('says why a pairing is wrong for a piece', () => {
    const vogue = ALL_PAIRINGS.find((p) => p.key === 'vogue')!;
    expect(pairingProblems(vogue, { distance: true, headlineWords: 3 })[0]).toMatch(/didone has hairlines or strokes too fine to read from a road/);
    expect(pairingProblems(vogue, { smallPrint: true, headlineWords: 3 })[0]).toMatch(/hairlines that close up/);
    const signal = ALL_PAIRINGS.find((p) => p.key === 'signal')!;
    expect(pairingProblems(signal, { headlineWords: 9 })[0]).toMatch(/wide should carry at most 5 words; the headline has 9/);
    expect(pairingProblems({ display: 'script', text: 'humanist', accent: 'mono' }, { capitals: true, headlineWords: 2 })[0]).toMatch(/cannot be set in capitals/);
    expect(pairingProblems({ display: 'grotesk', text: 'didone', accent: 'mono' }, { headlineWords: 2 })[0]).toMatch(/display face and cannot set supporting text/);
  });
});

describe('the engine applies the rules', () => {
  it('sets a billboard in a face that reads from a road, for every trade', () => {
    for (const trade of TRADES) for (const level of ['', 'luxury ']) {
      const brief = readBrief(`Billboard for a ${level}${trade}`);
      expect(isRoadside(brief), trade).toBe(true);
      const concepts = conceptsFor(brief);
      expect(concepts.length, trade).toBeGreaterThan(0);
      for (const c of concepts) expect(faceUse(c.input.fonts.display).distance, `${level}${trade}: ${c.movement} got ${c.pairing} (${c.input.fonts.display})`).toBe(true);
    }
  });

  it('sets a business card in text faces that survive six points, with no hairline headline', () => {
    for (const trade of TRADES) {
      const brief = readBrief(`Business card for my ${trade}`);
      for (const c of conceptsFor(brief)) {
        expect(faceUse(c.input.fonts.text).smallest, `${trade}: ${c.pairing}`).toBe('small');
        const d = faceUse(c.input.fonts.display);
        expect(d.smallest !== 'display' || d.distance, `${trade}: ${c.pairing} (${c.input.fonts.display})`).toBe(true);
      }
    }
  });

  it('does not ask a few-word face to carry a long headline', () => {
    for (const trade of TRADES) {
      const brief = readBrief(`Poster for my ${trade} "Come and see everything we have been working on this whole year"`);
      for (const c of conceptsFor(brief)) {
        const most = faceUse(c.input.fonts.display).maxWords;
        if (most) expect(most, `${trade}: ${c.pairing}`).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('still gives three different voices, and every concept passes the type check', () => {
    for (const trade of TRADES) for (const piece of ['Poster', 'Instagram post', 'Business card', 'Billboard', 'A5 flyer']) {
      const brief = readBrief(`${piece} for my ${trade}`);
      const concepts = conceptsFor(brief);
      expect(distinctnessProblems(concepts), `${piece} / ${trade}`).toEqual([]);
      const format = brief.format ? formatOf(brief.format.value) : formatOf('instagram-portrait');
      for (const c of concepts) {
        const found = describeFindings(checkConcept(documentFor(c, brief), { format, distance: isRoadside(brief) }));
        expect(found, `${piece} / ${trade} / ${c.archetype} / ${c.pairing}`).toEqual([]);
      }
    }
  });

  it('never sets small capitals in a script or a display-only face, whatever the pairing says', () => {
    const format = formatOf('instagram-portrait') as Format;
    const copy = { brand: 'Your brand', eyebrow: 'Opening', headline: 'Pull up a chair.', support: 'Come hungry.', cta: 'Book a table', details: ['Where: Your address'] };
    for (const accent of ['script', 'handwritten', 'retro', 'didone', 'elegant', 'fatface'] as TypefaceKey[]) {
      const input: ComposeInput = { copy, colours: PALETTES[0].colours, fonts: { display: 'grotesk', text: 'humanist', accent }, image: 'x.jpg' };
      const doc = compose('typographic-poster', input, format);
      const labels = doc.pages[0].objects.filter((o): o is TextObject => o.type === 'text' && !!o.upper && o.slotRole !== 'brand');
      expect(labels.length, accent).toBeGreaterThan(0);
      for (const t of labels) expect(t.font, `${accent}: ${t.name}`).toBe('humanist');
      expect(describeFindings(checkConcept(doc, { format }))).toEqual([]);
    }
  });

  it('reports a face misused, by name and measurement', () => {
    const format = formatOf('instagram-portrait') as Format;
    const base: ComposeInput = { copy: { brand: 'Your brand', headline: 'Pull up a chair.', support: 'Come hungry.' }, colours: PALETTES[0].colours, fonts: { display: 'grotesk', text: 'humanist', accent: 'mono' } };
    const doc = compose('typographic-poster', base, format);
    const support = doc.pages[0].objects.find((o) => o.name === 'Supporting line') as TextObject;
    support.font = 'didone';
    support.size = 0.02;
    expect(describeFindings(checkConcept(doc, { format }))).toContain('TYPE Supporting line: Bodoni Moda is a display face set at 2.0% of the short edge, below the 3% it needs');
    const scripted = compose('typographic-poster', base, format);
    const head = scripted.pages[0].objects.find((o) => o.name === 'Headline') as TextObject;
    head.font = 'retro';
    head.upper = true;
    head.text = 'Pull up a chair and stay';
    const lines = describeFindings(checkConcept(scripted, { format }));
    expect(lines).toContain('TYPE Headline: Pacifico is a script and is set in capitals');
    expect(lines).toContain('TYPE Headline: Pacifico should carry at most 3 words; this headline has 6');
  });
});

describe('the written guidance', () => {
  it('covers the pieces a business actually orders, each with what to do and what to avoid', () => {
    expect(TYPE_USE_CASES.map((u) => u.key)).toEqual(expect.arrayContaining(['billboard', 'business-card', 'social-post', 'poster-flyer', 'menu-price-list', 'identity']));
    for (const u of TYPE_USE_CASES) for (const field of [u.reading, u.headline, u.text, u.avoid]) expect(field.length, u.key).toBeGreaterThan(15);
    expect(TYPE_RULES.length).toBeGreaterThanOrEqual(8);
  });

  it('says where the rules were checked, and says so when a source could not be read', () => {
    const where = TYPE_REFERENCES.map((r) => r.where).join(' ');
    for (const source of ['Behance', 'Awwwards', 'Pinterest']) expect(where).toContain(source);
    /* Every source says how much of it was read: Pinterest was one results page, and a second search that timed out is admitted. */
    const pinterest = TYPE_REFERENCES.find((r) => r.where.startsWith('Pinterest'))!;
    expect(pinterest.where).toMatch(/one results page/);
    expect(pinterest.found).toMatch(/timed out and was not read/);
  });
});
