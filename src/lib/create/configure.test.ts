import { describe, it, expect } from 'vitest';

import { CATALOGUE } from './catalogue';
import {
  DESIGN_ROUTES, defaultConfiguration, optionGroupsFor, orderVerb,
  quoteFor, specLine, tierFor,
} from './configure';

const item = (sku: string) => {
  const found = CATALOGUE.find((c) => c.sku === sku);
  if (!found) throw new Error(`no such sku: ${sku}`);
  return found;
};

const cards = item('pr-cards');       // print, tiered, indicative
const flyerDesign = item('dod-flyer'); // creator, fixed price, quoted
const socialPost = item('qc-social');  // free, instant

describe('quantity tiers', () => {
  it('uses the largest tier at or below the quantity', () => {
    expect(tierFor(cards, 100)?.qty).toBe(100);
    expect(tierFor(cards, 249)?.qty).toBe(100);
    expect(tierFor(cards, 250)?.qty).toBe(250);
    expect(tierFor(cards, 5000)?.qty).toBe(1000);
  });

  it('never falls through to nothing for a below-minimum order', () => {
    // 50 cards is a real request. Quoting the 100 tier is right; quoting
    // nothing leaves the customer with a blank price and no explanation.
    expect(tierFor(cards, 1)?.qty).toBe(100);
  });

  it('returns null where a product has no tiers', () => {
    expect(tierFor(flyerDesign, 10)).toBeNull();
  });
});

describe('the price moves with the configuration', () => {
  it('starts from the tier price', () => {
    const q = quoteFor(cards, { quantity: 250, options: {}, design: 'ai' });
    expect(q.lines[0].amount).toBe(25_000);
    expect(q.total).toBe(25_000);
  });

  it('charges for a finish and discounts single-sided', () => {
    const base = quoteFor(cards, { quantity: 100, options: { finish: 'standard', sides: 'double' }, design: 'ai' });
    const premium = quoteFor(cards, { quantity: 100, options: { finish: 'premium', sides: 'double' }, design: 'ai' });
    const oneSide = quoteFor(cards, { quantity: 100, options: { finish: 'standard', sides: 'single' }, design: 'ai' });
    expect(premium.total).toBeGreaterThan(base.total);
    expect(oneSide.total).toBeLessThan(base.total);
  });

  it('adds the creator fee only when a creator is hired', () => {
    const free = quoteFor(cards, { quantity: 100, options: {}, design: 'ai' });
    const hired = quoteFor(cards, { quantity: 100, options: {}, design: 'creator' });
    expect(hired.total - free.total).toBe(item('dod-flyer').price);
    expect(hired.lines.some((l) => /creator/i.test(l.label))).toBe(true);
  });

  it('costs nothing to make something free, whatever is selected', () => {
    const q = quoteFor(socialPost, { options: {}, design: 'template' });
    expect(q.total).toBe(0);
    expect(optionGroupsFor(socialPost)).toEqual([]);
  });

  it('itemises rather than showing one unexplained number', () => {
    const q = quoteFor(cards, { quantity: 500, options: { finish: 'matte', sides: 'double' }, design: 'creator' });
    expect(q.lines.length).toBeGreaterThanOrEqual(3);
    expect(q.lines.reduce((s, l) => s + l.amount, 0)).toBe(q.total);
  });

  it('quotes in whole hundreds', () => {
    const q = quoteFor(cards, { quantity: 100, options: { finish: 'rounded' }, design: 'ai' });
    for (const line of q.lines) expect(line.amount % 100, line.label).toBe(0);
  });
});

describe('an estimate stays an estimate', () => {
  it('keeps the print basis through configuration', () => {
    const q = quoteFor(cards, { quantity: 1000, options: { finish: 'premium' }, design: 'creator' });
    expect(q.basis).toBe('indicative');
    expect(orderVerb(q)).toBe('Request this order');
  });

  it('lets a fully quoted job be ordered outright', () => {
    const q = quoteFor(flyerDesign, { options: { speed: 'standard' }, design: 'upload' });
    expect(q.basis).toBe('quoted');
    expect(orderVerb(q)).toBe('Place this order');
  });
});

describe('turnaround', () => {
  it('grows when a creator is doing the artwork', () => {
    const self = quoteFor(cards, { quantity: 100, options: {}, design: 'upload' });
    const hired = quoteFor(cards, { quantity: 100, options: {}, design: 'creator' });
    expect(hired.turnaround[1]).toBeGreaterThan(self.turnaround[1]);
  });

  it('shortens on rush, and never inverts', () => {
    const rush = quoteFor(cards, { quantity: 100, options: { speed: 'rush' }, design: 'upload' });
    const std = quoteFor(cards, { quantity: 100, options: { speed: 'standard' }, design: 'upload' });
    expect(rush.turnaround[1]).toBeLessThanOrEqual(std.turnaround[1]);
    expect(rush.turnaround[0]).toBeLessThanOrEqual(rush.turnaround[1]);
    expect(rush.turnaround[0]).toBeGreaterThanOrEqual(1);
  });

  it('charges for rush', () => {
    const rush = quoteFor(cards, { quantity: 100, options: { finish: 'standard', sides: 'double', speed: 'rush' }, design: 'upload' });
    const std = quoteFor(cards, { quantity: 100, options: { finish: 'standard', sides: 'double', speed: 'standard' }, design: 'upload' });
    expect(rush.total).toBeGreaterThan(std.total);
  });
});

describe('defaults and the spec', () => {
  it('opens on the cheapest sensible configuration', () => {
    const c = defaultConfiguration(cards);
    expect(c.quantity).toBe(100);
    expect(c.options.finish).toBe('standard');
    expect(c.design).toBe('ai');
    // Every group must get a default, or the first render prices nothing.
    for (const g of optionGroupsFor(cards)) expect(c.options[g.key], g.key).toBeTruthy();
  });

  it('writes a spec a printer can quote without opening the app', () => {
    const spec = specLine(cards, { quantity: 250, options: { finish: 'matte', sides: 'single', speed: 'standard' }, design: 'upload' });
    expect(spec).toContain('Business cards');
    expect(spec).toContain('qty 250');
    expect(spec).toContain('matte');
    expect(spec).toContain('one side');
    expect(spec).toMatch(/artwork/i);
  });

  it('offers four artwork routes, three of them free', () => {
    expect(DESIGN_ROUTES).toHaveLength(4);
    expect(DESIGN_ROUTES.filter((r) => !r.chargeSku)).toHaveLength(3);
  });

  it('is deterministic', () => {
    const cfg = { quantity: 500, options: { finish: 'premium', sides: 'double', speed: 'rush' }, design: 'creator' as const };
    expect(quoteFor(cards, cfg)).toEqual(quoteFor(cards, cfg));
  });
});
