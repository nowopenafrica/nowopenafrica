import { describe, expect, it } from 'vitest';
import { readBrief } from '../brief';
import { INDUSTRIES } from '../intel';
import { conceptsFor } from './concepts';
import { BY_GOAL, BY_TRADE, bankLine } from './copyBank';
import { refuseLine } from './ideas';

describe('the copy bank', () => {
  it('holds every line to the rules a model was held to', () => {
    const nothingKnown = new Set<string>();
    const problems: string[] = [];
    const check = (where: string, field: 'eyebrow' | 'headline' | 'support' | 'cta', text: string) => {
      const why = refuseLine(text, field, nothingKnown);
      if (why) problems.push(`${where} ${field} "${text}": ${why}`);
    };
    for (const [goal, lines] of Object.entries(BY_GOAL)) {
      lines.forEach((l, k) => { check(`${goal}[${k}]`, 'eyebrow', l.eyebrow); check(`${goal}[${k}]`, 'headline', l.headline); check(`${goal}[${k}]`, 'support', l.support); check(`${goal}[${k}]`, 'cta', l.cta); });
    }
    for (const [trade, lines] of Object.entries(BY_TRADE)) {
      lines.forEach(([headline, support, cta], k) => { check(`${trade}[${k}]`, 'headline', headline); check(`${trade}[${k}]`, 'support', support); check(`${trade}[${k}]`, 'cta', cta); });
    }
    expect(problems).toEqual([]);
  });

  it('names only trades the library knows, and leaves the regulated health trades to the plain lines', () => {
    const keys = new Set(INDUSTRIES.map((i) => i.key));
    for (const trade of Object.keys(BY_TRADE)) expect(keys.has(trade), trade).toBe(true);
    for (const health of ['clinic-health', 'pharmacy-wellness']) expect(BY_TRADE[health]).toBeUndefined();
  });

  it('gives three concepts three different headlines, for a trade it knows and one it does not', () => {
    for (const request of ['Poster for my restaurant', 'Poster for my pharmacy', 'Flyer for a conference', 'A poster']) {
      const brief = readBrief(request);
      const heads = [0, 1, 2].map((n) => bankLine(brief, n).headline);
      expect(new Set(heads).size, request).toBe(3);
    }
  });

  it('writes for the trade when it can', () => {
    expect(bankLine(readBrief('Instagram post for a restaurant opening'), 0)).toEqual({
      eyebrow: 'Opening', headline: 'Pull up a chair.', support: 'A kitchen that cooks the way it would for family. Come hungry.', cta: 'Book a table',
    });
  });

  it('does not label a piece with a goal that was only assumed', () => {
    const brief = readBrief('Flyer for my barber shop');
    expect(brief.objective?.source).toBe('default');
    expect([0, 1, 2].map((n) => bankLine(brief, n).eyebrow)).toEqual(['Hello', 'Nearby', 'For you']);
  });

  it('is what a concept says by default, and never over the customer’s own words', () => {
    const plain = conceptsFor(readBrief('Flyer for my barber shop'));
    expect(plain.map((c) => c.input.copy.headline)).toEqual(['Sit down. Leave sharper.', 'Your hair, handled.', 'Leave looking like yourself.']);
    for (const c of plain) { expect(c.input.copy.support).toBeTruthy(); expect(c.input.copy.cta).toBeTruthy(); expect(c.input.copy.eyebrow).toBeTruthy(); }
    const own = conceptsFor(readBrief('Flyer for my barber shop "Fades from the heart"'));
    for (const c of own) expect(c.input.copy.headline).toBe('Fades from the heart');
    const given = conceptsFor(readBrief('Flyer for my barber shop'), { copy: [{ support: 'Mine.', cta: 'Call' }] });
    expect(given[0].input.copy.support).toBe('Mine.');
    expect(given[0].input.copy.cta).toBe('Call');
  });
});
