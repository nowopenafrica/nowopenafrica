import { describe, it, expect } from 'vitest';

import {
  RECEIPT_TEMPLATES, templateForCategory, receiptTemplate,
  receiptTotals, receiptItemTotal, nightsBetween, nextReceiptNumber,
  formatMoney, receiptText, createReceipt, type Receipt, type ReceiptItem,
} from './receipts';
import { BUSINESS_CATEGORIES } from '../data/categories';
import { subtotal as invoiceSubtotal, discountAmount, taxAmount, total as invoiceTotal } from './invoices';

const item = (qty: number, unitPrice: number): ReceiptItem =>
  ({ id: `${qty}-${unitPrice}`, description: 'x', qty, unitPrice });

describe('RECEIPT_TEMPLATES', () => {
  it('gives every template a distinct id and a design width', () => {
    const ids = RECEIPT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of RECEIPT_TEMPLATES) expect(t.designWidth).toBeGreaterThan(0);
  });

  it('never lists one category under two templates', () => {
    // Otherwise templateForCategory's answer depends on array order, which is
    // not something anyone would think to check when adding a category.
    const seen = new Map<string, string>();
    for (const t of RECEIPT_TEMPLATES) {
      for (const c of t.categories) {
        expect(seen.get(c), `${c} is claimed by ${seen.get(c)} and ${t.id}`).toBeUndefined();
        seen.set(c, t.id);
      }
    }
  });

  it('only claims categories the app actually offers', () => {
    // A typo here is invisible: the category simply never matches and the
    // business silently gets the fallback.
    for (const t of RECEIPT_TEMPLATES) {
      for (const c of t.categories) {
        expect(BUSINESS_CATEGORIES, `${c} (in ${t.id}) is not a real category`).toContain(c);
      }
    }
  });

  it('keeps the till roll narrow enough to be a till roll', () => {
    const thermal = RECEIPT_TEMPLATES.find((t) => t.id === 'thermal')!;
    expect(thermal.designWidth).toBeLessThan(420);
  });
});

describe('templateForCategory', () => {
  it('gives a trade the shape its customers expect', () => {
    expect(templateForCategory('Fast Food').id).toBe('thermal');
    expect(templateForCategory('Salon / Barber').id).toBe('service');
    expect(templateForCategory('Accounting & Tax').id).toBe('professional');
    expect(templateForCategory('Hotel & Lodging').id).toBe('hospitality');
    expect(templateForCategory('Courier & Dispatch').id).toBe('delivery');
    expect(templateForCategory('Electronics').id).toBe('retail');
  });

  it('falls back to a plain sales receipt rather than nothing', () => {
    expect(templateForCategory('Something Nobody Configured').id).toBe('retail');
    expect(templateForCategory('').id).toBe('retail');
    expect(templateForCategory(null).id).toBe('retail');
  });

  it('resolves an unknown template id without throwing', () => {
    expect(receiptTemplate('nonsense').id).toBe('retail');
    expect(receiptTemplate('thermal').id).toBe('thermal');
  });
});

describe('receiptTotals', () => {
  const items = [item(2, 5000), item(1, 3000)]; // 13,000

  it('adds up the items', () => {
    expect(receiptItemTotal(item(3, 250))).toBe(750);
    expect(receiptTotals(items, 0, 0).subtotal).toBe(13000);
  });

  it('takes the discount off first, then taxes what is left', () => {
    // 13,000 − 10% = 11,700; 7.5% of that = 877.50
    const t = receiptTotals(items, 7.5, 10);
    expect(t.discount).toBe(1300);
    expect(t.tax).toBeCloseTo(877.5, 5);
    expect(t.total).toBeCloseTo(12577.5, 5);
  });

  it('agrees with the invoice arithmetic exactly', () => {
    // Two documents in one product must not disagree about money.
    const inv = {
      items: items.map((i) => ({ id: i.id, description: i.description, qty: i.qty, unitPrice: i.unitPrice })),
      taxPct: 7.5,
      discountPct: 10,
    } as Parameters<typeof invoiceSubtotal>[0];
    const t = receiptTotals(items, 7.5, 10);
    expect(t.subtotal).toBe(invoiceSubtotal(inv));
    expect(t.discount).toBeCloseTo(discountAmount(inv), 6);
    expect(t.tax).toBeCloseTo(taxAmount(inv), 6);
    expect(t.total).toBeCloseTo(invoiceTotal(inv), 6);
  });

  it('reports change only once the bill is actually covered', () => {
    // "change: -500" on a printed receipt is how a dispute starts.
    const short = receiptTotals(items, 0, 0, 10000);
    expect(short.change).toBe(0);
    expect(short.outstanding).toBe(3000);

    const over = receiptTotals(items, 0, 0, 15000);
    expect(over.change).toBe(2000);
    expect(over.outstanding).toBe(0);

    const exact = receiptTotals(items, 0, 0, 13000);
    expect(exact.change).toBe(0);
    expect(exact.outstanding).toBe(0);
  });

  it('treats missing and malformed numbers as zero rather than NaN', () => {
    const t = receiptTotals(
      [{ id: 'a', description: '', qty: NaN, unitPrice: 100 }],
      NaN as unknown as number,
      undefined as unknown as number,
    );
    expect(t.subtotal).toBe(0);
    expect(t.total).toBe(0);
    expect(Number.isNaN(t.tax)).toBe(false);
  });

  it('survives an empty basket', () => {
    expect(receiptTotals([], 7.5, 10).total).toBe(0);
  });
});

