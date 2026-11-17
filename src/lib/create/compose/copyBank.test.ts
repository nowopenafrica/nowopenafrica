import { describe, expect, it } from 'vitest';
import { readBrief } from '../brief';
import { INDUSTRIES } from '../intel';
import { asPlaceholder, conceptsFor } from './concepts';
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

  it('keeps every headline to seven words, because any of them may end up on a billboard', () => {
    const heads = [...Object.values(BY_GOAL).flat().map((l) => l.headline), ...Object.values(BY_TRADE).flat().map((l) => l[0])];
    for (const h of heads) expect(h.split(/\s+/).length, h).toBeLessThanOrEqual(7);
  });

  it('has lines for every trade the library knows, bar the two regulated health trades', () => {
    const without = INDUSTRIES.map((i) => i.key).filter((k) => !BY_TRADE[k]);
    expect(without.sort()).toEqual(['clinic-health', 'pharmacy-wellness']);
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

  it('words a fact the customer has not given as theirs to give, not as a form label', () => {
    expect(asPlaceholder('Name and area')).toBe('Your name and area');
    expect(asPlaceholder('Opening date or hours')).toBe('Your opening date or hours');
    expect(asPlaceholder('How to book or order')).toBe('How to book or order');
    expect(asPlaceholder('What kind of food')).toBe('What kind of food');
    expect(asPlaceholder('Your address')).toBe('Your address');
    expect(asPlaceholder('Hours: 8 to 6')).toBe('Hours: 8 to 6');
    /* Seen on the logistics and cafe renders and in the full list, 2026-11-17. */
    expect(asPlaceholder('The signature item')).toBe('Your signature item');
    expect(asPlaceholder('The dish and the price')).toBe('Your dish and price');
    expect(asPlaceholder('Tracking or insurance facts if offered')).toBe('Your tracking or insurance facts');
    expect(asPlaceholder('Professional registration where required')).toBe('Your professional registration');
    expect(asPlaceholder('Speaker names and titles on speaker pieces')).toBe('Your speaker names and titles');
    expect(asPlaceholder('Ministers or guests named correctly')).toBe('Your ministers or guests');
    expect(asPlaceholder('Size and price when selling')).toBe('Your size and price');
    expect(asPlaceholder('Call to action')).toBe('How to reach you');
    /* Every must-carry fact in the library reads as a placeholder, with no advice left in it. */
    for (const ind of INDUSTRIES) for (const f of ind.mustCarry) {
      const p = asPlaceholder(f);
      expect(p, f).not.toMatch(/^Your (the|a|an) /i);
      expect(p, f).not.toMatch(/\s(if|where|when)\s|named correctly|in plain words|on \w+ pieces/i);
      expect(p.length, f).toBeGreaterThan(4);
    }
    const [first] = conceptsFor(readBrief('Instagram post for a restaurant opening'));
    for (const d of first.input.copy.details ?? []) expect(d, d).toMatch(/^(Your|How|What|Where|When|Who) /);
    /* Facts the caller supplies are the customer's own words and are never reworded. */
    const given = conceptsFor(readBrief('Instagram post for a restaurant opening'), { copy: [{ details: ['Saturdays from noon'] }] });
    expect(given[0].input.copy.details).toEqual(['Saturdays from noon']);
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
