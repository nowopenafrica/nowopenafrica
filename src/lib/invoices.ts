// NowOpen Studio — Invoices & Receipts.
//
// A lightweight invoicing desk: create invoices line by line, watch totals
// recalculate, mark them sent/paid and chase overdue ones with a WhatsApp
// reminder. Stored per business in localStorage like the rest of the Studio's
// on-device data.

import { Business } from '../types';

export interface InvoiceItem {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid';

export interface Invoice {
  id: string;
  number: string;
  customerName: string;
  customerPhone: string;
  items: InvoiceItem[];
  taxPct: number;
  discountPct: number;
  issueDate: string; // YYYY-MM-DD
  dueDate: string;   // YYYY-MM-DD
  notes: string;
  status: InvoiceStatus;
  createdAt: string; // ISO datetime
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatNaira(n: number): string {
  return `₦${Number(n || 0).toLocaleString()}`;
}

// --- Totals -----------------------------------------------------------------

export function itemTotal(item: InvoiceItem): number {
  return (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
}

export function subtotal(inv: Invoice): number {
  return inv.items.reduce((s, i) => s + itemTotal(i), 0);
}

export function discountAmount(inv: Invoice): number {
  return subtotal(inv) * ((Number(inv.discountPct) || 0) / 100);
}

export function taxAmount(inv: Invoice): number {
  const base = subtotal(inv) - discountAmount(inv);
  return base * ((Number(inv.taxPct) || 0) / 100);
}

export function total(inv: Invoice): number {
  return subtotal(inv) - discountAmount(inv) + taxAmount(inv);
}

// --- Status ---------------------------------------------------------------

export type InvoiceDisplayStatus = InvoiceStatus | 'overdue';

export function invoiceDisplayStatus(inv: Invoice, now = new Date()): InvoiceDisplayStatus {
  if (inv.status === 'paid') return 'paid';
  if (inv.status === 'draft') return 'draft';
  const due = new Date(`${inv.dueDate}T23:59:59`);
  return now.getTime() > due.getTime() ? 'overdue' : 'sent';
}

export function invoiceCounts(invoices: Invoice[], now = new Date()): {
  draft: number; sent: number; paid: number; overdue: number; total: number; outstanding: number;
} {
  let outstanding = 0;
  const counts = { draft: 0, sent: 0, paid: 0, overdue: 0 };
  for (const inv of invoices) {
    const st = invoiceDisplayStatus(inv, now);
    counts[st]++;
    if (st === 'sent' || st === 'overdue') outstanding += total(inv);
  }
  return { ...counts, total: invoices.length, outstanding };
}

// --- Creation ---------------------------------------------------------------

export function nextInvoiceNumber(existing: Invoice[]): string {
  const max = existing.reduce((m, inv) => {
    const n = Number(inv.number.replace(/[^\d]/g, ''));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `INV-${String(max + 1).padStart(3, '0')}`;
}

export function createInvoice(data: Omit<Invoice, 'id' | 'number' | 'createdAt'>, existing: Invoice[]): Invoice {
  return {
    ...data,
    items: data.items.filter((i) => i.description.trim()),
    id: uid(),
    number: nextInvoiceNumber(existing),
    createdAt: new Date().toISOString(),
  };
}

export function suggestDates(paymentDays = 7): { issueDate: string; dueDate: string } {
  const issue = new Date();
  const due = new Date();
  due.setDate(due.getDate() + paymentDays);
  return { issueDate: issue.toISOString().slice(0, 10), dueDate: due.toISOString().slice(0, 10) };
}

export function dateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// --- WhatsApp copy ----------------------------------------------------------

export function invoiceText(business: Business, inv: Invoice): string {
  return [
    `🧾 ${inv.number} — ${business.name}`,
    inv.customerName ? `Dear ${inv.customerName},` : '',
    'Please find your invoice below.',
    ...inv.items.map((i) => `• ${i.description} × ${i.qty} — ${formatNaira(itemTotal(i))}`),
    `Subtotal: ${formatNaira(subtotal(inv))}`,
    inv.discountPct > 0 ? `Discount (${inv.discountPct}%): −${formatNaira(discountAmount(inv))}` : '',
    inv.taxPct > 0 ? `Tax (${inv.taxPct}%): ${formatNaira(taxAmount(inv))}` : '',
    `Total: ${formatNaira(total(inv))} — due ${dateLabel(inv.dueDate)}`,
    business.phone ? `Pay or ask questions on ${business.phone}.` : 'Thank you for your business!',
  ].filter(Boolean).join('\n');
}

export function reminderText(business: Business, inv: Invoice): string {
  return [
    `Hi ${inv.customerName || 'there'}! 👋`,
    `A quick reminder that ${inv.number} at ${business.name} (${formatNaira(total(inv))}) was due ${dateLabel(inv.dueDate)}.`,
    business.phone ? `You can pay or get in touch on ${business.phone}.` : 'Thank you!',
  ].join('\n');
}

// --- Persistence ------------------------------------------------------------

export function invoicesKey(businessId: string): string {
  return `nowopen_invoices_${businessId}`;
}

export function loadInvoices(businessId: string): Invoice[] {
  try {
    const raw = localStorage.getItem(invoicesKey(businessId));
    const parsed = raw ? (JSON.parse(raw) as Invoice[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveInvoices(businessId: string, invoices: Invoice[]): void {
  try { localStorage.setItem(invoicesKey(businessId), JSON.stringify(invoices)); } catch { /* ignore */ }
}