describe('nightsBetween', () => {
  it('counts the nights a guest actually stayed', () => {
    expect(nightsBetween('2026-08-01', '2026-08-04')).toBe(3);
  });

  it('never returns a negative or a NaN night', () => {
    expect(nightsBetween('2026-08-04', '2026-08-01')).toBe(0);
    expect(nightsBetween('2026-08-01', '2026-08-01')).toBe(0);
    expect(nightsBetween('', '2026-08-04')).toBe(0);
    expect(nightsBetween('not a date', 'nor this')).toBe(0);
  });
});

describe('nextReceiptNumber', () => {
  const at = (number: string): Receipt => ({ number } as Receipt);

  it('starts at one for the day and pads so a stack sorts', () => {
    expect(nextReceiptNumber([], '2026-08-27')).toBe('RCP-20260827-0001');
  });

  it('continues the day it is given, ignoring other days', () => {
    const existing = [at('RCP-20260827-0001'), at('RCP-20260827-0007'), at('RCP-20260826-0099')];
    expect(nextReceiptNumber(existing, '2026-08-27')).toBe('RCP-20260827-0008');
  });

  it('restarts each day rather than growing forever', () => {
    const existing = [at('RCP-20260826-0099')];
    expect(nextReceiptNumber(existing, '2026-08-27')).toBe('RCP-20260827-0001');
  });

  it('is not derailed by a number that was edited by hand', () => {
    const existing = [at('RCP-20260827-0002'), at('handwritten'), at('RCP-20260827-oops')];
    expect(nextReceiptNumber(existing, '2026-08-27')).toBe('RCP-20260827-0003');
  });
});

describe('formatMoney', () => {
  it('uses the business own currency, not a hardcoded naira', () => {
    // A Ghanaian business handing out slips marked in ₦ is worse than one with
    // no symbol at all.
    expect(formatMoney(1500, 'NGN')).toMatch(/1,500/);
    expect(formatMoney(1500, 'GHS')).not.toContain('₦');
    expect(formatMoney(1500, 'KES')).not.toContain('₦');
  });

  it('stays whole for whole amounts and shows kobo when there are any', () => {
    expect(formatMoney(1500, 'NGN')).not.toMatch(/\.00/);
    expect(formatMoney(1500.5, 'NGN')).toMatch(/\.5/);
  });

  it('renders something sane for a currency it does not know', () => {
    const out = formatMoney(1500, 'NOT_A_CURRENCY');
    expect(out).toMatch(/1,500/);
  });

  it('does not print NaN at a customer', () => {
    expect(formatMoney(NaN, 'NGN')).toMatch(/0/);
  });
});

describe('createReceipt', () => {
  it('opens with a numbered, dated, single-line receipt in the right currency', () => {
    const r = createReceipt({}, [], 'KES');
    expect(r.number).toMatch(/^RCP-\d{8}-\d{4}$/);
    expect(r.currency).toBe('KES');
    expect(r.items).toHaveLength(1);
    expect(r.id).toBeTruthy();
  });

  it('lets a caller override the layout and keeps the generated number', () => {
    const r = createReceipt({ layout: 'thermal' }, [], 'NGN');
    expect(r.layout).toBe('thermal');
    expect(r.number).toBeTruthy();
  });
});

describe('receiptText', () => {
  const base = createReceipt({ number: 'RCP-20260827-0003', method: 'transfer' }, [], 'NGN');

  it('carries the number and total as text, so it is searchable in a chat', () => {
    const totals = receiptTotals([item(1, 5000)], 0, 0, 5000);
    const text = receiptText('Mama Put Kitchen', base, totals);
    expect(text).toContain('RCP-20260827-0003');
    expect(text).toContain('Mama Put Kitchen');
    expect(text).toContain('transfer');
    expect(text).toMatch(/5,000/);
  });

  it('says so when money is still owed', () => {
    const totals = receiptTotals([item(1, 5000)], 0, 0, 2000);
    expect(receiptText('X', base, totals)).toContain('Balance due');
  });

  it('does not mention a balance when there is none', () => {
    const totals = receiptTotals([item(1, 5000)], 0, 0, 5000);
    expect(receiptText('X', base, totals)).not.toContain('Balance due');
  });
});
