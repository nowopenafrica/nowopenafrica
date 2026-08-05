import { describe, it, expect, beforeEach } from 'vitest';
import { Business } from '../types';
import {
  Invoice, InvoiceItem,
  itemTotal, subtotal, discountAmount, taxAmount, total,
  invoiceDisplayStatus, invoiceCounts, createInvoice,
  suggestDates, dateLabel, invoiceText, reminderText,
  loadInvoices, saveInvoices,
} from './invoices';

const biz = { id: '1', name: 'Meat Club', phone: '+234 800 123 4567' } as unknown as Business;

function inv(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'i1',
    number: 'INV-001',
    customerName: 'Ada',
    customerPhone: '080 1234 5678',
    items: [
      { id: 'x', description: 'Grill platter', qty: 2, unitPrice: 5000 },
      { id: 'y', description: 'Delivery', qty: 1, unitPrice: 1000 },
    ],
    taxPct: 0,
    discountPct: 0,
    issueDate: '2026-08-01',
    dueDate: '2026-08-08',
    notes: '',
    status: 'sent',
    createdAt: '2026-08-01T09:00:00.000Z',
    ...over,
  };
}

beforeEach(() => localStorage.clear());

describe('invoices — maths', () => {
  it('computes line totals and the grand total', () => {
    const line: InvoiceItem = { id: 'x', description: 'Grill platter', qty: 2, unitPrice: 5000 };
    expect(itemTotal(line)).toBe(10000);
    expect(subtotal(inv())).toBe(11000);
    expect(total(inv())).toBe(11000);
  });

  it('applies discount before tax', () => {
    const i = inv({ discountPct: 10, taxPct: 7.5 });
    expect(discountAmount(i)).toBe(1100);
    expect(taxAmount(i)).toBe(742.5);
    expect(total(i)).toBe(10642.5);
  });

  it('rounds nothing silently and never produces negative totals', () => {
    expect(total(inv({ items: [], discountPct: 50 }))).toBe(0);
    expect(discountAmount(inv({ items: [], discountPct: 50 }))).toBe(0);
  });
});

describe('invoices — status & counts', () => {
  it('marks unpaid invoices past their due date as overdue', () => {
    const now = new Date('2026-08-10T12:00:00');
    expect(invoiceDisplayStatus(inv(), now)).toBe('overdue');
    expect(invoiceDisplayStatus(inv({ dueDate: '2026-08-15' }), now)).toBe('sent');
    expect(invoiceDisplayStatus(inv({ status: 'paid' }), now)).toBe('paid');
    expect(invoiceDisplayStatus(inv({ status: 'draft' }), now)).toBe('draft');
  });

  it('tallies invoices and outstanding value', () => {
    const now = new Date('2026-08-10T12:00:00');
    const counts = invoiceCounts([
      inv({ id: 'a' }),
      inv({ id: 'b', status: 'paid' }),
      inv({ id: 'c', dueDate: '2026-08-15', items: [{ id: 'z', description: 'Meal', qty: 1, unitPrice: 2000 }] }),
      inv({ id: 'd', status: 'draft' }),
    ], now);
    expect(counts).toEqual({ draft: 1, sent: 1, paid: 1, overdue: 1, total: 4, outstanding: 13000 });
  });
});

describe('invoices — creation', () => {
  it('generates sequential invoice numbers', () => {
    const a = createInvoice({ ...inv(), customerName: 'A' }, []);
    const b = createInvoice({ ...inv(), customerName: 'B' }, [a]);
    expect(a.number).toBe('INV-001');
    expect(b.number).toBe('INV-002');
  });

  it('drops empty line items on creation', () => {
    const i = createInvoice({ ...inv(), items: [{ id: 'e', description: '', qty: 1, unitPrice: 0 }] }, []);
    expect(i.items).toHaveLength(0);
  });

  it('suggests issue and due dates spanning the payment window', () => {
    const d = suggestDates(7);
    expect(d.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.dueDate > d.issueDate).toBe(true);
  });

  it('labels dates readably', () => {
    expect(dateLabel('2026-08-08')).toMatch(/Aug/i);
  });
});

describe('invoices — copy & persistence', () => {
  it('builds a WhatsApp invoice summary', () => {
    const text = invoiceText(biz, inv());
    expect(text).toContain('INV-001');
    expect(text).toContain('Grill platter × 2');
    expect(text).toContain('₦11,000');
    expect(text).toContain('Meat Club');
  });

  it('builds a payment reminder', () => {
    const text = reminderText(biz, inv());
    expect(text).toContain('Ada');
    expect(text).toContain('₦11,000');
  });

  it('saves and reloads invoices per business', () => {
    saveInvoices('biz1', [inv()]);
    expect(loadInvoices('biz1')).toHaveLength(1);
    expect(loadInvoices('biz1')[0].number).toBe('INV-001');
    expect(loadInvoices('other')).toHaveLength(0);
  });
});
