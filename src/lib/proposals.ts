// NowOpen Studio — Proposals & Quotes.
//
// Create a proper quote or proposal for a customer (products or services,
// quantities, prices, VAT), total it up, then send it on WhatsApp or download
// it as a plain-text document. Everything lives on-device in localStorage like
// the rest of the Studio.

import { Business } from '../types';

export interface ProposalItem {
  id: string;
  title: string;
  description: string;
  qty: number;
  unit: string;
  price: number; // per unit
}

export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'declined';

export interface Proposal {
  id: string;
  number: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  validUntil: string; // YYYY-MM-DD
  currency: string;
  items: ProposalItem[];
  note: string;
  status: ProposalStatus;
  createdAt: string; // ISO datetime
}

export const PROPOSAL_VAT_RATE = 0.075; // standard Nigerian VAT

export const PROPOSAL_STATUSES: { key: ProposalStatus; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
];

export function proposalStatusLabel(status: ProposalStatus): string {
  return PROPOSAL_STATUSES.find((s) => s.key === status)?.label || status;
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function proposalNumber(index: number): string {
  const year = new Date().getFullYear();
  return `PR-${year}-${String(index + 1).padStart(3, '0')}`;
}

// ---- Totals -----------------------------------------------------------------

export interface ProposalTotals {
  subtotal: number;
  vat: number;
  total: number;
}

export function proposalTotals(items: ProposalItem[]): ProposalTotals {
  const subtotal = items.reduce((sum, it) => sum + it.qty * it.price, 0);
  const vat = subtotal * PROPOSAL_VAT_RATE;
  return { subtotal, vat, total: subtotal + vat };
}

export function formatMoney(value: number, currency = '₦'): string {
  return `${currency}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---- Content ----------------------------------------------------------------

// Suggests a couple of starter line items drawn from the profile category.
export function suggestItems(business: Pick<Business, 'name' | 'category'>): ProposalItem[] {
  const focus = business.category || 'services';
  return [
    { id: uid(), title: `${business.name} — ${focus}`, description: 'Quoted scope of work / products (edit me)', qty: 1, unit: 'pkg', price: 0 },
  ];
}

export function proposalItemsText(items: ProposalItem[]): string {
  if (items.length === 0) return '  (no items)';
  return items.map((it) => {
    const line = `${it.qty} × ${it.title}${it.description ? ` — ${it.description}` : ''}`;
    return `  • ${line} @ ${formatMoney(it.price)} = ${formatMoney(it.qty * it.price)}`;
  }).join('\n');
}

// The full document, ready to copy or download.
export function proposalDocumentText(
  proposal: Proposal,
  business: Pick<Business, 'name' | 'location' | 'phone' | 'email'>,
): string {
  const t = proposalTotals(proposal.items);
  const rows = [
    proposal.number,
    `FOR: ${business.name}`,
    business.location || '',
    [business.phone, business.email].filter(Boolean).join(' · '),
    '',
    `Prepared for: ${proposal.clientName || '—'}`,
    `Contact: ${[proposal.clientPhone, proposal.clientEmail].filter(Boolean).join(' · ') || '—'}`,
    `Valid until: ${new Date(`${proposal.validUntil}T00:00:00`).toLocaleDateString()}`,
    '',
    'SCOPE',
    proposalItemsText(proposal.items),
    '',
    'TOTALS',
    `  Subtotal      ${formatMoney(t.subtotal)}`,
    `  VAT (7.5%)    ${formatMoney(t.vat)}`,
    `  TOTAL         ${formatMoney(t.total)}`,
    '',
    proposal.note ? `NOTES\n${proposal.note}\n` : '',
    'Thank you for considering us.',
  ].filter((line) => typeof line === 'string' && line !== '');
  return rows.join('\n');
}

// Short WhatsApp message: total, validity, and a call to accept.
export function proposalBroadcastText(
  proposal: Proposal,
  business: Pick<Business, 'name' | 'location'>,
): string {
  const t = proposalTotals(proposal.items);
  const due = new Date(`${proposal.validUntil}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  return [
    `Hello ${proposal.clientName || 'there'}, here is your quote from ${business.name}${business.location ? ` (${business.location})` : ''}.`,
    '',
    proposalItemsText(proposal.items),
    '',
    `Total: ${formatMoney(t.total)} (incl. VAT)`,
    `Valid until: ${due}`,
    proposal.note,
    '',
    'Reply YES to accept, or tell us what to adjust.',
  ].filter(Boolean).join('\n');
}

export function createProposal(
  index: number,
  client: { name?: string; phone?: string; email?: string; validUntil?: string } = {},
): Proposal {
  return {
    id: uid(),
    number: proposalNumber(index),
    clientName: client.name || '',
    clientPhone: client.phone || '',
    clientEmail: client.email || '',
    validUntil: client.validUntil || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    currency: '₦',
    items: [],
    note: '',
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
}

// ---- Persistence ------------------------------------------------------------

export function proposalsKey(businessId: string): string {
  return `nowopen_proposals_${businessId}`;
}

export function loadProposals(businessId: string): Proposal[] {
  try {
    const raw = localStorage.getItem(proposalsKey(businessId));
    const parsed = raw ? (JSON.parse(raw) as Proposal[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProposals(businessId: string, list: Proposal[]): void {
  try { localStorage.setItem(proposalsKey(businessId), JSON.stringify(list)); } catch { /* ignore */ }
}
